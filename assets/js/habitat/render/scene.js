// Scene: canvas sizing, camera, depth-sorted drawing of the baked room,
// Trinity, dropped items and particles. Design space is 1600x900 (CONTRACT §1).
import { bakeRoom, drawLive, drawTop, ROOM_BOUNDS, P } from "./room.js";
import { Animator, Facing, Spring, family } from "./animator.js";
import { drawPlaceholder, drawFrame, drawBlend } from "./trinity.js";
import { Particles } from "./particles.js";
import { hitFrame } from "./loader.js";

const T_SCALE_ATLAS = 0.8, T_SCALE_PH = 0.86, HEAD = 104; // design px feet→head (bubble anchor)
// Ground speed (tiles/s) each locomotion cycle was drawn for: playback rate
// follows the actual speed so the feet don't slide (clamped 0.6–1.6×).
const CYCLE_SPEED = { walk: 1.6, run: 2.6, carry: 1.6 }, STEP_BOB = 2.5, STEP_BOB_SEC = 0.22;
const AMBIENT = { sleep: ["z", 1.3], charging: ["spark", 0.45], dance: ["note", 0.7], listen: ["note", 1.1], victory: ["fx_sparkle_small", 0.9], love: ["fx_heart_small", 0.8], low_battery: ["fx_smoke_small", 2.5] };

