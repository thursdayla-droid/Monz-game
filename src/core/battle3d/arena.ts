/**
 * 3Dバトルのマップ(地形・さえぎる物・当たり)。2026-11-03 企画者「ロストテンプル」。
 * ほかのマップでも使えるように、マップはデータ(ArenaMap)だけにして、当たりの計算はここにまとめる。
 * - 体の当たり(resolveBody): MONZ は さえぎる物の中に入れない(外へ押し出す → 柱にそって すべる・引っかからない)
 * - 攻撃の当たり(rayHit / lineOfSight): 弾・ビーム・衝撃波が さえぎる物で止まる
 * 体の当たりと攻撃の当たりは べつ(低い物は体は止めるが、高い所の攻撃は通す など)。
 * こわせる物: breakable(今は使わない。あとで hp を足せるように形だけ)。
 * マップで属性の強さは変えない(企画者)。Phaser・Three.js に依存しない(テストのため)。
 */

export interface CircleObstacle {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  /** 高さ(これより高い所を飛ぶ攻撃は通る) */
  h: number;
  /** 見た目の種類(柱・くずれた柱 など) */
  look: 'pillar' | 'broken' | 'stump';
  breakable?: boolean;
}

export interface BoxObstacle {
  kind: 'box';
  x: number;
  z: number;
  /** 半分の長さ(ローカルの x)・半分の厚さ(ローカルの z) */
  hw: number;
  hd: number;
  /** 向き(ラジアン) */
  rot: number;
  h: number;
  look: 'wall' | 'block';
  breakable?: boolean;
}

export type Obstacle = CircleObstacle | BoxObstacle;

export interface ArenaMap {
  id: string;
  name: string;
  /** 戦える丸い場所の半径(この外へは出られない) */
  radius: number;
  obstacles: Obstacle[];
  /** はじめの位置(自分・相手) */
  start: [{ x: number; z: number }, { x: number; z: number }];
  /** 見た目(遺跡・草原)。なければ遺跡 */
  theme?: 'temple' | 'grass' | 'street' | 'champion';
}

/**
 * 草原(2026-11-04 企画者「広さは一緒で 柱とか何もない草原のフィールドをお願い。それを基本にしよう」)。
 * 直径36m・さえぎる物なし。まわりの しげみ・木・丘は 飾り(当たりなし)
 */
export const GRASSLAND: ArenaMap = {
  id: 'grassland',
  name: 'そうげん',
  radius: 18,
  start: [
    { x: -7, z: 0 },
    { x: 7, z: 0 },
  ],
  obstacles: [],
  theme: 'grass',
};

const deg = (d: number) => (d * Math.PI) / 180;
const ring = (r: number, d: number) => ({ x: Math.cos(deg(d)) * r, z: Math.sin(deg(d)) * r });

/**
 * ロストテンプル(2026-11-03 企画者)。直径36m(企画者「案Bの36で」)。
 * まん中は広く空ける・まん中の近くに少しの物・外まわりに柱と石の壁【仮】の配置
 */
export const LOST_TEMPLE: ArenaMap = {
  id: 'lostTemple',
  name: 'ロストテンプル',
  radius: 18,
  start: [
    { x: -7, z: 0 },
    { x: 7, z: 0 },
  ],
  obstacles: [
    // 2026-11-03 企画者「障害物多すぎて見えにくい。3個ぐらいでいい」→ 3つに(三角に置く。はじめの2体のあいだは あけておく)
    // 前の18個の置き方は git の記録にある
    { kind: 'circle', ...ring(6, 90), r: 0.9, h: 5, look: 'pillar' },
    { kind: 'circle', ...ring(6.5, 215), r: 0.9, h: 3.2, look: 'broken' },
    { kind: 'circle', ...ring(6.5, 325), r: 0.9, h: 3.2, look: 'broken' },
  ],
};

/**
 * STREET KING の ステージ(2026-11-05 企画者「ステージはクロードに作ってほしい」)。広さ・はじめの位置は 草原と 同じ。さえぎる物なし(飾りは 外がわ)
 * - ストリート: 落書き・倉庫・工業地帯・ネオン(第3〜4章)
 * - チャンピオン: 巨大な 大会会場・照明・観客席。黒・紫・金(第5〜6章・KROWN戦)
 */
