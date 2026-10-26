import { describe, expect, it } from 'vitest';
import { randomDeck, simulate } from '../src/core/mythclash/sim';

describe('MYTHCLASH simulation', () => {
  it('is reproducible with the same seed and always finishes', () => {
    const a = simulate(30, 12345);
    const b = simulate(30, 12345);
    expect(a).toEqual(b);
    expect(a.avgRounds).toBeGreaterThan(2);
    expect(a.avgRounds).toBeLessThan(200);
  });

  // MYTHCLASH_SIM=1 npx vitest run tests/mythclash.sim.test.ts で、くわしい結果を出す
  it.runIf(process.env.MYTHCLASH_SIM)('report', () => {
    const fmt = (r: ReturnType<typeof simulate>) => JSON.stringify(r, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
    console.log('ALL random', fmt(simulate(3000, 20261026)));
    for (const [x, y] of [['N', 'N'], ['SR', 'SR'], ['SEC+UR', 'SR'], ['SR', 'N'], ['R', 'N']] as const) {
      const pick = (s: string) => (r: () => number) => randomDeck(r, s === 'SEC+UR' ? ['SEC', 'UR'] : [s as 'N']);
      console.log(`${x} vs ${y}`, fmt(simulate(2000, 777, (r) => [pick(x)(r), pick(y)(r)])));
    }
  });
});
