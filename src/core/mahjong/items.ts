import type { Damage } from './rpg';
import type { RoundResult } from './round';
import { PLAYER_SEAT } from './rpg';

/**
 * 道具屋の アイテム(2026-11-08 企画者 仕様書 Ver.1.0 の 6・7。2026-11-08 企画者「仕様書の 5つ」)。
 * こんぼう・やくそうの 効果は 企画者 指定。値段・てつのたて〜まほうのたまの 効果は 仕様書の 提案のまま【仮】。
 * 使い方(仕様書 7【提案】・変えやすく): 1ステージ 1個まで・開始前に 使う・使うと 1個 減る・
 * 条件を 満たすまで 続く・攻撃系は 次の 自分の アガリ・防御系は 次に ダメージを 受けた 時・1回で おわり・
 * 使わずに ステージが おわっても 消える
 */
export type ItemId = 'konbou' | 'yakusou' | 'tate' | 'omamori' | 'tama';

export interface ItemInfo {
  id: ItemId;
  name: string;
  price: number;
  /** 説明(短く) */
  text: string;
  kind: 'attack' | 'defense';
}

export const ITEMS: readonly ItemInfo[] = [
  { id: 'konbou', name: 'こんぼう', price: 100, text: '次に アガった ダメージが 2倍', kind: 'attack' },
  { id: 'yakusou', name: 'やくそう', price: 150, text: '次に アガった ダメージと 同じだけ HP 回復', kind: 'attack' },
  { id: 'tate', name: 'てつのたて', price: 120, text: '次に うける ダメージが 半分', kind: 'defense' },
  { id: 'omamori', name: 'こううんのおまもり', price: 200, text: '次に アガった ダメージに +3,000', kind: 'attack' },
  { id: 'tama', name: 'まほうのたま', price: 250, text: '次に アガった ダメージに 敵の 最大HPの 20% を たす', kind: 'attack' },
];
export const itemInfo = (id: string): ItemInfo | undefined => ITEMS.find((i) => i.id === id);

export interface ItemEffect {
  damage: Damage;
  /** プレイヤーの HP 回復(やくそう) */
  heal: number;
  /** アイテムが 発動した(この あと 消える) */
  used: boolean;
}

/**
 * 局の ダメージに アイテムの 効果を かける。
 * 攻撃系は 自分が アガった 時だけ(流局の テンパイ料・ウマでは 発動しない)。防御系は 自分が ダメージを 受けた 時
 */
export function applyItem(item: ItemId | null, d: Damage, r: RoundResult | null, enemyMax: number): ItemEffect {
  const out: ItemEffect = { damage: { ...d, hits: d.hits.map((h) => ({ ...h })) }, heal: 0, used: false };
  if (!item) return out;
  const info = itemInfo(item);
  if (!info) return out;
  const won = r?.kind === 'win' && r.wins.some((w) => w.seat === PLAYER_SEAT);
  if (info.kind === 'attack') {
    if (!won || d.toEnemy <= 0) return out;
    const hit = out.damage.hits.find((h) => h.winner === PLAYER_SEAT && h.target === 'enemy');
    let add = 0;
    if (item === 'konbou') add = d.toEnemy; // 2倍(子分から ロンでも そのまま 2倍)
    if (item === 'omamori') add = 3000;
    if (item === 'tama') add = Math.floor(enemyMax * 0.2);
    if (item === 'yakusou') out.heal = d.toEnemy;
    out.damage.toEnemy += add;
    if (hit) hit.amount += add;
    out.used = true;
    return out;
  }
  // てつのたて
  if (d.toPlayer <= 0) return out;
  const cut = Math.floor(d.toPlayer / 2);
  out.damage.toPlayer -= cut;
  for (const h of out.damage.hits) if (h.target === 'player') h.amount = Math.ceil(h.amount / 2);
  out.used = true;
  return out;
}
