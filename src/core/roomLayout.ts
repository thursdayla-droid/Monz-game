import { furniture, KIND_RULES } from './furniture';
import { insidePolygon, type Pt } from './home';

/**
 * 部屋に家具を置くときの決まり(企画者決定 2026-10-21)。Phaserに依存しない。座標はお世話画面の画面の座標。
 * - 家具どうしは重ねて置けない(カーペットもふくむ)
 * - 家具は床の上だけ
 * - MONZの通り道をふさぐ置き方はできない(床が2つ以上に分かれてしまう置き方)
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 置いた家具1つ(画面の座標)。persp: 奥行きによる大きさ(手前=1)。turn: 縦向き */
export interface FloorItem {
  item: string;
  x: number;
  y: number;
  persp: number;
  turn?: boolean;
}

/**
 * 【仮】縦向き(頭が奥・足が手前)に置いたときの、横はば(横向きのときの横はばの何倍か)。
 * 企画者の指示(2026-10-21): 左右の壁ぎわにも置きたい → 縦向きの絵を使う(タイルの線に合わせてかたむける)
 */
export const TURN_WIDTH = 0.62;
/** 【仮】縦向きの絵の上下の大きさ(企画者の指示 2026-10-22: 上下は気持ち小さく) */
export const TURN_HEIGHT = 0.88;

/** MONZの体の半分くらい。家具と家具、家具と壁のあいだは、この2倍あけないと通れない */
export const PASS_CLEARANCE = 34;

/** 床の上で占める範囲(足元 x, y が手前のまん中) */
export function footRect(f: FloorItem): Rect {
  const kind = furniture(f.item)?.kind ?? 'toy';
  const r = KIND_RULES[kind];
  const w = r.width * f.persp * 0.92;
  const d = r.width * f.persp * r.depth;
  if (f.turn) {
    // 縦向き: はばはせまく、奥へ長い(足元 x, y は手前のまん中)
    const tw = w * TURN_WIDTH;
    return { x0: f.x - tw / 2, x1: f.x + tw / 2, y0: f.y - r.width * f.persp * TURN_WIDTH * 0.95 * TURN_HEIGHT, y1: f.y };
  }
  return { x0: f.x - w / 2, x1: f.x + w / 2, y0: f.y - d, y1: f.y };
}

export const isWalkable = (item: string) => KIND_RULES[furniture(item)?.kind ?? 'toy'].walkable;

export const rectsOverlap = (a: Rect, b: Rect, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;

export const inRect = ([x, y]: Pt, r: Rect, mx = 0, my = mx) => x > r.x0 - mx && x < r.x1 + mx && y > r.y0 - my && y < r.y1 + my;

/** 床が1つにつながったままか(通れない小さなすきまは数えない) */
export function floorConnected(floor: Pt[], blocks: Rect[], cell = 20): boolean {
  if (!blocks.length) return true;
  const xs = floor.map((p) => p[0]);
  const ys = floor.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const cols = Math.ceil((Math.max(...xs) - x0) / cell);
  const rows = Math.ceil((Math.max(...ys) - y0) / cell);
  const free: boolean[] = [];
  let total = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p: Pt = [x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell];
      const ok = insidePolygon(p, floor) && !blocks.some((b) => inRect(p, b, PASS_CLEARANCE, PASS_CLEARANCE * 0.4));
      free.push(ok);
      if (ok) total++;
    }
  const start = free.indexOf(true);
  if (start < 0) return false;
  const seen = new Uint8Array(free.length);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr;
      const cc = c + dc;
      const j = rr * cols + cc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || seen[j] || !free[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  // 床の端の小さなすきま(家具と壁のあいだなど)は、つながっていなくてもよい
  return count >= total * 0.95;
}

/** その家具を、その場所に置けるか。others: ほかに置いてある家具。walkFloor: MONZが歩ける床(通り道を調べる。なければ floor) */
export function canPlace(f: FloorItem, others: FloorItem[], floor: Pt[], walkFloor = floor): boolean {
  const r = footRect(f);
  // 床からはみ出していないかは、左右を少し内側で見る(壁にぴったり寄せられるように。絵の角が壁に少しかかるのは自然に見える)
  const ix = (r.x1 - r.x0) * 0.12;
  const corners: Pt[] = [[r.x0 + ix, r.y0], [r.x1 - ix, r.y0], [r.x0 + ix, r.y1], [r.x1 - ix, r.y1]];
  if (!corners.every((p) => insidePolygon(p, floor))) return false;
  if (others.some((o) => rectsOverlap(r, footRect(o)))) return false;
  const blocks = [f, ...others].filter((o) => !isWalkable(o.item)).map(footRect);
  return floorConnected(walkFloor, blocks);
}
