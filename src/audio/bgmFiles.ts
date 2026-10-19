import type { SongName } from './songs';

/**
 * 企画者が用意した曲のファイル。public/assets/bgm/ に置き、ここに書くと、その場面ではプログラムの曲の代わりに流れる。
 * 書いていない場面は、今までどおりプログラムで作った曲(src/audio/songs.ts)を流す。
 * - loop: 最後まで行ったら最初に戻る(誕生の曲は false。終わるとホームの曲へ移る)
 * - skip: 「TAP TO START」のあとタイトルを出すとき、曲の何秒目から流すか(静かな前奏をとばす)
 */
export interface BgmFile {
  file: string;
  loop: boolean;
  skip?: number;
}

export const BGM_FILES: Partial<Record<SongName, BgmFile>> = {};
