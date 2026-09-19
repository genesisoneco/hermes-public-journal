# habitat-build

The site has no build step, so the habitat client ships as a **prebuilt, committed bundle**:

- Source (the source of truth): `assets/js/habitat/**` (native ES modules, including the shared `sim/`).
- Artifact: `assets/js/habitat.bundle.js` plus `habitat.bundle.js.map`. It is one ESM file, minified, targeting es2020, at about 43 KB gzipped (the raw module graph is about 70 KB gzipped per file).

`assets/js/habitat-boot.js` imports the bundle by default. It falls back to `assets/js/habitat/main.js` (the raw module graph) when:

- the page has `?habitat=dev` (this also enables the debug hooks), or
- the bundle fails to load.

The Worker still imports `assets/js/habitat/sim/*.js` from source, and wrangler/esbuild bundles it there. Nothing here affects it.

## Use

```sh
cd tools/habitat-build
npm ci
npm run build   # rewrite assets/js/habitat.bundle.js (+ .map) and print the size
npm run check   # rebuild in memory and exit 1 if the committed bundle is stale
```

**Rebuild and commit the bundle whenever you change anything under `assets/js/habitat/`.** CI enforces this: `.github/workflows/habitat-bundle.yml` runs `npm run check` on every push or PR that touches the habitat sources or the bundle.

## Notes

- esbuild is pinned to an exact version, so the output is byte-for-byte reproducible. The check also ignores CRLF vs LF differences.
- The source map has no `sourcesContent`. Its `sources` point at `habitat/**`, relative to the bundle, and the site serves those files, so devtools can still show the original code.
