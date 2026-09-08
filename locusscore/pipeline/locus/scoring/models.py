"""Data model for the scoring engine — CLAUDE.md Section 5 (profile schema)
and Section 6 (scoring engine).

Kept independent of PyYAML/pydantic-style parsing details; profile_loader.py
does the YAML -> Profile translation and validation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Sign = Literal[1, -1]
Kind = Literal["nearest", "density"]


@dataclass(frozen=True)
class Gate:
    """A hard constraint (CLAUDE.md Section 5 `gates:`). Fail any -> S=null."""

    category: str
    max_distance_m: float


@dataclass(frozen=True)
class CategoryConfig:
    """One entry under a profile's `categories:` map.

    `nearest` categories require lambda_m and cap; `density` categories
    require radius_m and d_ref. min_freq_per_hour is optional and only
    meaningful for nearest categories fed by locations with a frequency
    (e.g. transit_stop) — see CLAUDE.md Section 6.
    """

    name: str
    kind: Kind
    weight: float
    sign: Sign
    # nearest-only
    lambda_m: float | None = None
    cap: int | None = None
    min_freq_per_hour: float | None = None
    # density-only
    radius_m: float | None = None
    d_ref: float | None = None

    def __post_init__(self) -> None:
        if self.kind == "nearest":
            if self.lambda_m is None or self.lambda_m <= 0:
                raise ValueError(f"{self.name}: nearest category needs lambda_m > 0")
            if self.cap is None or self.cap < 1:
                raise ValueError(f"{self.name}: nearest category needs cap >= 1")
        elif self.kind == "density":
            if self.radius_m is None or self.radius_m <= 0:
                raise ValueError(f"{self.name}: density category needs radius_m > 0")
            if self.d_ref is None or self.d_ref <= 0:
                raise ValueError(f"{self.name}: density category needs d_ref > 0")
        else:
            raise ValueError(f"{self.name}: unknown kind {self.kind!r}")
        if self.weight < 0:
            raise ValueError(f"{self.name}: weight must be >= 0 (sign carries direction)")
        if self.sign not in (1, -1):
            raise ValueError(f"{self.name}: sign must be 1 or -1")


@dataclass(frozen=True)
class Profile:
    """A loaded, validated `config/profiles/<name>.yaml`."""

    profile: str
    label: str
    modes: tuple[str, ...]
    gates: tuple[Gate, ...]
    categories: dict[str, CategoryConfig]
    building_filter: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class NearestObservation:
    """Raw input for a `nearest` category at one cell.

    distances_m: network distances to the cap_k nearest POIs, already
    mode-selected (min over profile.modes with bike-to-foot scaling
    applied upstream by locus.routing), sorted ascending. May have fewer
    than `cap` entries if fewer POIs exist within range.
    frequencies_per_hour: parallel to distances_m, only used when the
    category config sets min_freq_per_hour (e.g. transit_stop). None means
    "no frequency data" (CLAUDE.md Section 12 item 5 — GTFS not wired up
    yet); frequency scaling is then skipped rather than treated as 0.
    """

    distances_m: tuple[float, ...]
    frequencies_per_hour: tuple[float, ...] | None = None


@dataclass(frozen=True)
class DensityObservation:
    """Raw input for a `density` category at one cell: D(cell, radius)."""

    density_value: float


CategoryObservation = NearestObservation | DensityObservation
