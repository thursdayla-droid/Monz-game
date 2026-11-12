/**
 * BGM は企画者が用意した曲だけを使う(Suno の Pro プランで作成)。
 * 元のファイルは music/、ゲーム用(mp3・音量をそろえたもの)は public/assets/bgm/。
 * - main: 「California Sunset Groove」タイトル・質問・誕生の場面(2026-10-19 企画者決定)
 * - home: 「Smooth Minimal Groove」お世話画面(ホーム)
 * - card: 「Countdown Tension」ミニゲーム MONZ CARD(2026-10-20)
 * - dash: ミニゲーム DASH MONZ(2026-10-20 企画者決定。元は music/dash.m4a)
 * - slugger: 「Diamond Glory」ミニゲーム MONZ SLUGGER(2026-10-21 企画者決定)
 * - mythclash: 「Shadowy Contour」カードゲーム MYTHCLASH(2026-10-26 企画者決定)
 * - mythclashPack: MYTHCLASH のパック開封(2026-10-26 企画者決定。開封の画面はまだ。元は music/mythclash_pack.m4a)
 * - battle3: STREET KING 21〜31戦目の バトル(2026-11-07 企画者「20-31戦目までバトルBGMはこれで」。元は music/battle3_ch5-6.m4a)
 * - ending: STREET KING の エンディング(2026-11-07 企画者。元は music/ending.m4a)
 * - battle2: STREET KING 11〜20戦目の バトル(2026-11-07 企画者「11戦目から20戦目までバトルBGMはこれで」。元は music/battle2_ch3-4.m4a)
 * - mahjong: 麻雀クエストの 対戦(2026-11-09 企画者。元は music/mahjong_battle.m4a)
 * - slot: ROYAL JACKPOT(2026-11-12 企画者「スロットの BGM は これ」。元は music/slot.m4a)
 * - battle: 「Combat Pulse」バトル(MONZ RUMBLE・オートバトルなど)(2026-11-04 企画者「これは戦闘BGMにしてください」。元は music/battle_Combat_Pulse.m4a)
 */
export type BgmName = 'main' | 'home' | 'card' | 'dash' | 'slugger' | 'mythclash' | 'mythclashPack' | 'battle' | 'battle2' | 'battle3' | 'ending' | 'mahjong' | 'slot';

export interface BgmFile {
  file: string;
  /** 最後まで行ったら最初に戻る */
  loop: boolean;
  /** 曲ごとの 音の大きさ(1 = そのまま)。設定の BGM の大きさに さらに かける */
  volume?: number;
}

export const BGM_FILES: Record<BgmName, BgmFile> = {
  main: { file: 'main.mp3', loop: true },
  home: { file: 'home.mp3', loop: true },
  card: { file: 'card.mp3', loop: true },
  dash: { file: 'dash.mp3', loop: true },
  slugger: { file: 'slugger.mp3', loop: true },
  mythclash: { file: 'mythclash.mp3', loop: true },
  mythclashPack: { file: 'mythclash_pack.mp3', loop: true },
  // 2026-11-06 企画者「戦闘BGM大きすぎるかも」→ 少し 小さく【仮】
  battle: { file: 'battle.mp3', loop: true, volume: 0.55 },
  battle2: { file: 'battle2.mp3', loop: true, volume: 0.55 },
  battle3: { file: 'battle3.mp3', loop: true, volume: 0.55 },
  ending: { file: 'ending.mp3', loop: true },
  mahjong: { file: 'mahjong.mp3', loop: true, volume: 0.6 },
  // 元の 曲が 少し 大きいので 麻雀と 同じくらいに【仮】
  slot: { file: 'slot.mp3', loop: true, volume: 0.45 },
};
