import { describe, expect, it } from 'vitest';
import { applyResult, ballAt, canSwing, HOMERUN_MIN, isHit, isStrike, judge, levelFor, markerLead, newSlugger, nextPitch, passed, rngOf, SLUG, SLUG_LEVELS, sluggerReward, type Pitch, type SwingResult } from '../src/core/slugger';

const pitch = (tx = 0, ty = 0, flight = 1.2): Pitch => ({ kind: 'straight', flight, tx, ty, bx: 0, by: 0 });
const fixed = (v: number) => () => v;

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

  it('some pitches are balls, most are strikes', () => {
    const s = newSlugger(5);
    let balls = 0;
    for (let i = 0; i < 400; i++) if (!isStrike(nextPitch(s))) balls++;
    expect(balls).toBeGreaterThan(40);
    expect(balls).toBeLessThan(160);
  });

  it('judges position and timing; outside the cursor is a swing and miss, a little off timing is a foul', () => {
    const p = pitch(0.2, -0.1);
    expect(judge(p, 1.2, { x: 0.2, y: -0.1 }, fixed(0.5)).grade).toBe('perfect');
    expect(judge(p, 1.26, { x: 0.2, y: -0.1 }, fixed(0.5)).grade).toBe('great');
    expect(judge(p, 1.2, { x: 0.6, y: -0.1 }, fixed(0.5)).grade).toBe('good');
    expect(judge(p, 1.2, { x: -0.6, y: -0.1 }).outcome).toBe('swingMiss');
    expect(judge(p, 1.2 + SLUG.timing.good + 0.03, { x: 0.2, y: -0.1 }).outcome).toBe('foul');
    expect(judge(p, 1.2 - SLUG.timing.good - 0.03, { x: 0.2, y: -0.1 }).outcome).toBe('foul');
    expect(judge(p, 0.6, { x: 0.2, y: -0.1 }).outcome).toBe('swingMiss');
    // 見送り: ゾーンの中はストライク、外はボール
    expect(judge(pitch(0, 0), null, { x: 0, y: 0 }).outcome).toBe('strikeTaken');
    expect(judge(pitch(1.3, 0), null, { x: 0, y: 0 }).outcome).toBe('ball');
  });

  it('where the ball meets the cursor decides grounder / liner / fly', () => {
    const p = pitch(0, 0);
    // カーソルがボールより上 → ゴロ / まん中 → ライナー / 下 → フライ
    expect(judge(p, 1.2, { x: 0, y: 0.3 }, fixed(0.99)).contact).toBe('grounder');
    expect(judge(p, 1.2, { x: 0, y: 0 }, fixed(0.99)).contact).toBe('liner');
    expect(judge(p, 1.2, { x: 0, y: -0.3 }, fixed(0.99)).contact).toBe('fly');
    // PERFECT のフライは必ずホームラン
    const r = judge(p, 1.2, { x: 0, y: -0.12 }, fixed(0.5));
    if (r.grade === 'perfect' && r.contact === 'fly') expect(r.outcome).toBe('homerun');
    // 早いと引っぱり(左)、遅いと流し(右)
    expect(judge(p, 1.15, { x: 0, y: 0 }, fixed(0.5)).dir).toBeLessThan(0);
    expect(judge(p, 1.25, { x: 0, y: 0 }, fixed(0.5)).dir).toBeGreaterThan(0);
  });

  it('every contact is a hit or a home run, decided by distance', () => {
    const rng = rngOf(newSlugger(11));
    let homers = 0;
    for (let i = 0; i < 300; i++) {
      const dy = [-0.3, 0, 0.3][i % 3];
      const r = judge(pitch(0, 0), 1.2 + (i % 5) * 0.02, { x: 0, y: dy }, rng);
      expect(isHit(r.outcome)).toBe(true);
      expect(r.homerun).toBe(r.distance >= HOMERUN_MIN);
      if (r.homerun) homers++;
      // ゴロはホームランにならない
      if (r.contact === 'grounder') expect(r.homerun).toBe(false);
    }
    expect(homers).toBeGreaterThan(10);
  });

  it('count: 3 strikes is a strikeout, 4 balls a walk, fouls with 2 strikes keep the count', () => {
    const s = newSlugger(1);
    const r = (outcome: SwingResult['outcome']): SwingResult => ({ grade: 'miss', outcome, timing: 0, offset: 0, distance: 0, homerun: false, points: 0, dir: 0, atBatEnd: null });
    applyResult(s, r('strikeTaken'));
    applyResult(s, r('foul'));
    expect(s.strikes).toBe(2);
    applyResult(s, r('foul'));
    applyResult(s, r('foul'));
    expect(s.strikes).toBe(2);
    expect(applyResult(s, r('swingMiss')).atBatEnd).toBe('strikeout');
    expect(s.outs).toBe(1);
    expect(s.strikes).toBe(0);
    for (let i = 0; i < 3; i++) expect(applyResult(s, r('ball')).atBatEnd).toBe(null);
    expect(applyResult(s, r('ball')).atBatEnd).toBe('walk');
    expect(s.outs).toBe(1);
    expect(s.balls).toBe(0);
  });

  it('three strikeouts end the game; a strikeout resets the hit streak, a walk does not', () => {
    const s = newSlugger(1);
    const hit: SwingResult = { grade: 'great', outcome: 'hit', contact: 'liner', timing: 0, offset: 0, distance: 60, homerun: false, points: 0, dir: 0, atBatEnd: null };
    const ball: SwingResult = { ...hit, grade: 'miss', outcome: 'ball', distance: 0 };
    const strike: SwingResult = { ...hit, grade: 'miss', outcome: 'swingMiss', distance: 0 };
    applyResult(s, hit);
    applyResult(s, hit);
    for (let i = 0; i < 4; i++) applyResult(s, ball);
    expect(s.streak).toBe(2);
    for (let i = 0; i < 3; i++) applyResult(s, strike);
    expect(s.outs).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    for (let i = 0; i < 3; i++) applyResult(s, strike);
    expect(s.over).toBe(false);
    for (let i = 0; i < 3; i++) applyResult(s, strike);
    expect(s.over).toBe(true);
  });

  it('the score is the total distance', () => {
    const s = newSlugger(1);
    const hit: SwingResult = { grade: 'great', outcome: 'hit', contact: 'liner', timing: 0, offset: 0, distance: 60, homerun: false, points: 0, dir: 0, atBatEnd: null };
    expect(applyResult(s, hit).points).toBe(60);
    expect(applyResult(s, { ...hit, outcome: 'homerun', homerun: true, distance: 130 }).points).toBe(130);
    applyResult(s, { ...hit, grade: 'miss', outcome: 'ball', distance: 0 });
    expect(s.score).toBe(190);
    expect(s.totalDistance).toBe(190);
    expect(s.homeruns).toBe(1);
  });

  it('swing window: too early is not accepted, the ball passes after the foul window', () => {
    const p = pitch(0, 0, 1);
    expect(canSwing(p, 0.5)).toBe(false);
    expect(canSwing(p, 1 - SLUG.swingEarly)).toBe(true);
    expect(passed(p, 1 + SLUG.timing.good + SLUG.foul - 0.01)).toBe(false);
    expect(passed(p, 1 + SLUG.timing.good + SLUG.foul + 0.01)).toBe(true);
  });

  it('gets harder step by step with the number of hits, never suddenly', () => {
    let prev = levelFor(0).flight;
    for (let n = 1; n <= 80; n++) {
      const L = levelFor(n);
      expect(L.flight).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - L.flight).toBeLessThan(0.06);
      prev = L.flight;
    }
    expect(levelFor(0).breakChance).toBe(0);
    expect(levelFor(25).breakChance).toBe(0);
    expect(levelFor(35).breakChance).toBeGreaterThan(0);
    expect(levelFor(0).spread).toBeLessThan(levelFor(25).spread);
    expect(SLUG_LEVELS.map((l) => l.from)).toEqual([0, 10, 20, 30, 50]);
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

  it('a player who never swings ends by strikeouts; one who aims well keeps going', () => {
    const lazy = newSlugger(4);
    for (let i = 0; i < 500 && !lazy.over; i++) applyResult(lazy, judge(nextPitch(lazy), null, { x: 0, y: 0 }));
    expect(lazy.over).toBe(true);
    expect(lazy.score).toBe(0);
    const good = newSlugger(7);
    const rng = rngOf(good);
    for (let i = 0; i < 300; i++) {
      const p = nextPitch(good);
      applyResult(good, judge(p, isStrike(p) ? p.flight + 0.01 : null, { x: p.tx, y: p.ty }, rng));
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

  it('reward is based on hits (provisional numbers)', () => {
    expect(sluggerReward({ hits: 0 })).toEqual({ coins: 0, exp: 0 });
    expect(sluggerReward({ hits: 14 })).toEqual({ coins: 2, exp: 4 });
  });
});
