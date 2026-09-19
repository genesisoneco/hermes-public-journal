// Walkability grid + A* for the 10x10 room.
// A tile (i, j) is blocked when a non-walkable prop's footprint covers the
// tile's centre point. Props with `requires` only exist once unlocked.
import { PROPS, WORLD } from "./rules.js";

const BODY_R = 0.22; // Trinity's footprint radius in tiles, for line-of-sight

export function buildGrid(unlockedItems) {
  const cols = WORLD.cols, rows = WORLD.rows;
  const have = new Set(unlockedItems || []);
  const blocked = new Uint8Array(cols * rows);
  for (const key of Object.keys(PROPS)) {
    const p = PROPS[key];
    if (p.walkable) continue;
    if (p.requires && !have.has(p.requires)) continue;
    const [i0, j0, i1, j1] = p.rect;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const ci = i + 0.5, cj = j + 0.5;
        if (ci >= i0 && ci < i1 && cj >= j0 && cj < j1) blocked[j * cols + i] = 1;
      }
    }
  }
  return { cols, rows, blocked };
}

export function isBlocked(grid, i, j) {
  if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return true;
  return grid.blocked[j * grid.cols + i] === 1;
}

// Point-level test (float tile coords).
export function blockedAt(grid, i, j) {
  return isBlocked(grid, Math.floor(i), Math.floor(j));
}

function clampTile(v, max) {
  return Math.min(max - 1, Math.max(0, Math.floor(v)));
}

export function nearestFree(grid, p) {
  const ti = clampTile(p.i, grid.cols), tj = clampTile(p.j, grid.rows);
  const inside = p.i >= 0 && p.j >= 0 && p.i < grid.cols && p.j < grid.rows;
  if (inside && !isBlocked(grid, ti, tj)) return { i: p.i, j: p.j };
  let best = null, bestD = Infinity;
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      if (isBlocked(grid, i, j)) continue;
      const di = i + 0.5 - p.i, dj = j + 0.5 - p.j;
      const d = di * di + dj * dj;
      if (d < bestD - 1e-9) { bestD = d; best = { i: i + 0.5, j: j + 0.5 }; }
    }
  }
  return best || { i: 5.5, j: 5.5 };
}

// Swept line-of-sight with a body radius, sampled every 0.05 tiles.
function clearLine(grid, a, b, startTile) {
  const di = b[0] - a[0], dj = b[1] - a[1];
  const len = Math.sqrt(di * di + dj * dj);
  const n = Math.max(1, Math.ceil(len / 0.05));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const pi = a[0] + di * t, pj = a[1] + dj * t;
    for (let oi = -1; oi <= 1; oi += 2) {
      for (let oj = -1; oj <= 1; oj += 2) {
        const ti = Math.floor(pi + oi * BODY_R), tj = Math.floor(pj + oj * BODY_R);
        if (startTile && ti === startTile[0] && tj === startTile[1]) continue;
        if (isBlocked(grid, ti, tj)) return false;
      }
    }
  }
  return true;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function findPath(grid, from, to) {
  const cols = grid.cols, rows = grid.rows;
  const si = clampTile(from.i, cols), sj = clampTile(from.j, rows);
  const gi = clampTile(to.i, cols), gj = clampTile(to.j, rows);
  if (isBlocked(grid, gi, gj)) return [];
  const start = sj * cols + si, goal = gj * cols + gi;
  const startPt = [from.i, from.j], goalPt = [to.i, to.j];
  if (start === goal) return [startPt, goalPt].map(([i, j]) => [round3(i), round3(j)]);

  const N = cols * rows;
  const g = new Float64Array(N).fill(Infinity);
  const f = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = [start];
  const h = (idx) => {
    const i = idx % cols, j = (idx - i) / cols;
    const dx = Math.abs(i - gi), dy = Math.abs(j - gj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  g[start] = 0; f[start] = h(start);
  // The start tile counts as free even if she was knocked onto a prop.
  const free = (i, j) => (j * cols + i) === start || !isBlocked(grid, i, j);

  while (open.length) {
    // Linear scan: the grid is 100 cells, a heap is not worth it.
    // Ties break on lower index so results are stable everywhere.
    let bi = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k], b = open[bi];
      if (f[a] < f[b] - 1e-9 || (Math.abs(f[a] - f[b]) <= 1e-9 && a < b)) bi = k;
    }
    const cur = open[bi];
    open.splice(bi, 1);
    if (cur === goal) break;
    closed[cur] = 1;
    const ci = cur % cols, cj = (cur - ci) / cols;
    for (const [di, dj, cost] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nidx = nj * cols + ni;
      if (closed[nidx] || !free(ni, nj)) continue;
      // No corner cutting: both orthogonal neighbours must be open.
      if (di !== 0 && dj !== 0 && (!free(ci + di, cj) || !free(ci, cj + dj))) continue;
      const ng = g[cur] + cost;
      if (ng < g[nidx] - 1e-9) {
        g[nidx] = ng; f[nidx] = ng + h(nidx); came[nidx] = cur;
        if (!open.includes(nidx)) open.push(nidx);
      }
    }
  }
  if (came[goal] === -1) return [];

  const tiles = [];
  for (let c = goal; c !== -1; c = came[c]) tiles.push(c);
  tiles.reverse();
  const raw = [startPt];
  for (let k = 1; k < tiles.length - 1; k++) {
    const i = tiles[k] % cols, j = (tiles[k] - i) / cols;
    raw.push([i + 0.5, j + 0.5]);
  }
  raw.push(goalPt);

  // String-pull smoothing: from each anchor, jump to the farthest visible point.
  const startTile = [si, sj];
  const out = [raw[0]];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let far = anchor + 1;
    for (let k = raw.length - 1; k > anchor + 1; k--) {
      if (clearLine(grid, raw[anchor], raw[k], anchor === 0 ? startTile : null)) { far = k; break; }
    }
    out.push(raw[far]);
    anchor = far;
  }
  return out.map(([i, j]) => [round3(i), round3(j)]);
}

export function pathLength(path) {
  let d = 0;
  for (let k = 1; k < path.length; k++) {
    const di = path[k][0] - path[k - 1][0], dj = path[k][1] - path[k - 1][1];
    d += Math.sqrt(di * di + dj * dj);
  }
  return d;
}

function round3(v) { return Math.round(v * 1000) / 1000; }
