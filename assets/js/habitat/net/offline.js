// Offline authority: when the live world is unreachable we run the same
// shared sim locally. schedule.planAt gives every offline viewer the same
// day plan; gestures go through sim/reactions just like on the server.
import { ITEMS, CROWD } from "../sim/rules.js";

export class Offline {
  constructor(sim, director, clock, flags) {
    this.sim = sim; this.d = director; this.clock = clock; this.flags = flags;
    this.rng = sim.rng.mulberry32(flags.seed ?? ((Date.now() / 1000) | 0));
    this.world = null; this.plan = null; this.timer = 0; this.hits = []; this.sleepPokes = [];
    this.crowd = null; this.energyAdj = 0;
  }
  start() {
    this.d.mode = "offline";
    this.tick(true);
    this.timer = setInterval(() => this.tick(false), 1000);
  }
  stop() { clearInterval(this.timer); clearTimeout(this.edge); clearTimeout(this.pre); }
  // Fire the next tick right at the plan boundary: the 1 s poll alone adopted
  // the next plan up to 1 s (×clockrate) late, so it started mid-walk and she
  // snapped forward along it.
  // Plans are deterministic, so the next one is also handed to the Director
  // ahead of time (queuePlan): it switches exactly at started_at inside
  // sample(), independent of timer latency (a busy frame is 0.5–1 s of sim
  // time at ?clockrate=30).
  arm() {
    clearTimeout(this.edge); clearTimeout(this.pre);
    if (!this.plan) return;
    const rate = this.flags.rate > 0 ? this.flags.rate : 1, end = this.plan.ends_at;
    const ms = (end - this.clock.now()) / rate;
    if (ms >= 6e5) return;
    this.edge = setTimeout(() => this.tick(false), Math.max(0, ms) + 1);
    if (this.queued !== end) this.pre = setTimeout(() => {
      this.queued = end;
      try { this.d.queuePlan(this.sim.schedule.planAt(end, null).plan); } catch (e) { /* the edge tick still delivers it */ }
    }, Math.max(0, ms - 400));
  }
  items(w) {
    const f = this.flags.items;
    if (f === "all") return Object.keys(ITEMS).filter((k) => !ITEMS[k].visitor);
    if (f === "none") return [];
    if (f) return f.split(",");
    return (w && w.items) || [];
  }
  tick(first) {
    const now = this.clock.now();
    if (!first && this.plan && now < this.plan.ends_at) { this.arm(); return; }
    const { plan, world } = this.sim.schedule.planAt(now, null);
    // Keep what visitors did to her across plan boundaries.
    if (this.crowd) world.crowd = this.crowd;
    this.crowd = world.crowd;
    world.energy = Math.max(0, Math.min(100, world.energy + this.energyAdj));
    world.items = this.items(world);
    world.activity = plan.activity;
    this.world = world; this.plan = plan;
    this.d.world = world;
    this.d.handle(first ? { t: "snap", world, plan, presence: { n: 1, colors: [] }, recent: [] } : { t: "plan", plan });
    this.arm();
  }
  gesture(k, payload = {}) {
    const now = this.clock.now(), w = this.world; if (!w) return null;
    const win = (arr, sec) => { while (arr.length && arr[0] < now - sec * 1000) arr.shift(); };
    this.hits.push(now); win(this.hits, CROWD.spam.windowSec);
    if (k === "poke" && w.activity === "sleep") { this.sleepPokes.push(now); win(this.sleepPokes, CROWD.sleepWake.windowSec); }
    const ctx = { nowMs: now, visitors: 1, brief: null, unlockedItems: w.items || [], pos: { i: this.d.last.i, j: this.d.last.j }, spamCount: this.hits.length, sleepPokes: this.sleepPokes.length };
    let r;
    try { r = this.sim.reactions.selectReaction(w, k, payload, ctx, this.rng); } catch (e) { console.warn("[habitat] reaction", e); return null; }
    const c = w.crowd;
    c.annoyance = Math.max(0, Math.min(1, c.annoyance + (r.annoyDelta || 0)));
    c.affection = Math.max(0, Math.min(1, c.affection + (r.affectionDelta || 0)));
    if (r.energyDelta) { this.energyAdj += r.energyDelta; w.energy = Math.max(0, Math.min(100, w.energy + r.energyDelta)); }
    if (r.moodDelta && this.sim.brain.nudgeMood) { try { this.sim.brain.nudgeMood(w, r.moodDelta.v, r.moodDelta.a); w.mood.label = this.sim.brain.moodLabel(w); } catch (e) { /* cosmetic */ } }
    this.d.applyReaction(r, now, {});
    const kind = r.interrupt && ["shield", "teleport"].includes(r.interrupt.kind) ? r.interrupt.kind : "reaction";
    this.d.onEvent({ t: "ev", kind, at: now, by: "you", data: { gesture: k, toss: k === "toss" ? { i: payload.i, j: payload.j, item: payload.item } : undefined }, nonce: null });
    return r;
  }
}
