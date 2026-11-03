/**
 * MONZ RUMBLE(3Dバトル)のモード(2026-11-03 企画者):
 * - ストーリーモード: すごろくのように1マスずつ進む。一枚絵で話が進んでバトル。全部で20回くらい。
 *   敵がだんだん強くなり、さいごのボスは技とプレイがうまくないと勝てない。クリアした所は好きなだけ もう一度遊べる。
 * - バトルモード: CPU の強さを好きに選ぶ。
 * 話の文と絵は企画者が作る(ここは入れ物。文は【仮】)。報酬は まだ決まっていない(作らない)。
 * Phaser に依存しない(テストのため)。
 */
import type { Proficiency } from './battle3d/config';

/** CPU の強さ(バトルモード)。level: 自分のレベルとの差・prof: 戦いのうまさ(1〜5)【仮】 */
export const CPU_LEVELS = [
  { id: 1, name: 'よわい', level: -5, prof: 1 },
  { id: 2, name: 'ふつう', level: 0, prof: 2 },
  { id: 3, name: 'つよい', level: 3, prof: 3 },
  { id: 4, name: 'とてもつよい', level: 6, prof: 4 },
  { id: 5, name: 'さいきょう', level: 10, prof: 5 },
] as const;

export interface StoryStage {
  /** 1〜20 */
  no: number;
  title: string;
  /** バトルの前の話(一枚絵に出す文)。【仮】企画者が書く */
  text: string;
  /** 一枚絵(企画者が作る)。まだなければ null */
  image: string | null;
  /** 敵のレベル・戦いのうまさ(1〜5)・ボスか(HP が多い) */
  enemy: { name: string; level: number; prof: number; boss: boolean };
  /** そのマスで戦うマップ(arena.ts の ARENAS。2026-11-03 企画者「ストーリーモードでは指定マップ」) */
  map: string;
}

export const STORY_COUNT = 20;
/** ボスの HP の倍率【仮】 */
export const BOSS_HP = 1.5;

/**
 * 20のマス【仮】。敵のレベルは 1 → 70 へ だんだん上がる。うまさは 5マスごとに上がり、さいごのボスは いちばん上(5)。
 * 5・10・15マスめは中ボス、20マスめがさいごのボス
 */
export const STORY_STAGES: StoryStage[] = Array.from({ length: STORY_COUNT }, (_, i) => {
  const no = i + 1;
  const last = no === STORY_COUNT;
  const mid = no % 5 === 0 && !last;
  return {
    no,
    title: last ? 'さいごのボス' : mid ? `${no}マスめ（中ボス）` : `${no}マスめ`,
    text: '（ここに話が入ります。企画者が一枚絵と文を作ります）',
    image: null,
    map: 'lostTemple',
    enemy: {
      name: last ? 'ボス' : mid ? '中ボス' : 'ライバル',
      level: last ? 70 : Math.max(1, Math.round(1 + (no - 1) * 3.4)),
      prof: last ? 5 : Math.min(4, 1 + Math.floor((no - 1) / 5) + (mid ? 1 : 0)),
      boss: last || mid,
    },
  };
});

/** バトルモードのマップ(マップが増えたら ランダムに。今はロストテンプルだけ) */
export const pickFreeMap = (rng: () => number, ids: string[]): string => ids[Math.floor(rng() * ids.length)] ?? 'lostTemple';

/** 戦いのうまさ(1〜5)を、5つの全部に同じだけ */
export const profOf = (n: number): Proficiency => ({ attack: n, defense: n, evasion: n, counter: n, spacing: n });

/** 次に遊べるマス(cleared = クリアしたいちばん先のマス) */
export const nextStage = (cleared: number) => Math.min(STORY_COUNT, cleared + 1);
/** そのマスを遊べるか(クリアした所と、次のマス) */
export const canPlay = (no: number, cleared: number) => no >= 1 && no <= nextStage(cleared);