export const STREET: ArenaMap = { ...GRASSLAND, id: 'street', name: 'ストリート', theme: 'street' };
export const CHAMPION: ArenaMap = { ...GRASSLAND, id: 'champion', name: 'チャンピオン', theme: 'champion' };

export const ARENAS: Record<string, ArenaMap> = { grassland: GRASSLAND, lostTemple: LOST_TEMPLE, street: STREET, champion: CHAMPION };
/** ふつうに使うマップ(2026-11-04 企画者「それを基本にしよう」)。ロストテンプルは 残してある */
export const DEFAULT_MAP = 'grassland';

/** ローカルの座標へ(箱) */
function toLocal(o: BoxObstacle, x: number, z: number): [number, number] {
  const dx = x - o.x;
  const dz = z - o.z;
  const c = Math.cos(-o.rot);
  const s = Math.sin(-o.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}
function toWorld(o: BoxObstacle, lx: number, lz: number): [number, number] {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return [o.x + lx * c - lz * s, o.z + lx * s + lz * c];
}

/**
 * 体の当たり: 半径 r の体を、さえぎる物と外の壁から押し出す(押し出す向き = 物の表面のまっすぐ外 → そって すべる)。
 * p を直接書きかえる。押し出したら true
 */
export function resolveBody(map: ArenaMap, p: { x: number; z: number }, r: number): boolean {
  let moved = false;
  for (const o of map.obstacles) {
    if (o.kind === 'circle') {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const need = o.r + r;
      if (d < need) {
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        p.x = o.x + nx * need;
        p.z = o.z + nz * need;
        moved = true;
      }
    } else {
      const [lx, lz] = toLocal(o, p.x, p.z);
      // 箱のいちばん近い点
      const cx = Math.max(-o.hw, Math.min(o.hw, lx));
      const cz = Math.max(-o.hd, Math.min(o.hd, lz));
      const ddx = lx - cx;
      const ddz = lz - cz;
      const d = Math.hypot(ddx, ddz);
      if (d < r) {
        let nx: number;
        let nz: number;
        if (d > 1e-6) {
          nx = lx + (ddx / d) * (r - d);
          nz = lz + (ddz / d) * (r - d);
        } else {
          // 中に入ってしまった: いちばん近い面から外へ
          const px = o.hw - Math.abs(lx);
          const pz = o.hd - Math.abs(lz);
          if (px < pz) {
            nx = Math.sign(lx || 1) * (o.hw + r);
            nz = lz;
          } else {
            nx = lx;
            nz = Math.sign(lz || 1) * (o.hd + r);
          }
        }
        [p.x, p.z] = toWorld(o, nx, nz);
        moved = true;
      }
    }
  }
  // 外の壁(丸い場所の外へ出ない)
  const d = Math.hypot(p.x, p.z);
  if (d > map.radius - r) {
    p.x *= (map.radius - r) / d;
    p.z *= (map.radius - r) / d;
    moved = true;
  }
  return moved;
}

/** 点が さえぎる物の中か(pad だけ大きく見る) */
export function insideObstacle(map: ArenaMap, x: number, z: number, pad = 0): boolean {
  for (const o of map.obstacles) {
    if (o.kind === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    } else {
      const [lx, lz] = toLocal(o, x, z);
      if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return true;
    }
  }
  return false;
}

/** x,z の上にある物の いちばん高いところ(なければ 0)。カメラが物の中に入らないように使う */
export function obstacleTop(map: ArenaMap, x: number, z: number, pad = 0): number {
  let top = 0;
  for (const o of map.obstacles) {
    let inside: boolean;
    if (o.kind === 'circle') inside = Math.hypot(x - o.x, z - o.z) < o.r + pad;
    else {
      const [lx, lz] = toLocal(o, x, z);
      inside = Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad;
    }
    if (inside) top = Math.max(top, o.h);
  }
  return top;
}

/**
 * 攻撃の当たり: a → b の線が、高さ y で さえぎる物に当たるか。当たれば いちばん手前の点(t は 0〜1)。
 * pad: 弾の太さなど(物を少し大きく見る)
 */
export function rayHit(map: ArenaMap, ax: number, az: number, bx: number, bz: number, y = 0.8, pad = 0): { t: number; x: number; z: number; o: Obstacle } | null {
  let best: { t: number; x: number; z: number; o: Obstacle } | null = null;
  const dx = bx - ax;
  const dz = bz - az;
  for (const o of map.obstacles) {
    if (y >= o.h) continue;
    let t: number | null = null;
    if (o.kind === 'circle') {
      const fx = ax - o.x;
      const fz = az - o.z;
      const R = o.r + pad;
      const A = dx * dx + dz * dz;
      if (A < 1e-9) continue;
      const B = 2 * (fx * dx + fz * dz);
      const Cc = fx * fx + fz * fz - R * R;
      if (Cc <= 0) t = 0;
      else {
        const disc = B * B - 4 * A * Cc;
        if (disc >= 0) {
          const t0 = (-B - Math.sqrt(disc)) / (2 * A);
          if (t0 >= 0 && t0 <= 1) t = t0;
        }
      }
    } else {
      const [lax, laz] = toLocal(o, ax, az);
      const [lbx, lbz] = toLocal(o, bx, bz);
      const ldx = lbx - lax;
      const ldz = lbz - laz;
      let t0 = 0;
      let t1 = 1;
      let ok = true;
      for (const [p, d, h] of [[lax, ldx, o.hw + pad], [laz, ldz, o.hd + pad]] as const) {
        if (Math.abs(d) < 1e-9) {
          if (p < -h || p > h) ok = false;
        } else {
          let ta = (-h - p) / d;
          let tb = (h - p) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) ok = false;
        }
      }
      if (ok) t = t0;
    }
    if (t !== null && (!best || t < best.t)) best = { t, x: ax + dx * t, z: az + dz * t, o };
  }
  return best;
}

