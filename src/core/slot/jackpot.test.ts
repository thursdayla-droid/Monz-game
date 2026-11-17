import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { JACKPOT_ROUNDS, jackpotGrid, jackpotOver, jackpotWin, newJackpot, nextJackpot, payNowWithJackpot, playRound, rainbowChainValue, RAINBOW_NEXT } from './jackpot';
import { evaluate, payOf, type Grid } from './slot';

const g = (rows: string[][]): Grid => [0, 1, 2, 3, 4].map((r) => rows.map((row) => row[r])) as Grid;

describe('7の 大当たり', () => {
  it('20回で 合計が 今の 配当と ぴったり 同じ', () => {
    for (const total of [1000, 1503, 20000, 37]) {
      const s = newJackpot(10, { symbol: 'gold7', length: 3, raw: total });
      let sum = 0;
      let n = 0;
      while (!jackpotOver(s)) {
        sum += playRound(s);
        n++;
      }
      expect(n).toBe(JACKPOT_ROUNDS);
      expect(sum).toBe(Math.max(JACKPOT_ROUNDS, total));
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
      const s = newJackpot(10, { symbol: 'rainbow7', length: 3, raw: 2000 });
      while (!jackpotOver(s)) playRound(s);
      const n = nextJackpot(s, rng)!;
      expect(n.chain).toBe(2);
      expect(n.chainTotal).toBe(2000);
      expect(n.total).toBe(10 * payOf(n.symbol, 3));
      if (n.symbol === 'rainbow7') rainbows++;
    }
    expect(Math.abs(rainbows / N - RAINBOW_NEXT)).toBeLessThan(0.01);
    // レインボー7 3つ 1回の 平均は BET の 400倍くらい(200倍 + 次の 大当たり 平均 1.5回)
    expect(rainbowChainValue()).toBeCloseTo(200 + 1.5 * (200 / 3 + 200 / 3), 0);
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
  });
});
