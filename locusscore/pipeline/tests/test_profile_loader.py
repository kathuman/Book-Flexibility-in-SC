"""profile_loader — YAML -> Profile, plus a real-file sanity check that every
MVP profile YAML in config/profiles actually parses and validates (this
cross-checks the hand-authored config, not just the loader code)."""

from pathlib import Path

import pytest

from locus.scoring.profile_loader import ProfileValidationError, load_profile, load_profile_dict

CONFIG_PROFILES_DIR = Path(__file__).resolve().parents[2] / "config" / "profiles"


def _minimal_profile_dict(**overrides):
    base = {
        "profile": "test",
        "label": "Test profile",
        "modes": ["foot"],
        "gates": [],
        "categories": {
            "groceries": {"kind": "nearest", "weight": 0.5, "sign": 1, "lambda_m": 500, "cap": 2},
        },
    }
    base.update(overrides)
    return base


def test_loads_minimal_valid_profile():
    profile = load_profile_dict(_minimal_profile_dict())
    assert profile.profile == "test"
    assert "groceries" in profile.categories
    assert profile.categories["groceries"].cap == 2


def test_missing_required_key_raises():
    data = _minimal_profile_dict()
    del data["label"]
    with pytest.raises(ProfileValidationError, match="missing required key"):
        load_profile_dict(data)


def test_invalid_category_raises_with_context():
    data = _minimal_profile_dict(
        categories={"groceries": {"kind": "nearest", "weight": 0.5, "sign": 1, "cap": 2}}
    )
    with pytest.raises(ProfileValidationError, match="groceries"):
        load_profile_dict(data)


def test_gate_with_zero_max_distance_rejected():
    data = _minimal_profile_dict(gates=[{"category": "groceries", "max_distance_m": 0}])
    with pytest.raises(ProfileValidationError, match="max_distance_m"):
        load_profile_dict(data)


def test_weight_imbalance_warns_not_raises():
    data = _minimal_profile_dict(
        categories={
            "groceries": {
                "kind": "nearest",
                "weight": 0.05,  # far from 1.0 -> should warn
                "sign": 1,
                "lambda_m": 500,
                "cap": 2,
            }
        }
    )
    with pytest.warns(UserWarning, match="positive-sign weights"):
        profile = load_profile_dict(data)
    assert profile.profile == "test"  # still loads despite the warning


def test_building_filter_defaults_to_empty_tuple():
    profile = load_profile_dict(_minimal_profile_dict())
    assert profile.building_filter == ()


@pytest.mark.parametrize("name", ["family", "student", "business_retail"])
def test_mvp_profile_yaml_files_load_and_validate(name):
    path = CONFIG_PROFILES_DIR / f"{name}.yaml"
    assert path.exists(), f"expected {path} to exist"
    profile = load_profile(path)
    assert profile.profile == name
    assert profile.categories, "profile must define at least one category"
    assert len(profile.modes) >= 1