/** 2点のあいだが見通せるか(さえぎる物がない) */
export function lineOfSight(map: ArenaMap, a: { x: number; z: number }, b: { x: number; z: number }, y = 0.8, pad = 0): boolean {
  return !rayHit(map, a.x, a.z, b.x, b.z, y, pad);
}

/**
 * かくれる所: 相手から見て、近くの高い物(柱・壁)のうしろの点。maxDist より遠い物は使わない
 */
export function coverSpot(map: ArenaMap, me: { x: number; z: number }, enemy: { x: number; z: number }, maxDist = 7, bodyR = 0.7): { x: number; z: number } | null {
  let best: { x: number; z: number; d: number } | null = null;
  for (const o of map.obstacles) {
    if (o.h < 1.2) continue;
    const ex = o.x - enemy.x;
    const ez = o.z - enemy.z;
    const n = Math.hypot(ex, ez) || 1;
    const size = o.kind === 'circle' ? o.r : Math.max(o.hd, Math.min(o.hw, 1.2));
    const spot = { x: o.x + (ex / n) * (size + bodyR + 0.4), z: o.z + (ez / n) * (size + bodyR + 0.4) };
    if (Math.hypot(spot.x, spot.z) > map.radius - 1.5 || insideObstacle(map, spot.x, spot.z, bodyR)) continue;
    const d = Math.hypot(spot.x - me.x, spot.z - me.z);
    if (d > maxDist) continue;
    if (lineOfSight(map, spot, enemy)) continue;
    if (!best || d < best.d) best = { ...spot, d };
  }
  return best ? { x: best.x, z: best.z } : null;
}

/**
 * 進む向き(vx, vz)の すぐ先に物があれば、物にそって曲がる向きにする(AI が柱を よけて歩く)。
 * 先に当たる物があるとき、左右のうち 目的の向きに近いほうへ
 */
export function steerAround(map: ArenaMap, p: { x: number; z: number }, vx: number, vz: number, bodyR = 0.7, look = 2.2): [number, number] {
  const len = Math.hypot(vx, vz);
  if (len < 1e-6) return [vx, vz];
  const ux = vx / len;
  const uz = vz / len;
  const h = rayHit(map, p.x, p.z, p.x + ux * look, p.z + uz * look, 0.1, bodyR * 0.9);
  if (!h) return [vx, vz];
  const o = h.o;
  // 物のまん中から見た、横の向き(左右の2つ)
  const ox = p.x - o.x;
  const oz = p.z - o.z;
  const t1: [number, number] = [-oz, ox];
  const t2: [number, number] = [oz, -ox];
  const pick = t1[0] * ux + t1[1] * uz >= t2[0] * ux + t2[1] * uz ? t1 : t2;
  const n = Math.hypot(pick[0], pick[1]) || 1;
  // 近いほど よこへ強く曲がる
  const k = 1 - h.t;
  return [(ux * (1 - k) + (pick[0] / n) * k) * len, (uz * (1 - k) + (pick[1] / n) * k) * len];
}
