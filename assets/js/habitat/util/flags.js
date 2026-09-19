// URL flags + clock for the habitat. See docs/habitat/CONTRACT.md §5.
//   ?habitat=debug  &seed=N  &clock=ISO  &net=offline|mock|live  &items=all|a,b
// The clock starts at `clock` (if given) and then runs in real time, so the
// world keeps moving while the time of day stays predictable for screenshots.

export function readFlags(search = location.search) {
  const q = new URLSearchParams(search);
  const clockIso = q.get("clock");
  let clockBase = clockIso ? Date.parse(clockIso) : NaN;
  if (!isFinite(clockBase)) clockBase = null;
  return {
    debug: /^(debug|dev)$/.test(q.get("habitat") || ""),
    seed: q.has("seed") ? Number(q.get("seed")) >>> 0 : null,
    clockBase,
    net: q.get("net") || "live",
    items: q.get("items") || null,
    rate: q.has("clockrate") ? Number(q.get("clockrate")) : 1,
  };
}

export function makeClock(flags) {
  const t0 = performance.now();
  const base = flags.clockBase;
  const rate = isFinite(flags.rate) ? flags.rate : 1;
  let offset = 0; // server - local, set by net/sync
  return {
    now: () => base == null ? Date.now() + offset : base + (performance.now() - t0) * rate,
    setOffset: (o) => { offset = o; },
    frozen: base != null,
  };
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;

// Tiny DOM helper: h("div.cls", {attr}, children…)
export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split(".");
  const el = document.createElement(name || "div");
  if (cls.length) el.className = cls.join(" ");
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}

export function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
