import { describe, expect, it } from 'vitest';
import { cpuReact, cpuTurn, makeCpu, type Level } from './ai';
import { newGame, nextRound } from './game';
import { resolveReactions } from './round';

/** 席0 を level、ほかを other の 強さに して 半荘を n 回。席0 の 平均順位・アガリ率・放銃率 */
function league(level: Level, other: Level, n: number) {
  let rankSum = 0;
  let rounds = 0;
  let wins = 0;
  let dealIns = 0;
  for (let seed = 1; seed <= n; seed++) {
    const cpus = [makeCpu(level, seed * 11), makeCpu(other, seed * 13), makeCpu(other, seed * 17), makeCpu(other, seed * 19)];
    const g = newGame(seed * 101);
    while (!g.over) {
      const s = g.round;
      for (let guard = 0; guard < 3000 && s.phase !== 'end'; guard++) {
        if (s.phase === 'turn') cpuTurn(s, cpus[s.turn]);
        else resolveReactions(s, [0, 1, 2, 3].map((i) => cpuReact(s, i, cpus[i])));
      }
      expect(s.phase).toBe('end');
      const r = s.result!;
      rounds++;
      if (r.kind === 'win') {
        if (r.wins.some((w) => w.seat === 0)) wins++;
        if (r.wins.some((w) => w.from === 0)) dealIns++;
      }
      nextRound(g);
    }
    const order = [0, 1, 2, 3].sort((a, b) => g.points[b] - g.points[a]);
    rankSum += order.indexOf(0) + 1;
  }
  return { rank: rankSum / n, win: wins / rounds, dealIn: dealIns / rounds };
}

describe('CPU の 強さ', () => {
  it('強い CPU ほど 弱い 相手に 勝つ(平均順位が よい)', () => {
    const weak = league(1, 1, 30);
    const strong = league(5, 1, 30);
    // 結果を 出しておく(調整用)
    (globalThis as unknown as { process: { stdout: { write: (x: string) => void } } }).process.stdout.write(`AI ${JSON.stringify({ weak, strong })}\n`);
    expect(strong.rank).toBeLessThan(weak.rank);
    expect(strong.dealIn).toBeLessThan(weak.dealIn + 0.02);
  }, 300000);
});
