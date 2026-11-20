import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { bossSpin, fixRush, makeBoard, newRush, rollDie, rollHit, rushMove, RUSH_SQUARES, type RushState } from './crownRush';

const play = (s: RushState, rng: () => number) => {
  while (s.phase === 'board') rushMove(s, rollDie(rng), rng);
  while (s.phase === 'boss') bossSpin(s, rollHit(rng), rng);
  return s;
};

describe('CROWN RUSH(2026-11-19 企画者)', () => {
  it('15マス: 1〜14 に 決まった 数・15マス目は ボス・毎回 ちがう(2026-11-20)', () => {
    const rng = mulberry32(1);
    const b = makeBoard(rng);
    expect(b).toHaveLength(15);
    expect(b[14]).toBe('boss');
    expect(b).not.toContain('extra');
    for (const [k, n] of Object.entries(RUSH_SQUARES)) expect(b.filter((x) => x === k)).toHaveLength(n);
    expect(makeBoard(rng).join()).not.toBe(b.join());
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
