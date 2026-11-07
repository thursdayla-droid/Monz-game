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

export interface Floor {
  w: number;
  h: number;
  /** tiles[y * w + x]: WALL / FLOOR */
  tiles: Uint8Array;
  rooms: Room[];
  /** はじまりの 場所(1つめの 部屋の まん中)・出口(さいごの 部屋)。世界の 座標 */
  start: { x: number; z: number };
  exit: { x: number; z: number };
}

export interface FloorOptions {
  w?: number;
  h?: number;
  rooms?: number;
}

const center = (r: Room) => ({ cx: Math.floor(r.x + r.w / 2), cy: Math.floor(r.y + r.h / 2) });
/** マスの まん中の 世界の 座標 */
export const cellToWorld = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, z: (cy + 0.5) * CELL });

export function generateFloor(seed: number, opt: FloorOptions = {}): Floor {
  const rng = mulberry32(seed);
  const w = opt.w ?? 44;
  const h = opt.h ?? 44;
  const want = opt.rooms ?? 8;
  const tiles = new Uint8Array(w * h);
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const rooms: Room[] = [];
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const r = { w: ri(5, 9), h: ri(5, 9), x: 0, y: 0 };
    r.x = ri(1, w - r.w - 2);
    r.y = ri(1, h - r.h - 2);
    // ほかの 部屋と 2マス あける
    if (rooms.some((o) => r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2)) continue;
    rooms.push(r);
  }
  // 左上から 右下へ ならべて、順に つなぐ(はじまりと 出口が 遠くなる)
  rooms.sort((a, b) => a.x + a.y - (b.x + b.y));
  const dig = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) tiles[y * w + x] = FLOOR;
  };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) dig(x, y);
  // 通路(はば 2マス)。L の 形
  const corridor = (a: Room, b: Room) => {
    const p = center(a);
    const q = center(b);
    const horizFirst = rng() < 0.5;
    const hline = (y: number, x0: number, x1: number) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        dig(x, y);
        dig(x, y + 1);
      }
    };
    const vline = (x: number, y0: number, y1: number) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        dig(x, y);
        dig(x + 1, y);
      }
    };
    if (horizFirst) {
      hline(p.cy, p.cx, q.cx);
      vline(q.cx, p.cy, q.cy);
    } else {
      vline(p.cx, p.cy, q.cy);
      hline(q.cy, p.cx, q.cx);
    }
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  // 少し 輪に なるように、1本 よけいに つなぐ
  if (rooms.length > 3) corridor(rooms[0], rooms[Math.floor(rooms.length / 2)]);
  const s = center(rooms[0]);
  const e = center(rooms[rooms.length - 1]);
  return { w, h, tiles, rooms, start: cellToWorld(s.cx, s.cy), exit: cellToWorld(e.cx, e.cy) };
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
