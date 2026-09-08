"""GeoJSON export, Tippecanoe invocation, detail-JSON sharding, PMTiles validation.

Owned by tile-builder. Not implemented yet (Phase 2+ once locus.scoring
produces real per-cell scores to export). CLAUDE.md Section 7: score
attributes are integers 0-100; --drop-densest-as-needed is forbidden for
score layers, use explicit zoom ranges and --no-feature-limit
--no-tile-size-limit with simplification instead.
"""
