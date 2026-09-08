"""Scoring engine — implements CLAUDE.md Section 6 exactly.

Nearest-type categories:
    a_i = exp(-d_i / lambda_k)                              per POI
    A_k = sum(a_i * r**i) / sum(r**i)  for i in 0..cap-1     r = 0.5
    (denominator always sums over the full `cap`, even if fewer POIs were
    observed than `cap` — a sparse category is penalised relative to a
    saturated one, by design.)
    transit-style frequency scaling: a_i *= min(1, freq_i / min_freq_per_hour)

Density-type categories:
    A_k = min(1, D(cell, radius) / D_ref)

Composite:
    S(c, p) = 100 * clamp(sum(w_k * sign_k * A_k), 0, 1)

Gates are evaluated first; failing any gate means S = None with
gate_failed set to that gate's category, and no composite is computed.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

from locus.scoring.models import (
    CategoryConfig,
    CategoryObservation,
    DensityObservation,
    NearestObservation,
    Profile,
)

REDUNDANCY_R = 0.5


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def score_nearest_category(config: CategoryConfig, obs: NearestObservation) -> float:
    """A_k for a `nearest` category. Returns 0.0 if no POIs were observed."""
    if config.kind != "nearest":
        raise ValueError(f"{config.name}: score_nearest_category requires kind='nearest'")
    if not obs.distances_m:
        return 0.0

    cap = config.cap or 1
    taken = obs.distances_m[:cap]
    freqs = obs.frequencies_per_hour[:cap] if obs.frequencies_per_hour is not None else None

    accessibilities: list[float] = []
    for i, d in enumerate(taken):
        a = math.exp(-d / config.lambda_m)
        if config.min_freq_per_hour is not None and freqs is not None:
            a *= min(1.0, freqs[i] / config.min_freq_per_hour)
        accessibilities.append(a)

    weights = [REDUNDANCY_R**i for i in range(cap)]
    numerator = sum(a * w for a, w in zip(accessibilities, weights, strict=False))
    denominator = sum(weights)
    return _clamp(numerator / denominator, 0.0, 1.0)


def score_density_category(config: CategoryConfig, obs: DensityObservation) -> float:
    """A_k for a `density` category."""
    if config.kind != "density":
        raise ValueError(f"{config.name}: score_density_category requires kind='density'")
    return _clamp(obs.density_value / config.d_ref, 0.0, 1.0)


def score_category(config: CategoryConfig, obs: CategoryObservation) -> float:
    """Dispatch to the right scorer based on the category's declared kind."""
    if config.kind == "nearest":
        if not isinstance(obs, NearestObservation):
            raise TypeError(f"{config.name}: expected NearestObservation, got {type(obs)!r}")
        return score_nearest_category(config, obs)
    if config.kind == "density":
        if not isinstance(obs, DensityObservation):
            raise TypeError(f"{config.name}: expected DensityObservation, got {type(obs)!r}")
        return score_density_category(config, obs)
    raise ValueError(f"{config.name}: unknown kind {config.kind!r}")


def evaluate_gates(profile: Profile, gate_distances: Mapping[str, float | None]) -> str | None:
    """Check profile.gates in order; return the first failing category, or None.

    gate_distances maps a gate's category name to the network distance
    (metres) to the nearest matching POI, or None if none exists at all.
    """
    for gate in profile.gates:
        d = gate_distances.get(gate.category)
        if d is None or d > gate.max_distance_m:
            return gate.category
    return None


def compute_score(profile: Profile, category_scores: Mapping[str, float]) -> float:
    """Composite S(c, p) from already-computed per-category A_k values (0-100)."""
    total = 0.0
    for name, config in profile.categories.items():
        a_k = category_scores.get(name, 0.0)
        total += config.weight * config.sign * a_k
    return 100.0 * _clamp(total, 0.0, 1.0)


@dataclass(frozen=True)
class ScoreResult:
    """Full scoring outcome for one (cell, profile)."""

    score: float | None  # None means gate_failed is set
    gate_failed: str | None
    category_scores: dict[str, float]  # A_k per category, always populated unless gated


def score_cell(
    profile: Profile,
    gate_distances: Mapping[str, float | None],
    observations: Mapping[str, CategoryObservation],
) -> ScoreResult:
    """End-to-end: evaluate gates, then score every category and the composite.

    observations must have an entry for every category in profile.categories
    (missing entries are ignored by score_category, this includes a KeyError
    on purpose — a missing observation for a scored category is a pipeline
    bug, not something to silently default to 0).
    """
    gate_failed = evaluate_gates(profile, gate_distances)
    if gate_failed is not None:
        return ScoreResult(score=None, gate_failed=gate_failed, category_scores={})

    category_scores = {
        name: score_category(config, observations[name])
        for name, config in profile.categories.items()
    }
    score = compute_score(profile, category_scores)
    return ScoreResult(score=score, gate_failed=None, category_scores=category_scores)
