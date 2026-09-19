// The Director: turns snaps, plans and events (from the live socket or the
// offline authority) into "what Trinity is doing right now". Plans are
// timestamped step lists; we interpolate walks along their path, play anim
// steps, fire say/fx steps once, and let interrupts (reactions, pushes)
// override. After an interrupt moves her, a short local walk reconciles her
// back onto the plan. Own gestures are predicted instantly and matched by nonce.
import { ZONES } from "../sim/rules.js";

const DIST = (a, b) => Math.hypot(a.i - b.i, a.j - b.j);

export class Director {
  constructor(sim, clock) {
    this.sim = sim; this.clock = clock;
    this.world = null; this.plan = null; this.interrupt = null; this.brief = null;
    this.presence = { n: 1, colors: [] }; this.recent = [];
    this.fired = new Set(); this.pending = new Map(); // nonce -> ts
    this.listeners = {}; this.recover = null; this.override = null;
    this.last = { i: ZONES.rug.i, j: ZONES.rug.j, z: 0, facing: "F" };
    this.mode = "offline";
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, d) { (this.listeners[ev] || []).forEach((f) => f(d)); }

  // --- inbound -------------------------------------------------------------
  handle(m) {
    switch (m.t) {
      case "snap":
        this.world = m.world || this.world; this.brief = m.brief ?? this.brief;
        if (m.presence) this.presence = m.presence;
        if (m.recent) this.recent = m.recent.slice(-20);
        this.setPlan(m.plan, true);
        if (m.interrupt && m.interrupt.untilMs > this.clock.now()) this.startInterrupt({ ...m.interrupt, anims: m.interrupt.anims || [] });
        this.emit("state"); break;
      case "plan": this.setPlan(m.plan); this.emit("state"); break;
      case "stat":
        if (this.world) { if (m.energy != null) this.world.energy = m.energy; if (m.mood) this.world.mood = m.mood; if (m.crowd) this.world.crowd = m.crowd; }
        this.emit("state"); break;
      case "pr": this.presence = { n: m.n, colors: m.colors || [] }; this.emit("state"); break;
      case "rx": this.emit("rx", m); break;
      case "ev": this.onEvent(m); break;
      case "err": this.emit("err", m); break;
    }
  }
  setPlan(plan, fresh) {
    if (!plan) return;
    const prev = this.plan;
    this.plan = plan;
    if (this.world && plan.activity) this.world.activity = plan.activity;
    if (!prev || prev.id !== plan.id) this.emit("plan", { plan, fresh: !!fresh });
    // Stale say steps from a plan we joined mid-way shouldn't all fire at once.
    if (fresh || !prev) for (const [k, s] of plan.steps.entries()) if ((s.kind === "say" || s.kind === "fx") && s.t0 < this.clock.now() - 4000) this.fired.add(plan.id + ":" + k);
    // If she's far from where the new plan starts, walk there first.
    const p0 = this.planPos(plan, this.clock.now());
    if (!fresh && DIST(p0, this.last) > 0.6) this.startRecover(this.last);
  }
  onEvent(m) {
    const mine = m.nonce && this.pending.has(m.nonce);
    if (mine) this.pending.delete(m.nonce);
    this.recent.push({ at: m.at, kind: m.kind, data: m.data, by: m.by });
    if (this.recent.length > 20) this.recent.shift();
    if (m.data && m.data.world && this.world) Object.assign(this.world, m.data.world);
    // Our own gestures were predicted locally; still take the server's version
    // when it escalated (shield / teleport / asleep) beyond what we predicted.
    const sk = m.reaction && m.reaction.interrupt && m.reaction.interrupt.kind;
    const escalated = mine && sk && sk !== "reaction" && sk !== (this.interrupt && this.interrupt.kind);
    if (m.reaction && (!mine || escalated)) this.applyReaction(m.reaction, m.at || this.clock.now(), m.data);
    this.emit("ev", { ...m, mine });
    this.emit("state");
  }

