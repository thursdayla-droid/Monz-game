/**
 * 冒険の 1階ぶんの 動き(2026-11-07 試作)。Phaser・Three に 依存しない(あとで オンラインに しやすいように)。
 * 自分の MONZ を スティックで 動かし、通常攻撃で モブを 倒す。全部 倒すと 出口が ひらき、出口に 入ると クリア。
 * ステータスは そのまま 反映(企画者)。数字は【仮】
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import { CELL, FLOOR, fits, generateFloor, lineOfSight, cellToWorld, roomAt, setDoor, walkable, type Floor, type Room } from './dungeon';

/**
 * 路地裏(1〜10階)の 敵 10種(2026-11-24 企画者の 案)。絵と 3D は 企画者が 作る → それまで 仮の 形
 * 数値は ぜんぶ【仮】(HP・攻撃・速さは ADV.mob に かける 倍)。出る 階・数・ドロップは 未定
 * style: lunge 体当たり / bite かみつき / slash 剣 / smash 重い パンチ / shot 弾 / web 糸(おそくなる) / wave 超音波(前に 扇) / spore 胞子(まわり) / ambush 化けて 待つ → かみつき
 */
export type MobKind = 'slime' | 'ratz' | 'pige' | 'batz' | 'ghost' | 'spider' | 'mimic' | 'shroom' | 'skele' | 'golem' | 'kingslime' | 'troll';
/** ボスの 技 */
export type BossMove = 'press' | 'spit' | 'summon' | 'club' | 'spin' | 'quake';
export interface MobSpec {
  name: string;
  hp: number;
  atk: number;
  speed: number;
  tough: number;
  style: 'lunge' | 'bite' | 'slash' | 'smash' | 'shot' | 'web' | 'wave' | 'spore' | 'ambush' | 'boss';
  /** とどく 長さ */
  range: number;
  /** 前の 扇の はば(角度の 半分) */
  arc: number;
  windup: number;
  cool: number;
  /** 遠くから 撃つ 敵: この 距離を たもつ */
  keep?: number;
  knock: number;
  fly?: boolean;
  /** 体の 大きさ(当たり判定。なし = ADV.mob.r) */
  size?: number;
  /** ボスの 技の 順番 */
  moves?: BossMove[];
}
export const MOB_KINDS: Record<MobKind, MobSpec> = {
  slime: { name: 'SLIME', hp: 1.0, atk: 1.0, speed: 2.4, tough: 1, style: 'lunge', range: 2.6, arc: 1.2, windup: 0.6, cool: 1.5, knock: 3 },
  ratz: { name: 'RATZ', hp: 0.6, atk: 0.8, speed: 4.3, tough: 0.5, style: 'bite', range: 1.3, arc: 1.0, windup: 0.3, cool: 0.9, knock: 1.5 },
  pige: { name: 'PIGE', hp: 0.6, atk: 0.8, speed: 3.4, tough: 0.5, style: 'shot', range: 7, arc: 0, windup: 0.6, cool: 1.8, keep: 4.5, knock: 1.5, fly: true },
  batz: { name: 'BATZ', hp: 0.5, atk: 0.8, speed: 3.9, tough: 0.5, style: 'wave', range: 3.8, arc: 0.55, windup: 0.6, cool: 1.7, keep: 2.8, knock: 2, fly: true },
  ghost: { name: 'GHOST', hp: 0.7, atk: 1.1, speed: 2.2, tough: 1, style: 'shot', range: 7.5, arc: 0, windup: 0.85, cool: 2.3, keep: 5, knock: 2.5, fly: true },
  spider: { name: 'SPIDER', hp: 1.0, atk: 0.7, speed: 3.0, tough: 1, style: 'web', range: 5.5, arc: 0, windup: 0.6, cool: 2.4, keep: 3.5, knock: 1 },
  mimic: { name: 'MIMIC', hp: 1.3, atk: 1.4, speed: 3.6, tough: 1.5, style: 'ambush', range: 1.6, arc: 1.3, windup: 0.25, cool: 1.1, knock: 3 },
  shroom: { name: 'SHROOM', hp: 1.1, atk: 0.7, speed: 1.6, tough: 1, style: 'spore', range: 2.5, arc: Math.PI, windup: 0.9, cool: 2.4, knock: 1 },
  skele: { name: 'SKELE', hp: 1.0, atk: 1.1, speed: 3.0, tough: 1, style: 'slash', range: 1.9, arc: 1.5, windup: 0.45, cool: 1.2, knock: 2.5 },
  golem: { name: 'GOLEM', hp: 2.2, atk: 1.4, speed: 1.8, tough: 3, style: 'smash', range: 1.9, arc: 1.4, windup: 1.0, cool: 2.2, knock: 5.5 },
  // 5階の 中ボス: ジャンププレス・毒液・小さい スライムを 呼ぶ(2026-11-24 企画者)
  kingslime: { name: 'KING SLIME', hp: 6, atk: 0.85, speed: 2.2, tough: 2, style: 'boss', range: 6, arc: 0, windup: 0.9, cool: 1.4, knock: 4, size: 1.3, moves: ['press', 'spit', 'press', 'summon'] },
  // 10階の ボス: こん棒の 振り下ろし・回転攻撃・衝撃波(2026-11-24 企画者)
  troll: { name: 'ALLEY TROLL', hp: 7, atk: 1.0, speed: 2.4, tough: 3, style: 'boss', range: 3.2, arc: 0.8, windup: 0.9, cool: 1.2, knock: 6, size: 1.5, moves: ['club', 'club', 'spin', 'quake'] },
};
/** 路地裏の ふつうの 敵(ボスを のぞく) */
export const ALLEY_MOBS: MobKind[] = ['slime', 'ratz', 'pige', 'batz', 'ghost', 'spider', 'mimic', 'shroom', 'skele', 'golem'];
/**
 * 階ごとに 出る 敵(2026-11-24 企画者「最初の 方は 弱い 敵・10階に 近くなって 強い 雑魚」)【仮】
 * 同じ 名前を 2回 書くと 出やすい
 */
