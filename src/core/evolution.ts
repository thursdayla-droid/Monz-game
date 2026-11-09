/**
 * 進化(2026-11-09 企画者: Lv.30 で 第2形態・Lv.60 で 第3形態。お世話画面の 姿が 変わる。光って 変身。名前は 絵の 名前)。
 * 進化しても レベル・ステータスは そのまま(docs/EVOLUTION.md)。MONZ RUMBLE・冒険の 姿は まだ 変えない【未確定】
 */
export const EVOLVE_LEVELS = [30, 60] as const;

/** 種族ごとの 名前(第1・第2・第3形態) */
export const EVO_NAMES: Record<string, [string, string, string]> = {
  bunk: ['BUNK', 'BUNKER', 'BUNKLORD'],
  mofu: ['MOFU', 'MOFUR', 'MOFUGARD'],
  zipp: ['ZIPP', 'ZIPRO', 'ZIPRAX'],
  puni: ['PUNI', 'PUNISH', 'PUNISHROOM'],
  klak: ['KLAK', 'KLAKER', 'KLAKTRAP'],
  riot: ['RIOT', 'RIOTER', 'RIOTRAX'],
  snek: ['SNEK', 'SNEKER', 'SNEKXUS'],
  grit: ['GRIT', 'GRITTER', 'GRITBULL'],
  vybe: ['VYBE', 'VYGA', 'VYGARD'],
  shellz: ['SHELLZ', 'SHELD', 'SHELDOZER'],
  crownie: ['CROWNIE', 'CROWNIX', 'CROWNOR'],
};

/** 何形態目か(1〜3) */
export const formOf = (level: number): 1 | 2 | 3 => (level >= EVOLVE_LEVELS[1] ? 3 : level >= EVOLVE_LEVELS[0] ? 2 : 1);

/** その レベルでの 名前 */
export const evoName = (species: string, level: number): string => EVO_NAMES[species]?.[formOf(level) - 1] ?? species.toUpperCase();

/** お世話画面の 絵の 名前(第1形態は 種族の まま・進化したら <種族>_f2 / _f3) */
export const careArtId = (species: string, level: number): string => {
  const f = formOf(level);
  return f > 1 && EVO_NAMES[species] ? `${species}_f${f}` : species;
};

/** from → to の レベルで 進化したか(進化した 形態。しなければ 0) */
export const evolvedAt = (from: number, to: number): 0 | 2 | 3 => {
  const a = formOf(from);
  const b = formOf(to);
  return b > a ? (b as 2 | 3) : 0;
};
