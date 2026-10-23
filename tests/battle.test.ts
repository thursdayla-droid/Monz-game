import { describe, expect, it } from 'vitest';
import { attackFor, BUNK_ATTACKS, HP_MAX, knockback, newPractice, NO_INPUT, ROLL, SHIELD, stepBattle, STOCKS, type Input } from '../src/core/battle';

const run = (b: ReturnType<typeof newPractice>, inp: Partial<Input>, seconds: number) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...stepBattle(b, [{ ...NO_INPUT, ...inp }], 1 / 60));
  return events;
};

describe('battle (practice)', () => {
  it('lands on the stage, walks, and jumps twice', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    expect(me.ground).not.toBeNull();
    const x = me.x;
    run(b, { x: 1 }, 0.3);
    expect(me.x).toBeGreaterThan(x + 50);
    expect(me.face).toBe(1);
    run(b, { jump: true }, 1 / 60);
    run(b, {}, 0.2);
    const y1 = me.y;
    run(b, { jump: true }, 1 / 60);
    run(b, { jump: true }, 1 / 60);
    run(b, {}, 0.15);
    expect(me.y).toBeLessThan(y1);
    expect(me.airJumps).toBe(0);
  });

  it('chooses the A attack by stick direction', () => {
    expect(attackFor({ ...NO_INPUT })).toBe('jab');
    expect(attackFor({ ...NO_INPUT, x: -1 })).toBe('side');
    expect(attackFor({ ...NO_INPUT, y: -1 })).toBe('up');
    expect(attackFor({ ...NO_INPUT, y: 1, x: 0.3 })).toBe('down');
  });

  it('hits the dummy: damage, and lower HP flies farther', () => {
    expect(knockback(BUNK_ATTACKS.side, 20)).toBeGreaterThan(knockback(BUNK_ATTACKS.side, 90));
    const b = newPractice();
    const [me, dummy] = b.fighters;
    run(b, {}, 0.5);
    me.x = dummy.x - 70;
    me.face = 1;
    const ev = run(b, { a: true, x: 1 }, 1 / 60).concat(run(b, {}, 0.5));
    expect(ev.some((e) => e.kind === 'hit')).toBe(true);
    expect(dummy.hp).toBe(HP_MAX - BUNK_ATTACKS.side.damage);
    expect(dummy.x).toBeGreaterThan(me.x + 80);
  });

  it('stops for a moment when a hit lands (hitstop)', () => {
    const b = newPractice();
    const [me, dummy] = b.fighters;
    run(b, {}, 0.5);
    me.x = dummy.x - 70;
    me.face = 1;
    stepBattle(b, [{ ...NO_INPUT, a: true, x: 1 }], 1 / 120);
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) hit = stepBattle(b, [NO_INPUT], 1 / 120).some((e) => e.kind === 'hit');
    expect(hit).toBe(true);
    expect(b.hitstop).toBeGreaterThan(0.08);
    const x = dummy.x;
    stepBattle(b, [NO_INPUT], 1 / 120);
    expect(dummy.x).toBe(x);
  });

  it('shield blocks damage', () => {
    const b = newPractice();
    const [me, dummy] = b.fighters;
    run(b, {}, 0.5);
    // 的に自分を打たせる(的と自分の役を入れかえる)
    dummy.dummy = false;
    me.dummy = true;
    dummy.x = me.x + 70;
    dummy.face = -1;
    stepBattle(b, [NO_INPUT, { ...NO_INPUT }], 1 / 60);
    me.dummy = false;
    const ev = [];
    for (let i = 0; i < 30; i++) ev.push(...stepBattle(b, [{ ...NO_INPUT, shield: true }, { ...NO_INPUT, a: i === 0 }], 1 / 60));
    expect(ev.some((e) => e.kind === 'block')).toBe(true);
    expect(me.hp).toBe(HP_MAX);
  });

  it('falling off the stage loses a stock, and the dummy comes back', () => {
    const b = newPractice();
    const dummy = b.fighters[1];
    dummy.x = 1700;
    dummy.ground = null;
    const ev = run(b, {}, 0.2);
    expect(ev.some((e) => e.kind === 'ko' && e.target === dummy)).toBe(true);
    expect(dummy.stocks).toBe(STOCKS - 1);
    run(b, {}, 2);
    expect(dummy.out).toBeLessThanOrEqual(0);
    expect(dummy.hp).toBe(HP_MAX);
  });

  it('guard: shrinks while held, cannot be used again for 0.5s, works in the air', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    run(b, { shield: true }, 1);
    expect(me.shield).toBe(true);
    expect(me.shieldHp).toBeCloseTo(1 - SHIELD.drain, 1);
    run(b, {}, 1 / 60);
    expect(me.shield).toBe(false);
    run(b, { shield: true }, 0.3);
    expect(me.shield).toBe(false);
    run(b, {}, 0.3);
    // 空中でも使える
    run(b, { jump: true }, 1 / 60);
    run(b, { shield: true }, 0.1);
    expect(me.ground).toBeNull();
    expect(me.shield).toBe(true);
    // ずっとは使えない(なくなると割れる)
    const ev = run(b, { shield: true }, 8);
    expect(ev.some((e) => e.kind === 'shieldBreak')).toBe(true);
  });

  it('guard: a hit on the part outside the shrunken guard gets through', () => {
    const b = newPractice();
    const [me, dummy] = b.fighters;
    run(b, {}, 0.5);
    dummy.dummy = false;
    me.dummy = true;
    dummy.x = me.x + 70;
    dummy.face = -1;
    me.dummy = false;
    // ガードを小さくしてから打たれる
    run(b, { shield: true }, 1 / 60);
    me.shieldHp = 0.05;
    const ev = [];
    for (let i = 0; i < 40; i++) ev.push(...stepBattle(b, [{ ...NO_INPUT, shield: true }, { ...NO_INPUT, a: i === 0 }], 1 / 60));
    expect(ev.some((e) => e.kind === 'hit' && e.target === me)).toBe(true);
    expect(me.hp).toBeLessThan(HP_MAX);
  });

  it('roll: left/right during guard rolls once, is invincible, and ends the guard', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    run(b, { shield: true }, 0.1);
    const x = me.x;
    const ev = run(b, { shield: true, x: 1 }, 1 / 60);
    expect(ev.some((e) => e.kind === 'roll')).toBe(true);
    expect(me.roll).not.toBeNull();
    expect(me.shield).toBe(false);
    run(b, { shield: true, x: 1 }, ROLL.time);
    expect(me.roll).toBeNull();
    expect(me.x - x).toBeGreaterThan(ROLL.distance * 0.7);
    // ガードを押したままでも、すぐにはガードにもどらない
    expect(me.shield).toBe(false);
  });

  it('double jump goes clearly higher even while still rising', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    run(b, { jump: true }, 1 / 60);
    run(b, {}, 0.08);
    const vy = me.vy;
    run(b, { jump: true }, 1 / 60);
    expect(me.vy).toBeLessThan(vy - 150);
  });
});
