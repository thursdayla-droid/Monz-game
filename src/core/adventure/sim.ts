/**
 * 冒険の 1階ぶんの 動き(2026-11-07 試作)。Phaser・Three に 依存しない(あとで オンラインに しやすいように)。
 * 自分の MONZ を スティックで 動かし、通常攻撃で モブを 倒す。全部 倒すと 出口が ひらき、出口に 入ると クリア。
 * ステータスは そのまま 反映(企画者)。数字は【仮】
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import { fits, generateFloor, lineOfSight, cellToWorld, type Floor } from './dungeon';

export const ADV = {
  player: { r: 0.55, hp: 60, hpPer: 4, atk: 6, atkPer: 0.5, speed: 4.2, speedPer: 0.03, range: 2.0, arc: 1.25, windup: 0.08, recover: 0.22, cool: 0.34, knock: 3 },
  /** 受ける ダメージ = 攻撃 × K / (K + タフネス) */
  defK: 40,
  critDiv: 400,
  mob: { r: 0.6, hp: 28, atk: 7, speed: 3.0, aggro: 9, range: 1.5, windup: 0.55, cool: 1.3, knock: 2.5 },
  /** 【仮】ごほうび: モブ1体・クリア */
  reward: { mobExp: 5, mobCoins: 3, clearExp: 30, clearCoins: 20 },
  hurtTime: 0.25,
  /** 通常攻撃の 続け打ち(この 秒数の 中で 押すと 次の 段)・3段めの 強さ */
  chain: { keep: 0.75, last: 1.5 },
  /** 種族ごとの 通常攻撃の とどく 長さ・はば【仮】 */
  jab: {
    punch: { range: 2.0, arc: 1.25 },
    whip: { range: 3.4, arc: 0.6 },
    shot: { range: 6, arc: 0.3 },
    dash: { range: 2.0, arc: 1.0 },
    snap: { range: 1.9, arc: 1.5 },
  } as Record<string, { range: number; arc: number }>,
  /** 技(種類ごとの はんい・威力の 倍)【仮】 */
  tech: {
    windup: 0.16, recover: 0.3, powDiv: 7, minMul: 1.4,
    /** 種類ごとの ため(技に あった 動きを 見せる。2026-11-07 企画者「技に あった 動きに」) */
    windups: { drop: 0.55, pillar: 0.4, beam: 0.38, quake: 0.34, field: 0.3, debuff: 0.3, barrier: 0.22, buff: 0.25, heal: 0.25, spin: 0.14, rush: 0.12, shot: 0.12, barrage: 0.16, combo: 0.1, drain: 0.16 } as Record<string, number>,
    melee: { range: 2.4, arc: 1.2 },
    // 2026-11-07 企画者「瞬間移動は やめて」→ とっしんは 遅く 短く・とびおりは 近くへ だけ
    rush: { dist: 4.5, speed: 11, r: 1.3 },
    spin: { r: 2.8 },
    combo: { range: 2.4, arc: 1.0, n: 3, every: 0.12 },
    shot: { speed: 14, r: 0.45, life: 1.2 },
    barrage: { n: 5, spread: 0.5 },
    beam: { len: 11, w: 1.3 },
    quake: { r: 4.2 },
    drop: { reach: 7, r: 3, move: 2.8 },
    pillar: { reach: 7, r: 3.4, mul: 1.3 },
    field: { reach: 6, r: 3.6, life: 4, every: 0.5, mul: 0.35 },
    heal: 0.3,
    drain: 0.5,
    barrier: { time: 5, cut: 0.6 },
    buff: { time: 8, up: 1.35 },
    debuff: { r: 6, time: 6 },
  },
  /** 追加効果: かかる 確率(テクニックで 上がる)と 時間 */
  status: { chance: 0.35, techDiv: 300, stun: 1.0, slow: 3, slowMul: 0.45, dot: 4, dotEvery: 0.5, dotMul: 0.12, sleep: 2.5, atkDown: 6, atkDownMul: 0.65, defDown: 6, defDownMul: 0.6 },
  /** 型の 効果(2026-11-07 企画者「回復は タフネス型の 効果だけ」) */
  type: { powerMul: 1.25, toughHeal: 0.06, toughCut: 0.85, speedCd: 0.75, speedShot: 1.3, techArea: 1.25, techStatus: 0.2 },
  /** 回復の実: 最大HP の 割合 */
  herbHeal: 0.4,
  /** モブが 落とす: 回復の実 25%・装備 12%【仮】。装備の ランクの 出やすさ D50 C30 B14 A5 S1 */
  drop: { herb: 0.25, gear: 0.12, rank: [50, 30, 14, 5, 1] },
  /** 装備の 強さ(ランクごとの 倍)と 1倍の ときの 上がり方 */
  gear: { mul: { D: 1, C: 2, B: 3, A: 5, S: 8 } as Record<Rank, number>, head: 2, armor: 3, charm: 8 },
  pickR: 1.1,
} as const;

export type ActKind = 'free' | 'attack' | 'tech' | 'hurt' | 'dead';

