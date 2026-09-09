#!/usr/bin/env node
// Generates lib/style/profile-manifest.json from config/profiles/*.yaml.
//
// The frontend must never hardcode profile/category knowledge that could
// silently drift from the YAML source of truth (CLAUDE.md Section 2 goal:
// "Adding a profile must not require touching the scoring engine" — the
// same applies to the frontend). Category display labels are humanized
// from the taxonomy id; taxonomy.yaml itself carries no separate label
// field, by design (it's a machine schema, not UI copy).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");
const LOCUSSCORE_DIR = path.resolve(WEB_DIR, "..");
const PROFILES_DIR = path.join(LOCUSSCORE_DIR, "config", "profiles");
const OUT_PATH = path.join(WEB_DIR, "lib", "style", "profile-manifest.json");

function humanize(id) {
  return id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function loadProfile(file) {
  const raw = loadYaml(fs.readFileSync(path.join(PROFILES_DIR, file), "utf8"));
  const categories = Object.entries(raw.categories).map(([id, cfg]) => ({
    id,
    label: humanize(id),
    kind: cfg.kind,
    sign: cfg.sign,
    weight: cfg.weight,
  }));
  return {
    id: raw.profile,
    label: raw.label,
    modes: raw.modes,
    gates: (raw.gates || []).map((g) => ({
      category: g.category,
      maxDistanceM: g.max_distance_m,
    })),
    categories,
    buildingFilter: raw.building_filter || [],
  };
}

function main() {
  const files = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".yaml"));
  if (files.length === 0) {
    throw new Error(`no profile YAML files found in ${PROFILES_DIR}`);
  }
  const profiles = files.map(loadProfile).sort((a, b) => a.id.localeCompare(b.id));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ profiles }, null, 2) + "\n");
  console.log(`Wrote ${profiles.length} profiles -> ${path.relative(WEB_DIR, OUT_PATH)}`);
}

main();
