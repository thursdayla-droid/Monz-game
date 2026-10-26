import { describe, expect, it } from 'vitest';
import { furniture, FURNITURE, MOVE_TICKET } from '../src/core/furniture';
import { LIFE_KEY, LifeRecord, loadLife, migrateLife, newLife } from '../src/core/lifeSave';
import { card } from '../src/core/mythclash/cards';
import { battleUnlocked, drawPackCard, fixCollection, kindsToUnlock, ownedKinds, PACK_PRICE, PACK_RATES } from '../src/core/mythclash/packs';
import { mulberry32 } from '../src/core/rng';
import type { KeyValueStore } from '../src/core/save';

const memoryStore = (): KeyValueStore => {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const recordWith = (coins: number, store: KeyValueStore = memoryStore()) => ({ rec: new LifeRecord({ ...newLife(1), coins, place: 'street' }, store), store });

describe('MYTHCLASH packs', () => {
  it('rates add up to 100% and SEC is 0.2%', () => {
    expect(Object.values(PACK_RATES).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(PACK_RATES.SEC).toBe(0.002);
  });

  it('draws follow the rates (seeded, reproducible)', () => {
    const rng = mulberry32(42);
    const n = 200_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = card(drawPackCard(rng))!.rarity;
      counts[r] = (counts[r] ?? 0) + 1;
    }
    for (const [r, p] of Object.entries(PACK_RATES)) expect(counts[r] / n).toBeCloseTo(p, 2);
    expect(drawPackCard(mulberry32(7))).toBe(drawPackCard(mulberry32(7)));
  });

  it('buying 10 packs costs 5,000 and gives 10 cards, saved together with the coins', () => {
    const { rec, store } = recordWith(6000);
    const got = rec.buyPacks(10, 'p1', mulberry32(1))!;
    expect(got.cards).toHaveLength(10);
    expect(rec.coins).toBe(1000);
    const saved = loadLife(store);
    expect(saved.coins).toBe(1000);
    expect(Object.values(saved.mythclash!.owned).reduce((a, b) => a + b, 0)).toBe(10);
    expect(saved.mythclash!.packs).toBe(10);
    // はじめて手に入れたカード = 出たカードの種類
    expect(got.newIds.sort()).toEqual([...new Set(got.cards)].sort());
  });

  it('cannot buy twice with the same purchase id, or without enough coins', () => {
    const { rec } = recordWith(PACK_PRICE * 2);
    expect(rec.buyPacks(1, 'same', mulberry32(1))).not.toBeNull();
    expect(rec.buyPacks(1, 'same', mulberry32(2))).toBeNull();
    expect(rec.coins).toBe(PACK_PRICE);
    expect(rec.buyPacks(10, 'other', mulberry32(3))).toBeNull();
    expect(rec.coins).toBe(PACK_PRICE);
  });

  it('if saving fails, nothing changes (no coins lost, no cards)', () => {
    const broken: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    const { rec } = recordWith(5000, broken);
    expect(rec.buyPacks(10, 'p', mulberry32(1))).toBeNull();
    expect(rec.coins).toBe(5000);
    expect(ownedKinds(rec.mythclash)).toBe(0);
  });

  it('duplicates are counted; battle unlocks at 3 different cards', () => {
    const col = fixCollection({ owned: { 1: 3, 2: 1 }, packs: 4 });
    expect([ownedKinds(col), battleUnlocked(col), kindsToUnlock(col)]).toEqual([2, false, 1]);
    expect(battleUnlocked(fixCollection({ owned: { 1: 1, 2: 1, 3: 1 } }))).toBe(true);
    // 知らないカード・おかしな枚数は捨てる
    expect(fixCollection({ owned: { 999: 1, 5: -1, 6: 'x', 7: 2 }, packs: -3 })).toEqual({ owned: { 7: 2 }, packs: 0 });
  });

  it('a deck of 3 different owned cards is remembered; invalid decks are not', () => {
    const { rec, store } = recordWith(0);
    expect(rec.setMythDeck([1, 2, 3])).toBe(false);
    const r2 = new LifeRecord({ ...newLife(1), mythclash: { owned: { 1: 1, 2: 2, 3: 1 }, packs: 4 } }, store);
    expect(r2.setMythDeck([1, 1, 2])).toBe(false);
    expect(r2.setMythDeck([3, 1, 2])).toBe(true);
    expect(loadLife(store).mythclash!.deck).toEqual([3, 1, 2]);
    // 持っていないカードが入ったデッキは、読みこむときに捨てる
    expect(fixCollection({ owned: { 1: 1 }, deck: [1, 2, 3] }).deck).toBeUndefined();
    void rec;
  });

  it('old saves (without MYTHCLASH data) still load, and the collection is kept on reload', () => {
    const old = { ...newLife(1), coins: 700 } as Record<string, unknown>;
    delete old.mythclash;
    const m = migrateLife(old)!;
    expect(m.coins).toBe(700);
    expect(m.mythclash).toBeUndefined();
    const store = memoryStore();
    store.setItem(LIFE_KEY, JSON.stringify({ ...newLife(1), mythclash: { owned: { 26: 1 }, packs: 1 } }));
    expect(loadLife(store).mythclash).toEqual({ owned: { 26: 1 }, packs: 1 });
  });
});

describe('buying several items at once', () => {
  it('furniture and move tickets can be bought together in one go', () => {
    const f = FURNITURE.find((x) => x.series === 'street' && !x.prize)!;
    const { rec, store } = recordWith(f.price * 3 + 10);
    expect(rec.buyMany(f.id, 3)).toEqual([f.id, f.id, f.id]);
    expect(rec.owns(f.id)).toBe(3);
    expect(rec.coins).toBe(10);
    expect(loadLife(store).inventory.owned.filter((o) => o === f.id)).toHaveLength(3);
    // 足りなければ1つも買わない
    expect(rec.buyMany(f.id, 1)).toBeNull();
    const t = recordWith(30000).rec;
    expect(t.buyMany(MOVE_TICKET, 2)).toHaveLength(2);
    expect(t.owns(MOVE_TICKET)).toBe(2);
    expect(t.snapshot.secretRoom).toBe(true);
  });

  it('mystery furniture picks a prize for each one', () => {
    const box = furniture('vip_toy')!;
    const rec = new LifeRecord({ ...newLife(1), coins: box.price * 4, place: 'street', vipOpen: true }, memoryStore());
    const got = rec.buyMany('vip_toy', 4, mulberry32(5))!;
    expect(got).toHaveLength(4);
    for (const g of got) expect(['vip_toy_a', 'vip_toy_b']).toContain(g);
  });
});
