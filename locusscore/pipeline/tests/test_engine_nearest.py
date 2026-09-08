"""score_nearest_category — CLAUDE.md Section 6, known distances -> known scores."""

import math

import pytest

from locus.scoring.engine import score_nearest_category
from locus.scoring.models import CategoryConfig, NearestObservation


def _cfg(**overrides):
    defaults = dict(name="groceries", kind="nearest", weight=0.15, sign=1, lambda_m=600, cap=1)
    defaults.update(overrides)
    return CategoryConfig(**defaults)


def test_poi_at_zero_distance_scores_one():
    cfg = _cfg(cap=1)
    obs = NearestObservation(distances_m=(0.0,))
    assert score_nearest_category(cfg, obs) == pytest.approx(1.0)


def test_poi_at_lambda_ln2_scores_half():
    lam = 600.0
    d = lam * math.log(2)
    cfg = _cfg(lambda_m=lam, cap=1)
    obs = NearestObservation(distances_m=(d,))
    assert score_nearest_category(cfg, obs) == pytest.approx(0.5, rel=1e-6)


def test_no_pois_scores_zero():
    cfg = _cfg(cap=3)
    obs = NearestObservation(distances_m=())
    assert score_nearest_category(cfg, obs) == 0.0


def test_saturated_cap_at_zero_distance_scores_one():
    # every one of `cap` POIs at distance 0 -> a_i = 1 for all i ->
    # numerator == denominator regardless of cap.
    cfg = _cfg(cap=3)
    obs = NearestObservation(distances_m=(0.0, 0.0, 0.0))
    assert score_nearest_category(cfg, obs) == pytest.approx(1.0)


def test_fewer_pois_than_cap_penalised_by_full_cap_denominator():
    # Section 6: "normalised by Sum r^(i-1) over cap" -- denominator uses
    # the full cap regardless of how many POIs were actually found.
    cfg = _cfg(cap=3)
    obs = NearestObservation(distances_m=(0.0,))  # only 1 of 3 slots filled
    r = 0.5
    expected = 1.0 / (1 + r + r**2)
    assert score_nearest_category(cfg, obs) == pytest.approx(expected)


def test_redundancy_discount_applied_to_second_poi():
    cfg = _cfg(cap=2)
    lam = 600.0
    d1, d2 = 0.0, lam * math.log(2)  # a1=1.0, a2=0.5
    obs = NearestObservation(distances_m=(d1, d2))
    r = 0.5
    expected = (1.0 * 1 + 0.5 * r) / (1 + r)
    assert score_nearest_category(cfg, obs) == pytest.approx(expected, rel=1e-6)


def test_only_first_cap_distances_are_used():
    # a third POI beyond cap=2 must not affect the score at all.
    cfg = _cfg(cap=2)
    obs_two = NearestObservation(distances_m=(0.0, 0.0))
    obs_three = NearestObservation(distances_m=(0.0, 0.0, 0.0))
    assert score_nearest_category(cfg, obs_two) == pytest.approx(
        score_nearest_category(cfg, obs_three)
    )


def test_transit_frequency_scales_accessibility():
    cfg = _cfg(cap=1, min_freq_per_hour=4)
    obs = NearestObservation(distances_m=(0.0,), frequencies_per_hour=(2.0,))
    # a = exp(0) * min(1, 2/4) = 0.5
    assert score_nearest_category(cfg, obs) == pytest.approx(0.5)


def test_transit_frequency_above_threshold_is_not_boosted():
    cfg = _cfg(cap=1, min_freq_per_hour=4)
    obs = NearestObservation(distances_m=(0.0,), frequencies_per_hour=(20.0,))
    assert score_nearest_category(cfg, obs) == pytest.approx(1.0)


def test_missing_frequency_data_skips_scaling():
    # CLAUDE.md Section 12 item 5: GTFS not wired up yet -> degrade
    # gracefully, do not treat "no frequency" as "zero frequency".
    cfg = _cfg(cap=1, min_freq_per_hour=4)
    obs = NearestObservation(distances_m=(0.0,), frequencies_per_hour=None)
    assert score_nearest_category(cfg, obs) == pytest.approx(1.0)


def test_score_nearest_category_rejects_density_config():
    cfg = CategoryConfig(
        name="residential_density", kind="density", weight=0.1, sign=1, radius_m=500, d_ref=1000
    )
    with pytest.raises(ValueError, match="kind='nearest'"):
        score_nearest_category(cfg, NearestObservation(distances_m=(0.0,)))
