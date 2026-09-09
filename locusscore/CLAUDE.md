# LocusScore — Objective-Dependent Property Location Scoring on OpenStreetMap

## 1. What this is

A web application that scores locations (hex cells and residential/commercial building footprints) on how well they serve a stated objective for a property — raising a family, studying, retiring, remote work, running a retail/hospitality business, rental investment — based on network proximity to services derived from OpenStreetMap (OSM) and public transit data (GTFS).

The primary interface is a map: the region is coloured by score for the selected objective. The user switches objective and the colouring changes. Clicking a cell or building shows the per-category breakdown and the POIs that produced the score.

There is no objective-free score. `score = S(location, profile)`.

## 2. Goals and non-goals

### Goals

- Precomputed, per-profile score layers rendered as vector tiles in MapLibre.
- Profiles defined as data (YAML), not code. Adding a profile must not require touching the scoring engine.
- Network (walking/cycling) distance, not Euclidean, in the final product.
- Every score is explainable: category breakdown + contributing POIs + distances.
- Honest about data quality: a confidence layer shows where OSM is sparse.
- Deployable on Vercel; heavy compute runs offline as a batch pipeline.

### Non-goals (MVP)

- Property listings, prices, valuation.
- Noise, crime, flood risk, air quality (not in OSM).
- Nationwide coverage. One region first; pipeline must be region-agnostic via config.
- User accounts, saved searches.
- Real-time scoring of arbitrary points (everything is precomputed on a grid).

## 3. Architecture

Vercel cannot run PostGIS, OSRM, or multi-hour batch jobs. Therefore the system is split hard into an offline pipeline and an online app.

```
OFFLINE (Docker, local machine or CI runner)
  Geofabrik .pbf ─► osm2pgsql ─► PostGIS
  GTFS (Rejseplanen) ─► PostGIS
  OSRM (foot, bike profiles) ─► distance matrices cell→POI
  Scoring engine (Python) ─► scores per (cell, profile, category)
  Buildings ⨝ cell scores
  Tippecanoe ─► scores.pmtiles, buildings.pmtiles
  Per-cell detail JSON (top-N POIs per category, distances) ─► detail.pmtiles or sharded JSON
  Publish artefacts ─► object storage

ONLINE (Vercel)
  Next.js (App Router) + MapLibre GL + pmtiles.js
  Static assets from Vercel Blob (default) or Cloudflare R2 — must support HTTP Range requests
  Optional: one serverless route for click-detail if it cannot be fully precomputed
  Optional: Neon Postgres + PostGIS (read-only mirror of POIs) for that route
```

Design rule: the online app must work with zero serverless functions if possible. Click-detail is precomputed into a tile attribute or a sharded static JSON keyed by H3 index. Add a serverless route only if the detail payload makes tiles too heavy. Vercel function limits (10 s Hobby / 60 s Pro, 4.5 MB response) make anything non-trivial a liability.

Tile hosting: PMTiles served via range requests. Vercel Blob supports this; Cloudflare R2 with CORS is the fallback if file sizes or egress become an issue. Never commit PMTiles to git; they go through the publish step.

Basemap: Do not use `tile.openstreetmap.org` in production — its usage policy prohibits app traffic. Build a Protomaps basemap PMTiles from the same Geofabrik extract, or use a hosted vector tile provider (MapTiler/Stadia) with a key in Vercel env.

## 4. Data layer

### 4.1 Sources

| Data | Source | Format | Refresh |
|---|---|---|---|
| POIs, roads, buildings, land use | Geofabrik regional extract | .pbf | weekly |
| Transit stops + frequency | Rejseplanen GTFS (Denmark) | GTFS zip | weekly |
| Routing graph | OSRM built from the same .pbf | OSRM binaries | with extract |
| Campus locations (student profile) | curated CSV in repo | CSV | manual |

### 4.2 Master taxonomy

Defined in `config/taxonomy.yaml`. Each category maps to a list of OSM tag filters. Draft:

