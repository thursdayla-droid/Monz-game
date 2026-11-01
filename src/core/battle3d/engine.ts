/**
 * 3Dオートバトル(企画者 BATTLE SYSTEM Ver.41・2026-10-31)の計算。Phaser・Three.js に依存しない。
 * - 床(X/Z)の上を360度うごき、ジャンプ(Y)もする。MONZ が自分で 近づく・下がる・回り込む・攻撃・ガード・回避を決める
 * - AIは行動に点数をつけてえらぶ(LLMは使わない)。AI習熟度5種(Attack・Defense・Evasion・Counter・Spacing)で判断の精度が変わる
 * - プレイヤーは 攻めろ・守れ・避けろ・今だ の4つの指示だけ(800msの予約・1件・置きかえ・実行でクールダウン)
 * - ジャストガード(PERFECT・GOOD・先読み)、息切れ、最大5ヒットのコンボ、KO
 * 数字は config.ts。乱数は種(seed)から決まるので、同じ種と同じ指示なら同じ試合になる。
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import type { Instinct } from '../autobattle/config';
import { B3, type MoveName, type OrderName, type Proficiency } from './config';

export type Side = 0 | 1;

/** 戦いに出る1体の元 */
export interface B3Entrant {
  name: string;
  species: string;
  stats: StatBlock;
  /** 本能(10/30 の仕組みを残す。企画者 2026-11-01) */
  instinct: Instinct;
  /** AI習熟度 Lv.1〜5 */
  proficiency: Proficiency;
}

/** 今していること */
export type B3Act =
  | { k: 'free' }
  | { k: 'attack'; move: MoveName; t: number; id: number; dir: number; hit: boolean; done: boolean; extra: number }
  | { k: 'guard'; t: number; until: number; pre: boolean }
  | { k: 'evade'; t: number; dx: number; dz: number }
  /** 踏みこみ・バックステップ(格闘ゲームの動き。2026-11-01 企画者「もっと格闘ゲームぽく」) */
  | { k: 'step'; t: number; dx: number; dz: number; dur: number; dist: number; back: boolean }
  | { k: 'stun'; t: number; until: number }
  | { k: 'air'; t: number }
  | { k: 'down'; t: number; until: number }
  | { k: 'ko'; t: number }
  | { k: 'victory'; t: number };

export type MovePlan = 'approach' | 'retreat' | 'circleL' | 'circleR' | 'hold';

/** 予約中の指示(1件だけ) */
export interface Reservation {
  order: OrderName;
  at: number;
  until: number;
}

export interface B3Fighter {
  side: Side;
  name: string;
  species: string;
  stats: StatBlock;
  instinct: Instinct;
  prof: Proficiency;
  /** 技の枠(4つ。AIが自動で付ける) */
  skills: MoveName[];
  x: number;
  z: number;
  y: number;
  vy: number;
  /** 向き(ラジアン。X軸から Z軸へ) */
  face: number;
  hp: number;
  maxHp: number;
  stamina: number;
  /** 息切れ中 */
  exhausted: boolean;
  act: B3Act;
  plan: MovePlan;
  planT: number;
  thinkT: number;
  /** 今のコンボで受けたヒット数と、ひるみが終わった時刻 */
  combo: number;
  comboEnd: number;
  /** ジャストガードのあとの反撃機会の終わり */
  counterUntil: number;
  /** 「攻めろ！」の効いている時間の終わり */
  boostUntil: number;
  reserve: Reservation | null;
  /** 指示ごとの、次に使える時刻 */
  cooldown: Record<OrderName, number>;
  /** 相手の攻撃への反応の予定(反応した攻撃の番号) */
  react: { at: number; kind: 'guard' | 'evade'; until: number } | null;
  seenAttack: number;
  /** 今のフレームで歩いた速さ(見た目用) */
  speed: number;
  /** 吹っ飛びの速さ(床の上をすべる) */
  kvx: number;
  kvz: number;
  /** 最後に受けた攻撃(見た目のやられ方用) */
  lastHit: MoveName | null;
}

export type GuardGrade = 'perfect' | 'good' | 'pre' | 'guard';

