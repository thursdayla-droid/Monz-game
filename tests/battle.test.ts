import { describe, expect, it } from 'vitest';
import { attackFor, BOUNCE_HP, BUNK_ATTACKS, MOVE, HP_MAX, knockback, newPractice, NO_INPUT, ROLL, SHIELD, stepBattle, STOCKS, type Input } from '../src/core/battle';

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
    dummy.x = 2400;
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
    let broke = false;
    for (let i = 0; i < 600 && !broke; i++) broke = stepBattle(b, [{ ...NO_INPUT, shield: true }], 1 / 60).some((e) => e.kind === 'shieldBreak');
    expect(broke).toBe(true);
    // 割れたら、ふらふらして動けない
    expect(me.dizzy).toBeGreaterThan(0);
    run(b, {}, 0.5);
    const x = me.x;
    run(b, { x: 1, jump: true }, 0.3);
    expect(me.x).toBeCloseTo(x, 0);
    run(b, {}, SHIELD.dizzy);
    expect(me.dizzy).toBe(0);
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

  it('in the air: guard only (no roll), and down+A is the straight-down punch', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    run(b, { jump: true }, 1 / 60);
    run(b, { shield: true }, 0.05);
    const ev = run(b, { shield: true, x: 1 }, 0.1);
    expect(ev.some((e) => e.kind === 'roll')).toBe(false);
    expect(me.shield).toBe(true);
    expect(attackFor({ ...NO_INPUT, y: 1 }, true)).toBe('air_down');
    expect(attackFor({ ...NO_INPUT, y: 1 }, false)).toBe('down');
    expect(BUNK_ATTACKS.air_down.angle).toBeLessThan(-45);
  });

  it('uppercut pops the target up a little (no spinning)', () => {
    const b = newPractice();
    const [me, dummy] = b.fighters;
    run(b, {}, 0.5);
    me.x = dummy.x - 40;
    me.face = 1;
    const y0 = dummy.y;
    let top = y0;
    run(b, { a: true, y: -1 }, 1 / 60);
    for (let i = 0; i < 90; i++) {
      stepBattle(b, [NO_INPUT], 1 / 60);
      top = Math.min(top, dummy.y);
    }
    expect(dummy.hitBy).toBe('up');
    expect(BUNK_ATTACKS.up.noSpin).toBe(true);
    expect(y0 - top).toBeGreaterThan(40);
    expect(y0 - top).toBeLessThan(160);
  });

  it('roll is short and stops at the edge of the stage', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    const g = me.ground!;
    me.x = g.x0 + 60;
    run(b, { shield: true }, 0.1);
    run(b, { shield: true, x: -1 }, 1 / 60);
    run(b, { shield: true }, ROLL.time);
    expect(me.ground).toBe(g);
    expect(me.x).toBeGreaterThanOrEqual(g.x0);
  });

  it('down punch from the air: grounded target bounces up only when HP is low', () => {
    const hitFromAbove = (hp: number) => {
      const b = newPractice();
      const [me, dummy] = b.fighters;
      run(b, {}, 0.5);
      dummy.hp = hp;
      me.x = dummy.x;
      me.y = dummy.y - 150;
      me.ground = null;
      me.vy = 0;
      stepBattle(b, [{ ...NO_INPUT, a: true, y: 1 }], 1 / 120);
      let top = dummy.y;
      const y0 = dummy.y;
      for (let i = 0; i < 120; i++) {
        stepBattle(b, [NO_INPUT], 1 / 120);
        top = Math.min(top, dummy.y);
      }
      return { lifted: y0 - top, hp: dummy.hp };
    };
    const high = hitFromAbove(100);
    expect(high.hp).toBe(100 - BUNK_ATTACKS.air_down.damage);
    expect(high.lifted).toBeLessThan(5);
    const low = hitFromAbove(BOUNCE_HP - 20);
    expect(low.lifted).toBeGreaterThan(40);
  });

  it('up B: usable with no gauge, once in the air, then freefall; landing resets', () => {
    const b = newPractice();
    const me = b.fighters[0];
    run(b, {}, 0.5);
    run(b, { jump: true }, 1 / 60);
    run(b, {}, 0.1);
    const y = me.y;
    const ev = run(b, { b: true, y: -1 }, 1 / 60);
    expect(ev.some((e) => e.kind === 'upB')).toBe(true);
    run(b, {}, 0.3);
    expect(me.y).toBeLessThan(y - 150);
    run(b, {}, 0.3);
    expect(me.freefall).toBe(true);
    // 2回目は出ない・ジャンプも攻撃もできない
    expect(run(b, { b: true, y: -1 }, 1 / 60).some((e) => e.kind === 'upB')).toBe(false);
    expect(run(b, { jump: true, a: true }, 1 / 60).some((e) => e.kind === 'jump' || e.kind === 'swing')).toBe(false);
    run(b, {}, 2);
    expect(me.ground).not.toBeNull();
    expect([me.freefall, me.upBUsed]).toEqual([false, 0]);
  });

  it('the main stage is solid from below and the side', () => {
    const b = newPractice();
    const me = b.fighters[0];
    const g = b.stage.platforms.find((p) => !p.thin)!;
    Object.assign(me, { x: 800, y: g.y + g.depth! + MOVE.height + 40, ground: null, vy: -900, vx: 0 });
    run(b, {}, 0.1);
    expect(me.y - MOVE.height).toBeGreaterThanOrEqual(g.y + g.depth! - 0.5);
    Object.assign(me, { x: g.x0 - 60, y: g.y + 60, ground: null, vy: 0, vx: 600 });
    stepBattle(b, [NO_INPUT], 1 / 60);
    stepBattle(b, [NO_INPUT], 1 / 60);
    expect(me.x).toBeLessThanOrEqual(g.x0);
  });

  it('ledge: grab resets jumps and up B; climb, climb attack, and let go', () => {
    const setup = () => {
      const b = newPractice();
      const me = b.fighters[0];
      const g = b.stage.platforms.find((p) => !p.thin)!;
      Object.assign(me, { x: g.x0 - 50, y: g.y + 60, ground: null, vy: 100, vx: 0, airJumps: 0, upBUsed: 1, freefall: true });
      const ev = run(b, {}, 0.05);
      return { b, me, g, ev };
    };
    const { b, me, g, ev } = setup();
    expect(ev.some((e) => e.kind === 'ledge')).toBe(true);
    expect([me.airJumps, me.upBUsed, me.freefall]).toEqual([MOVE.airJumps, 0, false]);
    run(b, {}, 0.2);
    run(b, { y: -1 }, 0.5);
    expect(me.ground).toBe(g);
    // 登りながら攻撃
    const s2 = setup();
    run(s2.b, {}, 0.2);
    const ev2 = run(s2.b, { a: true }, 1 / 60).concat(run(s2.b, {}, 0.4));
    expect(ev2.some((e) => e.kind === 'swing' && e.name === 'climb')).toBe(true);
    // はなす
    const s3 = setup();
    run(s3.b, {}, 0.2);
    run(s3.b, { y: 1 }, 1 / 60);
    expect(s3.me.ledge).toBeNull();
  });

  it('B loadout rules: only recovery moves go in up B', async () => {
    const { canEquip, fixLoadout, BUNK_UP_B } = await import('../src/core/battleMoves');
    expect(canEquip('up', BUNK_UP_B)).toBe(true);
    expect(canEquip('up', { id: 'x', label: 'x', kind: 'super', gauge: 100 })).toBe(false);
    expect(canEquip('up', { id: 'y', label: 'y', kind: 'gauge', gauge: 25, recovery: BUNK_UP_B.recovery })).toBe(false);
    expect(canEquip('neutral', { id: 'x', label: 'x', kind: 'super', gauge: 100 })).toBe(true);
    expect(fixLoadout({ up: 'nope', neutral: BUNK_UP_B.id })).toEqual({ neutral: BUNK_UP_B.id, side: null, up: null, down: null });
  });
});