```yaml
groceries:        [shop=supermarket, shop=convenience, shop=greengrocer]
primary_school:   [amenity=school]                     # + isced tag filtering where present
kindergarten:     [amenity=kindergarten, amenity=childcare]
healthcare_gp:    [amenity=doctors, amenity=clinic]
pharmacy:         [amenity=pharmacy]
hospital:         [amenity=hospital]
transit_stop:     [highway=bus_stop, railway=station, railway=tram_stop, station=subway]   # frequency joined from GTFS
green_space:      [leisure=park, landuse=forest, natural=wood, leisure=nature_reserve]      # polygon — distance to edge, not centroid
playground:       [leisure=playground]
sports:           [leisure=sports_centre, leisure=fitness_centre, leisure=pitch, leisure=swimming_pool]
cafe_restaurant:  [amenity=cafe, amenity=restaurant, amenity=fast_food]
nightlife:        [amenity=bar, amenity=pub, amenity=nightclub]
culture:          [amenity=library, amenity=cinema, amenity=theatre, tourism=museum]
university:      [amenity=university, amenity=college]   # overridden by curated campus CSV
coworking:        [office=coworking, amenity=coworking_space]
arterial_road:    [highway=motorway, highway=trunk, highway=primary]      # linear — distance to line
industrial:       [landuse=industrial]
residential_density: derived — building=apartments|residential|house|terrace|detached|semidetached, using building:levels
office_density:   derived — building=office, office=*
retail_cluster:   [shop=*]   # used for co-location in business profiles
```

Polygons and lines are scored by distance to the nearest edge, not centroid. Do not get this wrong; parks and roads are the two categories where centroid distance produces absurd results.

### 4.3 Grid

H3 resolution 9 (~174 m edge, ~0.1 km²). Region clipped to the extract boundary. Cells with zero buildings are still scored (for the heatmap) but flagged `has_buildings=false`.

### 4.4 Data-quality indicator

Per cell: POI count within 1 km vs. the regional median for the same residential-density band. Emit `confidence ∈ {low, medium, high}`. Rendered as an overlay. A low-confidence cell must never silently show as a low score.

## 5. Profiles

Profiles live in `config/profiles/<name>.yaml`. Schema:

```yaml
profile: family
label: "Family with young children"
modes: [foot, bike]                 # OSRM profiles used; distance = min over modes with per-mode scaling
gates:                              # hard constraints; fail any → "unsuitable", no score
  - category: primary_school
    max_distance_m: 2500
categories:
  primary_school:   {weight: 0.20, lambda_m: 800,  sign: +1, cap: 1}
  kindergarten:     {weight: 0.15, lambda_m: 600,  sign: +1, cap: 1}
  playground:       {weight: 0.10, lambda_m: 400,  sign: +1, cap: 3}
  green_space:      {weight: 0.10, lambda_m: 500,  sign: +1, cap: 2}
  groceries:        {weight: 0.15, lambda_m: 600,  sign: +1, cap: 2}
  healthcare_gp:    {weight: 0.05, lambda_m: 1500, sign: +1, cap: 1}
  transit_stop:     {weight: 0.10, lambda_m: 500,  sign: +1, cap: 2, min_freq_per_hour: 4}
  nightlife:        {weight: 0.05, lambda_m: 200,  sign: -1, cap: 3}
  arterial_road:    {weight: 0.10, lambda_m: 150,  sign: -1, cap: 1}
building_filter: [apartments, residential, house, terrace, detached, semidetached]
```

Direction: residential profiles score access to services. Business profiles score catchment (what is near the location: residential density, footfall proxies, complementary businesses). Same engine, different category set; `residential_density` and `office_density` are density-in-radius categories, not nearest-distance categories. The engine must support both `kind: nearest` and `kind: density` categories.

MVP profiles (build in this order): `family`, `student`, `business_retail`. Later: `retiree`, `remote_worker`, `rental_investor`. Weights above are starting points; calibration will change them.

## 6. Scoring engine

For cell c, profile p, category k:

### Nearest-type categories

