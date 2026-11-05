/**
 * MONZ RUMBLE の 相手(CPU)の 作り方。Phaser に 依存しない(テスト・バランス調べのため)。
 * 種族の はじめのステータス + レベルの 育ち + 自由ポイント(1レベル1つ。ランダムに かたよらせる)
 */
import { instinctFor, type AutoEntrant } from '../autobattle/engine';
import { mulberry32 } from '../rng';
import type { SpeciesId } from '../species';
import { addStats, autoGrowthAt, speciesStats, STAT_KEYS, type StatBlock } from '../stats';

export function foeEntrant(level: number, seed: number, species = 'bunk', name = 'ライバル'): AutoEntrant {
  const sp = species as SpeciesId;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let stats: StatBlock = addStats(speciesStats(sp).base, autoGrowthAt(sp, `rival:${seed}`, level));
  // 自由ポイント(1レベル1つ)を、ランダムに かたよらせて 振る(相手ごとに 戦い方が 変わるように)
  const fav = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)];
  const free = { hp: 0, power: 0, tough: 0, speed: 0, tech: 0 } as StatBlock;
  for (let i = 1; i < level; i++) free[rng() < 0.6 ? fav : STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)]]++;
  stats = addStats(stats, free);
  return { name, species: sp, stats, instinct: instinctFor(sp, stats) };
}
