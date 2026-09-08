"""Scoring engine, profile loader, and calibration tooling. Owned by scoring-modeler.

Implements CLAUDE.md Section 6 exactly. This package needs no live
PostGIS/OSRM: it consumes plain distances (metres) and density values,
so it is fully unit-testable on synthetic fixtures per the Phase 0/10
definition of done ("Engine passes unit tests on synthetic fixtures: known
distances -> known scores").
"""

from locus.scoring.engine import (
    ScoreResult,
    compute_score,
    evaluate_gates,
    score_category,
    score_cell,
)
from locus.scoring.models import (
    CategoryConfig,
    CategoryObservation,
    DensityObservation,
    Gate,
    NearestObservation,
    Profile,
)
from locus.scoring.profile_loader import ProfileValidationError, load_profile

__all__ = [
    "CategoryConfig",
    "CategoryObservation",
    "DensityObservation",
    "Gate",
    "NearestObservation",
    "Profile",
    "ProfileValidationError",
    "ScoreResult",
    "compute_score",
    "evaluate_gates",
    "load_profile",
    "score_category",
    "score_cell",
]
