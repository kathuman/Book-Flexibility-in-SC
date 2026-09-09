# ADR 0002: Frontend built ahead of Phase 1-4, against synthetic fixture tiles

Date: 2026-09-09
Status: Accepted

## Context

`locusscore/CLAUDE.md` Section 11: "Do not start a phase before the
previous phase's QA review passes." Phase 5 (full Next.js frontend)
formally depends on Phase 4 (OSRM network distances, recalibrated), which
depends on Phase 1-3 (real ingest, real scoring against real OSM/GTFS
data). None of that exists yet — no live PostGIS/OSRM stack was ever run
(this remote session cannot run one credibly; see ADR 0001), so there are
no real `scores.pmtiles`/`buildings.pmtiles`/detail shards to build a
frontend against.

The repo owner explicitly asked to continue with the frontend anyway. This
ADR records that decision and how it was implemented without pretending
the result is production-calibrated.

## Decision

Build the Section 8 frontend now, against **synthetic fixture tiles**
that use the exact schema real tiles will have:
`score_<profile>`, `cat_<profile>_<category>`, `gate_<profile>`,
`confidence`, `has_buildings` on H3 res-9 polygons, plus per-cell detail
JSON shards keyed by H3 index. The fixture is built with the *same*
Tippecanoe invocation and flag set `tile-builder` is specified to use
(explicit zoom ranges, `--no-feature-limit --no-tile-size-limit`, no
`--drop-densest-as-needed`), so swapping the fixture for real
pipeline output later is a drop-in replacement, not a rewrite.

Fixture generation lives in `web/scripts/`:
- `generate_fixture_data.py` — real `h3` library, a small hex grid around
  central Copenhagen, synthetic (not calibrated, not real OSM-derived)
  scores per MVP profile with plausible-looking spread and differentiation
  between profiles, plus a detail JSON per cell.
- `build_fixture_tiles.sh` — the actual `tippecanoe` invocation.

The built fixture (`web/public/dev-tiles/`) is **git-ignored**. It is
regenerated locally by `npm run generate:fixtures` and is never committed,
consistent with the blanket "never commit PMTiles to git" rule in Section
3 — that rule doesn't carve out an exception for fixtures, so none is
taken here.

The local-dev basemap is a plain inline background colour
(`lib/tiles.ts` -> `DEV_BASEMAP_STYLE`), not a real tile source. An earlier
version pointed at MapLibre's public demo style
(`demotiles.maplibre.org`); that was dropped after this session's sandbox
egress policy blocked that host outright (403 on CONNECT) during browser
verification, and it wasn't any closer to the real deployment target than
a blank background — Section 12 item 9 already commits to a self-hosted
Protomaps `basemap.pmtiles`, which doesn't exist yet.

Fixture serving uses `web/public/dev-tiles/` (Next.js static file serving,
which supports HTTP Range requests, which `pmtiles` requires) rather than
a real Vercel Blob/R2 bucket, gated behind `NEXT_PUBLIC_TILES_BASE_URL`
(defaults to `/dev-tiles` locally; would point at Blob/R2 in a real
deployment). This is a **local-dev-only** substitute for the real
publish target in Section 3/7, not a new production artefact path — no
serverless function was added, so no separate ADR is needed for that per
se, but it's called out here so `qa-reviewer` doesn't mistake `public/` for
a real deviation from "public/ # NO tiles here" (Section 9): production
tiles still never belong there, only the git-ignored dev fixture does.

See also ADR 0003: getting these fixture tiles to actually render exposed
an unrelated MapLibre GL JS + Turbopack bundling bug (nothing to do with
fixture data specifically — it would have broken real production tiles
identically) and the fix for it.

## Consequences

- Every score, category breakdown, and POI shown in the running frontend
  right now is **fabricated for UI development**, not derived from OSM or
  GTFS. It must not be mistaken for calibrated output, screenshotted as if
  real, or used for any of the Section 6 calibration protocol's steps.
- When Phase 1-4 produce real tiles, `web/lib/style` and `web/components`
  should need zero changes — only `NEXT_PUBLIC_TILES_BASE_URL` and the
  fixture-generation scripts go away. If real integration needs code
  changes beyond that, the schema assumption here was wrong and should be
  fixed at the schema level, not by special-casing real vs. fixture data
  in components.
- `qa-reviewer`'s Phase 5/6 review must explicitly re-run once real tiles
  exist — passing against fixture data is not the same as passing Section
  11's actual Phase 5 acceptance criterion ("tiles served from Blob/R2").
