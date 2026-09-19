// Static server for the Jekyll-built _site/ (GitHub Pages-like: dir index,
// gzip for text, 404.html). node serve-site.mjs [port] [siteDir]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(process.argv[3] || join(here, "../../_site"));
const port = Number(process.argv[2] || 4000);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".xml", ".txt", ".svg"]);
const cache = new Map();

async function resolveFile(p) {
  let f = normalize(join(root, p));
  if (!f.startsWith(root)) return null;
  try {
    const s = await stat(f);
    if (s.isDirectory()) f = join(f, "index.html");
    await stat(f); return f;
  } catch (e) {
    try { await stat(f + ".html"); return f + ".html"; } catch (e2) { return null; }
  }
}

createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = await resolveFile(p), code = 200;
  if (!f) { f = join(root, "404.html"); code = 404; }
  try {
    const ext = extname(f);
    let body = await readFile(f);
    const hdr = { "content-type": (MIME[ext] || "application/octet-stream") + (TEXT.has(ext) ? "; charset=utf-8" : ""), "cache-control": "max-age=600" };
    if (TEXT.has(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) {
      const k = f + ":" + body.length; if (!cache.has(k)) cache.set(k, gzipSync(body)); body = cache.get(k); hdr["content-encoding"] = "gzip";
    }
    res.writeHead(code, hdr); res.end(body);
  } catch (e) { res.writeHead(404).end("not found"); }
}).listen(port, "127.0.0.1", () => console.log(`_site on http://localhost:${port}/ (${root})`));
