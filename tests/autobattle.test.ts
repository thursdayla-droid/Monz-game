import { describe, expect, it } from 'vitest';
import { AUTO_BATTLE } from '../src/core/autobattle/config';
import { instinctFor, newAutoBattle, simulateAutoBattle, stepAutoBattle, type AutoEntrant } from '../src/core/autobattle/engine';
import type { StatBlock } from '../src/core/stats';

const bunk = (stats: StatBlock, name = 'BUNK'): AutoEntrant => ({ name, species: 'bunk', stats, instinct: instinctFor('bunk', stats) });
const LV1: StatBlock = { hp: 10, power: 8, tough: 8, speed: 4, tech: 5 };
const LV30: StatBlock = { hp: 40, power: 40, tough: 35, speed: 20, tech: 22 };
/** 同じBUNKを パワー寄り / タフネス寄りに育てた(合計は同じ) */
const POWER: StatBlock = { hp: 30, power: 60, tough: 25, speed: 20, tech: 22 };
const TOUGH: StatBlock = { hp: 30, power: 25, tough: 60, speed: 20, tech: 22 };

describe('MONZ auto battle (stage 1)', () => {
  it('always ends with a winner, KO or time up, and is the same for the same seed', () => {
    for (let s = 1; s <= 40; s++) {
      const b = simulateAutoBattle(bunk(LV30), bunk(LV30, 'RIVAL'), s);
      expect(b.winner).not.toBeNull();
      expect(b.t).toBeLessThanOrEqual(AUTO_BATTLE.timeLimit + 0.1);
    }
    const a = simulateAutoBattle(bunk(LV1), bunk(LV1), 7);
    const c = simulateAutoBattle(bunk(LV1), bunk(LV1), 7);
    expect([a.t, a.winner, a.fighters[0].hp]).toEqual([c.t, c.winner, c.fighters[0].hp]);
  });

  it('usually lasts about 45-90 seconds (the planned length)', () => {
    for (const st of [LV1, LV30]) {
      const ts = Array.from({ length: 40 }, (_, s) => simulateAutoBattle(bunk(st), bunk(st), s + 100).t);
      const avg = ts.reduce((x, y) => x + y, 0) / ts.length;
      expect(avg).toBeGreaterThan(40);
      expect(avg).toBeLessThan(90);
    }
  });

  it('the same species fights differently depending on how it was raised', () => {
    const ip = instinctFor('bunk', POWER);
    const it2 = instinctFor('bunk', TOUGH);
    expect(ip.attack).toBeGreaterThan(it2.attack);
    expect(it2.defense).toBeGreaterThan(ip.defense);
    // 攻撃的に育った個体は よく近づき、守り寄りに育った個体は よくガードする
    let pa = 0, ta = 0, pg = 0, tg = 0;
    for (let s = 0; s < 30; s++) {
      const b = simulateAutoBattle(bunk(POWER), bunk(TOUGH), s);
      pa += b.fighters[0].log.approachTime / b.t; ta += b.fighters[1].log.approachTime / b.t;
      pg += b.fighters[0].log.guards; tg += b.fighters[1].log.guards;
    }
    expect(pa).toBeGreaterThan(ta * 1.2);
    expect(tg).toBeGreaterThan(pg);
  });

  it('fighters stay in the arena and never overlap', () => {
    const b = newAutoBattle(bunk(LV30), bunk(LV30), 3);
    while (b.winner === null) {
      stepAutoBattle(b, 1 / 60);
      for (const f of b.fighters) expect(f.x).toBeGreaterThanOrEqual(AUTO_BATTLE.arena.x0);
      expect(Math.abs(b.fighters[0].x - b.fighters[1].x)).toBeGreaterThanOrEqual(AUTO_BATTLE.bodyGap - 1e-6);
    }
  });
});
