"""Calibration tooling — CLAUDE.md Section 6 "Calibration protocol (mandatory
before a profile is considered done)".

Steps 1 and 2 of the protocol (histogram spread, Spearman rank correlation
between profiles) are pure statistics on a list of scores and are
implemented here without any live-data dependency, so they're unit-testable
now. Steps 3-4 (spot-check against local knowledge, visual map inspection)
are inherently manual; step 5 (write the report) is `write_calibration_report`
below, which just formats whatever the caller already computed.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Mapping, Sequence
from datetime import date
from pathlib import Path
from typing import Any

SPREAD_TARGET = 60.0  # points; Section 6 step 1
SPEARMAN_DIFFERENTIATION_THRESHOLD = 0.8  # Section 6 step 2


def histogram_summary(scores: Sequence[float | None]) -> dict[str, Any]:
    """Summarize a batch of composite scores (0-100 or None for gate-failed).

    None entries (gated cells) are excluded from the distribution stats but
    counted, since a gate failure is not "no score", it's "unsuitable" --
    conflating the two would hide gate behaviour from the spread check.
    """
    valid = [s for s in scores if s is not None]
    if not valid:
        raise ValueError("no non-gated scores to summarize")
    lo, hi = min(valid), max(valid)
    return {
        "n": len(valid),
        "n_gated": len(scores) - len(valid),
        "min": lo,
        "max": hi,
        "range": hi - lo,
        "mean": statistics.fmean(valid),
        "stdev": statistics.pstdev(valid) if len(valid) > 1 else 0.0,
        "meets_spread_target": (hi - lo) >= SPREAD_TARGET,
    }


def _average_ranks(values: Sequence[float]) -> list[float]:
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg_rank = (i + j) / 2 + 1  # 1-based, averaged over the tied block
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    return ranks


def spearman_correlation(a: Sequence[float], b: Sequence[float]) -> float:
    """Spearman rank correlation, implemented on plain lists (no scipy dep).

    Ties get the average rank of their block, matching scipy's default
    ('average' method). A constant series (zero variance) has no defined
    correlation; returns 0.0 in that degenerate case rather than raising,
    since the calibration check just needs "< 0.8" to not spuriously pass.
    """
    if len(a) != len(b):
        raise ValueError("a and b must be the same length")
    if len(a) < 2:
        raise ValueError("need at least 2 observations to correlate")

    ra, rb = _average_ranks(a), _average_ranks(b)
    n = len(ra)
    mean_a, mean_b = sum(ra) / n, sum(rb) / n
    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(ra, rb, strict=True))
    var_a = sum((x - mean_a) ** 2 for x in ra)
    var_b = sum((y - mean_b) ** 2 for y in rb)
    if var_a == 0 or var_b == 0:
        return 0.0
    return cov / math.sqrt(var_a * var_b)


def write_calibration_report(
    out_dir: str | Path,
    profile_name: str,
    params: Mapping[str, Any],
    summary: Mapping[str, Any],
    spearman_vs: Mapping[str, float] | None = None,
    anchor_checks: Sequence[Mapping[str, Any]] | None = None,
    decision: str = "",
    run_date: date | None = None,
) -> Path:
    """Write `docs/calibration/<profile>-<date>.md` per Section 6 step 5."""
    run_date = run_date or date.today()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{profile_name}-{run_date.isoformat()}.md"

    lines = [
        f"# Calibration run: {profile_name} ({run_date.isoformat()})",
        "",
        "## Parameters",
        "",
        "```yaml",
        _format_params(params),
        "```",
        "",
        "## Distribution (Section 6 step 1)",
        "",
        f"- n scored: {summary['n']} (gated/unsuitable: {summary['n_gated']})",
        f"- min: {summary['min']:.1f}, max: {summary['max']:.1f}, "
        f"range: {summary['range']:.1f}",
        f"- mean: {summary['mean']:.1f}, stdev: {summary['stdev']:.1f}",
        f"- meets >=60pt spread target: "
        f"{'YES' if summary['meets_spread_target'] else 'NO'}",
        "",
    ]

    lines += ["## Rank correlation vs. other profiles (Section 6 step 2)", ""]
    if spearman_vs:
        for other, rho in spearman_vs.items():
            flag = "OK" if rho < SPEARMAN_DIFFERENTIATION_THRESHOLD else "TOO SIMILAR"
            lines.append(f"- vs. `{other}`: Spearman rho = {rho:.3f} ({flag})")
    else:
        lines.append("- (no other profiles scored yet to compare against)")
    lines.append("")

    lines += ["## Anchor spot-checks (Section 6 step 3)", ""]
    if anchor_checks:
        for check in anchor_checks:
            lines.append(
                f"- {check.get('name', '?')}: expected {check.get('expected', '?')}, "
                f"got {check.get('actual', '?')} "
                f"({'match' if check.get('match') else 'MISMATCH'})"
            )
    else:
        lines.append(
            "- none run -- config/region.yaml calibration_anchors is still empty "
            "(CLAUDE.md Section 12 item 2, not defaultable)"
        )
    lines.append("")

    lines += ["## Map inspection (Section 6 step 4)", "", "(manual, not automated)", ""]
    lines += ["## Decision", "", decision or "(not recorded)", ""]

    out_path.write_text("\n".join(lines))
    return out_path


def _format_params(params: Mapping[str, Any]) -> str:
    import yaml

    return yaml.safe_dump(dict(params), sort_keys=False)