export const FLOOR_MOBS: Record<number, MobKind[]> = {
  // 2026-11-24 企画者「1階は この 3体(SLIME・RATZ・PIGE)ぐらい。数は 任せる」
  1: ['slime', 'slime', 'ratz', 'ratz', 'pige'],
  2: ['slime', 'slime', 'ratz', 'ratz', 'pige', 'pige'],
  3: ['slime', 'ratz', 'pige', 'pige', 'batz', 'batz'],
  4: ['ratz', 'pige', 'batz', 'batz', 'shroom', 'shroom'],
  5: ['slime', 'slime', 'ratz', 'batz', 'shroom'],
  6: ['pige', 'batz', 'shroom', 'shroom', 'ghost', 'ghost'],
  7: ['batz', 'shroom', 'ghost', 'ghost', 'spider', 'spider'],
  8: ['ghost', 'spider', 'spider', 'mimic', 'skele', 'skele'],
  9: ['spider', 'spider', 'mimic', 'skele', 'skele', 'golem'],
  10: ['ghost', 'spider', 'mimic', 'skele', 'skele', 'golem'],
};
/** ボスの 階(5階 中ボス・10階 ボス) */
export const BOSS_AT: Record<number, MobKind> = { 5: 'kingslime', 10: 'troll' };
/** 路地裏の いちばん 上の 階 */
export const ALLEY_TOP = 10;
/** 敵の 体の 大きさ */
export const mobR = (m: Actor): number => mobSpec(m).size ?? ADV.mob.r;
export const isBoss = (m: Actor): boolean => mobSpec(m).style === 'boss';
/** 敵の 弾(羽・エネルギー弾・クモの 糸) */
export interface MobShot {
  id: number;
  kind: MobKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  life: number;
  from: Actor;
  slow: boolean;
}
export const mobSpec = (m: Actor): MobSpec => MOB_KINDS[(m.mobKind ?? 'slime') as MobKind] ?? MOB_KINDS.slime;

