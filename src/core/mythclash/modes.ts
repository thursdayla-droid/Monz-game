/**
 * MYTHCLASH のストーリーモード(タワー)とバトルモード(企画者決定 2026-10-27)。Phaserに依存しない。
 * - ストーリー: タワー1階〜10階。1つの階は ざこ2戦 → 3戦目がその階のボス。HPは1戦ごとに全部もどる。
 *   負けたら(降参も)その階の1戦目から。クリアした階は覚えていて、1階〜(クリアした階の次)から選んで始められる。クリアした階もまた遊べる。
 * - バトルモード: CPUの強さ(弱い・普通・強い)を選んで1回バトル。
 * - コイン(企画者「それでいい」): バトルモードの勝ち 弱い100・普通200・強い400。負け・降参・引き分けは0。
 *   ストーリーは階をクリアしたとき: はじめて 500×階、クリアずみの階は その2割。
 * - 経験値はお世話しているMONZに入る(企画者)。【仮】数字は下の表
 */
import type { Rarity } from './cards';
import type { CpuLevel } from './cpu';

export const TOWER_FLOORS = 10;
/** 1つの階の戦い(ざこ2戦・ボス1戦) */
export const BATTLES_PER_FLOOR = 3;

export interface TowerBattle {
  /** 相手のカード(先頭から出る)。毎回同じ(何度も挑戦して作戦を立てられるように) */
  deck: number[];
  cpu: CpuLevel;
  boss: boolean;
}

/**
 * 各階の相手【仮：カードの選び方は企画者に見せて確認】。
 * レアの並び(案を企画者に見せた表のとおり): 1階 ざこN3・ボスR1N2 → … → 10階 ざこUR1SR2・ボスUR3。
 * CPU: 1〜3階は ざこ弱い・ボス普通、4〜10階は ざこ普通・ボス強い
 */
const FLOORS: [number[], number[], number[]][] = [
  [[89, 62, 22], [60, 69, 81], [61, 82, 91]],
  [[7, 12, 20], [23, 43, 85], [33, 63, 92]],
  [[59, 5, 10], [78, 13, 41], [9, 90, 2]],
  [[6, 15, 47], [66, 67, 55], [77, 17, 19]],
  [[96, 11, 49], [31, 36, 32], [70, 93, 38]],
  [[80, 40, 42], [14, 46, 72], [57, 64, 99]],
  [[1, 16, 76], [21, 75, 84], [95, 35, 87]],
  [[77, 70, 93], [80, 14, 57], [58, 8, 28]],
  [[8, 64, 99], [58, 1, 16], [3, 86, 29]],
  [[95, 21, 75], [3, 35, 87], [74, 27, 34]],
];

export const TOWER: TowerBattle[][] = FLOORS.map((battles, i) =>
  battles.map((deck, b) => ({ deck, boss: b === BATTLES_PER_FLOOR - 1, cpu: i < 3 ? (b === BATTLES_PER_FLOOR - 1 ? 'normal' : 'weak') : b === BATTLES_PER_FLOOR - 1 ? 'strong' : 'normal' })),
);

export const towerBattle = (floor: number, battle: number): TowerBattle => TOWER[floor - 1][battle];

/** 遊べる階(1階〜クリアした階の次。10階まで) */
export const towerOpenFloors = (cleared: number): number => Math.min(TOWER_FLOORS, Math.max(0, cleared) + 1);

/** 階をクリアしたときの報酬。はじめては多く、クリアずみの階は2割(企画者 2026-10-27) */
export const TOWER_REWARD = { coinsPerFloor: 500, expPerFloor: 20, replayRate: 0.2 } as const;
export function towerReward(floor: number, first: boolean): { coins: number; exp: number } {
  const r = first ? 1 : TOWER_REWARD.replayRate;
  return { coins: Math.round(TOWER_REWARD.coinsPerFloor * floor * r), exp: Math.round(TOWER_REWARD.expPerFloor * floor * r) };
}

/** バトルモード: 相手のカードのレアと、勝ったときの報酬(負けは0)。経験値は【仮】 */
export const BATTLE_MODE: Record<CpuLevel, { rarities: Rarity[]; coins: number; exp: number }> = {
  weak: { rarities: ['N', 'R'], coins: 100, exp: 5 },
  normal: { rarities: ['R', 'SR'], coins: 200, exp: 10 },
  strong: { rarities: ['SR', 'UR'], coins: 400, exp: 20 },
};

/** バトル画面に渡す、どのモードの戦いか */
export type MythMatch = { mode: 'battle'; level: CpuLevel } | { mode: 'tower'; floor: number; battle: number; runId: string };