/**
 * 冒険で 使う 技(MONZ RUMBLE で セットした 4つ。名前は そのまま。2026-11-07 企画者)。
 * 役割は 決めない(企画者「スキルセットによって 攻撃や 遠距離、補助など 色々な 体験」)。効き方は 技の 種類(kind)と 名前に 合わせる
 */
export interface AdvTech {
  id: string;
  /** MONZ RUMBLE の 技の 種類(rush・shot・quake など) */
  kind: string;
  power: number;
  cooldown: number;
  element: string;
  /** 追加効果(ふらつき・まひ・やけど など) */
  effect: string;
  strength: string;
}

/** 自分を 守る・強くする 技(ボタンを 緑に する) */
export const SELF_KINDS = new Set(['heal', 'barrier', 'buff']);

/** 装備の 場所(企画者 2026-11-07 案【仮】): アタマ = 攻撃(2026-11-07 企画者「爪じゃなくて 頭」)・ヨロイ = 守り・オマモリ = HP */
export type GearSlot = 'head' | 'armor' | 'charm';
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S';
export const RANKS: Rank[] = ['D', 'C', 'B', 'A', 'S'];
export const SLOT_NAMES: Record<GearSlot, string> = { head: 'アタマ', armor: 'ヨロイ', charm: 'オマモリ' };

/** 持ち物(1つ)。herb = 回復の実(冒険の 中で 使う)・gear = 装備 */
export type AdvItem = { kind: 'herb' } | { kind: 'gear'; slot: GearSlot; rank: Rank };

/** 持ち物は 20個まで(企画者 2026-11-07) */
export const BAG_MAX = 20;

export interface Drop {
  id: number;
  x: number;
  z: number;
  item: AdvItem;
  /** 持ち物が いっぱいで 拾えなかった(知らせは 1回だけ) */
  warned?: boolean;
}

export interface Actor {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  face: number;
  hp: number;
  maxHp: number;
  atk: number;
  tough: number;
  speed: number;
  act: ActKind;
  actT: number;
  /** 攻撃が 当たったか(1回の 攻撃で 1度だけ) */
  struck: boolean;
  coolUntil: number;
  /** モブが 気づいたか */
  awake: boolean;
  /** 状態(時刻) */
  stunUntil?: number;
  slowUntil?: number;
  sleepUntil?: number;
  dotUntil?: number;
  dotTick?: number;
  dotDmg?: number;
  atkDownUntil?: number;
  defDownUntil?: number;
}

/** 飛ぶ 弾(自分の 技) */
export interface Shot {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  life: number;
  mul: number;
  tech: AdvTech;
}

/** 床に 残る 場(魔法陣 など) */
export interface Field {
  id: number;
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
  next: number;
  tech: AdvTech;
}

export type AdvEvent =
  | { kind: 'attack'; id: number }
  | { kind: 'hit'; target: number; x: number; z: number; dmg: number; crit: boolean }
  | { kind: 'die'; id: number; x: number; z: number }
  | { kind: 'open'; x: number; z: number }
  | { kind: 'tech'; slot: number; x: number; z: number; fx: string; dir: number; r: number; len: number; element: string; tx: number; tz: number }
  | { kind: 'status'; target: number; x: number; z: number; effect: string }
  | { kind: 'jab'; style: string; chain: number; x: number; z: number; dir: number; range: number }
  | { kind: 'heal'; amount: number; x: number; z: number }
  | { kind: 'drop'; drop: Drop }
  | { kind: 'pick'; drop: Drop }
  | { kind: 'full' }
  | { kind: 'clear' }
  | { kind: 'lose' };

export interface AdvState {
  floor: Floor;
  rng: Rng;
  t: number;
  player: Actor;
  /** 0 = 自分。モブは 1 から */
  mobs: Actor[];
  tech: number;
  exitOpen: boolean;
  result: 'play' | 'clear' | 'lose';
  kills: number;
  events: AdvEvent[];
  techs: (AdvTech | null)[];
  techCd: number[];
  /** 今 使っている 技の 場所 */
  techSlot: number;
  bag: AdvItem[];
  gear: Partial<Record<GearSlot, AdvItem & { kind: 'gear' }>>;
  drops: Drop[];
  seq: number;
  shots: Shot[];
  fields: Field[];
  /** 自分の 守り・強化(時刻) */
  shieldUntil: number;
  atkUpUntil: number;
  /** とっしん 中(当てた モブは 1回だけ) */
  dash: { until: number; hit: number[]; mul: number } | null;
  /** とびおりる 技の おちる ところ(ため の 間に 近づく) */
  jumpTo: { x: number; z: number; sx: number; sz: number } | null;
  /** 今の 技を ねらって うったか */
  aimed: boolean;
  /** 連続で 打つ 技(のこりの 回数・次の 時刻) */
  combo: { left: number; next: number; mul: number } | null;
  /** 育ち方の 型(自由ポイントで 決まる) */
  growType: string | null;
  /** 通常攻撃の 種類(種族で 決まる)・続け打ちの 段 */
  jab: string;
  chain: number;
  lastAtk: number;
  /** 装備の 前の 数字(装備で 足す 元) */
  base: { atk: number; tough: number; maxHp: number };
}

