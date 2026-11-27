/**
 * 冒険の ダンジョン(1階ぶん)を 自動で 作る(2026-11-07 企画者「入るたびに変わる」)。Phaser・Three に 依存しない。
 * 部屋を 重ならないように 置き、となりの 部屋どうしを 通路で つなぐ。同じ 種なら 同じ 形。
 * 1マス = CELL(世界の 長さ)。【仮】大きさ・部屋の数
 */
import { mulberry32 } from '../rng';

export const CELL = 2;
export const WALL = 0;
export const FLOOR = 1;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 部屋と 部屋の 間の 扉(2026-11-24 企画者「ギミックと 敵を 倒して 進む」)。部屋 i → i+1 の 通路の 入り口 */
export const DOOR = 2;
/** 置き物(ゴミ箱など)の マス。歩けない(2026-11-25 企画者の 絵) */
export const PROP = 3;

/** 路地裏の 置き物(2026-11-25 企画者の 絵 ④〜⑩)。lamp は 街灯 */
export type PropKind = 'trash' | 'dumpster' | 'boxes' | 'bags' | 'drum' | 'crate' | 'lamp';
export interface FloorProp {
  kind: PropKind;
  /** マス */
  cx: number;
  cy: number;
}
/** 床の 模様(⑫水たまり・⑬マンホール)。歩ける。x,z は 世界の 座標・rot は 向き */
export interface FloorDecal {
  kind: 'puddle' | 'manhole';
  x: number;
  z: number;
  rot: number;
  size: number;
}
/** 壁の ネオン看板(⑪)。北の 壁(カメラから 見える 面)の 床がわ。x,z は 壁の 面の 場所 */
export interface FloorSign {
  x: number;
  z: number;
}
export interface FloorDoor {
  /** 扉の マス(tiles の 番号) */
  cells: number[];
  /** 扉の まん中(世界の 座標)・通路の 向き(true = 横へ のびる 通路) */
  x: number;
  z: number;
  horiz: boolean;
}

export interface Floor {
  w: number;
  h: number;
  /** tiles[y * w + x]: WALL / FLOOR / DOOR(しまって いる 扉) */
  tiles: Uint8Array;
  /** 部屋(はじまり → ワープの 順に 一本道) */
  rooms: Room[];
  /** doors[i] = 部屋 i から 部屋 i+1 への 扉 */
  doors: FloorDoor[];
  /** はじまりの 場所(1つめの 部屋の まん中)・出口(ワープ。さいごの 部屋)。世界の 座標 */
  start: { x: number; z: number };
  exit: { x: number; z: number };
  /** 置き物・床の 模様・ネオン看板(見た目。置き物は 歩けない) */
  props: FloorProp[];
  decals: FloorDecal[];
  signs: FloorSign[];
  /** わき道の 部屋(行き止まり。2026-11-27 企画者「一本道は やめよう。行き止まり・すごい 広い 部屋・モンスター部屋」) */
  sides: SideRoom[];
}

/** わき道の 部屋。from = つながる 一本道の 部屋・door = 部屋の 入り口の マス(モンスター部屋で しめる)・big = 広い 部屋・house = モンスター部屋 */
export interface SideRoom {
  room: Room;
  from: number;
  door: number[];
  big: boolean;
  house: boolean;
}

export interface FloorOptions {
  /** 部屋の 数(はじまり・ワープ ふくむ) */
  rooms?: number;
  /** 階(わき道・広い 部屋・モンスター部屋は 階が 進むほど ふえる) */
  level?: number;
}

const center = (r: Room) => ({ cx: Math.floor(r.x + r.w / 2), cy: Math.floor(r.y + r.h / 2) });
/** マスの まん中の 世界の 座標 */
export const cellToWorld = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, z: (cy + 0.5) * CELL });

/** 部屋を 置く ます目(4×4)・1つの 大きさ(マス) */
const GRID = 4;
// 2026-11-24 企画者「もっと 部屋 広い 感じ」→ ます目 12 → 16・部屋 6〜9 → 9〜13 マス
const SLOT = 16;
/** 通路の 位置(ます目の 中の 列・行。はば 2) */
const LANE = 7;

/**
 * 1階を 作る(2026-11-24 作り直し)。4×4 の ます目に 部屋を 一本道で ならべ、となりどうしを まっすぐの 通路で つなぐ。
 * 部屋 i → i+1 の 通路の 入り口に 扉(しかけを 解くと ひらく)。輪に しない(扉を 通らないと 先へ 行けない)
 */
