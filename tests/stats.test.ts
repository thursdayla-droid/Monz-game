import { describe, expect, it } from 'vitest';
import { LIFE_KEY, LifeRecord, loadLife, migrateLife } from '../src/core/lifeSave';
import type { KeyValueStore } from '../src/core/save';
import { SPECIES } from '../src/core/species';
import { AUTO_GROWTH_PER_LEVEL, currentStats, fmt, LOVE_RULES, SPECIES_STATS, STAT_KEYS, statsForMode, tryLoveSave } from '../src/core/stats';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const sum = (b: Record<string, number>) => Object.values(b).reduce((a, v) => a + v, 0);

describe('stats table', () => {
  it('every species grows exactly 3.0 per level', () => {
    for (const [id, s] of Object.entries(SPECIES_STATS)) expect(sum(s!.growth), id).toBe(AUTO_GROWTH_PER_LEVEL);
  });

  it('BUNK uses the planner provisional numbers', () => {
    const b = SPECIES_STATS.bunk!;
    expect(STAT_KEYS.map((k) => fmt(b.base[k]))).toEqual(['10.0', '8.0', '8.0', '4.0', '5.0']);
    expect(STAT_KEYS.map((k) => fmt(b.growth[k]))).toEqual(['0.6', '0.9', '0.8', '0.3', '0.4']);
    expect(SPECIES.bunk.ready).toBe(true);
  });
});

describe('level-up growth and free points', () => {
  it('each level adds 3.0 automatically and 0.1 free point, without float drift', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    for (let i = 0; i < 200; i++) rec.grant({ runId: `r${i}`, source: 'test', coins: 0, exp: 500 });
    const lv = rec.level;
    expect(lv).toBeGreaterThan(50);
    expect(sum(rec.monz.auto)).toBe((lv - 1) * 30);
    expect(rec.monz.statPoints).toBe(lv - 1);
    expect(fmt(currentStats(rec.monz).power)).toBe(((80 + 9 * (lv - 1)) / 10).toFixed(1));
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

describe('save migration v2 -> v3', () => {
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

  it('gives (N-1) auto growths and 0.1x(N-1) free points, keeping everything else', () => {
    const d = migrateLife(v2(5))!;
    const m = d.monz[0];
    expect(d.version).toBe(3);
    expect(m.auto).toEqual({ hp: 24, power: 36, tough: 32, speed: 12, tech: 16 });
    expect(m.statPoints).toBe(4);
    expect(m.love).toBe(LOVE_RULES.initial);
    expect([d.coins, m.name, m.level, m.exp, d.place, d.claimed[0], d.inventory.owned[0]]).toEqual([55, 'ポチ', 5, 12, 'alley', 'card-1', 'x']);
    expect(m.needs.full).toBe(0.3);
  });

  it('is not applied twice', () => {
    const store = memoryStore();
    store.setItem(LIFE_KEY, JSON.stringify(v2(5)));
    const once = loadLife(store);
    new LifeRecord(once, store).add(1);
    const twice = loadLife(store);
    expect(twice.monz[0].auto).toEqual(once.monz[0].auto);
    expect(twice.monz[0].statPoints).toBe(4);
    expect(twice.version).toBe(3);
  });
});

describe('love', () => {
  const day = Date.UTC(2026, 9, 20, 3);

  it('starts at 20 and grows only from hungry meals and happy pets, with daily caps', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    expect(rec.monz.love).toBe(20);
    rec.feed(day); // お腹いっぱい(0.8)なので増えない
    expect(rec.monz.love).toBe(20);
    rec['data'].monz[0].needs.full = 0.1;
    rec.feed(day);
    expect(rec.monz.love).toBe(22);
    rec['data'].monz[0].needs.full = 0.1;
    rec.feed(day);
    rec['data'].monz[0].needs.full = 0.1;
    rec.feed(day); // 1日の上限(+4)
    expect(rec.monz.love).toBe(24);
    rec.pet(false, day);
    expect(rec.monz.love).toBe(24);
    for (let i = 0; i < 10; i++) rec.pet(true, day);
    expect(rec.monz.love).toBe(27);
    rec.pet(true, day + 24 * 3600 * 1000);
    expect(rec.monz.love).toBe(28);
  });

  it('never goes above the max', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    rec['data'].monz[0].love = LOVE_RULES.max;
    rec.pet(true, day);
    expect(rec.monz.love).toBe(LOVE_RULES.max);
  });
});

describe('modes and love save', () => {
  it('computes stats per mode without changing the saved data', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    const before = JSON.stringify(rec.monz);
    expect(statsForMode(rec.monz, 'online').stats.hp).toBe(100);
    expect(JSON.stringify(rec.monz)).toBe(before);
  });

  it('love save fires at most the allowed number of times', () => {
    const always = () => 1;
    expect(tryLoveSave(50, 0, () => 0.5, always)).toBe(true);
    expect(tryLoveSave(50, 1, () => 0.5, always)).toBe(false);
    expect(tryLoveSave(50, 0, () => 0.5, () => 0)).toBe(false);
  });
});
