"""Upload built artefacts (scores.pmtiles, buildings.pmtiles, detail shards,
basemap.pmtiles) to object storage. Owned by tile-builder.

Not implemented yet (Phase 5+). Target is Vercel Blob (CLAUDE.md Section 12
item 8, default accepted); publish must be idempotent (Section 10
definition of done) and never commit PMTiles to git (Section 3).
"""
