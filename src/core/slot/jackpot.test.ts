import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { chainCounts, jackpotGrid, jackpotOver, jackpotWin, newJackpot, nextJackpot, payNowWithJackpot, playRound, RAINBOW_NEXT, drawCont, PREMIUM_REACH, PREMIUM_RATE, CONT_REACHES, goldContRate, finalGrid } from './jackpot';
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

  it('レインボー7 の あとは かならず 次(ゴールド 2:レインボー 1)', () => {
    const rng = mulberry32(5);
    const gold = newJackpot(10, { symbol: 'gold7', length: 3, raw: 1000 });
    // rng なし = 継続しない
    expect(nextJackpot(gold, rng)).toBeUndefined();
    let rainbows = 0;
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const s = newJackpot(10, { symbol: 'rainbow7', length: 3, raw: 1000 }, 1, 0, rng);
      while (!jackpotOver(s)) playRound(s);
      const n = nextJackpot(s, rng)!;
      expect(n.chain).toBe(2);
      expect(n.chainTotal).toBe(1000);
      expect(n.total).toBe(10 * payOf(n.symbol, 3));
      if (n.symbol === 'rainbow7') rainbows++;
    }
    expect(Math.abs(rainbows / N - RAINBOW_NEXT)).toBeLessThan(0.01);
  });

  it('さいごの リーチ: キャラは 6人 均等・アライグマ 1/30・ゴールド7 は 約半分 継続・レインボー7 は かならず', () => {
    const rng = mulberry32(11);
    const N = 60000;
    const count: Record<string, number> = {};
    let cont = 0;
    for (let i = 0; i < N; i++) {
      const c = drawCont(rng, 'gold7');
      count[c.reach] = (count[c.reach] ?? 0) + 1;
      if (c.cont) cont++;
      if (c.reach === PREMIUM_REACH) expect(c.cont).toBe(true);
      expect(drawCont(rng, 'rainbow7').cont).toBe(true);
    }
    expect(Math.abs(count[PREMIUM_REACH] / N - PREMIUM_RATE)).toBeLessThan(0.004);
    // キョンK は キャバ嬢と 遅刻で 半分ずつ(キャラは 均等)
    count.kyon += count.chikoku ?? 0;
    expect(Math.abs((count.chikoku ?? 0) / N - (1 - PREMIUM_RATE) / (CONT_REACHES.length * 2))).toBeLessThan(0.006);
    for (const id of CONT_REACHES) expect(Math.abs(count[id] / N - (1 - PREMIUM_RATE) / CONT_REACHES.length)).toBeLessThan(0.008);
    expect(Math.abs(cont / N - goldContRate())).toBeLessThan(0.01);
    // 継続しない 時は 次なし・継続なら そろった 7の 大当たり
    const s = newJackpot(10, { symbol: 'gold7', length: 3, raw: 1000 }, 1, 0, rng);
    while (!jackpotOver(s)) playRound(s);
    const n = nextJackpot(s, rng);
    if (s.cont) expect(n?.symbol).toBe(s.contSym);
    else expect(n).toBeUndefined();
  });

  it('さいごの 回の 図柄: リーチ → 当たりは 5つ・ハズレは 2つ', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const w = finalGrid(rng, 'rainbow7', true);
      expect(w.every((c) => c[1] === 'rainbow7')).toBe(true);
      const l = finalGrid(rng, 'gold7', false);
      expect(l.map((c) => c[1] === 'gold7')).toEqual([true, true, false, false, false]);
      expect(evaluate(l, 10).wins.some((x) => x.symbol === 'gold7')).toBe(false);
    }
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
    // ゴールド7 は 平均 約2.6回・レインボー7 は 平均 約4.1回
    expect(chainCounts().gold).toBeCloseTo(2.6, 1);
    expect(chainCounts().rainbow).toBeCloseTo(4.1, 1);
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