export interface AdvInput {
  /** スティック(画面の 向きで 回した あと。長さ 0〜1) */
  mx: number;
  mz: number;
  attack: boolean;
  /** 押した 技(0〜3)。null = なし */
  tech?: number | null;
  /** 技を うつ 向き(長押しで ねらった 向き。null = いちばん 近い 敵へ。2026-11-07 企画者) */
  techDir?: number | null;
}

function actor(id: number, x: number, z: number): Actor {
  return { id, x, z, vx: 0, vz: 0, face: 0, hp: 1, maxHp: 1, atk: 1, tough: 0, speed: 1, act: 'free', actT: 0, struck: false, coolUntil: 0, awake: false };
}

/** 新しい 階。stats: 自分の MONZ の ステータス・level: 階の 強さ(1 = 試作) */
/** 種族の 通常攻撃(MOFU ムチ・PUNI 水の玉・ZIPP 電撃ダッシュ・KLAK はさむ・ほかは パンチや 爪) */
export const jabStyleOf = (species: string): string => ({ mofu: 'whip', puni: 'shot', zipp: 'dash', klak: 'snap' } as Record<string, string>)[species] ?? 'punch';
const WATER_JAB: AdvTech = { id: 'punch', kind: 'jab', power: 7, cooldown: 0, element: '水', effect: 'なし', strength: '弱' };

export function newAdventure(seed: number, stats: StatBlock, level = 1, techs: (AdvTech | null)[] = [], growType: string | null = null, species = 'bunk'): AdvState {
  const floor = generateFloor(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const P = ADV.player;
  const p = actor(0, floor.start.x, floor.start.z);
  p.maxHp = p.hp = Math.round(P.hp + stats.hp * P.hpPer);
  p.atk = P.atk + stats.power * P.atkPer;
  p.tough = stats.tough;
  p.speed = P.speed + stats.speed * P.speedPer;
  const mobs: Actor[] = [];
  // はじまりの 部屋 いがいに 2〜3体ずつ
  floor.rooms.slice(1).forEach((r) => {
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const c = cellToWorld(r.x + 1 + Math.floor(rng() * (r.w - 2)), r.y + 1 + Math.floor(rng() * (r.h - 2)));
      const m = actor(mobs.length + 1, c.x, c.z);
      const M = ADV.mob;
      m.maxHp = m.hp = Math.round(M.hp * (1 + (level - 1) * 0.35));
      m.atk = M.atk * (1 + (level - 1) * 0.3);
      m.tough = 4 * level;
      m.speed = M.speed;
      m.face = rng() * Math.PI * 2;
      mobs.push(m);
    }
  });
  const ts = [0, 1, 2, 3].map((i) => techs[i] ?? null);
  return {
    floor, rng, t: 0, player: p, mobs, tech: stats.tech, exitOpen: false, result: 'play', kills: 0, events: [],
    techs: ts, techCd: [0, 0, 0, 0], techSlot: -1, bag: [], gear: {}, drops: [], seq: 0,
    shots: [], fields: [], shieldUntil: 0, atkUpUntil: 0, dash: null, combo: null, jumpTo: null, aimed: false, growType, jab: jabStyleOf(species), chain: 0, lastAtk: -9,
    base: { atk: p.atk, tough: p.tough, maxHp: p.maxHp },
  };
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** 壁に ぶつからないように 動かす(x と z を べつべつに) */
function moveBy(s: AdvState, a: Actor, dx: number, dz: number, r: number): void {
  if (fits(s.floor, a.x + dx, a.z, r)) a.x += dx;
  if (fits(s.floor, a.x, a.z + dz, r)) a.z += dz;
}

/** 追加効果を かける */
function setStatus(s: AdvState, m: Actor, effect: string, dmg: number): void {
  const S = ADV.status;
  if (effect === 'ふらつき') m.stunUntil = s.t + S.stun;
  else if (effect === 'まひ' || effect === '遅くする') m.slowUntil = s.t + S.slow;
  else if (effect === 'やけど' || effect === 'どく') {
    m.dotUntil = s.t + S.dot;
    m.dotTick = s.t + S.dotEvery;
    m.dotDmg = Math.max(1, Math.round(dmg * S.dotMul));
  } else if (effect === 'ねむり') m.sleepUntil = s.t + S.sleep;
  else if (effect === '攻撃ダウン') m.atkDownUntil = s.t + S.atkDown;
  else if (effect === '防御ダウン') m.defDownUntil = s.t + S.defDown;
  else return;
  s.events.push({ kind: 'status', target: m.id, x: m.x, z: m.z, effect });
}

/** 前の 向きの ±arc の 中・距離 range の モブ */
function inCone(s: AdvState, x: number, z: number, dir: number, range: number, arc: number): Actor[] {
  return s.mobs.filter((m) => m.act !== 'dead' && Math.hypot(m.x - x, m.z - z) < range + ADV.mob.r && Math.abs(angDiff(Math.atan2(m.z - z, m.x - x), dir)) < arc);
}
const inCircle = (s: AdvState, x: number, z: number, r: number) => s.mobs.filter((m) => m.act !== 'dead' && Math.hypot(m.x - x, m.z - z) < r + ADV.mob.r);
/** 長い 帯(ビーム)の 中 */
function inLine(s: AdvState, x: number, z: number, dir: number, len: number, w: number): Actor[] {
  const c = Math.cos(dir);
  const n = Math.sin(dir);
  return s.mobs.filter((m) => {
    if (m.act === 'dead') return false;
    const dx = m.x - x;
    const dz = m.z - z;
    const a = dx * c + dz * n;
    const b = -dx * n + dz * c;
    return a > -0.5 && a < len && Math.abs(b) < w / 2 + ADV.mob.r;
  });
}
/** その 向き(±0.6)に いる いちばん 近い 敵 */
const aimedMob = (s: AdvState, dir: number, within: number) =>
  s.mobs
    .filter((m) => m.act !== 'dead' && Math.hypot(m.x - s.player.x, m.z - s.player.z) < within && Math.abs(angDiff(Math.atan2(m.z - s.player.z, m.x - s.player.x), dir)) < 0.6)
    .sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
const nearestMob = (s: AdvState, within: number) =>
  s.mobs.filter((m) => m.act !== 'dead' && Math.hypot(m.x - s.player.x, m.z - s.player.z) < within).sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];

