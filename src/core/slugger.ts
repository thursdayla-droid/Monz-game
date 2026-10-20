import { mulberry32, type Rng } from './rng';

/**
 * ミニゲーム「MONZ SLUGGER」(企画者の指示 2026-10-20)。Phaserに依存しない。
 * エンドレスのバッティング。ピッチャーが自動で投げ、プレイヤーはミートカーソルを動かしてスイングする。
 *
 * プロ野球ゲームのような打ち方(企画者決定 2026-10-20):
 * - ゾーンの外に来る球(ボール球)もある。見送っても、ファウルでも、何も起きない
 * - 当たり所で打球が変わる。カーソルがボールより上だとゴロ、まん中だとライナー、下だとフライ。早く振ると引っぱり、遅いと流し打ち
 * - 打てば必ずヒットかホームラン(捕られてアウトはない。2026-10-20 企画者決定)。点数は飛距離の合計
 * - 空振りを3回したらゲームおしまい(2026-10-20 企画者決定。カウント・三振・フォアボールはなくした)
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
  /**
   * いちばん良いタイミング: ボールがホームに着く何秒前か(企画者の指示 2026-10-20「はやい」が多いので、少し早めに打てるように)。
   * 見た目では、ボールがカーソルに重なって見えるのが着くより少し前のため
   */
  idealBefore: 0.05,
  /** 早めにずれたときは、ずれをこの割合に小さく数える(早めには甘く) */
  earlyLenient: 0.7,
  /** タイミングが good より少しだけずれたらファウル(この幅まで) */
  foul: 0.07,
  /** 位置のずれ(ゾーンの半分を 1 とした長さ)。この中なら その判定。good の外は空振り */
  position: { perfect: 0.16, great: 0.3, good: 0.48 },
  /** ボールの当たり所(上下)で打球を分ける境目(カーソルの半径に対する割合) */
  contactSplit: 0.33,
  /** スイングを受けつける時間: ボールが着く何秒前から(これより早いと空振り) */
  swingEarly: 0.32,
  /** 空振りの回数でゲームおしまい */
  maxWhiffs: 3,
  /** 投げるまでの時間(構え→振りかぶり)と、打ったあとの間(秒) */
  windup: 1.0,
  afterPitch: 1.2,
  /** カーソルが動ける広さ(ボール球にも届く) */
  cursorLimit: 1.6,
  /** ボールがピッチャーの手を離れる所 */
  release: { x: 0.12, y: 0.75 },
} as const;

export type Grade = 'perfect' | 'great' | 'good' | 'miss';
export type PitchKind = 'straight' | 'curve' | 'slider' | 'drop';
export type Contact = 'grounder' | 'liner' | 'fly';
/**
 * 1球の結果。hit ヒット / homerun ホームラン / foul ファウル /
 * swingMiss 空振り / strikeTaken 見のがしストライク / ball ボール(見送り)
 */
export type Outcome = 'hit' | 'homerun' | 'foul' | 'swingMiss' | 'strikeTaken' | 'ball';

/**
 * 難しさ(ヒットの合計で決まる)。企画者の初期案(段の分け方):
 * 0〜9 遅いストレート / 10〜19 球速が上がる / 20〜29 コースが散らばる / 30〜49 変化球 / 50〜 速い球と変化球
 * flight: ボールが着くまでの秒数(短いほど速い)。spread: コースの広さ。breakChance: 変化球の割合。breakSize: 曲がる大きさ。
 * ballChance: ボール球の割合
 */
export interface Level {
  from: number;
  flight: [number, number];
  spread: number;
  breakChance: number;
  breakSize: number;
  ballChance: number;
}
export const SLUG_LEVELS: readonly Level[] = [
  { from: 0, flight: [1.35, 1.35], spread: 0.35, breakChance: 0, breakSize: 0, ballChance: 0.2 },
  { from: 10, flight: [1.35, 1.1], spread: 0.45, breakChance: 0, breakSize: 0, ballChance: 0.25 },
  { from: 20, flight: [1.1, 1.05], spread: 0.8, breakChance: 0, breakSize: 0, ballChance: 0.3 },
  { from: 30, flight: [1.05, 0.98], spread: 0.8, breakChance: 0.5, breakSize: 0.55, ballChance: 0.3 },
  { from: 50, flight: [0.95, 0.82], spread: 0.85, breakChance: 0.6, breakSize: 0.7, ballChance: 0.35 },
];