- Take the cap<sub>k</sub> nearest POIs by network distance d<sub>i</sub> (mode = best of profile modes, bike distances scaled by 0.4 to walking-equivalent unless overridden).
- Per-POI accessibility: `aᵢ = exp(-dᵢ / λₖ)`
- Redundancy with diminishing returns: `Aₖ = Σᵢ aᵢ · rⁱ⁻¹` with `r = 0.5`, normalised by `Σ rⁱ⁻¹` over `cap`.
- Transit: multiply aᵢ by `min(1, freq/min_freq_per_hour)`.

### Density-type categories

`Aₖ = min(1, D(c, radius) / D_ref)` where D is summed building levels × footprint area within radius, and D_ref is the regional 90th percentile.

### Composite

`S(c,p) = 100 · clamp( Σₖ wₖ · signₖ · Aₖ , 0, 1 )` with Σ|wₖ| = 1 over positive weights; negatives subtract.

Gates evaluated first. Fail → `S = null`, `gate_failed = "<category>"`.

### Calibration protocol (mandatory before a profile is considered done)

1. Score all cells. Plot histogram. Target: roughly unimodal, spread across ≥ 60 points of range. If compressed into 20 points, λ or weights are wrong.
2. Rank correlation between profiles must be visibly < 1 (Spearman < 0.8 as a rule of thumb). If family and student agree on the top decile, the profiles are not differentiated.
3. Spot-check against local knowledge (see Section 12 for region-specific anchors). Write the expected outcomes down before looking at the map.
4. Inspect the map, not just the histogram. Look for artefacts at extract boundaries, water, railway corridors.
5. All calibration runs are logged in `docs/calibration/<profile>-<date>.md` with the parameters used and the decision taken.

## 7. Tiles and artefacts

| Artefact | Contents | Zoom |
|---|---|---|
| `scores.pmtiles` | H3 polygons; attributes `score_<profile>`, `cat_<profile>_<category>`, `gate_<profile>`, `confidence`, `has_buildings` | 8–13 |
| `buildings.pmtiles` | Building footprints filtered by any profile's `building_filter`; same score attributes joined from parent cell; `building_type` | 14–17 |
| `detail/<h3>.json` (sharded) or `detail.pmtiles` | Per cell per profile: top-N POIs per category with name, distance, coordinates | on click |
| `basemap.pmtiles` | Protomaps basemap for the region | all |

Score attributes are stored as integers 0–100 to keep tiles small. Tippecanoe flags: `--drop-densest-as-needed` is forbidden for score layers (it drops cells arbitrarily); use explicit zoom ranges and `--no-feature-limit --no-tile-size-limit` with simplification instead.

## 8. Frontend

Next.js (App Router), TypeScript, MapLibre GL, `pmtiles` protocol, Tailwind. No component library unless justified.

### Views

- Map (default): heatmap of `score_<profile>` at zoom < 14, building footprints at zoom ≥ 14. Address search (Nominatim, with attribution and rate-limit respect; debounce, 1 req/s) flies to location.
- Profile selector: segmented control; switching changes only the MapLibre style expression — no data reload.
- Category drill-down: dropdown to colour by a single `cat_<profile>_<category>` instead of the composite.
- Overlays (toggles): gate failures (hatched), confidence (desaturate low-confidence cells), POIs of the selected category as points.
- Compare mode: side-by-side or swipe between two profiles for the same viewport.
- Detail card on click: score, gate status, per-category bars, POI list with distances, lines from location to each POI drawn on the map.

### Colour

- Fixed 0–100 scale, identical for all profiles and categories. Never quantile.
- 7 discrete classes, ColorBrewer `RdYlBu` (colourblind-safe). Legend always visible, showing the active profile/category.
- `null` (gate failed) = hatched grey. Low confidence = 50 % desaturation.

### Performance

- First paint < 2 s on a mid-range laptop with cached tiles.
- Profile switch < 100 ms (style-only).
- No client-side spatial joins. Ever.

## 9. Repository layout

