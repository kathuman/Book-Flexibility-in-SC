# ADR 0003: Serve maplibre-gl's worker script from public/ to fix Turbopack

Date: 2026-09-09
Status: Accepted

## Context

While verifying the frontend (ADR 0002), `scores.pmtiles` never rendered
any features despite `pmtiles`/MapLibre being wired up correctly by every
visible measure: `addProtocol("pmtiles", ...)` succeeded, the registered
handler was confirmed present in `maplibregl.config.REGISTERED_PROTOCOLS`,
the vector source was added with a valid `url`, and no error surfaced
anywhere (no `map.on('error')`, no console error, no rejected promise).
`map.isSourceLoaded('cells')` stayed `false` indefinitely and
`queryRenderedFeatures` stayed empty, with zero network requests for tile
data after the initial header read.

Investigation (isolating a raw `fetch()` with a Range header — worked
fine, from the same bundle — from the `pmtiles` package's own fetch path
— hung forever) first pointed at the `pmtiles` npm package's bundled code
breaking under Turbopack. A from-scratch reimplementation of the PMTiles
reader (temporarily committed, since reverted) hit the *exact same*
symptom, which ruled that out and pointed elsewhere.

The actual cause: MapLibre GL JS parses vector tiles in a Web Worker, and
computes that worker's script URL from its own module's `import.meta.url`,
resolved relative to itself (`new URL('./maplibre-gl-worker.mjs', <that
url>)`). Turbopack relocates and rewrites that module into an app chunk
under `_next/static/chunks/`, so `import.meta.url` no longer points
anywhere the real worker file lives. The worker constructor doesn't throw
for a bad URL — `Playwright`'s `page.on('worker', ...)` showed the worker
being created, then immediately closed after a failed relative import of
`./maplibre-gl-shared.mjs` inside it (the same wrong-base-URL problem, one
level deeper). Every operation that depends on the worker (all vector-tile
fetching and parsing, dispatched to it via MapLibre's `Actor`/`Dispatcher`
message channel) then hangs forever, silently, because nothing on the
main thread is waiting synchronously for a response that only a broken
worker was ever going to send. Registering a protocol handler still
"succeeds" because that registration itself happens on the main thread;
it's only actually *invoked* once a real tile request reaches it, which
this bug prevents.

This is a bundler/library interaction, not a `pmtiles` bug and not
specific to the ADR 0002 fixture data — it would break real production
tiles from Vercel Blob/R2 identically.

## Decision

1. `scripts/copy-maplibre-worker.mjs` copies `maplibre-gl-worker.mjs` and
   its sibling `maplibre-gl-shared.mjs` (the worker's own relative import)
   verbatim from `node_modules/maplibre-gl/dist/` into `public/`, run via
   `predev`/`prebuild` (`npm run copy:worker`). Both files are gitignored,
   regenerated on install/build, and never hand-edited.
2. `lib/tiles.ts`'s `ensurePmtilesProtocol()` calls MapLibre's own
   `setWorkerUrl("/maplibre-gl-worker.mjs")` before any `new Map(...)`, so
   it never has to guess a URL Turbopack has already invalidated.
3. Reverted the from-scratch PMTiles reader back to the `pmtiles` npm
   package (CLAUDE.md Section 8 names "pmtiles.js" explicitly) plus this
   fix, rather than keeping custom binary-format-parsing code around for a
   bug that had nothing to do with that package's implementation.

## Consequences

- Any other bundler this project might move to (or a Turbopack version
  that changes chunk URL handling) needs the same check: does
  `page.on('worker', ...)` show the maplibre-gl worker loading and staying
  alive, or closing immediately after a failed relative import? If the
  latter, this fix (or an equivalent) is still needed.
- If `maplibre-gl` ships a documented, officially-supported way to declare
  its worker/shared-chunk URLs for bundlers (check release notes on
  upgrade), prefer that over this copy-to-public workaround and remove
  `scripts/copy-maplibre-worker.mjs`.
- `map-frontend` should re-verify this specifically after any
  `maplibre-gl` version bump — the copied files must stay in lockstep with
  whichever version is installed, which `npm run copy:worker` already
  guarantees (it copies straight from `node_modules`), but a version bump
  that changes the worker's own import filename (unlikely, not impossible)
  would need the script's `FILES` list updated too.
