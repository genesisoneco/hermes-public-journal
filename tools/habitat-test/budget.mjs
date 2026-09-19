// Size budget for the habitat: gz sizes as served (per-file gzip, like GitHub
// Pages), atlas WebP totals, and what an esbuild bundle+minify would give.
//   node budget.mjs [--json]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSizeSync } from "gzip-size";
import { brotliCompressSync } from "node:zlib";
import { buildSync } from "esbuild";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const JS = join(ROOT, "assets/js/habitat");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const kb = (n) => +(n / 1024).toFixed(1);
const br = (b) => brotliCompressSync(b).length;

const files = walk(JS).filter((f) => f.endsWith(".js"));
const group = (f) => (/[\\/]sim[\\/]/.test(f) ? "sim" : "client");
const sum = { client: { raw: 0, gz: 0 }, sim: { raw: 0, gz: 0 } };
for (const f of files) { const b = readFileSync(f); const g = sum[group(f)]; g.raw += b.length; g.gz += gzipSizeSync(b); }
const boot = readFileSync(join(ROOT, "assets/js/habitat-boot.js"));

// esbuild: one bundle, minified (what a build step would ship).
const bundle = buildSync({ entryPoints: [join(JS, "main.js")], bundle: true, minify: true, format: "esm", write: false, target: "es2020" }).outputFiles[0].contents;
const bundleNoMin = buildSync({ entryPoints: [join(JS, "main.js")], bundle: true, minify: false, format: "esm", write: false, target: "es2020" }).outputFiles[0].contents;
// esbuild per-file minify, no bundling (keeps the no-build-step module graph but needs committed .min files).
let perMinGz = 0;
for (const f of files) perMinGz += gzipSizeSync(Buffer.from(buildSync({ entryPoints: [f], bundle: false, minify: true, format: "esm", write: false, target: "es2020" }).outputFiles[0].contents));
// Whitespace/comment-only strip (what a hand "light minify" could achieve).
const minWsOnly = buildSync({ entryPoints: [join(JS, "main.js")], bundle: true, minifyWhitespace: true, format: "esm", write: false, target: "es2020" }).outputFiles[0].contents;

// The committed prebuilt bundle (tools/habitat-build) is what habitat-boot.js ships.
const shippedBuf = readFileSync(join(ROOT, "assets/js/habitat.bundle.js"));
const atlasDir = join(ROOT, "assets/habitat/atlas");
const atlas = readdirSync(atlasDir).map((f) => ({ f, n: statSync(join(atlasDir, f)).size }));
// The in-between pages (trinity-smooth-*) are lazy and budgeted separately (CONTRACT §4).
const allWebp = atlas.filter((a) => a.f.endsWith(".webp"));
const webp = allWebp.filter((a) => !/smooth/.test(a.f)), smooth = allWebp.filter((a) => /smooth/.test(a.f));
const out = {
  boot: { raw: boot.length, gz: gzipSizeSync(boot) },
  client: { rawKB: kb(sum.client.raw), gzKB: kb(sum.client.gz) },
  sim: { rawKB: kb(sum.sim.raw), gzKB: kb(sum.sim.gz) },
  habitatJsGzKB: kb(sum.client.gz + sum.sim.gz),
  shippedBundle: { rawKB: kb(shippedBuf.length), gzKB: kb(gzipSizeSync(shippedBuf)), brKB: kb(br(shippedBuf)) },
  files: files.length,
  esbuild: {
    bundleMinRawKB: kb(bundle.length), bundleMinGzKB: kb(gzipSizeSync(Buffer.from(bundle))), bundleMinBrKB: kb(br(Buffer.from(bundle))),
    bundleNoMinGzKB: kb(gzipSizeSync(Buffer.from(bundleNoMin))),
    bundleWhitespaceOnlyGzKB: kb(gzipSizeSync(Buffer.from(minWsOnly))),
    perFileMinGzKB: kb(perMinGz),
  },
  atlas: {
    webpTotalKB: kb(webp.reduce((s, a) => s + a.n, 0)),
    webp1xKB: kb(webp.filter((a) => a.f.includes("@1x")).reduce((s, a) => s + a.n, 0)),
    webp2xKB: kb(webp.filter((a) => a.f.includes("@2x")).reduce((s, a) => s + a.n, 0)),
    coreAt2xKB: kb((webp.find((a) => a.f === "trinity-core@2x.webp") || {}).n || 0),
    pngTotalKB: kb(atlas.filter((a) => a.f.endsWith(".png")).reduce((s, a) => s + a.n, 0)),
    jsonGzKB: kb(gzipSizeSync(readFileSync(join(atlasDir, "atlas.json")))),
    smooth1xKB: kb(smooth.filter((a) => a.f.includes("@1x")).reduce((s, a) => s + a.n, 0)),
    smooth2xKB: kb(smooth.filter((a) => a.f.includes("@2x")).reduce((s, a) => s + a.n, 0)),
    byFile: Object.fromEntries(allWebp.map((a) => [a.f, kb(a.n)])),
  },
  biggestFilesGz: files.map((f) => ({ f: relative(JS, f).replace(/\\/g, "/"), gz: kb(gzipSizeSync(readFileSync(f))) })).sort((a, b) => b.gz - a.gz).slice(0, 8),
};
if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(out));
else console.log(JSON.stringify(out, null, 2));
export default out;
