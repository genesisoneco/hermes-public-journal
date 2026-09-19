// Isometric projection between tile space (i, j, z) and the 1600x900 design
// canvas. See docs/habitat/CONTRACT.md section 1.
import { WORLD } from "./rules.js";

const OX = WORLD.origin.x, OY = WORLD.origin.y, TW = WORLD.tileW, TH = WORLD.tileH;

export function worldToScreen(i, j, z = 0) {
  return { x: OX + (i - j) * TW, y: OY + (i + j) * TH - z };
}

export function screenToWorld(x, y) {
  const a = (x - OX) / TW; // i - j
  const b = (y - OY) / TH; // i + j
  return { i: (a + b) / 2, j: (b - a) / 2 };
}

export function facingFromDelta(di, dj) {
  const dx = (di - dj) * TW;
  const dy = (di + dj) * TH;
  if (dx === 0 && dy === 0) return "F";
  if (Math.abs(dx) > 1.2 * Math.abs(dy)) return dx > 0 ? "R" : "L";
  return dy > 0 ? "F" : "B";
}