/** ヒットの合計に合う難しさ。ひとつの段の中でも、少しずつ速くなる(急に難しくならないように) */
export function levelFor(hits: number): Omit<Level, 'from' | 'flight'> & { flight: number } {
  let i = 0;
  while (i + 1 < SLUG_LEVELS.length && hits >= SLUG_LEVELS[i + 1].from) i++;
  const L = SLUG_LEVELS[i];
  const next = SLUG_LEVELS[i + 1];
  const span = next ? next.from - L.from : 30;
  const k = Math.min(1, (hits - L.from) / span);
  return { flight: L.flight[0] + (L.flight[1] - L.flight[0]) * k, spread: L.spread, breakChance: L.breakChance, breakSize: L.breakSize, ballChance: L.ballChance };
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

/** ストライクゾーンに入っているか(ボールの半分がかかればストライク) */
export const isStrike = (p: Pick<Pitch, 'tx' | 'ty'>): boolean => Math.abs(p.tx) <= 1.08 && Math.abs(p.ty) <= 1.08;

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
  outcome: Outcome;
  /** 打球の種類(バットに当たったときだけ) */
  contact?: Contact;
  /** タイミングのずれ(秒。- は早い、+ は遅い。早い方は earlyLenient をかけたもの) と 位置のずれ */
  timing: number;
  offset: number;
  /** 打球の飛んだ距離(m)。当たらなければ 0 */
  distance: number;
  homerun: boolean;
  /** その1球の点数 */
  points: number;
  /** 打球の方向(-1 左 〜 +1 右)。早いと引っぱり(左)、遅いと流し打ち(右) */
  dir: number;
}

export interface SluggerState {
  seed: number;
  rngState: number;
  score: number;
  hits: number;
  /** 連続ヒット(空振りで 0 に戻る。見送り・ファウルでは切れない)と その最高 */
  streak: number;
  bestStreak: number;
  perfects: number;
  homeruns: number;
  /** 飛距離の合計と最長 */
  totalDistance: number;
  longest: number;
  /** 空振りの回数(3回でおしまい) */
  whiffs: number;
  pitches: number;
  over: boolean;
}

export function newSlugger(seed: number): SluggerState {
  return {
    seed,
    rngState: seed >>> 0,
    score: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    perfects: 0,
    homeruns: 0,
    totalDistance: 0,
    longest: 0,
    whiffs: 0,
    pitches: 0,
    over: false,
  };
}

/** この試合の乱数(打球の結果などに使う。種から同じ結果になる) */
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
  const L = levelFor(s.hits);
  // 同じ段の中でも、少し速さにばらつきを持たせる(±4%)
  const flight = L.flight * range(rng, 0.96, 1.04);
  const ballChance = L.ballChance;
  let tx: number;
  let ty: number;
  if (rng() < ballChance) {
    // ボール球: ゾーンの少し外(横か縦にはずれる)
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.6) [tx, ty] = [side * range(rng, 1.2, 1.45), range(rng, -0.8, 0.8)];
    else [tx, ty] = [range(rng, -0.8, 0.8), side * range(rng, 1.2, 1.4)];
  } else {
    tx = range(rng, -L.spread, L.spread);
    ty = range(rng, -L.spread * 0.8, L.spread * 0.8);
  }
  let kind: PitchKind = 'straight';
  let bx = 0;
  let by = 0;
  if (rng() < L.breakChance) {
    const r = rng();
    kind = r < 0.4 ? 'curve' : r < 0.75 ? 'slider' : 'drop';
    const b = L.breakSize * range(rng, 0.7, 1);
    // カーブ: 横と下へ / スライダー: 横へ鋭く / フォーク: 下へ落ちる。曲がる向きは外へ
    const side = tx > 0 ? 1 : -1;
    if (kind === 'curve') [bx, by] = [side * b * 0.7, -b * 0.6];
    else if (kind === 'slider') [bx, by] = [side * b, 0];
    else [bx, by] = [0, -b];
  }
  return { kind, flight, tx, ty, bx, by };
}

/** 判定の段階(0 perfect / 1 great / 2 good / 3 はずれ) */
function step(v: number, w: { perfect: number; great: number; good: number }): number {
  const a = Math.abs(v);
  return a <= w.perfect ? 0 : a <= w.great ? 1 : a <= w.good ? 2 : 3;
}

/** 【仮】打球の飛距離(m)の範囲 */
const DISTANCE: Record<Contact, Record<Exclude<Grade, 'miss'>, [number, number]>> = {
  grounder: { perfect: [45, 70], great: [35, 55], good: [20, 40] },
  liner: { perfect: [95, 135], great: [70, 105], good: [50, 80] },
  fly: { perfect: [125, 165], great: [95, 130], good: [60, 95] },
};
/** この飛距離(m)より遠くへ飛んだらホームラン。点数は飛距離そのまま(企画者決定 2026-10-20) */
export const HOMERUN_MIN = 105;

