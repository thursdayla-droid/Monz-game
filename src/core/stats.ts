import type { SpeciesId } from './species';

/**
 * ステータス(企画者仕様 Ver.1・2026-10-20)。Phaserに依存しない。
 * 通常ステータス5種(HP・パワー・タフネス・スピード・テクニック)と、愛。
 * 小数のずれが出ないよう、中では「0.1 を 1」とした整数で持つ(例: 3.0 → 30)。画面に出すときだけ小数にする。
 */
export const STAT_KEYS = ['hp', 'power', 'tough', 'speed', 'tech'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** 5種の値(0.1 を 1 とした整数) */
export type StatBlock = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  power: 'パワー',
  tough: 'タフネス',
  speed: 'スピード',
  tech: 'テクニック',
};

/** レベルが1上がるごとの、自動成長の合計(3.0)と、自由に振り分けるポイント(0.1)【確定】 */
export const AUTO_GROWTH_PER_LEVEL = 30;
export const FREE_POINTS_PER_LEVEL = 1;

export const zeroStats = (): StatBlock => ({ hp: 0, power: 0, tough: 0, speed: 0, tech: 0 });

/**
 * キャラクターごとの初期ステータスと、1レベルで上がる量(どちらも 0.1 を 1 とした整数)。
 * growth の合計は必ず AUTO_GROWTH_PER_LEVEL(3.0)。テストで確かめる。
 * 【仮】BUNKは企画者の仮の設定(2026-10-20)。ほかのMONZは素材がそろってから決める。
 */
export const SPECIES_STATS: Partial<Record<SpeciesId, { base: StatBlock; growth: StatBlock }>> = {
  bunk: {
    base: { hp: 100, power: 80, tough: 80, speed: 40, tech: 50 },
    growth: { hp: 6, power: 9, tough: 8, speed: 3, tech: 4 },
  },
};

/** 決まっていないMONZは、5種に同じだけ(仮) */
const FALLBACK = { base: { hp: 60, power: 60, tough: 60, speed: 60, tech: 60 }, growth: { hp: 6, power: 6, tough: 6, speed: 6, tech: 6 } };

export const speciesStats = (species: SpeciesId) => SPECIES_STATS[species] ?? FALLBACK;

export const addStats = (a: StatBlock, b: StatBlock, times = 1): StatBlock =>
  Object.fromEntries(STAT_KEYS.map((k) => [k, a[k] + b[k] * times])) as StatBlock;

/** Lv.level までの自動成長(レベルアップ (level−1) 回ぶん) */
export const autoGrowthAt = (species: SpeciesId, level: number): StatBlock => addStats(zeroStats(), speciesStats(species).growth, Math.max(0, level - 1));

/** 0.1 を 1 とした整数を、画面に出す文字にする(例: 95 → "9.5") */
export const fmt = (tenths: number): string => (tenths / 10).toFixed(1);

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
