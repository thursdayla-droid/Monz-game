import { describe, expect, it } from 'vitest';
import { CELL, FLOOR, generateFloor, type Floor } from './dungeon';
import { adventureReward, BAG_MAX, newAdventure, stepAdventure, unequip, useBagItem, useHerb } from './sim';

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


describe('冒険の 技・持ち物', () => {
  const st = { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 };
  it('技 A: 回る 技は まわりの モブを 打つ・回復の技は 回復', () => {
    const s = newAdventure(3, st, 1, [{ id: 'a', kind: 'spin', power: 14, cooldown: 3, element: '無', effect: 'なし', strength: '中' }, { id: 'h', kind: 'heal', power: 0, cooldown: 5, element: '自然', effect: 'なし', strength: '中' }]);
    const m = s.mobs[0];
    s.player.x = m.x - 1.2;
    s.player.z = m.z;
    const hp0 = m.hp;
    for (let i = 0; i < 20; i++) stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null }, 1 / 30);
    expect(m.hp).toBeLessThan(hp0);
    expect(s.techCd[0]).toBeGreaterThan(s.t);
    s.player.hp = 10;
    for (let i = 0; i < 20; i++) stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 1 : null }, 1 / 30);
    expect(s.player.hp).toBeGreaterThan(10);
  });
  it('持ち物は 20個まで・回復の実・装備の 付けかえ', () => {
    const s = newAdventure(3, st);
    for (let i = 0; i < 25; i++) s.drops.push({ id: 100 + i, x: s.player.x, z: s.player.z, item: { kind: 'herb' } });
    stepAdventure(s, { mx: 0, mz: 0, attack: false }, 1 / 30);
    expect(s.bag.length).toBe(BAG_MAX);
    expect(s.drops.length).toBe(5);
    s.player.hp = 5;
    expect(useHerb(s)).toBe(true);
    expect(s.player.hp).toBeGreaterThan(5);
    expect(s.bag.length).toBe(BAG_MAX - 1);
    const atk0 = s.player.atk;
    s.bag.push({ kind: 'gear', slot: 'head', rank: 'S' });
    expect(useBagItem(s, s.bag.length - 1)).toBe(true);
    expect(s.player.atk).toBe(atk0 + 16);
    expect(s.bag.length).toBe(BAG_MAX - 1);
    s.bag.push({ kind: 'gear', slot: 'head', rank: 'D' });
    useBagItem(s, s.bag.length - 1); // S と 入れかえ
    expect(s.player.atk).toBe(atk0 + 2);
    expect(s.bag[s.bag.length - 1]).toEqual({ kind: 'gear', slot: 'head', rank: 'S' });
    expect(unequip(s, 'head')).toBe(false); // いっぱい
  });
});

import { getTech, learnset } from '../battle3d/techTable';
import { SELF_KINDS, type AdvTech } from './sim';

describe('冒険の 技: 全部の 種族の 全部の 技が 動く', () => {
  const st = { hp: 20, power: 20, tough: 20, speed: 20, tech: 20 };
  const toAdv = (id: string): AdvTech => {
    const t = getTech(id);
    return { id, kind: t.kind, power: t.power ?? 0, cooldown: Math.max(2, t.cooldown), element: t.element, effect: t.effect ?? 'なし', strength: t.strength };
  };
  it('打つ 技は モブに 当たる・自分の 技は 自分に 効く', () => {
    for (const sp of ['bunk', 'mofu', 'zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz', 'crownie'])
      for (const row of learnset(sp)) {
        const tc = toAdv(row.name);
        const s = newAdventure(7, st, 1, [tc]);
        const m = s.mobs[0];
        s.player.x = m.x - 1.4;
        s.player.z = m.z;
        s.player.face = 0;
        s.player.hp = 50;
        const hp0 = s.mobs.reduce((a, x) => a + x.hp, 0);
        for (let i = 0; i < 90; i++) stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null }, 1 / 30);
        const hit = s.mobs.reduce((a, x) => a + x.hp, 0) < hp0;
        const st2 = s.mobs.some((x) => (x.atkDownUntil ?? 0) > 0 || (x.slowUntil ?? 0) > 0 || (x.stunUntil ?? 0) > 0 || (x.sleepUntil ?? 0) > 0 || (x.defDownUntil ?? 0) > 0);
        const self = s.shieldUntil > 0 || s.atkUpUntil > 0 || s.player.hp > 50;
        expect(hit || st2 || (SELF_KINDS.has(tc.kind) && self), `${sp} ${row.name} ${tc.kind}`).toBe(true);
      }
  });
  it('タフネス型は 技を 使うと 回復する', () => {
    const tc = toAdv('ポンポンショット');
    const a = newAdventure(7, st, 1, [tc], 'tough');
    const b = newAdventure(7, st, 1, [tc], 'power');
    for (const s of [a, b]) {
      s.player.hp = 30;
      for (let i = 0; i < 20; i++) stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null }, 1 / 30);
    }
    expect(a.player.hp).toBeGreaterThan(30);
    expect(b.player.hp).toBe(30);
  });
});

describe('技を ねらって うつ(長押し → はなすと 発動)', () => {
  it('techDir の 向きに うつ', () => {
    const s = newAdventure(7, { hp: 20, power: 20, tough: 20, speed: 20, tech: 20 }, 1, [{ id: 'b', kind: 'beam', power: 14, cooldown: 3, element: '光', effect: 'なし', strength: '強' }]);
    stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: 0, techDir: Math.PI / 2 }, 1 / 30);
    expect(s.player.face).toBeCloseTo(Math.PI / 2);
    expect(s.aimed).toBe(true);
  });
});

describe('技は 壁を 通りぬけない', () => {
  it('ビームは 壁で 止まる・壁の むこうの 敵には 当たらない', () => {
    const s = newAdventure(7, { hp: 20, power: 20, tough: 20, speed: 20, tech: 20 }, 1, [{ id: 'b', kind: 'beam', power: 14, cooldown: 3, element: '光', effect: 'なし', strength: '強' }]);
    const p = s.player;
    // 左の 壁に 向けて うつ。壁の むこう(同じ 線の 上)に 敵を 置く
    let wx = p.x;
    while (s.floor.tiles[Math.floor(p.z / 2) * s.floor.w + Math.floor(wx / 2)] === 1) wx -= 0.5;
    const m = s.mobs[0];
    m.x = wx - 1.5;
    m.z = p.z;
    const hp0 = m.hp;
    let len = 0;
    for (let i = 0; i < 20; i++) {
      stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null, techDir: Math.PI }, 1 / 30);
      for (const e of s.events) if (e.kind === 'tech') len = e.len;
    }
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThan(p.x - wx + 1);
    expect(m.hp).toBe(hp0);
  });
});
