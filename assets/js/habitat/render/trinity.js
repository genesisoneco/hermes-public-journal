// Trinity drawing. Two back-ends behind one call:
//  - atlas frames (the real sprites, CONTRACT §4)
//  - a procedural placeholder bunny, used until atlas.json loads (or if it fails)
// Both draw with the feet anchor at (0,0) in design px; the scene applies the
// procedural springs (squash/stretch, lean, bob) around that anchor.

export const BODY_H = 118; // design px from feet to ear tips (placeholder); atlas uses its own frames

const EXPR = {
  sleep: "closed", charging: "closed", listen: "calm", love: "heart", happy: "joy", victory: "joy", dance: "joy",
  angry: "angry", surprised: "wide", confused: "squint", sad: "sad", hurt: "x", knockdown: "x", die: "x",
  slip: "squint", low_battery: "sad", wake_up: "calm", tickle: "joy", spin: "joy", hack: "focus", scan: "focus", repair: "focus",
};

function ellipse(c, x, y, rx, ry, rot, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }

// anim: full key (e.g. "walk_R"), ph: 0..1 through the anim, t: seconds.
export function drawPlaceholder(c, anim, ph, t, facing) {
  const fam = anim.replace(/_[FBLR]$/, "");
  const fc = /_([FBLR])$/.test(anim) ? anim.slice(-1) : facing || "F";
  const TAU = Math.PI * 2, s = Math.sin(ph * TAU);
  let bodyY = -52, rot = 0, squash = 1, alpha = 1, earA = 0, armL = 0, armR = 0, lying = 0;
  if (fam === "walk" || fam === "run") { bodyY -= Math.abs(s) * (fam === "run" ? 9 : 5); rot = (fam === "run" ? 0.08 : 0.04) * (fc === "L" ? -1 : fc === "R" ? 1 : 0); armL = s * 0.5; armR = -s * 0.5; }
  if (fam === "dance") { rot = s * 0.2; bodyY -= Math.abs(Math.sin(ph * TAU * 2)) * 8; armL = -1.2 + s; armR = -1.2 - s; }
  if (fam === "wave") armR = -2.2 + Math.sin(t * 12) * 0.4;
  if (fam === "victory" || fam === "happy") { bodyY -= Math.abs(s) * 10; armL = -2; armR = -2; }
  if (fam === "jump" || fam === "hover" || fam === "fly") { bodyY -= 14 + s * 4; squash = 1.06; }
  if (fam === "sit" || fam === "sleep" || fam === "charging" || fam === "low_battery") { bodyY += 8; squash = 0.9; }
  if (fam === "knockdown" || fam === "die") lying = 1;
  if (fam === "recover") lying = 1 - ph;
  if (fam === "spin") rot = ph * TAU;
  if (fam === "teleport_out") { alpha = 1 - ph; squash = 1 + ph * 0.6; }
  if (fam === "teleport_in") { alpha = ph; squash = 1.6 - ph * 0.6; }
  if (fam === "ear_wiggle" || fam === "tickle") earA = Math.sin(t * 18) * 0.25;
  if (fam === "hurt" || fam === "angry") rot = Math.sin(t * 30) * 0.05;
  if (fam === "slip") rot = Math.sin(ph * Math.PI) * 0.6;

  c.save(); c.globalAlpha *= alpha;
  if (lying) { c.translate(0, -8 * lying); c.rotate(lying * 1.35); }
  c.translate(0, bodyY); c.rotate(rot); c.scale(1 / Math.sqrt(squash), squash);
  const flip = fc === "L" ? -1 : 1, side = fc === "L" || fc === "R", back = fc === "B";
  c.scale(flip, 1);

  // Ears (behind the head).
  for (const sgn of [-1, 1]) {
    c.save(); c.translate(sgn * 14 + (side ? -6 : 0), -32); c.rotate(sgn * 0.18 + earA * sgn + (side ? -0.15 : 0));
    ellipse(c, 0, -20, 11, 24, 0, "#ff8fc8");
    if (!back) ellipse(c, 0, -19, 5.5, 16, 0, "#ffd2e6");
    c.restore();
  }
  // Feet.
  const fk = fam === "walk" || fam === "run" ? s * 4 : 0;
  ellipse(c, -14 + fk, 46 - Math.max(0, -s) * 3, 12, 7, 0, "#f47bb4");
  ellipse(c, 14 - fk, 46 - Math.max(0, s) * 3, 12, 7, 0, "#f47bb4");
  // Body.
  const g = c.createRadialGradient(-14, -18, 4, 0, 0, 46);
  g.addColorStop(0, "#ffe0ef"); g.addColorStop(0.45, "#ff93c6"); g.addColorStop(1, "#e2559c");
  c.beginPath(); c.arc(0, 0, 40, 0, TAU); c.fillStyle = g; c.fill();
  // Arms.
  for (const [sx, a] of [[-1, armL], [1, armR]]) { c.save(); c.translate(sx * 30, 16); c.rotate(a * sx); ellipse(c, sx * 4, 6, 9, 12, 0, "#ff86bf"); c.restore(); }
  // Headphones.
  const cups = back ? [[-38, 1], [38, 1]] : side ? [[-4, 1.15]] : [[-39, 1], [39, 1]];
  if (!side) { c.strokeStyle = "#ffb8d9"; c.lineWidth = 5; c.beginPath(); c.arc(0, -4, 41, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  for (const [x, k] of cups) {
    ellipse(c, x, -2, 11 * k, 15 * k, 0, "#ffc4df");
    ellipse(c, x + (side ? 0 : x > 0 ? 2 : -2), -2, 7 * k, 10 * k, 0, "#ff4f9a");
    ellipse(c, x + (side ? 0 : x > 0 ? 2 : -2), -2, 3.5 * k, 5 * k, 0, "#ffe6f2");
  }
  if (back) { ellipse(c, 0, 26, 9, 9, 0, "#fff4fa"); c.restore(); return; }
  // Belly badge "TR" (never mirrored: undo flip for the text).
  const bx = side ? 16 : 0;
  ellipse(c, bx, 22, side ? 13 : 19, 13, 0, "#fff2f8");
  c.save(); c.scale(flip, 1); c.fillStyle = "#e0428c"; c.font = "800 12px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("TR", bx * flip, 23); c.restore();
  // Face.
  const ex = side ? [20] : [-13, 13], ey = -6, expr = EXPR[fam] || "open";
  const blink = expr === "open" && (t % 3.7) < 0.12;
  c.fillStyle = "#1a0a14"; c.strokeStyle = "#1a0a14"; c.lineWidth = 2.6; c.lineCap = "round";
  for (const x of ex) {
    if (expr === "closed" || expr === "calm" || blink) { c.beginPath(); c.arc(x, ey - 1, 5, 0.2, Math.PI - 0.2); c.stroke(); }
    else if (expr === "joy") { c.beginPath(); c.arc(x, ey + 3, 5, Math.PI + 0.3, -0.3); c.stroke(); }
    else if (expr === "x") { c.beginPath(); c.moveTo(x - 4, ey - 4); c.lineTo(x + 4, ey + 4); c.moveTo(x + 4, ey - 4); c.lineTo(x - 4, ey + 4); c.stroke(); }
    else if (expr === "heart") { c.fillStyle = "#ff3d8a"; c.beginPath(); c.moveTo(x, ey + 5); c.bezierCurveTo(x - 9, ey - 2, x - 4, ey - 9, x, ey - 3); c.bezierCurveTo(x + 4, ey - 9, x + 9, ey - 2, x, ey + 5); c.fill(); c.fillStyle = "#1a0a14"; }
    else if (expr === "squint") { c.beginPath(); c.moveTo(x - 5, ey); c.lineTo(x + 5, ey - 1); c.stroke(); }
    else {
      const big = expr === "wide" ? 1.3 : 1;
      ellipse(c, x, ey, 5.5 * big, 7 * big, 0, "#1a0a14");
      ellipse(c, x + 1.8, ey - 3, 2 * big, 2.2 * big, 0, "#fff");
      if (expr === "angry") { c.beginPath(); c.moveTo(x - 6 * Math.sign(x || 1), ey - 12); c.lineTo(x + 5 * Math.sign(x || 1), ey - 8); c.stroke(); }
      if (expr === "sad") { c.beginPath(); c.moveTo(x - 5 * Math.sign(x || 1), ey - 9); c.lineTo(x + 5 * Math.sign(x || 1), ey - 12); c.stroke(); }
    }
  }
  // Blush + mouth.
  c.globalAlpha *= 0.55; for (const x of side ? [8] : [-23, 23]) ellipse(c, x, ey + 9, 6, 3.5, 0, "#ff4f8a"); c.globalAlpha /= 0.55;
  const mx = side ? 26 : 0; c.lineWidth = 2;
  c.beginPath();
  if (expr === "wide") { ellipse(c, mx, ey + 13, 3, 4, 0, "#1a0a14"); }
  else if (expr === "sad" || expr === "angry") { c.arc(mx, ey + 17, 4, Math.PI + 0.5, -0.5); c.stroke(); }
  else { c.arc(mx - 2.5, ey + 10, 2.5, 0.2, Math.PI - 0.2); c.moveTo(mx + 5, ey + 10.5); c.arc(mx + 2.5, ey + 10, 2.5, 0.2, Math.PI - 0.2); c.stroke(); }
  // Props held in some anims.
  if (fam === "hack") { c.save(); c.scale(flip, 1); c.fillStyle = "#3b4a7a"; c.fillRect(-20, 22, 40, 5); c.fillStyle = "#5dd0d9"; c.globalAlpha *= 0.85; c.beginPath(); c.moveTo(-18, 22); c.lineTo(-14, 4); c.lineTo(18, 4); c.lineTo(18, 22); c.fill(); c.restore(); }
  if (fam === "pick_up" || fam === "carry") { c.fillStyle = "#c98a5a"; c.fillRect(12, 8, 24, 20); c.fillStyle = "#a86e44"; c.fillRect(12, 14, 24, 3); }
  if (fam === "scan") { c.save(); c.scale(flip, 1); c.globalAlpha *= 0.6 + 0.3 * Math.sin(t * 6); c.strokeStyle = "#8fe9f0"; c.lineWidth = 1.5; c.strokeRect(26, -30, 26, 20); c.fillStyle = "rgba(93,208,217,.3)"; c.fillRect(26, -30, 26, 20); c.restore(); }
  c.restore();
}

// Draw an atlas frame with its anchor at (0,0). `img` = page bitmap at `res` (1 or 2).
export function drawFrame(c, img, fr, res, flip) {
  c.save();
  if (flip) c.scale(-1, 1);
  c.drawImage(img, fr.x * res, fr.y * res, fr.w * res, fr.h * res, -fr.ax, -fr.ay, fr.w, fr.h);
  c.restore();
}
