"""calibration — CLAUDE.md Section 6 calibration protocol, steps 1/2/5."""

import pytest

from locus.scoring.calibration import (
    histogram_summary,
    spearman_correlation,
    write_calibration_report,
)

# --- histogram_summary ------------------------------------------------


def test_histogram_summary_basic_stats():
    summary = histogram_summary([10.0, 20.0, 70.0])
    assert summary["n"] == 3
    assert summary["n_gated"] == 0
    assert summary["min"] == 10.0
    assert summary["max"] == 70.0
    assert summary["range"] == pytest.approx(60.0)
    assert summary["mean"] == pytest.approx(100 / 3)


def test_histogram_summary_meets_spread_target_at_exactly_60():
    summary = histogram_summary([0.0, 60.0])
    assert summary["meets_spread_target"] is True


def test_histogram_summary_fails_spread_target_when_compressed():
    summary = histogram_summary([40.0, 50.0, 55.0])  # range 15
    assert summary["meets_spread_target"] is False


def test_histogram_summary_counts_gated_cells_separately():
    summary = histogram_summary([10.0, None, 20.0, None])
    assert summary["n"] == 2
    assert summary["n_gated"] == 2


def test_histogram_summary_raises_on_all_gated():
    with pytest.raises(ValueError):
        histogram_summary([None, None])


# --- spearman_correlation ----------------------------------------------


def test_spearman_identical_rankings_is_one():
    a = [1.0, 2.0, 3.0, 4.0, 5.0]
    b = [10.0, 20.0, 30.0, 40.0, 50.0]
    assert spearman_correlation(a, b) == pytest.approx(1.0)


def test_spearman_reversed_rankings_is_minus_one():
    a = [1.0, 2.0, 3.0, 4.0, 5.0]
    b = [5.0, 4.0, 3.0, 2.0, 1.0]
    assert spearman_correlation(a, b) == pytest.approx(-1.0)


def test_spearman_ties_use_average_rank():
    a = [1.0, 1.0, 3.0, 4.0]
    b = [1.0, 2.0, 2.0, 4.0]
    # Should not raise, and should be strongly (but not perfectly) positive.
    rho = spearman_correlation(a, b)
    assert 0.5 < rho < 1.0


def test_spearman_unrelated_profiles_below_differentiation_threshold():
    # family-like (favours schools) vs. a profile with an unrelated ranking.
    family_scores = [90.0, 85.0, 40.0, 30.0, 20.0]
    student_scores = [20.0, 90.0, 30.0, 85.0, 40.0]
    rho = spearman_correlation(family_scores, student_scores)
    assert rho < 0.8


def test_spearman_constant_series_is_degenerate_zero():
    assert spearman_correlation([5.0, 5.0, 5.0], [1.0, 2.0, 3.0]) == 0.0


def test_spearman_mismatched_lengths_raises():
    with pytest.raises(ValueError):
        spearman_correlation([1.0, 2.0], [1.0])


# --- write_calibration_report --------------------------------------------


def test_write_calibration_report_creates_file_with_expected_sections(tmp_path):
    summary = histogram_summary([10.0, 90.0, 50.0])
    out_path = write_calibration_report(
        out_dir=tmp_path,
        profile_name="family",
        params={"primary_school": {"weight": 0.2, "lambda_m": 800}},
        summary=summary,
        spearman_vs={"student": 0.42},
        anchor_checks=[
            {"name": "Frederiksberg", "expected": "good", "actual": "good", "match": True}
        ],
        decision="Weights accepted as-is; matches expectations.",
    )
    assert out_path.exists()
    text = out_path.read_text()
    assert "family" in text
    assert "Parameters" in text
    assert "student" in text
    assert "Frederiksberg" in text
    assert "Weights accepted as-is" in text


def test_write_calibration_report_notes_missing_anchors():
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        summary = histogram_summary([10.0, 90.0])
        out_path = write_calibration_report(
            out_dir=tmp, profile_name="business_retail", params={}, summary=summary
        )
        text = out_path.read_text()
        assert "calibration_anchors is still empty" in text