export class Scene {
  constructor(canvas, opts) {
    this.cv = canvas; this.c = canvas.getContext("2d");
    this.mode = opts.mode; this.reduced = !!opts.reduced;
    this.dprCap = 2; this.degraded = 0;
    this.atlas = null; this.anim = new Animator(null); this.face = new Facing("F");
    this.anim.xfade = this.anim.smoothOK = !this.reduced;
    this.gspd = 0; this.stepT = 1; this.rate = 1; this.smoothArmed = false;
    this.sq = new Spring(1, 260, 16); this.lean = new Spring(0, 120, 16);
    this.parts = new Particles(); this.parts.enabled = !this.reduced;
    this.items = []; this.room = null; this.roomKey = ""; this.tod = "afternoon"; this.unlocked = [];
    this.actor = { i: 5.5, j: 5.5, z: 0, x: 0, y: 0, alpha: 1, anim: "idle_F" };
    this.cam = { x: 800, y: 480, zoom: 1, vw: 1600, vh: 900, init: false };
    this.amb = 0; this.t = 0; this.ft = []; this.fps = 0;
  }
  setAtlas(a) { this.atlas = a; this.anim.setAtlas(a); }
  get pages() { return (this.atlas && this.atlas.pages) || {}; }
  // Device px per @1x atlas px for Trinity right now (picks the in-between page resolution).
  spriteScale() { return this.cam.zoom * (this.dpr || 1) * T_SCALE_ATLAS; }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    const B = ROOM_BOUNDS, bw = B.x1 - B.x0, bh = B.y1 - B.y0, asp = w / h;
    let vw;
    if (this.mode === "full" || this.reduced) vw = Math.max(bw, bh * asp) * 1.0; // contain the whole room
    else vw = asp >= 1.6 ? 1450 : Math.min(bw, 820 * Math.max(1, asp)); // cover-crop, follow Trinity
    if (this.mode === "full" && asp < 1.2 && !this.reduced) vw = 900 * Math.max(0.9, asp); // portrait: follow like the embed
    this.follows = !this.reduced && (this.mode !== "full" || asp < 1.2);
    this.cam.zoom = w / vw; this.cam.vw = vw; this.cam.vh = h / this.cam.zoom;
    this.roomKey = ""; this.cam.init = false;
  }
  setRoom(tod, items) {
    this.tod = tod; this.unlocked = items;
    const key = tod + "|" + items.join(",") + "|" + this.cam.zoom.toFixed(4) + "|" + this.dpr;
    if (key === this.roomKey) return false;
    this.roomKey = key;
    this.room = bakeRoom({ scale: this.cam.zoom * this.dpr, tod, items });
    return true;
  }

  // --- camera -------------------------------------------------------------
  follow(dt, snap) {
    const cam = this.cam, B = ROOM_BOUNDS;
    let tx = cam.x, ty = cam.y;
    if (!this.follows) { tx = (B.x0 + B.x1) / 2; ty = (B.y0 + B.y1) / 2 + 10; }
    else {
      // Prefer a fixed framing of the floor; only slide when Trinity (feet +
      // ~15% margin, head + bubble room) would leave it.
      const a = this.actor, hw = cam.vw / 2, hh = cam.vh / 2;
      tx = 800; ty = cam.vh / cam.vw > 0.6 ? 540 : 500;
      // Top margin: head (~110) + room for the HUD status pill (~72 css px).
      const l = a.x - 90, r = a.x + 90, t = a.y - 130 - 72 / cam.zoom, b = a.y + cam.vh * 0.15;
      if (r > tx + hw) tx = r - hw; if (l < tx - hw) tx = l + hw;
      if (b > ty + hh) ty = b - hh; if (t < ty - hh) ty = t + hh;
    }
    // Clamp to room bounds (centre if the view is larger than the room).
    const hx = cam.vw / 2, hy = cam.vh / 2;
    tx = B.x1 - B.x0 <= cam.vw ? (B.x0 + B.x1) / 2 : Math.max(B.x0 + hx, Math.min(B.x1 - hx, tx));
    ty = B.y1 - B.y0 <= cam.vh ? (B.y0 + B.y1) / 2 : Math.max(B.y0 + hy, Math.min(B.y1 - hy, ty));
    // Rest exactly on the device-pixel grid (crisp baked room), but move with
    // sub-pixel offsets: a whole-pixel camera stepped the entire scene in
    // 1 px jumps, which reads as Trinity stuttering even when she's smooth.
    const s = cam.zoom * (this.dpr || 1);
    tx = Math.round((tx - cam.vw / 2) * s) / s + cam.vw / 2; ty = Math.round((ty - cam.vh / 2) * s) / s + cam.vh / 2;
    if (snap || !cam.init) { cam.x = tx; cam.y = ty; cam.vx = cam.vy = 0; cam.init = true; return; }
    // Critically damped spring: eases in when she crosses the framing margin
    // and eases out when she stops (no velocity steps, never a snap).
    const w = 4.5, h = Math.min(dt, 0.05);
    for (const [p, v, t] of [["x", "vx", tx], ["y", "vy", ty]]) {
      const a = w * w * (t - cam[p]) - 2 * w * (cam[v] || 0);
      cam[v] = (cam[v] || 0) + a * h; cam[p] += cam[v] * h;
      if (Math.abs(t - cam[p]) * s < 0.02 && Math.abs(cam[v]) * s < 0.5) { cam[p] = t; cam[v] = 0; }
    }
  }
  // design → css px
  toCss(x, y) { const c = this.cam; return { x: (x - (c.x - c.vw / 2)) * c.zoom, y: (y - (c.y - c.vh / 2)) * c.zoom }; }
  toDesign(cx, cy) { const c = this.cam; return { x: cx / c.zoom + c.x - c.vw / 2, y: cy / c.zoom + c.y - c.vh / 2 }; }

  // --- actor --------------------------------------------------------------
  updateActor(s, dt) {
    const a = this.actor, px = a.x;
    a.i = s.i; a.j = s.j; a.z = (s.z || 0) + (s.float ? 14 + Math.sin(this.t * 3) * 4 : 0);
    const [x, y] = P(s.i, s.j, a.z); a.x = x; a.y = y;
    const wasAir = a.air; a.air = !!s.air || a.z > 1;
    // She "steps out" through the portal pad by the front-right edge.
    const out = s.i > 9.5;
    a.alpha = out ? Math.max(0, 1 - (s.i - 9.5) / 0.45) : 1;
    if (out !== !!a.out && Math.abs(s.j - 7) < 1.2) this.parts.emit("fx_portal_floor_pink", ...P(9.25, 7, 0), this.atlas);
    a.out = out;
    if (s.moving && !this._moving) this.face.set(s.facing);
    this._moving = !!s.moving;
    const f = this.face.update(s.facing, dt);
    let key;
    if (this.face.turning && s.moving && this.atlas && this.atlas.anims.turn) key = "turn";
    else key = this.anim.resolve(s.anim, f);
    this.anim.play(key, { loop: s.loop !== false || undefined });
    // Actual ground speed (smoothed) → locomotion playback rate.
    if (dt > 0) {
      const inst = Math.hypot(s.i - (this._pi ?? s.i), s.j - (this._pj ?? s.j)) / dt;
      this.gspd += (Math.min(inst, 8) - this.gspd) * (1 - Math.exp(-dt / 0.08));
    }
    this._pi = s.i; this._pj = s.j;
    const cyc = CYCLE_SPEED[family(key)];
    this.rate = cyc && s.moving ? Math.max(0.6, Math.min(1.6, this.gspd / cyc)) : 1;
    // Smooth in-betweens for ext anims: fetch their page the first time one plays.
    if (this.smoothArmed && this.atlas && this.atlas.need) { const sp = this.anim.smoothPage(); if (sp && !this.pages[sp]) this.atlas.need(sp); }
    for (const ev of this.anim.update(dt, this.rate)) {
      if (ev === "step") { this.sq.kick(-0.5); this.stepT = 0; }
      if (ev === "step" && s.anim === "run") this.fx("fx_dust", "feet");
    }
    this.stepT += dt;
    if (wasAir && !a.air) { this.sq.kick(-4); this.fx("fx_dust", "feet"); }
    const vx = dt > 0 ? (a.x - px) / dt : 0;
    this.lean.step(s.moving ? Math.max(-0.1, Math.min(0.1, vx * 0.0012)) : 0, dt);
    this.sq.step(1, dt);
    a.anim = key; a.fam = family(s.anim);
    // Ambient particles.
    const am = AMBIENT[a.fam];
    if (am && !this.reduced) { this.amb -= dt; if (this.amb <= 0) { this.amb = am[1] * (0.7 + Math.random() * 0.6); this.fx(am[0], am[0] === "spark" ? "body" : "head"); } }
  }
  headPos() { const a = this.actor; return { x: a.x, y: a.y - HEAD * (this.atlas ? 1 : 1) }; }
  fx(name, at = "head") {
    const a = this.actor;
    let x = a.x, y = a.y - (at === "feet" ? 0 : at === "body" ? 40 : HEAD + 6);
    if (at && typeof at === "object") [x, y] = P(at.i, at.j, 0);
    if (name === "z") { x += 18; y += 10; }
    // Hearts pop out beside her head so the speech bubble never hides them.
    if (/heart/.test(name) && at === "head") { x += (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 14); y += 36; }
    this.parts.emit(name, x + (Math.random() - 0.5) * 12, y, this.atlas);
  }

  // Items dropped/tossed into the room: {item, i, j, z, vz, life}
  addItem(it) { this.items.push({ z: 180, vz: 0, t: 0, life: 6, ...it }); if (this.items.length > 6) this.items.shift(); }
  updateItems(dt) {
    for (const it of this.items) {
      it.t += dt; it.vz -= 900 * dt; it.z += it.vz * dt;
      if (it.z <= 0) { it.z = 0; if (Math.abs(it.vz) > 120) { it.vz = -it.vz * 0.4; this.parts.emit("fx_dust", ...P(it.i, it.j, 0)); } else it.vz = 0; }
      if (it.to && it.t > 0.5) { const k = Math.min(1, (it.t - 0.5) * 3); it.i += (it.to.i - it.i) * k; it.j += (it.to.j - it.j) * k; if (k >= 1) it.life = 0; }
    }
    this.items = this.items.filter((it) => it.t < it.life);
  }

  // --- drawing ------------------------------------------------------------
  render(now, dt, sample, live) {
    const t0 = performance.now();
    this.t += dt;
    if (sample) this.updateActor(sample, dt);
    this.updateItems(dt);
    this.parts.update(dt);
    this.follow(dt, this.reduced);
    const c = this.c, cam = this.cam, s = cam.zoom * this.dpr;
    // Sub-pixel while the camera moves; integral at rest (follow() settles on the pixel grid).
    let ox = (cam.x - cam.vw / 2) * s, oy = (cam.y - cam.vh / 2) * s;
    if (Math.abs(ox - Math.round(ox)) < 1e-3) ox = Math.round(ox); if (Math.abs(oy - Math.round(oy)) < 1e-3) oy = Math.round(oy);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!this.room) return;
    const blit = (img) => c.drawImage(img.canvas, Math.round(img.x * s) - ox, Math.round(img.y * s) - oy);
    blit(this.room.back);
    c.setTransform(s, 0, 0, s, -ox, -oy);
    drawLive(c, this.t, this.room, live || {});

    // Depth-sorted props + entities.
    const list = this.room.props.map((p) => ({ p, key: (p.rect[0] + p.rect[2] + p.rect[1] + p.rect[3]) / 2 }));
    list.sort((a, b) => a.key - b.key);
    const ents = [{ e: "trinity", i: this.actor.i, j: this.actor.j }, ...this.items.map((it) => ({ e: "item", it, i: it.i, j: it.j }))];
    ents.sort((a, b) => a.i + a.j - (b.i + b.j));
    const order = list.slice();
    for (const en of ents) {
      let at = 0;
      for (let k = 0; k < order.length; k++) if (order[k].p && inFront(en, order[k].p.rect)) at = k + 1;
      order.splice(at, 0, en);
    }
    // Shadows first (on the floor, under everything standing).
    this.drawShadow(this.actor.i, this.actor.j, this.actor.z, 1, this.actor.alpha);
    for (const it of this.items) this.drawShadow(it.i, it.j, it.z, 0.45, 1);
    for (const d of order) {
      if (d.p) { c.setTransform(1, 0, 0, 1, 0, 0); blit(d.p.img); c.setTransform(s, 0, 0, s, -ox, -oy); }
      else if (d.e === "trinity") this.drawTrinity(c);
      else this.drawItem(c, d.it);
    }
    this.parts.draw(c, this.atlas, this.pages);
    drawTop(c, this.t, this.unlocked, this.actor.fam === "dance");
    // Frame-time bookkeeping for auto-degrade.
    const ft = performance.now() - t0 + (dt > 0.03 ? 8 : 0);
    this.ft.push(dt * 1000); if (this.ft.length > 60) this.ft.shift();
    this.fps = this.ft.length ? 1000 / (this.ft.reduce((a, b) => a + b, 0) / this.ft.length) : 0;
    // Slow = heavy JS *or* a sustained long frame interval (raster/compositing
    // cost of a big DPR-2 canvas never shows up in the JS time).
    this.slow = (this.slow || 0) * 0.97 + (ft > 22 || dt > 0.028 ? 1 : 0) * 0.03;
    if (this.slow > 0.6 && this.degraded < 2) { this.degraded++; this.slow = 0; if (this.degraded === 1 && this.dpr > 1) { this.dprCap = 1; this.resize(); this.setRoom(this.tod, this.unlocked); } else this.parts.enabled = false; }
  }
  drawShadow(i, j, z, k, alpha) {
    const c = this.c, [x, y] = P(i, j, 0), sh = Math.max(0.35, 1 - z / 260);
    c.save(); c.globalAlpha = 0.42 * sh * alpha;
    const g = c.createRadialGradient(x, y, 1, x, y, 38 * k * sh); g.addColorStop(0, "rgba(6,2,16,1)"); g.addColorStop(1, "rgba(6,2,16,0)");
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 38 * k * sh, 14 * k * sh, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  drawTrinity(c) {
    const a = this.actor; if (a.alpha <= 0.01) return;
    const moving = /^(walk|run|carry)/.test(a.anim), breathe = moving || a.air ? 0 : Math.sin(this.t * 2.4) * 0.018;
    const sq = this.sq.x + breathe;
    // Step bob: a small eased dip after each footfall (design px, + = down).
    const bob = moving && !this.reduced && this.stepT < STEP_BOB_SEC ? STEP_BOB * Math.min(1, this.rate) * Math.sin(Math.PI * this.stepT / STEP_BOB_SEC) : 0;
    c.save(); c.globalAlpha = a.alpha; c.translate(a.x, a.y + bob);
    c.rotate(this.lean.x); c.scale(1 / Math.sqrt(Math.max(0.6, sq)), sq);
    const fs = this.anim.frames();
    let fr = fs && fs.a, pg = fr && this.pages[fr.fr.p], fb = fs && fs.b, pb = fb && this.pages[fb.fr.p];
    if (fs && fs.trans && !pg && pb) { fr = fb; pg = pb; fb = null; } // outgoing frame's page is gone: just show the new one
    if (fr && !pg && this.atlas.need) { // lazy page (trinity-ext): fetch it, show idle meanwhile
      this.atlas.need(fr.fr.p); fb = null;
      const an = this.atlas.anims[this.anim.resolve("idle", this.face.f)], f0 = an && this.atlas.frames[an.f[0]];
      if (f0 && this.pages[f0.p]) { fr = { fr: f0, flip: !!an.flip }; pg = this.pages[f0.p]; }
    }
    this.lastBlend = fb && pb ? fs.k : 0; this.lastTrans = !!(fs && fs.trans && fb);
    if (fr && pg && fb && pb && fs.k > 0.004) {
      c.scale(T_SCALE_ATLAS, T_SCALE_ATLAS);
      if (fs.k >= 0.996) drawFrame(c, pb.img, fb.fr, pb.res, fb.flip);
      else drawBlend(c, pg, fr, pb, fb, fs.k);
    }
    else if (fr && pg) { c.scale(T_SCALE_ATLAS, T_SCALE_ATLAS); drawFrame(c, pg.img, fr.fr, pg.res, fr.flip); }
    else { c.scale(T_SCALE_PH, T_SCALE_PH); drawPlaceholder(c, a.anim, this.anim.phase || 0, this.t, this.face.f); }
    c.restore();
  }
  drawItem(c, it) {
    const [x, y] = P(it.i, it.j, it.z), key = { carrot: "obj_carrot", battery: "obj_battery", box: "obj_box" }[it.item];
    const fade = Math.min(1, (it.life - it.t) * 2);
    c.save(); c.globalAlpha = fade; c.translate(x, y);
    const an = key && this.atlas && this.atlas.anims[key], fr = an && this.atlas.frames[an.f[0]], pg = fr && this.pages[fr.p];
    if (pg) { c.scale(0.5, 0.5); drawFrame(c, pg.img, fr, pg.res, false); }
    else drawItemShape(c, it.item, this.t);
    c.restore();
  }

  hitTrinity(cx, cy) {
    const d = this.toDesign(cx, cy), a = this.actor;
    const fr = this.anim.frame();
    if (fr && this.pages[fr.fr.p]) {
      const k = T_SCALE_ATLAS * (this.sq.x || 1);
      let lx = (d.x - a.x) / k, ly = (d.y - a.y) / k;
      if (fr.flip) lx = -lx;
      if (hitFrame(fr.fr, lx + fr.fr.ax, ly + fr.fr.ay)) return true;
    }
    // Fallback: body ellipse, at least 44 css px.
    const rx = Math.max(40, 22 / this.cam.zoom), ry = Math.max(55, 22 / this.cam.zoom);
    const dx = (d.x - a.x) / rx, dy = (d.y - (a.y - 50)) / ry;
    return dx * dx + dy * dy <= 1;
  }
}

