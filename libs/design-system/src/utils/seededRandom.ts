/**
 * FNV-1a string hash — the seed step shared by {@link seededRandom} and any
 * consumer that also needs a raw numeric hash of the same seed (e.g. `AgentGlyph`'s
 * per-seed animation-delay offset, ported from `zibby.js`'s `hash()`).
 */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic 0..1 PRNG seeded from a string (stable orbits across renders).
 * Ported verbatim from `velin-d-map.jsx`'s `vcRand`.
 */
export function seededRandom(seed: string): () => number {
  let h = hashSeed(seed);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
