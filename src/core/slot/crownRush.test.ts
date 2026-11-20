import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { bossSpin, fixRush, newRush, rollDie, rollHit, rushMove, RUSH_PATTERNS, type RushState } from './crownRush';

const play = (s: RushState, rng: () => number) => {
  while (s.phase === 'board') rushMove(s, rollDie(rng), rng);
  while (s.phase === 'boss') bossSpin(s, rollHit(rng), rng);
  return s;
};

describe('CROWN RUSH(2026-11-19 企画者)', () => {
  it('マスの 並びは 3パターン(A・B・C)から 1つ・15マス目は ボス', () => {
    const rng = mulberry32(1);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const r = newRush(rng, 10);
      expect(r.board).toHaveLength(15);
      expect(r.board[14]).toBe('boss');
      expect(r.board.slice(0, 14)).toEqual(RUSH_PATTERNS[r.pattern!]);
      seen.add(r.pattern!);
    }
    expect(seen.size).toBe(3);
    // C は トラップが ボスの 手前
    expect(RUSH_PATTERNS[2][13]).toBe('trap');
  });

  it('マスの 中身(BET 10): コイン 50〜100・宝箱 100〜200・ダイヤ 150・王冠 250', () => {
    const rng = mulberry32(9);
    for (const [sq, lo, hi] of [['coin', 50, 100], ['chest', 100, 200], ['diamond', 150, 150], ['crown', 250, 250]] as const) {
      for (let i = 0; i < 50; i++) {
        const s = newRush(rng, 10);
        s.board = [...Array(14).fill(sq), 'boss'];
        const st = rushMove(s, 1, rng);
        expect(st.coins).toBeGreaterThanOrEqual(lo);
        expect(st.coins).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('ミステリー: 5つの どれか・+1/−1 は 次の 目に 足す', () => {
    const rng = mulberry32(10);
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = newRush(rng, 10);
      s.board = [...Array(14).fill('coin'), 'boss'];
      s.board[4] = 'mystery';
      const st = rushMove(s, 5, rng);
      kinds.add(st.mystery!);
      if (st.mystery === 'plus' || st.mystery === 'minus') {
        const d = st.mystery === 'plus' ? 1 : -1;
        const n = rushMove(s, 3, rng);
        expect(n.move).toBe(3 + d);
        expect(n.to).toBe(5 + 3 + d);
      }
      if (st.mystery === 'back') expect(s.pos).toBeGreaterThanOrEqual(2);
      if (st.mystery === 'forward') expect(s.pos).toBeLessThanOrEqual(8);
      if (st.mystery === 'coin') expect(st.coins).toBeGreaterThanOrEqual(50);
    }
    expect(kinds.size).toBe(5);
  });

  it('ルーレットは ちょうど 3回・出た 目だけ 進む・トラップは もどって 効果なし', () => {
    const rng = mulberry32(2);
    const s = newRush(rng, 10);
    expect(s.spins).toBe(3);
    s.board = [...Array(14).fill('coin'), 'boss'];
    s.board[2] = 'trap';
    const st = rushMove(s, 3, rng);
    expect(st.square).toBe('trap');
    expect(st.back).toBeGreaterThanOrEqual(0);
    expect(st.back).toBeLessThanOrEqual(2);
    expect(s.pos).toBe(st.back);
    expect(s.spins).toBe(2);
    expect(s.total).toBe(0);
  });

  it('15マス目に 着くか こえたら ボス戦', () => {
    const rng = mulberry32(3);
    const s = newRush(rng, 10);
    s.pos = 12;
    const st = rushMove(s, 6, rng);
    expect(st.boss).toBe(true);
    expect(s.pos).toBe(15);
    expect(s.phase).toBe('boss');
    expect(s.boss).toEqual({ hp: 3, left: 5, hits: 0, misses: 0 });
  });

  it('ボス: 3 HIT で 撃破・3 MISS で 終わり・撃破は 約 50%', () => {
    const rng = mulberry32(4);
    let win = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const s = newRush(rng, 10);
      s.phase = 'boss';
      s.boss = { hp: 3, left: 5, hits: 0, misses: 0 };
      while (s.phase === 'boss') bossSpin(s, rollHit(rng), rng);
      if (s.defeated) {
        win++;
        expect(s.boss!.hits).toBe(3);
        expect(s.total).toBe(1000);
      } else expect(s.boss!.misses).toBe(3);
    }
    expect(Math.abs(win / N - 0.5)).toBeLessThan(0.01);
  });

  it('保存から もどせる', () => {
    const rng = mulberry32(5);
    const s = newRush(rng, 50);
    rushMove(s, 2, rng);
    const back = fixRush(JSON.parse(JSON.stringify(s)), [10, 50, 100]);
    expect(back).toEqual(s);
    expect(fixRush({ bet: 7 }, [10, 50, 100])).toBeUndefined();
  });

  it('平均の 報酬(BET の 倍): 目安', () => {
    const rng = mulberry32(6);
    let sum = 0;
    let boss = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const s = play(newRush(rng, 100), rng);
      sum += s.total / 100;
      if (s.boss) boss++;
    }
    console.log(`CROWN RUSH 平均 BET×${(sum / N).toFixed(1)}・ボス戦まで ${((boss / N) * 100).toFixed(1)}%`);
    expect(sum / N).toBeGreaterThan(5);
  });
});
