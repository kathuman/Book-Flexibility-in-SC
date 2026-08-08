# Global Disruption Atlas (prototype)

A "Google Earth style" interactive globe that visualizes a supply chain network and lets a reader flip between disruption-response scenarios. Built as a companion tool for the *Flexibility in Supply Chain* book, item **H**:

> Build a "Global Disruption Atlas" based on Google Earth style visualization. A dynamic map showing ports, factories, corridors; real-time disruption signals (weather, strikes, geopolitical alerts); scenario overlays (rerouting, buffering, alternative suppliers).

## Running it

No build step or server-side code is required — everything runs client-side.

```bash
cd tools/global-disruption-atlas
python3 -m http.server 8000
# open http://localhost:8000
```

(You can also open `index.html` directly in a browser, since the data is inlined in `data.js` rather than fetched.)

The globe renders with [`globe.gl`](https://github.com/vasturiano/globe.gl) (Three.js) loaded from a CDN, so an internet connection is needed the first time it runs.

## What it shows

- **Ports & factories** — plotted as points on the globe (`data.js` → `network.ports` / `network.factories`). Click any node for throughput, sector, and feeder-port detail.
- **Trade corridors** — animated arcs between nodes, colored by status: normal (blue), at-risk from a live disruption (orange, dashed), suspended by the active scenario (dim red), or an active reroute (green, animated).
- **Disruption signals** — pulsing rings + colored markers for weather, strike, and geopolitical events (`data.js` → `disruptions`), each with a severity 1–5 that drives pulse speed/size. A "Live signal feed" panel simulates a rolling monitoring log.
- **Scenario overlays** — a dropdown (`data.js` → `scenarios`) that swaps in a named response: Red Sea → Cape of Good Hope reroute, Panama Canal drought → buffer stock + rail landbridge, West Coast strike → alternate gateway + alternate supplier activation. Each scenario reports added transit days, suspended lanes, reroutes, buffer sites, and activated alternate suppliers.
- **Layer toggles & legend** in the left sidebar for ports, factories, corridors, disruption signals, and node labels.

## Data model

All sample data lives in `data.js` as a single `ATLAS_DATA` object (mirrored in `data/*.json` for reference/reuse), so the whole prototype works from a static file with no backend:

- `network.ports[]`, `network.factories[]` — id, name, lat/lng, plus throughput or sector.
- `network.corridors[]` — id, `from`/`to` node ids, lane name, baseline transit days.
- `disruptions[]` — id, type (`weather` | `strike` | `geopolitical`), lat/lng, severity, description, and the corridor ids it affects.
- `scenarios[]` — id, narrative, extra transit days, corridors to suspend, arcs to add (reroutes), ports to flag as buffer sites, and factories to flag as activated alternate suppliers.

## Turning the prototype into a live tool

The data model is intentionally shaped like what real feeds would provide, so the swap-in points are:

| Layer | Prototype source | Live replacement |
|---|---|---|
| Weather signals | static entries in `disruptions[]` | NOAA/JTWC/GDACS feeds, filtered to lanes near your corridors |
| Strikes / labor actions | static entries | news/labor-monitoring APIs, port authority advisories |
| Geopolitical alerts | static entries | maritime security advisories (e.g. UKMTO, ACLED) |
| Vessel/corridor status | fixed baseline days | AIS positions + ETA feeds |
| Buffer sites / alt suppliers | scenario JSON | your ERP/inventory system and supplier qualification records |

Because the app reads from a single `ATLAS_DATA` object, replacing `data.js` with a small module that polls those feeds (and calls `render()` on update) is enough to move from prototype to production — the rendering, layers, and scenario UI don't need to change.
