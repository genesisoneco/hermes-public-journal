// Atlas loader (CONTRACT §4): @1x/@2x by DPR, WebP with PNG fallback,
// createImageBitmap decode. trinity-ext is loaded on demand: atlas.need(page)
// is called the first time a frame from it is drawn (or on idle after ready).
// The in-between pages (trinity-smooth-*) are optional polish: lazy, never
// in reduced motion, and @1x on low DPR / Save-Data / slow connections.

let webp;
function probeWebp() {
  if (webp !== undefined) return Promise.resolve(webp);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res((webp = im.width === 1));
    im.onerror = () => res((webp = false));
    im.src = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
  });
}

async function loadImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  const b = await r.blob();
  if (self.createImageBitmap) return createImageBitmap(b);
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }); // plain URL: site CSP img-src has no blob:
}

function decodeMask(b64) {
  try { const s = atob(b64), u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; } catch (e) { return null; }
}

// Returns null if there is no atlas yet (placeholder Trinity is used).
export const SMOOTH_PAGES = ["trinity-smooth-core", "trinity-smooth-ext"];
function lowData() {
  const c = typeof navigator !== "undefined" && navigator.connection;
  return !!(c && (c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || "")));
}

export async function loadAtlas(base, dpr, onPage, opts = {}) {
  const dir = base + "habitat/atlas/";
  let json;
  try { const r = await fetch(dir + "atlas.json", { cache: "no-cache" }); if (!r.ok) return null; json = await r.json(); } catch (e) { return null; }
  const res = dpr > 1.25 ? 2 : 1, key = "@" + res + "x";
  const useWebp = await probeWebp();
  const atlas = { ...json, res, pages: {} };
  // In-betweens at @2x only when the sprite is actually drawn above @1x size
  // (desktop DPR 2); phones draw her at ~0.5–0.8× of @1x, so @1x is enough there
  // and saves ~50 MB of decoded bitmap.
  const smoothRes = () => (dpr > 1.25 && !lowData() && (!opts.spriteScale || opts.spriteScale() > 1) ? 2 : 1);
  const load = async (name) => {
    const pg = json.pages[name]; if (!pg) return;
    const r = SMOOTH_PAGES.includes(name) ? smoothRes() : res, k = "@" + r + "x";
    const file = useWebp ? pg[k] : (pg.png && pg.png[k]) || pg[k];
    if (!file) return;
    try { atlas.pages[name] = { img: await loadImage(dir + file), res: r }; }
    catch (e) {
      if (useWebp && pg.png && pg.png[k]) try { atlas.pages[name] = { img: await loadImage(dir + pg.png[k]), res: r }; } catch (e2) { /* keep placeholder */ }
    }
    if (atlas.pages[name]) onPage && onPage(name);
  };
  const LAZY = new Set(["trinity-ext", ...SMOOTH_PAGES]), pending = {};
  atlas.need = (name) => {
    if (opts.reduced && SMOOTH_PAGES.includes(name)) return Promise.resolve();
    return json.pages[name] && !atlas.pages[name] ? (pending[name] ||= load(name)) : Promise.resolve();
  };
  atlas.has = (name) => !!json.pages[name];
  await Promise.all(Object.keys(json.pages).filter((n) => !LAZY.has(n)).map(load));
  return atlas;
}

// 1/4-res hit mask test. lx,ly = @1x px inside the frame rect.
export function hitFrame(fr, lx, ly) {
  if (lx < 0 || ly < 0 || lx >= fr.w || ly >= fr.h) return false;
  if (!fr.hit) return true;
  if (!fr._m) fr._m = decodeMask(fr.hit);
  if (!fr._m) return true;
  const w4 = Math.ceil(fr.w / 4), bit = Math.floor(ly / 4) * w4 + Math.floor(lx / 4);
  return !!(fr._m[bit >> 3] & (0x80 >> (bit & 7)));
}
