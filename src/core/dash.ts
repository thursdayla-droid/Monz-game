import { mulberry32, range, type Rng } from './rng';

/**
 * ミニゲーム「DASH MONZ」の動き(企画者仕様 2026-10-20)。Phaserに依存しない。
 * - 自動で右へ進む。画面タップでジャンプ(いつも同じ高さ・空中ではジャンプできない)
 * - 足場から落ちたら(画面の下へ)ゲームオーバー。危険な物に当たってもゲームオーバー
 * - さわっても大丈夫な物(参考ゲームのナルトの代わり。【未確定】見た目・役割は企画者が決める)は、当たっても何も起きない
 * - 進むほど少しずつ速くなる。走った距離がスコア
 * 足場は少し先まで自動で並べる。速さに合わせて、かならず跳べば届く幅・高さにする(運だけで終わらないように)。
 * 並び方は種(seed)から決まるので、同じ種なら同じコースになる(将来のランキングの確認用)。
 */

/** 画面の座標(縦画面 720x1280)。キャラクターは左寄りに固定で、コースが流れてくる */
export const DASH = {
  runnerX: 190,
  runnerW: 70,
  runnerH: 80,
  gravity: 2700,
  // 2026-10-20 企画者の指示でジャンプを小さく(高さ約150px)
  jumpVelocity: 900,
  /** 足場から離れたあと、少しの間はまだジャンプできる(押し遅れのゆるし) */
  coyote: 0.08,
  // 2026-10-20 企画者の指示で少しゆっくりに
  startSpeed: 300,
  maxSpeed: 680,
  /** 1秒ごとに速くなる量 */
  accel: 5,
  /** これより下に落ちたらゲームオーバー */
  fallY: 1380,
  /** 足場の高さの範囲 */
  // 上り下りを大きく(2026-10-20 企画者の指示)
  minY: 440,
  maxY: 1080,
  /** 100px = 1m */
  pxPerMeter: 100,
  /** 【仮】足場の続きがマグマになる割合(足場1つごと) */
  magmaChance: 0.12,
} as const;

export interface Platform {
  x: number;
  w: number;
  y: number;
  /** マグマの足場(乗るとゲームオーバー。跳び越える)。2026-10-20 企画者の指示 */
  magma?: boolean;
}
export interface Thing {
  x: number;
  y: number;
  w: number;
  h: number;
  /** danger: 当たるとゲームオーバー / safe: 当たっても大丈夫 */
  kind: 'danger' | 'safe';
}

export interface DashState {
  seed: number;
  /** 進んだ距離(px) */
  dist: number;
  speed: number;
  /** キャラクターの足もとの高さと、縦の速さ(下が+) */
  y: number;
  vy: number;
  grounded: boolean;
  airTime: number;
  platforms: Platform[];
  things: Thing[];
  /** 次に足場を置く場所(コースの座標) */
  nextX: number;
  lastY: number;
  over: false | 'fall' | 'hit' | 'magma';
  rngState: number;
}

/** 空中にいられる時間(秒) */
export const airtime = (): number => (2 * DASH.jumpVelocity) / DASH.gravity;
/** ジャンプの高さ(px) */
export const jumpHeight = (): number => (DASH.jumpVelocity * DASH.jumpVelocity) / (2 * DASH.gravity);

function rngOf(s: DashState): Rng {
  const r = mulberry32(s.rngState);
  return () => {
    const v = r();
    s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
    return v;
  };
}

/** 新しいゲーム。最初は長い足場から始まる */
export function newDash(seed: number): DashState {
  const s: DashState = {
    seed,
    dist: 0,
    speed: DASH.startSpeed,
    y: 900,
    vy: 0,
    grounded: true,
    airTime: 0,
    platforms: [{ x: -400, w: 1500, y: 900 }],
    things: [],
    nextX: 1100,
    lastY: 900,
    over: false,
    rngState: seed >>> 0,
  };
  fill(s);
  return s;
}

