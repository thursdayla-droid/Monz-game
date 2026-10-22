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
/** 企画者決定(2026-10-20): 通常ステータスの最大は150(ゲージも150でいっぱい) */
export const STAT_MAX = 150;

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

/**
 * レベルアップ1回ぶんの自動成長(合計3を、入りやすさの割合でランダムに)。
 * now: 今のステータス。最大(150)の能力には入らず、ほかに回る(全部最大なら増えない)。
 */
export function rollAutoGrowth(species: SpeciesId, rng: Rng, now?: StatBlock): StatBlock {
  const w = speciesStats(species).weight;
  const out = zeroStats();
  for (let i = 0; i < AUTO_GROWTH_PER_LEVEL; i++) {
    const room = (k: StatKey) => (now ? now[k] + out[k] < STAT_MAX : true);
    const total = STAT_KEYS.reduce((s, k) => s + (room(k) ? w[k] : 0), 0);
    const r0 = rng();
    if (total <= 0) continue;
    let r = r0 * total;
    const k = STAT_KEYS.find((key) => room(key) && (r -= w[key]) < 0) ?? STAT_KEYS.filter(room).pop()!;
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
  const base = speciesStats(species).base;
  for (let lv = 2; lv <= level; lv++) sum = addStats(sum, rollAutoGrowth(species, levelUpRng(uid, lv), addStats(base, sum)));
  return sum;
}

/**
 * 愛【確定】: レベルでは上がらず、お世話で育つ。自由ポイントは振り分けられない。
 * 企画者決定(2026-10-21「あまり簡単に上げたくない」): ごはん1回で +0.5。
 * お腹のゲージ(見えない。10目もり、1時間に1へる、ごはんで2もどる)が 8 以下のとき(2目もり ぜんぶ食べられるとき)だけ増える。
 * なでると +0.2(2026-10-21 変更)。なでるのゲージが 9 以下(1目もり もどせるとき)だけ。1日の上限はない(ゲージが上限のかわり)。画面には整数(切り捨て)で出す。
 * へる(企画者決定 2026-10-21): お腹のゲージが 0 のまま2時間で −0.1。なでるのゲージが 0 のまま2時間でも −0.1(両方なら −0.2)。0 より下にはならない。
 */
export const LOVE_RULES = {
  // 企画者決定(2026-10-22): 愛は0から(前は20)
  initial: 0,
  max: 100,
  feed: 0.5,
  pet: 0.2,
  /** このなでるのゲージ以下のときだけ、なでると愛が増える(0.9 = 9/10) */
  petAtMost: 0.9,
  /** このお腹のぐあい以下のときのごはんだけ、愛が増える(full: 1=満腹。0.8 = ゲージ 8/10) */
  feedAtMost: 0.8,
  /** ゲージが 0 のまま、この秒数たつごとに neglect だけへる */
  neglectSec: 7200,
  neglect: 0.1,
} as const;

/** 画面に出す愛(0.5 きざみで持っているのを、整数に切り捨てて出す) */
export const shownLove = (love: number): number => Math.floor(love + 1e-9);

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
