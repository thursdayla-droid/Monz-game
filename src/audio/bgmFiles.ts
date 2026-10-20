/**
 * BGM は企画者が用意した曲だけを使う(Suno の Pro プランで作成)。
 * 元のファイルは music/、ゲーム用(mp3・音量をそろえたもの)は public/assets/bgm/。
 * - main: 「California Sunset Groove」タイトル・質問・誕生の場面(2026-10-19 企画者決定)
 * - home: 「Smooth Minimal Groove」お世話画面(ホーム)
 * - card: 「Countdown Tension」ミニゲーム MONZ CARD(2026-10-20)
 */
export type BgmName = 'main' | 'home' | 'card';

export interface BgmFile {
  file: string;
  /** 最後まで行ったら最初に戻る */
  loop: boolean;
}

export const BGM_FILES: Record<BgmName, BgmFile> = {
  main: { file: 'main.mp3', loop: true },
  home: { file: 'home.mp3', loop: true },
  card: { file: 'card.mp3', loop: true },
};
