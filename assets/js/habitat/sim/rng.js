// Seeded randomness for the habitat sim. Same seed, same numbers, on every
// client and inside the Durable Object.

// mulberry32: tiny, fast, good enough for picking lines and dice rolls.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 32-bit FNV-1a with a murmur-style finaliser. Returns an unsigned int.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Helpers (not part of the contract, but handy everywhere).
export function pick(rng, arr) {
  if (!arr || !arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function range(rng, min, max) {
  return min + (max - min) * rng();
}
