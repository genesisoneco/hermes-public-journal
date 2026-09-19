// Frame animator + facing resolver + the procedural springs that make 4–6
// frame anims feel smooth. Works with or without an atlas.
//
// Smoothing (see CONTRACT §4 "s"):
//  - anims with an `s` block play the in-between sequence s.f at s.fps once
//    every page it touches is loaded; otherwise the source f/fps plays with a
//    short crossfade into the next frame at the end of each frame (also used
//    for held frames inside a smooth sequence).
//  - switching source ⇄ smooth mid-loop keeps the normalised cycle phase.
//  - frame events (ev) fire by phase, so they land identically in both.
//  - changing anim crossfades the outgoing frame into the incoming one.

const NOMINAL = { idle: 2.4, walk: 0.6, run: 0.42, sleep: 3.2, charging: 2, dance: 0.8, spin: 0.7, hack: 1.2, scan: 1.6, listen: 2.2, sit: 0.5, turn: 0.25, jump: 0.5, land: 0.35, fall: 0.6, knockdown: 0.7, recover: 0.8, teleport_in: 0.9, teleport_out: 0.9 };
// Non-looping anims that should hold their last frame rather than repeat.
export const HOLD = new Set(["sit", "knockdown", "teleport_out", "land", "wake_up", "die", "fall", "low_battery"]);
const FACE_FAMS = new Set(["idle", "walk", "run"]);
const XF_FRAC = 0.4, XF_MAX = 0.09; // source-frame crossfade: last 40% of a frame, ≤ 90 ms
const XF_HOLD_FRAC = 0.5, XF_HOLD_MAX = 0.12; // held run inside a smooth sequence (RIFE rejected there): ≤ 120 ms
export const TRANS_SEC = 0.12;      // anim → anim crossfade

