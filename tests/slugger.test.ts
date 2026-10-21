import { describe, expect, it } from 'vitest';
import { applyResult, ballAt, canSwing, HOMERUN_MIN, isHit, isStrike, judge, levelFor, markerLead, newSlugger, nextPitch, passed, rngOf, SLUG, SLUG_LEVELS, sluggerReward, type Pitch, type SwingResult } from '../src/core/slugger';

const pitch = (tx = 0, ty = 0, flight = 1.2): Pitch => ({ kind: 'straight', flight, tx, ty, bx: 0, by: 0 });
const fixed = (v: number) => () => v;
/** 1.2秒で着く球の、いちばん良いスイングの時間 */
const IDEAL = 1.2 - SLUG.idealBefore;

describe('MONZ SLUGGER', () => {
  it('the ball leaves the pitcher and arrives exactly at its target, even when it breaks', () => {
    const s = newSlugger(3);
    s.hits = 60;
    for (let i = 0; i < 50; i++) {
      const p = nextPitch(s);
      expect(ballAt(p, 0).x).toBeCloseTo(SLUG.release.x);
      expect(ballAt(p, 0).z).toBe(1);
      const end = ballAt(p, 1);
      expect(end.x).toBeCloseTo(p.tx);
      expect(end.y).toBeCloseTo(p.ty);
      expect(end.z).toBe(0);
      // 着く所はカーソルが届く範囲(ボール球も)
      expect(Math.abs(p.tx)).toBeLessThan(SLUG.cursorLimit);
      expect(Math.abs(p.ty)).toBeLessThan(SLUG.cursorLimit);
    }
  });

  it('almost every pitch is in the zone; about 1 in 15 is a ball the cursor cannot reach, never two in a row', () => {
    const s = newSlugger(5);
    s.pitches = 30;
    let far = 0;
    let prevFar = false;
    for (let i = 0; i < 3000; i++) {
      const p = nextPitch(s);
      const isFar = !isStrike(p);
      if (isFar) {
        far++;
        expect(prevFar).toBe(false);
        // カーソルをいちばん近くに置いても、当たらない
        const cx = Math.max(-SLUG.cursorLimit, Math.min(SLUG.cursorLimit, p.tx));
        const cy = Math.max(-SLUG.cursorLimit, Math.min(SLUG.cursorLimit, p.ty));
        expect(judge(p, p.flight - SLUG.idealBefore, { x: cx, y: cy }).outcome).toBe('swingMiss');
        // 見送ればミスにならない
        expect(judge(p, null, { x: 0, y: 0 }).outcome).toBe('ball');
      }
      prevFar = isFar;
    }
    expect(far / 3000).toBeGreaterThan(1 / 25);
    expect(far / 3000).toBeLessThan(1 / 10);
    // 最初の数球は出ない
    const early = newSlugger(6);
    for (let i = 0; i < 8; i++) expect(isStrike(nextPitch(early))).toBe(true);
  });

  it('judges position and timing; outside the cursor or the timing window is a swing and miss (no fouls)', () => {
    const p = pitch(0.2, -0.1);
    expect(judge(p, IDEAL, { x: 0.2, y: -0.1 }, fixed(0.5)).grade).toBe('perfect');
    expect(judge(p, IDEAL + 0.06, { x: 0.2, y: -0.1 }, fixed(0.5)).grade).toBe('great');
    expect(judge(p, IDEAL, { x: 0.55, y: -0.1 }, fixed(0.5)).grade).toBe('good');
    expect(judge(p, IDEAL, { x: -0.6, y: -0.1 }).outcome).toBe('swingMiss');
    expect(judge(p, IDEAL + SLUG.timing.good + 0.01, { x: 0.2, y: -0.1 }).outcome).toBe('swingMiss');
    expect(judge(p, IDEAL + SLUG.timing.good - 0.01, { x: 0.2, y: -0.1 }, fixed(0.5)).outcome).not.toBe('swingMiss');
    // 早すぎるのも空振り(ミス)
    expect(judge(p, IDEAL - SLUG.timing.good / SLUG.earlyLenient - 0.01, { x: 0.2, y: -0.1 }).outcome).toBe('swingMiss');
    expect(judge(p, IDEAL - SLUG.timing.good / SLUG.earlyLenient - 0.08, { x: 0.2, y: -0.1 }).outcome).toBe('swingMiss');
    expect(judge(p, 0.6, { x: 0.2, y: -0.1 }).outcome).toBe('swingMiss');
    // 見送り: ゾーンの中はストライク、外はボール
    expect(judge(pitch(0, 0), null, { x: 0, y: 0 }).outcome).toBe('strikeTaken');
    expect(judge(pitch(1.3, 0), null, { x: 0, y: 0 }).outcome).toBe('ball');
  });

  it('where the ball meets the cursor decides grounder / liner / fly', () => {
    const p = pitch(0, 0);
    // カーソルがボールより上 → ゴロ / まん中 → ライナー / 下 → フライ
    expect(judge(p, IDEAL, { x: 0, y: 0.2 }, fixed(0.99)).contact).toBe('grounder');
    expect(judge(p, IDEAL, { x: 0, y: 0 }, fixed(0.99)).contact).toBe('liner');
    expect(judge(p, IDEAL, { x: 0, y: -0.2 }, fixed(0.99)).contact).toBe('fly');
    // PERFECT のフライは必ずホームラン
    const r = judge(p, IDEAL, { x: 0, y: -0.12 }, fixed(0.5));
    if (r.grade === 'perfect' && r.contact === 'fly') expect(r.outcome).toBe('homerun');
    // 早いと引っぱり(左)、遅いと流し(右)
    expect(judge(p, IDEAL - 0.05, { x: 0, y: 0 }, fixed(0.5)).dir).toBeLessThan(0);
    expect(judge(p, IDEAL + 0.05, { x: 0, y: 0 }, fixed(0.5)).dir).toBeGreaterThan(0);
  });

  it('every contact is a hit or a home run, decided by distance', () => {
    const rng = rngOf(newSlugger(11));
    let homers = 0;
    for (let i = 0; i < 300; i++) {
      const dy = [-0.2, 0, 0.2][i % 3];
      const r = judge(pitch(0, 0), IDEAL + (i % 5) * 0.02, { x: 0, y: dy }, rng);
      expect(isHit(r.outcome)).toBe(true);
      expect(r.homerun).toBe(r.distance >= HOMERUN_MIN);
      if (r.homerun) homers++;
      // ゴロはホームランにならない
      if (r.contact === 'grounder') expect(r.homerun).toBe(false);
    }
    expect(homers).toBeGreaterThan(10);
  });

  it('swing and miss or taking a pitch is a miss; three misses end the game', () => {
    const s = newSlugger(1);
    const hit: SwingResult = { grade: 'great', outcome: 'hit', contact: 'liner', timing: 0, offset: 0, distance: 60, homerun: false, points: 0, dir: 0 };
    const r = (outcome: SwingResult['outcome']): SwingResult => ({ ...hit, grade: 'miss', outcome, distance: 0 });
    applyResult(s, hit);
    applyResult(s, hit);
    expect(s.whiffs).toBe(0);
    expect(s.streak).toBe(2);
    applyResult(s, r('swingMiss'));
    expect(s.whiffs).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    applyResult(s, r('strikeTaken'));
    expect(s.whiffs).toBe(2);
    expect(s.over).toBe(false);
    applyResult(s, r('swingMiss'));
    expect(s.whiffs).toBe(3);
    expect(s.over).toBe(true);
  });

  it('the score is the total distance', () => {
    const s = newSlugger(1);
    const hit: SwingResult = { grade: 'great', outcome: 'hit', contact: 'liner', timing: 0, offset: 0, distance: 60, homerun: false, points: 0, dir: 0 };
    expect(applyResult(s, hit).points).toBe(60);
    expect(applyResult(s, { ...hit, outcome: 'homerun', homerun: true, distance: 130 }).points).toBe(130);
    applyResult(s, { ...hit, grade: 'miss', outcome: 'swingMiss', distance: 0 });
    expect(s.score).toBe(190);
    expect(s.totalDistance).toBe(190);
    expect(s.homeruns).toBe(1);
  });

  it('the best timing is a little before the ball arrives, and early swings are judged more gently', () => {
    const p = pitch(0, 0);
    expect(judge(p, 1.2, { x: 0, y: 0 }, fixed(0.5)).grade).not.toBe('perfect');
    expect(judge(p, IDEAL, { x: 0, y: 0 }, fixed(0.5)).grade).toBe('perfect');
    // 同じだけずれても、早い方が良い判定になりやすい
    const early = judge(p, IDEAL - 0.1, { x: 0, y: 0 }, fixed(0.5));
    const late = judge(p, IDEAL + 0.1, { x: 0, y: 0 }, fixed(0.5));
    expect(Math.abs(early.timing)).toBeLessThan(Math.abs(late.timing));
  });

  it('swing window: too early is not accepted, the ball passes after the good window', () => {
    const p = pitch(0, 0, 1);
    expect(canSwing(p, 0.5)).toBe(false);
    expect(canSwing(p, 1 - SLUG.swingEarly)).toBe(true);
    expect(passed(p, 1 - SLUG.idealBefore + SLUG.timing.good - 0.01)).toBe(false);
    expect(passed(p, 1 - SLUG.idealBefore + SLUG.timing.good + 0.01)).toBe(true);
  });

  it('gets harder step by step with the number of pitches, never suddenly', () => {
    let prev = levelFor(0).flight;
    for (let n = 1; n <= 80; n++) {
      const L = levelFor(n);
      expect(L.flight).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - L.flight).toBeLessThan(0.06);
      prev = L.flight;
    }
    expect(levelFor(0).breakChance).toBe(0);
    expect(levelFor(19).breakChance).toBe(0);
    // 20球から変化球。最初はたまに
    expect(levelFor(20).breakChance).toBeGreaterThan(0);
    expect(levelFor(20).breakChance).toBeLessThan(0.2);
    expect(levelFor(40).breakChance).toBeGreaterThan(levelFor(20).breakChance);
    expect(levelFor(0).spread).toBeLessThan(levelFor(25).spread);
    expect(SLUG_LEVELS.map((l) => l.from)).toEqual([0, 10, 20, 35, 60]);
    expect(levelFor(500).flight).toBeGreaterThan(0.75);
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

  it('a player who never swings ends after 3 pitches; one who swings badly ends after 3 misses; one who aims well keeps going', () => {
    const lazy = newSlugger(4);
    for (let i = 0; i < 200 && !lazy.over; i++) applyResult(lazy, judge(nextPitch(lazy), null, { x: 0, y: 0 }));
    expect(lazy.over).toBe(true);
    expect(lazy.pitches).toBe(3);
    expect(lazy.score).toBe(0);
    const bad = newSlugger(4);
    for (let i = 0; i < 200 && !bad.over; i++) applyResult(bad, judge(nextPitch(bad), 0.1, { x: 0, y: 0 }));
    expect(bad.over).toBe(true);
    expect(bad.whiffs).toBe(3);
    const good = newSlugger(7);
    const rng = rngOf(good);
    for (let i = 0; i < 300; i++) {
      const p = nextPitch(good);
      applyResult(good, judge(p, isStrike(p) ? p.flight - SLUG.idealBefore + 0.01 : null, { x: p.tx, y: p.ty }, rng));
    }
    expect(good.over).toBe(false);
    expect(good.score).toBe(good.totalDistance);
    expect(good.hits).toBeGreaterThan(150);
  });

  it('same seed gives the same pitches', () => {
    const a = newSlugger(9);
    const b = newSlugger(9);
    for (let i = 0; i < 20; i++) expect(nextPitch(a)).toEqual(nextPitch(b));
  });

  it('reward is based on hits', () => {
    expect(sluggerReward({ hits: 0 })).toEqual({ coins: 0, exp: 0 });
    expect(sluggerReward({ hits: 19 })).toEqual({ coins: 1, exp: 0 });
    expect(sluggerReward({ hits: 20 })).toEqual({ coins: 2, exp: 1 });
    expect(sluggerReward({ hits: 29 })).toEqual({ coins: 2, exp: 1 });
    expect(sluggerReward({ hits: 30 })).toEqual({ coins: 3, exp: 2 });
    expect(sluggerReward({ hits: 110 })).toEqual({ coins: 11, exp: 10 });
    expect(sluggerReward({ hits: 300 })).toEqual({ coins: 30, exp: 10 });
  });
});
