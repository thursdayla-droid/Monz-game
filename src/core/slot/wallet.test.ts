import { describe, expect, it } from 'vitest';
import { EXCHANGE_RATE, exchangeCoins, SLOT_SHOP_ITEMS, SLOT_WALLET_KEY, SlotWallet } from './wallet';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('ROYAL JACKPOT 専用の コイン(企画者 2026-11-12)', () => {
  it('はじめは 0・回す・当たり・保存される', () => {
    const s = memStore();
    const w = new SlotWallet(s);
    expect(w.coins).toBe(0);
    expect(w.slotSpin(10, 0)).toBe(false);
    w.add(100);
    expect(w.slotSpin(50, 120)).toBe(true);
    expect(w.coins).toBe(170);
    expect(new SlotWallet(s).coins).toBe(170);
    expect(JSON.parse(s.m.get(SLOT_WALLET_KEY)!).coins).toBe(170);
  });

  it('MONZ コイン → スロットの コインは 買える・足りなければ 何も しない', () => {
    const w = new SlotWallet(memStore());
    let monz = 1500;
    const purse = { get earnedCoins() { return monz; }, spendEarned: (n: number) => (n > monz ? false : ((monz -= n), true)) };
    expect(exchangeCoins(purse, w, 1000)).toBe(true);
    expect([monz, w.coins]).toEqual([500, 1000 * EXCHANGE_RATE]);
    expect(exchangeCoins(purse, w, 1000)).toBe(false);
    expect([monz, w.coins]).toEqual([500, 1000 * EXCHANGE_RATE]);
  });

  it('スロットの コインを MONZ コインに する 方法は ない', () => {
    const w = new SlotWallet(memStore()) as unknown as Record<string, unknown>;
    for (const k of ['toMonz', 'withdraw', 'cashOut', 'exchangeToMonz']) expect(w[k]).toBeUndefined();
  });

  it('ショップ: 5枠・中身が 決まるまで 交換できない・決まれば コインで 交換', () => {
    expect(SLOT_SHOP_ITEMS).toHaveLength(5);
    const w = new SlotWallet(memStore());
    w.add(500);
    expect(w.buy(SLOT_SHOP_ITEMS[0])).toBe(false);
    const item = { id: 'test', name: 'テスト', price: 300, ready: true };
    expect(w.buy(item)).toBe(true);
    expect([w.coins, w.itemCount('test')]).toEqual([200, 1]);
    expect(w.buy(item)).toBe(false);
  });

  it('こわれた 保存でも 0 から', () => {
    const s = memStore();
    s.setItem(SLOT_WALLET_KEY, '{oops');
    expect(new SlotWallet(s).coins).toBe(0);
    s.setItem(SLOT_WALLET_KEY, JSON.stringify({ coins: -5, items: { a: 'x' } }));
    expect(new SlotWallet(s).coins).toBe(0);
  });
});

describe('お金で 買った MONZ コインは ロイヤルコインに できない(企画者 2026-11-12「コインは 売る 予定」)', () => {
  it('買った ぶんは 交換に 使えない・ふつうの 買い物では 買った ぶんから 先に へる・古い データは 全部 ゲームの コイン', async () => {
    const { LifeRecord, newLife, migrateLife } = await import('../lifeSave');
    const r = new LifeRecord({ ...newLife(1), coins: 1000, paidCoins: 0 });
    r.addPaid(500);
    expect([r.coins, r.paidCoins, r.earnedCoins]).toEqual([1500, 500, 1000]);
    const w = new SlotWallet(memStore());
    expect(exchangeCoins(r, w, 10000)).toBe(false);
    expect(exchangeCoins(r, w, 1000)).toBe(true);
    expect([r.coins, r.paidCoins, r.earnedCoins, w.coins]).toEqual([500, 500, 0, 1000]);
    expect(exchangeCoins(r, w, 100)).toBe(false);
    // ふつうの 買い物は 買った ぶんから
    r.add(300);
    expect(r.spend(600)).toBe(true);
    expect([r.coins, r.paidCoins, r.earnedCoins]).toEqual([200, 0, 200]);
    // 古い データ(paidCoins が ない)
    const old = migrateLife({ ...newLife(1), coins: 777, paidCoins: undefined });
    expect([old?.coins, old?.paidCoins]).toEqual([777, 0]);
  });
});