export function generateFloor(seed: number, opt: FloorOptions = {}): Floor {
  const rng = mulberry32(seed);
  const want = Math.max(3, Math.min(10, opt.rooms ?? 7));
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  // ます目の 道(重ならない 一本道)
  let path: [number, number][] = [];
  for (let tries = 0; tries < 500 && path.length < want; tries++) {
    path = [[ri(0, GRID - 1), ri(0, GRID - 1)]];
    while (path.length < want) {
      const [cx, cy] = path[path.length - 1];
      const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        .map(([dx, dy]) => [cx + dx, cy + dy] as [number, number])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < GRID && y < GRID && !path.some(([px, py]) => px === x && py === y));
      if (!next.length) break;
      path.push(next[Math.floor(rng() * next.length)]);
    }
  }
  const w = GRID * SLOT + 1;
  const h = GRID * SLOT + 1;
  const tiles = new Uint8Array(w * h);
  const dig = (x: number, y: number, v = FLOOR) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) tiles[y * w + x] = v;
  };
  // 部屋: 通路の 線(LANE, LANE+1)を かならず ふくむ
  const rooms: Room[] = path.map(([gx, gy]) => {
    const rw = ri(9, 13);
    const rh = ri(9, 13);
    const ox = gx * SLOT;
    const oy = gy * SLOT;
    const x = ri(Math.max(ox + 1, ox + LANE + 2 - rw), Math.min(ox + LANE, ox + SLOT - 1 - rw));
    const y = ri(Math.max(oy + 1, oy + LANE + 2 - rh), Math.min(oy + LANE, oy + SLOT - 1 - rh));
    return { x, y, w: rw, h: rh };
  });
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) dig(x, y);
  // 通路と 扉
  const doors: FloorDoor[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const cells: number[] = [];
    if (ay === by) {
      // 横の 通路
      const y0 = ay * SLOT + LANE;
      const goR = bx > ax;
      const x0 = goR ? a.x + a.w : b.x + b.w;
      const x1 = goR ? b.x - 1 : a.x - 1;
      for (let x = x0; x <= x1; x++) for (const y of [y0, y0 + 1]) dig(x, y);
      const dx = goR ? x0 : x1;
      cells.push(y0 * w + dx, (y0 + 1) * w + dx);
      const c = cellToWorld(dx, y0);
      doors.push({ cells, x: c.x, z: c.z + CELL / 2, horiz: true });
    } else {
      // たての 通路
      const x0c = ax * SLOT + LANE;
      const goD = by > ay;
      const y0 = goD ? a.y + a.h : b.y + b.h;
      const y1 = goD ? b.y - 1 : a.y - 1;
      for (let y = y0; y <= y1; y++) for (const x of [x0c, x0c + 1]) dig(x, y);
      const dy = goD ? y0 : y1;
      cells.push(dy * w + x0c, dy * w + x0c + 1);
      const c = cellToWorld(x0c, dy);
      doors.push({ cells, x: c.x + CELL / 2, z: c.z, horiz: false });
    }
  }
  const sides = addSides(tiles, w, path, rooms, seed, opt.level ?? 1);
  const s = center(rooms[0]);
  const e = center(rooms[rooms.length - 1]);
  const f: Floor = { w, h, tiles, rooms, doors, start: cellToWorld(s.cx, s.cy), exit: cellToWorld(e.cx, e.cy), props: [], decals: [], signs: [], sides };
  decorate(f, seed);
  return f;
}

/**
 * わき道の 部屋を 足す(一本道の 部屋の となりの 空いた ます目へ。行き止まり)。部屋の 形は べつの 乱数(一本道は 変わらない)。
 * 数: 1階 1つ・2階ごとに 1つ ふえる(4つまで)。広い 部屋(となり 2ます ぶん): 2階から 半分・5階から かならず。
 * モンスター部屋: 3階から 半分・6階から 7割【仮】
 */