/** その技の ため(秒) */
export const techWindup = (kind: string): number => ADV.tech.windups[kind] ?? ADV.tech.windup;

/** 技を 出す(ためが 終わった 時)。種類ごとに 効き方を 変える【仮】 */
function fireTech(s: AdvState, slot: number): void {
  const tc = s.techs[slot]!;
  const p = s.player;
  const T = ADV.tech;
  const Y = ADV.type;
  const area = s.growType === 'tech' ? Y.techArea : 1;
  const mul = Math.max(T.minMul, tc.power / T.powDiv);
  const hitAll = (list: Actor[], k = 1) => list.forEach((m) => {
    m.awake = true;
    damage(s, p, m, mul * k, tc);
  });
  const ev = (fx: string, r = 0, len = 0, tx = p.x, tz = p.z) => s.events.push({ kind: 'tech', slot, x: p.x, z: p.z, fx, dir: p.face, r, len, element: tc.element, tx, tz });
  const target = (reach: number) => {
    // ねらった 時は その向きの 敵(なければ その向きの 先)
    const m = s.aimed ? aimedMob(s, p.face, reach) : nearestMob(s, reach);
    return m ? { x: m.x, z: m.z } : { x: p.x + Math.cos(p.face) * reach * 0.6, z: p.z + Math.sin(p.face) * reach * 0.6 };
  };
  switch (tc.kind) {
    case 'rush':
      // とっしん: 前へ 走って、ぶつかった 敵を 打つ
      s.dash = { until: s.t + T.rush.dist / T.rush.speed, hit: [], mul };
      ev('rush');
      break;
    case 'spin':
      hitAll(inCircle(s, p.x, p.z, T.spin.r * area));
      ev('spin', T.spin.r * area);
      break;
    case 'combo':
      // 連続で 前を 打つ
      s.combo = { left: T.combo.n, next: s.t, mul: mul * 0.55 };
      ev('combo', T.combo.range);
      break;
    case 'shot':
    case 'barrage': {
      const n = tc.kind === 'barrage' ? T.barrage.n : 1;
      const sp = T.shot.speed * (s.growType === 'speed' ? Y.speedShot : 1);
      for (let i = 0; i < n; i++) {
        const a = p.face + (n > 1 ? (i / (n - 1) - 0.5) * T.barrage.spread * 2 : 0);
        s.shots.push({ id: ++s.seq, x: p.x + Math.cos(a) * 0.8, z: p.z + Math.sin(a) * 0.8, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, r: T.shot.r, life: T.shot.life * (s.growType === 'speed' ? Y.speedShot : 1), mul: n > 1 ? mul * 0.55 : mul, tech: tc });
      }
      ev('shot');
      break;
    }
    case 'beam':
      hitAll(inLine(s, p.x + Math.cos(p.face) * 0.9, p.z + Math.sin(p.face) * 0.9, p.face, T.beam.len, T.beam.w * area));
      ev('beam', T.beam.w * area, T.beam.len);
      break;
    case 'quake':
      hitAll(inCircle(s, p.x, p.z, T.quake.r * area), 0.8);
      ev('quake', T.quake.r * area);
      break;
    case 'drop': {
      // とび上がって 敵の 上に おちる(とんでいる 間に 近づく。下の stepAdventure)
      // おちる ところは 今 いる ところ(ため の 間に 動いて きた)
      const g = { x: p.x, z: p.z };
      s.jumpTo = null;
      hitAll(inCircle(s, g.x, g.z, T.drop.r * area));
      ev('drop', T.drop.r * area, 0, g.x, g.z);
      break;
    }
    case 'pillar': {
      const g = target(T.pillar.reach);
      hitAll(inCircle(s, g.x, g.z, T.pillar.r * area), T.pillar.mul);
      ev('pillar', T.pillar.r * area, 0, g.x, g.z);
      break;
    }
    case 'field': {
      const g = target(T.field.reach);
      s.fields.push({ id: ++s.seq, x: g.x, z: g.z, r: T.field.r * area, t: 0, life: T.field.life, next: 0, tech: tc });
      ev('field', T.field.r * area, 0, g.x, g.z);
      break;
    }
    case 'heal':
      heal(s, Math.round(p.maxHp * T.heal));
      ev('heal', 2.5);
      break;
    case 'drain': {
      const list = inCone(s, p.x, p.z, p.face, T.melee.range + 0.6, T.melee.arc);
      const hp0 = list.reduce((a, m) => a + m.hp, 0);
      hitAll(list);
      const got = hp0 - list.reduce((a, m) => a + m.hp, 0);
      if (got > 0) heal(s, Math.round(got * T.drain));
      ev('drain', T.melee.range);
      break;
    }
    case 'barrier':
      s.shieldUntil = s.t + T.barrier.time;
      ev('barrier', 1.6);
      break;
    case 'buff':
      s.atkUpUntil = s.t + T.buff.time;
      ev('buff', 1.6);
      break;
    case 'debuff':
      // ほえる・にらむ: まわりの 敵に 追加効果(必ず かかる)
      for (const m of inCircle(s, p.x, p.z, T.debuff.r * area)) {
        m.awake = true;
        setStatus(s, m, tc.effect !== 'なし' ? tc.effect : '攻撃ダウン', 1);
      }
      ev('debuff', T.debuff.r * area);
      break;
    default:
      // パンチなど: 前を 強く 打つ
      hitAll(inCone(s, p.x, p.z, p.face, T.melee.range, T.melee.arc));
      ev('melee', T.melee.range);
  }
  // タフネス型: 技を 使うたびに 少し 回復(2026-11-07 企画者「回復は タフネス型の 効果だけ」)
  if (s.growType === 'tough') heal(s, Math.round(p.maxHp * Y.toughHeal));
}

