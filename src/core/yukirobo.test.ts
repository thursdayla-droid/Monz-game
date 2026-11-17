import { describe, expect, it } from 'vitest';
import { furniture, YUKIROBO } from './furniture';
import { LifeRecord, newLife } from './lifeSave';
import { SLOT_SHOP_ITEMS, SlotWallet } from './slot/wallet';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const exp = (r: LifeRecord) => r.snapshot.monz[0].exp + r.snapshot.monz[0].level * 1e6;

describe('ゆうきロボ(2026-11-17 企画者)', () => {
  it('ROYAL JACKPOT の ショップの 5個目・5,000,000・サイバーの 家具(MONZ の ショップには 出ない)', () => {
    const item = SLOT_SHOP_ITEMS[4];
    expect(item).toMatchObject({ name: 'ゆうきロボ', price: 5_000_000, ready: true, furniture: YUKIROBO, text: 'ごはんとおかずを一緒に食べれない' });
    expect(furniture(YUKIROBO)).toMatchObject({ series: 'cyber', prize: true });
    const w = new SlotWallet(mem());
    expect(w.buy(item)).toBe(false);
    w.add(5_000_000);
    expect(w.buy(item)).toBe(true);
    expect(w.coins).toBe(0);
  });

  it('部屋に 置くと ごはん・なでる 1回ごとに 経験値 +10(置かないと ふえない)', () => {
    const a = new LifeRecord(newLife(1), mem());
    const b = new LifeRecord(newLife(1), mem());
    b.receiveItem(YUKIROBO);
    expect(b.owns(YUKIROBO)).toBe(1);
    // 持って いるだけ(アイテムボックス)では ふえない
    const a0 = exp(a);
    const b0 = exp(b);
    a.feed();
    b.feed();
    expect(exp(b) - b0).toBe(exp(a) - a0);
    b.placeItem(YUKIROBO, 300, 900);
    const a1 = exp(a);
    const b1 = exp(b);
    a.feed();
    b.feed();
    expect(exp(b) - b1 - (exp(a) - a1)).toBe(10);
    const a2 = exp(a);
    const b2 = exp(b);
    a.pet(true);
    b.pet(true);
    expect(exp(b) - b2 - (exp(a) - a2)).toBe(10);
  });
});
