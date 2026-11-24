import { describe, expect, it } from 'vitest';
import { CELL, DOOR, FLOOR, generateFloor, type Floor } from './dungeon';
import { adventureReward, BAG_MAX, newAdventure, stepAdventure, unequip, useBagItem, useHerb, type AdvState } from './sim';

/** マス(x,y)から 歩いて 行ける マスの 距離(BFS)。doors = しまった 扉も 通れる ことに する */
function bfs(f: Floor, sx: number, sy: number, doors = false): Int32Array {
  const d = new Int32Array(f.w * f.h).fill(-1);
  const q = [sy * f.w + sx];
  d[q[0]] = 0;
  while (q.length) {
    const i = q.shift()!;
    const x = i % f.w;
    const y = Math.floor(i / f.w);
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + ay) * f.w + x + ax;
      if ((f.tiles[j] === FLOOR || (doors && f.tiles[j] === DOOR)) && d[j] < 0) {
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
  it('部屋は 一本道・扉を 通れば どの 部屋にも 行ける・扉 i を 通らないと 部屋 i+1 へ 行けない', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = generateFloor(seed);
      expect(f.rooms.length).toBe(7);
      expect(f.doors.length).toBe(6);
      const sx = Math.floor(f.start.x / CELL);
      const sy = Math.floor(f.start.z / CELL);
      const d = bfs(f, sx, sy, true);
      for (const r of f.rooms) expect(d[(r.y + 1) * f.w + r.x + 1]).toBeGreaterThanOrEqual(0);
      // 扉を 1つ しめると、その 先の 部屋へは 行けない
      for (let i = 0; i < f.doors.length; i++) {
        const g = { ...f, tiles: new Uint8Array(f.tiles) };
        for (const c of f.doors[i].cells) g.tiles[c] = DOOR;
        const e = bfs(g, sx, sy);
        const next = f.rooms[i + 1];
        expect(e[(next.y + 1) * f.w + next.x + 1]).toBe(-1);
        const here = f.rooms[i];
        expect(e[(here.y + 1) * f.w + here.x + 1]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('冒険の 動き', () => {
  const strong = { hp: 40, power: 40, tough: 30, speed: 20, tech: 20 };
  /** しかけを 解きながら 進む ボット: 今の 部屋の しかけ(敵・スイッチ・箱・鍵)→ 扉 → 次の 部屋 → ワープ */
  function goalOf(s: AdvState): { x: number; z: number; fight: boolean } {
    const p = s.player;
    const i = s.puzzles.findIndex((z) => !z.solved);
    const live = s.mobs.filter((m, k) => m.act !== 'dead' && (s.mobRoom[k] === i || Math.hypot(m.x - p.x, m.z - p.z) < 3));
    if (live.length && (s.puzzles[i]?.kind === 'kill' || live.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 3))) {
      const m = live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      return { x: m.x, z: m.z, fight: true };
    }
    if (i < 0) return { ...s.floor.exit, fight: false };
    const z = s.puzzles[i];
    if (z.kind === 'switch') return { ...z.plate!, fight: false };
    if (z.kind === 'key') return z.key!.taken ? { x: s.floor.doors[i].x, z: s.floor.doors[i].z, fight: false } : { ...z.key!, fight: false };
    if (z.kind === 'box') {
      const b = z.box!;
      const dir = Math.sign(z.plate!.x - b.x) || 1;
      const behind = { x: b.x - dir * 2.0, z: b.z };
      // 箱の うしろに まわって から 押す
      if (Math.abs(p.z - b.z) < 0.35 && Math.sign(b.x - p.x) === dir) return { x: z.plate!.x + dir * 3, z: b.z, fight: false };
      return { ...behind, fight: false };
    }
    return { ...s.floor.exit, fight: false };
  }
  function play(seed: number, stats = strong, maxT = 600) {
    const s = newAdventure(seed, stats);
    const dt = 1 / 30;
    while (s.result === 'play' && s.t < maxT) {
      const p = s.player;
      const goal = goalOf(s);
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
      const near = goal.fight && Math.hypot(goal.x - p.x, goal.z - p.z) < 2.2;
      stepAdventure(s, { mx: near ? 0 : best[0] / n, mz: near ? 0 : best[1] / n, attack: near }, dt);
    }
    return s;
  }
  it('しかけ: はじまりの 部屋は ひらいている・敵 / スイッチ / 箱 / 鍵 が 1つずつは ある・扉は しまっている', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = newAdventure(seed, strong);
      expect(s.puzzles[0].kind).toBe('none');
      for (const k of ['kill', 'switch', 'box', 'key']) expect(s.puzzles.some((z) => z.kind === k)).toBe(true);
      s.puzzles.forEach((z, i) => expect(s.floor.tiles[s.floor.doors[i].cells[0]]).toBe(z.solved ? FLOOR : DOOR));
    }
  });
  it('強い MONZ なら しかけを 解いて ワープで クリアできる', () => {
    for (const seed of [1, 2, 3]) {
      const s = play(seed);
      expect(s.result).toBe('clear');
      expect(s.puzzles.every((z) => z.solved)).toBe(true);
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

describe('ねらった 向きは スティックで 変わらない', () => {
  it('スティックを 右に 入れたまま 上へ ねらって うつ → 上へ', () => {
    const s = newAdventure(7, { hp: 20, power: 20, tough: 20, speed: 20, tech: 20 }, 1, [{ id: 'b', kind: 'beam', power: 14, cooldown: 3, element: '光', effect: 'なし', strength: '強' }]);
    let dir = 0;
    for (let i = 0; i < 20; i++) {
      stepAdventure(s, { mx: 1, mz: 0, attack: false, tech: i === 0 ? 0 : null, techDir: i === 0 ? -Math.PI / 2 : null }, 1 / 30);
      for (const e of s.events) if (e.kind === 'tech') dir = e.dir;
    }
    expect(dir).toBeCloseTo(-Math.PI / 2);
  });
});
