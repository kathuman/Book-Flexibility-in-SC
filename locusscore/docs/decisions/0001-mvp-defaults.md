# ADR 0001: MVP defaults and repo placement

Date: 2026-09-08
Status: Accepted

## Context

`locusscore/CLAUDE.md` Section 12 lists sixteen open questions with stated
defaults, plus a required repo-placement decision that has no stated
default. Section 12 explicitly requires: "If you accept a default, say so
explicitly; do not leave it implicit." This ADR is that explicit record,
made by the repo owner (kathuman) on 2026-09-08.

## Decisions

### Repo placement (not a Section 12 item, decided first)

LocusScore is built inside `book-flexibility-in-sc` at the top-level
`locusscore/` directory, not in its own repository. This repo is otherwise
a "companion repository for the book *Flexibility in Supply Chain*" and
LocusScore is unrelated to that subject — this is a deliberate, informed
choice by the repo owner (repo creation via the GitHub App attached to this
session failed with a 403 — insufficient integration permissions — and the
owner chose to proceed here rather than create the repo manually). If this
ever needs to move to its own repository, `locusscore/` is self-contained
(own CLAUDE.md, own pipeline/, own config/) except for `.claude/agents/`,
which lives at the outer repo root because Claude Code discovers subagents
relative to repo root, not subdirectory.

### Section 12 defaults, all accepted as stated

| # | Question | Default accepted |
|---|---|---|
| 1 | Region for MVP | Region Hovedstaden (Greater Copenhagen), Geofabrik `denmark-latest.osm.pbf` clipped to bbox |
| 2 | Calibration anchors | **Not defaultable — see "Still open" below** |
| 3 | Business profile | Generic retail/hospitality catchment |
| 4 | Student campuses | KU (all campuses), DTU Lyngby, CBS, ITU, KEA, Aalborg CPH; "any campus" (nearest), not user-selected |
| 5 | GTFS access | Start `student` profile without frequency (degraded) until a Rejseplanen account exists |
| 6 | Cycling | Included for `family`/`student`; not for `retiree` (post-MVP) |
| 7 | Vercel plan | Pro |
| 8 | Tile storage | Vercel Blob |
| 9 | Basemap | Self-hosted Protomaps |
| 10 | Domain / auth | Vercel preview deployments only until Phase 6 |
| 11 | Pipeline execution | Local machine via Docker |
| 12 | Rebuild cadence | Weekly |
| 13 | Address search | Nominatim public instance (debounced 1 req/s, attributed) — **note**: the session's first restatement of this question to the owner mislabelled DAWA as the default; the owner's "accept all defaults" answer is honored against the spec's actual text (Nominatim), not that mislabelling. Recorded here so the discrepancy isn't silently swept under the rug. |
| 14 | Compare mode | Swipe |
| 15 | Language | English |
| 16 | Project nature | Personal/portfolio — investment in basemap polish, attribution, and rate-limit handling stays proportionate to that, not commercial-grade |

### Still open: calibration anchors (Section 12 item 2)

No default exists for this one, by design — the spec is explicit that
calibration without real local-knowledge anchors "is my opinion, not
yours." This blocks the Phase 6 calibration protocol (`CLAUDE.md` Section
6, step 3), not Phase 0. The repo owner needs to supply 3-5 areas per MVP
profile (`family`, `student`, `business_retail`) considered obviously
good/bad, into `locusscore/config/region.yaml` ->
`calibration_anchors`, before any profile can be declared calibrated.

## Consequences

- `locusscore/config/region.yaml` is filled in against decision #1, #4,
  #5, #6, with `calibration_anchors: []` left empty and flagged.
- `d_ref` values in `config/profiles/business_retail.yaml` are placeholders
  pending decision #1's real ingest data (Phase 1) — see that file's
  header comment.
- This session's scope (Phase 0 scaffold + scoring-engine skeleton, per a
  separate scope decision from the repo owner) does not touch decisions
  #7-#12 operationally — they matter starting Phase 5 (frontend/Vercel) and
  Phase 1 (pipeline execution). They're recorded now so nobody re-litigates
  them later without cause.
