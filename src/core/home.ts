import type { Rng } from './rng';

/**
 * ホーム(育てる画面)の決まりごと。Phaserに依存しない。
 */

/**
 * お世話部屋。企画者決定(2026-10-21): ストリート・ポップ・近未来の3つ(前の 部屋・路地裏・ガレージ から置きかえ)。
 * MONZが生まれた後に、プレイヤーが「どこで育てる？」で選ぶ。あとで変えるのはショップでコイン(値段は【未確定】)。
 */
export const HOME_PLACES = ['street', 'pop', 'future'] as const;
export type HomePlace = (typeof HOME_PLACES)[number];

export const HOME_PLACE_LABELS: Record<HomePlace, string> = {
  // 企画者決定(2026-10-21): 英語の名前にする
  street: 'STREET ROOM',
  pop: 'POP ROOM',
  future: 'CYBER ROOM',
};

/** 保存されている部屋。まだ選んでいない・前の部屋(路地裏など)のときは undefined(選び直してもらう) */
export function savedHomePlace(saved?: string | null): HomePlace | undefined {
  return (HOME_PLACES as readonly string[]).includes(saved ?? '') ? (saved as HomePlace) : undefined;
}

/** ホームの下に並ぶボタン(左から順)。企画者決定(2026-10-19) */
// 2026-10-20 企画者の指示: MONZを直接なでられるので「なでる」ボタンはやめて「ステータス」にする
export const HOME_ACTIONS = ['food', 'minigame', 'status', 'battle', 'shop', 'settings'] as const;
export type HomeAction = (typeof HOME_ACTIONS)[number];

export const HOME_ACTION_LABELS: Record<HomeAction, string> = {
  food: 'ごはん',
  minigame: 'ミニゲーム',
  status: 'ステータス',
  battle: 'バトル',
  shop: 'ショップ',
  settings: '設定',
};

/** まだ中身がないボタン(押すと「じゅんび中」と出す)。中身は企画者が決める */
export const HOME_ACTION_READY: Record<HomeAction, boolean> = {
  food: true,
  minigame: true,
  status: true,
  battle: false,
  shop: true,
  settings: true,
};

export type Pt = [number, number];

/**
 * 部屋ごとの絵の大きさと、MONZが歩ける床の範囲(足元の位置。絵の座標)、奥と手前でのMONZの大きさ。
 * 床の範囲は、奥の壁・左右の壁・画面の下のボタンにかからないように決める。凸の多角形にする(まっすぐ歩いても外に出ない)。
 * 3部屋とも同じ角度で描いてもらったので、床の範囲も同じにする(家具の置き場所を部屋が変わってもそろえるため)。
 */
export interface HomeLayout {
  w: number;
  h: number;
  floor: Pt[];
  /** MONZの大きさ [床のいちばん奥, いちばん手前] */
  scale: [number, number];
  /** 家具を置ける床(奥の壁・左右の壁のきわまで)。企画者の指示(2026-10-21): 奥や壁ぎわにも置けるように */
  furniture: Pt[];
}

const ROOM_FLOOR: Pt[] = [[300, 640], [770, 640], [960, 800], [985, 1290], [40, 1290], [60, 800]];

export const HOME_LAYOUTS: Record<HomePlace, HomeLayout> = {
  street: { w: 1024, h: 1536, floor: ROOM_FLOOR, scale: [0.09, 0.19], furniture: [[255, 562], [800, 562], [1024, 745], [1024, 1290], [0, 1290], [0, 715]] },
  pop: { w: 1024, h: 1536, floor: ROOM_FLOOR, scale: [0.09, 0.19], furniture: [[205, 576], [815, 576], [1024, 740], [1024, 1290], [0, 1290], [0, 730]] },
  future: { w: 1024, h: 1536, floor: ROOM_FLOOR, scale: [0.09, 0.19], furniture: [[240, 584], [815, 584], [1024, 735], [1024, 1290], [0, 1290], [0, 720]] },
};

/** 点が多角形の中にあるか */
export function insidePolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 多角形を、左右の線(x=minX, x=maxX)の内側だけに切る(凸の多角形は凸のまま) */
export function clipPolygonX(poly: Pt[], minX: number, maxX: number): Pt[] {
  const clip = (pts: Pt[], keep: (p: Pt) => boolean, x: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (keep(a)) out.push(a);
      if (keep(a) !== keep(b)) out.push([x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]);
    }
    return out;
  };
  return clip(clip(poly, (p) => p[0] >= minX, minX), (p) => p[0] <= maxX, maxX);
}

/** 多角形の中のランダムな点 */
export function randomPointIn(rng: Rng, poly: Pt[]): Pt {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 0; i < 200; i++) {
    const p: Pt = [x0 + (x1 - x0) * rng(), y0 + (y1 - y0) * rng()];
    if (insidePolygon(p, poly)) return p;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
