import { describe, expect, it } from 'vitest';
import { attackFor, BUNK_ATTACKS, HP_MAX, knockback, newPractice, NO_INPUT, stepBattle, STOCKS, type Input } from '../src/core/battle';

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
});
