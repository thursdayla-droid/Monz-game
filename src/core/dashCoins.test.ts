import { describe, expect, it } from 'vitest';
import { DASH, DASH_COINS, newDash, step } from './dash';

describe('MONZ DASH の コイン(2026-11-21 企画者)', () => {
  it('300m より 前には ない・あとは 5枚ずつ・100m ごとに 1組くらい', () => {
    for (const seed of [1, 2, 3]) {
      const s = newDash(seed);
      const seen = new Map<number, { x: number; y: number }>();
      for (let i = 0; i < 400; i++) {
        s.over = false;
        s.y = -2000;
        s.vy = 0;
        s.dist += 400;
        step(s, 0.0001);
        for (const c of s.coins) seen.set(c.x * 1e4 + c.y, c);
      }
      const xs = [...seen.values()].map((c) => c.x).sort((a, b) => a - b);
      expect(xs.length % DASH_COINS.perGroup).toBe(0);
      expect(xs[0]).toBeGreaterThanOrEqual(DASH_COINS.fromM * DASH.pxPerMeter);
      const groups = xs.length / DASH_COINS.perGroup;
      const meters = (s.dist - DASH_COINS.fromM * DASH.pxPerMeter) / DASH.pxPerMeter;
      expect(groups).toBeGreaterThan(meters / DASH_COINS.everyM - 3);
      expect(groups).toBeLessThanOrEqual(meters / DASH_COINS.everyM + 2);
    }
  });

  it('走って いれば 足場の 上の コインを 拾う', () => {
    const s = newDash(5);
    s.coins.push({ x: s.dist + DASH.runnerX + 80, y: s.y - DASH.runnerH / 2, taken: false });
    for (let i = 0; i < 60; i++) step(s, 1 / 60);
    expect(s.picked).toBe(1);
  });
});