export const ADV = {
  player: { r: 0.55, hp: 60, hpPer: 4, atk: 6, atkPer: 0.5, speed: 4.2, speedPer: 0.03, range: 2.0, arc: 1.25, windup: 0.08, recover: 0.22, cool: 0.34, knock: 3 },
  /** 受ける ダメージ = 攻撃 × K / (K + タフネス) */
  defK: 40,
  critDiv: 400,
  mob: { r: 0.6, hp: 28, atk: 7, speed: 3.0, aggro: 9, range: 1.5, windup: 0.55, cool: 1.3, knock: 2.5 },
  /** 【仮】ごほうび: モブ1体・クリア */
  reward: { mobExp: 5, mobCoins: 3, clearExp: 30, clearCoins: 20 },
  hurtTime: 0.25,
  /** 【仮】階ごとに 敵が 強くなる 割合(1階ふえるごと)。2026-11-24 企画者「10階は ソロで Lv20 で ぎりぎり」 */
  grow: { hp: 0.25, atk: 0.15, tough: 4 },
  /** 【仮】クモの 糸: おそさ・秒 */
  webSlow: 0.55,
  webTime: 1.6,
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
  /** 木箱【仮】: 2回 たたくと こわれる・回復の実 50%・装備 30% */
  crate: { hp: 2, herb: 0.5, gear: 0.3 },
  /** こわせる 置き物と たたく 回数【仮】(2026-11-26 企画者「段ボールと ゴミ箱も 壊せるように」) */
  breakable: { crate: 2, boxes: 1, trash: 2 } as Record<string, number>,
  /** スライムの とびかかりの 時間(秒) */
  hop: { dur: 0.32 },
  /** しかけ【仮】: 箱の 半分の 大きさ・スイッチに のる きょり・鍵で 扉を あける きょり・はまった 箱を もどす 秒 */
  puzzle: { box: 0.85, plate: 0.8, keyDoor: 2.6, stuckReset: 1.6, warp: 1.4 },
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
  /** 敵の 種類(2026-11-24 路地裏の 10種。MOB_KINDS) */
  mobKind?: MobKind;
  /** ボス: 今の 技・何番目・ねらった 場所 */
  bossMove?: BossMove;
  bossStep?: number;
  tx?: number;
  tz?: number;
  /** 状態(時刻) */
  stunUntil?: number;
  slowUntil?: number;
  sleepUntil?: number;
  dotUntil?: number;
  dotTick?: number;
  dotDmg?: number;
  atkDownUntil?: number;
  defDownUntil?: number;
  /** スライムの とびかかり(2026-11-26 企画者「瞬間移動して 攻撃は やめて」→ 少しずつ とぶ) */
  hop?: { t: number; dur: number; dist: number; dir: number; hit: boolean };
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
  | { kind: 'jab'; style: string; chain: number; x: number; z: number; dir: number; range: number; arc: number }
  | { kind: 'heal'; amount: number; x: number; z: number }
  | { kind: 'drop'; drop: Drop }
  | { kind: 'pick'; drop: Drop }
  | { kind: 'full' }
  | { kind: 'clear' }
  | { kind: 'door'; door: number }
  | { kind: 'press'; x: number; z: number }
  | { kind: 'key'; x: number; z: number }
  | { kind: 'boxReset'; x: number; z: number }
  | { kind: 'bossWarn'; move: BossMove; x: number; z: number; dir: number; r: number; time: number }
  | { kind: 'mobFx'; style: string; x: number; z: number; dir: number; r: number; arc: number }
  | { kind: 'crate'; x: number; z: number; prop: number; broken: boolean }
  | { kind: 'lose' };

/**
 * しかけ(2026-11-24 企画者「ギミックと 敵を どんどん 倒して いく」)。部屋 i の しかけを 解くと 扉 i(部屋 i → i+1)が ひらく。
 * kill = 部屋の 敵を 全部 倒す・switch = スイッチを ふむ・box = 箱を おして スイッチに のせる・key = 鍵を ひろって 扉に さわる・none = さいしょから ひらいている
 */
export type PuzzleKind = 'none' | 'kill' | 'switch' | 'box' | 'key';
export interface Puzzle {
  room: number;
  kind: PuzzleKind;
  solved: boolean;
  /** スイッチ(switch・box) */
  plate?: { x: number; z: number; pressed: boolean };
  /** 押す 箱(box)。sx・sz = はじめの 場所(はまったら もどす) */
  box?: { x: number; z: number; sx: number; sz: number; stuck: number };
  /** 鍵(key) */
  key?: { x: number; z: number; taken: boolean };
}

/** こわせる 木箱(2026-11-26 企画者「木箱は 壊れて アイテムが 出る」)。prop = floor.props の 番号 */
export interface Crate {
  cx: number;
  cy: number;
  hp: number;
  prop: number;
}

export interface AdvState {
  floor: Floor;
  crates: Crate[];
  /** 部屋ごとの しかけ(puzzles[i] で 扉 i が ひらく) */
  puzzles: Puzzle[];
  /** 持っている 鍵の 数 */
  keys: number;
  rng: Rng;
  t: number;
  player: Actor;
  /** 0 = 自分。モブは 1 から */
  mobs: Actor[];
  /** モブが いる 部屋(mobRoom[i] = mobs[i] の 部屋) */
  mobRoom: number[];
  tech: number;
  exitOpen: boolean;
  /** 今の 階(1〜) */
  floorNo: number;
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
  /** 敵の 弾 */
  mobShots: MobShot[];
  fields: Field[];
  /** 自分の 守り・強化(時刻) */
  shieldUntil: number;
  atkUpUntil: number;
  /** とっしん 中(当てた モブは 1回だけ) */
  dash: { until: number; hit: number[]; mul: number; speed: number; jab?: boolean } | null;
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
  /** 通常攻撃の 届く 長さ・広さを 変える(擬人化RPG の 試作: ロールと 進化で 決める。なければ 種族の ふつう) */
  jabReach?: { range: number; arc: number };
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

/** 新しい 階。stats: 自分の MONZ の ステータス・level: 階(1〜10。敵の 種類と 強さ) */
/** 種族の 通常攻撃(MOFU ムチ・PUNI 水の玉・ZIPP 電撃ダッシュ・KLAK はさむ・ほかは パンチや 爪) */
export const jabStyleOf = (species: string): string => ({ mofu: 'whip', puni: 'shot', zipp: 'dash', klak: 'snap' } as Record<string, string>)[species] ?? 'punch';
const WATER_JAB: AdvTech = { id: 'punch', kind: 'jab', power: 7, cooldown: 0, element: '水', effect: 'なし', strength: '弱' };

/** 部屋ごとの しかけを 決める(はじまりの 部屋は none・さいごの 部屋は ワープ)。kill・switch・box・key を 1つずつは 入れる */
function makePuzzles(f: Floor, rng: Rng, boss: boolean): Puzzle[] {
  const n = f.doors.length;
  // 2026-11-24 企画者「部屋の ギミックは そんな いらない」→ しかけ(スイッチ・箱・鍵)は 1階に 1つ。ほかは 敵を 倒す 部屋と ひらいた 部屋【仮】
  // ボスの 階は ワープの 前の 部屋が ボスの 部屋(倒すまで 扉が ひらかない)
  const m = boss ? n - 2 : n - 1;
  const kinds: PuzzleKind[] = [(['switch', 'box', 'key'] as PuzzleKind[])[Math.floor(rng() * 3)]];
  while (kinds.length < m) kinds.push(kinds.length % 2 ? 'kill' : 'none');
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const list: PuzzleKind[] = ['none', ...kinds.slice(0, m), ...(boss ? (['kill'] as PuzzleKind[]) : [])];
  return list.map((kind, room) => {
    const r = f.rooms[room];
    const z: Puzzle = { room, kind, solved: kind === 'none' };
    const at = (cx: number, cy: number) => cellToWorld(cx, cy);
    const rnd = () => at(r.x + 1 + Math.floor(rng() * (r.w - 2)), r.y + 1 + Math.floor(rng() * (r.h - 2)));
    if (kind === 'switch') z.plate = { ...rnd(), pressed: false };
    if (kind === 'key') z.key = { ...rnd(), taken: false };
    if (kind === 'box') {
      // 箱と スイッチは 同じ 行(横に おすだけ)。箱の うしろに 1マス あける
      const cy = r.y + Math.floor(r.h / 2);
      const left = rng() < 0.5;
      const bx = left ? r.x + 2 : r.x + r.w - 3;
      const px = left ? r.x + r.w - 2 : r.x + 1;
      const b = at(bx, cy);
      z.box = { x: b.x, z: b.z, sx: b.x, sz: b.z, stuck: 0 };
      z.plate = { ...at(px, cy), pressed: false };
    }
    if (!z.solved) setDoor(f, room, true);
    return z;
  });
}

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
  const mobRoom: number[] = [];
  const boss = BOSS_AT[level];
  const bossRoom = floor.rooms.length - 2;
  const puzzles = makePuzzles(floor, rng, !!boss);
  let forceKind: MobKind | null = null;
  const addMob = (r: Room, room: number) => {
    const c = cellToWorld(r.x + 1 + Math.floor(rng() * (r.w - 2)), r.y + 1 + Math.floor(rng() * (r.h - 2)));
    const m = actor(mobs.length + 1, c.x, c.z);
    const M = ADV.mob;
    const list = FLOOR_MOBS[Math.min(ALLEY_TOP, Math.max(1, level))] ?? ALLEY_MOBS;
    const kind = forceKind ?? list[Math.floor(rng() * list.length)];
    forceKind = null;
    const K = MOB_KINDS[kind];
    m.mobKind = kind;
    const G = ADV.grow;
    m.maxHp = m.hp = Math.round(M.hp * K.hp * (1 + (level - 1) * G.hp));
    m.atk = M.atk * K.atk * (1 + (level - 1) * G.atk);
    m.tough = G.tough * level * K.tough;
    m.speed = K.speed;
    if (K.style === 'boss') {
      // ボスは 部屋の まん中
      const cc = cellToWorld(r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2));
      m.x = cc.x;
      m.z = cc.z;
      m.bossStep = 0;
    }
    m.face = rng() * Math.PI * 2;
    mobs.push(m);
    mobRoom.push(room);
  };
  // 敵: 倒す 部屋は 3〜4体・ほかの 部屋は 0〜2体・はじまりと ワープと ボスの 部屋は なし【仮】
  floor.rooms.forEach((r, i) => {
    if (i === 0 || i === floor.rooms.length - 1 || (boss && i === bossRoom)) return;
    const kind = puzzles[i]?.kind;
    const n = kind === 'kill' ? 3 + Math.floor(rng() * 2) : Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) addMob(r, i);
  });
  // ボスの 階: ワープの 前の 部屋に ボス。たおすまで ワープの 部屋への 扉は ひらかない(2026-11-24 企画者)
  if (boss) {
    forceKind = boss;
    addMob(floor.rooms[bossRoom], bossRoom);
  }
  const ts = [0, 1, 2, 3].map((i) => techs[i] ?? null);
  return {
    floor, crates: floor.props.flatMap((pr, i) => (ADV.breakable[pr.kind] ? [{ cx: pr.cx, cy: pr.cy, hp: ADV.breakable[pr.kind], prop: i }] : [])), puzzles, keys: 0, mobRoom, rng, t: 0, player: p, mobs, tech: stats.tech, exitOpen: true, floorNo: level, result: 'play', kills: 0, events: [],
    techs: ts, techCd: [0, 0, 0, 0], techSlot: -1, bag: [], gear: {}, drops: [], seq: 0,
    shots: [], mobShots: [], fields: [], shieldUntil: 0, atkUpUntil: 0, dash: null, combo: null, jumpTo: null, aimed: false, growType, jab: jabStyleOf(species), chain: 0, lastAtk: -9,
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
// 2026-11-07 企画者「ビームなどの 技は 基本 壁を 貫通しないで」→ 壁の むこうの 敵には 当たらない(出した ところから 見えるか)
const seen = (s: AdvState, x: number, z: number, m: Actor) => lineOfSight(s.floor, x, z, m.x, m.z);
function inCone(s: AdvState, x: number, z: number, dir: number, range: number, arc: number): Actor[] {
  return s.mobs.filter((m) => m.act !== 'dead' && Math.hypot(m.x - x, m.z - z) < range + mobR(m) && Math.abs(angDiff(Math.atan2(m.z - z, m.x - x), dir)) < arc && seen(s, x, z, m));
}
const inCircle = (s: AdvState, x: number, z: number, r: number) => s.mobs.filter((m) => m.act !== 'dead' && Math.hypot(m.x - x, m.z - z) < r + mobR(m) && seen(s, x, z, m));

/** その 向きに 壁まで 何メートル あるか(max まで) */
export function wallDist(s: AdvState, x: number, z: number, dir: number, max: number): number {
  const c = Math.cos(dir);
  const n = Math.sin(dir);
  for (let d = 0; d < max; d += 0.2) if (!walkable(s.floor, x + c * d, z + n * d)) return Math.max(0, d - 0.1);
  return max;
}
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
    return a > -0.5 && a < len && Math.abs(b) < w / 2 + mobR(m);
  });
}
/** その 向き(±0.6)に いる いちばん 近い 敵 */
const aimedMob = (s: AdvState, dir: number, within: number) =>
  s.mobs
    .filter((m) => m.act !== 'dead' && Math.hypot(m.x - s.player.x, m.z - s.player.z) < within && Math.abs(angDiff(Math.atan2(m.z - s.player.z, m.x - s.player.x), dir)) < 0.6)
    .sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
