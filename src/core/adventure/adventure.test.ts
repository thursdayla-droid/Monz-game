import { describe, expect, it } from 'vitest';
import { CELL, DOOR, FLOOR, generateFloor, type Floor } from './dungeon';
import { isGachaWeapon, RPG_LEARN, rpgLearned, WEAPON_LIST } from '../rpg/roles';
import { ADV, adventureReward, quickOf, setQuick, useQuick, USE_ITEMS, bagCap, discardBagItem, nextBagCap, dropAt, equipStartWeapon, rollGearRank, ALLEY_MOBS, ALLEY_TOP, BAG_MAX, BOSS_AT, FLOOR_MOBS, isBoss, MOB_KINDS, newAdventure, type MobKind, stepAdventure, unequip, useBagItem, useHerb, type AdvState } from './sim';

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
  it('置き物は 部屋の ふちだけ・部屋の 内がわと 通路は ぜんぶ 歩いて 行ける', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = generateFloor(seed);
      expect(f.props.length).toBeGreaterThan(5);
      const d = bfs(f, Math.floor(f.start.x / CELL), Math.floor(f.start.z / CELL), true);
      for (const p of f.props) {
        const r = [...f.rooms, ...f.sides.map((x) => x.room)].find((r) => p.cx >= r.x && p.cx < r.x + r.w && p.cy >= r.y && p.cy < r.y + r.h)!;
        expect(r).toBeTruthy();
        expect(p.cx === r.x || p.cx === r.x + r.w - 1 || p.cy === r.y).toBe(true);
      }
      for (const r of f.rooms) for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) expect(d[y * f.w + x]).toBeGreaterThanOrEqual(0);
      for (const dr of f.doors) for (const c of dr.cells) expect(d[c]).toBeGreaterThanOrEqual(0);
    }
  });
  it('わき道の 部屋: 階が 進むと ふえる・どれも 歩いて 行ける・行き止まり(扉を しめると 先へ 行けない まま)・広い 部屋と モンスター部屋が 出る', () => {
    let big = 0;
    let house = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const f1 = generateFloor(seed, { level: 1 });
      const f9 = generateFloor(seed, { level: 9 });
      expect(f1.sides.length).toBeGreaterThanOrEqual(1);
      expect(f9.sides.length).toBeGreaterThanOrEqual(f1.sides.length);
      expect(f1.sides.some((x) => x.house)).toBe(false);
      for (const f of [f1, f9]) {
        const sx = Math.floor(f.start.x / CELL);
        const sy = Math.floor(f.start.z / CELL);
        const d = bfs(f, sx, sy, true);
        for (const sd of f.sides) expect(d[(sd.room.y + 1) * f.w + sd.room.x + 1]).toBeGreaterThanOrEqual(0);
        // 一本道の 扉を しめると、その 先の 部屋へは 行けない(わき道で 回りこめない)
        for (let i = 0; i < f.doors.length; i++) {
          for (const c of f.doors[i].cells) f.tiles[c] = DOOR;
          const d2 = bfs(f, sx, sy);
          const r = f.rooms[i + 1];
          expect(d2[(r.y + 1) * f.w + r.x + 1]).toBe(-1);
          for (const c of f.doors[i].cells) f.tiles[c] = FLOOR;
        }
      }
      big += f9.sides.filter((x) => x.big).length;
      house += f9.sides.filter((x) => x.house).length;
    }
    expect(big).toBeGreaterThan(20);
    expect(house).toBeGreaterThan(15);
  });
  it('モンスター部屋: 入って 10秒で とじて 敵が いっぱい・全部 倒すと ひらく', () => {
    let s: AdvState | null = null;
    for (let seed = 1; seed < 60 && !s; seed++) {
      const t = newAdventure(seed, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 8);
      if (t.house) s = t;
    }
    const st = s!;
    const sd = st.floor.sides.find((x) => x.house)!;
    st.player.x = (sd.room.x + sd.room.w / 2) * CELL;
    st.player.z = (sd.room.y + sd.room.h / 2) * CELL;
    st.player.hp = st.player.maxHp = 1e9;
    const n0 = st.mobs.length;
    for (let i = 0; i < 11 * 30; i++) stepAdventure(st, { mx: 0, mz: 0, attack: false, tech: null, techDir: null }, 1 / 30);
    expect(st.house!.state).toBe('locked');
    expect(st.mobs.length - n0).toBeGreaterThanOrEqual(8);
    for (const c of sd.door) expect(st.floor.tiles[c]).toBe(DOOR);
    for (const m of st.mobs) m.hp = 0, (m.act = 'dead');
    stepAdventure(st, { mx: 0, mz: 0, attack: false, tech: null, techDir: null }, 1 / 30);
    expect(st.house!.state).toBe('done');
    for (const c of sd.door) expect(st.floor.tiles[c]).toBe(FLOOR);
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
  it('擬人化: BUNK(拳闘士)の 技を 出しても こわれない・体当たりで 敵が 飛ぶ・アッパーで 動けなく なる', () => {
    for (const [n] of RPG_LEARN.bunk) {
      const t = getTech(n);
      const s = newAdventure(5, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 3, [{ id: n, kind: t.kind, power: t.power, cooldown: 2, element: t.element, effect: t.effect, strength: t.strength }]);
      const m = s.mobs[0];
      m.x = s.player.x + 1.4;
      m.z = s.player.z;
      m.awake = true;
      s.player.face = 0;
      let stunned = false;
      for (let i = 0; i < 60; i++) {
        stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null, techDir: null }, 1 / 30);
        if ((m.stunUntil ?? 0) > s.t) stunned = true;
      }
      if (n === 'アッパーカット' && m.act !== 'dead') expect(stunned).toBe(true);
    }
  });
  it('擬人化: 剛力クラッシュは ためるほど 強い・ためきると 衝撃波・ジャブジャブは 気弾が 飛ぶ', () => {
    const run = (hold: number) => {
      const t = getTech('剛力クラッシュ');
      const s = newAdventure(5, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 3, [{ id: '剛力クラッシュ', kind: t.kind, power: t.power, cooldown: 2, element: t.element, effect: 'なし', strength: t.strength }]);
      const m = s.mobs[0];
      m.x = s.player.x + 1.4;
      m.z = s.player.z;
      m.maxHp = m.hp = 1e6;
      m.tough = 0;
      s.player.face = 0;
      let big = false;
      for (let i = 0; i < 20; i++) {
        stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null, techDir: null, techHold: hold }, 1 / 30);
        if (s.shots.some((x) => x.art === 'fistbig')) big = true;
      }
      return { dmg: 1e6 - m.hp, big };
    };
    const a = run(0);
    const b = run(2);
    expect(b.dmg).toBeGreaterThan(a.dmg * 1.8);
    expect(a.big).toBe(false);
    expect(b.big).toBe(true);
    const t = getTech('ジャブジャブ');
    const s = newAdventure(5, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 3, [{ id: 'ジャブジャブ', kind: t.kind, power: t.power, cooldown: 2, element: t.element, effect: 'なし', strength: t.strength }]);
    let fist = 0;
    for (let i = 0; i < 10; i++) {
      stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null, techDir: null }, 1 / 30);
      fist = Math.max(fist, s.shots.filter((x) => x.art === 'fist').length);
    }
    expect(fist).toBe(2);
  });
  it('擬人化: 拳闘士の 技コンボ(当てた あと すぐ 次の 技へ・数が ふえる)', () => {
    const mk = (n: string) => {
      const t = getTech(n);
      return { id: n, kind: t.kind, power: t.power, cooldown: 2, element: t.element, effect: t.effect, strength: t.strength };
    };
    const s = newAdventure(5, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 3, [mk('アッパーカット'), mk('剛力クラッシュ'), mk('ジャブジャブ')]);
    s.brawler = true;
    const m = s.mobs[0];
    m.x = s.player.x + 1.4;
    m.z = s.player.z;
    m.maxHp = m.hp = 1e6;
    s.player.face = 0;
    let best = 0;
    for (let i = 0; i < 45; i++) {
      const tech = i === 0 ? 0 : i === 12 ? 1 : i === 34 ? 2 : null;
      stepAdventure(s, { mx: 0, mz: 0, attack: false, tech, techDir: null }, 1 / 30);
      for (const e of s.events) if (e.kind === 'tcombo') best = Math.max(best, e.n);
    }
    expect(best).toBeGreaterThanOrEqual(2);
  });
  it('擬人化: ZIPP(剣士)の 技は 12こ・どれも 使える・剣士だけの 動き方を 出しても こわれない', () => {
    expect(RPG_LEARN.zipp.length).toBe(12);
    for (const [n] of RPG_LEARN.zipp) {
      const t = getTech(n);
      const s = newAdventure(5, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 3, [{ id: n, kind: t.kind, power: t.power, cooldown: 2, element: t.element, effect: t.effect, strength: t.strength }]);
      const m = s.mobs[0];
      m.x = s.player.x + 1.5;
      m.z = s.player.z;
      s.player.face = 0;
      for (let i = 0; i < 60; i++) stepAdventure(s, { mx: 0, mz: 0, attack: false, tech: i === 0 ? 0 : null, techDir: null }, 1 / 30);
      expect(s.events).toBeDefined();
    }
  });
  it('擬人化RPG: BUNK(拳闘士)の 技は 11こ・どれも 使える・レベルで ふえる', () => {
    expect(RPG_LEARN.bunk.length).toBe(11);
    for (const [n] of RPG_LEARN.bunk) expect(getTech(n).name).toBe(n);
    expect(rpgLearned('bunk', 1)).toEqual(['ジャブジャブ', 'バンクバッシュ']);
    expect(rpgLearned('bunk', 99).length).toBe(11);
  });
  it('置き物は ぜんぶ こわせる(2026-11-28)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = newAdventure(seed, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 });
      expect(s.crates.length).toBe(s.floor.props.length);
      for (const c of s.crates) expect(c.hp).toBe(ADV.breakable[s.floor.props[c.prop].kind]);
    }
  });
  /** 置き物の となりに 立って たたき続ける。こわれたら true */
  const smash = (power: number, need: number) => {
    let s: AdvState | null = null;
    for (let seed = 1; seed < 50 && !s; seed++) {
      const t = newAdventure(seed, { hp: 10, power, tough: 10, speed: 10, tech: 10 });
      if (t.crates.length) s = t;
    }
    const st = s!;
    st.mobs.length = 0;
    st.mobRoom.length = 0;
    const c = st.crates[0];
    c.hp = need;
    const f = st.floor;
    expect(f.tiles[c.cy * f.w + c.cx]).toBe(3);
    const inR = f.rooms.find((r) => c.cx >= r.x && c.cx < r.x + r.w && c.cy >= r.y && c.cy < r.y + r.h)!;
    const nx = c.cx === inR.x ? c.cx + 1 : c.cx === inR.x + inR.w - 1 ? c.cx - 1 : c.cx;
    const ny = nx === c.cx ? c.cy + 1 : c.cy;
    st.player.x = (nx + 0.5) * CELL;
    st.player.z = (ny + 0.5) * CELL;
    let broke = false;
    let shook = false;
    for (let i = 0; i < 200 && !broke; i++) {
      st.player.face = Math.atan2((c.cy + 0.5) * CELL - st.player.z, (c.cx + 0.5) * CELL - st.player.x);
      stepAdventure(st, { mx: 0, mz: 0, attack: true, tech: null, techDir: null }, 1 / 30);
      if (st.events.some((e) => e.kind === 'crate' && e.broken)) broke = true;
      if (st.events.some((e) => e.kind === 'crate' && !e.broken)) shook = true;
    }
    return { broke, shook, open: f.tiles[c.cy * f.w + c.cx] === FLOOR };
  };
  it('一撃の ダメージが 足りれば こわれて 通れる', () => {
    const r = smash(40, ADV.breakable.crate);
    expect(r.broke).toBe(true);
    expect(r.open).toBe(true);
  });
  it('一撃の ダメージが 足りないと ゆれる だけ', () => {
    const r = smash(10, ADV.breakable.dumpster);
    expect(r.broke).toBe(false);
    expect(r.shook).toBe(true);
    expect(r.open).toBe(false);
  });
  it('武器: 10階 までは 下位の 2つ だけ・11階から ぜんぶ(剣士)', () => {
    const names = (floor: number) => {
      const s = newAdventure(3, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, floor);
      equipStartWeapon(s, WEAPON_LIST.剣士[0], WEAPON_LIST.剣士);
      const got = new Set<string>();
      for (let i = 0; i < 3000; i++) dropAt(s, 0, 0, 1, 0);
      for (const d of s.drops) if (d.item.kind === 'gear' && d.item.slot === 'weapon') got.add(d.item.name!);
      return [...got].sort();
    };
    expect(names(10)).toEqual(['ストリートソード', '鉄骨ブレード'].sort());
    expect(names(11).length).toBe(5);
  });
  it('武器の 打ち方: ボクサーラップは 4段・ムーンエッジは さいごに 一回転', () => {
    const run = (role: '拳闘士' | '剣士', name: string) => {
      const s = newAdventure(5, { hp: 40, power: 20, tough: 20, speed: 10, tech: 10 }, 1, [], null, role === '剣士' ? 'zipp' : 'bunk');
      equipStartWeapon(s, WEAPON_LIST[role][0], WEAPON_LIST[role]);
      s.gear.weapon!.name = name;
      s.jab = 'punch';
      s.mobs.length = 0;
      s.mobRoom.length = 0;
      const chains: number[] = [];
      const fx: string[] = [];
      for (let i = 0; i < 240; i++) {
        stepAdventure(s, { mx: 0, mz: 0, attack: true, tech: null, techDir: null }, 1 / 60);
        for (const e of s.events) {
          if (e.kind === 'attack') chains.push(s.chain);
          if (e.kind === 'mobFx') fx.push(e.style);
        }
      }
      return { max: Math.max(...chains), fx };
    };
    expect(run('拳闘士', 'ボクサーラップ').max).toBe(4);
    expect(run('拳闘士', 'レザーグローブ').max).toBe(3);
    expect(run('剣士', 'ムーンエッジ').fx).toContain('wspin');
    // ネオンレイピアの 3段めは 突き 3発
    expect(run('剣士', 'ネオンレイピア').fx.filter((f) => f === 'wpierce').length).toBeGreaterThanOrEqual(3);
  });
  it('持ち物の 枠: ふだん 20・10ずつ 増えて 100 まで', () => {
    const s = newAdventure(3, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 });
    expect(bagCap(s)).toBe(20);
    let n = 20;
    for (let i = 0; i < 20; i++) n = nextBagCap(n);
    expect(n).toBe(100);
    expect(nextBagCap(20)).toBe(30);
    s.bagMax = 30;
    expect(bagCap(s)).toBe(30);
    s.bagMax = 500;
    expect(bagCap(s)).toBe(100);
  });
  it('持ち物を すてられる', () => {
    const s = newAdventure(3, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 });
    s.bag.push({ kind: 'herb' }, { kind: 'gear', slot: 'head', rank: 'S' });
    expect(discardBagItem(s, 0)).toBe(true);
    expect(s.bag).toEqual([{ kind: 'gear', slot: 'head', rank: 'S' }]);
    expect(discardBagItem(s, 5)).toBe(false);
  });
  it('すぐ 使う 枠 2つ: セット・入れかえ・使う(ポーション・救急箱は 木の実より 多く 回復)', () => {
    const s = newAdventure(3, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 });
    expect(quickOf(s)).toEqual(['berry', null]);
    setQuick(s, 1, 'potion');
    expect(quickOf(s)).toEqual(['berry', 'potion']);
    setQuick(s, 0, 'potion');
    expect(quickOf(s)).toEqual(['potion', 'berry']);
    setQuick(s, 0, 'potion');
    expect(quickOf(s)).toEqual([null, 'berry']);
    setQuick(s, 0, 'kit');
    s.bag.push({ kind: 'herb' }, { kind: 'herb', use: 'kit' });
    const p = s.player;
    p.hp = 1;
    expect(useQuick(s, 0)).toBe(true);
    expect(p.hp).toBe(p.maxHp);
    expect(s.bag).toEqual([{ kind: 'herb' }]);
    expect(useQuick(s, 0)).toBe(false);
    p.hp = 1;
    // 待ち時間の 間は 使えない
    expect(useQuick(s, 1)).toBe(false);
    s.t += ADV.useCd;
    expect(useQuick(s, 1)).toBe(true);
    expect(p.hp).toBe(1 + Math.round(p.maxHp * USE_ITEMS.berry.heal));
    expect(USE_ITEMS.potion.heal).toBeGreaterThan(USE_ITEMS.berry.heal);
    expect(USE_ITEMS.kit.heal).toBeGreaterThan(USE_ITEMS.potion.heal);
  });
  it('ガチャの 武器は 落ちない', () => {
    const s = newAdventure(3, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 }, 20);
    equipStartWeapon(s, WEAPON_LIST.剣士[0], WEAPON_LIST.剣士);
    for (let i = 0; i < 3000; i++) dropAt(s, 0, 0, 1, 0);
    for (const d of s.drops) if (d.item.kind === 'gear' && d.item.slot === 'weapon') expect(isGachaWeapon(d.item.name!)).toBe(false);
  });
  it('敵の 装備ドロップ: 表の とおり(雑魚 7.62%・中ボス 36.2%・ボス 64%)・雑魚からも S が 出る', () => {
    const s = newAdventure(3, { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 });
    const sum = (t: number[]) => t.reduce((a, b) => a + b, 0);
    expect(sum(ADV.drop.table.mob)).toBeCloseTo(7.62, 5);
    expect(sum(ADV.drop.table.mid)).toBeCloseTo(36.2, 5);
    expect(sum(ADV.drop.table.boss)).toBeCloseTo(64, 5);
    for (const tier of ['mob', 'mid', 'boss'] as const) {
      const N = 200000;
      const got: Record<string, number> = {};
      for (let i = 0; i < N; i++) {
        const r = rollGearRank(s, ADV.drop.table[tier]) ?? 'none';
        got[r] = (got[r] ?? 0) + 1;
      }
      ['D', 'C', 'B'].forEach((rk, i) => expect(Math.abs((got[rk] ?? 0) / N * 100 - ADV.drop.table[tier][i])).toBeLessThan(0.35));
      expect(Math.abs((got.none ?? 0) / N * 100 - (100 - sum(ADV.drop.table[tier])))).toBeLessThan(0.5);
    }
    // 雑魚の S(0.02%)も 出る
    let sHit = false;
    for (let i = 0; i < 100000 && !sHit; i++) if (rollGearRank(s, ADV.drop.table.mob) === 'S') sHit = true;
    expect(sHit).toBe(true);
  });
  it('置き物の 装備: 1階は D だけ・ずっと B まで', () => {
    expect(ADV.drop.cap[0]).toEqual([1, 0]);
    expect(Math.max(...ADV.drop.cap.map((c) => c[1]))).toBe(2);
  });
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
  function play(seed: number, stats = strong, maxT = 600, floor = 1) {
    const s = newAdventure(seed, stats, floor);
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
  it('しかけ: はじまりの 部屋は ひらいている・しかけ(スイッチ / 箱 / 鍵)は 1つだけ・敵を 倒す 部屋が ある・解くまで 扉は しまっている', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = newAdventure(seed, strong);
      expect(s.puzzles[0].kind).toBe('none');
      expect(s.puzzles.filter((z) => ['switch', 'box', 'key'].includes(z.kind)).length).toBe(1);
      expect(s.puzzles.some((z) => z.kind === 'kill')).toBe(true);
      for (const z of s.puzzles) seen.add(z.kind);
      s.puzzles.forEach((z, i) => expect(s.floor.tiles[s.floor.doors[i].cells[0]]).toBe(z.solved ? FLOOR : DOOR));
    }
    for (const k of ['kill', 'switch', 'box', 'key']) expect(seen.has(k)).toBe(true);
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
    const r = [1, 2, 3, 4].map((sd) => play(sd, weak, 600, 4).result);
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

describe('路地裏の 敵 10種(2026-11-24)', () => {
  const stats = { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 };
  /** 部屋の まん中に 自分と 敵 1体だけ 置く */
  const duel = (kind: MobKind, gap: number): AdvState => {
    const s = newAdventure(7, stats);
    const r = s.floor.rooms[0];
    const cx = (r.x + r.w / 2) * CELL;
    const cz = (r.y + r.h / 2) * CELL;
    const m = s.mobs[0];
    s.mobs = [m];
    s.mobRoom = [0];
    m.mobKind = kind;
    m.speed = MOB_KINDS[kind].speed;
    Object.assign(s.player, { x: cx - gap / 2, z: cz });
    Object.assign(m, { x: cx + gap / 2, z: cz, awake: true });
    return s;
  };
  const run = (s: AdvState, sec: number) => {
    for (let t = 0; t < sec; t += 1 / 30) stepAdventure(s, { mx: 0, mz: 0, attack: false }, 1 / 30);
  };
  it('どの 種類も 自分に ダメージを あたえる', () => {
    for (const k of ALLEY_MOBS) {
      const s = duel(k, 6);
      run(s, 6);
      expect(s.player.hp, k).toBeLessThan(s.player.maxHp);
    }
  });
  it('撃つ 敵は はなれた まま 撃つ・クモの 糸で おそくなる', () => {
    const s = duel('pige', 6);
    run(s, 3);
    expect(Math.hypot(s.player.x - s.mobs[0].x, s.player.z - s.mobs[0].z)).toBeGreaterThan(3);
    const w = duel('spider', 5);
    let slowed = false;
    for (let t = 0; t < 5 && !slowed; t += 1 / 30) {
      stepAdventure(w, { mx: 0, mz: 0, attack: false }, 1 / 30);
      slowed = (w.player.slowUntil ?? 0) > w.t;
    }
    expect(slowed).toBe(true);
  });
  it('ミミックは 近づくまで 動かない', () => {
    const s = duel('mimic', 6);
    s.mobs[0].awake = false;
    const x = s.mobs[0].x;
    run(s, 2);
    expect(s.mobs[0].x).toBe(x);
    expect(s.player.hp).toBe(s.player.maxHp);
  });
});

describe('階と ボス(2026-11-24)', () => {
  const stats = { hp: 10, power: 10, tough: 10, speed: 10, tech: 10 };
  it('階ごとの 敵が 出る・5階と 10階は ワープの 前の 部屋に ボス・たおすまで 扉が ひらかない', () => {
    for (let f = 1; f <= ALLEY_TOP; f++) {
      const s = newAdventure(f * 3, stats, f);
      const normal = s.mobs.filter((m) => !isBoss(m));
      for (const m of normal) expect(FLOOR_MOBS[f]).toContain(m.mobKind);
      const boss = s.mobs.filter(isBoss);
      expect(boss.map((m) => m.mobKind)).toEqual(BOSS_AT[f] ? [BOSS_AT[f]] : []);
      if (boss.length) {
        const br = s.floor.rooms.length - 2;
        expect(s.mobRoom[s.mobs.indexOf(boss[0])]).toBe(br);
        expect(s.mobRoom.filter((r) => r === br).length).toBe(1);
        expect(s.puzzles[br].kind).toBe('kill');
        expect(s.floor.tiles[s.floor.doors[br].cells[0]]).toBe(DOOR);
        boss[0].hp = 1;
        Object.assign(s.player, { x: boss[0].x - 1.5, z: boss[0].z, face: 0 });
        for (let t = 0; t < 1 && boss[0].act !== 'dead'; t += 1 / 30) stepAdventure(s, { mx: 0, mz: 0, attack: true }, 1 / 30);
        expect(boss[0].act).toBe('dead');
        stepAdventure(s, { mx: 0, mz: 0, attack: false }, 1 / 30);
        expect(s.puzzles[br].solved).toBe(true);
        expect(s.floor.tiles[s.floor.doors[br].cells[0]]).toBe(FLOOR);
      }
    }
  });
  it('上の 階ほど 敵が 強い', () => {
    const avg = (f: number) => {
      const s = newAdventure(11, stats, f);
      const n = s.mobs.filter((m) => !isBoss(m));
      return n.reduce((a, m) => a + m.maxHp * m.atk, 0) / n.length;
    };
    expect(avg(9)).toBeGreaterThan(avg(1) * 2);
  });
});
