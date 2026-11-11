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

/**
 * 色で 期待度(企画者 2026-11-10「パチンコ屋の スロットみたいに 楽しく。全部 入れたい」)。
 * 青 → 緑 → 赤 → 金 → 虹 の 順に アツい。虹は 当たり 確定【仮：割合】
 */
export type ColorTier = 'blue' | 'green' | 'red' | 'gold' | 'rainbow';
export const COLOR_TIERS: readonly ColorTier[] = ['blue', 'green', 'red', 'gold', 'rainbow'];
/** 色ごとの 重み(当たる 時・ハズレの 時)【仮】 */
const TIER_WIN = [1, 2, 3, 2.5, 1];
const TIER_LOSE = [6, 3, 1, 0.15, 0];

/** 予告の 強さ(0 = なし)。1〜5 = ステップアップ予告の 段【仮：見た目と 割合は あとで 企画者と】 */
export type NoticeLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SpinShow {
  /** ステップアップ予告の 段(0 = 出ない) */
  notice: NoticeLevel;
  /** 予告の 色 */
  noticeTier: ColorTier;
  /** 小さい リーチ(2リール そろった) */
  small: boolean;
  /** 大きい リーチ(3リール そろった)の 種類 */
  big: BigReachType | null;
  /** 大きい リーチの 文字の 色 */
  bigTier: ColorTier;
  /** 大きい リーチの さいごに PUSH ボタン */
  push: boolean;
  /** 告知ランプ: 当たりが 決まって いる 時だけ 光る(pre = 回しはじめ・post = 止まった あと) */
  lamp: 'none' | 'pre' | 'post';
  /** 連続演出(予告 → 2リール目 → 大きい リーチ が つながる) */
  chain: boolean;
  /** コインが あふれる(大きい 当たり) */
  fountain: boolean;
  reach: ReachInfo | null;
  /** 大きい リーチが 成功(4連 以上)・小さい リーチが 成功(3連 以上) */
  bigSuccess: boolean;
  smallSuccess: boolean;
}

const pickW = <T>(rng: Rng, items: readonly T[], w: (t: T, i: number) => number): T => {
  const total = items.reduce((a, t, i) => a + w(t, i), 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) if ((r -= w(items[i], i)) < 0) return items[i];
  return items[items.length - 1];
};
const tierOf = (rng: Rng, good: boolean): ColorTier => pickW(rng, COLOR_TIERS, (_, i) => (good ? TIER_WIN[i] : TIER_LOSE[i]));

/** 大きい 当たり(コインが あふれる)の 目安: BET の 5倍 以上【仮】 */
export const FOUNTAIN_X = 5;
/** 告知ランプが 光る 当たり: BET の 10倍 以上・ボーナス・大きい リーチ 成功【仮】 */
export const LAMP_X = 10;

/**
 * 1回転の 見せ方を 決める(結果 res は もう 決まって いる。rng は 見せ方 専用。払い戻し率は 変わらない)。
 * - 予告: 大きい 当たり・ボーナス・大きい リーチ 成功は よく 出る、ハズレでも 少し。段が 進むほど・色が アツいほど 当たりやすい
 * - 告知ランプ: 当たりが 決まって いる 時だけ(ハズレでは 光らない)
 * 割合は ぜんぶ【仮】
 */
export function planShow(res: SpinResult, bet: number, rng: Rng): SpinShow {
  const reach = reachOf(res.grid);
  const small = !!reach && reach.chain >= 2;
  const bigOn = !!reach && reach.chain >= 3;
  const bigSuccess = !!reach && reach.chain >= 4;
  const big = bigOn ? pickW(rng, BIG_REACHES, (t) => (bigSuccess ? t.winWeight : t.loseWeight)) : null;
  const hot = res.bonus || res.free > 0 || res.win >= bet * LAMP_X || bigSuccess;
  const warm = bigOn || res.win >= bet * 3;
  const pNotice = hot ? 0.55 : warm ? 0.25 : small ? 0.1 : 0.03;
  let notice: NoticeLevel = 0;
  if (rng() < pNotice) {
    // ステップアップ: アツい ほど 先の 段まで 進む(5 は ほぼ アツい 時だけ)
    const w = hot ? [1, 2, 3, 3, 2] : warm ? [3, 3, 2, 1, 0.1] : [6, 3, 1, 0.3, 0.02];
    notice = (pickW(rng, [1, 2, 3, 4, 5], (_, i) => w[i]) as NoticeLevel);
  }
  const lampOn = hot && rng() < 0.6;
  const lamp = lampOn ? (rng() < 0.4 ? 'pre' : 'post') : 'none';
  return {
    notice,
    noticeTier: tierOf(rng, hot),
    small,
    big,
    bigTier: tierOf(rng, bigSuccess),
    push: !!big && rng() < (bigSuccess ? 0.7 : 0.35),
    lamp,
    chain: (!!big && rng() < (bigSuccess ? 0.4 : 0.12)) || ((res.bonus || res.free > 0) && rng() < 0.3),
    fountain: res.win >= bet * FOUNTAIN_X,
    reach,
    bigSuccess,
    smallSuccess: !!reach && reach.chain >= 3,
  };
}
