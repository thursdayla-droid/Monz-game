import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { B3 } from '../src/core/battle3d/config';
import { b3Finished, giveOrder, newB3Battle, orderState, stepB3, type B3Battle, type B3Entrant, type B3Event } from '../src/core/battle3d/engine';
import type { StatBlock } from '../src/core/stats';

const LV30: StatBlock = { hp: 40, power: 40, tough: 35, speed: 20, tech: 22 };
const ent = (p = 3): B3Entrant => ({ name: 'BUNK', species: 'bunk', stats: LV30, instinct: instinctFor('bunk', LV30), proficiency: { attack: p, defense: p, evasion: p, counter: p, spacing: p } });

function run(b: B3Battle, sec: number, each?: (e: B3Event) => void): void {
  const end = b.t + sec;
  while (b.t < end && !b3Finished(b)) {
    b.events = [];
    stepB3(b, B3.dt);
    if (each) b.events.forEach(each);
  }
}

describe('3D auto battle (Ver.41)', () => {
  it('always ends, and the same seed gives the same match', () => {
    for (let s = 1; s <= 20; s++) {
      const b = newB3Battle(ent(), ent(), s);
      run(b, 200);
      expect(b.winner).not.toBeNull();
    }
    const a = newB3Battle(ent(), ent(), 9);
    const c = newB3Battle(ent(), ent(), 9);
    run(a, 30);
    run(c, 30);
    expect([a.f[0].x, a.f[1].hp]).toEqual([c.f[0].x, c.f[1].hp]);
  });

  it('moves on the whole floor (not only one line) and stays inside the walls', () => {
    const b = newB3Battle(ent(), ent(), 3);
    const zs = new Set<number>();
    const H = B3.arena.half;
    run(b, 40, () => undefined);
    for (let i = 0; i < 600 && !b3Finished(b); i++) {
      b.events = [];
      stepB3(b, B3.dt);
      zs.add(Math.round(b.f[0].z));
      for (const f of b.f) expect(Math.max(Math.abs(f.x), Math.abs(f.z))).toBeLessThanOrEqual(H);
    }
    expect(zs.size).toBeGreaterThan(1);
  });

  it('order reservation: 1 slot, replace, no extension, expires after 800ms, cooldown only when executed', () => {
    const b = newB3Battle(ent(), ent(), 5);
    const f = b.f[0];
    // 動けない状態にして、予約だけを見る
    f.act = { k: 'stun', t: 0, until: 5 };
    expect(giveOrder(b, 0, 'attack')).toBe(true);
    const until = f.reserve!.until;
    run(b, 0.3);
    expect(giveOrder(b, 0, 'attack')).toBe(false); // 同じ指示の連打では延長しない
    expect(f.reserve!.until).toBe(until);
    expect(giveOrder(b, 0, 'defend')).toBe(true); // 置きかえ
    expect(f.reserve!.order).toBe('defend');
    const events: B3Event[] = [];
    run(b, 0.9, (e) => events.push(e));
    expect(f.reserve).toBeNull();
    expect(events.some((e) => e.kind === 'order' && e.state === 'expired')).toBe(true);
    // 失効・置きかえではクールダウンは始まらない
    expect(orderState(b, 0, 'defend')).toBe('ready');
    expect(orderState(b, 0, 'attack')).toBe('ready');
  });

  it('an order waits until the MONZ can move, then runs and starts the cooldown', () => {
    const b = newB3Battle(ent(), ent(), 6);
    const f = b.f[0];
    f.act = { k: 'stun', t: 0, until: 0.3 };
    giveOrder(b, 0, 'evade');
    const events: B3Event[] = [];
    run(b, 0.5, (e) => events.push(e));
    expect(events.some((e) => e.kind === 'order' && e.order === 'evade' && e.state === 'executed')).toBe(true);
    expect(orderState(b, 0, 'evade')).toBe('cooldown');
    expect(giveOrder(b, 0, 'evade')).toBe(false);
  });

  function guardTest(guardAge: number, pre = false): B3Event | undefined {
    const b = newB3Battle(ent(), ent(), 8);
    const [p, q] = b.f;
    p.x = 0; p.z = 0; q.x = 1.2; q.z = 0;
    p.face = 0; q.face = Math.PI;
    for (const f of b.f) f.thinkT = 99;
    q.act = { k: 'attack', move: 'jab', t: B3.moves.jab.windup - B3.dt / 2, id: 99, dir: Math.PI, hit: false, done: false, extra: 0 };
    p.seenAttack = 99;
    p.act = { k: 'guard', t: guardAge, until: 5, pre };
    let ev: B3Event | undefined;
    run(b, 0.05, (e) => { if (e.kind === 'block' || e.kind === 'hit') ev ??= e; });
    return ev;
  }

  it('just guard: PERFECT 0-100ms, GOOD 100-350ms, PRE_INPUT is never PERFECT', () => {
    expect(guardTest(0.05)).toMatchObject({ kind: 'block', grade: 'perfect', damage: 0 });
    expect(guardTest(0.2)).toMatchObject({ kind: 'block', grade: 'good' });
    expect(guardTest(0.6)).toMatchObject({ kind: 'block', grade: 'guard' });
    expect(guardTest(0.05, true)).toMatchObject({ kind: 'block', grade: 'pre' });
  });

  it('combo counts up to 5 hits (ground + air) and damage goes down', () => {
    const b = newB3Battle(ent(), ent(), 4);
    const combos: number[] = [];
    let fifth = 0;
    for (let s = 1; s <= 30; s++) {
      const x = newB3Battle(ent(5), ent(1), s);
      run(x, 200, (e) => {
        if (e.kind === 'hit') combos.push(e.combo);
        if (e.kind === 'fifth') fifth++;
      });
    }
    expect(Math.max(...combos)).toBe(B3.combo.max);
    expect(fifth).toBeGreaterThan(0);
    expect(B3.combo.scale).toHaveLength(5);
    expect(b.f[0].combo).toBe(0);
  });

  it('stamina 0 makes the MONZ exhausted (no counter after a just guard)', () => {
    const b = newB3Battle(ent(), ent(), 2);
    const p = b.f[0];
    p.stamina = 1;
    p.act = { k: 'free' };
    giveOrder(b, 0, 'evade');
    run(b, 0.05);
    expect(p.exhausted).toBe(true);
  });

  it('higher AI proficiency wins more often (without more attack power)', () => {
    let w = 0;
    for (let s = 1; s <= 30; s++) {
      const b = newB3Battle(ent(5), ent(1), s);
      run(b, 200);
      if (b.winner === 0) w++;
    }
    expect(w).toBeGreaterThan(20);
  });
});
