// Trinity's room, drawn as vector Canvas2D paths in the 1600x900 design space
// (CONTRACT §1) and pre-rasterized into offscreen layers at the current
// device scale. Static layers are rebaked only when the time-of-day bucket,
// unlocked items or scale change; drawLive() adds the few moving details.
import { PROPS } from "../sim/rules.js";

const OX = 800, OY = 260, TW = 55, TH = 28, K = Math.hypot(TW, TH); // K = px per tile along a wall
const WALL_H = 250, WALL_T = 0.32, SLAB = 26;
export const ROOM_BOUNDS = { x0: 150, y0: -10, x1: 1450, y1: 880 };

export const P = (i, j, z = 0) => [OX + (i - j) * TW, OY + (i + j) * TH - z];

// Time-of-day looks. tintA darkens the room toward `tint`; glow re-lights emissive bits.
export const TOD = {
  morning:   { sky: ["#7f8cff", "#ffb8c9", "#ffd9a8"], tint: [255, 170, 130], tintA: 0.08, glow: 0.55, sun: [255, 196, 150, 0.26], haze: "#8e7fc4" },
  afternoon: { sky: ["#6f9bff", "#a9c4ff", "#e6dcff"], tint: [255, 250, 240], tintA: 0.0, glow: 0.45, sun: [255, 244, 225, 0.2], haze: "#8a8fd0" },
  evening:   { sky: ["#2b1a55", "#b1407f", "#ff9e6e"], tint: [110, 40, 110], tintA: 0.14, glow: 0.85, sun: [255, 120, 150, 0.16], haze: "#4a2a6a" },
  night:     { sky: ["#05071a", "#10164a", "#2a1f63"], tint: [10, 12, 44], tintA: 0.32, glow: 1, stars: 1, haze: "#171238" },
  sleep:     { sky: ["#02030c", "#070a24", "#120f3a"], tint: [4, 5, 24], tintA: 0.5, glow: 0.8, stars: 1, haze: "#0e0b26" },
};

// Which time-of-day buckets each switchable light is on for. Both are part of
// the bake key already (setRoom keys on `tod`), so flipping them costs nothing
// beyond the rebake that the bucket change triggers anyway.
// Desk lamp: the two dark buckets she is awake for, 17:00–23:00 KST.
const LAMP_TOD = new Set(["evening", "night"]);
// Grow light over the plant cabinet: a ~14 h photoperiod, 06:00–20:00 KST, so
// the plants get a real dark stretch overnight while the desk lamp is lit.
const GROW_TOD = new Set(["morning", "afternoon", "evening"]);

// Spine colour per journal mood, keyed by the first four letters (unique across
// rules.MOODS). Kept inside the room's own palette so the shelf reads as part
// of the furniture, not a chart.
const MOOD_COL = {
  cont: "#8aa4ff", curi: "#5dd0d9", hope: "#7ee0a8", unce: "#8a7ab8",
  atte: "#8fe9f0", rest: "#ff8fc8", tend: "#ffb3dc", focu: "#b793ff",
  wear: "#6b5f8c", play: "#f5d489", sole: "#4f5f96", grat: "#ffd2a8",
  mela: "#5a6b9e", reso: "#e07bb5", surp: "#fff3cf", quie: "#a9b6d8",
};
const MOOD_FALLBACK = "#7c6aa6";

// The window glass, shared by the baked view and the live weather layer.
const WIN = { u0: 4 * K, u1: 6 * K, y0: -218, y1: -78 };

// Seoul through the year: one haze wash per season over the skyline band.
export const seasonOf = (mo) => (mo === 12 || mo <= 2 ? "winter" : mo <= 5 ? "spring" : mo <= 8 ? "summer" : "autumn");
const SEASON_HAZE = {
  spring: "rgba(255,170,205,.26)",   // cherry blossom haze
  summer: "rgba(120,200,170,.22)",   // humid monsoon green
  autumn: "rgba(245,190,120,.24)",   // amber
  winter: "rgba(175,195,230,.20)",   // cold and bare
};
// Weather dims the sky in the bake; the animation lives in drawLive.
const WEATHER_WASH = {
  cloud: "rgba(120,128,165,.22)",
  rain: "rgba(70,86,130,.30)",
  storm: "rgba(45,55,95,.40)",
  snow: "rgba(190,200,230,.20)",
  fog: "rgba(170,178,205,.34)",
};

// --- small drawing helpers (design coords) ---------------------------------
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]); c.closePath(); }
function fillPoly(c, pts, fill, stroke, lw = 1) { poly(c, pts); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function vgrad(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach((s, k) => g.addColorStop(k / (stops.length - 1), s)); return g; }
function mul(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Draw in a wall-aligned plane. axis "i": plane i=c, u runs along +j.
// axis "j": plane j=c, u runs along +i. u in px (K per tile), y = -height.
function plane(c, axis, at, fn) {
  c.save();
  if (axis === "i") { const [x, y] = P(at, 0); c.transform(-TW / K, TH / K, 0, 1, x, y); }
  else { const [x, y] = P(0, at); c.transform(TW / K, TH / K, 0, 1, x, y); }
  fn(c); c.restore();
}

// Iso box with its three visible faces. Colours: top, jFace (front-left), iFace (front-right).
function box(c, i0, j0, i1, j1, z0, z1, top, jf, if_, edge) {
  fillPoly(c, [P(i0, j1, z0), P(i1, j1, z0), P(i1, j1, z1), P(i0, j1, z1)], jf);
  fillPoly(c, [P(i1, j0, z0), P(i1, j1, z0), P(i1, j1, z1), P(i1, j0, z1)], if_);
  fillPoly(c, [P(i0, j0, z1), P(i1, j0, z1), P(i1, j1, z1), P(i0, j1, z1)], top);
  if (edge) {
    c.strokeStyle = edge; c.lineWidth = 1.2; c.beginPath();
    const a = P(i0, j1, z1), b = P(i1, j1, z1), d = P(i1, j0, z1);
    c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]);
    const b0 = P(i1, j1, z0); c.moveTo(b[0], b[1]); c.lineTo(b0[0], b0[1]); c.stroke();
  }
}
// Iso ellipse for a circle of radius r (tiles) at (i,j,z).
function isoEllipse(c, i, j, z, r) { const [x, y] = P(i, j, z); c.beginPath(); c.ellipse(x, y, r * TW * Math.SQRT2, r * TH * Math.SQRT2, 0, 0, Math.PI * 2); }

