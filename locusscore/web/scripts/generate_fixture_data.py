#!/usr/bin/env python3
"""Generate SYNTHETIC fixture data for local frontend development — ADR 0002.

Everything this script produces is fabricated: distances are Euclidean to
made-up "anchor" POIs scattered around a hex disk centred on Rådhuspladsen,
Copenhagen, not real OSM/GTFS data. It exists so `map-frontend` work has
something with the *real* production schema to render before Phase 1-4
produce actual scored cells.

It deliberately runs cell inputs through the REAL scoring engine
(pipeline/locus/scoring) rather than fabricating scores directly, so the
fixture also doubles as an end-to-end smoke test of that engine against
every MVP profile.

Run with the pipeline's uv-managed interpreter, which already has h3/pyyaml
and the `locus` package installed in editable mode:

    ../pipeline/.venv/bin/python generate_fixture_data.py

Outputs (relative to this script):
    .fixture-build/cells.geojson         -- input for tippecanoe
    ../public/dev-tiles/detail/<h3>.json -- per-cell, per-profile POI detail
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
WEB_DIR = SCRIPT_DIR.parent
LOCUSSCORE_DIR = WEB_DIR.parent
PIPELINE_DIR = LOCUSSCORE_DIR / "pipeline"
sys.path.insert(0, str(PIPELINE_DIR))

import h3  # noqa: E402

from locus.scoring import load_profile, score_cell  # noqa: E402
from locus.scoring.calibration import histogram_summary, spearman_correlation  # noqa: E402
from locus.scoring.models import DensityObservation, NearestObservation, Profile  # noqa: E402

BUILD_DIR = SCRIPT_DIR / ".fixture-build"
DETAIL_DIR = WEB_DIR / "public" / "dev-tiles" / "detail"

CENTER_LAT, CENTER_LON = 55.6761, 12.5683  # Rådhuspladsen, Copenhagen
H3_RES = 9
DISK_RINGS = 12  # ~469 cells, ~5km across
RNG_SEED = 20260908

METERS_PER_DEG_LAT = 111_320.0
METERS_PER_DEG_LON = 111_320.0 * math.cos(math.radians(CENTER_LAT))

MVP_PROFILES = ["family", "student", "business_retail"]


def meters(lat: float, lon: float, lat0: float = CENTER_LAT, lon0: float = CENTER_LON) -> tuple[float, float]:
    """Local equirectangular projection to (x_east_m, y_north_m). Fixture-only
    precision — nowhere near what Phase 4's real OSRM distances will use."""
    return (lon - lon0) * METERS_PER_DEG_LON, (lat - lat0) * METERS_PER_DEG_LAT


def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


class Anchor:
    """A single synthetic POI (or, for polygon/line categories, an
    approximated 'edge' via a centre + radius)."""

    def __init__(self, name: str, lat: float, lon: float, radius_m: float = 0.0,
                 freq_per_hour: float | None = None):
        self.name = name
        self.lat = lat
        self.lon = lon
        self.xy = meters(lat, lon)
        self.radius_m = radius_m  # >0 approximates a polygon/line edge distance
        self.freq_per_hour = freq_per_hour

    def distance_to(self, xy: tuple[float, float]) -> float:
        d = dist_m(self.xy, xy)
        return max(0.0, d - self.radius_m)


FAMILY_ZONE = (CENTER_LAT - 0.007, CENTER_LON - 0.016)  # ~1.3km SW of centre
STUDENT_ZONE = (CENTER_LAT + 0.011, CENTER_LON + 0.017)  # ~1.6km NE of centre


def _scatter(
    rng: random.Random, n: int, radius_km: float, center: tuple[float, float] = (CENTER_LAT, CENTER_LON)
) -> list[tuple[float, float]]:
    clat, clon = center
    pts = []
    for _ in range(n):
        r = radius_km * math.sqrt(rng.random()) * 1000.0
        theta = rng.uniform(0, 2 * math.pi)
        lat = clat + (r * math.sin(theta)) / METERS_PER_DEG_LAT
        lon = clon + (r * math.cos(theta)) / METERS_PER_DEG_LON
        pts.append((lat, lon))
    return pts