/** 弾・場・とっしん・連続 打ち・状態の 時間を すすめる */
function stepTechs(s: AdvState, dt: number): void {
  const p = s.player;
  const T = ADV.tech;
  if (s.dash) {
    if (s.t >= s.dash.until || p.act === 'dead') s.dash = null;
    else {
      moveBy(s, p, Math.cos(p.face) * T.rush.speed * dt, Math.sin(p.face) * T.rush.speed * dt, ADV.player.r);
      for (const m of inCircle(s, p.x, p.z, T.rush.r)) {
        if (s.dash.hit.includes(m.id)) continue;
        s.dash.hit.push(m.id);
        m.awake = true;
        damage(s, p, m, s.dash.mul, s.techs[s.techSlot] ?? undefined);
      }
    }
  }
  if (s.combo && s.t >= s.combo.next) {
    const tc = s.techs[s.techSlot] ?? undefined;
    for (const m of inCone(s, p.x, p.z, p.face, T.combo.range, T.combo.arc)) {
      m.awake = true;
      damage(s, p, m, s.combo.mul, tc);
    }
    s.combo.left--;
    s.combo.next = s.t + T.combo.every;
    if (s.combo.left <= 0) s.combo = null;
  }
  for (const sh of s.shots) {
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    sh.life -= dt;
    if (!fits(s.floor, sh.x, sh.z, 0.05)) sh.life = 0;
    const m = inCircle(s, sh.x, sh.z, sh.r)[0];
    if (m && sh.life > 0) {
      m.awake = true;
      damage(s, p, m, sh.mul, sh.tech);
      sh.life = 0;
    }
  }
  s.shots = s.shots.filter((x) => x.life > 0);
  for (const f of s.fields) {
    f.t += dt;
    if (f.t >= f.next) {
      f.next = f.t + T.field.every;
      for (const m of inCircle(s, f.x, f.z, f.r)) {
        m.awake = true;
        damage(s, p, m, Math.max(T.minMul, f.tech.power / T.powDiv) * T.field.mul, f.tech);
        if (f.tech.effect === '遅くする' || f.tech.effect === 'なし') m.slowUntil = s.t + 0.6;
      }
    }
  }
  s.fields = s.fields.filter((f) => f.t < f.life);
  // やけど・どく
  for (const m of s.mobs) {
    if (m.act === 'dead' || !m.dotUntil || s.t > m.dotUntil || s.t < (m.dotTick ?? 0)) continue;
    m.dotTick = s.t + ADV.status.dotEvery;
    m.hp = Math.max(0, m.hp - (m.dotDmg ?? 1));
    s.events.push({ kind: 'hit', target: m.id, x: m.x, z: m.z, dmg: m.dotDmg ?? 1, crit: false });
    if (m.hp <= 0) {
      m.act = 'dead';
      m.actT = 0;
      s.kills++;
      s.events.push({ kind: 'die', id: m.id, x: m.x, z: m.z });
      dropFrom(s, m);
    }
  }
}