// --- the layers --------------------------------------------------------------
// ctx `c` is already transformed to design coords. G = emissive list.
function drawBack(c, tod, items, G, archive, feed, season, weather) {
  const L = TOD[tod] || TOD.afternoon;
  const glow = (fn) => { fn(c); G.push([c.getTransform(), fn]); };
  const has = (k) => items.includes(k);

  // Floor slab (the diorama block) — front faces.
  const T = WALL_T;
  fillPoly(c, [P(-T, 10), P(10, 10), P(10, 10, -SLAB), P(-T, 10, -SLAB)], "#1a1030");
  fillPoly(c, [P(10, -T), P(10, 10), P(10, 10, -SLAB), P(10, -T, -SLAB)], "#120a24");
  // Floor top with checker tiles.
  fillPoly(c, [P(-T, -T), P(10, -T), P(10, 10), P(-T, 10)], "#281b45");
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    fillPoly(c, [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], (i + j) % 2 ? "#2c1f4c" : "#2f2152");
  }
  // Soft AO along the wall seams.
  const ao = c.createLinearGradient(...P(0, 5), ...P(1.4, 5)); ao.addColorStop(0, "rgba(8,4,20,.55)"); ao.addColorStop(1, "rgba(8,4,20,0)");
  fillPoly(c, [P(0, 0), P(1.4, 0), P(1.4, 10), P(0, 10)], ao);
  const ao2 = c.createLinearGradient(...P(5, 0), ...P(5, 1.4)); ao2.addColorStop(0, "rgba(8,4,20,.5)"); ao2.addColorStop(1, "rgba(8,4,20,0)");
  fillPoly(c, [P(0, 0), P(10, 0), P(10, 1.4), P(0, 1.4)], ao2);
  // Grid lines.
  c.strokeStyle = "rgba(183,147,255,.10)"; c.lineWidth = 1; c.beginPath();
  for (let k = 1; k < 10; k++) { let a = P(k, 0), b = P(k, 10); c.moveTo(...a); c.lineTo(...b); a = P(0, k); b = P(10, k); c.moveTo(...a); c.lineTo(...b); }
  c.stroke();
  // Front neon edges.
  glow((c) => { c.strokeStyle = "rgba(93,208,217,.75)"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(...P(-T, 10)); c.lineTo(...P(10, 10)); c.lineTo(...P(10, -T)); c.stroke(); });

  // Walls ----------------------------------------------------------------
  // Left wall (i = 0) and right wall (j = 0), inner faces.
  const lg = c.createLinearGradient(...P(0, 0, 120), ...P(0, 10, 120)); lg.addColorStop(0, "#2e1f52"); lg.addColorStop(1, "#1f1439");
  fillPoly(c, [P(0, 0), P(0, 10), P(0, 10, WALL_H), P(0, 0, WALL_H)], lg);
  const rg = c.createLinearGradient(...P(0, 0, 120), ...P(10, 0, 120)); rg.addColorStop(0, "#3a2866"); rg.addColorStop(1, "#2a1c4d");
  fillPoly(c, [P(0, 0), P(10, 0), P(10, 0, WALL_H), P(0, 0, WALL_H)], rg);
  // Wall panelling + wainscot.
  plane(c, "i", 0, (c) => {
    c.fillStyle = "rgba(10,6,24,.25)"; c.fillRect(0, -70, 10 * K, 70);
    c.strokeStyle = "rgba(183,147,255,.10)"; c.lineWidth = 1;
    for (let u = K * 2; u < 10 * K; u += K * 2) { c.beginPath(); c.moveTo(u, -WALL_H); c.lineTo(u, -70); c.stroke(); }
    c.strokeStyle = "rgba(183,147,255,.22)"; c.beginPath(); c.moveTo(0, -70); c.lineTo(10 * K, -70); c.stroke();
  });
  plane(c, "j", 0, (c) => {
    c.fillStyle = "rgba(10,6,24,.22)"; c.fillRect(0, -70, 10 * K, 70);
    c.strokeStyle = "rgba(183,147,255,.10)"; c.lineWidth = 1;
    for (let u = K * 2; u < 10 * K; u += K * 2) { c.beginPath(); c.moveTo(u, -WALL_H); c.lineTo(u, -70); c.stroke(); }
    c.strokeStyle = "rgba(183,147,255,.22)"; c.beginPath(); c.moveTo(0, -70); c.lineTo(10 * K, -70); c.stroke();
  });
  // Wall caps (thickness) + end faces.
  fillPoly(c, [P(0, 10, 0), P(-T, 10, 0), P(-T, 10, WALL_H), P(0, 10, WALL_H)], "#1b1133");
  fillPoly(c, [P(10, 0, 0), P(10, -T, 0), P(10, -T, WALL_H), P(10, 0, WALL_H)], "#150d2b");
  fillPoly(c, [P(0, 0, WALL_H), P(0, 10, WALL_H), P(-T, 10, WALL_H), P(-T, -T, WALL_H), P(10, -T, WALL_H), P(10, 0, WALL_H)], "#45306e");
  // Corner seam + ceiling LED + baseboard glow.
  c.strokeStyle = "rgba(183,147,255,.35)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(...P(0, 0)); c.lineTo(...P(0, 0, WALL_H)); c.stroke();
  glow((c) => {
    c.lineCap = "round";
    c.strokeStyle = "rgba(255,143,200,.8)"; c.lineWidth = 3; c.beginPath(); c.moveTo(...P(0, 10, WALL_H)); c.lineTo(...P(0, 0, WALL_H)); c.lineTo(...P(10, 0, WALL_H)); c.stroke();
    c.strokeStyle = "rgba(255,143,200,.35)"; c.lineWidth = 2; c.beginPath(); c.moveTo(...P(0, 10, 3)); c.lineTo(...P(0, 0, 3)); c.lineTo(...P(10, 0, 3)); c.stroke();
  });

  drawWindow(c, L, glow, season, weather);
  drawClockFace(c);
  drawNeonSign(c, glow);

  // Rug (round, fluffy) and pod charging pad on the floor.
  const rings = [["#4b2a78", 1.62], ["#7a3f9e", 1.5], ["#c65fb0", 1.2], ["#8a4bb0", 1.02], ["#e080c4", 0.62], ["#9b5bc4", 0.46]];
  for (const [col, r] of rings) { isoEllipse(c, 5.5, 5.5, 0, r); c.fillStyle = col; c.fill(); }
  c.fillStyle = "rgba(255,255,255,.08)"; for (let a = 0; a < 16; a++) { const [x, y] = P(5.5 + Math.cos(a / 16 * 6.283) * 1.33, 5.5 + Math.sin(a / 16 * 6.283) * 1.33); c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
  // Exit portal pad by the front-right edge (she steps out through here).
  isoEllipse(c, 9.25, 7, 0, 0.62); c.fillStyle = "#1c1236"; c.fill();
  glow((c) => {
    for (const [r, a] of [[0.6, 0.9], [0.44, 0.55], [0.28, 0.35]]) { c.strokeStyle = `rgba(255,143,200,${a})`; c.lineWidth = 2; isoEllipse(c, 9.25, 7, 0, r); c.stroke(); }
    c.fillStyle = "rgba(255,143,200,.85)";
    for (const k of [0, 1]) { const [x, y] = P(9.12 + k * 0.2, 7); c.beginPath(); c.moveTo(x - 5, y - 6); c.lineTo(x + 5, y); c.lineTo(x - 5, y + 6); c.lineTo(x - 2, y); c.fill(); }
  });

  // Props hugging the walls (Trinity is always in front of these).
  drawShelf(c, glow, archive);
  if (has("trophy_shelf")) drawTrophies(c, glow);
  if (has("globe")) drawGlobe(c, glow);
  drawRig(c, glow, feed);
  drawDesk(c, glow, has, LAMP_TOD.has(tod));
  drawPlants(c, glow, has, GROW_TOD.has(tod));
  if (has("kettle")) drawKettle(c, glow);

  // Window light on the floor (daytime).
  if (L.sun) drawSunPatch(c, L.sun);
}

