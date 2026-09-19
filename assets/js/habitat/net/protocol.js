// Wire protocol v1 helpers (CONTRACT §3). Client → server frames ≤ 512 bytes.
export const V = 1;
const cl = (v) => Math.max(-1, Math.min(1, Math.round(v * 100) / 100));

let n = 0;
export const nonce = () => (Date.now().toString(36).slice(-5) + (n++).toString(36) + Math.random().toString(36).slice(2, 5)).slice(0, 12);

export function gestureMsg(k, payload = {}, id = nonce()) {
  const m = { t: "i", k, nonce: id };
  if (k === "push") { m.vi = cl(payload.vi || 0); m.vj = cl(payload.vj || 0); m.vz = cl(payload.vz || 0); }
  if (k === "feed") m.item = payload.item === "battery" ? "battery" : "carrot";
  if (k === "toss") { m.item = payload.item === "box" ? "box" : "ball"; m.i = +(+payload.i).toFixed(2); m.j = +(+payload.j).toFixed(2); }
  return m;
}

export function endpoints(api) {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const http = local ? "http://localhost:8787" : (api || "https://api.doaia.com").replace(/\/$/, "");
  return { http, ws: http.replace(/^http/, "ws") + "/api/habitat/ws", state: http + "/api/habitat/state", interact: http + "/api/habitat/interact" };
}

export function parse(data) {
  if (data === "pong") return { t: "pong" };
  try { const m = JSON.parse(data); return m && typeof m.t === "string" ? m : null; } catch (e) { return null; }
}