export type B3Event =
  | { kind: 'windup'; side: Side; move: MoveName }
  | { kind: 'hit'; side: Side; target: Side; damage: number; combo: number; move: MoveName; x: number; y: number; z: number }
  | { kind: 'block'; side: Side; target: Side; damage: number; grade: GuardGrade; x: number; y: number; z: number }
  | { kind: 'fifth'; side: Side; target: Side }
  | { kind: 'whiff'; side: Side }
  | { kind: 'dodged'; side: Side }
  | { kind: 'counter'; side: Side }
  | { kind: 'jump'; side: Side }
  | { kind: 'step'; side: Side; back: boolean }
  | { kind: 'land'; side: Side; hard: boolean }
  | { kind: 'exhausted'; side: Side }
  | { kind: 'order'; side: Side; order: OrderName; state: 'reserved' | 'replaced' | 'expired' | 'executed' }
  | { kind: 'ko'; side: Side }
  | { kind: 'victory'; side: Side }
  | { kind: 'timeUp' };

export interface B3Battle {
  f: [B3Fighter, B3Fighter];
  t: number;
  rng: Rng;
  winner: Side | 'draw' | null;
  koAt: number | null;
  attackSeq: number;
  /** その回の step で起きたこと(画面の演出用) */
  events: B3Event[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: readonly number[], p: number) => a[0] + (a[1] - a[0]) * p;
/** 習熟度 Lv.1〜5 → 0〜1 */
const lv = (f: B3Fighter, k: keyof Proficiency) => clamp((f.prof[k] - 1) / 4, 0, 1);
const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const other = (b: B3Battle, f: B3Fighter) => b.f[f.side === 0 ? 1 : 0];
const dist = (a: B3Fighter, c: B3Fighter) => Math.hypot(c.x - a.x, c.z - a.z);
const angleTo = (a: B3Fighter, c: B3Fighter) => Math.atan2(c.z - a.z, c.x - a.x);
/** 正規分布っぽい乱数(-1〜1 の山) */
const wobble = (rng: Rng) => (rng() + rng() + rng() - 1.5) / 1.5;

/** 技の、とどく距離(中心どうし) */
export const effectiveReach = (m: MoveName) => B3.moves[m].reach + B3.moves[m].dash + B3.body.radius;

/** 【仮】本能で技の枠を4つえらぶ(今は候補が4つなので全部。並びだけ本能で変わる) */
export function chooseSkills(instinct: Instinct): MoveName[] {
  const score: Record<string, number> = { upper: instinct.counter + instinct.attack * 0.5, smash: instinct.fight, rush: instinct.attack, spin: instinct.defense + instinct.survival * 0.5 };
  return [...B3.skillPool].sort((a, b) => score[b] - score[a]).slice(0, 4);
}

function newFighter(e: B3Entrant, side: Side): B3Fighter {
  const maxHp = Math.round(B3.stat.hpBase + e.stats.hp * B3.stat.perHp);
  const x = side === 0 ? -3 : 3;
  return {
    side,
    name: e.name,
    species: e.species,
    stats: e.stats,
    instinct: e.instinct,
    prof: e.proficiency,
    skills: chooseSkills(e.instinct),
    x,
    z: side === 0 ? 1 : -1,
    y: 0,
    vy: 0,
    face: side === 0 ? 0 : Math.PI,
    hp: maxHp,
    maxHp,
    stamina: B3.stamina.max,
    exhausted: false,
    act: { k: 'free' },
    plan: 'hold',
    planT: 0,
    thinkT: 0.4,
    combo: 0,
    comboEnd: -9,
    counterUntil: -9,
    boostUntil: -9,
    reserve: null,
    cooldown: { attack: 0, defend: 0, evade: 0, now: 0 },
    react: null,
    seenAttack: 0,
    speed: 0,
    kvx: 0,
    kvz: 0,
    lastHit: null,
  };
}

export function newB3Battle(a: B3Entrant, c: B3Entrant, seed: number): B3Battle {
  const rng = mulberry32(seed);
  const f: [B3Fighter, B3Fighter] = [newFighter(a, 0), newFighter(c, 1)];
  for (const x of f) x.thinkT = 0.3 + rng() * 0.3;
  return { f, t: 0, rng, winner: null, koAt: null, attackSeq: 0, events: [] };
}

// ---------------- プレイヤーの指示 ----------------

/** 指示ボタンの今の状態(画面用) */
export function orderState(b: B3Battle, side: Side, o: OrderName): 'ready' | 'reserved' | 'cooldown' {
  const f = b.f[side];
  if (f.reserve?.order === o) return 'reserved';
  return f.cooldown[o] > b.t ? 'cooldown' : 'ready';
}

/**
 * 指示を予約する【確定】: 1件だけ・別の指示で置きかえ・同じ指示の連打では延長しない・クールダウン中は出せない。
 * 予約は 800ms で失効。実行した時にクールダウンが始まる(失効・置きかえでは始まらない)
 */
export function giveOrder(b: B3Battle, side: Side, o: OrderName): boolean {
  const f = b.f[side];
  if (b.winner !== null || f.act.k === 'ko') return false;
  if (f.cooldown[o] > b.t) return false;
  if (f.reserve?.order === o) return false;
  if (f.reserve) b.events.push({ kind: 'order', side, order: f.reserve.order, state: 'replaced' });
  f.reserve = { order: o, at: b.t, until: b.t + B3.orders.reserve };
  b.events.push({ kind: 'order', side, order: o, state: 'reserved' });
  return true;
}

/** 予約した指示を、動けるときに実行する */
function runOrder(b: B3Battle, f: B3Fighter): void {
  const r = f.reserve;
  if (!r) return;
  // 硬直中・空中は待つ(動けるようになってから実行。800ms をこえたら失効)
  if (f.act.k !== 'free' || f.y > 0) return;
  const o = other(b, f);
  const d = dist(f, o);
  if (r.order === 'attack') {
    f.boostUntil = b.t + B3.orders.attackBoost;
    const m = bestAttack(b, f, d, true);
    if (m) startAttack(b, f, m);
    else setPlan(f, 'approach');
  } else if (r.order === 'defend') {
    startGuard(f, B3.orders.defendHold);
  } else if (r.order === 'evade') {
    startEvade(b, f);
  } else {
    // 今だ！: 反撃機会なら反撃。相手のすきなら大きく攻撃。それ以外は強い攻撃
    if (b.t <= f.counterUntil && !f.exhausted) startAttack(b, f, 'counter');
    else {
      const m = bestAttack(b, f, d, true, true);
      if (m) startAttack(b, f, m);
      else startAttack(b, f, f.skills.includes('rush') ? 'rush' : 'straight');
    }
  }
  f.reserve = null;
  f.cooldown[r.order] = b.t + B3.orders.cooldown[r.order];
  b.events.push({ kind: 'order', side: f.side, order: r.order, state: 'executed' });
}

// ---------------- 行動を始める ----------------

function useStamina(b: B3Battle, f: B3Fighter, n: number): void {
  f.stamina -= n;
  if (f.stamina <= 0) {
    f.stamina = 0;
    if (!f.exhausted) {
      f.exhausted = true;
      b.events.push({ kind: 'exhausted', side: f.side });
    }
  }
}

function setPlan(f: B3Fighter, p: MovePlan): void {
  if (f.plan !== p) f.planT = 0;
  f.plan = p;
}

function startAttack(b: B3Battle, f: B3Fighter, m: MoveName): void {
  const o = other(b, f);
  // 攻撃の前に相手のほうを向く(習熟度が低いと少しずれる)。ためが始まったら向きは変えない【確定】
  const err = wobble(b.rng) * (1 - lv(f, 'attack')) * 0.25;
  f.face = angleTo(f, o) + err;
  b.attackSeq++;
  // 相手が、この攻撃が始まる前からガードしていた → 先読み(PRE_INPUT。PERFECT 扱いしない)【確定】
  if (o.act.k === 'guard') o.act.pre = true;
  f.act = { k: 'attack', move: m, t: 0, id: b.attackSeq, dir: f.face, hit: false, done: false, extra: 0 };
  useStamina(b, f, B3.moves[m].stamina);
  if (m === 'counter') b.events.push({ kind: 'counter', side: f.side });
  b.events.push({ kind: 'windup', side: f.side, move: m });
}

function startStep(b: B3Battle, f: B3Fighter, back: boolean): void {
  const o = other(b, f);
  const a = angleTo(f, o) + (back ? Math.PI : 0) + wobble(b.rng) * 0.25;
  const st = back ? B3.spacing.backdash : B3.spacing.dash;
  f.act = { k: 'step', t: 0, dx: Math.cos(a), dz: Math.sin(a), dur: st.time, dist: st.dist, back };
  useStamina(b, f, st.stamina);
  b.events.push({ kind: 'step', side: f.side, back });
}

function startGuard(f: B3Fighter, until: number, pre = false): void {
  f.act = { k: 'guard', t: 0, until, pre };
}

function startEvade(b: B3Battle, f: B3Fighter): void {
  const o = other(b, f);
  const a = angleTo(f, o);
  // 相手に対して横へ。壁に近いほうは選ばない
  let side = b.rng() < 0.5 ? 1 : -1;
  const test = (s: number) => {
    const x = f.x + Math.cos(a + (s * Math.PI) / 2) * B3.evade.distance;
    const z = f.z + Math.sin(a + (s * Math.PI) / 2) * B3.evade.distance;
    return Math.max(Math.abs(x), Math.abs(z));
  };
  if (test(side) > B3.arena.half - 0.8 && test(-side) < test(side)) side = -side;
  const dir = a + (side * Math.PI) / 2;
  f.act = { k: 'evade', t: 0, dx: Math.cos(dir), dz: Math.sin(dir) };
  useStamina(b, f, B3.evade.stamina);
}

/** 相手がすきだらけ(攻撃のあと・ひるみ・空中・起き上がり) */
function opponentOpen(o: B3Fighter): boolean {
  if (o.act.k === 'attack') return o.act.t > B3.moves[o.act.move].windup + B3.moves[o.act.move].active;
  return o.act.k === 'stun' || o.act.k === 'air';
}

/** 今の距離で出せる技をえらぶ(なければ null) */
function bestAttack(b: B3Battle, f: B3Fighter, d: number, eager: boolean, big = false): MoveName | null {
  const o = other(b, f);
  const pool: MoveName[] = ['jab', 'straight', 'kick', ...f.skills];
  const weights: number[] = [];
  const bad = lerp(B3.skill.badRange, lv(f, 'attack'));
  for (const m of pool) {
    const mv = B3.moves[m];
    let w = 0;
    const reach = effectiveReach(m);
    const ok = d <= reach - 0.1 || (b.rng() < bad && d <= reach + 0.9);
    if (ok && (f.stamina >= mv.stamina || f.exhausted)) {
      w = m === 'jab' ? 0.55 : m === 'straight' ? 0.45 : m === 'kick' ? 0.4 : m === 'smash' ? 0.3 * (0.5 + f.instinct.fight) : m === 'upper' ? 0.32 * (0.5 + f.instinct.counter) : 0.3;
      if (f.exhausted && mv.stamina > 8) w *= 0.3;
      if (big && mv.power >= 9) w *= 3;
      if (opponentOpen(o) && mv.power >= 9) w *= 1 + lv(f, 'attack') * 2;
      if (o.act.k === 'guard') w *= m === 'smash' ? 0.8 : 0.4;
      if (eager) w *= 1.2;
    }
    weights.push(w);
  }
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;
  let r = b.rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[0];
}

// ---------------- AI ----------------

/** 相手の攻撃が始まったのを見て、ガードか回避を予定する(習熟度で反応の確率と時間のずれが変わる) */
function watchAttack(b: B3Battle, f: B3Fighter, o: B3Fighter): void {
  if (o.act.k !== 'attack' || o.act.id === f.seenAttack) return;
  f.seenAttack = o.act.id;
  if (f.side === 0 && f.reserve) return; // 指示を待っているあいだは、指示を優先
  const mv = B3.moves[o.act.move];
  const d = dist(f, o);
  if (d > effectiveReach(o.act.move) + 1.2) return;
  const wantEvade = f.instinct.survival * (0.5 + lv(f, 'evasion')) + (f.exhausted ? 0.4 : 0);
  const wantGuard = f.instinct.defense * (0.5 + lv(f, 'defense'));
  const useEvade = !f.exhausted && f.stamina >= B3.evade.stamina && b.rng() < wantEvade / (wantEvade + wantGuard + 0.01);
  const p = lerp(B3.skill.react, lv(f, useEvade ? 'evasion' : 'defense')) * (0.6 + 0.4 * (useEvade ? f.instinct.survival : f.instinct.defense) + 0.2);
  if (b.rng() > p) return;
  const hitAt = b.t + (mv.windup - o.act.t);
  const err = wobble(b.rng) * lerp(B3.skill.timingError, lv(f, useEvade ? 'evasion' : 'defense'));
  // ガードは当たる少し前(PERFECT をねらう)、回避は無敵の時間が当たる時にかかるように
  const at = useEvade ? hitAt - 0.1 + err : hitAt - 0.05 + err;
  f.react = { at: Math.max(b.t + 0.05, at), kind: useEvade ? 'evade' : 'guard', until: hitAt + mv.active + 0.15 };
}

function think(b: B3Battle, f: B3Fighter): void {
  const o = other(b, f);
  const d = dist(f, o);
  const boosted = b.t < f.boostUntil;
  // ジャストガードのあとの反撃(習熟度 Counter)
  if (b.t <= f.counterUntil && !f.exhausted && b.rng() < lerp(B3.skill.punish, lv(f, 'counter')) * (0.6 + f.instinct.counter * 0.6)) {
    startAttack(b, f, 'counter');
    return;
  }
  // コンボの続き: 相手がひるんでいるうちに次を当てる(習熟度 Attack)
  if (o.act.k === 'stun' && o.combo < B3.combo.max && b.rng() < lerp(B3.skill.chain, lv(f, 'attack')) * (0.6 + f.instinct.attack * 0.6)) {
    const m = bestAttack(b, f, d, true);
    if (m) return startAttack(b, f, m);
  }
  // 打ち上げた相手を、ジャンプして追いかける(空中の追撃)
  if (o.act.k === 'air' && o.y > 0.5 && d < 2.4 && f.stamina >= B3.moves.aerial.stamina && b.rng() < 0.4 + lv(f, 'attack') * 0.5) {
    f.vy = B3.jump.speed;
    f.y = 0.001;
    useStamina(b, f, B3.jump.stamina);
    b.events.push({ kind: 'jump', side: f.side });
    startAttack(b, f, 'aerial');
    return;
  }
  // 相手のすきに反撃(習熟度 Counter)
  if (opponentOpen(o) && d < 2.2 && b.rng() < lerp(B3.skill.punish, lv(f, 'counter')) * (0.5 + f.instinct.counter)) {
    const m = bestAttack(b, f, d, true, true);
    if (m) return startAttack(b, f, m);
  }
  // 攻撃するか
  const pAtk = (0.38 + 0.4 * f.instinct.attack) * (boosted ? 2 : 1) * (f.exhausted ? 0.4 : 1);
  if (b.rng() < pAtk) {
    const m = bestAttack(b, f, d, boosted);
    if (m) return startAttack(b, f, m);
  }
  // ときどきジャンプ(フェイント)
  if (b.rng() < 0.025 && d < 3 && f.stamina > 30) {
    f.vy = B3.jump.speed * 0.8;
    f.y = 0.001;
    useStamina(b, f, B3.jump.stamina);
    b.events.push({ kind: 'jump', side: f.side });
    return;
  }
  // 踏みこみ・バックステップ(間合いの出入り)
  const ideal0 = B3.spacing.ideal - f.instinct.attack * 0.3;
  if (f.stamina > 20 && b.rng() < B3.spacing.stepChance * (0.5 + lv(f, 'spacing'))) {
    if (d > ideal0 + 0.9) return startStep(b, f, false);
    if (d < ideal0 - 0.2 && b.rng() < 0.5 + f.instinct.survival * 0.5) return startStep(b, f, true);
  }
  if (f.planT < B3.moveHold && f.plan !== 'hold') return;
  // 動き方(習熟度 Spacing): ちょうどよい間合いを保つ・回り込む・壁をよける
  const ideal = ideal0 + (f.hp / f.maxHp < 0.3 ? f.instinct.survival * 1.2 : 0);
  const circle = lerp(B3.skill.circle, lv(f, 'spacing'));
  const r = b.rng();
  let p: MovePlan;
  if (boosted) p = 'approach';
  else if (d > ideal + 0.5) p = r < circle * 0.5 ? (b.rng() < 0.5 ? 'circleL' : 'circleR') : 'approach';
  else if (d < ideal - 0.45) p = r < circle ? (b.rng() < 0.5 ? 'circleL' : 'circleR') : 'retreat';
  else p = r < circle ? (b.rng() < 0.5 ? 'circleL' : 'circleR') : r < circle + 0.3 ? 'hold' : 'approach';
  setPlan(f, p);
}

/** 移動の方針 → 歩く向き */
function walk(b: B3Battle, f: B3Fighter, dt: number): void {
  const o = other(b, f);
  const a = angleTo(f, o);
  const d = dist(f, o);
  let vx = 0;
  let vz = 0;
  if (f.plan === 'approach') [vx, vz] = [Math.cos(a), Math.sin(a)];
  else if (f.plan === 'retreat') [vx, vz] = [-Math.cos(a), -Math.sin(a)];
  else if (f.plan === 'circleL' || f.plan === 'circleR') {
    const s = f.plan === 'circleL' ? 1 : -1;
    const keep = clamp((d - 1.8) * 0.6, -0.5, 0.5);
    vx = Math.cos(a + (s * Math.PI) / 2) + Math.cos(a) * keep;
    vz = Math.sin(a + (s * Math.PI) / 2) + Math.sin(a) * keep;
  }
  // 壁をよける: 壁に近いと、壁へ向かう分をけずって中心へ寄せる(気づく距離は習熟度 Spacing)
  const sense = lerp(B3.skill.wallSense, lv(f, 'spacing'));
  const H = B3.arena.half - B3.body.radius;
  for (const axis of ['x', 'z'] as const) {
    const pos = f[axis];
    const v = axis === 'x' ? vx : vz;
    const room = H - Math.abs(pos);
    if (room < sense && Math.sign(v) === Math.sign(pos)) {
      const k = clamp(room / sense, 0, 1);
      if (axis === 'x') vx = v * k - Math.sign(pos) * (1 - k) * 0.6;
      else vz = v * k - Math.sign(pos) * (1 - k) * 0.6;
      // 下がりたいのに壁 → 回り込みに変える
      if (f.plan === 'retreat' && room < sense * 0.5) setPlan(f, b.rng() < 0.5 ? 'circleL' : 'circleR');
    }
  }
  const len = Math.hypot(vx, vz);
  const sp = (B3.stat.walkBase + f.stats.speed * B3.stat.walkPerSpeed) * (f.exhausted ? B3.stamina.exhaustedSlow : 1) * (b.t < f.boostUntil ? 1.15 : 1) * (f.plan === 'retreat' ? 0.8 : 1);
  if (len > 0.01) {
    f.x += (vx / len) * sp * dt;
    f.z += (vz / len) * sp * dt;
    f.speed = sp;
  } else f.speed = 0;
  // 相手のほうを向く(なめらかに)
  const turn = B3.stat.turnRate * dt;
  f.face += clamp(angDiff(a, f.face), -turn, turn);
}

// ---------------- 当たり ----------------

function tryHit(b: B3Battle, f: B3Fighter, act: Extract<B3Act, { k: 'attack' }>): void {
  const o = other(b, f);
  const mv = B3.moves[act.move];
  if (o.act.k === 'ko' || o.act.k === 'victory') return;
  if (o.act.k === 'down' && o.act.t < B3.down.invincible) return;
  const d = dist(f, o);
  if (d > mv.reach + B3.body.radius) return;
  const off = Math.abs(angDiff(angleTo(f, o), act.dir));
  if (off > mv.arc && d > 0.6) return;
  if (Math.abs(o.y - f.y) > mv.height) return;
  act.hit = true;
  // 回避の無敵中 → よけられた
  if (o.act.k === 'evade' && o.act.t < B3.evade.invincible) {
    b.events.push({ kind: 'dodged', side: o.side });
    return;
  }
  const px = (f.x + o.x) / 2;
  const pz = (f.z + o.z) / 2;
  const py = o.y + 0.9;
  const raw = mv.power * (1 + f.stats.power / B3.stat.powerDiv) * (B3.stat.toughDiv / (B3.stat.toughDiv + o.stats.tough));
  // 押す: 床の上をすべって下がる(一瞬で動かさない)
  const push = (n: number) => {
    o.kvx += Math.cos(act.dir) * n * B3.knock.friction;
    o.kvz += Math.sin(act.dir) * n * B3.knock.friction;
  };
  // ガード(相手のほうを向いているときだけ)
  if (o.act.k === 'guard' && Math.abs(angDiff(angleTo(o, f), o.face)) < 1.8) {
    const g = o.act;
    const half = o.exhausted ? 0.5 : 1;
    const grade: GuardGrade = g.pre ? 'pre' : g.t <= B3.justGuard.perfect * half ? 'perfect' : g.t <= B3.justGuard.good * half ? 'good' : 'guard';
    let dmg = 0;
    if (grade === 'perfect' || grade === 'good') {
      dmg = grade === 'good' ? Math.round(raw * B3.justGuard.goodDamage) : 0;
      act.extra = grade === 'perfect' ? B3.justGuard.perfectStagger : B3.justGuard.goodStagger;
      if (!o.exhausted) o.counterUntil = b.t + B3.justGuard.counterWindow;
      o.act = { k: 'free' };
    } else {
      dmg = Math.max(1, Math.round(raw * (o.exhausted ? B3.guard.exhaustedRate : B3.guard.damageRate)));
      useStamina(b, o, B3.guard.staminaPerBlock);
      push(mv.push * 0.4);
    }
    o.hp = Math.max(0, o.hp - dmg);
    b.events.push({ kind: 'block', side: f.side, target: o.side, damage: dmg, grade, x: px, y: py, z: pz });
    if (o.hp <= 0) ko(b, o);
    return;
  }
  // コンボの数え方: ひるみ・空中のあいだ(と、終わってすぐ)に当たったら続き。地上と空中の合計【確定】
  const inCombo = o.act.k === 'stun' || o.act.k === 'air' || b.t - o.comboEnd <= B3.combo.grace;
  o.combo = inCombo ? o.combo + 1 : 1;
  const n = Math.min(o.combo, B3.combo.max);
  const dmg = Math.max(1, Math.round(raw * B3.combo.scale[n - 1]));
  o.hp = Math.max(0, o.hp - dmg);
  o.react = null;
  o.lastHit = act.move;
  b.events.push({ kind: 'hit', side: f.side, target: o.side, damage: dmg, combo: n, move: act.move, x: px, y: py, z: pz });
  push(mv.push);
  if (o.hp <= 0) {
    ko(b, o);
    return;
  }
  if (n >= B3.combo.max) {
    // 5ヒット目: たおれて、起きるまで当たらない(6ヒット目は出ない)
    b.events.push({ kind: 'fifth', side: f.side, target: o.side });
    o.combo = 0;
    o.comboEnd = -9;
    o.vy = Math.max(o.vy, 4);
    o.y = Math.max(o.y, 0.001);
    o.act = { k: 'down', t: 0, until: B3.down.time };
    return;
  }
  // 当たったら、すきを短くして次の攻撃につなげられる(コンボ)
  act.extra = -mv.recovery * B3.combo.hitCancel;
  f.thinkT = 0;
  if (mv.launch > 0 || o.y > 0) {
    o.vy = Math.max(o.y > 0 ? 2 : 0, mv.launch);
    o.y = Math.max(o.y, 0.001);
    o.act = { k: 'air', t: 0 };
  } else o.act = { k: 'stun', t: 0, until: mv.stun };
  // やられた側は、攻撃してきた相手のほうを向く
  o.face = angleTo(o, f);
}

function ko(b: B3Battle, f: B3Fighter): void {
  f.act = { k: 'ko', t: 0 };
  f.reserve = null;
  if (b.winner === null) {
    b.winner = f.side === 0 ? 1 : 0;
    b.koAt = b.t;
    b.events.push({ kind: 'ko', side: f.side });
  }
}

// ---------------- 1回分すすめる ----------------

function updateFighter(b: B3Battle, f: B3Fighter, dt: number): void {
  const o = other(b, f);
  const a = f.act;
  // 空中(Y)
  if (f.y > 0 || f.vy > 0) {
    f.vy -= B3.gravity * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      const hard = f.act.k === 'air' || f.act.k === 'down' || f.act.k === 'ko';
      b.events.push({ kind: 'land', side: f.side, hard });
      if (f.act.k === 'air') f.act = { k: 'down', t: 0, until: B3.down.landDown };
    }
  }
  // 吹っ飛び(すべる)
  if (f.kvx !== 0 || f.kvz !== 0) {
    f.x += f.kvx * dt;
    f.z += f.kvz * dt;
    const k = Math.exp(-B3.knock.friction * dt * (f.y > 0 ? 0.3 : 1));
    f.kvx *= k;
    f.kvz *= k;
    if (Math.hypot(f.kvx, f.kvz) < 0.05) f.kvx = f.kvz = 0;
  }
  // スタミナ(攻撃・ガード中は回復しない)
  if (a.k !== 'attack' && a.k !== 'guard' && a.k !== 'ko') {
    f.stamina = Math.min(B3.stamina.max, f.stamina + (f.exhausted ? B3.stamina.exhaustedRegen : B3.stamina.regen) * dt);
    if (f.exhausted && f.stamina >= B3.stamina.recoverAt) f.exhausted = false;
  }
  f.speed = 0;
  switch (a.k) {
    case 'attack': {
      const mv = B3.moves[a.move];
      a.t += dt;
      // 前へ出る技
      if (mv.dash > 0 && a.t <= mv.windup + mv.active && dist(f, o) > B3.body.minGap) {
        const step = (mv.dash * dt) / (mv.windup + mv.active);
        f.x += Math.cos(a.dir) * step;
        f.z += Math.sin(a.dir) * step;
      }
      if (!a.hit && a.t >= mv.windup && a.t < mv.windup + mv.active) tryHit(b, f, a);
      if (f.act !== a) break;
      if (!a.done && a.t >= mv.windup + mv.active) {
        a.done = true;
        if (!a.hit) b.events.push({ kind: 'whiff', side: f.side });
      }
      if (a.t >= mv.windup + mv.active + mv.recovery + a.extra && f.y <= 0) f.act = { k: 'free' };
      break;
    }
    case 'guard':
      a.t += dt;
      if (a.t >= a.until) f.act = { k: 'free' };
      break;
    case 'evade': {
      a.t += dt;
      const k = (B3.evade.distance / B3.evade.time) * dt;
      f.x += a.dx * k;
      f.z += a.dz * k;
      if (a.t >= B3.evade.time) f.act = { k: 'free' };
      break;
    }
    case 'step': {
      a.t += dt;
      // はじめ速く、あとゆっくり
      const k = (a.dist / a.dur) * 2 * (1 - Math.min(1, a.t / a.dur)) * dt;
      if (!a.back && dist(f, o) <= B3.body.minGap + 0.05) {
        f.act = { k: 'free' };
        break;
      }
      f.x += a.dx * k;
      f.z += a.dz * k;
      if (a.t >= a.dur) f.act = { k: 'free' };
      const turn = B3.stat.turnRate * dt;
      f.face += clamp(angDiff(angleTo(f, o), f.face), -turn, turn);
      break;
    }
    case 'stun':
      a.t += dt;
      if (a.t >= a.until) {
        f.act = { k: 'free' };
        f.comboEnd = b.t;
      }
      break;
    case 'air':
      a.t += dt;
      break;
    case 'down':
      a.t += dt;
      if (a.t >= a.until && f.y <= 0) {
        f.act = { k: 'free' };
        f.comboEnd = b.t;
      }
      break;
    case 'ko':
    case 'victory':
      a.t += dt;
      return;
    case 'free':
      break;
  }
  // 予約は 800ms で失効(動けないあいだも時間は進む)
  if (f.reserve && b.t > f.reserve.until) {
    b.events.push({ kind: 'order', side: f.side, order: f.reserve.order, state: 'expired' });
    f.reserve = null;
  }
  if (b.winner !== null) return;
  if (f.act.k !== 'free') return;
  // プレイヤーの指示(予約)を先に
  runOrder(b, f);
  if (f.act.k !== 'free') return;
  // ガード・回避の予定
  if (f.react && b.t >= f.react.at) {
    const r = f.react;
    f.react = null;
    if (b.t < r.until && f.y <= 0) {
      if (r.kind === 'evade' && f.stamina >= B3.evade.stamina) startEvade(b, f);
      else startGuard(f, r.until - b.t + 0.1, false);
      return;
    }
  }
  if (f.y > 0) return;
  f.thinkT -= dt;
  f.planT += dt;
  if (f.thinkT <= 0) {
    f.thinkT = B3.thinkEvery;
    think(b, f);
    if (f.act.k !== 'free') return;
  }
  walk(b, f, dt);
}

