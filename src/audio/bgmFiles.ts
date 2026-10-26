/**
 * BGM は企画者が用意した曲だけを使う(Suno の Pro プランで作成)。
 * 元のファイルは music/、ゲーム用(mp3・音量をそろえたもの)は public/assets/bgm/。
 * - main: 「California Sunset Groove」タイトル・質問・誕生の場面(2026-10-19 企画者決定)
 * - home: 「Smooth Minimal Groove」お世話画面(ホーム)
 * - card: 「Countdown Tension」ミニゲーム MONZ CARD(2026-10-20)
 * - dash: ミニゲーム DASH MONZ(2026-10-20 企画者決定。元は music/dash.m4a)
 * - slugger: 「Diamond Glory」ミニゲーム MONZ SLUGGER(2026-10-21 企画者決定)
 * - mythclash: 「Shadowy Contour」カードゲーム MYTHCLASH(2026-10-26 企画者決定)
 */
export type BgmName = 'main' | 'home' | 'card' | 'dash' | 'slugger' | 'mythclash';

export interface BgmFile {
  file: string;
  /** 最後まで行ったら最初に戻る */
  loop: boolean;
}

export const BGM_FILES: Record<BgmName, BgmFile> = {
  main: { file: 'main.mp3', loop: true },
  home: { file: 'home.mp3', loop: true },
  card: { file: 'card.mp3', loop: true },
  dash: { file: 'dash.mp3', loop: true },
  slugger: { file: 'slugger.mp3', loop: true },
  mythclash: { file: 'mythclash.mp3', loop: true },
};
