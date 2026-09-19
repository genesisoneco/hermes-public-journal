// Frame animator + facing resolver + the procedural springs that make 4–6
// frame anims feel smooth. Works with or without an atlas.

const NOMINAL = { idle: 2.4, walk: 0.6, run: 0.42, sleep: 3.2, charging: 2, dance: 0.8, spin: 0.7, hack: 1.2, scan: 1.6, listen: 2.2, sit: 0.5, turn: 0.25, jump: 0.5, land: 0.35, fall: 0.6, knockdown: 0.7, recover: 0.8, teleport_in: 0.9, teleport_out: 0.9 };
// Non-looping anims that should hold their last frame rather than repeat.
export const HOLD = new Set(["sit", "knockdown", "teleport_out", "land", "wake_up", "die", "fall", "low_battery"]);
const FACE_FAMS = new Set(["idle", "walk", "run"]);

export const family = (k) => k.replace(/_[FBLR]$/, "");

export class Animator {
  constructor(atlas) { this.atlas = atlas || null; this.key = "idle_F"; this.t = 0; this.idx = 0; this.loop = true; this.hold = false; this.done = false; }
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
  info(key = this.key) {
    const a = this.atlas && this.atlas.anims[key];
    if (a) {
      const n = a.f.length, d = a.d || null;
      const total = d ? d.reduce((s, v) => s + v, 0) / 1000 : n / (a.fps || 8);
      return { n, total, a };
    }
    return { n: 1, total: NOMINAL[family(key)] || 1, a: null };
  }
  play(key, opts = {}) {
    if (key === this.key && !opts.restart) { this.loop = opts.loop ?? this.loop; return; }
    this.key = key; this.t = 0; this.idx = -1; this.done = false;
    this.loop = opts.loop ?? !HOLD.has(family(key));
    this.hold = !this.loop;
  }
  // Returns frame events (e.g. "step") crossed this tick.
  update(dt) {
    const { n, total, a } = this.info();
    const ev = [];
    this.t += dt;
    let tt = this.t;
    if (tt >= total) { if (this.loop) tt %= total; else { tt = total - 1e-6; this.done = true; } }
    this.phase = total ? tt / total : 0;
    let idx = 0;
    if (a && a.d) { let acc = 0; for (idx = 0; idx < n - 1; idx++) { acc += a.d[idx] / 1000; if (tt < acc) break; } }
    else idx = Math.min(n - 1, Math.floor(this.phase * n));
    if (idx !== this.idx) {
      if (a && a.ev && a.ev[idx] != null) ev.push(a.ev[idx]);
      this.idx = idx;
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
    const name = a.f[Math.max(0, this.idx)];
    const fr = this.atlas.frames[name];
    return fr ? { fr, flip: !!a.flip, blend: a.blend } : null;
  }
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
  get turning() { return this.turnT > 0; }
}

// Critically-damped-ish spring.
export class Spring {
  constructor(v = 0, k = 180, d = 14) { this.v = v; this.x = v; this.vel = 0; this.k = k; this.d = d; }
  step(target, dt) { const a = this.k * (target - this.x) - this.d * this.vel; this.vel += a * dt; this.x += this.vel * dt; return this.x; }
  kick(v) { this.vel += v; }
}