/**
 * スイングの判定。swingAt: 手を離れてから何秒でスイングしたか(振らなかったら null)。cursor: ミートカーソルの位置
 */
export function judge(p: Pitch, swingAt: number | null, cursor: { x: number; y: number }, rng: Rng = Math.random): SwingResult {
  const none = (outcome: Outcome, timing: number, offset: number): SwingResult => ({ grade: 'miss', outcome, timing, offset, distance: 0, homerun: false, points: 0, dir: 0 });
  if (swingAt === null) return none(isStrike(p) ? 'strikeTaken' : 'ball', Infinity, Infinity);
  const raw = swingAt - (p.flight - SLUG.idealBefore);
  const timing = raw < 0 ? raw * SLUG.earlyLenient : raw;
  const offset = Math.hypot(cursor.x - p.tx, (cursor.y - p.ty) * 1.15);
  const pos = step(offset, SLUG.position);
  if (pos === 3) return none('swingMiss', timing, offset);
  const time = step(timing, SLUG.timing);
  if (time === 3) return none(Math.abs(timing) <= SLUG.timing.good + SLUG.foul ? 'foul' : 'swingMiss', timing, offset);
  const grade = (['perfect', 'great', 'good'] as const)[Math.max(pos, time)];
  // 当たり所: ボールがカーソルより上(カーソルが下) → フライ / 下(カーソルが上) → ゴロ
  const v = (p.ty - cursor.y) / SLUG.position.good;
  const contact: Contact = v > SLUG.contactSplit ? 'fly' : v < -SLUG.contactSplit ? 'grounder' : 'liner';
  const [d0, d1] = DISTANCE[contact][grade];
  const distance = Math.round(range(rng, d0, d1));
  const outcome: Outcome = distance >= HOMERUN_MIN ? 'homerun' : 'hit';
  const dir = Math.max(-1, Math.min(1, timing / SLUG.timing.good));
  return { grade, outcome, contact, timing, offset, distance, homerun: outcome === 'homerun', points: 0, dir };
}

export const isHit = (o: Outcome): boolean => o === 'hit' || o === 'homerun';

/** 判定を記録に足す(点数もここで決まる)。点数は飛距離の合計。空振り3回でゲームおしまい */
export function applyResult(s: SluggerState, r: SwingResult): SwingResult {
  s.pitches++;
  let points = 0;
  if (r.outcome === 'swingMiss') {
    s.whiffs++;
    s.streak = 0;
    if (s.whiffs >= SLUG.maxWhiffs) s.over = true;
  } else if (isHit(r.outcome)) {
    s.hits++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (r.grade === 'perfect') s.perfects++;
    if (r.homerun) s.homeruns++;
    s.totalDistance += r.distance;
    s.longest = Math.max(s.longest, r.distance);
    points = r.distance;
  }
  // 見送り(ストライク・ボール)とファウルは、何も起きない
  s.score += points;
  return { ...r, points };
}

/**
 * 着く所の目印を、ボールが着く何秒前から出すか(企画者の指示 2026-10-20)。
 * 最初の5球は投げる前から出す(Infinity)。そのあとは球数が進むほど短くして、最後は 0.3秒前。【仮】数字は調整前
 */
export const SLUG_MARKER = { easyPitches: 5, startLead: 1.1, endLead: 0.3, rampPitches: 40 } as const;
export function markerLead(pitchIndex: number): number {
  const M = SLUG_MARKER;
  if (pitchIndex < M.easyPitches) return Infinity;
  const k = Math.min(1, (pitchIndex - M.easyPitches) / M.rampPitches);
  return M.startLead + (M.endLead - M.startLead) * k;
}

/** スイングを受けつけるか(早すぎると空振り扱い)。t: 手を離れてからの秒数 */
export const canSwing = (p: Pitch, t: number): boolean => t >= p.flight - SLUG.swingEarly;
/** もう見送りが決まったか(ボールが通りすぎた) */
export const passed = (p: Pitch, t: number): boolean => t > p.flight - SLUG.idealBefore + SLUG.timing.good + SLUG.foul;

/**
 * 【仮】報酬(数字は未確定。企画者が決める)。ほかのミニゲームと大きくずれないよう、ヒットの数で決める。
 * いまは 5ヒットで1コイン、3ヒットで経験値1。
 */
export const SLUG_REWARD = { hitsPerCoin: 5, hitsPerExp: 3 } as const;
export const sluggerReward = (s: Pick<SluggerState, 'hits'>) => ({ coins: Math.floor(s.hits / SLUG_REWARD.hitsPerCoin), exp: Math.floor(s.hits / SLUG_REWARD.hitsPerExp) });