const nearestMob = (s: AdvState, within: number) =>
  s.mobs.filter((m) => m.act !== 'dead' && Math.hypot(m.x - s.player.x, m.z - s.player.z) < within).sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];

/**
 * 技を ねらっている 間に 出す 範囲(2026-11-07 企画者「矢印じゃなくて 技の 範囲を 出して」)。
 * band = 前へ のびる 帯(ビーム・とっしん・弾)・cone = 扇(前を 打つ)・fan = 扇に 広がる 弾・circle = 円(cx,cz が まん中)
 */
export interface AimShape {
  shape: 'band' | 'cone' | 'fan' | 'circle';
  len: number;
  w: number;
  arc: number;
  r: number;
  cx: number;
  cz: number;
  self: boolean;
}
export function aimPreview(s: AdvState, slot: number, dir: number | null): AimShape | null {
  const tc = s.techs[slot];
  if (!tc) return null;
  const p = s.player;
  const T = ADV.tech;
  const area = s.growType === 'tech' ? ADV.type.techArea : 1;
  const d = dir ?? p.face;
  const base = { len: 0, w: 0, arc: 0, r: 0, cx: p.x, cz: p.z, self: false };
  const at = (reach: number) => {
    const m = dir != null ? aimedMob(s, d, reach) : nearestMob(s, reach);
    if (m && lineOfSight(s.floor, p.x, p.z, m.x, m.z)) return { cx: m.x, cz: m.z };
    const k = wallDist(s, p.x, p.z, d, reach * 0.6);
    return { cx: p.x + Math.cos(d) * k, cz: p.z + Math.sin(d) * k };
  };
  switch (tc.kind) {
    case 'beam': {
      const bx = p.x + Math.cos(d) * 0.9;
      const bz = p.z + Math.sin(d) * 0.9;
      return { ...base, shape: 'band', len: Math.max(0.6, wallDist(s, bx, bz, d, T.beam.len)) + 0.9, w: T.beam.w * area };
    }
    case 'rush':
      return { ...base, shape: 'band', len: Math.min(T.rush.dist, wallDist(s, p.x, p.z, d, T.rush.dist)) + T.rush.r, w: T.rush.r * 2 };
    case 'shot': {
      const reach = T.shot.speed * T.shot.life * (s.growType === 'speed' ? ADV.type.speedShot ** 2 : 1);
      return { ...base, shape: 'band', len: wallDist(s, p.x, p.z, d, reach), w: T.shot.r * 2 };
    }
    case 'barrage':
      return { ...base, shape: 'fan', len: T.shot.speed * T.shot.life * (s.growType === 'speed' ? ADV.type.speedShot ** 2 : 1), arc: T.barrage.spread * 2 };
    case 'spin':
      return { ...base, shape: 'circle', r: T.spin.r * area };
    case 'quake':
      return { ...base, shape: 'circle', r: T.quake.r * area };
    case 'debuff':
      return { ...base, shape: 'circle', r: T.debuff.r * area };
    case 'drop': {
      const k = Math.min(T.drop.move, wallDist(s, p.x, p.z, d, T.drop.move));
      return { ...base, shape: 'circle', r: T.drop.r * area, cx: p.x + Math.cos(d) * k, cz: p.z + Math.sin(d) * k };
    }
    case 'pillar':
      return { ...base, shape: 'circle', r: T.pillar.r * area, ...at(T.pillar.reach) };
    case 'field':
      return { ...base, shape: 'circle', r: T.field.r * area, ...at(T.field.reach) };
    case 'heal':
    case 'barrier':
    case 'buff':
      return { ...base, shape: 'circle', r: 1.4, self: true };
    case 'combo':
      return { ...base, shape: 'cone', len: T.combo.range, arc: T.combo.arc * 2 };
    default:
      return { ...base, shape: 'cone', len: T.melee.range + (tc.kind === 'drain' ? 0.6 : 0), arc: T.melee.arc * 2 };
  }
}

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
    if (m && lineOfSight(s.floor, p.x, p.z, m.x, m.z)) return { x: m.x, z: m.z };
    // 敵が いない・壁の むこう: その 向きの 先(壁の 手前まで)
    const d = wallDist(s, p.x, p.z, p.face, reach * 0.6);
    return { x: p.x + Math.cos(p.face) * d, z: p.z + Math.sin(p.face) * d };
  };
  switch (tc.kind) {
    case 'rush':
      // とっしん: 前へ 走って、ぶつかった 敵を 打つ
      s.dash = { until: s.t + T.rush.dist / T.rush.speed, hit: [], mul, speed: T.rush.speed };
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
      {
        // 壁で 止まる
        const bx = p.x + Math.cos(p.face) * 0.9;
        const bz = p.z + Math.sin(p.face) * 0.9;
        const len = Math.max(0.6, wallDist(s, bx, bz, p.face, T.beam.len));
        hitAll(inLine(s, bx, bz, p.face, len, T.beam.w * area));
        ev('beam', T.beam.w * area, len);
      }
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
      moveBy(s, p, Math.cos(p.face) * s.dash.speed * dt, Math.sin(p.face) * s.dash.speed * dt, ADV.player.r);
      if (s.dash.jab) hitCrates(s, (x, z) => Math.hypot(x - p.x, z - p.z) < T.rush.r + 1.1);
      for (const m of inCircle(s, p.x, p.z, T.rush.r)) {
        if (s.dash.hit.includes(m.id)) continue;
        s.dash.hit.push(m.id);
        m.awake = true;
        damage(s, p, m, s.dash.mul, s.dash.jab ? undefined : s.techs[s.techSlot] ?? undefined);
      }
    }
  }
  if (s.combo && s.t >= s.combo.next) {
    const tc = s.techs[s.techSlot] ?? undefined;
    for (const m of inCone(s, p.x, p.z, p.face, T.combo.range, T.combo.arc)) {
      m.awake = true;
      damage(s, p, m, s.combo.mul, tc);
    }
    hitCrates(s, inConeAt(p.x, p.z, p.face, T.combo.range, T.combo.arc));
    s.combo.left--;
    s.combo.next = s.t + T.combo.every;
    if (s.combo.left <= 0) s.combo = null;
  }
  for (const sh of s.shots) {
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    sh.life -= dt;
    if (!fits(s.floor, sh.x, sh.z, 0.05)) {
      sh.life = 0;
      hitCrates(s, (x, z) => Math.abs(x - sh.x) < CELL * 0.6 && Math.abs(z - sh.z) < CELL * 0.6);
    }
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
  dropAt(s, m.x, m.z, ADV.drop.gear, ADV.drop.herb);
}