function addSides(tiles: Uint8Array, w: number, path: [number, number][], rooms: Room[], seed: number, level: number): SideRoom[] {
  const rng = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const used = new Set(path.map(([x, y]) => `${x},${y}`));
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID && !used.has(`${x},${y}`);
  const dig = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < w - 1 && y < w - 1) tiles[y * w + x] = FLOOR;
  };
  const want = Math.min(4, 1 + Math.floor((level - 1) / 2));
  const bigOk = level >= 5 || (level >= 2 && rng() < 0.5);
  const houseOk = level >= 6 ? rng() < 0.7 : level >= 3 && rng() < 0.5;
  const out: SideRoom[] = [];
  // 一本道の 部屋(はじまりと ワープの 部屋 以外を 先に)の となりの 空き
  const order = path.map((_, i) => i).filter((i) => i > 0 && i < path.length - 1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.push(0);
  for (const pi of order) {
    if (out.length >= want) break;
    const [px, py] = path[pi];
    const dirs = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dy]) => free(px + dx, py + dy));
    if (!dirs.length) continue;
    const [dx, dy] = dirs[Math.floor(rng() * dirs.length)];
    const gx = px + dx;
    const gy = py + dy;
    // 広い 部屋: さらに 同じ 向きか 横の ます目も 空いて いれば 2ます ぶん
    let g2: [number, number] | null = null;
    if (bigOk && !out.some((o) => o.big)) {
      const cand = ([[dx, dy], [dy, dx], [-dy, -dx]] as const).map(([ex, ey]) => [gx + ex, gy + ey] as [number, number]).filter(([x, y]) => free(x, y));
      if (cand.length) g2 = cand[0];
    }
    used.add(`${gx},${gy}`);
    if (g2) used.add(`${g2[0]},${g2[1]}`);
    const slotRect = (sx: number, sy: number): Room => {
      const rw = ri(8, 11);
      const rh = ri(8, 11);
      const ox = sx * SLOT;
      const oy = sy * SLOT;
      const x = ri(Math.max(ox + 1, ox + LANE + 2 - rw), Math.min(ox + LANE, ox + SLOT - 1 - rw));
      const y = ri(Math.max(oy + 1, oy + LANE + 2 - rh), Math.min(oy + LANE, oy + SLOT - 1 - rh));
      return { x, y, w: rw, h: rh };
    };
    let room: Room;
    if (g2) {
      // 2ます ぶんの 広い 部屋(両方の 通路の 線を ふくむ)
      const x0 = Math.min(gx, g2[0]) * SLOT;
      const y0 = Math.min(gy, g2[1]) * SLOT;
      const x1 = (Math.max(gx, g2[0]) + 1) * SLOT;
      const y1 = (Math.max(gy, g2[1]) + 1) * SLOT;
      const m = () => ri(2, 3);
      const wide = gx !== g2[0];
      const rx = wide ? x0 + m() : x0 + ri(1, 3);
      const ry = wide ? y0 + ri(1, 3) : y0 + m();
      const rx1 = wide ? x1 - m() : x0 + SLOT - ri(1, 3);
      const ry1 = wide ? y0 + SLOT - ri(1, 3) : y1 - m();
      room = { x: rx, y: ry, w: rx1 - rx, h: ry1 - ry };
    } else room = slotRect(gx, gy);
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) dig(x, y);
    // 通路(一本道の 部屋 → わき道の 部屋)。部屋がわの 入り口の マスを 覚える
    const a = rooms[pi];
    const door: number[] = [];
    if (dy === 0) {
      const y0 = py * SLOT + LANE;
      const goR = dx > 0;
      const xa = goR ? a.x + a.w : room.x + room.w;
      const xb = goR ? room.x - 1 : a.x - 1;
      for (let x = xa; x <= xb; x++) for (const y of [y0, y0 + 1]) dig(x, y);
      const ex = goR ? xb : xa;
      door.push(y0 * w + ex, (y0 + 1) * w + ex);
    } else {
      const x0 = px * SLOT + LANE;
      const goD = dy > 0;
      const ya = goD ? a.y + a.h : room.y + room.h;
      const yb = goD ? room.y - 1 : a.y - 1;
      for (let y = ya; y <= yb; y++) for (const x of [x0, x0 + 1]) dig(x, y);
      const ey = goD ? yb : ya;
      door.push(ey * w + x0, ey * w + x0 + 1);
    }
    out.push({ room, from: pi, door, big: !!g2, house: false });
  }
  // モンスター部屋(はじまりの 部屋 から つながる 部屋 以外。広い 部屋が あれば そこ)
  if (houseOk) {
    const c = out.filter((o) => o.from !== 0);
    const pick = c.find((o) => o.big) ?? c[Math.floor(rng() * c.length)];
    if (pick) pick.house = true;
  }
  return out;
}

const PROP_KINDS: PropKind[] = ['trash', 'dumpster', 'boxes', 'bags', 'drum', 'crate'];

/**
 * 置き物を 並べる(2026-11-25 企画者「部屋の すみや 壁ぎわに」)。部屋の 形は 変えない(べつの 乱数)。
 * 置き物は 部屋の ふちの マス(北・西・東。南は 手前の 壁で かくれるので 置かない)。通路の 入り口の まわりは あける。
 * 敵・しかけは 部屋の ふちより 内がわに 出るので 重ならない。【仮】数
 */
