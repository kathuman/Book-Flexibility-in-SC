"""OSRM table queries (cell -> POI distance matrices) and caching. Owned by pipeline-engineer.

Not implemented yet (Phase 4 — CLAUDE.md Section 11: Euclidean distance is
used first in Phase 2/3, network distance replaces it in Phase 4). Needs
running osrm-foot / osrm-bike containers (pipeline/docker-compose.yml) built
from a real OSRM graph, which does not exist until Phase 1 ingest runs.

Once implemented, this module is the only place that talks to OSRM; the
scoring engine (locus.scoring) only ever consumes plain distances in
metres and stays routing-backend-agnostic.
"""
