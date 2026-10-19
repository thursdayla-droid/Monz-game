import { describe, expect, it } from 'vitest';
import motion from '../src/render/bunkMotion.json';
import { BunkBrain } from '../src/core/bunkBehavior';
import { breathPose, jabAmount, type BunkMotion } from '../src/core/bunkPose';

const m = motion as unknown as BunkMotion;
const brain = (seed = 1) => new BunkBrain(m.behavior, seed, motion.testPersonality);
const run = (b: BunkBrain, seconds: number) => {
  for (let i = 0; i < seconds * 30; i++) b.update(1 / 30);
};

describe('bunk', () => {
  it('静止時は呼吸の伸び縮みがない', () => {
    expect(breathPose(m, 0)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(jabAmount(0)).toBe(0);
    expect(jabAmount(1)).toBe(0);
  });

  it('歩く・寝るときは腕を下ろした姿になる', () => {
    for (const a of ['walk', 'sleep'] as const) {
      const b = brain();
      b.start(a);
      run(b, 1);
      expect(b.pose).toBe('down');
      expect(b.activity).toBe(a);
    }
  });

  it('寝ているときは目を閉じた顔、なでると起きて嫌がる', () => {
    const b = brain();
    b.pose = 'down';
    b.start('sleep');
    expect(b.face()).toBe('closed');
    expect(b.pet()).toBe('angry');
    expect(b.activity).toBe('idle');
    expect(b.face()).toBe('angry');
  });

  it('拳を突き出すのは構えのときだけ', () => {
    const b = brain();
    b.pose = 'down';
    b.startJab();
    expect(b.jab).toBeNull();
    b.pose = 'guard';
    b.startJab();
    expect(b.jab).toBe(0);
  });

  it('自動で動くと、構え・腕を下ろす・歩く・寝るがすべて出てくる', () => {
    const b = brain(7);
    b.hold = false;
    const seen = new Set<string>();
    for (let i = 0; i < 30 * 600; i++) {
      b.update(1 / 30);
      seen.add(`${b.pose}:${b.activity}`);
    }
    expect(seen).toContain('guard:idle');
    expect(seen).toContain('down:idle');
    expect(seen).toContain('down:walk');
    expect(seen).toContain('down:sleep');
    expect(seen).not.toContain('guard:walk');
    expect(seen).not.toContain('guard:sleep');
  });

  it('同じ種なら同じ行動になる', () => {
    const a = brain(3);
    const c = brain(3);
    a.hold = c.hold = false;
    run(a, 60);
    run(c, 60);
    expect([a.pose, a.activity]).toEqual([c.pose, c.activity]);
  });
});
