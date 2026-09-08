"""osm2pgsql wrapper, GTFS loader, campus CSV loader. Owned by pipeline-engineer.

Not implemented yet (Phase 1). Needs a live PostGIS instance
(pipeline/docker-compose.yml) and a downloaded Geofabrik extract
(config/region.yaml -> extract.url); neither is available in a sandboxed
scaffold session. See CLAUDE.md Section 10 for the phase's definition of
done: POI counts per category logged and sanity-checked against
config/region.yaml's expected_poi_counts.
"""