// Is entity (i,j) in front of footprint r=[i0,j0,i1,j1]?
function inFront(e, r) {
  if (e.i >= r[2] || e.j >= r[3]) return true;
  if (e.i <= r[0] || e.j <= r[1]) return false;
  return e.i + e.j >= (r[0] + r[1] + r[2] + r[3]) / 2;
}

export function drawItemShape(c, item, t) {
  if (item === "carrot") {
    c.rotate(0.5); c.fillStyle = "#ff9a4a"; c.beginPath(); c.moveTo(-7, -26); c.quadraticCurveTo(0, -30, 7, -26); c.lineTo(0, 0); c.closePath(); c.fill();
    c.fillStyle = "#56c98e"; for (const a of [-0.4, 0, 0.4]) { c.save(); c.translate(0, -27); c.rotate(a); c.beginPath(); c.ellipse(0, -7, 3, 8, 0, 0, 7); c.fill(); c.restore(); }
  } else if (item === "battery") {
    c.fillStyle = "#2a1a4a"; c.fillRect(-9, -30, 18, 30); c.fillRect(-4, -34, 8, 4); c.fillStyle = "#7ee0a8"; c.fillRect(-6, -26, 12, 22);
    c.fillStyle = "#1a0f2c"; c.beginPath(); c.moveTo(1, -24); c.lineTo(-4, -14); c.lineTo(0, -14); c.lineTo(-2, -6); c.lineTo(4, -17); c.lineTo(0, -17); c.fill();
  } else if (item === "box") {
    c.fillStyle = "#c98a5a"; c.fillRect(-14, -24, 28, 24); c.fillStyle = "#e0a877"; c.beginPath(); c.moveTo(-14, -24); c.lineTo(-6, -31); c.lineTo(20, -31); c.lineTo(14, -24); c.fill(); c.fillStyle = "#a86e44"; c.fillRect(-2, -24, 4, 24);
  } else { // ball: pink with a white band, a star and a shine
    const g = c.createRadialGradient(-4, -16, 1, 0, -11, 12); g.addColorStop(0, "#ffd0e6"); g.addColorStop(1, "#ff4f9a");
    c.save(); c.translate(0, -11); c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fillStyle = g; c.fill(); c.clip();
    c.rotate(t * 2); c.fillStyle = "#fff4fa"; c.fillRect(-12, -3, 24, 6); c.fillStyle = "#8fe9f0"; c.fillRect(-12, -3, 24, 1.5);
    c.fillStyle = "#f5d489"; c.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 1.6 : 3.6, a = k * 0.628 - 1.57; c.lineTo(Math.cos(a) * r + 5, Math.sin(a) * r - 5); } c.fill();
    c.restore(); c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.ellipse(-4, -16, 3, 2, -0.6, 0, 7); c.fill();
    c.strokeStyle = "rgba(120,20,70,.35)"; c.lineWidth = 1; c.beginPath(); c.arc(0, -11, 11, 0, 7); c.stroke();
  }
}
