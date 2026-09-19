// The Director: turns snaps, plans and events (from the live socket or the
// offline authority) into "what Trinity is doing right now". Plans are
// timestamped step lists; we interpolate walks along their path, play anim
// steps, fire say/fx steps once, and let interrupts (reactions, pushes)
// override. After an interrupt moves her, a short local walk reconciles her
// back onto the plan. Own gestures are predicted instantly and matched by nonce.
import { ZONES, WORLD } from "../sim/rules.js";

const DIST = (a, b) => Math.hypot(a.i - b.i, a.j - b.j);
// Walk easing (ms): accelerate out of a standstill, decelerate into the stop.
// Pure function of the step's t0..t1, so every viewer sees the same motion;
// it only reshapes speed along the path, the endpoints and t1 don't move.
const EASE_IN = 150, EASE_OUT = 220;
// Discontinuities (late plan, interrupt landing, resync) blend over this long.
const BLEND_MS = 150, BLEND_MAX = 1.2;
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class Director {
  constructor(sim, clock) {
    this.sim = sim; this.clock = clock;
    this.world = null; this.plan = null; this.interrupt = null; this.brief = null;
    this.presence = { n: 1, colors: [] }; this.recent = [];
    this.fired = new Set(); this.pending = new Map(); // nonce -> ts
    this.listeners = {}; this.recover = null; this.override = null;
    this.last = { i: ZONES.rug.i, j: ZONES.rug.j, z: 0, facing: "F" };
    this.mode = "offline";
    this.vis = null; this._src = null; this._raw = null; this._now = null; this._rt = null; this._rate = 1;
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
    // If she's far from where the new plan is now, walk there first — but only
    // when the plan really arrived late (real time). Adopted on time, the gap is
    // just this frame's share of the plan's own walk (up to a tile per frame at
    // ?clockrate=30), and a catch-up walk there overshot and then snapped.
    const now = this.clock.now(), p0 = this.planPos(plan, now);
    const lateReal = plan.started_at != null ? (now - plan.started_at) / Math.max(1, this._rate || 1) : Infinity;
    if (!fresh && lateReal > 60 && DIST(p0, this.last) > 0.6) this.startRecover(this.last);
  }
  // A plan known ahead of time (offline: deterministic schedule); adopted in
  // sample() exactly when it starts.
  queuePlan(plan) { if (plan && (!this.plan || plan.id !== this.plan.id)) this.nextPlan = plan; }
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
  // Walk from `from` back onto the plan. Aim where the plan will BE when she
  // arrives (iterate on the ETA): a fixed now+1.5 s target fell behind a plan
  // that was itself walking, and she snapped ~2.6 tiles forward at the end.
  startRecover(from, depth = 0) {
    const now = this.clock.now(), speed = 1.8;
    let eta = 1500, path, len = 0;
    for (let k = 0; k < 4; k++) {
      const to = this.planPos(this.plan, now + eta);
      path = this.sim.grid.findPath(this.grid(), from, to);
      if (!path || path.length < 2) path = [[from.i, from.j], [to.i, to.j]];
      len = this.sim.grid.pathLength(path);
      const e2 = (len / speed) * 1000 + 50;
      if (Math.abs(e2 - eta) < 60) break;
      eta = e2;
    }
    this.recover = { t0: now, path, speed, len, depth };
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
        // Time-based like brain.posAt (same t0, t1 and endpoints as the server),
        // with eased speed at a standstill start/stop.
        const len = this.sim.grid.pathLength(s.path), T = Math.max(1, s.t1 - s.t0);
        const pw = prevMove(steps, k), nw = nextMove(steps, k);
        const d = len * easedU(now - s.t0, T, !(pw && pw.t1 >= s.t0), !(nw && nw.t0 <= s.t1));
        const r = walkAt(s.path, d, this.sim.iso);
        pos = { i: r.i, j: r.j }; if (r.facing) facing = r.facing;
        if (now < s.t1) facing = lookFacing(s.path, d, len, this.last.facing, this.sim.iso) || facing;
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
    const nx = this.nextPlan;
    if (nx && now >= nx.started_at) {
      this.nextPlan = null;
      if (this.mode === "offline" && (!this.plan || (nx.id !== this.plan.id && nx.started_at >= this.plan.started_at))) { this.setPlan(nx); this.emit("state"); }
    }
    this.fireSteps(now);
    let out, src = "o";
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
      src = "i" + it.start;
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
        const r = this.recover, T = (r.len / r.speed) * 1000, el = now - r.t0;
        if (el < T) {
          const d = r.len * easedU(el, T, true, true), w = walkAt(r.path, d, this.sim.iso);
          out = { i: w.i, j: w.j, z: 0, anim: "walk", facing: lookFacing(r.path, d, r.len, this.last.facing, this.sim.iso) || w.facing || this.last.facing, loop: true, moving: true };
          src = "r" + r.t0;
        } else {
          // Still off the plan (it kept moving)? Chase again rather than snap; the blend covers small gaps.
          const end = r.path[r.path.length - 1], planP = this.samplePlan(this.plan, now);
          this.recover = null;
          if (r.depth < 3 && DIST(planP, { i: end[0], j: end[1] }) > 0.35) { this.startRecover({ i: end[0], j: end[1] }, r.depth + 1); return this.sample(now); }
        }
      }
      if (!out) { out = this.samplePlan(this.plan, now); src = "p" + (this.plan && this.plan.id); }
    }
    this.smoothJump(out, src, now);
    this.last = { i: out.i, j: out.j, z: out.z || 0, facing: out.facing };
    return out;
  }
  // Visual continuity: when the source of her position changes (a plan that
  // arrived late and starts mid-walk, an interrupt landing, a resync) or the
  // raw position jumps within one frame, keep showing where she was and ease
  // the offset out over BLEND_MS instead of snapping. Only the rendered
  // position is offset; the plan/timeline stays exactly the shared one.
  smoothJump(out, src, now) {
    const rt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const raw = { i: out.i, j: out.j };
    // Sim-time per real ms (?clockrate); the blend is real-time, so shrink it on fast clocks.
    const simDt = this._now != null ? Math.max(0, now - this._now) : 0, realDt = this._rt != null ? rt - this._rt : 0;
    if (realDt > 0 && simDt > 0) this._rate = simDt / realDt;
    if (this._raw && src !== "o" && !out.air && !(this.interrupt && this.interrupt.kind === "teleport")) {
      const step = DIST(raw, this._raw), shown = this.last, d = DIST(raw, shown);
      // Same source: only a step no locomotion (≤ 3 tiles/s) could cover in this much sim time.
      const jumped = src !== this._src ? d > 0.02 : step > 3 * (simDt / 1000) * 1.5 + 0.05;
      if (jumped && d < BLEND_MAX) this.vis = { di: shown.i - raw.i, dj: shown.j - raw.j, t0: rt, ms: BLEND_MS / Math.max(1, this._rate || 1) };
    } else this.vis = null;
    this._raw = raw; this._src = src; this._now = now; this._rt = rt;
    if (this.vis) {
      const w = 1 - smooth01((rt - this.vis.t0) / this.vis.ms);
      if (w <= 0) this.vis = null;
      else { out.i += this.vis.di * w; out.j += this.vis.dj * w; }
    }
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

// Trapezoidal speed profile over a walk of duration T (ms): ramp up over
// EASE_IN, down over EASE_OUT (each ≤ T/3), constant in between. Returns the
// fraction of the path covered at `el` ms; 0 at el=0 and exactly 1 at el=T.
export function easedU(el, T, easeIn = true, easeOut = true) {
  if (el <= 0) return 0;
  if (el >= T) return 1;
  const a = easeIn ? Math.min(EASE_IN, T / 3) : 0, b = easeOut ? Math.min(EASE_OUT, T / 3) : 0;
  const L = T - a / 2 - b / 2; // path length in "cruise-speed ms"
  if (el < a) return (el * el) / (2 * a) / L;
  if (el <= T - b) return (el - a / 2) / L;
  const r = T - el;
  return 1 - (r * r) / (2 * b) / L;
}
const MOVE = (s) => s.kind !== "say" && s.kind !== "fx";
function prevMove(steps, k) { for (let q = k - 1; q >= 0; q--) if (MOVE(steps[q])) return steps[q].kind === "walk" ? steps[q] : null; return null; }
function nextMove(steps, k) { for (let q = k + 1; q < steps.length; q++) if (MOVE(steps[q])) return steps[q].kind === "walk" ? steps[q] : null; return null; }

// Facing from the direction ~0.6 tiles ahead on the path (not the current
// grid segment), with angular hysteresis around the side/front boundary so
// zig-zag paths that run near-vertical on screen don't flip L/R ⇄ F/B.
export function lookFacing(path, d, len, prev, iso) {
  const a = walkAt(path, d, iso), b = walkAt(path, Math.min(len, d + 0.6), iso);
  let di = b.i - a.i, dj = b.j - a.j;
  if (Math.hypot(di, dj) < 0.05) { const p = path[path.length - 2], q = path[path.length - 1]; if (!p) return null; di = q[0] - p[0]; dj = q[1] - p[1]; }
  const dx = (di - dj) * WORLD.tileW, dy = (di + dj) * WORLD.tileH;
  if (!dx && !dy) return null;
  const side = prev === "L" || prev === "R", lim = side ? 0.95 : 1.5; // stock threshold is 1.2
  if (Math.abs(dx) > lim * Math.abs(dy)) return dx > 0 ? "R" : "L";
  return dy > 0 ? "F" : "B";
}