export const family = (k) => k.replace(/_[FBLR]$/, "");
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class Animator {
  constructor(atlas) {
    this.atlas = atlas || null; this.key = "idle_F"; this.t = 0; this.idx = 0; this.loop = true; this.hold = false; this.done = false;
    this.phase = 0; this.rate = 1; this.smoothOK = true; this.xfade = true; this.useSmooth = false;
    this.tr = null; // {from: frame record, t}
  }
  setAtlas(a) { this.atlas = a; }
  // Resolve family + facing to an existing anim key (contract: nearest facing).
  resolve(name, facing) {
    const fam = family(name);
    let key = FACE_FAMS.has(fam) || /_[FBLR]$/.test(name) ? `${fam}_${facing || name.slice(-1)}` : name;
    if (!this.atlas) return key;
    const A = this.atlas.anims;
    if (A[key]) return key;
    const order = { F: "FRLB", B: "BRLF", L: "LFBR", R: "RFBL" }[facing] || "FRLB";
    for (const f of order) if (A[`${fam}_${f}`]) return `${fam}_${f}`;
    return A[fam] ? fam : A[name] ? name : "idle_F";
  }
  // Is the smooth sequence of anim `a` drawable right now? (every page loaded)
  smoothReady(a) {
    const s = a && a.s;
    if (!s || !this.smoothOK || !s.f || !s.f.length) return false;
    const P = this.atlas.pages, F = this.atlas.frames;
    if (!a._sp) { const ps = new Set(); for (const n of s.f) { const fr = F[n]; if (!fr) { a._sp = false; return false; } ps.add(fr.p); } a._sp = [...ps]; }
    if (!a._sp) return false;
    for (const p of a._sp) if (!P[p]) return false;
    return true;
  }
  // Page this anim wants for its smooth sequence (to lazy-load), if any.
  smoothPage(key = this.key) { const a = this.atlas && this.atlas.anims[key]; return a && a.s && this.smoothOK ? a.s.p : null; }
  info(key = this.key) {
    const a = this.atlas && this.atlas.anims[key];
    if (a) {
      if (this.smoothReady(a)) { const n = a.s.f.length; return { n, total: n / (a.s.fps || 20), a, f: a.s.f, d: null, smooth: true }; }
      const n = a.f.length, d = a.d || null;
      const total = d ? d.reduce((s, v) => s + v, 0) / 1000 : n / (a.fps || 8);
      return { n, total, a, f: a.f, d, smooth: false };
    }
    return { n: 1, total: NOMINAL[family(key)] || 1, a: null, f: null, d: null, smooth: false };
  }
  play(key, opts = {}) {
    if (key === this.key && !opts.restart) { this.loop = opts.loop ?? this.loop; return; }
    // Anim change: remember what was on screen so draw() can crossfade out of it.
    const out = this.xfade && opts.fade !== false ? this.frame() : null;
    this.tr = out && out.blend !== "lighter" ? { from: out, t: 0 } : null;
    this.key = key; this.t = 0; this.idx = -1; this.done = false; this._evPh = -1;
    this.loop = opts.loop ?? !HOLD.has(family(key));
    this.hold = !this.loop;
  }
  // Returns frame events (e.g. "step") crossed this tick. `rate` scales
  // playback (walk/run cycle synced to ground speed).
  update(dt, rate = 1) {
    const inf = this.info(), { n, total, a } = inf;
    const ev = [];
    if (this.tr) { this.tr.t += dt; if (this.tr.t >= TRANS_SEC) this.tr = null; }
    // Source ⇄ smooth switch: keep the normalised phase so nothing pops.
    if (inf.smooth !== this.useSmooth) {
      if (this._total) this.t = (this.t / this._total) * total;
      this.useSmooth = inf.smooth; this.idx = -1;
    }
    this._total = total; this.rate = rate;
    const prevPh = this.phase, prevLoops = Math.floor(this.t / total);
    this.t += dt * rate;
    let tt = this.t;
    if (tt >= total) { if (this.loop) tt %= total; else { tt = total - 1e-6; this.done = true; } }
    this.phase = total ? tt / total : 0;
    this.tt = tt; this.total = total;
    let idx = 0;
    if (inf.d) { let acc = 0; for (idx = 0; idx < n - 1; idx++) { acc += inf.d[idx] / 1000; if (tt < acc) break; } }
    else idx = Math.min(n - 1, Math.floor(this.phase * n));
    this.idx = idx;
    // Events by phase (ev keys are source-frame indices).
    if (a && a.ev) {
      const wrapped = this.loop && Math.floor(this.t / total) !== prevLoops;
      const first = this._evPh === -1; this._evPh = 0;
      for (const k in a.ev) {
        const ph = evPhase(a, +k);
        const hit = first ? ph === 0 : wrapped ? ph > prevPh || ph <= this.phase : ph > prevPh && ph <= this.phase;
        if (hit) ev.push(a.ev[k]);
      }
    }
    if (!a && family(this.key) !== "idle") { // placeholder step events at half cycles
      const half = Math.floor(this.t / (total / 2));
      if (half !== this._half) { this._half = half; if (/^(walk|run)/.test(this.key)) ev.push("step"); }
    }
    return ev;
  }
  // Current atlas frame record or null (placeholder).
  frame() {
    const a = this.atlas && this.atlas.anims[this.key];
    if (!a) return null;
    const f = this.useSmooth && this.smoothReady(a) ? a.s.f : a.f;
    const name = f[Math.max(0, Math.min(f.length - 1, this.idx))];
    const fr = this.atlas.frames[name];
    return fr ? { fr, flip: !!a.flip, blend: a.blend } : null;
  }
  // What to draw: the main frame, plus an optional second frame `b` drawn at
  // weight `k` (crossfade into the next source frame, or out of the previous
  // anim during a transition — then `a` is the outgoing frame fading out).
  frames() {
    const cur = this.frame();
    if (!cur) return null;
    if (this.tr && this.tr.from && this.tr.from.fr !== cur.fr) return { a: this.tr.from, b: cur, k: smooth01(this.tr.t / TRANS_SEC), trans: true };
    const a = this.atlas.anims[this.key];
    if (!this.xfade || cur.blend === "lighter" || !a) return { a: cur, b: null, k: 0 };
    // Where are we inside the current run of identical frames? Source frames
    // are each a run; in a smooth sequence only held frames (the interpolator
    // repeats a source frame where it couldn't make in-betweens) get a crossfade.
    const seq = this.useSmooth ? a.s.f : a.f, n = seq.length, idx = Math.max(0, Math.min(n - 1, this.idx));
    if (n < 2) return { a: cur, b: null, k: 0 };
    let fs, fd, nx;
    if (a.d && !this.useSmooth) { fs = 0; for (let k = 0; k < idx; k++) fs += a.d[k] / 1000; fd = a.d[idx] / 1000; nx = idx + 1; }
    else {
      let r0 = idx, r1 = idx + 1;
      while (r0 > 0 && seq[r0 - 1] === seq[idx]) r0--;
      while (r1 < n && seq[r1] === seq[idx]) r1++;
      if (this.useSmooth && r1 - r0 < 2) return { a: cur, b: null, k: 0 };
      const f1 = this.total / n; fs = r0 * f1; fd = (r1 - r0) * f1; nx = r1;
    }
    if (nx >= n) nx = this.loop ? 0 : -1;
    if (nx < 0 || !(fd > 0)) return { a: cur, b: null, k: 0 };
    const win = this.useSmooth ? Math.min(fd * XF_HOLD_FRAC, XF_HOLD_MAX * (this.rate || 1)) : Math.min(fd * XF_FRAC, XF_MAX * (this.rate || 1)), into = (this.tt || 0) - fs;
    const k = smooth01((into - (fd - win)) / win);
    if (k <= 0) return { a: cur, b: null, k: 0 };
    const nf = this.atlas.frames[seq[nx]];
    if (!nf || nf === cur.fr) return { a: cur, b: null, k: 0 };
    return { a: cur, b: { fr: nf, flip: !!a.flip, blend: a.blend }, k };
  }
}

