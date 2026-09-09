// Mirrors config/profiles/<name>.yaml (CLAUDE.md Section 5), as emitted by
// scripts/generate-profile-manifest.mjs into profile-manifest.json.

export type CategoryKind = "nearest" | "density";

export interface CategoryManifest {
  id: string;
  label: string;
  kind: CategoryKind;
  sign: 1 | -1;
  weight: number;
}

export interface GateManifest {
  category: string;
  maxDistanceM: number;
}

export interface ProfileManifest {
  id: string;
  label: string;
  modes: string[];
  gates: GateManifest[];
  categories: CategoryManifest[];
  buildingFilter: string[];
}

export interface Manifest {
  profiles: ProfileManifest[];
}

// Per-cell detail shard shape (public/dev-tiles/detail/<h3>.json), matching
// what tile-builder is specified to produce for real per-cell detail
// (CLAUDE.md Section 7) — top-N POIs per category with name/distance.
export interface DetailPoi {
  name: string;
  category: string;
  distance_m: number;
  lat: number;
  lon: number;
}

export interface DetailCategoryEntry {
  value: number; // 0-100, same scale as cat_<profile>_<category> tile attr
  pois: DetailPoi[];
}

export interface DetailProfileEntry {
  score: number | null;
  gate_failed: string | null;
  categories: Record<string, DetailCategoryEntry>;
}

export interface CellDetail {
  h3: string;
  profiles: Record<string, DetailProfileEntry>;
}
