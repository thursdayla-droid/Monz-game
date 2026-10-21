import { describe, expect, it } from 'vitest';
import { LIFE_KEY, LifeRecord, loadLife, migrateLife } from '../src/core/lifeSave';
import type { KeyValueStore } from '../src/core/save';
import { SPECIES } from '../src/core/species';
import { STAT_MAX, autoGrowthAt, currentStats, levelUpRng, LOVE_RULES, rollAutoGrowth, shownLove, SPECIES_STATS, STAT_KEYS, statsForMode, tryLoveSave } from '../src/core/stats';
import { NEEDS_RULES, stepNeeds } from '../src/core/needs';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const sum = (b: Record<string, number>) => Object.values(b).reduce((a, v) => a + v, 0);

describe('stats table', () => {
  it('BUNK uses the planner provisional base numbers (whole numbers)', () => {
    const b = SPECIES_STATS.bunk!;
    expect(STAT_KEYS.map((k) => b.base[k])).toEqual([10, 8, 8, 4, 5]);
    expect(SPECIES.bunk.ready).toBe(true);
  });

  it('auto growth adds exactly 3 at random, favouring the strong stats', () => {
    const counts = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
    for (let i = 0; i < 2000; i++) {
      const g = rollAutoGrowth('bunk', levelUpRng('m1', i));
      expect(sum(g)).toBe(3);
      for (const k of STAT_KEYS) counts[k] += g[k];
    }
    expect(counts.power).toBeGreaterThan(counts.speed * 2);
  });

  it('the same MONZ and level always roll the same growth', () => {
    expect(autoGrowthAt('bunk', 'm1', 10)).toEqual(autoGrowthAt('bunk', 'm1', 10));
    expect(sum(autoGrowthAt('bunk', 'm1', 10))).toBe(27);
  });
});

describe('stat max 150', () => {
  it('auto growth never pushes a stat past 150 and free points cannot go there', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    for (let i = 0; i < 400; i++) rec.grant({ runId: `r${i}`, source: 'test', coins: 0, exp: 2000 });
    const st = currentStats(rec.monz);
    for (const k of STAT_KEYS) expect(st[k]).toBeLessThanOrEqual(STAT_MAX);
    rec['data'].monz[0].alloc.hp = STAT_MAX;
    expect(rec.allocate('hp')).toBe(false);
  });
});

describe('level-up growth and free points', () => {
  it('each level adds 3 automatically and 1 free point', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    const ups: number[] = [];
    rec.on((e) => e.type === 'levelUp' && ups.push(sum(e.gain)));
    for (let i = 0; i < 200; i++) rec.grant({ runId: `r${i}`, source: 'test', coins: 0, exp: 500 });
    const lv = rec.level;
    expect(lv).toBeGreaterThan(50);
    expect(sum(rec.monz.auto)).toBe((lv - 1) * 3);
    expect(rec.monz.auto).toEqual(autoGrowthAt('bunk', rec.monz.uid, lv));
    expect(rec.monz.statPoints).toBe(lv - 1);
    expect(ups.every((g) => g === 3)).toBe(true);
    expect(sum(currentStats(rec.monz))).toBe(35 + (lv - 1) * 3);
  });

  it('free points go to one normal stat, cannot be undone, and never to love', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    expect(rec.allocate('power')).toBe(false);
    rec.grant({ runId: 'a', source: 'test', coins: 0, exp: 300 });
    const pts = rec.monz.statPoints;
    expect(rec.allocate('power')).toBe(true);
    expect(rec.monz.alloc.power).toBe(1);
    expect(rec.monz.statPoints).toBe(pts - 1);
    expect(rec.allocate('love' as never)).toBe(false);
    expect(new LifeRecord(loadLife(store), store).monz.alloc.power).toBe(1);
  });
});