```
locusscore/
├── CLAUDE.md                  ← this file
├── config/
│   ├── region.yaml            # extract URL, bbox, H3 res, GTFS URL, calibration anchors
│   ├── taxonomy.yaml
│   └── profiles/*.yaml
├── pipeline/                  # Python 3.12, uv, ruff, pytest
│   ├── docker-compose.yml     # postgis, osrm-foot, osrm-bike
│   ├── locus/
│   │   ├── ingest/            # osm2pgsql wrapper, gtfs loader, campus csv
│   │   ├── grid/              # h3 generation, clipping
│   │   ├── routing/           # osrm table queries, caching
│   │   ├── scoring/           # engine, profile loader, calibration
│   │   ├── tiles/             # geojson export, tippecanoe, detail shards
│   │   └── publish/           # upload to Blob/R2
│   └── tests/
├── web/                       # Next.js app deployed to Vercel
│   ├── app/
│   ├── components/map/
│   ├── lib/style/             # MapLibre expression builders per profile
│   └── public/                # NO tiles here
├── docs/
│   ├── calibration/
│   └── decisions/             # ADRs, one per non-obvious choice
└── .claude/
    └── agents/                # see Section 10
```

Note: this project is hosted inside the `book-flexibility-in-sc` repository at the top-level `locusscore/` directory (a sibling of `tools/`), rather than in its own repository, per an explicit decision recorded in `docs/decisions/0001-mvp-defaults.md`. The `.claude/agents/` directory lives at the repo root (`.claude/agents/`) since Claude Code subagents are discovered relative to the repo root, not this subdirectory.

## 10. Agents

Claude Code subagents in `.claude/agents/` (repo root). Each has a narrow remit and a definition of done. The orchestrating session delegates; agents do not call each other.

| Agent | Remit | Definition of done |
|---|---|---|
| `pipeline-engineer` | Docker stack, osm2pgsql, GTFS ingest, OSRM build, H3 grid, routing matrices. Owns `pipeline/locus/{ingest,grid,routing}`. | `make ingest` produces PostGIS with POI counts per category logged and sanity-checked against expected ranges in `config/region.yaml`. |
| `scoring-modeler` | Scoring engine, profile schema + validation, calibration scripts and reports. Owns `pipeline/locus/scoring`, `config/profiles`. | Engine passes unit tests on synthetic fixtures (known distances → known scores); calibration report written for each profile per Section 6 protocol. |
| `tile-builder` | GeoJSON export, Tippecanoe, detail shards, PMTiles validation, publish step. Owns `pipeline/locus/{tiles,publish}`. | Tiles open in MapLibre with all attributes present; no dropped cells; file sizes logged; publish idempotent. |
| `map-frontend` | Next.js app, MapLibre layers, style expressions, UI controls, detail card, compare mode. Owns `web/`. | All views in Section 8 functional; profile switch is style-only; Lighthouse performance ≥ 85. |
| `qa-reviewer` | Adversarial review of every phase deliverable against this document. Does not write features. Checks: centroid-vs-edge distance, quantile colour scales, dropped tiles, client-side joins, OSM tile policy, licence attribution. | Written review in `docs/reviews/` with pass/fail per checklist item; blocks phase completion on fail. |
| `docs-adr` | Writes ADRs for every decision that deviates from this document; maintains README and runbook. | Every deviation has an ADR; a new engineer can rebuild the pipeline from the runbook alone. |

Rules for all agents:

- Do not invent OSM tags. Check the wiki (`wiki.openstreetmap.org/wiki/Key:<key>`) when unsure.
- Do not silently change weights, λ, or caps. Changes go through `scoring-modeler` with a calibration entry.
- Do not add a serverless function without an ADR explaining why static was insufficient.
- ODbL attribution ("© OpenStreetMap contributors") must be visible in the app at all times.

## 11. Build phases and acceptance criteria

