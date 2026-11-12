import { LIFE_KEY, loadLife, saveLife } from './lifeSave';
import type { KeyValueStore } from './save';

/**
 * 公開テストの 友だちへの コインの プレゼント(2026-11-09 企画者「公開してる ゲーム 友達たち やってるんだけど 100,000 コイン 追加できる？」)。
 * もう 遊んでいる データ(monz:life が ある)に 1回だけ 足す。もらったかは 別の 場所に 記録(「最初から」で 消えない)。
 * まだ 生まれていない 人には 足さない(はじめて 開いた 時は 記録だけ しない ので、生まれた 次に 開いた 時に もらえる)
 */
export const GIFTS = [
  { id: '2026-11-09-100k', coins: 100000 },
  // 2026-11-12 企画者「今 公開してる 友達達に 10,000 コイン あげたい」
  { id: '2026-11-12-10k', coins: 10000 },
] as const;
const giftKey = (id: string) => `monz:gift:${id}`;

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** まだ もらっていない プレゼントを 足す。足した コインの 合計を 返す */
export function applyCoinGifts(store = defaultStore()): number {
  if (!store) return 0;
  let total = 0;
  try {
    if (!store.getItem(LIFE_KEY)) return 0;
    const life = loadLife(store);
    for (const g of GIFTS) {
      if (store.getItem(giftKey(g.id))) continue;
      life.coins += g.coins;
      total += g.coins;
      store.setItem(giftKey(g.id), '1');
    }
    if (total) saveLife(life, store);
  } catch {
    /* 失敗しても ゲームは 止めない */
  }
  return total;
}
