// Pooled particles (≤150). fx_* names from rules.ANIMS.fx map to small
// procedural emitters; when the atlas has the fx anim we also play the sprite.
const MAX = 150;
const TAU = Math.PI * 2;

export class Particles {
  constructor() { this.pool = []; this.live = []; this.enabled = true; }
  get(kind) {
    if (this.live.length >= MAX) return null;
    const p = this.pool.pop() || {};
    p.kind = kind; p.t = 0; p.vx = p.vy = p.rot = p.vr = 0; p.g = 0; p.size = 1; p.col = "#fff"; p.anim = null; p.text = "";
    this.live.push(p); return p;
  }
  clear() { this.pool.push(...this.live); this.live.length = 0; }
  // x,y design coords; opts.atlas + opts.animator-like resolver for sprite fx.
  emit(fx, x, y, atlas) {
    if (!this.enabled) return;
    const R = Math.random;
    const burst = (kind, n, spd, life, col, up = 0, size = 1) => {
      for (let k = 0; k < n; k++) {
        const p = this.get(kind); if (!p) return;
        const a = R() * TAU, s = spd * (0.4 + R() * 0.6);
        Object.assign(p, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - up, life: life * (0.7 + R() * 0.5), col: Array.isArray(col) ? col[k % col.length] : col, rot: R() * TAU, vr: (R() - 0.5) * 6, size: size * (0.7 + R() * 0.6) });
      }
    };
    if (atlas && atlas.anims[fx]) { const p = this.get("sprite"); if (p) Object.assign(p, { x, y, anim: fx, life: atlas.anims[fx].f.length / (atlas.anims[fx].fps || 12), vy: -12 }); }
    switch (fx) {
      case "fx_heart": case "fx_heart_small": burst("heart", fx === "fx_heart" ? 3 : 2, 30, 1.4, ["#ff6b9e", "#ff9fd2"], 40, 1.7); break;
      case "fx_hearts": case "fx_ring_heart": burst("heart", 7, 60, 1.6, ["#ff6b9e", "#ff9fd2", "#ff3d8a"], 50, 1.6); if (fx === "fx_ring_heart") this.ring(x, y, "#ff9fd2"); break;
      case "fx_sparkle": case "fx_sparkle_small": case "fx_star_blue": burst("sparkle", fx === "fx_sparkle" ? 10 : 6, 90, 0.8, fx === "fx_star_blue" ? "#8fe9f0" : ["#fff", "#ffd2e6", "#8fe9f0"], 20); break;
      case "fx_star": burst("star", 6, 90, 1.1, ["#f5d489", "#fff3cf"], 30, 1.8); break;
      case "fx_exclaim": case "fx_exclaim_yellow": if (!(atlas && atlas.anims[fx])) this.glyph(x, y, "!", fx === "fx_exclaim" ? "#ff6b9e" : "#f5d489"); break;
      case "fx_question": if (!(atlas && atlas.anims[fx])) this.glyph(x, y, "?", "#8fe9f0"); break;
      case "fx_smoke": case "fx_smoke_small": case "fx_dust": burst("puff", fx === "fx_smoke" ? 8 : 4, 40, 0.9, fx === "fx_dust" ? "rgba(200,180,255,.5)" : "rgba(220,210,240,.55)", 10, fx === "fx_smoke" ? 1.6 : 1); break;
      case "fx_burst_pink": case "fx_burst_orange": this.ring(x, y, fx === "fx_burst_pink" ? "#ff8fc8" : "#ffb36b"); burst("sparkle", 14, 160, 1, fx === "fx_burst_pink" ? ["#ff8fc8", "#fff"] : ["#ffb36b", "#fff"], 30, 1.3); break;
      case "fx_ring_blue": this.ring(x, y, "#8fe9f0"); break;
      case "fx_portal_floor_pink": case "fx_portal_floor_blue": case "fx_portal_pink": case "fx_portal_blue": { const p = this.get("portal"); if (p) Object.assign(p, { x, y, life: 1.2, col: /pink/.test(fx) ? "255,143,200" : "93,208,217" }); burst("sparkle", 8, 50, 1, "#fff", 60); break; }
      case "fx_comet": burst("star", 3, 200, 0.8, "#fff3cf"); break;
      case "z": { const p = this.get("glyph"); if (p) Object.assign(p, { x, y, vx: 10 + R() * 8, vy: -22, life: 2.2, text: R() < 0.5 ? "z" : "Z", col: "#c7b8ff", size: 0.7 + R() * 0.5 }); break; }
      case "note": { const p = this.get("glyph"); if (p) Object.assign(p, { x, y, vx: (R() - 0.5) * 30, vy: -30, life: 1.8, text: R() < 0.5 ? "♪" : "♫", col: R() < 0.5 ? "#ff9fd2" : "#8fe9f0", size: 0.9 }); break; }
      case "spark": burst("sparkle", 1, 20, 0.6, "#8fe9f0", 30, 0.6); break;
    }
  }
  ring(x, y, col) { const p = this.get("ring"); if (p) Object.assign(p, { x, y, life: 0.7, col }); }
  glyph(x, y, text, col) { const p = this.get("glyph"); if (p) Object.assign(p, { x, y, vy: -18, life: 1.1, text, col, size: 1.6, pop: 1 }); }

  update(dt) {
    for (let k = this.live.length - 1; k >= 0; k--) {
      const p = this.live[k];
      p.t += dt;
      if (p.t >= p.life) { this.live.splice(k, 1); this.pool.push(p); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.vx *= 1 - dt * 1.5; if (p.kind !== "glyph") p.vy = p.vy * (1 - dt * 1.2) + (p.kind === "puff" ? -8 : 0) * dt;
    }
  }
  draw(c, atlas, pages) {
    for (const p of this.live) {
      const u = p.t / p.life, a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.5) / 0.5);
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(p.x, p.y);
      switch (p.kind) {
        case "heart": c.rotate(Math.sin(p.t * 5) * 0.2); c.scale(p.size, p.size); c.fillStyle = p.col; c.beginPath(); c.moveTo(0, 5); c.bezierCurveTo(-9, -2, -5, -10, 0, -4); c.bezierCurveTo(5, -10, 9, -2, 0, 5); c.fill(); break;
        case "sparkle": case "star": {
          c.globalCompositeOperation = "lighter"; c.rotate(p.rot); const r = (p.kind === "star" ? 7 : 5) * p.size * (1 - u * 0.5);
          c.fillStyle = p.col; c.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.3 : r, an = (k / 8) * TAU; c.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } c.fill(); break;
        }
        case "puff": c.fillStyle = p.col; c.beginPath(); c.arc(0, 0, (5 + u * 10) * p.size, 0, TAU); c.fill(); break;
        case "ring": c.globalCompositeOperation = "lighter"; c.strokeStyle = p.col; c.lineWidth = 3 * (1 - u); c.beginPath(); c.ellipse(0, 0, 20 + u * 70, (20 + u * 70) * 0.5, 0, 0, TAU); c.stroke(); break;
        case "portal": c.globalCompositeOperation = "lighter"; for (let k = 0; k < 3; k++) { c.strokeStyle = `rgba(${p.col},${0.7 - k * 0.2})`; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, 30 + k * 12 + u * 10, 14 + k * 6, 0, 0, TAU); c.stroke(); } break;
        case "glyph": {
          const s = p.size * (p.pop ? Math.min(1, 0.4 + u * 6) : 1);
          c.scale(s, s); c.font = "800 16px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
          c.lineWidth = 4; c.strokeStyle = "rgba(20,10,40,.75)"; c.strokeText(p.text, 0, 0); c.fillStyle = p.col; c.fillText(p.text, 0, 0); break;
        }
        case "sprite": {
          const an = atlas && atlas.anims[p.anim]; if (!an) break;
          const fr = atlas.frames[an.f[Math.min(an.f.length - 1, Math.floor(u * an.f.length))]], pg = fr && pages[fr.p];
          if (!pg) break;
          if (an.blend === "lighter") c.globalCompositeOperation = "lighter";
          const k = 38 / Math.max(fr.w, fr.h) * (u < 0.2 ? 0.6 + u * 2 : 1); // ~38 design px, pops in
          c.drawImage(pg.img, fr.x * pg.res, fr.y * pg.res, fr.w * pg.res, fr.h * pg.res, -fr.w * k / 2, -fr.h * k, fr.w * k, fr.h * k);
        }
      }
      c.restore();
    }
  }
}
