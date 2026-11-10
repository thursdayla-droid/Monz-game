import type { Rng } from '../rng';
import { REELS, type Grid, type SpinResult, type SymbolId } from './slot';

/**
 * MONZ SLOT の リーチと 予告(2026-11-10 企画者)。結果は 先に 決まって いて、ここでは 見せ方だけ を 決める
 * (払い戻し率は 変わらない)。
 * - リーチに なる 図柄【確定】: レインボー7・ゴールド7・ダイヤ
 * - 2段がまえ【確定】: 左から 2リール そろう → 小さい リーチ(3リール目が ゆっくり)・
 *   3リール そろう → 大きい リーチ(企画者の リーチ演出が 入る ところ。4・5リール目が ゆっくり)
 * - 予告【確定：入れる】: 回しはじめに「何か 来そう」。当たる 時に 出やすく、ハズレでも ときどき
 * - リーチ演出の 中身(7種類くらい)は 企画者が 考える【未確定】。今は 仮の 3段階(弱・中・強)
 */
export const REACH_SYMBOLS: readonly SymbolId[] = ['rainbow7', 'gold7', 'diamond'];

export interface ReachInfo {
  symbol: SymbolId;
  /** 左から 何リール 続いたか(結果) */
  chain: number;
}

/** リーチに なる 図柄が 左から いくつ 続くか(いちばん 長い もの。同じ 長さなら レアな ほう) */
export function reachOf(grid: Grid): ReachInfo | null {
  let best: ReachInfo | null = null;
  for (const s of REACH_SYMBOLS) {
    let chain = 0;
    for (let r = 0; r < REELS; r++) {
      if (!grid[r].includes(s)) break;
      chain++;
    }
    if (chain >= 2 && (!best || chain > best.chain)) best = { symbol: s, chain };
  }
  return best;
}

/** 大きい リーチの 仮の 種類(企画者の 演出が 届いたら 入れかえる)【仮】 */
export interface BigReachType {
  id: string;
  name: string;
  /** 成功の 時・失敗の 時に えらばれる 重み(成功の 割合 = 期待度 を 作る) */
  winWeight: number;
  loseWeight: number;
}
export const BIG_REACHES: readonly BigReachType[] = [
  { id: 'weak', name: '弱リーチ【仮】', winWeight: 1, loseWeight: 4 },
  { id: 'mid', name: '中リーチ【仮】', winWeight: 2, loseWeight: 2 },
  { id: 'strong', name: '強リーチ【仮】', winWeight: 3, loseWeight: 0.6 },
];

/** 予告の 強さ(0 = なし)【仮：見た目と 割合は あとで 企画者と】 */
export type NoticeLevel = 0 | 1 | 2 | 3;

export interface SpinShow {
  notice: NoticeLevel;
  /** 小さい リーチ(2リール そろった) */
  small: boolean;
  /** 大きい リーチ(3リール そろった)の 種類 */
  big: BigReachType | null;
  reach: ReachInfo | null;
  /** 大きい リーチが 成功(4連 以上)・小さい リーチが 成功(3連 以上) */
  bigSuccess: boolean;
  smallSuccess: boolean;
}

const pickW = <T>(rng: Rng, items: readonly T[], w: (t: T) => number): T => {
  const total = items.reduce((a, t) => a + w(t), 0);
  let r = rng() * total;
  for (const t of items) if ((r -= w(t)) < 0) return t;
  return items[items.length - 1];
};

/**
 * 1回転の 見せ方を 決める(結果 res は もう 決まって いる。rng は 見せ方 専用)。
 * 予告の 出る 割合【仮】: 大きい 当たり(BET×10 以上)・ボーナス・大きい リーチ 成功は よく 出る、ハズレでも 少し
 */
export function planShow(res: SpinResult, bet: number, rng: Rng): SpinShow {
  const reach = reachOf(res.grid);
  const small = !!reach && reach.chain >= 2;
  const bigOn = !!reach && reach.chain >= 3;
  const bigSuccess = !!reach && reach.chain >= 4;
  const big = bigOn ? pickW(rng, BIG_REACHES, (t) => (bigSuccess ? t.winWeight : t.loseWeight)) : null;
  const hot = res.bonus || res.win >= bet * 10 || bigSuccess;
  const warm = bigOn || res.win >= bet * 3;
  const pNotice = hot ? 0.5 : warm ? 0.25 : small ? 0.1 : 0.03;
  let notice: NoticeLevel = 0;
  if (rng() < pNotice) notice = hot ? (rng() < 0.5 ? 3 : 2) : warm ? (rng() < 0.6 ? 2 : 1) : rng() < 0.85 ? 1 : 2;
  return { notice, small, big, reach, bigSuccess, smallSuccess: !!reach && reach.chain >= 3 };
}
