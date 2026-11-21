import { describe, expect, it } from 'vitest';
import { DASH, DASH_COINS, newDash, step } from './dash';

describe('MONZ DASH の コイン(2026-11-21 企画者)', () => {
  it('300m より 前には ない・100m に 約5枚・1つの 組は 3枚まで(散らばる)', () => {
    for (const seed of [1, 2, 3]) {
      const s = newDash(seed);
      const seen = new Map<string, { x: number; y: number }>();
      for (let i = 0; i < 400; i++) {
        s.over = false;
        s.y = -2000;
        s.vy = 0;
        s.dist += 400;
        step(s, 0.0001);
        for (const c of s.coins) seen.set(`${c.x},${c.y}`, c);
      }
      const xs = [...seen.values()].map((c) => c.x).sort((a, b) => a - b);
      expect(xs[0]).toBeGreaterThanOrEqual(DASH_COINS.fromM * DASH.pxPerMeter);
      const meters = (s.dist - DASH_COINS.fromM * DASH.pxPerMeter) / DASH.pxPerMeter;
      const per100 = xs.length / (meters / DASH_COINS.everyM);
      expect(per100).toBeGreaterThan(3.5);
      expect(per100).toBeLessThan(6);
      // 近くに 並ぶ コインは 3枚まで
      let run = 1;
      for (let i = 1; i < xs.length; i++) {
        run = xs[i] - xs[i - 1] < 200 ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(DASH_COINS.maxRun);
      }
    }
  });

  it('走って いれば 足場の 上の コインを 拾う', () => {
    const s = newDash(5);
    s.coins.push({ x: s.dist + DASH.runnerX + 80, y: s.y - DASH.runnerH / 2, taken: false });
    for (let i = 0; i < 60; i++) step(s, 1 / 60);
    expect(s.picked).toBe(1);
  });
});