function dropAt(s: AdvState, x: number, z: number, gearP: number, herbP: number): void {
  const D = ADV.drop;
  const r = s.rng();
  let item: AdvItem | null = null;
  if (r < gearP) {
    const slots: GearSlot[] = ['head', 'armor', 'charm'];
    const slot = slots[Math.floor(s.rng() * 3)];
    let q = s.rng() * D.rank.reduce((a, b) => a + b, 0);
    let rank: Rank = 'D';
    for (let i = 0; i < RANKS.length; i++) if ((q -= D.rank[i]) < 0) {
      rank = RANKS[i];
      break;
    }
    item = { kind: 'gear', slot, rank };
  } else if (r < gearP + herbP) item = { kind: 'herb' };
  if (!item) return;
  const d: Drop = { id: ++s.seq, x, z, item };
  s.drops.push(d);
  s.events.push({ kind: 'drop', drop: d });
}

/**
 * 擬人化RPG の 通常攻撃の 届く 範囲(2026-11-26 企画者「拳闘士にしては 広すぎる」「姿は 変わらないけど 進化したら 攻撃の 長さが 少し 広がる」)。
 * form = 進化(1〜3)【仮】
 */
export function rpgJabReach(role: string, form: number): { range: number; arc: number } {
  // 2026-11-27 企画者「レベル 低い 時は 前の 一マス ぐらいで いい」→ 1.8 → 1.2(敵の 大きさを 足して 約 1マス)
  const base = ({ 拳闘士: { range: 1.2, arc: 0.6 } } as Record<string, { range: number; arc: number }>)[role] ?? { range: 1.2, arc: 0.6 };
  return { range: base.range + (form - 1) * 0.4, arc: base.arc };
}

