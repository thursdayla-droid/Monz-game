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
}

export interface FloorOptions {
  /** 部屋の 数(はじまり・ワープ ふくむ) */
  rooms?: number;
}

const center = (r: Room) => ({ cx: Math.floor(r.x + r.w / 2), cy: Math.floor(r.y + r.h / 2) });
/** マスの まん中の 世界の 座標 */
export const cellToWorld = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, z: (cy + 0.5) * CELL });

/** 部屋を 置く ます目(4×4)・1つの 大きさ(マス) */
const GRID = 4;
const SLOT = 12;
/** 通路の 位置(ます目の 中の 列・行。はば 2) */
const LANE = 5;

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
    const rw = ri(6, 9);
    const rh = ri(6, 9);
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
  const s = center(rooms[0]);
  const e = center(rooms[rooms.length - 1]);
  return { w, h, tiles, rooms, doors, start: cellToWorld(s.cx, s.cy), exit: cellToWorld(e.cx, e.cy) };
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
