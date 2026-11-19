import { DIAMOND_CAT } from './furniture';
import { LIFE_KEY, LifeRecord, loadLife } from './lifeSave';
import { HAND_INFO, type HandName } from './monzCard';
import type { KeyValueStore } from './save';

/**
 * MONZ CARD の 途中で そろった 役(2026-11-19 企画者「途中で 揃った 役は 最後に まとめて」「途中で 閉じても 揃えた やつは あげて」)。
 * そろう たびに ここへ 書いて おき、ゲームオーバーで まとめて もらう。
 * 途中で 閉じた 時は、次に ゲームを 開いた 時(や MONZ CARD を 出た 時)に もらう。同じ プレイの ぶんを 2回は もらわない(runId)
 */
export const CARD_PENDING_KEY = 'monz:cardHands';

export interface CardPending {
  playId: string;
  hands: HandName[];
}

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function savePending(p: CardPending, store = defaultStore()): void {
  try {
    store?.setItem(CARD_PENDING_KEY, JSON.stringify(p));
  } catch {
    /* 保存できなくても 続ける */
  }
}

export function readPending(store = defaultStore()): CardPending | null {
  try {
    const raw = store?.getItem(CARD_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CardPending>;
    if (typeof p.playId !== 'string' || !Array.isArray(p.hands)) return null;
    return { playId: p.playId, hands: p.hands.filter((h): h is HandName => typeof h === 'string' && h in HAND_INFO) };
  } catch {
    return null;
  }
}

/** たまって いる 役の ぶんを もらう(コイン と ロイヤルの ダイヤモンドキャット)。もらった ぶんを 返す */
export function settlePending(record: LifeRecord, store = defaultStore()): { coins: number; cats: number } {
  const p = readPending(store);
  try {
    store?.removeItem(CARD_PENDING_KEY);
  } catch {
    /* 続ける */
  }
  if (!p || p.hands.length === 0) return { coins: 0, cats: 0 };
  const coins = p.hands.reduce((a, n) => a + HAND_INFO[n].coins, 0);
  const cats = p.hands.filter((n) => n === 'royal').length;
  if (!record.grant({ runId: `${p.playId}:hands`, source: 'card', coins, exp: 0 })) return { coins: 0, cats: 0 };
  for (let i = 0; i < cats; i++) record.receiveItem(DIAMOND_CAT);
  return { coins, cats };
}

/** ゲームを 開いた 時: 前に 閉じた プレイの ぶんを もらう */
export function settlePendingOnBoot(store = defaultStore()): void {
  try {
    if (!store?.getItem(LIFE_KEY) || !readPending(store)) return;
    settlePending(new LifeRecord(loadLife(store), store), store);
  } catch {
    /* 失敗しても ゲームは 止めない */
  }
}
