import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { dealChests, evaluate, newBonus, pickChest, PAY_SCALE, simulate, spinGrid, symbolProbs, theory, type Grid, type SymbolId } from './slot';

/** 縦の 3つずつ(リール)を 書いて 画面を 作る。足りない 所は 当たらない 図柄で うめる */
const g = (...reels: SymbolId[][]): Grid => Array.from({ length: 5 }, (_, r) => [0, 1, 2].map((i) => reels[r]?.[i] ?? (['gold7', 'diamond', 'bell', 'star', 'clover'] as SymbolId[])[(r + i * 2) % 5]));

describe('MONZ SLOT 243WAYS', () => {
  it('仕様書の 例: チェリーが 2・2・1 → 3連が 4WAYS', () => {
    const grid: Grid = [
      ['cherry', 'cherry', 'star'],
      ['cherry', 'bell', 'cherry'],
      ['diamond', 'cherry', 'gold7'],
      ['star', 'bell', 'clover'],
      ['gold7', 'diamond', 'bell'],
    ];
    const r = evaluate(grid, 100);
    const c = r.wins.find((w) => w.symbol === 'cherry')!;
    expect(c).toMatchObject({ length: 3, ways: 4 });
    expect(c.raw).toBeCloseTo(100 * 0.34 * PAY_SCALE * 4);
  });

  it('いちばん 長い 連続だけ(3連と 5連を 二重に 数えない)', () => {
    const grid: Grid = Array.from({ length: 5 }, () => ['bell', 'star', 'clover'] as SymbolId[]);
    const r = evaluate(grid, 10);
    const bells = r.wins.filter((w) => w.symbol === 'bell');
    expect(bells).toHaveLength(1);
    expect(bells[0]).toMatchObject({ length: 5, ways: 1 });
  });

  it('ちがう 図柄の 当たりは 全部 足して、さいごに 四捨五入', () => {
    const grid: Grid = Array.from({ length: 5 }, (_, r) => (r < 3 ? ['star', 'clover', 'cherry'] : ['gold7', 'diamond', 'bell']) as SymbolId[]);
    const r = evaluate(grid, 10);
    expect(r.wins.map((w) => w.symbol).sort()).toEqual(['cherry', 'clover', 'star']);
    // (2.99 + 3.4 + 3.4) × 1.0195 = 9.98 → 10(1つずつ 四捨五入すると 3+3+3 = 9 に なって しまう)
    expect(r.win).toBe(10);
  });

  it('左端から でないと 当たらない・2連では 当たらない', () => {
    expect(evaluate(g(['gold7'], ['rainbow7'], ['rainbow7'], ['rainbow7'], ['rainbow7']), 100).wins.find((w) => w.symbol === 'rainbow7')).toBeUndefined();
    const two: Grid = [
      ['rainbow7', 'star', 'star'],
      ['rainbow7', 'star', 'star'],
      ['bell', 'bell', 'bell'],
      ['clover', 'clover', 'clover'],
      ['cherry', 'cherry', 'cherry'],
    ];
    expect(evaluate(two, 100).wins.find((w) => w.symbol === 'rainbow7')).toBeUndefined();
  });

  it('全部 同じ 図柄なら 3^5 = 243 WAYS', () => {
    const grid: Grid = Array.from({ length: 5 }, () => ['star', 'star', 'star'] as SymbolId[]);
    expect(evaluate(grid, 10).wins[0]).toMatchObject({ symbol: 'star', length: 5, ways: 243 });
  });

  it('王冠 3個 以上で ボーナス(場所は どこでも)・王冠は 並びの 配当なし', () => {
    const grid: Grid = [
      ['crown', 'star', 'bell'],
      ['gold7', 'diamond', 'bell'],
      ['crown', 'clover', 'cherry'],
      ['star', 'bell', 'clover'],
      ['gold7', 'diamond', 'crown'],
    ];
    const r = evaluate(grid, 10);
    expect(r.crowns).toBe(3);
    expect(r.bonus).toBe(true);
    expect(r.wins.find((w) => (w.symbol as string) === 'crown')).toBeUndefined();
    grid[4][2] = 'star';
    expect(evaluate(grid, 10).bonus).toBe(false);
  });

  it('出る 確率は 合計 ちょうど 1', () => {
    const p = symbolProbs();
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});

describe('宝箱ボーナス', () => {
  it('毎ラウンド 大当たり・普通・終了が 1つずつ(まぜる)', () => {
    const rng = mulberry32(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = dealChests(rng);
      expect([...c].sort()).toEqual(['big', 'end', 'normal']);
      seen.add(c.join());
    }
    expect(seen.size).toBe(6);
  });

  it('大当たり 5倍・普通 1倍で 続く・終了で おわり(それまでの 合計は もらえる)', () => {
    const rng = mulberry32(9);
    const b = newBonus(rng, 50);
    b.chests = ['big', 'normal', 'end'];
    pickChest(b, 0, rng);
    expect(b).toMatchObject({ total: 250, round: 2, over: false });
    b.chests = ['normal', 'end', 'big'];
    pickChest(b, 0, rng);
    b.chests = ['normal', 'end', 'big'];
    pickChest(b, 1, rng);
    expect(b).toMatchObject({ total: 300, over: true, history: ['big', 'normal', 'end'] });
  });
});

describe('払い戻し率', () => {
  it('理論値: 宝箱は 約 100回転に 1回・平均 BET の 6倍(払い戻し率は 企画者の 決定で 95% より 上。特別フリーゲームは のぞく)', () => {
    const t = theory();
    expect(t.total).toBeGreaterThan(0.9);
    expect(t.total).toBeLessThan(3);
    expect(1 / t.bonusRate).toBeGreaterThan(90);
    expect(1 / t.bonusRate).toBeLessThan(110);
    expect(t.bonusAvg).toBeCloseTo(6, 10);
  });

  it('モンテカルロ(20万回転)が 理論値と だいたい 合う', () => {
    const t = theory();
    const s = simulate(100, 200_000, 11);
    // 特別フリーゲームは 理論値に 入って いないので のぞいて くらべる(ぶれは 宝箱の 分だけ 見る)
    expect(Math.abs(s.totalRtp - s.freeRtp - t.total)).toBeLessThan(0.02);
    expect(Math.abs(s.bonusRate - t.bonusRate)).toBeLessThan(0.001);
  });
});

describe('MONZ コインで 遊ぶ(LifeRecord.slotSpin)', () => {
  it('BET を はらって 当たりを もらう・足りなければ 回せない', async () => {
    const { LifeRecord, newLife } = await import('../lifeSave');
    const r = new LifeRecord({ ...newLife(1), coins: 120 });
    expect(r.slotSpin(100, 30)).toBe(true);
    expect(r.coins).toBe(50);
    expect(r.slotSpin(100, 0)).toBe(false);
    expect(r.coins).toBe(50);
    expect(r.slotSpin(50, 500)).toBe(true);
    expect(r.coins).toBe(500);
  });
});

describe('王冠は 1リール 1個まで(企画者 2026-11-10)', () => {
  it('どの リールにも 王冠は 2個 以上 出ない', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 50_000; i++) for (const col of spinGrid(rng)) expect(col.filter((x) => x === 'crown').length).toBeLessThanOrEqual(1);
  });
});

