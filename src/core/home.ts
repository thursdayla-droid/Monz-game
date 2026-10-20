import { pick, type Rng } from './rng';

/**
 * ホーム(育てる画面)の決まりごと。Phaserに依存しない。
 */

/** ホームの場所。企画者決定(2026-10-19): なにもない部屋・路地裏・ガレージからランダム */
export const HOME_PLACES = ['room', 'alley', 'garage'] as const;
export type HomePlace = (typeof HOME_PLACES)[number];

/** 企画者決定(2026-10-19): 場所はいちばん最初に1回だけランダムで決め、そのあとはずっと同じ場所 */
export function decideHomePlace(rng: Rng, saved?: string | null): HomePlace {
  return (HOME_PLACES as readonly string[]).includes(saved ?? '') ? (saved as HomePlace) : pick(rng, HOME_PLACES);
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
  shop: false,
  settings: true,
};

export type Pt = [number, number];

/**
 * 場所ごとの絵の大きさと、MONZが歩ける床の範囲(足元の位置。絵の座標)。
 * 床の範囲は、壁・家具・画面の下のボタンにかからないように決める。凸の多角形にする(まっすぐ歩いても外に出ない)。
 * 【仮】room は仮の絵(720x1280 をプログラムで描画)。企画者の絵が届いたら差しかえる。
 */
export interface HomeLayout {
  w: number;
  h: number;
  floor: Pt[];
}

export const HOME_LAYOUTS: Record<HomePlace, HomeLayout> = {
  // 企画者の路地裏の絵(1024x1536)。奥のゴミ箱・右の段ボールと木の板・左の壁をよける
  alley: { w: 1024, h: 1536, floor: [[120, 965], [815, 950], [985, 1035], [985, 1300], [60, 1300], [45, 1015]] },
  room: { w: 720, h: 1280, floor: [[90, 880], [630, 880], [670, 1085], [50, 1085]] },
  // 企画者のガレージの絵(1024x1536)。奥の棚・工具箱・作業台・右のタイヤとコーンの手前まで
  garage: { w: 1024, h: 1536, floor: [[110, 935], [880, 920], [985, 975], [985, 1300], [40, 1300], [40, 975]] },
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
