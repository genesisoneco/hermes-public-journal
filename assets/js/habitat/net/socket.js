// Live WebSocket with jittered backoff (1–30 s). Closes after 60 s in a
// hidden tab and reconnects when the tab comes back.
import { parse } from "./protocol.js";

export class Socket {
  constructor(url, onMsg, onStatus) {
    this.url = url; this.onMsg = onMsg; this.onStatus = onStatus || (() => {});
    this.ws = null; this.tries = 0; this.timer = 0; this.ping = 0; this.hideT = 0; this.dead = false; this.lastSeq = 0;
    this.vis = () => {
      clearTimeout(this.hideT);
      if (document.hidden) this.hideT = setTimeout(() => this.drop(), 60e3);
      else if (!this.ws && !this.dead) this.connect();
    };
    document.addEventListener("visibilitychange", this.vis);
  }
  connect() {
    if (this.dead || this.ws || document.hidden) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { return this.retry(); }
    this.ws = ws;
    ws.onopen = () => { this.tries = 0; this.onStatus("open"); this.ping = setInterval(() => this.send("ping"), 25e3); };
    ws.onmessage = (e) => {
      const m = parse(e.data); if (!m || m.t === "pong") return;
      // snap carries the current seq; everything else must be exactly +1.
      if (m.t === "snap") this.lastSeq = m.seq || 0;
      else if (m.seq != null) { if (this.lastSeq && m.seq !== this.lastSeq + 1) this.send({ t: "resync" }); this.lastSeq = m.seq; }
      this.onMsg(m);
    };
    ws.onclose = () => { clearInterval(this.ping); this.ws = null; this.onStatus("closed"); this.retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  retry() {
    if (this.dead || document.hidden) return;
    clearTimeout(this.timer);
    const base = Math.min(30e3, 1000 * 2 ** this.tries++);
    this.timer = setTimeout(() => this.connect(), base * (0.6 + Math.random() * 0.4));
  }
  drop() { clearTimeout(this.timer); if (this.ws) { this.ws.onclose = null; clearInterval(this.ping); try { this.ws.close(1000); } catch (e) {} this.ws = null; this.onStatus("closed"); } }
  send(m) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const s = typeof m === "string" ? m : JSON.stringify(m);
    if (s.length > 512) return false;
    this.ws.send(s); return true;
  }
  get open() { return !!this.ws && this.ws.readyState === 1; }
  destroy() { this.dead = true; this.drop(); clearTimeout(this.hideT); document.removeEventListener("visibilitychange", this.vis); }
}
