import { describe, expect, it } from 'vitest';
import { applyResult, ballAt, canSwing, judge, levelFor, markerLead, newSlugger, nextPitch, passed, rngOf, SLUG, SLUG_LEVELS, sluggerReward } from '../src/core/slugger';

describe('MONZ SLUGGER', () => {
  it('the ball leaves the pitcher and arrives exactly at its target, even when it breaks', () => {
    const s = newSlugger(3);
    s.streak = 60;
    for (let i = 0; i < 50; i++) {
      const p = nextPitch(s);
      const start = ballAt(p, 0);
      expect(start.x).toBeCloseTo(SLUG.release.x);
      expect(start.z).toBe(1);
      const end = ballAt(p, 1);
      expect(end.x).toBeCloseTo(p.tx);
      expect(end.y).toBeCloseTo(p.ty);
      expect(end.z).toBe(0);
      // 着く所はカーソルが届く範囲
      expect(Math.abs(p.tx)).toBeLessThan(SLUG.cursorLimit);
      expect(Math.abs(p.ty)).toBeLessThan(SLUG.cursorLimit);
    }
  });

  it('judges by both position and timing', () => {
    const p = { kind: 'straight' as const, flight: 1.2, tx: 0.2, ty: -0.1, bx: 0, by: 0 };
    const rng = () => 0.5;
    expect(judge(p, 1.2, { x: 0.2, y: -0.1 }, rng).grade).toBe('perfect');
    expect(judge(p, 1.2 + 0.06, { x: 0.2, y: -0.1 }, rng).grade).toBe('great');
    expect(judge(p, 1.2, { x: 0.2 + 0.4, y: -0.1 }, rng).grade).toBe('good');
    expect(judge(p, 1.2 - 0.2, { x: 0.2, y: -0.1 }, rng).grade).toBe('miss');
    expect(judge(p, 1.2, { x: -0.6, y: -0.1 }, rng).grade).toBe('miss');
    expect(judge(p, null, { x: 0.2, y: -0.1 }, rng).grade).toBe('miss');
    // perfect は特大ホームラン
    expect(judge(p, 1.2, { x: 0.2, y: -0.1 }, rng).homerun).toBe(true);
    expect(judge(p, 1.2, { x: 0.6, y: -0.1 }, rng).homerun).toBe(false);
  });

  it('swing window: too early is not accepted, the ball passes after the good window', () => {
    const p = { kind: 'straight' as const, flight: 1, tx: 0, ty: 0, bx: 0, by: 0 };
    expect(canSwing(p, 0.5)).toBe(false);
    expect(canSwing(p, 1 - SLUG.swingEarly)).toBe(true);
    expect(passed(p, 1 + SLUG.timing.good - 0.01)).toBe(false);
    expect(passed(p, 1 + SLUG.timing.good + 0.01)).toBe(true);
  });

  it('three misses end the game, and a miss resets the streak', () => {
    const s = newSlugger(1);
    const hit = judge({ kind: 'straight', flight: 1, tx: 0, ty: 0, bx: 0, by: 0 }, 1, { x: 0, y: 0 }, () => 0.5);
    const miss = judge({ kind: 'straight', flight: 1, tx: 0, ty: 0, bx: 0, by: 0 }, null, { x: 0, y: 0 });
    applyResult(s, hit);
    applyResult(s, hit);
    expect(s.streak).toBe(2);
    applyResult(s, miss);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    applyResult(s, miss);
    expect(s.over).toBe(false);
    applyResult(s, miss);
    expect(s.over).toBe(true);
  });

  it('combo raises the points of each hit', () => {
    const s = newSlugger(1);
    const hit = () => judge({ kind: 'straight', flight: 1, tx: 0, ty: 0, bx: 0, by: 0 }, 1, { x: 0, y: 0 }, () => 0);
    const first = applyResult(s, hit()).points;
    let last = first;
    for (let i = 0; i < 10; i++) last = applyResult(s, hit()).points;
    expect(last).toBeGreaterThan(first);
    expect(s.score).toBeGreaterThan(0);
    expect(s.perfects).toBe(11);
    expect(s.homeruns).toBe(11);
  });

  it('gets harder step by step with the streak, never suddenly', () => {
    let prev = levelFor(0).flight;
    for (let n = 1; n <= 80; n++) {
      const L = levelFor(n);
      expect(L.flight).toBeLessThanOrEqual(prev + 1e-9);
      // 1本で 0.06秒より大きく速くならない
      expect(prev - L.flight).toBeLessThan(0.06);
      prev = L.flight;
    }
    expect(levelFor(0).breakChance).toBe(0);
    expect(levelFor(25).breakChance).toBe(0);
    expect(levelFor(35).breakChance).toBeGreaterThan(0);
    expect(levelFor(0).spread).toBeLessThan(levelFor(25).spread);
    expect(SLUG_LEVELS.map((l) => l.from)).toEqual([0, 10, 20, 30, 50]);
    // 一番速い球でも、見てから振れる時間がある
    expect(levelFor(500).flight).toBeGreaterThan(0.75);
  });

  it('a player who aims well can keep hitting for a long time', () => {
    const s = newSlugger(7);
    const rng = rngOf(s);
    for (let i = 0; i < 120; i++) {
      const p = nextPitch(s);
      applyResult(s, judge(p, p.flight + 0.01, { x: p.tx, y: p.ty }, rng));
    }
    expect(s.over).toBe(false);
    expect(s.hits).toBe(120);
  });

  it('the landing marker shows early for the first 5 pitches, then later and later', () => {
    for (let i = 0; i < 5; i++) expect(markerLead(i)).toBe(Infinity);
    let prev = markerLead(5);
    expect(prev).toBeGreaterThan(1);
    for (let i = 6; i < 80; i++) {
      expect(markerLead(i)).toBeLessThanOrEqual(prev);
      prev = markerLead(i);
    }
    expect(markerLead(200)).toBeCloseTo(0.3);
  });

  it('same seed gives the same pitches', () => {
    const a = newSlugger(9);
    const b = newSlugger(9);
    for (let i = 0; i < 20; i++) expect(nextPitch(a)).toEqual(nextPitch(b));
  });

  it('reward is based on hits (provisional numbers)', () => {
    expect(sluggerReward({ hits: 0 })).toEqual({ coins: 0, exp: 0 });
    expect(sluggerReward({ hits: 14 })).toEqual({ coins: 2, exp: 4 });
  });
});
