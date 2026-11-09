import type { Damage } from './rpg';
import type { RoundResult } from './round';
import { PLAYER_SEAT } from './rpg';

/**
 * 道具屋の アイテム(2026-11-08 企画者 仕様書 Ver.1.0 の 6・7。2026-11-08 企画者「仕様書の 5つ」)。
 * 値段と 効果は 企画者 2026-11-09 に 決定(まほうのたま → ゆうしゃのつるぎ)。
 * 使い方(仕様書 7【提案】・変えやすく): 1ステージ 1個まで・開始前に 使う・使うと 1個 減る・
 * 条件を 満たすまで 続く・攻撃系は 次の 自分の アガリ・防御系は 次に ダメージを 受けた 時・1回で おわり・
 * 使わずに ステージが おわっても 消える
 */
export type ItemId = 'konbou' | 'yakusou' | 'tate' | 'omamori' | 'tsurugi';

export interface ItemInfo {
  id: ItemId;
  name: string;
  price: number;
  /** 説明(短く) */
  text: string;
  kind: 'attack' | 'defense';
}

export const ITEMS: readonly ItemInfo[] = [
  // 2026-11-09 企画者: 値段と 効果を 決めた(まほうのたまは ゆうしゃのつるぎに 変更)
  { id: 'konbou', name: 'こんぼう', price: 200, text: '次に アガった ダメージが 1.5倍', kind: 'attack' },
  { id: 'yakusou', name: 'やくそう', price: 200, text: '次に アガった ダメージと 同じだけ HP 回復', kind: 'attack' },
  { id: 'tate', name: 'てつのたて', price: 250, text: '次に うける ダメージが 0', kind: 'defense' },
  { id: 'omamori', name: 'こううんのおまもり', price: 300, text: '次に アガった ダメージが 2倍', kind: 'attack' },
  { id: 'tsurugi', name: 'ゆうしゃのつるぎ', price: 500, text: '次に アガった ダメージが 3倍・同じだけ HP 回復(最大を こえる)', kind: 'attack' },
];
export const itemInfo = (id: string): ItemInfo | undefined => ITEMS.find((i) => i.id === id);

export interface ItemEffect {
  damage: Damage;
  /** プレイヤーの HP 回復(やくそう・ゆうしゃのつるぎ) */
  heal: number;
  /** 回復が 最大HP を こえて よいか(ゆうしゃのつるぎ: こえた 分は 数字だけ 上がる) */
  overMax: boolean;
  /** アイテムが 発動した(この あと 消える) */
  used: boolean;
}

/**
 * 局の ダメージに アイテムの 効果を かける。
 * 攻撃系は 自分が アガった 時だけ(流局の テンパイ料・ウマでは 発動しない)。防御系は 自分が ダメージを 受けた 時
 */
export function applyItem(item: ItemId | null, d: Damage, r: RoundResult | null, enemyMax: number): ItemEffect {
  const out: ItemEffect = { damage: { ...d, hits: d.hits.map((h) => ({ ...h })) }, heal: 0, overMax: false, used: false };
  if (!item) return out;
  const info = itemInfo(item);
  if (!info) return out;
  const won = r?.kind === 'win' && r.wins.some((w) => w.seat === PLAYER_SEAT);
  if (info.kind === 'attack') {
    if (!won || d.toEnemy <= 0) return out;
    const hit = out.damage.hits.find((h) => h.winner === PLAYER_SEAT && h.target === 'enemy');
    let add = 0;
    if (item === 'konbou') add = Math.floor(d.toEnemy * 0.5); // 1.5倍
    if (item === 'omamori') add = d.toEnemy; // 2倍
    if (item === 'tsurugi') add = d.toEnemy * 2; // 3倍
    if (item === 'yakusou') out.heal = d.toEnemy;
    if (item === 'tsurugi') {
      out.heal = d.toEnemy * 3;
      out.overMax = true;
    }
    void enemyMax;
    out.damage.toEnemy += add;
    if (hit) hit.amount += add;
    out.used = true;
    return out;
  }
  // てつのたて: 次に うける ダメージが 0
  if (d.toPlayer <= 0) return out;
  out.damage.toPlayer = 0;
  out.damage.hits = out.damage.hits.filter((h) => h.target !== 'player');
  out.used = true;
  return out;
}
