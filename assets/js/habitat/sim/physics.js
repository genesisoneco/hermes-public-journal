// Fling physics for pushes. Fixed 1/60 s steps and no transcendental maths,
// so the same (start, v, grid) gives bit-identical frames on the server and
// on every client.
//
// Units: i/j in tiles, vi/vj in tiles per second, z in design px (0 = floor),
// vz in design px per second.
import { WORLD } from "./rules.js";
import { blockedAt } from "./grid.js";

export const FLING = {
  maxH: 7,          // tiles/s at |vi| or |vj| = 1 in the client message
  maxZ: 420,        // px/s at vz = 1
  gravity: 1100,    // px/s^2
  friction: 6,      // tiles/s^2 while sliding on the floor
  restitution: 0.55, // wall / prop bounce
  floorBounce: 0.3,
  bounceMinVz: 140, // px/s: slower touchdowns just stop
  propHeight: 60,   // px: flying higher than this clears furniture
  body: 0.3,        // tiles from the walls
  knockdownAt: 3.5, // impact units (see below)
  maxSec: 4,
};

const DT = 1 / 60;

// Client push message ({vi,vj,vz} each in [-1,1]) -> physical velocity.
export function flingVelocity(msg) {
  const c = (x) => {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
  };
  return {
    vi: r3(c(msg && msg.vi) * FLING.maxH),
    vj: r3(c(msg && msg.vj) * FLING.maxH),
    vz: r3(Math.max(0, c(msg && msg.vz)) * FLING.maxZ),
  };
}

// impact = max(touchdown speed / 80, fastest wall/prop hit in tiles/s).
export function simulateFling(start, v, grid, opts) {
  const o = Object.assign({}, FLING, opts || {});
  const lo = o.body, hiI = WORLD.cols - o.body, hiJ = WORLD.rows - o.body;
  let i = +start.i || 0, j = +start.j || 0, z = Math.max(0, +start.z || 0);
  let vi = +v.vi || 0, vj = +v.vj || 0, vz = +v.vz || 0;
  let t = 0, impact = 0, step = 0;
  const frames = [{ t: 0, i: r3(i), j: r3(j), z: r3(z) }];
  const maxSteps = Math.round(o.maxSec / DT);

  while (step < maxSteps) {
    step++;
    t = step * DT;
    const airborne = z > 0 || vz > 0;
    if (airborne) vz -= o.gravity * DT;
    let ni = i + vi * DT, nj = j + vj * DT, nz = z + vz * DT;

    // Room walls.
    if (ni < lo) { impact = Math.max(impact, Math.abs(vi)); ni = lo + (lo - ni); vi = -vi * o.restitution; }
    else if (ni > hiI) { impact = Math.max(impact, Math.abs(vi)); ni = hiI - (ni - hiI); vi = -vi * o.restitution; }
    if (nj < lo) { impact = Math.max(impact, Math.abs(vj)); nj = lo + (lo - nj); vj = -vj * o.restitution; }
    else if (nj > hiJ) { impact = Math.max(impact, Math.abs(vj)); nj = hiJ - (nj - hiJ); vj = -vj * o.restitution; }

    // Furniture: axis-separated AABB test against blocked tiles.
    if (grid && nz < o.propHeight) {
      const fromBlocked = blockedAt(grid, i, j);
      if (!fromBlocked && blockedAt(grid, ni, j)) {
        impact = Math.max(impact, Math.abs(vi));
        vi = -vi * o.restitution; ni = i;
      }
      if (!fromBlocked && blockedAt(grid, ni, nj)) {
        impact = Math.max(impact, Math.abs(vj));
        vj = -vj * o.restitution; nj = j;
      }
    }

    // Floor.
    if (nz <= 0) {
      nz = 0;
      if (vz < 0) {
        impact = Math.max(impact, -vz / 80);
        vz = -vz > o.bounceMinVz ? -vz * o.floorBounce : 0;
      }
    }

    // Sliding friction.
    if (nz === 0 && vz === 0) {
      const sp = Math.sqrt(vi * vi + vj * vj);
      const dec = o.friction * DT;
      if (sp <= dec) { vi = 0; vj = 0; }
      else { const k = (sp - dec) / sp; vi *= k; vj *= k; }
    }

    i = ni; j = nj; z = nz;
    const done = z === 0 && vz === 0 && vi === 0 && vj === 0;
    if (step % 2 === 0 || done) frames.push({ t: r3(t), i: r3(i), j: r3(j), z: r3(z) });
    if (done) break;
  }

  return {
    frames,
    landing: { i: r3(i), j: r3(j) },
    impact: r3(impact),
    outcome: impact >= o.knockdownAt ? "knockdown" : "land",
  };
}

function r3(v) { return Math.round(v * 1000) / 1000; }
