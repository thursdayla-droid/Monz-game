import { describe, expect, it } from 'vitest';
import { BunkBrain } from './bunkBehavior';
import { MonzLife } from './life';
import { mulberry32 } from './rng';
import type { BunkMotion } from './bunkPose';
import motionJson from '../render/bunkMotion.json';

const BUNK_MOTION = motionJson as unknown as BunkMotion;
const TEST_PERSONALITY = motionJson.testPersonality;

describe('寝ている 時に なでる(企画者 2026-11-12)', () => {
  const make = () => {
    const life = new MonzLife(new BunkBrain(BUNK_MOTION.behavior, 1, TEST_PERSONALITY), [[0, 0], [100, 0], [100, 100], [0, 100]], mulberry32(2), () => 0.5);
    life.act = 'sleep';
    return life;
  };
  it('なでるの ゲージが MAX でなければ 寝たまま 気持ちよさそう', () => {
    const life = make();
    expect(life.stroked(false)).toBe('asleep');
    expect(life.act).toBe('sleep');
  });
  it('なでるの ゲージが MAX なら 嫌がる(起きない)', () => {
    const life = make();
    expect(life.stroked(true)).toBe('angry');
    expect(life.act).toBe('sleep');
  });
});
