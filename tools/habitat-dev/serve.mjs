// Dev server for the habitat harness: serves the repo root and strips Jekyll
// front matter from .css/.js so assets work without a Jekyll build.
//   node tools/habitat-dev/serve.mjs [port]   → http://localhost:8080/tools/habitat-dev/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const port = Number(process.argv[2] || 8080);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = normalize(join(root, p));
    if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    let body = await readFile(f);
    const ext = extname(f);
    if (ext === ".css" || ext === ".js") {
      const s = body.toString("utf8");
      if (s.startsWith("---")) body = Buffer.from(s.replace(/^---\r?\n[\s\S]*?---\r?\n/, ""));
    }
    res.writeHead(200, { "content-type": (MIME[ext] || "application/octet-stream") + "; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  } catch (e) { res.writeHead(404).end("not found"); }
}).listen(port, () => console.log("habitat dev on http://localhost:" + port + "/tools/habitat-dev/"));
