import { describe, expect, it } from 'vitest';
import { DIAMOND_CAT, furniture } from './furniture';
import { LifeRecord, migrateLife, newLife } from './lifeSave';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const exp = (r: LifeRecord) => r.snapshot.monz[0].exp + r.snapshot.monz[0].level * 1e6;
const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();

describe('ダイヤモンドキャット(2026-11-19 企画者)', () => {
  it('ストリートの 家具・ショップには 出ない', () => {
    expect(furniture(DIAMOND_CAT)).toMatchObject({ series: 'street', name: 'ダイヤモンドキャット', prize: true });
  });

  it('置いて おくと 0時を こえる たびに 経験値 +1,000(閉じて いた 日数ぶんも)・置かないと 入らない', () => {
    const r = new LifeRecord(newLife(1), mem());
    r.receiveItem(DIAMOND_CAT);
    expect(r.diamondCat(at(1))).toBe(0);
    r.placeItem(DIAMOND_CAT, 300, 900);
    // 置いた 日は 入らない
    expect(r.diamondCat(at(1, 13))).toBe(0);
    expect(r.diamondCat(at(1, 23))).toBe(0);
    const e0 = exp(r);
    // 0時を こえた
    expect(r.diamondCat(at(2, 0))).toBeGreaterThan(0);
    expect(r.diamondCat(at(2, 9))).toBe(0);
    // 3日 あけた → 3日ぶん
    r.diamondCat(at(5, 8));
    expect(exp(r)).not.toBe(e0);
    // 保存して 読みこんでも 続く
    const again = new LifeRecord(migrateLife(JSON.parse(JSON.stringify(r.snapshot)))!, mem());
    expect(again.snapshot.catDay).toBe(r.snapshot.catDay);
  });

  it('入る 量は 1日 1,000', () => {
    const a = new LifeRecord(newLife(1), mem());
    a.receiveItem(DIAMOND_CAT);
    const uid = a.placeItem(DIAMOND_CAT, 300, 900)!;
    a.diamondCat(at(1));
    expect(a.diamondCat(at(4))).toBe(3000);
    expect(a.diamondCat(at(5))).toBe(1000);
    // しまうと 数え なおし
    a.storePlaced(uid);
    expect(a.diamondCat(at(6))).toBe(0);
    a.placeItem(DIAMOND_CAT, 300, 900);
    expect(a.diamondCat(at(6, 20))).toBe(0);
    expect(a.diamondCat(at(7))).toBe(1000);
  });
});
