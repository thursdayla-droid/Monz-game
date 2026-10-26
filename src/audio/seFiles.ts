import type { SeName } from './sfx';

/**
 * 効果音のファイル(企画者が用意した音。元のファイルは music/se/、ゲーム用は public/assets/se/。音の大きさはそろえてある)。
 * ここにある効果音はファイルを鳴らす。読み込めなかったとき・ここに無い効果音は、プログラムで作った仮の音(sfx.ts)を鳴らす。
 * gain: その音だけの大きさ(1 がふつう)
 * - 2026-10-26 MYTHCLASH: 攻撃・必殺・防御成功・毒・回復・雷魔法・自然魔法・炎魔法
 * - 2026-10-26 MYTHCLASH その2: 光魔法・闇魔法・HP吸収・魔法防御成功・ステータス上昇
 */
export const SE_FILES: Partial<Record<SeName, { file: string; gain?: number }>> = {
  mcSlash: { file: 'assets/se/mythclash/attack.mp3' },
  mcSpecial: { file: 'assets/se/mythclash/special.mp3' },
  mcGuardOk: { file: 'assets/se/mythclash/guard_success.mp3' },
  mcPoison: { file: 'assets/se/mythclash/poison.mp3' },
  mcHeal: { file: 'assets/se/mythclash/heal.mp3' },
  mcThunder: { file: 'assets/se/mythclash/magic_thunder.mp3' },
  mcNature: { file: 'assets/se/mythclash/magic_nature.mp3' },
  mcFire: { file: 'assets/se/mythclash/magic_fire.mp3' },
  mcLight: { file: 'assets/se/mythclash/magic_light.mp3' },
  mcDark: { file: 'assets/se/mythclash/magic_dark.mp3' },
  mcDrain: { file: 'assets/se/mythclash/drain.mp3' },
  mcMagicGuardOk: { file: 'assets/se/mythclash/magic_guard_success.mp3' },
  mcBuff: { file: 'assets/se/mythclash/buff.mp3' },
};

/** 同じ効果音が一度に鳴る数の上限(重なりすぎて音が割れないように) */
export const SE_MAX_VOICES = 3;
