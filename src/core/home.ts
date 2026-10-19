import { pick, type Rng } from './rng';

/**
 * ホーム(育てる画面)の決まりごと。Phaserに依存しない。
 */

/** ホームの場所。企画者決定(2026-10-19): なにもない部屋・路地裏・ガレージからランダム */
export const HOME_PLACES = ['room', 'alley', 'garage'] as const;
export type HomePlace = (typeof HOME_PLACES)[number];

/** 【仮】ホームを開くたびに選び直す。前回と同じ場所は続けて出さない */
export function pickHomePlace(rng: Rng, last?: HomePlace | null): HomePlace {
  const choices = last ? HOME_PLACES.filter((p) => p !== last) : HOME_PLACES;
  return pick(rng, choices);
}

/** ホームの下に並ぶボタン。企画者決定(2026-10-19) */
export const HOME_ACTIONS = ['food', 'pet', 'minigame', 'dressup'] as const;
export type HomeAction = (typeof HOME_ACTIONS)[number];

export const HOME_ACTION_LABELS: Record<HomeAction, string> = {
  food: 'ごはん',
  pet: 'なでる',
  minigame: 'ミニゲーム',
  dressup: 'きがえ',
};

/** まだ中身がないボタン(押すと「じゅんび中」と出す)。ミニゲームの種類・服は企画者が決める */
export const HOME_ACTION_READY: Record<HomeAction, boolean> = {
  food: true,
  pet: true,
  minigame: false,
  dressup: false,
};
