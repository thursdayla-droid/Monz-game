import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { drawScratch, SCRATCH_TABLE, type ScratchKind } from './scratch';

describe('スクラッチ(2026-11-17 企画者)', () => {
  it('割合の 合計は 100%', () => {
    for (const k of ['coin', 'exp'] as ScratchKind[]) expect(SCRATCH_TABLE[k].reduce((a, p) => a + p.rate, 0)).toBe(100);
  });

  it('当たり = 2つ そろう・ハズレ = 3つとも ちがう・割合は 表の とおり', () => {
    for (const k of ['coin', 'exp'] as ScratchKind[]) {
      const rng = mulberry32(7);
      const n = new Map<number, number>();
      const N = 100_000;
      for (let i = 0; i < N; i++) {
        const r = drawScratch(k, rng);
        const counts = new Map<string, number>();
        for (const m of r.marks) counts.set(m, (counts.get(m) ?? 0) + 1);
        if (r.prize.mark) {
          expect(counts.get(r.prize.mark)).toBe(2);
          expect(counts.size).toBe(2);
        } else expect(counts.size).toBe(3);
        n.set(r.prize.amount, (n.get(r.prize.amount) ?? 0) + 1);
      }
      for (const p of SCRATCH_TABLE[k]) expect(Math.abs((n.get(p.amount) ?? 0) / N - p.rate / 100)).toBeLessThan(0.006);
    }
    // 20万回 ためすので、公開の 自動テスト(混んでいると 遅い)でも 時間切れに ならない ように 30秒(2026-11-22 公開で 5秒を こえた)
  }, 30_000);
});

import { LifeRecord, newLife } from './lifeSave';
import { SLOT_SHOP_ITEMS } from './slot/wallet';

describe('スクラッチの 交換と 使う', () => {
  it('ROYAL JACKPOT の ショップの 上 2つ・100,000 RC・MONZ の ショップでは 買えない・1枚 使うと へる', () => {
    expect(SLOT_SHOP_ITEMS.slice(0, 2).map((i) => [i.name, i.price, i.furniture])).toEqual([
      ['コインスクラッチ', 100_000, 'scratch_coin'],
      ['EXPスクラッチ', 100_000, 'scratch_exp'],
    ]);
    const r = new LifeRecord(newLife(1));
    r.add(1_000_000);
    expect(r.buy('scratch_coin')).toBe(false);
    r.receiveItem('scratch_coin');
    expect(r.owns('scratch_coin')).toBe(1);
    expect(r.useItem('scratch_coin')).toBe(true);
    expect(r.owns('scratch_coin')).toBe(0);
    expect(r.useItem('scratch_coin')).toBe(false);
  });
});
