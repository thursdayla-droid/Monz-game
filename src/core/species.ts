/**
 * MONZの種類(キャラクター図鑑)。Phaserに依存しない。キャラクターを増やすときは、ここに1つ足す。
 * 企画者決定(2026-10-20): 目標10匹。既存は BUNK・MOFU・ZIPP・PUNI・KLAK(見た目・名前・設定は変えない)。残り5匹は未確定。
 * ready: ゲームで使える素材(画像・動き)がそろっているか。今はBUNKだけ。
 * 【未確定】種族ごとの基本の強さ(ステータス)は、決まったらここに足す。
 */
export const SPECIES = {
  bunk: { name: 'BUNK', ready: true },
  mofu: { name: 'MOFU', ready: false },
  zipp: { name: 'ZIPP', ready: false },
  puni: { name: 'PUNI', ready: false },
  klak: { name: 'KLAK', ready: false },
} as const;

export type SpeciesId = keyof typeof SPECIES;

export const isSpecies = (id: string): id is SpeciesId => id in SPECIES;

/** 表示する名前(知らない種類なら大文字にしただけの名前) */
export const speciesName = (id: string): string => (isSpecies(id) ? SPECIES[id].name : id.toUpperCase());