def build_anchors(rng: random.Random) -> dict[str, list[Anchor]]:
    """Deliberately spatially clustered, not uniform: `family`-relevant
    categories cluster in FAMILY_ZONE, `student`-relevant ones in
    STUDENT_ZONE, "shared" ones spread across the whole disk. This is what
    makes the family/student profiles land visibly differently on the map
    -- real calibration (Section 6 step 2, Spearman < 0.8) will check this
    against real data; this fixture just needs to exercise the same code
    path meaningfully rather than produce two near-identical heatmaps."""
    anchors: dict[str, list[Anchor]] = {}

    def add(category: str, count: int, radius_km: float, center=(CENTER_LAT, CENTER_LON), **kwargs):
        pts = _scatter(rng, count, radius_km, center)
        anchors[category] = [
            Anchor(f"Fixture {category} #{i + 1}", lat, lon, **kwargs)
            for i, (lat, lon) in enumerate(pts)
        ]

    # Family-relevant: clustered tightly in FAMILY_ZONE.
    add("primary_school", 5, 0.9, center=FAMILY_ZONE)
    add("kindergarten", 8, 0.8, center=FAMILY_ZONE)
    add("playground", 8, 0.8, center=FAMILY_ZONE)

    # Student-relevant: clustered tightly in STUDENT_ZONE.
    add("university", 2, 0.7, center=STUDENT_ZONE)
    add("coworking", 4, 0.9, center=STUDENT_ZONE)
    add("nightlife", 7, 0.8, center=STUDENT_ZONE)
    add("culture", 4, 1.0, center=STUDENT_ZONE)

    # Shared / broadly spread across the whole disk, but dense enough that
    # both zones get reasonable coverage too.
    add("groceries", 20, 2.0)
    add("healthcare_gp", 9, 2.0)
    add("pharmacy", 10, 2.0)
    add("hospital", 1, 1.8)
    add("sports", 6, 2.0)
    add("cafe_restaurant", 20, 2.0)

    # Transit stops carry a frequency (min_freq_per_hour scaling, Section 6).
    transit_pts = _scatter(rng, 22, 2.0)
    anchors["transit_stop"] = [
        Anchor(
            f"Fixture transit_stop #{i + 1}", lat, lon,
            freq_per_hour=rng.choice([2, 3, 4, 6, 8, 10, 12, 15]),
        )
        for i, (lat, lon) in enumerate(transit_pts)
    ]

    # Polygon/line categories approximated as a centre + radius (Section 4.2:
    # real ingest must use true edge distance; this is a fixture stand-in).
    anchors["green_space"] = [
        Anchor("Fixture green_space (park)", FAMILY_ZONE[0] + 0.003, FAMILY_ZONE[1] + 0.004, radius_m=220)
    ]
    anchors["industrial"] = [Anchor("Fixture industrial zone", CENTER_LAT - 0.015, CENTER_LON + 0.014, radius_m=300)]
    anchors["arterial_road"] = [Anchor("Fixture arterial ring road", CENTER_LAT, CENTER_LON, radius_m=1500)]

    return anchors


def density_value(xy: tuple[float, float], kind: str) -> float:
    """Smooth synthetic density surface. Not the real
    "sum(levels * footprint_area)" formula (Section 6) -- just enough
    spatial structure for the density-category code path to be exercised
    meaningfully by MapLibre's colour scale."""
    d = math.hypot(*xy)
    if kind == "residential_density":
        # dips right at the commercial core, high in a mid-distance ring
        return max(0.0, 42000 * (1 - math.exp(-((d - 700) ** 2) / (2 * 900**2))) + 4000)
    if kind == "office_density":
        # peaks at the core (CBD), decays outward
        return 22000 * math.exp(-d / 900)
    if kind == "retail_cluster":
        # peaks at the core plus a secondary "high street" bump
        core = 9000 * math.exp(-d / 500)
        high_street = 4000 * math.exp(-((d - 1200) ** 2) / (2 * 300**2))
        return core + high_street
    raise ValueError(kind)


def build_observations(profile: Profile, xy: tuple[float, float], anchors: dict[str, list[Anchor]]):
    observations = {}
    for name, cfg in profile.categories.items():
        if cfg.kind == "nearest":
            cat_anchors = anchors.get(name, [])
            ranked = sorted(cat_anchors, key=lambda a: a.distance_to(xy))[: cfg.cap or 1]
            distances = tuple(a.distance_to(xy) for a in ranked)
            freqs = None
            if cfg.min_freq_per_hour is not None:
                freqs = tuple(a.freq_per_hour or 0.0 for a in ranked)
            observations[name] = NearestObservation(distances_m=distances, frequencies_per_hour=freqs)
        else:
            observations[name] = DensityObservation(density_value=density_value(xy, name))
    return observations


def build_gate_distances(profile: Profile, xy: tuple[float, float], anchors: dict[str, list[Anchor]]):
    gate_distances = {}
    for gate in profile.gates:
        cat_anchors = anchors.get(gate.category, [])
        if not cat_anchors:
            gate_distances[gate.category] = None
            continue
        gate_distances[gate.category] = min(a.distance_to(xy) for a in cat_anchors)
    return gate_distances


def nearest_pois_for_detail(cfg_name: str, cfg, xy: tuple[float, float], anchors: dict[str, list[Anchor]]):
    cat_anchors = anchors.get(cfg_name, [])
    ranked = sorted(cat_anchors, key=lambda a: a.distance_to(xy))[: cfg.cap or 1] if cfg.kind == "nearest" else []
    return [
        {
            "name": a.name,
            "category": cfg_name,
            "distance_m": round(a.distance_to(xy), 1),
            "lat": a.lat,
            "lon": a.lon,
        }
        for a in ranked
    ]


def confidence_bucket(xy: tuple[float, float], anchors: dict[str, list[Anchor]]) -> str:
    """Stand-in for Section 4.4's real formula (POI count within 1km vs.
    regional median for the residential-density band) -- here, just POI
    count within 1km across every nearest-type category."""
    count = 0
    for cat_anchors in anchors.values():
        for a in cat_anchors:
            if a.radius_m > 0:
                continue  # polygon/line anchors aren't discrete POI counts
            if dist_m(a.xy, xy) <= 1000:
                count += 1
    if count >= 18:
        return "high"
    if count >= 9:
        return "medium"
    return "low"