/** 2体を重ならないようにし、壁の中にとどめる */
function separate(b: B3Battle): void {
  const [p, q] = b.f;
  const d = dist(p, q);
  if (d < B3.body.minGap && Math.abs(p.y - q.y) < 1.2) {
    const nx = d > 1e-4 ? (q.x - p.x) / d : 1;
    const nz = d > 1e-4 ? (q.z - p.z) / d : 0;
    const push = (B3.body.minGap - d) / 2;
    p.x -= nx * push;
    p.z -= nz * push;
    q.x += nx * push;
    q.z += nz * push;
  }
  const H = B3.arena.half - B3.body.radius;
  for (const f of b.f) {
    f.x = clamp(f.x, -H, H);
    f.z = clamp(f.z, -H, H);
  }
}

/** dt 秒すすめる(中は 1/60 秒ずつ)。起きたことは b.events に入る(呼ぶ前に空にする) */
export function stepB3(b: B3Battle, dt: number): void {
  const n = Math.max(1, Math.round(dt / B3.dt));
  for (let i = 0; i < n; i++) step(b);
}

function step(b: B3Battle): void {
  const dt = B3.dt;
  b.t += dt;
  const [p, q] = b.f;
  if (b.winner === null) {
    watchAttack(b, p, q);
    watchAttack(b, q, p);
  }
  // 順番で有利にならないように、毎回交互に
  const order = Math.floor(b.t / dt) % 2 === 0 ? [p, q] : [q, p];
  for (const f of order) updateFighter(b, f, dt);
  separate(b);
  if (b.winner === null && b.t >= B3.timeLimit) {
    const rp = p.hp / p.maxHp;
    const rq = q.hp / q.maxHp;
    b.winner = rp > rq ? 0 : rq > rp ? 1 : 'draw';
    b.koAt = b.t;
    b.events.push({ kind: 'timeUp' });
  }
  // 勝ったほうの勝利モーション(KO演出のあと)
  if (b.winner !== null && b.winner !== 'draw' && b.koAt !== null && b.t - b.koAt >= B3.victoryDelay) {
    const w = b.f[b.winner];
    if (w.act.k !== 'victory' && w.y <= 0) {
      w.act = { k: 'victory', t: 0 };
      b.events.push({ kind: 'victory', side: w.side });
    }
  }
}

/** 試合が終わって、勝利モーションも見せ終わったか */
export const b3Finished = (b: B3Battle) => b.winner !== null && b.koAt !== null && b.t - b.koAt >= B3.victoryDelay + 2.2;
