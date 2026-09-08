"""CategoryConfig field validation — CLAUDE.md Section 5 schema."""

import pytest

from locus.scoring.models import CategoryConfig


def test_nearest_requires_lambda_m():
    with pytest.raises(ValueError, match="lambda_m"):
        CategoryConfig(name="groceries", kind="nearest", weight=0.1, sign=1, cap=2)


def test_nearest_requires_cap():
    with pytest.raises(ValueError, match="cap"):
        CategoryConfig(name="groceries", kind="nearest", weight=0.1, sign=1, lambda_m=500)


def test_density_requires_radius_m():
    with pytest.raises(ValueError, match="radius_m"):
        CategoryConfig(
            name="residential_density", kind="density", weight=0.1, sign=1, d_ref=1000
        )


def test_density_requires_d_ref():
    with pytest.raises(ValueError, match="d_ref"):
        CategoryConfig(
            name="residential_density", kind="density", weight=0.1, sign=1, radius_m=500
        )


def test_unknown_kind_rejected():
    with pytest.raises(ValueError, match="unknown kind"):
        CategoryConfig(name="x", kind="bogus", weight=0.1, sign=1)  # type: ignore[arg-type]


def test_negative_weight_rejected():
    with pytest.raises(ValueError, match="weight"):
        CategoryConfig(
            name="groceries", kind="nearest", weight=-0.1, sign=1, lambda_m=500, cap=1
        )


def test_invalid_sign_rejected():
    with pytest.raises(ValueError, match="sign"):
        CategoryConfig(
            name="groceries", kind="nearest", weight=0.1, sign=2, lambda_m=500, cap=1  # type: ignore[arg-type]
        )


def test_valid_nearest_category_constructs():
    cfg = CategoryConfig(
        name="groceries", kind="nearest", weight=0.15, sign=1, lambda_m=600, cap=2
    )
    assert cfg.name == "groceries"
    assert cfg.cap == 2


def test_valid_density_category_constructs():
    cfg = CategoryConfig(
        name="residential_density", kind="density", weight=0.25, sign=1, radius_m=500, d_ref=45000
    )
    assert cfg.radius_m == 500