describe('特別フリーゲーム(企画者 2026-11-11)', () => {
  it('王冠 4個で 5回・5個で 10回・3個は 宝箱だけ', async () => {
    const { evaluate } = await import('./slot');
    const g = (n: number): Grid => Array.from({ length: 5 }, (_, r) => (r < n ? ['crown', 'star', 'bell'] : ['star', 'bell', 'clover']) as SymbolId[]);
    expect(evaluate(g(3), 10)).toMatchObject({ bonus: true, free: 0 });
    expect(evaluate(g(4), 10)).toMatchObject({ bonus: false, free: 5 });
    expect(evaluate(g(5), 10)).toMatchObject({ bonus: false, free: 10 });
  });

  it('5×5・ワイルドは 代わりに なる・のこる・新しい ワイルドが 出たら 回数を 使わない', async () => {
    const { freeSpin, newFree, evaluate } = await import('./slot');
    // ワイルドは 代わり
    const grid: Grid = [['star'], ['wild'], ['star'], ['bell'], ['bell']].map((c) => [...c, 'clover', 'cherry', 'diamond', 'gold7'] as SymbolId[]);
    expect(evaluate(grid, 10).wins.find((w) => w.symbol === 'star')).toMatchObject({ length: 3, ways: 1 });
    const rng = mulberry32(8);
    const st = newFree(10, 5);
    let sawNew = false;
    for (let i = 0; i < 400 && st.left > 0; i++) {
      const before = st.left;
      const stickyBefore = st.sticky.flat().filter(Boolean).length;
      const r = freeSpin(st, rng);
      expect(r.res.grid).toHaveLength(5);
      for (const col of r.res.grid) expect(col).toHaveLength(5);
      // のこった ワイルドは ワイルドの まま・新しい ワイルドは 空いた 所だけ
      expect(st.sticky.flat().filter(Boolean).length).toBe(stickyBefore + r.newWilds.length);
      for (let c = 0; c < 5; c++) for (let k = 0; k < 5; k++) if (st.sticky[c][k]) expect(r.res.grid[c][k]).toBe('wild');
      if (r.newWilds.length) {
        sawNew = true;
        expect(st.left).toBe(before + r.added);
      } else expect(st.left).toBe(before - 1 + r.added);
      for (const col of r.res.grid) expect(col.filter((x) => x === 'crown').length).toBeLessThanOrEqual(1);
    }
    expect(sawNew).toBe(true);
  });
});
