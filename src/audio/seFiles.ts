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
 * - 2026-11-11 麻雀クエスト: リーチの 音(企画者「麻雀の リーチの 音は これに して」。元は music/se/mahjong/riichi_original.mp3)
 * - 2026-11-11 麻雀クエスト: 主人公の ロンの 音(企画者。元は music/se/mahjong/ron_hero_original.mp3)
 * - 2026-11-11 麻雀クエスト: 満貫 以上の 当たりの 演出の 音(企画者。元は music/se/mahjong/bigwin_original.mp3)
 * - 2026-11-05 3Dバトル: 通常攻撃の 打撃(パンチ・頭突き・体当たり・甲羅・しっぽ)が当たった音(企画者「通常攻撃打撃系の音はこれにして」)
 */
export const SE_FILES: Partial<Record<SeName, { file: string; gain?: number }>> = {
  mcSlash: { file: 'assets/se/mythclash/attack.mp3' },
  // 2026-11-11 企画者「リーチの 音 でかい。もう少し 小さめで」→ 0.55
  mjRiichi: { file: 'assets/se/mahjong/riichi.mp3', gain: 0.55 },
  mjRonHero: { file: 'assets/se/mahjong/ron_hero.mp3' },
  mjBigWin: { file: 'assets/se/mahjong/bigwin.mp3' },
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
  // 2026-11-05 企画者「技のボタン音これにして」→「やっぱりこっちにして」(button03a。前の音は music/se/battle3d/unused/)。ほかの音より 大きいので 小さめに
  b3dTechBtn: { file: 'assets/se/battle3d/tech_button.mp3', gain: 0.4 },
  // 2026-11-03 企画者「ギガントバーストこの音にして」(約4秒。ためから光線まで)
  b3dGigant: { file: 'assets/se/battle3d/gigant_burst.mp3' },
};

/** 同じ効果音が一度に鳴る数の上限(重なりすぎて音が割れないように) */
export const SE_MAX_VOICES = 3;
