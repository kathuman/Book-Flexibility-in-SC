"""score_density_category — CLAUDE.md Section 6: A_k = min(1, D/D_ref)."""

import pytest

from locus.scoring.engine import score_density_category
from locus.scoring.models import CategoryConfig, DensityObservation, NearestObservation


def _cfg(**overrides):
    defaults = dict(
        name="residential_density",
        kind="density",
        weight=0.25,
        sign=1,
        radius_m=500,
        d_ref=1000.0,
    )
    defaults.update(overrides)
    return CategoryConfig(**defaults)


def test_zero_density_scores_zero():
    cfg = _cfg()
    assert score_density_category(cfg, DensityObservation(density_value=0.0)) == 0.0


def test_density_at_d_ref_scores_one():
    cfg = _cfg(d_ref=1000.0)
    assert score_density_category(cfg, DensityObservation(density_value=1000.0)) == pytest.approx(
        1.0
    )


def test_density_above_d_ref_is_capped_at_one():
    cfg = _cfg(d_ref=1000.0)
    assert score_density_category(cfg, DensityObservation(density_value=5000.0)) == pytest.approx(
        1.0
    )


def test_density_at_half_d_ref_scores_half():
    cfg = _cfg(d_ref=1000.0)
    assert score_density_category(cfg, DensityObservation(density_value=500.0)) == pytest.approx(
        0.5
    )


def test_score_density_category_rejects_nearest_config():
    cfg = CategoryConfig(
        name="groceries", kind="nearest", weight=0.1, sign=1, lambda_m=500, cap=1
    )
    with pytest.raises(ValueError, match="kind='density'"):
        score_density_category(cfg, DensityObservation(density_value=1.0))


def test_score_category_dispatches_by_kind():
    from locus.scoring.engine import score_category

    nearest_cfg = CategoryConfig(
        name="groceries", kind="nearest", weight=0.1, sign=1, lambda_m=500, cap=1
    )
    density_cfg = _cfg()
    assert score_category(nearest_cfg, NearestObservation(distances_m=(0.0,))) == pytest.approx(
        1.0
    )
    assert score_category(density_cfg, DensityObservation(density_value=1000.0)) == pytest.approx(
        1.0
    )


def test_score_category_rejects_mismatched_observation_type():
    from locus.scoring.engine import score_category

    density_cfg = _cfg()
    with pytest.raises(TypeError):
        score_category(density_cfg, NearestObservation(distances_m=(0.0,)))
