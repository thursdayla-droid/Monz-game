import { describe, expect, it } from 'vitest';
import { airtime, DASH, dashReward, jump, jumpHeight, meters, newDash, step } from '../src/core/dash';

/** 自動で遊ぶ: 足場の終わりが近づいたらジャンプ */
function autoplay(seed: number, seconds: number) {
  const s = newDash(seed);
  const dt = 1 / 60;
  for (let t = 0; t < seconds && !s.over; t += dt) {
    const fx = s.dist + DASH.runnerX;
    const cur = s.platforms.find((p) => fx >= p.x && fx <= p.x + p.w);
    const danger = s.things.find((th) => th.kind === 'danger' && th.x > fx && th.x - fx < s.speed * 0.22);
    if (s.grounded && ((cur && cur.x + cur.w - fx < s.speed * 0.06) || danger)) jump(s);
    step(s, dt);
  }
  return s;
}

describe('DASH MONZ', () => {
  it('jump height and airtime are fixed', () => {
    expect(jumpHeight()).toBeGreaterThan(200);
    expect(airtime()).toBeGreaterThan(0.7);
  });

  it('runs right, speeds up, and falls off if you never jump', () => {
    const s = newDash(1);
    for (let i = 0; i < 60 * 20 && !s.over; i++) step(s, 1 / 60);
    expect(s.over).toBe('fall');
    expect(s.speed).toBeGreaterThan(DASH.startSpeed);
    expect(meters(s)).toBeGreaterThan(5);
  });

  it('cannot jump in the air', () => {
    const s = newDash(2);
    expect(jump(s)).toBe(true);
    step(s, 0.2);
    expect(jump(s)).toBe(false);
  });

  it('courses are always passable by a simple bot for a long time', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = autoplay(seed, 90);
      expect(s.over, `seed ${seed} at ${meters(s)}m`).toBe(false);
    }
  });

  it('same seed gives the same course', () => {
    expect(autoplay(5, 20).dist).toBe(autoplay(5, 20).dist);
  });

  it('rewards 1 coin per 100m', () => {
    expect(dashReward(99)).toEqual({ coins: 0, exp: 1 });
    expect(dashReward(250)).toEqual({ coins: 2, exp: 3 });
  });
});
