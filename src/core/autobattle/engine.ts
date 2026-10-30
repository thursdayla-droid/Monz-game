/**
 * MONZ のオートバトル(企画者の指示書 2026-10-30「MONZは自分で戦う。プレイヤーは相棒として支える」)の計算。Phaserに依存しない。
 * 第1段階: 2D横・1対1。MONZが自分で近づく・下がる・待つ・攻撃する・ガードする・よけるを決める。HPが0になった側の負け。
 * プレイヤーは動かさない(作戦サイン・応援・絆アクションは第3段階)。
 * AIは機械学習ではなく、行動ごとに点数をつけて一番高いものをえらぶ方式(Utility AI)。数字は config.ts。
 * 乱数は種(seed)から決まるので、同じ種なら同じ試合になる。
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import { AUTO_BATTLE as C, DEFAULT_INSTINCT, INSTINCT_FROM_STATS, SPECIES_INSTINCT, type AutoAttackName, type Instinct } from './config';

export type MovePlan = 'approach' | 'retreat' | 'hold';

export type FighterAction =
  | { kind: 'attack'; name: AutoAttackName; t: number; hit: boolean }
  | { kind: 'guard'; t: number; until: number }
  | { kind: 'dodge'; t: number; dir: 1 | -1 };

/** 戦いに出る1匹の元(だれが・どんな能力で・どんな本能で) */
export interface AutoEntrant {
  name: string;
  species: string;
  stats: StatBlock;
  instinct: Instinct;
}

export interface AutoFighter {
  side: 0 | 1;
  name: string;
  species: string;
  stats: StatBlock;
  instinct: Instinct;
  x: number;
  face: 1 | -1;
  hp: number;
  maxHp: number;
  stamina: number;
  action: FighterAction | null;
  /** くらってひるんでいる残り時間 */
  stun: number;
  plan: MovePlan;
  /** 今の移動の方針を続けた時間 */
  planT: number;
  /** 次に考えるまでの時間 */
  thinkT: number;
  /** 歩いているか(見た目用) */
  walking: number;
  /** この試合の記録(第2段階で戦闘経験として保存する) */
  log: FightLog;
}

export interface FightLog {
  attacks: number;
  hits: number;
  blocked: number;
  dodged: number;
  guards: number;
  dodges: number;
  counters: number;
  damageDealt: number;
  /** 近づいていた・下がっていた時間(秒) */
  approachTime: number;
  retreatTime: number;
}

export type AutoEvent =
  | { kind: 'swing'; side: 0 | 1; name: AutoAttackName }
  | { kind: 'hit'; side: 0 | 1; target: 0 | 1; damage: number; crit: boolean; counter: boolean; name: AutoAttackName }
  | { kind: 'block'; side: 0 | 1; target: 0 | 1; damage: number }
  | { kind: 'dodge'; side: 0 | 1 }
  | { kind: 'miss'; side: 0 | 1 }
  | { kind: 'guardUp'; side: 0 | 1 }
  | { kind: 'ko'; side: 0 | 1 }
  | { kind: 'timeUp' };