/** 木箱を たたく(test = その 場所に 攻撃が とどくか)。こわれたら 通れる ように なり、物が 出る */
function hitCrates(s: AdvState, test: (x: number, z: number) => boolean): void {
  for (const c of s.crates) {
    if (c.hp <= 0) continue;
    const x = (c.cx + 0.5) * CELL;
    const z = (c.cy + 0.5) * CELL;
    if (!test(x, z)) continue;
    c.hp--;
    const broken = c.hp <= 0;
    s.events.push({ kind: 'crate', x, z, prop: c.prop, broken });
    if (broken) {
      s.floor.tiles[c.cy * s.floor.w + c.cx] = FLOOR;
      dropAt(s, x, z, ADV.crate.gear, ADV.crate.herb);
    }
  }
}
const inConeAt = (px: number, pz: number, dir: number, range: number, arc: number) => (x: number, z: number) =>
  Math.hypot(x - px, z - pz) < range + 1.0 && Math.abs(angDiff(Math.atan2(z - pz, x - px), dir)) < arc + 0.3;

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
  const k = from.id === 0 ? ADV.player.knock : mobSpec(from).knock;
  // ボスは ほとんど ふっとばない
  const kk = to.id !== 0 && isBoss(to) ? k * 0.1 : k;
  to.vx = Math.cos(g) * kk;
  to.vz = Math.sin(g) * kk;
  if (to.hp <= 0) {
    to.act = 'dead';
    to.actT = 0;
    if (to.id !== 0) {
      s.kills++;
      // ボスを たおすと 呼んだ 敵も 消える(→ 扉が ひらく)
      if (isBoss(to)) {
        s.events.push({ kind: 'open', x: to.x, z: to.z });
        for (const o of s.mobs) if (o !== to && o.act !== 'dead') o.hp = 0, o.act = 'dead';
      }
      s.events.push({ kind: 'die', id: to.id, x: to.x, z: to.z });
      dropFrom(s, to);
    }
  } else if (to.id === 0 ? to.act !== 'tech' : to.act !== 'attack' && !isBoss(to)) {
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
    // 技・攻撃の 間は 向きを 変えない(ねらった 向きに うつ。2026-11-07 企画者「離した 方向に うって」)
    if (len > 0.1 && p.act !== 'tech' && !(p.act === 'attack' && !p.struck)) p.face = Math.atan2(inp.mz, inp.mx);
    // スティックを いっぱいに たおすと 走る(2026-11-07 企画者「もう少し 早く 走って」)
    const run = len > 0.85 ? 1.4 : 1;
    // クモの 糸に 当たると しばらく おそくなる
    const webbed = (p.slowUntil ?? 0) > s.t ? ADV.webSlow : 1;
    const sp = p.speed * len * run * webbed * (p.act === 'attack' || p.act === 'tech' ? 0.35 : p.act === 'hurt' ? 0.4 : 1);
    const mdir = len > 0.1 ? Math.atan2(inp.mz, inp.mx) : p.face;
    p.vx += (Math.cos(mdir) * sp * (len > 0.1 ? 1 : 0) - p.vx) * Math.min(1, dt * 12);
    p.vz += (Math.sin(mdir) * sp * (len > 0.1 ? 1 : 0) - p.vz) * Math.min(1, dt * 12);
    moveBy(s, p, p.vx * dt, p.vz * dt, P.r);
    pushBoxes(s);
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
      const J = s.jabReach ?? ADV.jab[s.jab] ?? ADV.jab.punch;
      const mul = s.chain === 3 ? ADV.chain.last : 1;
      if (s.jab === 'shot') {
        const sp = ADV.tech.shot.speed;
        s.shots.push({ id: ++s.seq, x: p.x + Math.cos(p.face) * 0.8, z: p.z + Math.sin(p.face) * 0.8, vx: Math.cos(p.face) * sp, vz: Math.sin(p.face) * sp, r: 0.35, life: 0.6, mul: 0.9 * mul, tech: WATER_JAB });
      } else {
        // ZIPP の 電撃ダッシュ: 速く 走って ぶつかる(瞬間移動に しない。2026-11-07 企画者「早くても いい」)
        if (s.jab === 'dash') s.dash = { until: s.t + 0.16, hit: [], mul, speed: 13, jab: true };
        else {
          for (const m of inCone(s, p.x, p.z, p.face, J.range, J.arc * (s.chain === 3 ? 1.3 : 1))) {
            m.awake = true;
            damage(s, p, m, mul);
          }
          hitCrates(s, inConeAt(p.x, p.z, p.face, J.range, J.arc * (s.chain === 3 ? 1.3 : 1)));
        }
      }
      // range・arc = 当たる 広さ(モブの 中心まで range + モブの 大きさ・左右 arc)
      s.events.push({ kind: 'jab', style: s.jab, chain: s.chain, x: p.x, z: p.z, dir: p.face, range: J.range + ADV.mob.r, arc: J.arc * (s.chain === 3 ? 1.3 : 1) });
    }
  }
  stepTechs(s, dt);
  // ---- モブ ----
  const M = ADV.mob;
  for (const m of s.mobs) {
    if (m.act === 'dead') continue;
    m.actT += dt;
    // ふっとびの 速さは だんだん 止まる
    moveBy(s, m, m.vx * dt, m.vz * dt, mobR(m));
    m.vx *= Math.exp(-dt * 8);
    m.vz *= Math.exp(-dt * 8);
    if (m.act === 'hurt') {
      m.hop = undefined;
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
    // ミミックは ゴミ箱に 化けて 近くに 来るまで 動かない(奇襲)
    const aggro = mobSpec(m).style === 'ambush' ? 2.4 : M.aggro;
    if (!m.awake && d < aggro && lineOfSight(s.floor, m.x, m.z, p.x, p.z)) {
      m.awake = true;
      if (mobSpec(m).style === 'ambush') m.coolUntil = s.t;
    }
    if (!m.awake || p.act === 'dead') continue;
    const g = Math.atan2(p.z - m.z, p.x - m.x);
    const K = mobSpec(m);
    if (m.act === 'attack') {
      const W = K.style === 'boss' ? bossWindup(m) : K.windup;
      if (m.hop) {
        const h = m.hop;
        const k = Math.min(dt, h.dur - h.t) / h.dur;
        moveBy(s, m, Math.cos(h.dir) * h.dist * k, Math.sin(h.dir) * h.dist * k, mobR(m));
        h.t += dt;
        if (!h.hit && Math.hypot(p.x - m.x, p.z - m.z) < mobR(m) + P.r + 0.3) {
          h.hit = true;
          damage(s, m, p);
        }
        if (h.t >= h.dur) m.hop = undefined;
      }
      if (!m.struck && m.actT >= W) {
        m.struck = true;
        if (K.style === 'boss') bossStrike(s, m, K);
        else mobStrike(s, m, K, d, g);
      }
      if (m.actT > W + (K.style === 'boss' ? 0.6 : K.style === 'lunge' ? ADV.hop.dur + 0.2 : 0.35)) {
        m.act = 'free';
        m.hop = undefined;
      }
      continue;
    }
    m.face = g;
    if (K.style === 'boss') {
      // ボス: 近づきながら 順番に 技(技の 前に ねらう 場所が 出る)
      const mv = K.moves![(m.bossStep ?? 0) % K.moves!.length];
      const far = mv === 'press' || mv === 'spit' || mv === 'summon' || mv === 'quake';
      const reach = far ? 7 : K.range + P.r;
      if (d < reach && s.t >= m.coolUntil && lineOfSight(s.floor, m.x, m.z, p.x, p.z)) {
        m.act = 'attack';
        m.actT = 0;
        m.struck = false;
        m.bossMove = mv;
        m.bossStep = (m.bossStep ?? 0) + 1;
        m.tx = p.x;
        m.tz = p.z;
        // 怒り: HP 半分 以下で 早くなる【仮】
        m.coolUntil = s.t + K.cool * (m.hp < m.maxHp / 2 ? 0.7 : 1);
        s.events.push({ kind: 'attack', id: m.id });
        s.events.push({ kind: 'bossWarn', move: mv, x: mv === 'press' ? p.x : m.x, z: mv === 'press' ? p.z : m.z, dir: g, r: bossReach(mv), time: bossWindup(m) });
      } else if (d > K.range * 0.7) moveBy(s, m, Math.cos(g) * m.speed * slow * dt, Math.sin(g) * m.speed * slow * dt, mobR(m));
      continue;
    }
    const ranged = K.keep !== undefined;
    const reach = K.style === 'spore' || K.style === 'smash' || K.style === 'lunge' ? K.range : K.range + P.r;
    const canHit = d < reach && (!ranged || lineOfSight(s.floor, m.x, m.z, p.x, p.z));
    if (canHit && s.t >= m.coolUntil) {
      m.act = 'attack';
      m.actT = 0;
      m.struck = false;
      m.coolUntil = s.t + K.cool;
      s.events.push({ kind: 'attack', id: m.id });
    } else {
      // 遠くから 撃つ 敵は 間を あける・近い 敵は 近づく
      let dir = 0;
      if (ranged) dir = d > K.keep! + 0.6 || !lineOfSight(s.floor, m.x, m.z, p.x, p.z) ? 1 : d < K.keep! - 1.2 ? -0.7 : 0;
      else if (d > K.range * 0.7) dir = 1;
      if (dir) moveBy(s, m, Math.cos(g) * m.speed * slow * dir * dt, Math.sin(g) * m.speed * slow * dir * dt, mobR(m));
    }
  }
  stepMobShots(s, dt);
  // モブどうし・自分と 重ならない
  const all = [p, ...s.mobs.filter((m) => m.act !== 'dead')];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const min = (a.id === 0 ? P.r : mobR(a)) + mobR(b);
      if (d < min) {
        const push = (min - d) / 2;
        // ボスは おされない
        const ba = a.id !== 0 && isBoss(a);
        const bb = isBoss(b);
        const pa = ba ? 0 : bb ? push * 2 : push;
        const pb = bb ? 0 : ba ? push * 2 : push;
        moveBy(s, a, (-dx / d) * pa, (-dz / d) * pa, a.id === 0 ? P.r : mobR(a));
        moveBy(s, b, (dx / d) * pb, (dz / d) * pb, mobR(b));
      }
    }
  if (p.act !== 'dead') pickUp(s);
  stepPuzzles(s, dt);
  // ワープ(さいごの 部屋。2026-11-24 企画者「次の 階に 行ける ワープ」)。扉を ぜんぶ ひらかないと 来られない
  if (s.exitOpen && p.act !== 'dead' && Math.hypot(p.x - s.floor.exit.x, p.z - s.floor.exit.z) < ADV.puzzle.warp) {
    s.result = 'clear';
    s.events.push({ kind: 'clear' });
  }
  if (p.hp <= 0) {
    s.result = 'lose';
    s.events.push({ kind: 'lose' });
  }
}

