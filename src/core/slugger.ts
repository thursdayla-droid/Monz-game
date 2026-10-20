import { mulberry32, type Rng } from './rng';

/**
 * ミニゲーム「MONZ SLUGGER」(企画者の指示 2026-10-20)。Phaserに依存しない。
 * エンドレスのバッティング。ピッチャーが自動で投げ、プレイヤーはミートカーソルを動かしてスイングする。
 * 位置(カーソルとボールの着く所)とタイミング(スイングした時とボールが着く時)で判定する。3回ミスでゲームオーバー。
 *
 * 座標: ストライクゾーンのまん中が (0,0)。横 x は左が -、右が +。縦 y は下が -、上が +。ゾーンの端が ±1。
 * 奥行き z: 0 がホームベース(バッターの所)、1 がピッチャーの手。
 * 【仮】数字はすべて調整前。遊んで決める。
 */

const range = (rng: Rng, a: number, b: number) => a + (b - a) * rng();

/** 判定の幅など(調整用) */
export const SLUG = {
  /** タイミングのずれ(秒)。この中なら その判定 */
  timing: { perfect: 0.04, great: 0.075, good: 0.12 },
  /** 位置のずれ(ゾーンの半分を 1 とした長さ)。この中なら その判定 */
  position: { perfect: 0.16, great: 0.3, good: 0.48 },
  /** スイングを受けつける時間: ボールが着く何秒前から(これより早いと空振り)。着いたあとは good の幅まで */
  swingEarly: 0.25,
  /** ミスの回数でゲームオーバー */
  maxMiss: 3,
  /** 投げるまでの時間(構え→振りかぶり)と、打ったあとの間(秒) */
  windup: 1.0,
  afterPitch: 1.1,
  /** カーソルが動ける広さ */
  cursorLimit: 1.25,
  /** ボールがピッチャーの手を離れる所 */
  release: { x: 0.12, y: 0.75 },
} as const;

export type Grade = 'perfect' | 'great' | 'good' | 'miss';
export type PitchKind = 'straight' | 'curve' | 'slider' | 'drop';

/**
 * 難しさ(連続ヒット数で決まる)。企画者の初期案:
 * 0〜9 遅いストレート / 10〜19 球速が上がる / 20〜29 コースが散らばる / 30〜49 変化球 / 50〜 速い球と変化球
 * flight: ボールが着くまでの秒数(短いほど速い)。spread: コースの広さ。breakChance: 変化球の割合。breakSize: 曲がる大きさ
 */
export interface Level {
  from: number;
  flight: [number, number];
  spread: number;
  breakChance: number;
  breakSize: number;
}
export const SLUG_LEVELS: readonly Level[] = [
  { from: 0, flight: [1.35, 1.35], spread: 0.35, breakChance: 0, breakSize: 0 },
  { from: 10, flight: [1.35, 1.1], spread: 0.4, breakChance: 0, breakSize: 0 },
  { from: 20, flight: [1.1, 1.05], spread: 0.8, breakChance: 0, breakSize: 0 },
  { from: 30, flight: [1.05, 0.98], spread: 0.8, breakChance: 0.5, breakSize: 0.55 },
  { from: 50, flight: [0.95, 0.82], spread: 0.85, breakChance: 0.6, breakSize: 0.7 },
];

/** 連続ヒット数に合う難しさ。ひとつの段の中でも、少しずつ速くなる(急に難しくならないように) */
export function levelFor(streak: number): { flight: number; spread: number; breakChance: number; breakSize: number } {
  let i = 0;
  while (i + 1 < SLUG_LEVELS.length && streak >= SLUG_LEVELS[i + 1].from) i++;
  const L = SLUG_LEVELS[i];
  const next = SLUG_LEVELS[i + 1];
  const span = next ? next.from - L.from : 30;
  const k = Math.min(1, (streak - L.from) / span);
  return { flight: L.flight[0] + (L.flight[1] - L.flight[0]) * k, spread: L.spread, breakChance: L.breakChance, breakSize: L.breakSize };
}

export interface Pitch {
  kind: PitchKind;
  /** 手を離れてからホームベースに着くまでの秒数 */
  flight: number;
  /** ホームベースで着く所 */
  tx: number;
  ty: number;
  /** 曲がる量(着く所から見て、はじめはこれだけずれた所へ向かう) */
  bx: number;
  by: number;
}

/** ボールの位置。u: 0(手を離れた)〜1(ホームベース) */
export function ballAt(p: Pitch, u: number): { x: number; y: number; z: number } {
  const { x: sx, y: sy } = SLUG.release;
  // はじめは (着く所 - 曲がる量) へまっすぐ向かい、最後に曲がって着く所へ(u² で後半ほど大きく曲がる)
  const x = sx + (p.tx - p.bx - sx) * u + p.bx * u * u;
  const y = sy + (p.ty - p.by - sy) * u + p.by * u * u;
  return { x, y, z: 1 - u };
}

export interface SwingResult {
  grade: Grade;
  /** タイミングのずれ(秒。- は早い、+ は遅い) と 位置のずれ */
  timing: number;
  offset: number;
  /** 打球の飛んだ距離(m)。ミスは 0 */
  distance: number;
  homerun: boolean;
  /** その1球の点数 */
  points: number;
  /** 打球の方向(-1 左 〜 +1 右)。演出に使う */
  dir: number;
}

export interface SluggerState {
  seed: number;
  rngState: number;
  score: number;
  hits: number;
  /** 連続ヒット(ミスで 0 に戻る)と その最高 */
  streak: number;
  bestStreak: number;
  perfects: number;
  homeruns: number;
  /** 飛距離の合計と最長 */
  totalDistance: number;
  longest: number;
  misses: number;
  pitches: number;
  over: boolean;
}

