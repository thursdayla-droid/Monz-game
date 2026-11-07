import { describe, expect, it } from 'vitest';
import { CELL, FLOOR, generateFloor, type Floor } from './dungeon';
import { adventureReward, newAdventure, stepAdventure } from './sim';

/** マス(x,y)から 歩いて 行ける マスの 距離(BFS) */
function bfs(f: Floor, sx: number, sy: number): Int32Array {
  const d = new Int32Array(f.w * f.h).fill(-1);
  const q = [sy * f.w + sx];
  d[q[0]] = 0;
  while (q.length) {
    const i = q.shift()!;
    const x = i % f.w;
    const y = Math.floor(i / f.w);
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + ay) * f.w + x + ax;
      if (f.tiles[j] === FLOOR && d[j] < 0) {
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
  }
  return d;
}

describe('冒険の ダンジョン', () => {
  it('同じ 種なら 同じ 形・ちがう 種なら ちがう 形', () => {
    expect(generateFloor(5).tiles).toEqual(generateFloor(5).tiles);
    expect(generateFloor(5).tiles).not.toEqual(generateFloor(6).tiles);
  });
  it('どの 部屋にも はじまりから 歩いて 行ける', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = generateFloor(seed);
      expect(f.rooms.length).toBeGreaterThanOrEqual(5);
      const d = bfs(f, Math.floor(f.start.x / CELL), Math.floor(f.start.z / CELL));
      for (const r of f.rooms) expect(d[(r.y + 1) * f.w + r.x + 1]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('冒険の 動き', () => {
  const strong = { hp: 40, power: 40, tough: 30, speed: 20, tech: 20 };
  /** いちばん 近い モブへ(マスの 道を たどって)向かい、近ければ 攻撃する ボット */
  function play(seed: number, stats = strong, maxT = 400) {
    const s = newAdventure(seed, stats);
    const dt = 1 / 30;
    while (s.result === 'play' && s.t < maxT) {
      const p = s.player;
      const live = s.mobs.filter((m) => m.act !== 'dead');
      const goal = live.length ? live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] : s.floor.exit;
      const f = s.floor;
      const d = bfs(f, Math.floor(goal.x / CELL), Math.floor(goal.z / CELL));
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.z / CELL);
      let best = [goal.x - p.x, goal.z - p.z];
      let bd = d[cy * f.w + cx];
      if (bd > 1)
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const v = d[(cy + ay) * f.w + cx + ax];
          if (v >= 0 && v < bd) {
            bd = v;
            best = [(cx + ax + 0.5) * CELL - p.x, (cy + ay + 0.5) * CELL - p.z];
          }
        }
      const n = Math.hypot(best[0], best[1]) || 1;
      const near = live.length && Math.hypot(goal.x - p.x, goal.z - p.z) < 2.2;
      stepAdventure(s, { mx: near ? 0 : best[0] / n, mz: near ? 0 : best[1] / n, attack: !!near }, dt);
    }
    return s;
  }
  it('強い MONZ なら 全部 倒して クリアできる', () => {
    for (const seed of [1, 2, 3]) {
      const s = play(seed);
      expect(s.result).toBe('clear');
      expect(s.kills).toBe(s.mobs.length);
      expect(adventureReward(s).coins).toBe(s.kills * 3 + 20);
    }
  });
  it('弱い MONZ だと 負けることも ある(ボットは よけない)', () => {
    const weak = { hp: 2, power: 2, tough: 2, speed: 2, tech: 2 };
    const r = [1, 2, 3, 4].map((sd) => play(sd, weak).result);
    expect(r).toContain('lose');
  });
});
