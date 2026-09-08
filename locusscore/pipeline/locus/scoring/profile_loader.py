"""YAML -> Profile loading and validation — CLAUDE.md Section 5 schema.

Adding a profile must not require touching the scoring engine (CLAUDE.md
Section 2 goal): this module is the only place that understands the YAML
shape; locus.scoring.engine only ever sees validated Profile/CategoryConfig
objects.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Any

import yaml

from locus.scoring.models import CategoryConfig, Gate, Profile

_REQUIRED_TOP_LEVEL = ("profile", "label", "modes", "categories")
_WEIGHT_SUM_TOLERANCE = 0.25  # soft check only; see note below


class ProfileValidationError(ValueError):
    """Raised when a profile YAML is structurally invalid or unscoreable."""


def load_profile(path: str | Path) -> Profile:
    path = Path(path)
    try:
        raw = yaml.safe_load(path.read_text())
    except yaml.YAMLError as exc:
        raise ProfileValidationError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ProfileValidationError(f"{path}: top level must be a mapping")
    return load_profile_dict(raw, source=str(path))


def load_profile_dict(raw: dict[str, Any], source: str = "<dict>") -> Profile:
    missing = [k for k in _REQUIRED_TOP_LEVEL if k not in raw]
    if missing:
        raise ProfileValidationError(f"{source}: missing required key(s): {missing}")

    categories: dict[str, CategoryConfig] = {}
    for name, cfg in raw["categories"].items():
        if not isinstance(cfg, dict):
            raise ProfileValidationError(f"{source}: category {name!r} must be a mapping")
        try:
            categories[name] = CategoryConfig(name=name, **cfg)
        except (TypeError, ValueError) as exc:
            raise ProfileValidationError(f"{source}: category {name!r}: {exc}") from exc

    gates = tuple(
        Gate(category=g["category"], max_distance_m=g["max_distance_m"])
        for g in raw.get("gates", [])
    )
    for gate in gates:
        if gate.max_distance_m <= 0:
            raise ProfileValidationError(
                f"{source}: gate on {gate.category!r} needs max_distance_m > 0"
            )

    profile = Profile(
        profile=raw["profile"],
        label=raw["label"],
        modes=tuple(raw["modes"]),
        gates=gates,
        categories=categories,
        building_filter=tuple(raw.get("building_filter", [])),
    )

    _warn_on_weight_imbalance(profile)
    return profile


def _warn_on_weight_imbalance(profile: Profile) -> None:
    """CLAUDE.md Section 6: "Sigma|w_k| = 1 over positive weights; negatives
    subtract." This is a modeling convention, not a hard invariant checked
    by the composite formula itself -- the spec's own `family` example sums
    its positive weights to 0.85, not 1.0. So this is a soft warning to
    catch obvious mistakes (e.g. a typo'd weight an order of magnitude off),
    not a validation error.
    """
    positive_sum = sum(c.weight for c in profile.categories.values() if c.sign == 1)
    if abs(positive_sum - 1.0) > _WEIGHT_SUM_TOLERANCE:
        warnings.warn(
            f"profile {profile.profile!r}: positive-sign weights sum to "
            f"{positive_sum:.3f}, expected roughly 1.0 (CLAUDE.md Section 6). "
            "Not an error -- confirm this is intentional.",
            stacklevel=2,
        )