/** 箱を おす: 自分が 箱に 重なったら、当たった 面の 向きに 箱を おす(おせない 時は 自分が 止まる) */
function pushBoxes(s: AdvState): void {
  const p = s.player;
  const r = ADV.player.r;
  const B = ADV.puzzle.box;
  for (const z of s.puzzles) {
    const b = z.box;
    if (!b || z.solved) continue;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const ox = B + r - Math.abs(dx);
    const oz = B + r - Math.abs(dz);
    if (ox <= 0 || oz <= 0) continue;
    if (ox < oz) {
      const mv = -Math.sign(dx) * ox;
      if (fits(s.floor, b.x + mv, b.z, B)) b.x += mv;
      else p.x += Math.sign(dx) * ox;
    } else {
      const mv = -Math.sign(dz) * oz;
      if (fits(s.floor, b.x, b.z + mv, B)) b.z += mv;
      else p.z += Math.sign(dz) * oz;
    }
  }
}

/** しかけを 見る(スイッチ・箱・鍵・敵)。解けたら 扉を ひらく */
function stepPuzzles(s: AdvState, dt: number): void {
  const p = s.player;
  const Z = ADV.puzzle;
  s.puzzles.forEach((z, i) => {
    if (z.solved) return;
    let done = false;
    if (z.kind === 'kill') done = s.mobs.every((m, k) => s.mobRoom[k] !== i || m.act === 'dead');
    else if (z.kind === 'switch' && z.plate) {
      if (Math.hypot(p.x - z.plate.x, p.z - z.plate.z) < Z.plate) done = true;
    } else if (z.kind === 'box' && z.box && z.plate) {
      const b = z.box;
      if (Math.hypot(b.x - z.plate.x, b.z - z.plate.z) < Z.plate) {
        b.x = z.plate.x;
        b.z = z.plate.z;
        done = true;
      } else {
        // かべに くっついて 動かせなく なったら、はじめの 場所へ もどす
        const stuck = !fits(s.floor, b.x + 0.2, b.z, Z.box) || !fits(s.floor, b.x - 0.2, b.z, Z.box) || !fits(s.floor, b.x, b.z + 0.2, Z.box) || !fits(s.floor, b.x, b.z - 0.2, Z.box);
        b.stuck = stuck ? b.stuck + dt : 0;
        if (b.stuck > Z.stuckReset && Math.hypot(p.x - b.sx, p.z - b.sz) > Z.box + ADV.player.r + 0.3) {
          s.events.push({ kind: 'boxReset', x: b.x, z: b.z });
          b.x = b.sx;
          b.z = b.sz;
          b.stuck = 0;
        }
      }
    } else if (z.kind === 'key' && z.key) {
      const k = z.key;
      if (!k.taken && Math.hypot(p.x - k.x, p.z - k.z) < ADV.pickR) {
        k.taken = true;
        s.keys++;
        s.events.push({ kind: 'key', x: k.x, z: k.z });
      }
      const d = s.floor.doors[i];
      if (s.keys > 0 && d && Math.hypot(p.x - d.x, p.z - d.z) < Z.keyDoor) {
        s.keys--;
        done = true;
      }
    }
    if (!done) return;
    z.solved = true;
    if (z.plate) {
      z.plate.pressed = true;
      s.events.push({ kind: 'press', x: z.plate.x, z: z.plate.z });
    }
    setDoor(s.floor, i, false);
    s.events.push({ kind: 'door', door: i });
  });
}