/** 倒した モブが 物を 落とす【仮】 */
function dropFrom(s: AdvState, m: Actor): void {
  const D = ADV.drop;
  const r = s.rng();
  let item: AdvItem | null = null;
  if (r < D.gear) {
    const slots: GearSlot[] = ['head', 'armor', 'charm'];
    const slot = slots[Math.floor(s.rng() * 3)];
    let q = s.rng() * D.rank.reduce((a, b) => a + b, 0);
    let rank: Rank = 'D';
    for (let i = 0; i < RANKS.length; i++) if ((q -= D.rank[i]) < 0) {
      rank = RANKS[i];
      break;
    }
    item = { kind: 'gear', slot, rank };
  } else if (r < D.gear + D.herb) item = { kind: 'herb' };
  if (!item) return;
  const d: Drop = { id: ++s.seq, x: m.x, z: m.z, item };
  s.drops.push(d);
  s.events.push({ kind: 'drop', drop: d });
}

/** 装備で 数字を 足し直す(HP の 割合は そのまま) */
function applyGear(s: AdvState): void {
  const p = s.player;
  const G = ADV.gear;
  const m = (slot: GearSlot) => (s.gear[slot] ? G.mul[s.gear[slot]!.rank] : 0);
  const rate = p.hp / p.maxHp;
  p.atk = s.base.atk + G.head * m('head');
  p.tough = s.base.tough + G.armor * m('armor');
  p.maxHp = s.base.maxHp + G.charm * m('charm');
  p.hp = Math.max(1, Math.round(p.maxHp * rate));
}

/** 持ち物を 使う(回復の実)/装備する(つけていた 物は 持ち物へ)。できたら true */
export function useBagItem(s: AdvState, index: number): boolean {
  const it = s.bag[index];
  if (!it || s.result !== 'play' || s.player.act === 'dead') return false;
  if (it.kind === 'herb') {
    if (s.player.hp >= s.player.maxHp) return false;
    s.bag.splice(index, 1);
    heal(s, Math.round(s.player.maxHp * ADV.herbHeal));
    return true;
  }
  const old = s.gear[it.slot];
  s.gear[it.slot] = it;
  s.bag.splice(index, 1);
  if (old) s.bag.splice(index, 0, old);
  applyGear(s);
  return true;
}

/** 装備を はずして 持ち物へ(いっぱいなら できない) */
export function unequip(s: AdvState, slot: GearSlot): boolean {
  const g = s.gear[slot];
  if (!g || s.bag.length >= BAG_MAX) return false;
  delete s.gear[slot];
  s.bag.push(g);
  applyGear(s);
  return true;
}

/** アイテムの ボタン: 回復の実を 1つ 使う */
export function useHerb(s: AdvState): boolean {
  const i = s.bag.findIndex((b) => b.kind === 'herb');
  return i >= 0 && useBagItem(s, i);
}

function heal(s: AdvState, amount: number): void {
  const p = s.player;
  const got = Math.min(amount, p.maxHp - p.hp);
  p.hp += got;
  s.events.push({ kind: 'heal', amount: got, x: p.x, z: p.z });
}

/** 持ち物を 拾う(足もとに ある 物。いっぱいなら 拾えない) */
function pickUp(s: AdvState): void {
  const p = s.player;
  for (const d of [...s.drops]) {
    if (Math.hypot(d.x - p.x, d.z - p.z) > ADV.pickR) continue;
    if (s.bag.length >= BAG_MAX) {
      if (!d.warned) {
        d.warned = true;
        s.events.push({ kind: 'full' });
      }
      continue;
    }
    s.bag.push(d.item);
    s.drops.splice(s.drops.indexOf(d), 1);
    s.events.push({ kind: 'pick', drop: d });
  }
}

function damage(s: AdvState, from: Actor, to: Actor, mul = 1, tech?: AdvTech): void {
  const crit = from.id === 0 && s.rng() < s.tech / ADV.critDiv;
  const S = ADV.status;
  const Y = ADV.type;
  let m = mul;
  if (from.id === 0) {
    if (s.t < s.atkUpUntil) m *= ADV.tech.buff.up;
    if (tech && s.growType === 'power') m *= Y.powerMul;
  } else {
    if ((from.atkDownUntil ?? 0) > s.t) m *= S.atkDownMul;
    if (s.t < s.shieldUntil) m *= 1 - ADV.tech.barrier.cut;
    if (s.growType === 'tough') m *= Y.toughCut;
  }
  const tough = to.tough * ((to.defDownUntil ?? 0) > s.t ? S.defDownMul : 1);
  const dmg = Math.max(1, Math.round(from.atk * m * (ADV.defK / (ADV.defK + tough)) * (0.9 + s.rng() * 0.2) * (crit ? 1.5 : 1)));
  if (to.sleepUntil) to.sleepUntil = 0;
  if (tech && tech.effect !== 'なし' && to.id !== 0) {
    const chance = S.chance + s.tech / S.techDiv + (s.growType === 'tech' ? Y.techStatus : 0);
    if (s.rng() < chance) setStatus(s, to, tech.effect, dmg);
  }
  to.hp = Math.max(0, to.hp - dmg);
  s.events.push({ kind: 'hit', target: to.id, x: to.x, z: to.z, dmg, crit });
  // ふっとび
  const g = Math.atan2(to.z - from.z, to.x - from.x);
  const k = from.id === 0 ? ADV.player.knock : ADV.mob.knock;
  to.vx = Math.cos(g) * k;
  to.vz = Math.sin(g) * k;
  if (to.hp <= 0) {
    to.act = 'dead';
    to.actT = 0;
    if (to.id !== 0) {
      s.kills++;
      s.events.push({ kind: 'die', id: to.id, x: to.x, z: to.z });
      dropFrom(s, to);
    }
  } else if (to.id === 0 ? to.act !== 'tech' : to.act !== 'attack') {
    // 自分は 技の 間は やられても 止まらない(技が 消えない)
    to.act = 'hurt';
    to.actT = 0;
  }
}