/** コースを、画面の右の先まで作る */
function fill(s: DashState): void {
  const rng = rngOf(s);
  while (s.nextX < s.dist + 2400) {
    // この先を走るときの速さで、届くすき間を決める(余裕を持たせて最大の6割まで)
    const speed = Math.min(DASH.maxSpeed, s.speed + DASH.accel * ((s.nextX - s.dist) / s.speed));
    const reach = speed * airtime();
    const level = Math.min(1, s.dist / 60000);
    // 【仮】ときどき、足場の続きの1つがマグマになる(すき間なし・同じ高さ。跳べば越えられる幅)。前の足場がマグマなら続けない
    const prev = s.platforms[s.platforms.length - 1];
    if (s.nextX > 3000 && !prev?.magma && rng() < DASH.magmaChance) {
      const mw = range(rng, 0.4, 0.6) * reach;
      s.platforms.push({ x: s.nextX, w: mw, y: s.lastY, magma: true });
      s.nextX += mw;
      // マグマの次の足場: すき間なし・同じ高さ。トゲは置かない
      const nw = range(rng, 1.2, 2.0) * reach;
      s.platforms.push({ x: s.nextX, w: nw, y: s.lastY });
      s.nextX += nw;
      continue;
    }
    const gap = range(rng, 0.35, 0.55 + 0.2 * level) * reach;
    // 高さの差: 上は跳べる高さの7割まで、下は大きく降りることもある。上と下へ交互に行きやすくする
    const up = jumpHeight() * 0.7;
    const goUp = s.lastY > (DASH.minY + DASH.maxY) / 2 ? rng() < 0.7 : rng() < 0.35;
    let y = s.lastY + (goUp ? -range(rng, up * 0.4, up) : range(rng, 40, 300));
    y = Math.max(DASH.minY, Math.min(DASH.maxY, y));
    const x = s.nextX + gap;
    // 足場の上の危険な物。ジャンプで着地しそうな所(足場の始めのほう)と、終わりの近くには置かない。跳べば越えられる大きさ
    const drop = Math.max(0, y - s.lastY);
    const landing = reach * (1.15 + (drop / jumpHeight()) * 0.5);
    // トゲを置く足場は、跳び越えたあと同じ足場に着地できる長さにする(2026-10-20 トゲが出ないことがあったため)
    const spike = rng() < 0.45 + 0.3 * level;
    let w = range(rng, 0.9, 2.4 - 1.0 * level) * reach;
    if (spike) w = Math.max(w, landing + reach * range(rng, 1.4, 1.9));
    s.platforms.push({ x, w, y });
    if (spike) {
      const hx = x + range(rng, landing, w - reach * 1.15);
      s.things.push({ x: hx, y: y - 56, w: 54, h: 56, kind: 'danger' });
    }
    // さわっても大丈夫な物(星)は 2026-10-20 企画者の指示で廃止(まぎらわしいため)
    s.nextX = x + w;
    s.lastY = y;
  }
  // 通りすぎたものは片付ける
  s.platforms = s.platforms.filter((p) => p.x + p.w > s.dist - 400);
  s.things = s.things.filter((t) => t.x + t.w > s.dist - 400);
}

/** タップ: 足場の上(か、離れた直後)ならジャンプ */
export function jump(s: DashState): boolean {
  if (s.over || !(s.grounded || s.airTime < DASH.coyote) || s.vy < 0) return false;
  s.vy = -DASH.jumpVelocity;
  s.grounded = false;
  s.airTime = DASH.coyote;
  return true;
}

/** キャラクターの足もとのコース上の x */
const footX = (s: DashState) => s.dist + DASH.runnerX;

/** dt 秒すすめる */
export function step(s: DashState, dt: number): void {
  if (s.over) return;
  s.speed = Math.min(DASH.maxSpeed, s.speed + DASH.accel * dt);
  s.dist += s.speed * dt;
  const prevY = s.y;
  s.vy += DASH.gravity * dt;
  s.y += s.vy * dt;
  // 着地(上から足場の面を通りすぎたとき)
  const fx = footX(s);
  const half = DASH.runnerW / 2;
  const under = s.platforms.find((p) => fx + half > p.x && fx - half < p.x + p.w && prevY <= p.y + 1 && s.y >= p.y);
  if (under && s.vy >= 0) {
    // マグマ: 足もとのまん中がマグマの上に来たらゲームオーバー
    const onMagma = s.platforms.find((p) => p.magma && fx > p.x + 8 && fx < p.x + p.w - 8 && Math.abs(p.y - under.y) < 1);
    if (onMagma) {
      s.over = 'magma';
      return;
    }
    s.y = under.y;
    s.vy = 0;
    s.grounded = true;
    s.airTime = 0;
  } else {
    s.grounded = false;
    s.airTime += dt;
  }
  // 足場の横の壁にぶつかったら落ちる(足場の面より下にいて、足場に入りこんだとき)
  const wall = s.platforms.find((p) => fx + half > p.x && fx - half < p.x && s.y > p.y + 4);
  if (wall && !s.grounded) s.vy = Math.max(s.vy, 0);
  // 危険な物
  const top = s.y - DASH.runnerH;
  for (const t of s.things) {
    if (t.kind !== 'danger') continue;
    const tl = t.x + 6;
    const tr = t.x + t.w - 6;
    if (fx + half - 8 > tl && fx - half + 8 < tr && s.y - 4 > t.y && top < t.y + t.h) {
      s.over = 'hit';
      return;
    }
  }
  if (s.y > DASH.fallY) {
    s.over = 'fall';
    return;
  }
  fill(s);
}

/** 走った距離(m) */
export const meters = (s: DashState): number => Math.floor(s.dist / DASH.pxPerMeter);

/** 報酬(企画者決定 2026-10-20: 100mで1コイン。EXPはMONZ CARDと同じくらいになるよう80mで1) */
export const DASH_REWARD = { metersPerCoin: 100, metersPerExp: 80 } as const;
export const dashReward = (m: number) => ({ coins: Math.floor(m / DASH_REWARD.metersPerCoin), exp: Math.floor(m / DASH_REWARD.metersPerExp) });