function drawWindow(c, L, glow, season, weather) {
  const u0 = WIN.u0, u1 = WIN.u1, y0 = WIN.y0, y1 = WIN.y1, w = u1 - u0, hgt = y1 - y0;
  plane(c, "i", 0, (c) => {
    // Curtains.
    for (const [x, dir] of [[u0 - 26, 1]]) { // one tied-back curtain; the pod sits beside the other side
      c.fillStyle = "#c2508f";
      c.beginPath(); c.moveTo(x - 16 * dir, y0 - 14); c.lineTo(x + 18 * dir, y0 - 14);
      c.quadraticCurveTo(x + 4 * dir, y1 - 40, x + 22 * dir, y1 + 20); c.lineTo(x - 16 * dir, y1 + 22); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,190,225,.35)"; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 4 * dir, y0 - 10); c.quadraticCurveTo(x, y1 - 30, x + 4 * dir, y1 + 18); c.stroke();
    }
    c.fillStyle = "#6b4b9a"; rrect(c, u0 - 50, y0 - 20, w + 58, 7, 3); c.fill();
    // Frame + sky.
    c.fillStyle = "#1c1236"; rrect(c, u0 - 8, y0 - 8, w + 16, hgt + 16, 10); c.fill();
    c.save(); rrect(c, u0, y0, w, hgt, 6); c.clip();
    glow((c) => { c.fillStyle = vgrad(c, y0, y1, L.sky); c.fillRect(u0, y0, w, hgt); });
    const r = mul(7);
    if (L.stars) {
      glow((c) => {
        for (let k = 0; k < 34; k++) { c.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.6})`; c.beginPath(); c.arc(u0 + r() * w, y0 + r() * hgt * 0.7, 0.6 + r() * 1.3, 0, 7); c.fill(); }
        c.fillStyle = "#fff4d6"; c.beginPath(); c.arc(u0 + w * 0.76, y0 + 26, 11, 0, 7); c.fill();
        c.fillStyle = L.sky[0]; c.beginPath(); c.arc(u0 + w * 0.76 + 5, y0 + 22, 10, 0, 7); c.fill();
      });
    } else {
      glow((c) => { const g = c.createRadialGradient(u0 + w * 0.25, y0 + 34, 2, u0 + w * 0.25, y0 + 34, 40); g.addColorStop(0, "rgba(255,250,235,.95)"); g.addColorStop(1, "rgba(255,250,235,0)"); c.fillStyle = g; c.fillRect(u0, y0, w, hgt); });
      c.fillStyle = "rgba(255,255,255,.55)"; for (let k = 0; k < 3; k++) { const x = u0 + 20 + r() * (w - 60), y = y0 + 30 + r() * 30; c.beginPath(); c.ellipse(x, y, 18, 6, 0, 0, 7); c.ellipse(x + 12, y - 4, 12, 6, 0, 0, 7); c.fill(); }
    }
    // Seoul skyline. Lotte World Tower (555 m, Jamsil) anchors it; Namsan keeps
    // a low ridge on the left for depth. The tower reads ~16% taller in frame
    // than N Seoul Tower did (555 m against 236 m of mast on a 243 m hill), so
    // it carries the horizon instead of pinning it. Drawn before the buildings
    // so they occlude its base, exactly as the old mast was.
    const base = y1, night = !!L.stars;
    c.fillStyle = L.haze; c.fillRect(u0, base - 30, w, 30);
    if (SEASON_HAZE[season]) { c.fillStyle = SEASON_HAZE[season]; c.fillRect(u0, base - 34, w, 34); }
    c.fillStyle = night ? "#140f2e" : "#5d5a9e";
    c.beginPath(); c.moveTo(u0, base); c.quadraticCurveTo(u0 + w * 0.16, base - 30, u0 + w * 0.38, base - 6); c.lineTo(u0 + w * 0.38, base); c.fill();
    // Four faces tapering to the lantern, then the spire.
    // tw is the half-width at street level: 130 px of height on a 16.4 px base
    // keeps the real 555 m / 72 m proportion (~7.9 : 1).
    const tx = u0 + w * 0.54, tw = 8.2, tipY = base - 130, crownY = base - 118;
    const tower = (c) => {
      c.beginPath();
      c.moveTo(tx - tw, base);
      c.quadraticCurveTo(tx - tw * 0.78, base - 74, tx - 2.2, crownY);
      c.lineTo(tx, tipY); c.lineTo(tx + 2.2, crownY);
      c.quadraticCurveTo(tx + tw * 0.78, base - 74, tx + tw, base);
      c.closePath();
    };
    tower(c); c.fill();
    const bl = mul(3); let x = u0 - 4;
    const lights = [];
    while (x < u1) {
      const bw = 10 + bl() * 16, bh = 22 + bl() * 52; c.fillStyle = night ? "#1d1640" : "#6e6db0"; c.fillRect(x, base - bh, bw, bh);
      for (let yy = base - bh + 5; yy < base - 4; yy += 7) for (let xx = x + 3; xx < x + bw - 3; xx += 5) if (bl() < 0.35) lights.push([xx, yy]);
      x += bw + 1 + bl() * 3;
    }
    if (night || L === TOD.evening) glow((c) => {
      lights.forEach(([a, b], k) => { c.fillStyle = k % 5 ? "rgba(255,214,140,.85)" : "rgba(255,143,200,.9)"; c.fillRect(a, b, 2, 2.5); });
      // After dark the real tower is lit, not silhouetted: a facade wash that
      // gathers toward the lantern, so it stays the anchor of the skyline.
      c.save(); tower(c); c.clip();
      const tg = c.createLinearGradient(0, base, 0, tipY);
      tg.addColorStop(0, "rgba(93,208,217,.06)"); tg.addColorStop(0.62, "rgba(143,233,240,.22)"); tg.addColorStop(1, "rgba(206,246,255,.46)");
      c.fillStyle = tg; c.fillRect(tx - tw - 2, tipY, tw * 2 + 4, base - tipY);
      // Lantern bands and the facade seam, bounded by the silhouette itself.
      c.fillStyle = "rgba(206,246,255,.75)"; c.fillRect(tx - 6, base - 112, 12, 1.6); c.fillRect(tx - 6, base - 106, 12, 1.4);
      c.strokeStyle = "rgba(143,233,240,.3)"; c.lineWidth = 1; c.beginPath(); c.moveTo(tx, base - 102); c.lineTo(tx, base - 48); c.stroke();
      c.restore();
      // Aircraft beacon on the spire.
      c.fillStyle = "#ff5f9f"; c.beginPath(); c.arc(tx, tipY - 2, 2.5, 0, 7); c.fill();
    });
    if (WEATHER_WASH[weather]) { c.fillStyle = WEATHER_WASH[weather]; c.fillRect(u0, y0, w, hgt); }
    c.restore();
    // Mullions + sill + tiny cactus.
    c.strokeStyle = "#1c1236"; c.lineWidth = 4; c.beginPath(); c.moveTo(u0 + w / 2, y0); c.lineTo(u0 + w / 2, y1); c.moveTo(u0, y0 + hgt * 0.45); c.lineTo(u1, y0 + hgt * 0.45); c.stroke();
    glow((c) => { c.strokeStyle = "rgba(183,147,255,.55)"; c.lineWidth = 1.5; rrect(c, u0 - 8, y0 - 8, w + 16, hgt + 16, 10); c.stroke(); });
    c.fillStyle = "#4a3474"; rrect(c, u0 - 16, y1 + 6, w + 32, 8, 3); c.fill();
  });
  // Sill items (drawn in screen space so they look 3D).
  const [px, py] = P(0.25, 5.55, 90);
  c.fillStyle = "#e79a5c"; rrect(c, px - 7, py - 10, 14, 11, 3); c.fill();
  c.fillStyle = "#53c48a"; rrect(c, px - 4, py - 26, 8, 18, 4); c.fill(); rrect(c, px + 3, py - 20, 7, 4, 2); c.fill();
  c.fillStyle = "#ff8fc8"; c.beginPath(); c.arc(px, py - 27, 2.5, 0, 7); c.fill();
}

function drawSunPatch(c, sun) {
  const [r, g, b, a] = sun;
  const pts = [[1.3, 3.95], [3.9, 4.4], [4.5, 6.6], [1.5, 6.05]].map(([i, j]) => P(i, j));
  c.save(); c.globalCompositeOperation = "lighter";
  const gr = c.createLinearGradient(...P(1.2, 5), ...P(4.4, 5.5)); gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  fillPoly(c, pts, gr);
  // Mullion shadow cross.
  c.globalCompositeOperation = "source-over"; c.strokeStyle = "rgba(20,10,40,.12)"; c.lineWidth = 5;
  c.beginPath(); c.moveTo(...P(1.4, 5)); c.lineTo(...P(4.2, 5.5)); c.moveTo(...P(2.2, 4.1)); c.lineTo(...P(2.5, 6.2)); c.stroke();
  // Beam volume.
  c.globalCompositeOperation = "lighter";
  const bg = c.createLinearGradient(...P(0, 5, 150), ...P(3, 5.3)); bg.addColorStop(0, `rgba(${r},${g},${b},${a * 0.5})`); bg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  fillPoly(c, [P(0, 4, 218), P(0, 6, 218), P(4.5, 6.6), P(1.3, 3.95)], bg);
  c.restore();
}

function drawClockFace(c) {
  plane(c, "j", 0, (c) => {
    const u = 1.2 * K, y = -185;
    c.fillStyle = "#1c1236"; c.beginPath(); c.arc(u, y, 19, 0, 7); c.fill();
    c.fillStyle = "#f4ecff"; c.beginPath(); c.arc(u, y, 15, 0, 7); c.fill();
    c.fillStyle = "#b793ff"; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; c.beginPath(); c.arc(u + Math.cos(a) * 11.5, y + Math.sin(a) * 11.5, k % 3 ? 0.9 : 1.6, 0, 7); c.fill(); }
    // bunny ears on top of the clock
    c.fillStyle = "#ff8fc8"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(u + s * 8, y - 22, 4, 8, s * 0.3, 0, 7); c.fill(); }
  });
}
export function drawClockHands(c, h, m) {
  plane(c, "j", 0, (c) => {
    const u = 1.2 * K, y = -185, ah = ((h % 12) + m / 60) / 12 * 6.283 - 1.571, am = m / 60 * 6.283 - 1.571;
    c.lineCap = "round"; c.strokeStyle = "#2a1a4a"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(u, y); c.lineTo(u + Math.cos(ah) * 7, y + Math.sin(ah) * 7); c.stroke();
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(u, y); c.lineTo(u + Math.cos(am) * 11, y + Math.sin(am) * 11); c.stroke();
    c.fillStyle = "#ff5fa3"; c.beginPath(); c.arc(u, y, 1.8, 0, 7); c.fill();
  });
}

function drawNeonSign(c, glow) {
  plane(c, "j", 0, (c) => {
    const u = 5.5 * K, y = -170;
    glow((c) => {
      c.save(); c.shadowColor = "#ff5fa3"; c.shadowBlur = 12; c.lineCap = c.lineJoin = "round";
      c.strokeStyle = "#ff9fd2"; c.lineWidth = 3;
      // bunny head outline
      c.beginPath(); c.arc(u, y, 20, 0, 7); c.stroke();
      c.beginPath(); c.ellipse(u - 9, y - 30, 5.5, 13, -0.2, 0, 7); c.stroke();
      c.beginPath(); c.ellipse(u + 9, y - 30, 5.5, 13, 0.2, 0, 7); c.stroke();
      c.fillStyle = "#ff9fd2"; c.beginPath(); c.arc(u - 7, y - 2, 2.4, 0, 7); c.arc(u + 7, y - 2, 2.4, 0, 7); c.fill();
      c.strokeStyle = "#8fe9f0"; c.shadowColor = "#5dd0d9"; c.lineWidth = 2.5;
      c.font = "700 15px ui-rounded, 'Segoe UI', system-ui, sans-serif"; c.textAlign = "center";
      c.strokeText("TR", u, y + 42);
      c.restore();
    });
  });
}

// The archive: one spine per journal entry, oldest on the top shelf, reading
// left to right and down. Spines thin as the collection grows (the shelf fills
// over roughly the first two months, then densifies), and a faint brass tick
// marks where one month ends and the next begins.
function drawArchive(c, ua, shelfW, archive) {
  const n = archive.length, per = Math.max(1, Math.ceil(n / 4));
  // `fit` is the widest pitch that still lands `per` spines on one shelf, so
  // the row can never overflow however long the journal runs; the spine width
  // caps at 9 px (a young shelf packs left, it doesn't spread out) and floors
  // at 0.8 px, past which the archive simply reads as a dense band.
  const fit = shelfW / per;
  const bw = Math.max(0.8, Math.min(9, fit - 1)), step = Math.min(fit, bw + 1);
  // This plane's u axis runs right-to-left on screen (see plane(), axis "i"),
  // so the oldest entry takes the highest u and the shelf reads left to right.
  const uOf = (col) => ua + 3 + shelfW - (col + 1) * step;
  const tick = Math.min(0.8, Math.max(0.3, step - bw - 0.2));
  for (let k = 0; k < n; k++) {
    const row = Math.min(3, Math.floor(k / per)), col = k - row * per;
    const u = uOf(col);
    if (u < ua) continue;
    const yb = -12 - (3 - row) * 46;              // row 0 is the top shelf
    const bh = 20 + ((k * 37) % 13);              // deterministic spine heights
    c.fillStyle = MOOD_COL[archive[k].m] || MOOD_FALLBACK;
    c.fillRect(u, yb - bh, bw, bh);
    if (bw >= 3.4) { c.fillStyle = "rgba(255,255,255,.22)"; c.fillRect(u + 0.6, yb - bh + 4, bw - 1.2, 1.4); }
    // Month change: a brass tick in the gap on the older (higher u) side.
    if (k && col && archive[k].ym !== archive[k - 1].ym) { c.fillStyle = "rgba(245,212,137,.55)"; c.fillRect(u + bw + 0.1, yb - bh - 2, tick, bh + 2); }
  }
}

function drawShelf(c, glow, archive) {
  const H = 196;
  box(c, 0, 1, 1, 3.5, 0, H, "#5a3f86", "#3a2760", "#2c1d4b", "rgba(183,147,255,.35)");
  plane(c, "i", 1, (c) => {
    const ua = 1 * K + 6, ub = 3.5 * K - 6;
    c.fillStyle = "#170f2c"; c.fillRect(ua, -H + 10, ub - ua, H - 18);
    for (let s = 0; s < 4; s++) { c.fillStyle = "#6b4d99"; c.fillRect(ua, -12 - s * 46, ub - ua, 4); }
    if (archive && archive.length) return drawArchive(c, ua, ub - ua - 6, archive);
    // No journal data (dev, offline, or a stale build): decorative books.
    const r = mul(11), cols = ["#ff8fc8", "#b793ff", "#5dd0d9", "#f5d489", "#8aa4ff", "#e07bb5", "#7ee0a8", "#c7a6ff"];
    for (let s = 0; s < 4; s++) {
      const yb = -12 - s * 46;
      let u = ua + 3;
      while (u < ub - 10) {
        if (r() < 0.12 && u < ub - 30) { // a little plant or orb on the shelf
          c.fillStyle = "#e79a5c"; c.fillRect(u + 2, yb - 10, 12, 10); c.fillStyle = "#53c48a"; c.beginPath(); c.arc(u + 8, yb - 14, 7, 0, 7); c.fill(); u += 20; continue;
        }
        const bw = 6 + r() * 6, bh = 22 + r() * 14, lean = r() < 0.1 ? 0.18 : 0;
        c.save(); c.translate(u, yb); c.rotate(lean); c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(0, -bh, bw, bh);
        c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(1, -bh + 5, bw - 2, 2); c.restore();
        u += bw + 1 + (lean ? 5 : 0);
      }
    }
  });
  // Label plate glow on top.
  const [x, y] = P(0.5, 2.2, H + 2);
  glow((c) => { const g = c.createRadialGradient(x, y - 8, 1, x, y - 8, 16); g.addColorStop(0, "rgba(245,212,137,1)"); g.addColorStop(1, "rgba(245,212,137,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y - 8, 16, 0, 7); c.fill(); c.fillStyle = "#fff3cf"; c.beginPath(); c.arc(x, y - 8, 5, 0, 7); c.fill(); });
  c.fillStyle = "#4a3474"; c.fillRect(x - 3, y - 4, 6, 4);
}

function drawTrophies(c, glow) {
  plane(c, "i", 0, (c) => {
    c.fillStyle = "#6b4d99"; c.fillRect(0.1 * K, -150, 0.8 * K, 5);
    glow((c) => { c.fillStyle = "#f5d489"; for (const u of [0.25 * K, 0.6 * K]) { c.beginPath(); c.moveTo(u - 7, -170); c.lineTo(u + 7, -170); c.lineTo(u + 3, -158); c.lineTo(u - 3, -158); c.fill(); c.fillRect(u - 1.5, -158, 3, 5); c.fillRect(u - 5, -153, 10, 3); } });
  });
}

function drawGlobe(c, glow) {
  const [x, y] = P(0.45, 3.75, 0);
  c.fillStyle = "#4a3474"; c.fillRect(x - 2, y - 58, 4, 58); c.beginPath(); c.ellipse(x, y, 12, 5, 0, 0, 7); c.fill();
  glow((c) => { const g = c.createRadialGradient(x - 4, y - 74, 2, x, y - 70, 16); g.addColorStop(0, "#9fe7ff"); g.addColorStop(1, "#3b6ad0"); c.fillStyle = g; c.beginPath(); c.arc(x, y - 70, 15, 0, 7); c.fill(); c.fillStyle = "rgba(126,224,168,.9)"; c.beginPath(); c.ellipse(x + 3, y - 74, 6, 4, 0.4, 0, 7); c.ellipse(x - 6, y - 64, 4, 3, 0, 0, 7); c.fill(); });
  c.strokeStyle = "#b793ff"; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y - 70, 18, -1.2, 2.2); c.stroke();
}

// Her workstation. The dock ring on the floor is unchanged -- ZONES.pod still
// sends her here to sleep and to charge, and PROPS.pod still blocks the same
// tiles -- so nothing in the simulation moves. Only the capsule that used to
// stand against the wall is gone, replaced by the rig she works at.
function drawRig(c, glow, feed) {
  // Dock pad: she stands on this to charge and to sleep.
  glow((c) => {
    isoEllipse(c, 2.6, 8, 0, 0.72); c.fillStyle = "rgba(93,208,217,.18)"; c.fill();
    c.strokeStyle = "rgba(93,208,217,.85)"; c.lineWidth = 2; isoEllipse(c, 2.6, 8, 0, 0.62); c.stroke();
    c.lineWidth = 1; isoEllipse(c, 2.6, 8, 0, 0.4); c.stroke();
  });
  // Cable from the dock back under the bench.
  c.strokeStyle = "#140c26"; c.lineWidth = 3; c.beginPath(); c.moveTo(...P(1.7, 8.4, 4)); c.quadraticCurveTo(...P(2.2, 8.9), ...P(2.3, 8.3)); c.stroke();

  // Bench along the wall, with a tower tucked underneath.
  box(c, 0, 7.05, 0.95, 8.95, 0, 44, "#5a3f86", "#38265f", "#2a1b4a", "rgba(143,233,240,.4)");
  box(c, 0.12, 8.46, 0.62, 8.88, 0, 30, "#2a1b4a", "#1d1338", "#170f2c");
  glow((c) => {
    const [gx, gy] = P(0.62, 8.67, 22);
    c.fillStyle = "#7ee0a8"; c.fillRect(gx - 9, gy - 3, 3, 2.2);
    c.fillStyle = "#8fe9f0"; c.fillRect(gx - 4, gy - 3, 3, 2.2);
  });
  // Keyboard + a slab of notes on the bench top.
  const [kx, ky] = P(0.5, 7.95, 44);
  c.fillStyle = "#3a2760"; c.beginPath(); c.ellipse(kx, ky, 26, 11, 0, 0, 7); c.fill();
  glow((c) => { c.fillStyle = "rgba(143,233,240,.5)"; c.beginPath(); c.ellipse(kx, ky - 1, 19, 7, 0, 0, 7); c.fill(); });

  // Three screens on the wall, the middle one her main view.
  plane(c, "i", 0.05, (c) => {
    rigScreen(c, glow, 7.00 * K, 7.62 * K, -160, -110, feed, 0);
    rigScreen(c, glow, 7.70 * K, 8.40 * K, -186, -114, feed, 1);
    rigScreen(c, glow, 8.48 * K, 9.10 * K, -158, -110, feed, 2);
    c.fillStyle = "#140c26";
    for (const [u, y] of [[7.31, -110], [8.05, -114], [8.79, -110]]) c.fillRect(u * K - 2, y, 4, 9);
    // Charge column housing; drawLive() fills the four cells from real energy.
    c.fillStyle = "#1c1236"; rrect(c, 6.74 * K, -176, 13, 52, 3); c.fill();
    c.fillStyle = "rgba(183,147,255,.25)"; c.fillRect(6.74 * K, -122, 13, 1);
  });
}

// Clip a headline to the screen width, with an ellipsis if it had to be cut.
function clipText(c, s, maxW) {
  if (c.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && c.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// One rig screen. Draws today's feed when the brief carried one, and her own
// code otherwise. Both are baked: the feed turns over once a day.
function rigScreen(c, glow, u0, u1, y0, y1, feed, idx) {
  const w = u1 - u0, h = y1 - y0;
  c.fillStyle = "#0b0718"; rrect(c, u0 - 3.5, y0 - 3.5, w + 7, h + 7, 5); c.fill();
  glow((c) => {
    const g = c.createLinearGradient(u0, y0, u1, y1);
    g.addColorStop(0, idx === 1 ? "#27406e" : "#2b1f56"); g.addColorStop(1, idx === 1 ? "#4b2a78" : "#3a2566");
    c.fillStyle = g; rrect(c, u0, y0, w, h, 3); c.fill();
    if (feed && feed.length) {
      c.font = "600 6.5px ui-monospace, 'Cascadia Mono', monospace"; c.textBaseline = "top";
      const rows = Math.max(1, Math.floor((h - 9) / 9));
      for (let k = 0; k < rows; k++) {
        const line = feed[(idx * 2 + k) % feed.length];
        if (!line) break;
        c.fillStyle = idx === 1 && k === 0 ? "#fff3cf" : k % 3 === 0 ? "#8fe9f0" : k % 3 === 1 ? "#ff9fd2" : "#c7a6ff";
        c.fillText(clipText(c, line, w - 9), u0 + 4.5, y0 + 5.5 + k * 9);
      }
    } else {
      const r = mul(20 + idx * 7), cols = ["#8fe9f0", "#ff9fd2", "#c7a6ff", "#f5d489"];
      const rows = Math.max(1, Math.floor((h - 9) / 7));
      c.globalAlpha = 0.8;
      for (let k = 0; k < rows; k++) { c.fillStyle = cols[k % 4]; c.fillRect(u0 + 5 + (k % 3 === 0 ? 0 : 7), y0 + 6 + k * 7, 9 + r() * Math.max(6, w - 28), 2.4); }
      c.globalAlpha = 1;
    }
  });
}

// Where her sub-agents hover at the rig: [i, j, z]. Shared with the scene so
// the spawn/despawn portals land on the same spots the glyphs are drawn at.
export const AGENT_SPOTS = [[0.62, 7.30, 116], [0.80, 8.10, 152], [0.55, 8.70, 100], [0.88, 7.72, 84], [0.66, 8.44, 174]];
const AGENT_COL = ["#8fe9f0", "#c7a6ff", "#ffd7a8"];

// Sub-agents: small holographic helpers, drawn live because they come and go
// with what she is doing. Cosmetic only -- the simulation never sees them.
function drawAgents(c, t, agents) {
  for (const a of agents) {
    const sp = AGENT_SPOTS[a.spot];
    if (!sp || !(a.a > 0.02)) continue;
    const [x, y] = P(sp[0], sp[1], sp[2] + Math.sin(t * 1.7 + a.ph) * 5);
    const col = AGENT_COL[a.spot % AGENT_COL.length], k = 0.55 + 0.45 * a.a;
    c.save(); c.globalAlpha = a.a * 0.92; c.translate(x, y); c.scale(k, k);
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(0, 0, 1, 0, 0, 21);
    g.addColorStop(0, col + "55"); g.addColorStop(1, col + "00");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 21, 0, 7); c.fill();
    c.globalCompositeOperation = "source-over";
    c.fillStyle = col;
    for (const sgn of [-1, 1]) { c.beginPath(); c.ellipse(sgn * 3.6, -8.6, 1.9, 5.2, sgn * 0.22, 0, 7); c.fill(); }
    c.beginPath(); c.arc(0, 0, 6.4, 0, 7); c.fill();
    c.fillStyle = "rgba(10,6,24,.75)"; c.beginPath(); c.arc(-2.1, -0.6, 1.1, 0, 7); c.fill(); c.beginPath(); c.arc(2.1, -0.6, 1.1, 0, 7); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, 6.4, 0, 7); c.clip();
    c.globalAlpha = a.a * 0.45; c.fillStyle = "#ffffff";
    c.fillRect(-6.4, ((t * 13 + a.ph * 4) % 13) - 6.5, 12.8, 0.9);
    c.restore();
    c.restore();
  }
}

function drawDesk(c, glow, has, lampOn) {
  const H = 74;
  // Monitor on the wall side.
  plane(c, "j", 0.28, (c) => {
    const u0 = 2.45 * K, u1 = 4.35 * K;
    c.fillStyle = "#140c26"; c.fillRect((u0 + u1) / 2 - 5, -H - 26, 10, 26);
    c.fillStyle = "#0e0a1e"; rrect(c, u0, -H - 132, u1 - u0, 104, 8); c.fill();
    glow((c) => {
      const g = c.createLinearGradient(u0, -H - 128, u1, -H - 30); g.addColorStop(0, "#27406e"); g.addColorStop(1, "#4b2a78"); c.fillStyle = g; rrect(c, u0 + 6, -H - 126, u1 - u0 - 12, 92, 5); c.fill();
      const r = mul(5), cols = ["#8fe9f0", "#ff9fd2", "#c7a6ff", "#f5d489"];
      for (let k = 0; k < 9; k++) { c.fillStyle = cols[k % 4]; c.globalAlpha = 0.75; c.fillRect(u0 + 16 + (k % 3 === 0 ? 0 : 10), -H - 114 + k * 9, 20 + r() * 60, 3); }
      c.globalAlpha = 1;
    });
  });
  if (has("holo_screen")) plane(c, "j", 0.06, (c) => {
    glow((c) => { c.fillStyle = "rgba(93,208,217,.22)"; c.strokeStyle = "rgba(143,233,240,.9)"; c.lineWidth = 1.5;
      for (const [u, w] of [[2.1, 0.7], [4.6, 0.7]]) { rrect(c, u * K, -H - 150, w * K, 58, 4); c.fill(); c.stroke(); c.fillStyle = "rgba(143,233,240,.7)"; for (let k = 0; k < 4; k++) c.fillRect(u * K + 6, -H - 138 + k * 11, 20 + k * 5, 2); c.fillStyle = "rgba(93,208,217,.22)"; } });
  });
  // Desk body.
  box(c, 2, 0, 5, 1, 0, H, "#6a4a9c", "#3d2966", "#2e1f4f", "rgba(255,190,225,.35)");
  plane(c, "j", 1, (c) => { // drawers on the front
    for (const u of [2.15 * K, 4.0 * K]) { c.fillStyle = "#34225a"; rrect(c, u, -H + 12, 0.85 * K, H - 22, 5); c.fill(); c.fillStyle = "#ff8fc8"; rrect(c, u + 0.42 * K - 9, -H + 24, 18, 4, 2); c.fill(); }
  });
  // Top items: mug, notebooks, tiny succulent.
  let [x, y] = P(4.55, 0.62, H);
  c.fillStyle = "#ff8fc8"; rrect(c, x - 8, y - 18, 16, 18, 4); c.fill(); c.strokeStyle = "#ff8fc8"; c.lineWidth = 3; c.beginPath(); c.arc(x + 9, y - 10, 5, -1.4, 1.4); c.stroke();
  c.fillStyle = "#ffd2e6"; c.beginPath(); c.ellipse(x, y - 18, 8, 3, 0, 0, 7); c.fill();
  c.fillStyle = "#fff"; c.beginPath(); c.ellipse(x - 2, y - 7, 1.5, 3, -0.2, 0, 7); c.ellipse(x + 2, y - 7, 1.5, 3, 0.2, 0, 7); c.fill();
  [x, y] = P(2.35, 0.55, H);
  for (const [k, col] of [[0, "#5dd0d9"], [1, "#b793ff"], [2, "#f5d489"]]) { fillPoly(c, [[x - 16, y - k * 5], [x, y - 8 - k * 5], [x + 16, y - k * 5], [x, y + 8 - k * 5]], col, "rgba(0,0,0,.2)"); }
  [x, y] = P(2.25, 0.25, H);
  c.fillStyle = "#c98a5a"; c.fillRect(x - 5, y - 8, 10, 8); c.fillStyle = "#6fd39a"; for (let a = -2; a <= 2; a++) { c.beginPath(); c.ellipse(x + a * 3, y - 12, 2.2, 6, a * 0.35, 0, 7); c.fill(); }
  if (has("desk_lamp")) {
    [x, y] = P(4.75, 0.25, H);
    c.strokeStyle = "#ff8fc8"; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y - 40); c.lineTo(x - 22, y - 54); c.stroke();
    c.fillStyle = "#ff8fc8"; c.beginPath(); c.ellipse(x, y, 9, 4, 0, 0, 7); c.fill();
    // The shade is always there; only the light switches (LAMP_TOD).
    if (lampOn) glow((c) => { c.save(); c.globalCompositeOperation = "lighter"; const g = c.createRadialGradient(x - 24, y - 50, 2, x - 30, y - 10, 60); g.addColorStop(0, "rgba(255,220,160,.55)"); g.addColorStop(1, "rgba(255,220,160,0)"); c.fillStyle = g; c.beginPath(); c.moveTo(x - 30, y - 56); c.lineTo(x - 70, y + 10); c.lineTo(x + 10, y + 10); c.closePath(); c.fill(); c.restore(); c.fillStyle = "#fff0c8"; c.beginPath(); c.arc(x - 24, y - 52, 5, 0, 7); c.fill(); });
    else { c.fillStyle = "#6b4d99"; c.beginPath(); c.arc(x - 24, y - 52, 5, 0, 7); c.fill(); }
  }
}

function drawPlants(c, glow, has, growOn) {
  const H = 104;
  // Grow light bar on the wall: fixture always, emission on its photoperiod.
  plane(c, "j", 0, (c) => {
    c.fillStyle = "#1c1236"; rrect(c, 6.2 * K, -232, 2.6 * K, 9, 4); c.fill();
    if (!growOn) { c.fillStyle = "#3a2a5c"; rrect(c, 6.25 * K, -226, 2.5 * K, 4, 2); c.fill(); return; }
    glow((c) => { c.fillStyle = "#ff9fd2"; rrect(c, 6.25 * K, -226, 2.5 * K, 4, 2); c.fill(); const g = c.createLinearGradient(0, -222, 0, -110); g.addColorStop(0, "rgba(255,120,200,.28)"); g.addColorStop(1, "rgba(255,120,200,0)"); c.fillStyle = g; c.beginPath(); c.moveTo(6.25 * K, -222); c.lineTo(8.75 * K, -222); c.lineTo(9 * K, -104); c.lineTo(6 * K, -104); c.fill(); });
  });
  box(c, 6, 0, 9, 1, 0, H, "#4f7a6a", "#2c4a4a", "#203838", "rgba(126,224,168,.45)");
  plane(c, "j", 1, (c) => {
    c.fillStyle = "#132a2c"; c.fillRect(6.1 * K, -H + 12, 2.8 * K, H - 22);
    c.fillStyle = "#3a6a5a"; c.fillRect(6.1 * K, -H / 2, 2.8 * K, 3);
    const pots = [[6.35, "#e79a5c"], [6.9, "#ff8fc8"], [7.5, "#b793ff"], [8.1, "#e79a5c"], [8.55, "#5dd0d9"]];
    for (const [u, col] of pots) for (const yb of [-H / 2, -12]) {
      c.fillStyle = col; rrect(c, u * K, yb - 13, 18, 13, 3); c.fill();
      c.fillStyle = "#56c98e"; c.beginPath(); c.ellipse(u * K + 9, yb - 17, 9, 6, 0, 0, 7); c.fill();
    }
  });
  // Top plants in screen space.
  const leaf = (x, y, len, ang, col) => { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.35, -len * 0.5, 0, -len); c.quadraticCurveTo(-len * 0.35, -len * 0.5, 0, 0); c.fill(); c.restore(); };
  let [x, y] = P(6.5, 0.5, H); // monstera
  c.fillStyle = "#ff8fc8"; rrect(c, x - 13, y - 20, 26, 20, 5); c.fill();
  for (let k = -3; k <= 3; k++) leaf(x + k * 2, y - 16, 34 + (3 - Math.abs(k)) * 6, k * 0.38, k % 2 ? "#3fae78" : "#56c98e");
  [x, y] = P(7.4, 0.45, H); // snake plant
  c.fillStyle = "#b793ff"; rrect(c, x - 11, y - 18, 22, 18, 4); c.fill();
  for (let k = -2; k <= 2; k++) leaf(x + k * 4, y - 16, 44 - Math.abs(k) * 8, k * 0.12, k % 2 ? "#2f8f6a" : "#6fd39a");
  [x, y] = P(8.3, 0.5, H); // flowering
  c.fillStyle = "#5dd0d9"; rrect(c, x - 11, y - 18, 22, 18, 4); c.fill();
  c.fillStyle = "#4fbf88"; c.beginPath(); c.arc(x, y - 30, 16, 0, 7); c.fill();
  glow((c) => { for (const [a, b] of [[-8, -38], [6, -40], [0, -28], [10, -26], [-10, -24]]) { c.fillStyle = "#ffb3dc"; c.beginPath(); c.arc(x + a, y + b, 4, 0, 7); c.fill(); c.fillStyle = "#fff4a8"; c.beginPath(); c.arc(x + a, y + b, 1.4, 0, 7); c.fill(); } });
  // Trailing pothos over the front edge.
  [x, y] = P(8.8, 1, H);
  c.strokeStyle = "#3fae78"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 4, y + 20, x - 8, y + 36, x - 2, y + 56); c.stroke();
  for (let k = 0; k < 5; k++) { c.fillStyle = "#6fd39a"; c.beginPath(); c.ellipse(x - 2 + (k % 2 ? 4 : -4), y + 8 + k * 11, 4, 3, k, 0, 7); c.fill(); }
  if (has("watering_can")) { [x, y] = P(8.9, 1.25, 0); c.fillStyle = "#5dd0d9"; rrect(c, x - 10, y - 18, 20, 18, 5); c.fill(); c.strokeStyle = "#5dd0d9"; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 8, y - 10); c.lineTo(x + 20, y - 22); c.stroke(); }
}

function drawKettle(c, glow) {
  box(c, 9.1, 0.1, 9.9, 0.9, 0, 70, "#6a4a9c", "#3d2966", "#2e1f4f");
  const [x, y] = P(9.5, 0.5, 70);
  c.fillStyle = "#f4ecff"; c.beginPath(); c.ellipse(x, y - 12, 13, 12, 0, 0, 7); c.fill();
  c.fillStyle = "#ff8fc8"; c.fillRect(x - 3, y - 27, 6, 4); c.beginPath(); c.moveTo(x + 11, y - 14); c.lineTo(x + 22, y - 22); c.lineTo(x + 12, y - 8); c.fill();
  c.fillStyle = "#b793ff"; rrect(c, x - 26, y - 10, 9, 9, 2); c.fill();
}

// Free-standing props that can be in front of / behind Trinity.
const SPRITE_PROPS = {
  toolbox: { h: 40, draw(c) { box(c, 9.15, 3.2, 9.85, 3.8, 0, 26, "#ff6b8a", "#d84a70", "#b53a5d", "rgba(255,255,255,.3)"); const [x, y] = P(9.5, 3.5, 26); c.strokeStyle = "#2a1a4a"; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 8, Math.PI, 0); c.stroke(); } },
  workbench: { h: 90, draw(c, glow) {
    box(c, 9.05, 3.05, 9.95, 4.95, 62, 72, "#8a6a4a", "#6a4a34", "#57402c", "rgba(255,255,255,.2)");
    for (const [i, j] of [[9.1, 3.1], [9.9, 3.1], [9.1, 4.9], [9.9, 4.9]]) box(c, i - 0.05, j - 0.05, i + 0.05, j + 0.05, 0, 62, "#57402c", "#4a3424", "#3d2b1e");
    const [x, y] = P(9.5, 4.3, 72); c.fillStyle = "#5dd0d9"; c.fillRect(x - 12, y - 6, 24, 6); c.fillStyle = "#f5d489"; c.fillRect(x + 6, y - 14, 3, 10);
  } },
  telescope: { h: 150, draw(c) {
    const [x, y] = P(1.5, 6, 0);
    c.strokeStyle = "#8a7ab8"; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - 70); c.lineTo(x - 20, y); c.moveTo(x, y - 70); c.lineTo(x + 18, y + 2); c.moveTo(x, y - 70); c.lineTo(x + 2, y + 8); c.stroke();
    c.save(); c.translate(x, y - 74); c.rotate(-0.55); c.fillStyle = "#e9e2ff"; rrect(c, -40, -8, 80, 16, 7); c.fill(); c.fillStyle = "#ff8fc8"; c.fillRect(-10, -8, 6, 16); c.fillStyle = "#2a1a4a"; c.beginPath(); c.ellipse(40, 0, 3, 8, 0, 0, 7); c.fill(); c.restore();
  } },
  speaker: { h: 120, draw(c, glow) {
    box(c, 7.45, 7.9, 8.05, 8.5, 0, 100, "#6a4a9c", "#4a3274", "#38255c", "rgba(255,143,200,.6)");
    plane(c, "j", 8.5, (c) => { for (const [yy, r] of [[-76, 10], [-34, 15]]) { c.fillStyle = "#170f2c"; c.beginPath(); c.arc(7.75 * K, yy, r, 0, 7); c.fill(); glow((c) => { c.strokeStyle = "rgba(255,143,200,.8)"; c.lineWidth = 1.5; c.beginPath(); c.arc(7.75 * K, yy, r - 3, 0, 7); c.stroke(); }); } });
  } },
  plant_2: { h: 150, draw(c) {
    const [x, y] = P(8.95, 8.3, 0);
    c.fillStyle = "#e79a5c"; c.beginPath(); c.moveTo(x - 20, y - 36); c.lineTo(x + 20, y - 36); c.lineTo(x + 15, y); c.lineTo(x - 15, y); c.fill();
    c.fillStyle = "#2f8f6a"; for (let k = 0; k < 9; k++) { c.save(); c.translate(x, y - 34); c.rotate(-1.3 + k * 0.33); c.beginPath(); c.ellipse(0, -38, 11, 34, 0, 0, 7); c.fillStyle = k % 2 ? "#3fae78" : "#56c98e"; c.fill(); c.restore(); }
  } },
};

// --- baking ---------------------------------------------------------------
function makeCanvas(w, h) {
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  return cv;
}
function applyTint(c, L, G, cw, ch) {
  if (L.tintA > 0) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-atop";
    c.fillStyle = `rgba(${L.tint[0]},${L.tint[1]},${L.tint[2]},${L.tintA})`; c.fillRect(0, 0, cw, ch); c.restore();
  }
  // Re-light emissive bits over the tint.
  c.save(); c.globalAlpha = L.glow * Math.min(1, L.tintA * 2.4 + 0.15);
  for (const [m, fn] of G) { c.setTransform(m); fn(c); }
  c.restore();
}
// Bake region [x0,y0,x1,y1] (design px) at `scale` device px per design px.
function bake(scale, rect, draw, L) {
  const [x0, y0, x1, y1] = rect, w = Math.ceil((x1 - x0) * scale), h = Math.ceil((y1 - y0) * scale);
  const cv = makeCanvas(Math.max(1, w), Math.max(1, h)), c = cv.getContext("2d"), G = [];
  c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  draw(c, G);
  applyTint(c, L, G, w, h);
  return { canvas: cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function bakeRoom({ scale, tod, items, archive, feed, season, weather }) {
  const L = TOD[tod] || TOD.afternoon;
  const b = ROOM_BOUNDS;
  const back = bake(scale, [b.x0, b.y0, b.x1, b.y1], (c, G) => drawBack(c, tod, items, G, archive, feed, season, weather), L);
  const props = [];
  for (const key in SPRITE_PROPS) {
    const p = PROPS[key]; if (!p || (p.requires && !items.includes(p.requires))) continue;
    if (key === "toolbox" && items.includes("workbench")) continue; // same corner; the bench has its tools
    const [i0, j0, i1, j1] = p.rect, def = SPRITE_PROPS[key];
    const pts = [P(i0, j0), P(i1, j0), P(i1, j1), P(i0, j1)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const rect = [Math.min(...xs) - 90, Math.min(...ys) - def.h - 40, Math.max(...xs) + 90, Math.max(...ys) + 30];
    const img = bake(scale, rect, (c, G) => def.draw(c, (fn) => { fn(c); G.push([c.getTransform(), fn]); }), L);
    props.push({ key, rect: p.rect, img });
  }
  // `lampOn` lets drawLive() lift the desk when she sits down without needing
  // the unlocked-item list again.
  return { back, props, tod, L, lampOn: items.includes("desk_lamp") && LAMP_TOD.has(tod) };
}

// Moving details, drawn every frame in design coords (camera transform set).
export function drawLive(c, t, room, state, agents) {
  const L = room.L;
  if (state.kst) drawClockHands(c, state.kst.h, state.kst.mi);
  // Desk lamp lift: a warm pool that eases in while she is actually working
  // under it. Only ever adds to the lit lamp, so the baked cone and this agree.
  const wantDesk = room.lampOn && state.atDesk ? 1 : 0;
  room._dg = (room._dg || 0) + (wantDesk - (room._dg || 0)) * 0.08;
  if (room._dg > 0.01) {
    const [lx, ly] = P(4.3, 0.6, 74);
    c.save(); c.globalCompositeOperation = "lighter";
    const lg = c.createRadialGradient(lx, ly - 18, 3, lx, ly, 78);
    lg.addColorStop(0, `rgba(255,224,170,${0.22 * room._dg})`); lg.addColorStop(1, "rgba(255,224,170,0)");
    c.fillStyle = lg; c.beginPath(); c.ellipse(lx, ly - 6, 86, 46, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // Charging pad pulse.
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  c.save(); c.globalCompositeOperation = "lighter";
  c.strokeStyle = `rgba(93,208,217,${0.15 + 0.25 * pulse * (state.charging ? 2 : 1)})`; c.lineWidth = 2;
  isoEllipse(c, 2.6, 8, 0, 0.62 + pulse * 0.12); c.stroke();
  // Monitor cursor blink.
  if ((t * 2 | 0) % 2) plane(c, "j", 0.28, (c) => { c.fillStyle = "rgba(255,255,255,.8)"; c.fillRect(2.45 * K + 20 + 60, -74 - 42, 6, 3); });
  // Twinkles in the window at night, dust motes in daylight.
  if (L.stars) plane(c, "i", 0, (c) => {
    for (let k = 0; k < 5; k++) { const a = 0.5 + 0.5 * Math.sin(t * (1.3 + k * 0.4) + k * 2); c.fillStyle = `rgba(255,255,255,${a * 0.9})`; c.beginPath(); c.arc(4 * K + 14 + k * 23, -205 + ((k * 37) % 50), 1.4, 0, 7); c.fill(); }
  });
  else if (L.sun) for (let k = 0; k < 9; k++) {
    const ph = t * 0.05 + k * 0.13, i = 0.6 + ((ph * 3) % 1) * 3, j = 4.4 + (k % 4) * 0.45, z = 30 + ((k * 53) % 150) + Math.sin(t + k) * 8;
    const [x, y] = P(i, j, z); c.fillStyle = `rgba(255,240,220,${0.25 + 0.2 * Math.sin(t * 1.7 + k)})`; c.beginPath(); c.arc(x, y, 1.3, 0, 7); c.fill();
  }
  c.restore();

  // Charge column on the rig: four cells driven by her real energy, not the
  // four lights the old pod had painted on permanently.
  if (state.energy != null) {
    const e = Math.max(0, Math.min(100, state.energy));
    const lit = Math.min(4, Math.ceil(e / 25));
    const col = e < 25 ? "#ff7aa8" : e < 50 ? "#f5d489" : "#7ee0a8";
    c.save();
    plane(c, "i", 0.05, (c) => {
      for (let k = 0; k < 4; k++) {
        const y = -130 - k * 11;
        c.fillStyle = "rgba(9,5,20,.8)"; rrect(c, 6.78 * K, y - 8, 10.4, 8, 2); c.fill();
        if (k >= lit) continue;
        c.globalAlpha = state.charging ? 0.5 + 0.5 * Math.sin(t * 3.4 - k * 0.7) : 1;
        c.fillStyle = col; rrect(c, 6.98 * K - 7.6, y - 6.6, 7.6, 5.2, 1.5); c.fill();
        c.globalAlpha = 1;
      }
    });
    c.restore();
  }
  if (agents && agents.length) drawAgents(c, t, agents);
  drawWeather(c, t, state.weather);
}

// Weather on the glass. Clipped to the window, drawn in the window's own plane
// so the streaks lie on the pane rather than floating in the room.
function drawWeather(c, t, code) {
  if (!code || code === "clear" || code === "cloud") return;
  const w = WIN.u1 - WIN.u0, h = WIN.y1 - WIN.y0;
  c.save();
  plane(c, "i", 0, (c) => {
    c.save();
    rrect(c, WIN.u0, WIN.y0, w, h, 6); c.clip();
    if (code === "rain" || code === "storm") {
      c.strokeStyle = "rgba(196,226,255,.42)"; c.lineWidth = 1; c.beginPath();
      for (let k = 0; k < 26; k++) {
        const x = WIN.u0 + ((k * 37.3) % w), y = WIN.y0 + ((t * (62 + (k % 5) * 20) + k * 53) % (h + 22)) - 11;
        c.moveTo(x, y); c.lineTo(x - 2.4, y + 9);
      }
      c.stroke();
      if (code === "storm") {
        const ph = (t * 0.23) % 1, f = ph < 0.05 ? 1 - ph / 0.05 : 0;
        if (f > 0) { c.fillStyle = `rgba(206,224,255,${0.38 * f})`; c.fillRect(WIN.u0, WIN.y0, w, h); }
      }
    } else if (code === "snow") {
      c.fillStyle = "rgba(255,255,255,.85)";
      for (let k = 0; k < 24; k++) {
        const x = WIN.u0 + ((k * 41.7) % w) + Math.sin(t * 0.6 + k) * 5;
        const y = WIN.y0 + ((t * (11 + (k % 4) * 5) + k * 67) % (h + 16)) - 8;
        c.beginPath(); c.arc(x, y, 0.9 + (k % 3) * 0.35, 0, 7); c.fill();
      }
    } else if (code === "fog") {
      for (let k = 0; k < 3; k++) {
        const y = WIN.y0 + h * (0.3 + k * 0.22) + Math.sin(t * 0.18 + k * 1.7) * 6;
        c.fillStyle = `rgba(206,212,234,${0.1 + k * 0.035})`;
        c.fillRect(WIN.u0, y, w, 16 + k * 7);
      }
    }
    c.restore();
  });
  c.restore();
}

// Disco ball hangs from the ceiling above the rug; drawn after entities.
export function drawTop(c, t, items, party) {
  if (!items.includes("disco_light")) return;
  const [x, y] = P(5.5, 5.5, 330);
  c.strokeStyle = "rgba(200,190,255,.5)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y - 60); c.lineTo(x, y - 14); c.stroke();
  const g = c.createRadialGradient(x - 5, y - 5, 2, x, y, 15); g.addColorStop(0, "#fff"); g.addColorStop(1, "#8a7ab8");
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 14, 0, 7); c.fill();
  if (!party) return;
  c.save(); c.globalCompositeOperation = "lighter";
  const cols = ["255,143,200", "93,208,217", "245,212,137", "183,147,255"];
  for (let k = 0; k < 8; k++) { const a = t * 0.9 + k * 0.785, [fx, fy] = P(5.5 + Math.cos(a) * 1.6, 5.5 + Math.sin(a) * 1.6); c.fillStyle = `rgba(${cols[k % 4]},.35)`; c.beginPath(); c.ellipse(fx, fy, 14, 7, 0, 0, 7); c.fill(); }
  c.restore();
}

export { isoEllipse };
