Vendored third-party assets, bundled here so the prototype runs fully offline with no CDN dependency.

- `globe.gl.min.js` — [globe.gl](https://github.com/vasturiano/globe.gl) v2.31.0 (MIT license), a self-contained UMD bundle that includes Three.js internally.
- `img/earth-blue-marble.jpg`, `img/earth-topology.png`, `img/night-sky.png` — example textures from [three-globe](https://github.com/vasturiano/three-globe) (MIT license).

To update: `npm install globe.gl@<version> three-globe@<version> --no-save` in a scratch directory, then copy `node_modules/globe.gl/dist/globe.gl.min.js` and the three files under `node_modules/three-globe/example/img/` here.