  // --- reactions / interrupts ---------------------------------------------
  // data.fling = {start,v} for pushes; data.toss = {i,j,item}.
  applyReaction(r, at, data = {}) {
    const now = this.clock.now();
    const it = { ...(r.interrupt || {}), anims: r.anims || [], fx: r.fx, say: r.say, start: now, gesture: r.gesture };
    if (!it.untilMs || it.untilMs < now) it.untilMs = now + 2400;
    // Pushes: replay the deterministic fling (v is already physical units).
    const f = r.fling || (data && data.fling);
    if (f && f.v) {
      const res = this.sim.physics.simulateFling({ i: f.start.i, j: f.start.j, z: f.start.z || 0 }, f.v, this.grid());
      const air = res.frames.length ? res.frames[res.frames.length - 1].t * 1000 : 0;
      it.fling = res; it.kind = "pushed"; it.flingMs = air;
      it.anims = ["fall", ...(it.anims.length ? it.anims : res.outcome === "knockdown" ? ["knockdown", "recover"] : ["land"])];
      it.untilMs = Math.max(it.untilMs, now + air + 1200);
    }
    this.startInterrupt(it);
    if (r.say) this.emit("say", { text: r.say, style: "speech", ttl: 3200 });
    if (r.fx) this.emit("fx", { fx: r.fx, at: "head" });
  }
  startInterrupt(it) {
    it.start = it.start || this.clock.now();
    it.from = { ...this.last };
    if (it.kind === "teleport" && it.pos) this.emit("fx", { fx: "fx_portal_floor_pink", at: "feet" });
    this.interrupt = it; this.recover = null;
    this.emit("state");
  }
  expect(n) { this.pending.set(n, Date.now()); for (const [k, t] of this.pending) if (Date.now() - t > 15e3) this.pending.delete(k); }

  grid() {
    const items = (this.world && this.world.items) || [];
    const key = items.join(",");
    if (this._gk !== key) { this._gk = key; this._g = this.sim.grid.buildGrid(items); }
    return this._g;
  }
  startRecover(from) {
    const to = this.planPos(this.plan, this.clock.now() + 1500);
    let path = this.sim.grid.findPath(this.grid(), from, to);
    if (!path || path.length < 2) path = [[from.i, from.j], [to.i, to.j]];
    this.recover = { t0: this.clock.now(), path, speed: 1.8 };
  }

  // --- sampling -----------------------------------------------------------
  planPos(plan, now) { return this.samplePlan(plan, now); }
  samplePlan(plan, now) {
    const w = this.world;
    // plan.from is where the plan starts (world.pos is where it ends).
    let pos = plan && plan.from ? { i: plan.from.i, j: plan.from.j } : w && w.pos ? { i: w.pos.i, j: w.pos.j } : { i: this.last.i, j: this.last.j };
    let facing = (w && w.facing) || "F";
    const out = { i: pos.i, j: pos.j, z: 0, anim: "idle", facing, loop: true, moving: false };
    if (!plan) return out;
    const steps = plan.steps;
    const firstWalk = steps.find((s) => s.kind === "walk");
    if (firstWalk && !plan.from) pos = { i: firstWalk.path[0][0], j: firstWalk.path[0][1] };
    for (let k = 0; k < steps.length; k++) {
      const s = steps[k];
      if (s.t0 > now) break;
      if (s.kind === "walk") {
        // Time-based, like brain.posAt, so we match the server exactly.
        const len = this.sim.grid.pathLength(s.path), u = Math.min(1, (now - s.t0) / Math.max(1, s.t1 - s.t0));
        const r = walkAt(s.path, len * u, this.sim.iso);
        pos = { i: r.i, j: r.j }; if (r.facing) facing = r.facing;
        if (now < s.t1) return { ...pos, z: 0, anim: s.anim === "float" ? "hover" : s.anim || "walk", facing, loop: true, moving: true, float: s.anim === "float" };
      } else if (s.kind === "anim") {
        if (s.facing) facing = s.facing;
        if (now < s.t1) return { ...pos, z: 0, anim: s.anim, facing, loop: s.loop, moving: false, step: k, fumble: s.fumble };
      } else if (s.kind === "teleport") pos = { i: s.to.i, j: s.to.j };
    }
    return { ...pos, z: 0, anim: "idle", facing, loop: true, moving: false };
  }
  fireSteps(now) {
    const p = this.plan; if (!p) return;
    p.steps.forEach((s, k) => {
      if ((s.kind !== "say" && s.kind !== "fx") || s.t0 > now) return;
      const id = p.id + ":" + k; if (this.fired.has(id)) return;
      this.fired.add(id);
      if (s.kind === "say") this.emit("say", { text: s.text, style: s.style || "speech", ttl: s.ttl || 4000 });
      else this.emit("fx", { fx: s.fx, at: s.at || "head" });
    });
    if (this.fired.size > 400) this.fired = new Set([...this.fired].slice(-100));
  }

