"""H3 grid generation and clipping to the extract boundary. Owned by pipeline-engineer.

Not implemented yet (Phase 2). Needs the ingested boundary/land polygons
from `locus.ingest` to clip against. CLAUDE.md Section 4.3: H3 resolution 9
(config/region.yaml -> grid.h3_resolution); cells with zero buildings are
still scored but flagged has_buildings=false.
"""