function decorate(f: Floor, seed: number): void {
  const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? WALL : f.tiles[y * f.w + x]);
  [...f.rooms, ...f.sides.map((sd) => sd.room)].forEach((r) => {
    // 通路の 入り口(部屋の ふちで、外が 壁でない マス)
    const open: [number, number][] = [];
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const inR = (xx: number, yy: number) => xx >= r.x && xx < r.x + r.w && yy >= r.y && yy < r.y + r.h;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (!inR(x + dx, y + dy) && at(x + dx, y + dy) !== WALL) open.push([x, y]);
      }
    const nearOpen = (x: number, y: number) => open.some(([ox, oy]) => Math.abs(ox - x) <= 2 && Math.abs(oy - y) <= 2);
    const north: [number, number][] = [];
    const sides: [number, number][] = [];
    for (let x = r.x; x < r.x + r.w; x++) if (!nearOpen(x, r.y)) north.push([x, r.y]);
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      if (!nearOpen(r.x, y)) sides.push([r.x, y]);
      if (!nearOpen(r.x + r.w - 1, y)) sides.push([r.x + r.w - 1, y]);
    }
    const take = (list: [number, number][]) => (list.length ? list.splice(Math.floor(rng() * list.length), 1)[0] : null);
    const put = (kind: PropKind, c: [number, number] | null) => {
      if (!c || at(c[0], c[1]) !== FLOOR) return;
      f.tiles[c[1] * f.w + c[0]] = PROP;
      f.props.push({ kind, cx: c[0], cy: c[1] });
    };
    // 街灯は 北の 壁ぎわに 1本(半分の 部屋)
    if (rng() < 0.5) put('lamp', take(north));
    const n = ri(2, 4);
    for (let k = 0; k < n; k++) {
      const kind = PROP_KINDS[Math.floor(rng() * PROP_KINDS.length)];
      put(kind, take(rng() < 0.5 ? north : sides) ?? take(north) ?? take(sides));
    }
    // ネオン看板は 北の 壁に 1つ(半分の 部屋)。置き物の 上は さける
    if (rng() < 0.5 && north.length) {
      const c = north[Math.floor(rng() * north.length)];
      const w = cellToWorld(c[0], c[1]);
      f.signs.push({ x: w.x, z: r.y * CELL });
    }
    // 床の 模様: 水たまり 0〜2・マンホール 0〜1(部屋の 内がわ。まん中は あける)
    const mid = center(r);
    const spot = () => {
      for (let t = 0; t < 10; t++) {
        const x = ri(r.x + 1, r.x + r.w - 2);
        const y = ri(r.y + 1, r.y + r.h - 2);
        if (Math.abs(x - mid.cx) <= 1 && Math.abs(y - mid.cy) <= 1) continue;
        const w = cellToWorld(x, y);
        if (f.decals.some((d) => Math.hypot(d.x - w.x, d.z - w.z) < CELL * 2)) continue;
        return w;
      }
      return null;
    };
    const np = ri(0, 2);
    for (let k = 0; k < np; k++) {
      const w = spot();
      if (w) f.decals.push({ kind: 'puddle', x: w.x + (rng() - 0.5), z: w.z + (rng() - 0.5), rot: (rng() - 0.5) * 0.6, size: 2.2 + rng() * 1.2 });
    }
    if (rng() < 0.5) {
      const w = spot();
      if (w) f.decals.push({ kind: 'manhole', x: w.x, z: w.z, rot: rng() * Math.PI * 2, size: 1.7 });
    }
  });
}

/** 扉を しめる / ひらく */
export function setDoor(f: Floor, i: number, closed: boolean): void {
  for (const c of f.doors[i]?.cells ?? []) f.tiles[c] = closed ? DOOR : FLOOR;
}

/** 世界の 場所 → どの 部屋か(部屋の 外は -1) */
export function roomAt(f: Floor, x: number, z: number): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(z / CELL);
  return f.rooms.findIndex((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
}

/** その 世界の 場所が 歩ける 床か */
export function walkable(f: Floor, x: number, z: number): boolean {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(z / CELL);
  if (cx < 0 || cy < 0 || cx >= f.w || cy >= f.h) return false;
  return f.tiles[cy * f.w + cx] === FLOOR;
}

/** 丸い 体(半径 r)が 壁に 重ならないか */
export function fits(f: Floor, x: number, z: number, r: number): boolean {
  return walkable(f, x - r, z - r) && walkable(f, x + r, z - r) && walkable(f, x - r, z + r) && walkable(f, x + r, z + r);
}

/** 2点の 間が 壁で さえぎられていないか(見えるか) */
export function lineOfSight(f: Floor, ax: number, az: number, bx: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / (CELL * 0.4));
  for (let i = 1; i < n; i++) if (!walkable(f, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
  return true;
}