// Normalised phase at which source frame k starts.
function evPhase(a, k) {
  if (a.d) { let s = 0, tot = 0; for (let q = 0; q < a.d.length; q++) { if (q < k) s += a.d[q]; tot += a.d[q]; } return tot ? s / tot : 0; }
  return k / a.f.length;
}

// Facing with hysteresis: a new facing must persist 120 ms before it sticks;
// flipping to the opposite side plays a short "turn".
export class Facing {
  constructor(f = "F") { this.f = f; this.cand = f; this.ct = 0; this.turnT = 0; }
  update(want, dt) {
    if (!want || want === this.f) { this.cand = this.f; this.ct = 0; }
    else if (want === this.cand) {
      this.ct += dt;
      if (this.ct > 0.12) {
        const opp = { F: "B", B: "F", L: "R", R: "L" }[this.f] === want;
        this.f = want; this.ct = 0; if (opp) this.turnT = 0.22;
      }
    } else { this.cand = want; this.ct = 0; }
    if (this.turnT > 0) this.turnT -= dt;
    return this.f;
  }
  // Starting to walk from a standstill: face the path at once (no 120 ms walk-the-wrong-way).
  set(f) { if (f) { this.f = this.cand = f; this.ct = 0; } }
  get turning() { return this.turnT > 0; }
}

// Critically-damped-ish spring.
export class Spring {
  constructor(v = 0, k = 180, d = 14) { this.v = v; this.x = v; this.vel = 0; this.k = k; this.d = d; }
  step(target, dt) { const a = this.k * (target - this.x) - this.d * this.vel; this.vel += a * dt; this.x += this.vel * dt; return this.x; }
  kick(v) { this.vel += v; }
}
