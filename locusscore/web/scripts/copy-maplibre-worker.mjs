#!/usr/bin/env node
// Copies maplibre-gl's worker script into public/ so it's servable at a
// stable, bundler-untouched URL.
//
// Root cause this works around: maplibre-gl spawns its tile-parsing web
// worker at a URL computed from `import.meta.url` of its own module,
// resolved relative (`./maplibre-gl-worker.mjs`). Under Turbopack that
// module is relocated/rewritten into an app chunk, so `import.meta.url`
// no longer points at anything where the real worker file lives -- the
// worker silently fails to load, and every vector-tile fetch (which is
// dispatched from the worker) hangs forever with no console error, no
// network request, nothing. Confirmed by isolating a raw `fetch()` with a
// Range header (works fine, same bundle) from the `pmtiles` package's own
// tile-fetch path (hangs) -- see lib/pmtilesLite.ts's module doc for the
// fuller writeup of that half of the investigation.
//
// The fix: copy the worker script to a URL we control and call
// maplibre-gl's own `setWorkerUrl()` (lib/tiles.ts) before creating any
// Map, so it never has to guess.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(WEB_DIR, "node_modules", "maplibre-gl", "dist");
const PUBLIC_DIR = path.join(WEB_DIR, "public");

// maplibre-gl-worker.mjs itself `import`s from "./maplibre-gl-shared.mjs"
// (a real relative ES module import, resolved by the browser against the
// worker script's own URL) -- both files have to be served from the same
// directory, or the worker fails to load with a 404 on the second one.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
for (const file of FILES) {
  fs.copyFileSync(path.join(DIST_DIR, file), path.join(PUBLIC_DIR, file));
}
console.log(`Copied maplibre-gl worker files -> public/{${FILES.join(",")}}`);
