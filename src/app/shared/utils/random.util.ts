/**
 * Seeded PRNG helpers for deterministic mock data (same seed → same data,
 * so mock records survive reloads and deep links). Mock-only — nothing in
 * production code paths should depend on these.
 */

/** mulberry32 — tiny, fast, good-enough distribution for fixtures. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit seed. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];
export const int = (r: () => number, min: number, max: number): number => Math.floor(min + r() * (max - min + 1));