export interface AutoBattle {
  fighters: [AutoFighter, AutoFighter];
  t: number;
  rng: Rng;
  /** 勝った側(0 / 1)。引き分けは 'draw'。まだなら null */
  winner: 0 | 1 | 'draw' | null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 種族の本能＋ステータスのかたよりで、その個体の本能を決める【仮】 */
export function instinctFor(species: string, stats: StatBlock): Instinct {
  const base = SPECIES_INSTINCT[species] ?? DEFAULT_INSTINCT;
  const total = stats.hp + stats.power + stats.tough + stats.speed + stats.tech || 1;
  // 5種が同じなら 0.2 ずつ。そこからのかたより(-0.2〜+0.8)
  const share = (v: number) => v / total - 0.2;
  const k = INSTINCT_FROM_STATS.strength * 2.5;
  return {
    attack: clamp(base.attack + share(stats.power) * k, 0, 1),
    defense: clamp(base.defense + share(stats.tough) * k, 0, 1),
    counter: clamp(base.counter + (share(stats.speed) + share(stats.tech)) * k * 0.5, 0, 1),
    fight: clamp(base.fight + (share(stats.power) + share(stats.hp)) * k * 0.5, 0, 1),
    survival: clamp(base.survival + (share(stats.tough) + share(stats.hp)) * k * 0.5, 0, 1),
  };
}

const emptyLog = (): FightLog => ({ attacks: 0, hits: 0, blocked: 0, dodged: 0, guards: 0, dodges: 0, counters: 0, damageDealt: 0, approachTime: 0, retreatTime: 0 });

function newFighter(e: AutoEntrant, side: 0 | 1): AutoFighter {
  const maxHp = Math.round(C.stat.hpBase + e.stats.hp * C.stat.perHp);
  const x = side === 0 ? C.arena.x0 + 220 : C.arena.x1 - 220;
  return { side, name: e.name, species: e.species, stats: e.stats, instinct: e.instinct, x, face: side === 0 ? 1 : -1, hp: maxHp, maxHp, stamina: C.stamina.max, action: null, stun: 0, plan: 'hold', planT: 0, thinkT: 0.4, walking: 0, log: emptyLog() };
}

export function newAutoBattle(a: AutoEntrant, b: AutoEntrant, seed: number): AutoBattle {
  const rng = mulberry32(seed);
  const fighters: [AutoFighter, AutoFighter] = [newFighter(a, 0), newFighter(b, 1)];
  // 考えはじめる時間を少しずらす(いつも同じ側が先に動かないように)
  for (const f of fighters) f.thinkT = 0.3 + rng() * 0.3;
  return { fighters, t: 0, rng, winner: null };
}

// ---------------- 能力の計算 ----------------

const walkSpeed = (f: AutoFighter) => C.stat.walkBase + f.stats.speed * C.stat.walkPerSpeed;
const windupOf = (f: AutoFighter, name: AutoAttackName) => C.attacks[name].windup * (1 - C.stat.windupCutAtMax * Math.min(1, f.stats.speed / 150));
const reactChance = (f: AutoFighter) => Math.min(C.stat.reactMax, C.stat.reactBase + (f.stats.tech / 150) * C.stat.reactPerTech);

/** その攻撃の、今の段階(ため・打つ・もどる) */
export function attackStage(f: AutoFighter): 'windup' | 'active' | 'recovery' | null {
  const a = f.action;
  if (!a || a.kind !== 'attack') return null;
  const d = C.attacks[a.name];
  const w = windupOf(f, a.name);
  if (a.t < w) return 'windup';
  if (a.t < w + d.active) return 'active';
  return 'recovery';
}

const attackLength = (f: AutoFighter, name: AutoAttackName) => windupOf(f, name) + C.attacks[name].active + C.attacks[name].recovery;
const dist = (b: AutoBattle) => Math.abs(b.fighters[0].x - b.fighters[1].x);
const busy = (f: AutoFighter) => f.stun > 0 || f.action !== null;

// ---------------- AI(行動の点数) ----------------

type Choice = 'jab' | 'strong' | 'guard' | 'dodge' | MovePlan;

/**
 * 今の状況で、それぞれの行動の点数をつける(Utility AI)。高いほどやりたい。
 * 本能・HP・スタミナ・相手の様子(攻撃のため中か、すきがあるか)・きょりで決まる
 */
export function scoreChoices(b: AutoBattle, me: AutoFighter, them: AutoFighter, noticed: boolean): Record<Choice, number> {
  const I = me.instinct;
  const d = dist(b);
  const inJab = d <= C.attacks.jab.reach;
  const inStrong = d <= C.attacks.strong.reach;
  const stage = attackStage(them);
  // 相手が攻撃のため中で、自分に届きそう(気づいたときだけ)
  const threat = noticed && stage === 'windup' && d <= C.attacks[(them.action as { name: AutoAttackName }).name].reach + 40;
  // 相手のすき(攻撃のあと・ひるみ・回避のあと)
  const opening = stage === 'recovery' || them.stun > 0 || them.action?.kind === 'dodge';
  const lowHp = me.hp / me.maxHp < C.lowHp;
  const tired = me.stamina < C.stamina.low;
  const s: Record<Choice, number> = { jab: 0, strong: 0, guard: 0, dodge: 0, approach: 0, retreat: 0, hold: 0 };
  if (inJab && me.stamina >= C.attacks.jab.stamina) s.jab = 0.45 + 0.6 * I.attack + (opening ? 0.8 * I.counter : 0) - (threat ? 0.5 : 0);
  if (inStrong && me.stamina >= C.attacks.strong.stamina) s.strong = 0.2 + 0.55 * I.fight + (opening ? 0.9 * I.counter : 0) - (threat ? 0.8 : 0) - (tired ? 0.4 : 0);
  if (threat) {
    s.guard = 0.25 + 1.2 * I.defense + (tired ? 0.2 : 0);
    if (me.stamina >= C.dodge.stamina) s.dodge = 0.4 + 0.6 * I.survival + 0.3 * I.counter;
  }
  s.approach = inJab ? 0 : 0.2 + 1.1 * I.attack + 0.3 * I.fight - (lowHp ? 0.6 * I.survival : 0) - (tired ? 0.35 : 0);
  s.retreat = 0.05 + (lowHp ? 0.55 * I.survival : 0) + (tired ? 0.45 : 0) + (inJab && !opening ? 0.25 * I.defense : 0) - (d > 380 ? 0.6 : 0);
  s.hold = 0.05 + 0.7 * I.defense + (d > 200 && d < 320 ? 0.25 * I.counter : 0);
  return s;
}

function think(b: AutoBattle, me: AutoFighter, them: AutoFighter, events: AutoEvent[]): void {
  // 相手の攻撃のために気づくか(テクニックが高いほど気づく。完全ではない)
  const noticed = b.rng() < reactChance(me);
  const s = scoreChoices(b, me, them, noticed);
  for (const k of Object.keys(s) as Choice[]) if (s[k] > 0) s[k] += (b.rng() - 0.5) * C.noise;
  // 移動の方針は、最低 moveHold 秒は続ける(ふらふらしないように)
  const moves: MovePlan[] = ['approach', 'retreat', 'hold'];
  const acts: Choice[] = ['jab', 'strong', 'guard', 'dodge'];
  const bestAct = acts.reduce((a, c) => (s[c] > s[a] ? c : a), acts[0]);
  const bestMove = moves.reduce((a, c) => (s[c] > s[a] ? c : a), moves[0]);
  if (s[bestAct] > 0 && s[bestAct] >= s[bestMove]) {
    startAction(b, me, them, bestAct as 'jab' | 'strong' | 'guard' | 'dodge', events);
    return;
  }
  if (me.planT >= C.moveHold && bestMove !== me.plan) {
    me.plan = bestMove;
    me.planT = 0;
  }
}

function startAction(b: AutoBattle, me: AutoFighter, them: AutoFighter, c: 'jab' | 'strong' | 'guard' | 'dodge', events: AutoEvent[]): void {
  if (c === 'guard') {
    const g = C.guard;
    me.action = { kind: 'guard', t: 0, until: g.minTime + b.rng() * (g.maxTime - g.minTime) };
    me.log.guards++;
    events.push({ kind: 'guardUp', side: me.side });
    return;
  }
  if (c === 'dodge') {
    me.stamina -= C.dodge.stamina;
    me.action = { kind: 'dodge', t: 0, dir: (me.x < them.x ? -1 : 1) as 1 | -1 };
    me.log.dodges++;
    return;
  }
  me.stamina -= C.attacks[c].stamina;
  me.action = { kind: 'attack', name: c, t: 0, hit: false };
  me.log.attacks++;
  events.push({ kind: 'swing', side: me.side, name: c });
}

// ---------------- 1こま進める ----------------

function resolveStrike(b: AutoBattle, me: AutoFighter, them: AutoFighter, events: AutoEvent[]): void {
  const a = me.action as Extract<FighterAction, { kind: 'attack' }>;
  a.hit = true;
  const d = C.attacks[a.name];
  if (dist(b) > d.reach) {
    events.push({ kind: 'miss', side: me.side });
    return;
  }
  const dodge = them.action?.kind === 'dodge' && them.action.t < C.dodge.invincible;
  if (dodge) {
    them.log.dodged++;
    events.push({ kind: 'dodge', side: them.side });
    them.thinkT = 0;
    return;
  }
  const crit = b.rng() < (me.stats.tech / 150) * C.stat.critMax;
  const raw = d.power * (1 + me.stats.power / C.stat.powerDiv) * (C.stat.toughDiv / (C.stat.toughDiv + them.stats.tough)) * (crit ? C.stat.critMul : 1);
  if (them.action?.kind === 'guard') {
    const dmg = Math.max(1, Math.round(raw * C.guard.damageRate));
    them.hp = Math.max(0, them.hp - dmg);
    them.stamina = Math.max(0, them.stamina - C.guard.staminaPerBlock);
    them.log.blocked++;
    me.log.damageDealt += dmg;
    // 受け止めたら、カウンターをねらう個体ほど すぐガードをといて すきをつく
    if (b.rng() < 0.3 + 0.6 * them.instinct.counter) {
      them.action = null;
      them.thinkT = 0;
    }
    events.push({ kind: 'block', side: me.side, target: them.side, damage: dmg });
  } else {
    // 相手のすき(攻撃のあと・ひるみ中)に当てたらカウンター
    const counter = attackStage(them) === 'recovery' || them.stun > 0;
    const dmg = Math.max(1, Math.round(raw));
    them.hp = Math.max(0, them.hp - dmg);
    them.stun = d.stun;
    them.action = null;
    them.x += Math.sign(them.x - me.x) * d.push;
    me.log.hits++;
    me.log.damageDealt += dmg;
    if (counter) me.log.counters++;
    events.push({ kind: 'hit', side: me.side, target: them.side, damage: dmg, crit, counter, name: a.name });
  }
  if (them.hp <= 0) {
    them.action = null;
    them.stun = 0;
    b.winner = me.side;
    events.push({ kind: 'ko', side: them.side });
  }
}

function stepFighter(b: AutoBattle, me: AutoFighter, them: AutoFighter, dt: number, events: AutoEvent[]): void {
  me.face = me.x < them.x ? 1 : -1;
  me.walking = 0;
  me.planT += dt;
  if (me.stun > 0) {
    me.stun = Math.max(0, me.stun - dt);
    return;
  }
  const a = me.action;
  if (a?.kind === 'attack') {
    a.t += dt;
    if (!a.hit && attackStage(me) !== 'windup') resolveStrike(b, me, them, events);
    if (a.t >= attackLength(me, a.name)) me.action = null;
  } else if (a?.kind === 'guard') {
    a.t += dt;
    me.stamina = Math.max(0, me.stamina - C.guard.staminaPerSec * dt);
    if (a.t >= a.until || me.stamina <= 0) me.action = null;
  } else if (a?.kind === 'dodge') {
    a.t += dt;
    me.x += (a.dir * C.dodge.distance * dt) / C.dodge.time;
    if (a.t >= C.dodge.time) me.action = null;
  }
  if (a?.kind !== 'guard') me.stamina = Math.min(C.stamina.max, me.stamina + C.stamina.regen * dt * (a ? 0.4 : 1));
  if (busy(me)) return;
  me.thinkT -= dt;
  if (me.thinkT <= 0) {
    me.thinkT = C.thinkEvery;
    think(b, me, them, events);
    if (me.action) return;
  }
  const d = dist(b);
  const toward = me.x < them.x ? 1 : -1;
  const v = walkSpeed(me) * dt;
  if (me.plan === 'approach' && d > C.attacks.jab.reach - 30) {
    me.x += toward * v;
    me.walking = toward * me.face;
    me.log.approachTime += dt;
  } else if (me.plan === 'retreat') {
    me.x -= toward * v * 0.8;
    me.walking = -1;
    me.log.retreatTime += dt;
  }
}

/** dt 秒進める。起きたことを返す */
export function stepAutoBattle(b: AutoBattle, dt: number): AutoEvent[] {
  const events: AutoEvent[] = [];
  if (b.winner !== null) return events;
  b.t += dt;
  const [f0, f1] = b.fighters;
  // 順番で有利にならないように、こまごとに先に動く側を入れかえる
  const order: [AutoFighter, AutoFighter][] = Math.floor(b.t / dt) % 2 ? [[f0, f1], [f1, f0]] : [[f1, f0], [f0, f1]];
  for (const [me, them] of order) {
    if (b.winner !== null) break;
    stepFighter(b, me, them, dt, events);
  }
  // 場所: 戦う場所の外へ出ない・重ならない
  for (const f of b.fighters) f.x = clamp(f.x, C.arena.x0, C.arena.x1);
  const gap = f1.x - f0.x;
  if (Math.abs(gap) < C.bodyGap) {
    const mid = (f0.x + f1.x) / 2;
    const dir = gap >= 0 ? 1 : -1;
    f0.x = clamp(mid - (dir * C.bodyGap) / 2, C.arena.x0, C.arena.x1);
    f1.x = clamp(mid + (dir * C.bodyGap) / 2, C.arena.x0, C.arena.x1);
    // はしに追いつめられて重なるときは、もう片方を押しもどす
    if (Math.abs(f1.x - f0.x) < C.bodyGap) {
      if (f0.x === C.arena.x0 || f1.x === C.arena.x0) (f0.x < f1.x ? f1 : f0).x = C.arena.x0 + C.bodyGap;
      else (f0.x > f1.x ? f1 : f0).x = C.arena.x1 - C.bodyGap;
    }
  }
  if (b.winner === null && b.t >= C.timeLimit) {
    const r0 = f0.hp / f0.maxHp;
    const r1 = f1.hp / f1.maxHp;
    b.winner = Math.abs(r0 - r1) < 1e-9 ? 'draw' : r0 > r1 ? 0 : 1;
    events.push({ kind: 'timeUp' });
  }
  return events;
}

/** 最後まで進める(テスト・バランス調整用) */
export function simulateAutoBattle(a: AutoEntrant, b: AutoEntrant, seed: number, dt = 1 / 60): AutoBattle {
  const battle = newAutoBattle(a, b, seed);
  while (battle.winner === null) stepAutoBattle(battle, dt);
  return battle;
}