| Phase | Deliverable | Accept when |
|---|---|---|
| 0 | Repo scaffold, configs, Docker stack up, agents defined | `docker compose up` yields healthy PostGIS + OSRM; CI runs lint + tests |
| 1 | Ingest for target region | POI counts per category logged and within expected ranges; buildings loaded with levels |
| 2 | H3 grid + Euclidean scoring, `family` only, static heatmap in a bare MapLibre page | Map renders; calibration report #1 written; distribution not compressed |
| 3 | Add `student` (needs GTFS frequency) and `business_retail` (needs density categories) | Spearman between profiles < 0.8; calibration reports written; engine supports `nearest` and `density` |
| 4 | OSRM network distances replace Euclidean; recalibrate | Reports updated; visible improvement at railway/water barriers documented with before/after screenshots |
| 5 | Full Next.js frontend on Vercel: profile switcher, drill-down, detail card, legend | Section 8 views work on preview deployment; tiles served from Blob/R2 |
| 6 | Building footprints, overlays (gate, confidence), compare mode | QA review passes |
| 7 | Self-hosted basemap, publish automation (GitHub Actions weekly), remaining profiles as YAML | Weekly rebuild runs unattended; adding a profile requires only a YAML file |

Do not start a phase before the previous phase's QA review passes.

**Status: Phase 0 (scaffold) + scoring engine skeleton (part of Phase 2/3 scope, built ahead of schedule because it needs no live infra) are done. A Phase 5 frontend also exists ahead of schedule, by explicit repo-owner request, built against synthetic fixture tiles rather than real pipeline output — see `docs/decisions/0002-frontend-ahead-of-pipeline.md` (and `0003-maplibre-worker-turbopack-fix.md` for a bundler gotcha hit along the way). Phase 1-4 (real ingest, scoring, calibration, network distance) still require a real Docker/PostGIS/OSRM environment this remote session does not have — see `docs/decisions/0001-mvp-defaults.md`.**

## 12. Open questions — answered before Phase 0

All defaults below were explicitly accepted by the repo owner on 2026-09-08. See `docs/decisions/0001-mvp-defaults.md` for the full record. One item — calibration anchors — has no default and remains genuinely open; it blocks Phase 2, not Phase 0.

1. **Region for MVP**: Region Hovedstaden (Greater Copenhagen) via Geofabrik `denmark-latest.osm.pbf` clipped to a bbox. Accepted (default).
2. **Calibration anchors**: **Still open.** 3–5 areas the owner considers obviously good/bad per MVP profile, needed before Phase 2 calibration can start. Not defaultable — this is local knowledge, not a technical choice.
3. **Business profile**: Generic retail/hospitality catchment. Accepted (default).
4. **Student profile campuses**: KU (all campuses), DTU Lyngby, CBS, ITU, KEA, Aalborg CPH; "any campus" (nearest), not user-selected. Accepted (default).
5. **GTFS access**: Rejseplanen GTFS requires registration; start the `student` profile without frequency (degraded `transit_stop` scoring, `min_freq_per_hour` gate effectively disabled) until an account exists. Accepted (default).
6. **Cycling**: Included in MVP for `family` and `student`; not for `retiree` (post-MVP). Accepted (default).
7. **Vercel plan**: Pro. Accepted (default).
8. **Tile storage**: Vercel Blob. Accepted (default).
9. **Basemap**: Self-hosted Protomaps. Accepted (default).
10. **Domain / auth**: Vercel preview deployments only until Phase 6. Accepted (default).
11. **Pipeline execution**: Local machine via Docker. Accepted (default).
12. **Rebuild cadence**: Weekly. Accepted (default).
13. **Address search**: Nominatim public instance (rate-limited, debounced to 1 req/s, with attribution). Accepted (default).
14. **Compare mode**: Swipe. Accepted (default).
15. **Language**: English. Accepted (default).
16. **Project nature**: Personal/portfolio. Accepted (default) — investment level in basemap polish, attribution, and rate-limit handling stays proportionate to that, not commercial-grade.

## Constraints (imposed unless objected to)

- Python 3.12 + uv for the pipeline; TypeScript strict for the web app.
- No ORM; SQL in files. PostGIS does the heavy lifting.
- Tests required for the scoring engine before any calibration.
- No feature is "done" without the QA agent's written review.