/** 敵の 攻撃が 出る 時 */
function mobStrike(s: AdvState, m: Actor, K: MobSpec, d: number, g: number): void {
  const p = s.player;
  const P = ADV.player;
  if (K.style === 'shot' || K.style === 'web') {
    const sp = K.style === 'web' ? 7 : m.mobKind === 'ghost' ? 6 : 9;
    s.mobShots.push({ id: ++s.seq, kind: m.mobKind ?? 'slime', x: m.x + Math.cos(m.face) * 0.6, z: m.z + Math.sin(m.face) * 0.6, vx: Math.cos(m.face) * sp, vz: Math.sin(m.face) * sp, r: m.mobKind === 'ghost' ? 0.45 : 0.3, life: K.range / sp + 0.3, from: m, slow: K.style === 'web' });
    return;
  }
  if (K.style === 'lunge') {
    // 体当たり: 前へ とびこむ(2026-11-26 企画者「瞬間移動して 攻撃は やめて」→ 0.3秒 かけて とぶ。とんでいる 間に ぶつかると 当たる)
    const before = Math.hypot(p.x - m.x, p.z - m.z);
    m.hop = { t: 0, dur: ADV.hop.dur, dist: Math.min(K.range - 0.6, Math.max(0, before - 0.9)) + 0.4, dir: m.face, hit: false };
    return;
  }
  s.events.push({ kind: 'mobFx', style: K.style, x: m.x, z: m.z, dir: m.face, r: K.range, arc: K.arc });
  if (K.style === 'spore' || K.style === 'smash' ? d < K.range + P.r : d < K.range + P.r + 0.3 && Math.abs(angDiff(g, m.face)) < K.arc) {
    if (K.style !== 'wave' || lineOfSight(s.floor, m.x, m.z, p.x, p.z)) damage(s, m, p);
  }
}

/** ボスの 技の ため時間 */
function bossWindup(m: Actor): number {
  const W: Record<BossMove, number> = { press: 1.0, spit: 0.7, summon: 0.8, club: 0.85, spin: 0.9, quake: 1.3 };
  return W[m.bossMove ?? 'club'];
}
/** ボスの 技の 広さ */
function bossReach(mv: BossMove): number {
  return ({ press: 2.6, spit: 7, summon: 2, club: 3.4, spin: 3.0, quake: 5.5 } as Record<BossMove, number>)[mv];
}
function bossStrike(s: AdvState, m: Actor, K: MobSpec): void {
  const p = s.player;
  const P = ADV.player;
  const mv = m.bossMove ?? 'club';
  const r = bossReach(mv);
  const d = () => Math.hypot(p.x - m.x, p.z - m.z);
  s.events.push({ kind: 'mobFx', style: mv, x: m.x, z: m.z, dir: m.face, r, arc: mv === 'club' ? K.arc : Math.PI });
  if (mv === 'press') {
    // ジャンプして ねらった 場所に 落ちる
    const tx = m.tx ?? p.x;
    const tz = m.tz ?? p.z;
    if (fits(s.floor, tx, tz, mobR(m))) {
      m.x = tx;
      m.z = tz;
    }
    s.events.push({ kind: 'mobFx', style: 'smash', x: m.x, z: m.z, dir: 0, r, arc: Math.PI });
    if (d() < r + P.r) damage(s, m, p, 1.2);
  } else if (mv === 'spit') {
    // 毒液: 3方向
    for (const off of [-0.35, 0, 0.35]) {
      const a = m.face + off;
      s.mobShots.push({ id: ++s.seq, kind: 'kingslime', x: m.x + Math.cos(a) * 1.3, z: m.z + Math.sin(a) * 1.3, vx: Math.cos(a) * 7, vz: Math.sin(a) * 7, r: 0.4, life: 1.2, from: m, slow: false });
    }
  } else if (mv === 'summon') {
    // 小さい スライムを 2体 呼ぶ(部屋の 中に 4体まで)
    const room = s.mobRoom[s.mobs.indexOf(m)];
    const alive = s.mobs.filter((o, k) => s.mobRoom[k] === room && o !== m && o.act !== 'dead').length;
    for (let k = 0; k < Math.min(2, 4 - alive); k++) {
      const a = m.face + Math.PI / 2 + k * Math.PI;
      const x = m.x + Math.cos(a) * 2;
      const z = m.z + Math.sin(a) * 2;
      if (!fits(s.floor, x, z, ADV.mob.r)) continue;
      const c = actor(Math.max(...s.mobs.map((o) => o.id)) + 1, x, z);
      const S = MOB_KINDS.slime;
      c.mobKind = 'slime';
      c.maxHp = c.hp = Math.round(ADV.mob.hp * S.hp * 0.6 * (1 + (s.floorNo - 1) * ADV.grow.hp));
      c.atk = ADV.mob.atk * S.atk * (1 + (s.floorNo - 1) * ADV.grow.atk);
      c.tough = ADV.grow.tough * s.floorNo;
      c.speed = S.speed;
      c.awake = true;
      c.coolUntil = s.t + 1;
      s.mobs.push(c);
      s.mobRoom.push(room);
    }
  } else if (mv === 'club') {
    const g = Math.atan2(p.z - m.z, p.x - m.x);
    if (d() < r + P.r && Math.abs(angDiff(g, m.face)) < K.arc) damage(s, m, p, 1.5);
  } else if (mv === 'spin') {
    if (d() < r + P.r) damage(s, m, p, 1.0);
  } else if (mv === 'quake') {
    // 衝撃波: 広い 輪。近いほど 強い
    if (d() < r + P.r) damage(s, m, p, d() < 2.5 ? 1.0 : 0.6);
  }
}

function stepMobShots(s: AdvState, dt: number): void {
  const p = s.player;
  for (const sh of s.mobShots) {
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    sh.life -= dt;
    if (!walkable(s.floor, sh.x, sh.z)) sh.life = 0;
    else if (p.act !== 'dead' && Math.hypot(p.x - sh.x, p.z - sh.z) < sh.r + ADV.player.r) {
      damage(s, sh.from, p, sh.slow ? 0.6 : 1);
      if (sh.slow) p.slowUntil = s.t + ADV.webTime;
      sh.life = 0;
    }
  }
  s.mobShots = s.mobShots.filter((x) => x.life > 0);
}

/** 今 いる 部屋(部屋の 外は -1) */
export const playerRoom = (s: AdvState): number => roomAt(s.floor, s.player.x, s.player.z);

/** この 冒険で もらえる ごほうび(勝っても 負けても 倒した ぶんは もらえる【仮】) */
export function adventureReward(s: AdvState): { exp: number; coins: number } {
  const R = ADV.reward;
  const clear = s.result === 'clear';
  return { exp: s.kills * R.mobExp + (clear ? R.clearExp : 0), coins: s.kills * R.mobCoins + (clear ? R.clearCoins : 0) };
}