export function newSlugger(seed: number): SluggerState {
  return { seed, rngState: seed >>> 0, score: 0, hits: 0, streak: 0, bestStreak: 0, perfects: 0, homeruns: 0, totalDistance: 0, longest: 0, misses: 0, pitches: 0, over: false };
}

/** この試合の乱数(打球の飛距離などに使う。種から同じ結果になる) */
export function rngOf(s: SluggerState): Rng {
  const r = mulberry32(s.rngState);
  return () => {
    const v = r();
    s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
    return v;
  };
}

/** 次の1球を決める */
export function nextPitch(s: SluggerState): Pitch {
  const rng = rngOf(s);
  const L = levelFor(s.streak);
  // 同じ段の中でも、少し速さにばらつきを持たせる(±4%)
  const flight = L.flight * range(rng, 0.96, 1.04);
  const tx = range(rng, -L.spread, L.spread);
  const ty = range(rng, -L.spread * 0.8, L.spread * 0.8);
  let kind: PitchKind = 'straight';
  let bx = 0;
  let by = 0;
  if (rng() < L.breakChance) {
    const r = rng();
    kind = r < 0.4 ? 'curve' : r < 0.75 ? 'slider' : 'drop';
    const b = L.breakSize * range(rng, 0.7, 1);
    // カーブ: 横と下へ / スライダー: 横へ鋭く / フォーク: 下へ落ちる。曲がる向きはゾーンのまん中の方へ(外へ逃げすぎない)
    const side = tx > 0 ? 1 : -1;
    if (kind === 'curve') [bx, by] = [side * b * 0.7, -b * 0.6];
    else if (kind === 'slider') [bx, by] = [side * b, 0];
    else [bx, by] = [0, -b];
  }
  return { kind, flight, tx, ty, bx, by };
}

/** 判定の段階(0 perfect / 1 great / 2 good / 3 miss) */
function step(v: number, w: { perfect: number; great: number; good: number }): number {
  const a = Math.abs(v);
  return a <= w.perfect ? 0 : a <= w.great ? 1 : a <= w.good ? 2 : 3;
}

/** 【仮】点数と飛距離の決め方 */
export const SLUG_SCORE = {
  points: { perfect: 500, great: 200, good: 100 },
  /** 飛距離(m)の範囲 */
  distance: { perfect: [130, 165], great: [95, 125], good: [45, 85] },
  homerunDistance: 100,
  homerunBonus: 300,
  /** 連続ヒットの倍率: 1 + 連続 × これ(上限 maxCombo まで) */
  comboRate: 0.05,
  maxCombo: 40,
} as const;

/**
 * スイングの判定。swingAt: 手を離れてから何秒でスイングしたか(しなかったら null)。cursor: ミートカーソルの位置
 */
export function judge(p: Pitch, swingAt: number | null, cursor: { x: number; y: number }, rng: Rng = Math.random): SwingResult {
  const miss = (timing: number, offset: number): SwingResult => ({ grade: 'miss', timing, offset, distance: 0, homerun: false, points: 0, dir: 0 });
  if (swingAt === null) return miss(Infinity, Infinity);
  const timing = swingAt - p.flight;
  const offset = Math.hypot(cursor.x - p.tx, (cursor.y - p.ty) * 1.15);
  const g = Math.max(step(timing, SLUG.timing), step(offset, SLUG.position));
  if (g === 3) return miss(timing, offset);
  const grade: Grade = (['perfect', 'great', 'good'] as const)[g];
  const [d0, d1] = SLUG_SCORE.distance[grade];
  const distance = Math.round(range(rng, d0, d1));
  const homerun = distance >= SLUG_SCORE.homerunDistance;
  // 早いと引っぱる(左)、遅いと流す(右)
  const dir = Math.max(-1, Math.min(1, timing / SLUG.timing.good));
  return { grade, timing, offset, distance, homerun, points: 0, dir };
}

/** 判定を記録に足す(点数もここで決まる)。ミスが上限になったらゲームオーバー */
export function applyResult(s: SluggerState, r: SwingResult): SwingResult {
  s.pitches++;
  if (r.grade === 'miss') {
    s.streak = 0;
    s.misses++;
    if (s.misses >= SLUG.maxMiss) s.over = true;
    return r;
  }
  s.hits++;
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  if (r.grade === 'perfect') s.perfects++;
  if (r.homerun) s.homeruns++;
  s.totalDistance += r.distance;
  s.longest = Math.max(s.longest, r.distance);
  const base = SLUG_SCORE.points[r.grade] + r.distance + (r.homerun ? SLUG_SCORE.homerunBonus : 0);
  const combo = 1 + Math.min(s.streak - 1, SLUG_SCORE.maxCombo) * SLUG_SCORE.comboRate;
  const points = Math.round(base * combo);
  s.score += points;
  return { ...r, points };
}

/** スイングを受けつけるか(早すぎると空振り扱い)。t: 手を離れてからの秒数 */
export const canSwing = (p: Pitch, t: number): boolean => t >= p.flight - SLUG.swingEarly;
/** もう見送りが決まったか(ボールが通りすぎた) */
export const passed = (p: Pitch, t: number): boolean => t > p.flight + SLUG.timing.good;

/**
 * 【仮】報酬(数字は未確定。企画者が決める)。ほかのミニゲームと大きくずれないよう、ヒットの数で決める。
 * いまは 5ヒットで1コイン、3ヒットで経験値1。
 */
export const SLUG_REWARD = { hitsPerCoin: 5, hitsPerExp: 3 } as const;
export const sluggerReward = (s: Pick<SluggerState, 'hits'>) => ({ coins: Math.floor(s.hits / SLUG_REWARD.hitsPerCoin), exp: Math.floor(s.hits / SLUG_REWARD.hitsPerExp) });
