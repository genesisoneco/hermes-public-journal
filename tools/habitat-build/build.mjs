// Bundle + minify the habitat client for production.
//   node build.mjs          → writes assets/js/habitat.bundle.js (+ .map)
//   node build.mjs --check  → rebuilds in memory, exits 1 if the committed bundle is stale
// The raw module graph (assets/js/habitat/**) stays the source of truth and is
// still served for ?habitat=dev and as a fallback. The Worker imports sim/ from source.
import { build } from "esbuild";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(ROOT, "assets/js/habitat.bundle.js");
const check = process.argv.includes("--check");

const res = await build({
  entryPoints: [join(ROOT, "assets/js/habitat/main.js")],
  outfile: OUT,
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  sourcemap: "external",
  sourcesContent: false, // sources are served next to it; keeps the map small and checkout-independent
  legalComments: "none",
  charset: "utf8",
  write: false,
  logLevel: "warning",
});

const files = res.outputFiles.map((f) => {
  let text = f.text;
  if (f.path.endsWith(".js")) text = text.replace(/\/\/# sourceMappingURL=.*\n?$/, "") + "//# sourceMappingURL=habitat.bundle.js.map\n";
  return { path: f.path, text };
});
const norm = (s) => s.replace(/\r\n/g, "\n");

if (check) {
  const stale = files.filter((f) => !existsSync(f.path) || norm(readFileSync(f.path, "utf8")) !== norm(f.text));
  if (stale.length) {
    console.error("habitat bundle is stale: " + stale.map((f) => f.path.replace(ROOT, "")).join(", "));
    console.error("run: cd tools/habitat-build && npm ci && npm run build   (then commit the result)");
    process.exit(1);
  }
  console.log("habitat bundle is up to date");
} else {
  for (const f of files) writeFileSync(f.path, f.text);
  const js = files.find((f) => f.path.endsWith(".js")).text;
  console.log(`wrote assets/js/habitat.bundle.js  ${(js.length / 1024).toFixed(1)} KB raw, ${(gzipSync(js, { level: 9 }).length / 1024).toFixed(1)} KB gz`);
}
