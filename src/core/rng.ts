/** 種(seed)から毎回同じ乱数列を作る。DNAやバトルの再現に使う。 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** 重み付き抽選。weights の合計が 0 のときは先頭を返す。 */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((s, w) => s + Math.max(w, 0), 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(weights[i], 0);
    if (r < 0) return items[i];
  }
  return items[0];
}

/** 端末の暗号乱数から新しい種を作る(誕生のたびに使う)。 */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}