describe('save migration to v4', () => {
  const v2 = (level: number) => ({
    version: 2,
    coins: 55,
    activeMonz: 'm1',
    monz: [{ uid: 'm1', species: 'bunk', name: 'ポチ', level, exp: 12, statPoints: 0.4, stats: {}, needs: { full: 0.3 } }],
    inventory: { owned: ['x'], placed: [] },
    place: 'alley',
    lastSeen: 1,
    claimed: ['card-1'],
  });

  it('gives 3x(N-1) random auto growth and (N-1) free points, keeping everything else', () => {
    const d = migrateLife(v2(5))!;
    const m = d.monz[0];
    expect(d.version).toBe(4);
    expect(sum(m.auto)).toBe(12);
    expect(m.statPoints).toBe(4);
    expect(m.love).toBe(LOVE_RULES.initial);
    expect([d.coins, m.name, m.level, m.exp, d.place, d.claimed[0], d.inventory.owned[0]]).toEqual([55, 'ポチ', 5, 12, 'alley', 'card-1', 'x']);
    expect(m.needs.full).toBe(0.3);
  });

  it('turns version 3 tenths back into whole points and keeps love', () => {
    const v3 = { ...v2(4), version: 3, monz: [{ uid: 'm1', species: 'bunk', level: 4, exp: 0, statPoints: 2, auto: { hp: 18, power: 27, tough: 24, speed: 9, tech: 12 }, alloc: { hp: 0, power: 1, tough: 0, speed: 0, tech: 0 }, love: 33 }] };
    const m = migrateLife(v3)!.monz[0];
    expect(sum(m.auto)).toBe(9);
    expect(sum(m.alloc)).toBe(0);
    expect(m.statPoints).toBe(3);
    expect(m.love).toBe(33);
  });

  it('is not applied twice', () => {
    const store = memoryStore();
    store.setItem(LIFE_KEY, JSON.stringify(v2(5)));
    const once = loadLife(store);
    new LifeRecord(once, store).add(1);
    const twice = loadLife(store);
    expect(twice.monz[0].auto).toEqual(once.monz[0].auto);
    expect(twice.monz[0].statPoints).toBe(4);
    expect(twice.version).toBe(4);
  });
});

describe('love', () => {
  const day = Date.UTC(2026, 9, 20, 3);

  it('starts at 20, grows +0.5 per meal only when the hidden hunger gauge is 8 or less, never from petting', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    expect(rec.monz.love).toBe(20);
    rec['data'].monz[0].needs.full = 0.9; // ゲージ 9: 2目もり ぜんぶは食べられないので増えない
    rec.feed(day);
    expect(rec.monz.love).toBe(20);
    rec['data'].monz[0].needs.full = 0.8; // ゲージ 8
    rec.feed(day);
    expect(rec.monz.love).toBe(20.5);
    expect(rec.needs.full).toBeCloseTo(1);
    for (let i = 0; i < 6; i++) {
      rec['data'].monz[0].needs.full = 0.3;
      rec.feed(day);
    }
    expect(rec.monz.love).toBe(23.5); // 1日の上限はない
    expect(shownLove(rec.monz.love)).toBe(23);
    for (let i = 0; i < 10; i++) rec.pet(true, day);
    expect(rec.monz.love).toBe(23.5);
  });

  it('the hunger gauge goes down 1 of 10 per hour, and a meal gives back 2', () => {
    expect(NEEDS_RULES.hungerHours).toBe(10);
    expect(NEEDS_RULES.feedFull).toBeCloseTo(0.2);
    const n = stepNeeds({ full: 1, sleepy: 0, mood: 1, asleep: false }, 3600, false);
    expect(n.full).toBeCloseTo(0.9);
  });

  it('never goes above the max', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    rec['data'].monz[0].love = LOVE_RULES.max;
    rec['data'].monz[0].needs.full = 0;
    rec.feed(day);
    expect(rec.monz.love).toBe(LOVE_RULES.max);
  });
});

describe('modes and love save', () => {
  it('computes stats per mode without changing the saved data', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    const before = JSON.stringify(rec.monz);
    expect(statsForMode(rec.monz, 'online').stats.hp).toBe(10);
    expect(JSON.stringify(rec.monz)).toBe(before);
  });

  it('love save fires at most the allowed number of times', () => {
    const always = () => 1;
    expect(tryLoveSave(50, 0, () => 0.5, always)).toBe(true);
    expect(tryLoveSave(50, 1, () => 0.5, always)).toBe(false);
    expect(tryLoveSave(50, 0, () => 0.5, () => 0)).toBe(false);
  });
});