export function stepAdventure(s: AdvState, inp: AdvInput, dt: number): void {
  s.events = [];
  if (s.result !== 'play') return;
  s.t += dt;
  const p = s.player;
  const P = ADV.player;
  // ---- 自分 ----
  p.actT += dt;
  if (p.act === 'hurt' && p.actT > ADV.hurtTime) p.act = 'free';
  if (p.act === 'attack' && p.actT > P.windup + P.recover) p.act = 'free';
  const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
  if (p.act !== 'dead') {
    if (len > 0.1) p.face = Math.atan2(inp.mz, inp.mx);
    // スティックを いっぱいに たおすと 走る(2026-11-07 企画者「もう少し 早く 走って」)
    const run = len > 0.85 ? 1.4 : 1;
    const sp = p.speed * len * run * (p.act === 'attack' || p.act === 'tech' ? 0.35 : p.act === 'hurt' ? 0.4 : 1);
    p.vx += (Math.cos(p.face) * sp * (len > 0.1 ? 1 : 0) - p.vx) * Math.min(1, dt * 12);
    p.vz += (Math.sin(p.face) * sp * (len > 0.1 ? 1 : 0) - p.vz) * Math.min(1, dt * 12);
    moveBy(s, p, p.vx * dt, p.vz * dt, P.r);
    // 攻撃: いちばん 近い モブの ほうを 向く(近ければ)
    if (inp.attack && p.act !== 'attack' && p.act !== 'tech' && s.t >= p.coolUntil) {
      const near = s.mobs.filter((m) => m.act !== 'dead').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near && Math.hypot(near.x - p.x, near.z - p.z) < P.range + 1.2) p.face = Math.atan2(near.z - p.z, near.x - p.x);
      p.act = 'attack';
      p.actT = 0;
      p.struck = false;
      // 続けて 押すと 1・2・3段め(動きが 変わる。3段めは 強い。2026-11-07 企画者「通常攻撃の モーションが 全部 一緒」)
      s.chain = s.t - s.lastAtk < ADV.chain.keep ? (s.chain % 3) + 1 : 1;
      s.lastAtk = s.t;
      p.coolUntil = s.t + P.cool * (1 - Math.min(0.3, s.tech / 500)) * (s.chain === 3 ? 1.6 : 1);
      s.events.push({ kind: 'attack', id: 0 });
    }
    // 技(A〜D)
    const ti = inp.tech;
    const T = ADV.tech;
    if (ti != null && s.techs[ti] && s.t >= s.techCd[ti] && p.act !== 'attack' && p.act !== 'tech') {
      const tc = s.techs[ti]!;
      // 長押しで ねらった 向き(はなすと 発動)。ねらわずに 押した 時は いちばん 近い 敵へ
      s.aimed = inp.techDir != null;
      if (inp.techDir != null) p.face = inp.techDir;
      else {
        const near = nearestMob(s, 9);
        if (!SELF_KINDS.has(tc.kind) && near) p.face = Math.atan2(near.z - p.z, near.x - p.x);
      }
      p.act = 'tech';
      p.actT = 0;
      p.struck = false;
      s.techSlot = ti;
      if (tc.kind === 'drop') {
        const m = s.aimed ? aimedMob(s, p.face, T.drop.reach) : nearestMob(s, T.drop.reach);
        // とぶ きょりは 短く(敵が 遠くても 2.8 まで。瞬間移動に 見えないように)
        const a = m ? Math.atan2(m.z - p.z, m.x - p.x) : p.face;
        const d = Math.min(T.drop.move, m ? Math.max(0, Math.hypot(m.x - p.x, m.z - p.z) - 1) : T.drop.move);
        s.jumpTo = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, sx: p.x, sz: p.z };
      }
      s.techCd[ti] = s.t + tc.cooldown * (1 - Math.min(0.3, s.tech / 500)) * (s.growType === 'speed' ? ADV.type.speedCd : 1);
    }
    if (p.act === 'tech') {
      const wu = techWindup(s.techs[s.techSlot]!.kind);
      // とびおり: ため(空中)の 間に おちる ところへ 近づく(壁の 中には 入らない)
      if (s.jumpTo && !p.struck) {
        const k = Math.min(1, p.actT / wu);
        const nx = s.jumpTo.sx + (s.jumpTo.x - s.jumpTo.sx) * k;
        const nz = s.jumpTo.sz + (s.jumpTo.z - s.jumpTo.sz) * k;
        if (fits(s.floor, nx, nz, P.r)) {
          p.x = nx;
          p.z = nz;
        } else s.jumpTo = { ...s.jumpTo, x: p.x, z: p.z };
      }
      if (!p.struck && p.actT >= wu) {
        p.struck = true;
        fireTech(s, s.techSlot);
      }
      if (p.actT > wu + T.recover && !s.dash && !s.combo) p.act = 'free';
    }
    if (p.act === 'attack' && !p.struck && p.actT >= P.windup) {
      p.struck = true;
      // 種族ごとの 通常攻撃(MONZ RUMBLE と 同じ 考え): ムチ = 遠くまで 細く・水の玉 = 飛ばす・電撃ダッシュ = 少し 前へ・ほかは 目の前
      const J = ADV.jab[s.jab] ?? ADV.jab.punch;
      const mul = s.chain === 3 ? ADV.chain.last : 1;
      if (s.jab === 'shot') {
        const sp = ADV.tech.shot.speed;
        s.shots.push({ id: ++s.seq, x: p.x + Math.cos(p.face) * 0.8, z: p.z + Math.sin(p.face) * 0.8, vx: Math.cos(p.face) * sp, vz: Math.sin(p.face) * sp, r: 0.35, life: 0.6, mul: 0.9 * mul, tech: WATER_JAB });
      } else {
        if (s.jab === 'dash') moveBy(s, p, Math.cos(p.face) * 1.6, Math.sin(p.face) * 1.6, P.r);
        for (const m of inCone(s, p.x, p.z, p.face, J.range, J.arc * (s.chain === 3 ? 1.3 : 1))) {
          m.awake = true;
          damage(s, p, m, mul);
        }
      }
      s.events.push({ kind: 'jab', style: s.jab, chain: s.chain, x: p.x, z: p.z, dir: p.face, range: J.range });
    }
  }
  stepTechs(s, dt);
  // ---- モブ ----
  const M = ADV.mob;
  for (const m of s.mobs) {
    if (m.act === 'dead') continue;
    m.actT += dt;
    // ふっとびの 速さは だんだん 止まる
    moveBy(s, m, m.vx * dt, m.vz * dt, M.r);
    m.vx *= Math.exp(-dt * 8);
    m.vz *= Math.exp(-dt * 8);
    if (m.act === 'hurt') {
      if (m.actT > ADV.hurtTime) m.act = 'free';
      continue;
    }
    // ふらつき・ねむり: 動けない
    if ((m.stunUntil ?? 0) > s.t || (m.sleepUntil ?? 0) > s.t) {
      if (m.act === 'attack') m.act = 'free';
      continue;
    }
    const slow = (m.slowUntil ?? 0) > s.t ? ADV.status.slowMul : 1;
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    if (!m.awake && d < M.aggro && lineOfSight(s.floor, m.x, m.z, p.x, p.z)) m.awake = true;
    if (!m.awake || p.act === 'dead') continue;
    const g = Math.atan2(p.z - m.z, p.x - m.x);
    if (m.act === 'attack') {
      if (!m.struck && m.actT >= M.windup) {
        m.struck = true;
        if (d < M.range + P.r + 0.3 && Math.abs(angDiff(g, m.face)) < 1.2) damage(s, m, p);
      }
      if (m.actT > M.windup + 0.35) m.act = 'free';
      continue;
    }
    m.face = g;
    if (d < M.range + P.r && s.t >= m.coolUntil) {
      m.act = 'attack';
      m.actT = 0;
      m.struck = false;
      m.coolUntil = s.t + M.cool;
      s.events.push({ kind: 'attack', id: m.id });
    } else if (d > M.range * 0.8) {
      moveBy(s, m, Math.cos(g) * m.speed * slow * dt, Math.sin(g) * m.speed * slow * dt, M.r);
    }
  }
  // モブどうし・自分と 重ならない
  const all = [p, ...s.mobs.filter((m) => m.act !== 'dead')];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const min = (a.id === 0 ? P.r : M.r) + M.r;
      if (d < min) {
        const push = (min - d) / 2;
        moveBy(s, a, (-dx / d) * push, (-dz / d) * push, a.id === 0 ? P.r : M.r);
        moveBy(s, b, (dx / d) * push, (dz / d) * push, M.r);
      }
    }
  if (p.act !== 'dead') pickUp(s);
  // 出口
  if (!s.exitOpen && s.mobs.every((m) => m.act === 'dead')) {
    s.exitOpen = true;
    s.events.push({ kind: 'open', x: s.floor.exit.x, z: s.floor.exit.z });
  }
  if (s.exitOpen && Math.hypot(p.x - s.floor.exit.x, p.z - s.floor.exit.z) < 1.4) {
    s.result = 'clear';
    s.events.push({ kind: 'clear' });
  }
  if (p.hp <= 0) {
    s.result = 'lose';
    s.events.push({ kind: 'lose' });
  }
}

/** この 冒険で もらえる ごほうび(勝っても 負けても 倒した ぶんは もらえる【仮】) */
export function adventureReward(s: AdvState): { exp: number; coins: number } {
  const R = ADV.reward;
  const clear = s.result === 'clear';
  return { exp: s.kills * R.mobExp + (clear ? R.clearExp : 0), coins: s.kills * R.mobCoins + (clear ? R.clearCoins : 0) };
}
