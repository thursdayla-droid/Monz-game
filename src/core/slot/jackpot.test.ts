import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { chainCounts, jackpotGrid, jackpotOver, jackpotWin, newJackpot, nextJackpot, payNowWithJackpot, playRound, rainbowChainValue, RAINBOW_NEXT, STOCK_RATE } from './jackpot';
import { evaluate, payOf, type Grid } from './slot';

const g = (rows: string[][]): Grid => [0, 1, 2, 3, 4].map((r) => rows.map((row) => row[r])) as Grid;

describe('7の 大当たり', () => {
  it('3つ 20回・4つ 25回・5つ 30回で 合計が 今の 配当と ぴったり 同じ', () => {
    for (const [length, total] of [[3, 1000], [3, 1503], [4, 20000], [5, 37], [5, 5000]] as const) {
      const s = newJackpot(10, { symbol: 'gold7', length, raw: total });
      let sum = 0;
      let n = 0;
      while (!jackpotOver(s)) {
        sum += playRound(s);
        n++;
      }
      expect(n).toBe({ 3: 20, 4: 25, 5: 30 }[length]);
      expect(sum).toBe(Math.max(n, total));
      expect(playRound(s)).toBe(0);
    }
  });

  it('7の 当たりは 分けて もらう・ほかの 当たりは すぐ', () => {
    const res = evaluate(
      g([
        ['gold7', 'gold7', 'gold7', 'star', 'star'],
        ['cherry', 'cherry', 'cherry', 'bell', 'bell'],
        ['clover', 'diamond', 'star', 'clover', 'diamond'],
      ]),
      10,
    );
    const w = jackpotWin(res)!;
    expect(w.symbol).toBe('gold7');
    expect(Math.round(w.raw)).toBe(1000);
    const cherry = res.wins.find((x) => x.symbol === 'cherry')!;
    expect(payNowWithJackpot(res, w)).toBe(Math.round(cherry.raw));
    expect(payNowWithJackpot(res, undefined)).toBe(res.win);
  });

  it('レインボー7 を 先に えらぶ', () => {
    const res = evaluate(
      g([
        ['gold7', 'gold7', 'gold7', 'star', 'star'],
        ['rainbow7', 'rainbow7', 'rainbow7', 'bell', 'bell'],
        ['clover', 'diamond', 'star', 'clover', 'diamond'],
      ]),
      10,
    );
    expect(jackpotWin(res)?.symbol).toBe('rainbow7');
  });

  it('レインボー7 の あとは かならず 次・ゴールド7 の あとは おわり', () => {
    const rng = mulberry32(5);
    const gold = newJackpot(10, { symbol: 'gold7', length: 3, raw: 1000 });
    expect(nextJackpot(gold, rng)).toBeUndefined();
    let rainbows = 0;
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const s = newJackpot(10, { symbol: 'rainbow7', length: 3, raw: 1000 });
      while (!jackpotOver(s)) playRound(s);
      const n = nextJackpot(s, rng)!;
      expect(n.chain).toBe(2);
      expect(n.chainTotal).toBe(1000);
      expect(n.total).toBe(10 * payOf(n.symbol, 3));
      if (n.symbol === 'rainbow7') rainbows++;
    }
    expect(Math.abs(rainbows / N - RAINBOW_NEXT)).toBeLessThan(0.01);
  });

  it('上乗せ: 大当たり 1回ごとに 約半分・たまった ぶんは あとで 順番に', () => {
    const rng = mulberry32(11);
    let adds = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const s = newJackpot(10, { symbol: 'gold7', length: 3, raw: 1000 }, 1, 0, rng);
      if (s.addAt >= 0) {
        adds++;
        expect(s.addAt).toBeGreaterThanOrEqual(1);
        expect(s.addAt).toBeLessThanOrEqual(s.rounds - 3);
      }
      while (!jackpotOver(s)) playRound(s);
      expect(s.stock.length).toBe(s.addAt >= 0 ? 1 : 0);
      const n = nextJackpot(s, rng);
      if (s.addAt >= 0) {
        expect(n?.fromStock).toBe(true);
        expect(n?.symbol).toBe(s.addSym);
      } else expect(n).toBeUndefined();
    }
    expect(Math.abs(adds / N - STOCK_RATE)).toBeLessThan(0.015);
  });

  it('続く 大当たりの 平均の 回数(ためしに 回した 結果と 計算が 合う)', () => {
    const rng = mulberry32(21);
    const c = chainCounts();
    for (const sym of ['gold7', 'rainbow7'] as const) {
      let total = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) {
        let s: ReturnType<typeof newJackpot> | undefined = newJackpot(10, { symbol: sym, length: 3, raw: 1000 }, 1, 0, rng);
        let n = 0;
        while (s && n < 10000) {
          n++;
          while (!jackpotOver(s)) playRound(s);
          s = nextJackpot(s, rng);
        }
        total += n;
      }
      const want = sym === 'gold7' ? c.gold : c.rainbow;
      expect(Math.abs(total / N - want) / want).toBeLessThan(0.06);
    }
    // 上乗せ 50%: ゴールド7 は 平均 4回・レインボー7 は 平均 10回
    expect(chainCounts(0.5).gold).toBeCloseTo(4, 6);
    expect(chainCounts(0.5).rainbow).toBeCloseTo(10, 6);
    expect(rainbowChainValue()).toBeCloseTo(1000, 0);
  });

  it('大当たり中の 図柄は まん中が 5つ そろう(7・王冠は 出ない)', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const { grid, symbol } = jackpotGrid(rng);
      for (const col of grid) {
        expect(col[1]).toBe(symbol);
        for (const x of col) expect(['gold7', 'rainbow7', 'crown', 'wild']).not.toContain(x);
      }
    }
    // 上乗せの 回は 7が そろう
    const { grid } = jackpotGrid(rng, 'rainbow7');
    for (const col of grid) expect(col[1]).toBe('rainbow7');
  });
});
