import { describe, expect, it } from 'vitest';
import { FURNITURE, FURNITURE_KINDS, FURNITURE_SERIES, furniture, MOVE_TICKET } from '../src/core/furniture';
import { LIFE_KEY, LifeRecord, loadLife, migrateLife, newLife } from '../src/core/lifeSave';
import type { KeyValueStore } from '../src/core/save';

const memoryStore = (): KeyValueStore => {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};

const recordWith = (coins: number) => {
  const store = memoryStore();
  const rec = new LifeRecord({ ...newLife(1), coins, place: 'street' }, store);
  return { rec, store };
};

describe('furniture list', () => {
  it('has 3 series (+ VIP) x 6 kinds, with unique ids, not tied to any room', () => {
    expect(FURNITURE).toHaveLength(FURNITURE_SERIES.length * FURNITURE_KINDS.length);
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(24);
    expect(FURNITURE.filter((f) => f.series !== 'vip')).toHaveLength(18);
    expect(furniture('pop_bed')).toMatchObject({ series: 'pop', kind: 'bed', price: 500 });
    expect(Object.keys(furniture('cyber_toy')!)).not.toContain('room');
  });
});

describe('item box', () => {
  it('buys with coins, can buy the same thing twice, and refuses when coins are short', () => {
    const { rec } = recordWith(900);
    expect(rec.buy('street_bed')).toBe(true);
    expect(rec.buy('street_bed')).toBe(false);
    expect(rec.coins).toBe(400);
    expect(rec.buy('pop_toy')).toBe(true);
    expect(rec.buy('pop_toy')).toBe(true);
    expect([rec.owns('pop_toy'), rec.inBox('pop_toy'), rec.coins]).toEqual([2, 2, 100]);
    expect(rec.buy('unknown')).toBe(false);
  });

  it('places, moves, flips and stores furniture; the box count follows', () => {
    const { rec, store } = recordWith(1000);
    rec.buy('cyber_sofa');
    const uid = rec.placeItem('cyber_sofa', 400, 900)!;
    expect(rec.inBox('cyber_sofa')).toBe(0);
    expect(rec.placeItem('cyber_sofa', 500, 900)).toBeNull();
    rec.movePlaced(uid, 420, 950, true);
    expect(loadLife(store).inventory.placed).toEqual([{ uid, item: 'cyber_sofa', x: 420, y: 950, flip: true }]);
    rec.storePlaced(uid);
    expect([rec.inBox('cyber_sofa'), rec.snapshot.inventory.placed.length]).toEqual([1, 0]);
  });

  it('a move ticket reveals the 4th room, moves once, and sends furniture back to the box', () => {
    const { rec } = recordWith(20000);
    expect(rec.snapshot.secretRoom).toBeUndefined();
    expect(rec.moveTo('pop')).toBe(false);
    rec.buy('street_bed');
    rec.placeItem('street_bed', 400, 900);
    rec.buy(MOVE_TICKET);
    expect(rec.snapshot.secretRoom).toBe(true);
    expect(rec.moveTo('street')).toBe(false);
    expect(rec.moveTo('pop')).toBe(true);
    expect([rec.snapshot.place, rec.owns(MOVE_TICKET), rec.owns('street_bed'), rec.inBox('street_bed')]).toEqual(['pop', 0, 1, 1]);
    expect(rec.moveTo('future')).toBe(false);
    expect(rec.snapshot.secretRoom).toBe(true);
  });

  it('the VIP room can be moved into only after it is found, and opens VIP furniture', () => {
    const { rec } = recordWith(40000);
    expect(rec.buy('vip_bed')).toBe(false);
    rec.buy(MOVE_TICKET);
    rec.buy(MOVE_TICKET);
    expect(rec.buy('vip_bed')).toBe(false);
    expect(rec.moveTo('room4')).toBe(true);
    expect(rec.snapshot.vipOpen).toBe(true);
    expect(rec.buy('vip_bed')).toBe(true);
    // ほかの部屋に引っ越しても、VIPの家具は買えるまま
    expect(rec.moveTo('pop')).toBe(true);
    expect(rec.buy('vip_toy')).toBe(true);
  });

  it('cannot move into the VIP room before finding it', () => {
    const { rec } = recordWith(20000);
    rec.buy(MOVE_TICKET);
    const store = memoryStore();
    const fresh = new LifeRecord({ ...newLife(1), coins: 0, place: 'street', inventory: { owned: [MOVE_TICKET], placed: [] } }, store);
    expect(fresh.moveTo('room4')).toBe(false);
    expect(rec.moveTo('room4')).toBe(true);
  });

  it('keeps old saves working and drops broken placed furniture', () => {
    const d = migrateLife({ ...newLife(1), inventory: { owned: ['pop_bed'], placed: [{ item: 'pop_bed', x: 1, y: 2 }, { item: 'pop_bed', x: 3, y: 4 }, { item: 'x', x: 1, y: 1 }, null] } })!;
    expect(d.inventory.placed).toEqual([{ uid: 'p1', item: 'pop_bed', x: 1, y: 2, flip: false }]);
    const store = memoryStore();
    store.setItem(LIFE_KEY, JSON.stringify({ ...newLife(1), coins: 33, place: 'pop' }));
    expect(loadLife(store)).toMatchObject({ coins: 33, place: 'pop', inventory: { owned: [], placed: [] } });
  });
});

describe('room layout', async () => {
  const { canPlace, floorConnected, footRect } = await import('../src/core/roomLayout');
  const floor: [number, number][] = [[0, 0], [600, 0], [600, 400], [0, 400]];
  const at = (item: string, x: number, y: number) => ({ item, x, y, persp: 1 });

  it('keeps furniture on the floor and not on top of each other', () => {
    expect(canPlace(at('street_bed', 300, 200), [], floor)).toBe(true);
    expect(canPlace(at('street_bed', 50, 200), [], floor)).toBe(false);
    expect(canPlace(at('pop_toy', 300, 190), [at('street_bed', 300, 200)], floor)).toBe(false);
    // カーペットは床と同じあつかい: 家具の下・ほかのカーペットの下にも置ける(企画者の指示 2026-10-22)
    expect(canPlace(at('cyber_table', 300, 300), [at('pop_carpet', 300, 330)], floor)).toBe(true);
    expect(canPlace(at('pop_carpet', 300, 330), [at('cyber_table', 300, 300), at('street_carpet', 300, 330)], floor)).toBe(true);
    // 大きいカーペットは床からはみ出してもよい(まん中が床の上なら)
    expect(canPlace({ ...at('pop_carpet', 300, 390), size: 2 }, [], floor)).toBe(true);
  });

  it('does not let furniture cut the floor in two', () => {
    const wall = { x0: -10, x1: 610, y0: 180, y1: 220 };
    expect(floorConnected(floor, [wall])).toBe(false);
    expect(floorConnected(floor, [{ ...wall, x1: 400 }])).toBe(true);
    expect(footRect(at('street_bed', 300, 200)).y1).toBe(200);
  });
});