  // What to show at `now`. Returns {i,j,z,anim,facing,loop,moving,air}.
  sample(now) {
    this.fireSteps(now);
    let out;
    const it = this.interrupt;
    if (this.override) {
      out = { ...this.override, anim: "fall", facing: this.last.facing, loop: true, moving: false, air: true };
    } else if (it && now < it.untilMs) {
      const el = now - it.start;
      let pos = it.from, anim = it.anims[0] || "surprised", air = false;
      if (it.fling && el < it.flingMs) {
        const fr = it.fling.frames, t = el / 1000;
        let a = fr[0], b = fr[fr.length - 1];
        for (let k = 1; k < fr.length; k++) if (fr[k].t >= t) { a = fr[k - 1]; b = fr[k]; break; }
        const u = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 1;
        pos = { i: a.i + (b.i - a.i) * u, j: a.j + (b.j - a.j) * u, z: a.z + (b.z - a.z) * u };
        anim = "fall"; air = true;
      } else {
        if (it.pos) pos = it.pos;
        else if (it.fling) pos = { ...it.fling.landing, z: 0 };
        const rest = it.fling ? it.anims.slice(1) : it.anims;
        const secs = this.sim.reactions.REACTION_ANIM_SEC || {};
        let tt = (el - (it.fling ? it.flingMs : 0)) / 1000, k = 0;
        while (k < rest.length - 1 && tt > (secs[rest[k]] || 1.2)) { tt -= secs[rest[k]] || 1.2; k++; }
        anim = rest[k] || "idle";
      }
      out = { i: pos.i, j: pos.j, z: pos.z || 0, anim, facing: it.kind === "asleep" ? "F" : this.last.facing, loop: true, moving: false, air, reacting: true };
    } else {
      if (it) { // interrupt just ended
        this.interrupt = null;
        const land = it.pos || (it.fling ? it.fling.landing : it.from);
        this.last = { ...this.last, i: land.i, j: land.j };
        const planP = this.samplePlan(this.plan, now);
        if (DIST(planP, land) > 0.35) this.startRecover(land);
        this.emit("state");
      }
      if (this.recover) {
        const r = this.recover, w = walkAt(r.path, ((now - r.t0) / 1000) * r.speed, this.sim.iso);
        if (!w.end) out = { i: w.i, j: w.j, z: 0, anim: "walk", facing: w.facing || this.last.facing, loop: true, moving: true };
        else this.recover = null;
      }
      if (!out) out = this.samplePlan(this.plan, now);
    }
    this.last = { i: out.i, j: out.j, z: out.z || 0, facing: out.facing };
    return out;
  }
  get status() {
    if (this.override) return "Wheee — you picked her up!";
    const it = this.interrupt;
    if (it && it.kind === "shield") return "Shield up — too many pokes!";
    if (it && it.kind === "teleport") return "Teleporting somewhere calmer…";
    if (it && it.kind === "pushed") return "Wheee—!";
    return (this.plan && this.plan.status) || "Settling in…";
  }
}

// Position `dist` tiles along a polyline path.
export function walkAt(path, dist, iso) {
  let d = Math.max(0, dist);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const facing = seg > 1e-6 ? iso.facingFromDelta(b[0] - a[0], b[1] - a[1]) : null;
    if (d <= seg || k === path.length - 1) {
      const u = seg > 0 ? Math.min(1, d / seg) : 1;
      return { i: a[0] + (b[0] - a[0]) * u, j: a[1] + (b[1] - a[1]) * u, facing, end: d >= seg && k === path.length - 1 };
    }
    d -= seg;
  }
  const e = path[path.length - 1] || [0, 0];
  return { i: e[0], j: e[1], facing: null, end: true };
}
