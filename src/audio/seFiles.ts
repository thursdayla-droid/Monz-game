import type { SeName } from './sfx';

/**
 * 効果音のファイル(企画者が用意した音。元のファイルは music/se/、ゲーム用は public/assets/se/。音の大きさはそろえてある)。
 * ここにある効果音はファイルを鳴らす。読み込めなかったとき・ここに無い効果音は、プログラムで作った仮の音(sfx.ts)を鳴らす。
 * gain: その音だけの大きさ(1 がふつう)
 * - 2026-10-26 MYTHCLASH: 攻撃・必殺・防御成功・毒・回復・雷魔法・自然魔法・炎魔法
 * - 2026-10-26 MYTHCLASH その2: 光魔法・闇魔法・HP吸収・魔法防御成功・ステータス上昇
 * - 2026-10-26 MYTHCLASH その3: 水魔法。カウンター成功は必殺と同じ音(企画者)
 * - 2026-10-26 MYTHCLASH その4: 必殺技のカットイン・火傷
 * - 2026-10-26 MYTHCLASH その5: 無の魔法
 * - 2026-10-26 MYTHCLASH その6: 攻撃など行動を選んだときの音
 * - 2026-11-02 3Dバトル: 通常攻撃のパンチが当たった音(企画者「パンチ当たる音はこれ」)
 * - 2026-11-03 3Dバトル: ギガントバーストの音(企画者)
 * - 2026-11-05 3Dバトル: 通常攻撃の 打撃(パンチ・頭突き・体当たり・甲羅・しっぽ)が当たった音(企画者「通常攻撃打撃系の音はこれにして」)
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
  mcWater: { file: 'assets/se/mythclash/magic_water.mp3' },
  mcCounter: { file: 'assets/se/mythclash/special.mp3' },
  mcCutin: { file: 'assets/se/mythclash/cutin.mp3' },
  mcBurn: { file: 'assets/se/mythclash/burn.mp3' },
  mcMagic: { file: 'assets/se/mythclash/magic_none.mp3' },
  mcSelect: { file: 'assets/se/mythclash/select.mp3' },
  b3dPunchHit: { file: 'assets/se/battle3d/punch_hit.mp3' },
  b3dStrikeHit: { file: 'assets/se/battle3d/strike_hit.mp3' },
  // 2026-11-03 企画者「ギガントバーストこの音にして」(約4秒。ためから光線まで)
  b3dGigant: { file: 'assets/se/battle3d/gigant_burst.mp3' },
};

/** 同じ効果音が一度に鳴る数の上限(重なりすぎて音が割れないように) */
export const SE_MAX_VOICES = 3;
