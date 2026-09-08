"""evaluate_gates, compute_score, and end-to-end score_cell — CLAUDE.md Section 6.

Uses a small synthetic 2-category profile rather than family.yaml so the
expected numbers are easy to hand-verify.
"""

import math

import pytest

from locus.scoring.engine import ScoreResult, compute_score, evaluate_gates, score_cell
from locus.scoring.models import CategoryConfig, Gate, NearestObservation, Profile

LAMBDA = 500.0


def _synthetic_profile(gate_max_distance_m: float = 1000.0) -> Profile:
    return Profile(
        profile="synthetic",
        label="Synthetic test profile",
        modes=("foot",),
        gates=(Gate(category="a", max_distance_m=gate_max_distance_m),),
        categories={
            "a": CategoryConfig(
                name="a", kind="nearest", weight=0.6, sign=1, lambda_m=LAMBDA, cap=1
            ),
            "b": CategoryConfig(
                name="b", kind="nearest", weight=0.4, sign=1, lambda_m=LAMBDA, cap=1
            ),
        },
    )


# --- evaluate_gates -----------------------------------------------------


def test_gate_passes_within_max_distance():
    profile = _synthetic_profile(gate_max_distance_m=1000.0)
    assert evaluate_gates(profile, {"a": 500.0}) is None


def test_gate_fails_beyond_max_distance():
    profile = _synthetic_profile(gate_max_distance_m=1000.0)
    assert evaluate_gates(profile, {"a": 1500.0}) == "a"


def test_gate_fails_when_no_poi_found():
    profile = _synthetic_profile()
    assert evaluate_gates(profile, {"a": None}) == "a"


def test_gate_fails_when_distance_missing_entirely():
    profile = _synthetic_profile()
    assert evaluate_gates(profile, {}) == "a"


def test_gate_at_exactly_max_distance_passes():
    profile = _synthetic_profile(gate_max_distance_m=1000.0)
    assert evaluate_gates(profile, {"a": 1000.0}) is None


# --- compute_score --------------------------------------------------------


def test_compute_score_weighted_sum():
    profile = _synthetic_profile()
    # 0.6*1.0 + 0.4*0.5 = 0.8 -> 80
    assert compute_score(profile, {"a": 1.0, "b": 0.5}) == pytest.approx(80.0)


def test_compute_score_clamps_to_100():
    profile = _synthetic_profile()
    assert compute_score(profile, {"a": 1.0, "b": 1.0}) == pytest.approx(100.0)


def test_compute_score_negative_sign_subtracts():
    profile = Profile(
        profile="synthetic-neg",
        label="",
        modes=("foot",),
        gates=(),
        categories={
            "a": CategoryConfig(
                name="a", kind="nearest", weight=0.8, sign=1, lambda_m=LAMBDA, cap=1
            ),
            "penalty": CategoryConfig(
                name="penalty", kind="nearest", weight=0.3, sign=-1, lambda_m=LAMBDA, cap=1
            ),
        },
    )
    # 0.8*1.0 - 0.3*1.0 = 0.5 -> 50
    assert compute_score(profile, {"a": 1.0, "penalty": 1.0}) == pytest.approx(50.0)


def test_compute_score_clamps_negative_total_to_zero():
    profile = Profile(
        profile="synthetic-neg2",
        label="",
        modes=("foot",),
        gates=(),
        categories={
            "penalty": CategoryConfig(
                name="penalty", kind="nearest", weight=0.9, sign=-1, lambda_m=LAMBDA, cap=1
            ),
        },
    )
    assert compute_score(profile, {"penalty": 1.0}) == pytest.approx(0.0)


# --- score_cell (end-to-end) -----------------------------------------------


def test_score_cell_gate_failure_returns_no_score():
    profile = _synthetic_profile(gate_max_distance_m=100.0)
    result = score_cell(
        profile,
        gate_distances={"a": 5000.0},
        observations={
            "a": NearestObservation(distances_m=(0.0,)),
            "b": NearestObservation(distances_m=(0.0,)),
        },
    )
    assert result == ScoreResult(score=None, gate_failed="a", category_scores={})


def test_score_cell_success_matches_hand_calculation():
    profile = _synthetic_profile(gate_max_distance_m=1000.0)
    d_b = LAMBDA * math.log(2)  # a_b = 0.5
    result = score_cell(
        profile,
        gate_distances={"a": 0.0},
        observations={
            "a": NearestObservation(distances_m=(0.0,)),  # a_a = 1.0
            "b": NearestObservation(distances_m=(d_b,)),
        },
    )
    assert result.gate_failed is None
    assert result.category_scores["a"] == pytest.approx(1.0)
    assert result.category_scores["b"] == pytest.approx(0.5, rel=1e-6)
    assert result.score == pytest.approx(80.0, rel=1e-6)  # 0.6*1.0 + 0.4*0.5 -> 80


def test_score_cell_missing_observation_raises():
    profile = _synthetic_profile(gate_max_distance_m=1000.0)
    with pytest.raises(KeyError):
        score_cell(
            profile,
            gate_distances={"a": 0.0},
            observations={"a": NearestObservation(distances_m=(0.0,))},  # missing "b"
        )
