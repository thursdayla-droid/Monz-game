import type { SpeciesId } from './species';

import { mulberry32, type Rng } from './rng';

/**
 * ステータス(企画者仕様 Ver.1 → 2026-10-20 変更: 小数をやめて整数にする)。Phaserに依存しない。
 * 通常ステータス5種(HP・パワー・タフネス・スピード・テクニック)と、愛。
 */
export const STAT_KEYS = ['hp', 'power', 'tough', 'speed', 'tech'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatBlock = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  power: 'パワー',
  tough: 'タフネス',
  speed: 'スピード',
  tech: 'テクニック',
};

/** 企画者決定(2026-10-20): レベルが1上がるごとに、自動でランダムに合計3、自由に振り分けるポイント1 */
export const AUTO_GROWTH_PER_LEVEL = 3;
export const FREE_POINTS_PER_LEVEL = 1;

export const zeroStats = (): StatBlock => ({ hp: 0, power: 0, tough: 0, speed: 0, tech: 0 });

/**
 * キャラクターごとの初期ステータスと、自動成長の「入りやすさ」。
 * 自動成長の3ポイントは、1ポイントずつランダムに、入りやすさの割合で入る(得意な能力ほど伸びやすい)。
 * 【仮】BUNKは企画者の仮の設定(2026-10-20)。入りやすさは、以前の成長率(0.6・0.9・0.8・0.3・0.4)の割合のまま。
 */
export const SPECIES_STATS: Partial<Record<SpeciesId, { base: StatBlock; weight: StatBlock }>> = {
  bunk: {
    base: { hp: 10, power: 8, tough: 8, speed: 4, tech: 5 },
    weight: { hp: 6, power: 9, tough: 8, speed: 3, tech: 4 },
  },
};

/** 決まっていないMONZは、5種に同じだけ(仮) */
const FALLBACK = { base: { hp: 6, power: 6, tough: 6, speed: 6, tech: 6 }, weight: { hp: 1, power: 1, tough: 1, speed: 1, tech: 1 } };

export const speciesStats = (species: SpeciesId) => SPECIES_STATS[species] ?? FALLBACK;

export const addStats = (a: StatBlock, b: StatBlock): StatBlock => Object.fromEntries(STAT_KEYS.map((k) => [k, a[k] + b[k]])) as StatBlock;

/** レベルアップ1回ぶんの自動成長(合計3を、入りやすさの割合でランダムに) */
export function rollAutoGrowth(species: SpeciesId, rng: Rng): StatBlock {
  const w = speciesStats(species).weight;
  const total = STAT_KEYS.reduce((s, k) => s + w[k], 0);
  const out = zeroStats();
  for (let i = 0; i < AUTO_GROWTH_PER_LEVEL; i++) {
    let r = rng() * total;
    const k = STAT_KEYS.find((key) => (r -= w[key]) < 0) ?? STAT_KEYS[STAT_KEYS.length - 1];
    out[k]++;
  }
  return out;
}

/** そのMONZの、そのレベルに上がったときの乱数(MONZの番号とレベルから決まる。同じなら同じ結果になる) */
export function levelUpRng(uid: string, level: number): Rng {
  let h = 2166136261;
  for (const c of `${uid}:${level}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return mulberry32(h >>> 0);
}

/** Lv.level までの自動成長の合計(Lv.2〜Lv.level に上がったぶん) */
export function autoGrowthAt(species: SpeciesId, uid: string, level: number): StatBlock {
  let sum = zeroStats();
  for (let lv = 2; lv <= level; lv++) sum = addStats(sum, rollAutoGrowth(species, levelUpRng(uid, lv)));
  return sum;
}

/**
 * 愛【確定】: レベルでは上がらず、お世話で育つ。自由ポイントは振り分けられない。
 * 【仮】数字は企画者の仮の設定(2026-10-20)。連続操作ですぐ最大にならない工夫は【仮】案C:
 * 1日に増やせる量に上限 + ごはんはお腹がすいている時だけ・なでるは喜んだ時だけ増える。
 */
export const LOVE_RULES = {
  initial: 20,
  max: 100,
  feed: 2,
  pet: 1,
  /** 1日に増やせる量(ごはん2回ぶん・なでる3回ぶん) */
  feedDailyCap: 4,
  petDailyCap: 3,
  /** これよりお腹が減っている時のごはんだけ、愛が増える(full: 1=満腹) */
  hungryBelow: 0.5,
  /** 放っておいても減らない(当面) */
  decayPerDay: 0,
} as const;

/** 育てたステータスの元データ(セーブデータに入っている分け方) */
export interface StatSource {
  species: SpeciesId;
  auto: StatBlock;
  alloc: StatBlock;
  love: number;
}

/** 今のステータス = 初期値 + 自動成長 + 自由振り分け(保存はせず、使うたびに計算する) */
export const currentStats = (m: StatSource): StatBlock => addStats(addStats(speciesStats(m.species).base, m.auto), m.alloc);

/** ゲームモード【確定】: CPUバトル・ソロ冒険はそのまま。オンライン対戦・MOBAは補正(方法は未確定)。協力ダンジョンは未定 */
export type GameMode = 'cpuBattle' | 'adventure' | 'online' | 'moba' | 'coop';

/**
 * そのモードで使う強さ。元データは変えない(毎回ここで計算する)。
 * 【未確定】オンライン・MOBA・協力ダンジョンの補正方法が決まったら、ここに入れる。今は補正なし。
 */
export function statsForMode(m: StatSource, _mode: GameMode): { stats: StatBlock; love: number } {
  return { stats: currentStats(m), love: m.love };
}

/**
 * 愛の特殊能力(踏みとどまる・復活する)の判定。1回の試合・冒険につき uses 回まで。
 * 【未確定】確率の式は企画者が決める(chance に渡す)。rng は試合ごとの種から作った乱数(あとで再現できる)。
 */
export function tryLoveSave(love: number, used: number, rng: () => number, chance: (love: number) => number, uses = 1): boolean {
  if (used >= uses) return false;
  return rng() < Math.max(0, Math.min(1, chance(love)));
}
