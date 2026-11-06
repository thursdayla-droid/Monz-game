/**
 * MONZの種類(キャラクター図鑑)。Phaserに依存しない。キャラクターを増やすときは、ここに1つ足す。
 * 企画者決定(2026-10-20): 目標10匹。既存は BUNK・MOFU・ZIPP・PUNI・KLAK(見た目・名前・設定は変えない)。残り5匹は未確定。
 * ready: ゲームで使える素材(画像・動き)がそろっているか。今はBUNKだけ。
 * 【未確定】種族ごとの基本の強さ(ステータス)は、決まったら stats.ts に足す。
 * 全キャラ(10種族×3形態)の名前・体の形・属性などは roster.ts(企画者の種族の表)。
 */
export const SPECIES = {
  bunk: { name: 'BUNK', ready: true },
  mofu: { name: 'MOFU', ready: false },
  zipp: { name: 'ZIPP', ready: false },
  puni: { name: 'PUNI', ready: false },
  klak: { name: 'KLAK', ready: false },
  // 2026-11-01 企画者「キャラ全部いったん作っちゃおう」→ まだ決まっていない5種族の入れ物(monz6〜monz10)
  // 2026-11-02 企画者の絵(design/species/)で 5種族が決まった → 入れ物に入れた(企画者「お願いします」)。名前は変わるかもしれない【仮】
  riot: { name: 'RIOT', ready: false },
  snek: { name: 'SNEK', ready: false },
  grit: { name: 'GRIT', ready: false },
  vybe: { name: 'VYBE', ready: false },
  shellz: { name: 'SHELLZ', ready: false },
  // 2026-11-06 企画者: 敵専用の 新しいキャラ(STREET KING の 31話)。CROWNIE → Lv.30 CROWNIX → 最終進化 CROWNOR。技と 性能は BUNK と ほぼ 同じ・属性は 闇【仮】
  crownie: { name: 'CROWNIE', ready: false },
} as const;

/** 前の入れ物の名前 → 今の種族(古い保存データを読むため。2026-11-02) */
export const RENAMED_SPECIES: Record<string, SpeciesId> = { monz6: 'riot', monz7: 'snek', monz8: 'grit', monz9: 'vybe', monz10: 'shellz' };

export type SpeciesId = keyof typeof SPECIES;

export const isSpecies = (id: string): id is SpeciesId => id in SPECIES;

/** 表示する名前(知らない種類なら大文字にしただけの名前) */
export const speciesName = (id: string): string => (isSpecies(id) ? SPECIES[id].name : id.toUpperCase());