def write_anchors_geojson(anchors: dict[str, list[Anchor]]) -> None:
    """Small precomputed point layer for the frontend's 'POIs of the
    selected category' overlay (Section 8). Loaded as a plain GeoJSON
    source and filtered client-side by the `category` property -- that's
    attribute filtering on an already-loaded static layer, not a spatial
    join, so it doesn't violate the "no client-side spatial joins" rule."""
    features = [
        {
            "type": "Feature",
            "properties": {"name": a.name, "category": category},
            "geometry": {"type": "Point", "coordinates": [a.lon, a.lat]},
        }
        for category, cat_anchors in anchors.items()
        for a in cat_anchors
        if a.radius_m == 0.0  # polygon/line anchors aren't discrete points
    ]
    out_path = WEB_DIR / "public" / "dev-tiles" / "anchors.geojson"
    out_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"Wrote {len(features)} anchor points -> {out_path}")


def main() -> None:
    rng = random.Random(RNG_SEED)
    anchors = build_anchors(rng)
    write_anchors_geojson(anchors)

    origin = h3.latlng_to_cell(CENTER_LAT, CENTER_LON, H3_RES)
    cells = sorted(h3.grid_disk(origin, DISK_RINGS))
    outer_ring = set(h3.grid_ring(origin, DISK_RINGS)) | set(h3.grid_ring(origin, DISK_RINGS - 1))

    profiles = {name: load_profile(LOCUSSCORE_DIR / "config" / "profiles" / f"{name}.yaml") for name in MVP_PROFILES}

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    for old in DETAIL_DIR.glob("*.json"):
        old.unlink()

    features = []
    scores_by_profile: dict[str, list[float | None]] = {name: [] for name in MVP_PROFILES}

    for cell in cells:
        lat, lon = h3.cell_to_latlng(cell)
        xy = meters(lat, lon)
        boundary = h3.cell_to_boundary(cell)
        ring = [[lng, lat_] for lat_, lng in boundary]
        ring.append(ring[0])

        in_park = dist_m(anchors["green_space"][0].xy, xy) <= anchors["green_space"][0].radius_m + 60
        has_buildings = cell not in outer_ring and not in_park

        confidence = confidence_bucket(xy, anchors)

        properties: dict[str, object] = {
            "h3": cell,
            "confidence": confidence,
            "has_buildings": has_buildings,
        }

        detail_payload: dict[str, object] = {"h3": cell, "profiles": {}}

        for profile_name, profile in profiles.items():
            observations = build_observations(profile, xy, anchors)
            gate_distances = build_gate_distances(profile, xy, anchors)
            result = score_cell(profile, gate_distances, observations)

            score_int = round(result.score) if result.score is not None else None
            properties[f"score_{profile_name}"] = score_int
            properties[f"gate_{profile_name}"] = result.gate_failed
            for cat_name, cat_score in result.category_scores.items():
                properties[f"cat_{profile_name}_{cat_name}"] = round(cat_score * 100)

            scores_by_profile[profile_name].append(score_int)

            detail_payload["profiles"][profile_name] = {
                "score": score_int,
                "gate_failed": result.gate_failed,
                "categories": {
                    cat_name: {
                        "value": round(cat_score * 100),
                        "pois": nearest_pois_for_detail(cat_name, profile.categories[cat_name], xy, anchors),
                    }
                    for cat_name, cat_score in result.category_scores.items()
                },
            }

        features.append({
            "type": "Feature",
            "properties": properties,
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
        (DETAIL_DIR / f"{cell}.json").write_text(json.dumps(detail_payload))

    geojson = {"type": "FeatureCollection", "features": features}
    (BUILD_DIR / "cells.geojson").write_text(json.dumps(geojson))

    print(f"Generated {len(features)} cells -> {BUILD_DIR / 'cells.geojson'}")
    print(f"Detail shards -> {DETAIL_DIR} ({len(list(DETAIL_DIR.glob('*.json')))} files)")

    print("\n--- fixture sanity check (Section 6 calibration protocol, informational only) ---")
    for name in MVP_PROFILES:
        summary = histogram_summary(scores_by_profile[name])
        print(
            f"{name}: n={summary['n']} gated={summary['n_gated']} "
            f"range={summary['range']:.0f} spread_ok={summary['meets_spread_target']}"
        )
    for i, a in enumerate(MVP_PROFILES):
        for b in MVP_PROFILES[i + 1:]:
            valid = [
                (sa, sb)
                for sa, sb in zip(scores_by_profile[a], scores_by_profile[b], strict=True)
                if sa is not None and sb is not None
            ]
            rho = spearman_correlation([p[0] for p in valid], [p[1] for p in valid])
            print(f"spearman({a}, {b}) = {rho:.3f} ({'ok' if rho < 0.8 else 'too similar'})")


if __name__ == "__main__":
    main()
