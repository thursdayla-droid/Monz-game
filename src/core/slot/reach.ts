import type { Rng } from '../rng';
import { REELS, type Grid, type SpinResult, type SymbolId } from './slot';

/**
 * MONZ SLOT の リーチと 予告(2026-11-10 企画者)。結果は 先に 決まって いて、ここでは 見せ方だけ を 決める
 * (払い戻し率は 変わらない)。
 * - リーチに なる 図柄【確定】: レインボー7・ゴールド7(2026-11-12 ダイヤは 外した)
 * - 2026-11-12〜: 7が 左から 2リール そろう → キャラの リーチ(3リール目が ゆっくり・3リール目で 当たりか 決まる)。
 *   キャラの リーチが 出ない 時は 小さい リーチ(3リール目が ゆっくり)
 * - 予告【確定：入れる】: 回しはじめに「何か 来そう」。当たる 時に 出やすく、ハズレでも ときどき
 * - リーチ演出の 中身(7種類くらい)は 企画者が 考える【未確定】。今は 仮の 3段階(弱・中・強)
 */
// 2026-11-12 企画者「ダイヤ 3個で リーチ とか いらない」→ ダイヤを 外した(リーチは 7 だけ)
export const REACH_SYMBOLS: readonly SymbolId[] = ['rainbow7', 'gold7'];

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

/**
 * 大きい リーチの 種類。
 * 当たる 確率(その リーチが 出た 時に 当たる 割合)は 重みだけで なく 全部の リーチの 重みの 合計で 決まる。
 * 重みを かえたら reach.test.ts の「当たる 確率」の テストで たしかめる
 */
export interface BigReachType {
  id: string;
  name: string;
  /** 成功の 時・失敗の 時に えらばれる 重み(成功の 割合 = 期待度 を 作る) */
  winWeight: number;
  loseWeight: number;
  /** リーチの 中の 種類(ラーメン 3種類 など)。種類ごとに 当たりやすさが ちがう */
  variants?: readonly { name: string; winWeight: number; loseWeight: number }[];
}
/**
 * 2026-11-12 企画者「7が 2個 出て リーチの 方が いい。3個 そろってから ハズレは 微妙」
 * → 7(レインボー・ゴールド)が 左から 2リール そろったら キャラの リーチ。3リール目に 7が 来たら 当たり。
 * 重み: winWeight = 当たる 時の 出やすさ・loseWeight = ハズレの 時の 出やすさ(100回 当たる あいだに 何回 ハズレで 出るか)。
 * 当たる 確率(企画者 2026-11-11): キョンK 10%・パンダY 20%(キョンK と 同じくらい よく 出る)・うさぎK 30%・カンガルーH 約40%・ヒヨコJ 約40%・チーターS 80%。
 * 7が 2個で ハズレの 時、キャラの リーチが 出ない 分(NO_STORY_LOSE)は ふつうの 小さい リーチ。重みを かえたら reach.test.ts で たしかめる
 */
export const BIG_REACHES: readonly BigReachType[] = [
  // リーチ①「キョンKの キャバ嬢リーチ」(キョン子なら 当たり・ブタ子なら ハズレ)
  { id: 'kyon', name: 'キョンKの キャバ嬢リーチ', winWeight: 20, loseWeight: 180 },
  // リーチ②「パンダYの 風呂キャンセルリーチ」(風呂に 入ったら 当たり)
  { id: 'panda', name: 'パンダYの 風呂キャンセルリーチ', winWeight: 40, loseWeight: 160 },
  // リーチ③「うさぎKの アイドルリーチ」(うさぎの アイドル達なら 当たり・カバなら ハズレ)
  // 2026-11-12 企画者「カンガルー・ヒヨコ・うさぎの リーチは もう少し 出して いい」→ 3人とも 重みを 1.6倍(当たる 確率は そのまま)
  { id: 'usagi', name: 'うさぎKの アイドルリーチ', winWeight: 24, loseWeight: 51.2 },
  // リーチ④「カンガルーHの ラーメンリーチ」(食べて 星5！なら 当たり)。ラーメン 3種類で 当たりやすさが ちがう
  {
    id: 'ramen',
    name: 'カンガルーHの ラーメンリーチ',
    winWeight: 16,
    loseWeight: 24,
    variants: [
      { name: 'しょうゆラーメン', winWeight: 1, loseWeight: 4 },
      { name: 'みそラーメン', winWeight: 2, loseWeight: 2 },
      { name: '特製とんこつラーメン', winWeight: 3, loseWeight: 0.6 },
    ],
  },
  // リーチ⑤「ヒヨコJの ゴルフリーチ」(パターが 入れば 当たり)。芝生 3種類で 当たりやすさが ちがう
  {
    id: 'golf',
    name: 'ヒヨコJの ゴルフリーチ',
    winWeight: 16,
    loseWeight: 24,
    variants: [
      { name: 'ボコボコの 芝生', winWeight: 1, loseWeight: 4 },
      { name: 'ふつうの 芝生', winWeight: 2, loseWeight: 2 },
      { name: 'ピカピカの 芝生', winWeight: 3, loseWeight: 0.6 },
    ],
  },
  // リーチ⑥「チーターSの 彼女の機嫌リーチ」(彼女が 喜べば 当たり)。質問 6つ(どれでも 当たりやすさは 同じ)
  {
    id: 'kanojo',
    name: 'チーターSの 彼女の機嫌リーチ',
    winWeight: 5,
    loseWeight: 1.25,
    // 2026-11-12 企画者「仕事と 私は やめよう」→ 質問 5つ(画面の STORY_REACHES と 同じ 数)
    variants: [1, 2, 3, 4, 5].map((i) => ({ name: `質問${i}【仮】`, winWeight: 1, loseWeight: 1 })),
  },
  // 2026-11-12 企画者「プレミア 演出。100% 当たる」: アライグマR が 電話 → みんなが 集まる → バーベキュー。ハズレでは 出ない
  { id: 'premium', name: 'アライグマRの プレミア', winWeight: 6, loseWeight: 0 },
  // 2026-11-13 企画者「グループLINEリーチ」: 飲み会の 参加者 募集 → 3人 参加で 大当たり。まずは 当たりの 会話 1つ(ハズレでは 出ない)。
  // 出やすさは プレミアと 同じ【仮】
  { id: 'line', name: 'グループLINEリーチ', winWeight: 6, loseWeight: 0 },
];
/** 7が 2個で ハズレの 時に キャラの リーチを 出さない(小さい リーチ だけ)重み */
// 2026-11-12 7の 出やすさを かえた ので 合わせ直した(キャラごとの 当たる 確率を そのままに)
// 2026-11-12 3人を 多く した ぶん 合わせ直し((のこりの 重み) ÷ (当たりの 重みの 合計) を 6.34 に)
// 2026-11-12 プレミア(当たりだけ)を 足した ぶん 327 → 365(ほかの キャラの 当たる 確率を そのままに)
// 2026-11-13 グループLINE(当たりだけ)を 足した ぶん 365 → 403(ほかの キャラの 当たる 確率を そのままに)
export const NO_STORY_LOSE = 403;
/**
 * 王冠が 2つ 出た 時(さいごの リールより 前)の BONUS リーチで、キャラの リーチを 出す 割合(企画者 2026-11-12「2」)。
 * 当たり = 王冠が 3つ 以上(宝箱・フリーゲーム)。王冠の リーチは 約16回転に 1回。キャラごとの 割合は CROWN_PICK(全体で 約46%)。
 * のこりは 今までの 短い BONUS リーチ
 */
export const CROWN_STORY_RATE = 0.46;
/** 王冠の BONUS リーチが 始まる リール(2つめの 王冠が 出た リール・その あとに まだ リールが ある 時だけ)。なければ -1 */
export function crownReachReel(grid: Grid): number {
  const reels = grid.map((col, r) => (col.includes('crown') ? r : -1)).filter((r) => r >= 0);
  return reels.length >= 2 && reels[1] < REELS - 1 ? reels[1] : -1;
}
/** キャラの リーチに なる 図柄(企画者 2026-11-12「7が 2個」) */
export const SEVENS: readonly SymbolId[] = ['rainbow7', 'gold7'];

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
export type NoticeLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SpinShow {
  /** ステップアップ予告の 段(0 = 出ない) */
  notice: NoticeLevel;
  /** 予告の 色 */
  noticeTier: ColorTier;
  /** 小さい リーチ(2リール そろった・キャラの リーチが 出ない 時) */
  small: boolean;
  /** キャラの リーチ(7が 2リール そろった)の 種類 */
  big: BigReachType | null;
  /** 大きい リーチの 中の 種類(big.variants の 番号。種類が ない 時は -1) */
  bigVariant: number;
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
  /** キャラの リーチが 成功(7が 3連 以上)・小さい リーチが 成功(3連 以上) */
  bigSuccess: boolean;
  smallSuccess: boolean;
  /** 王冠の BONUS リーチで 出す キャラの リーチ(なし = 今までの 短い BONUS リーチ)。当たり = 王冠 3つ 以上 */
  crownBig: BigReachType | null;
  crownVariant: number;
  crownTier: ColorTier;
  /** ブラックアウト復活(キャラの リーチの 当たりの 見せ方: ハズレの 絵 → 画面 真っ暗 → 金の ROYAL JACKPOT で 大当たり) */
  revive?: boolean;
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

/** 王冠の BONUS リーチで キャラの リーチを 出すか(出す なら どの キャラ・種類・文字の 色) */
/**
 * 王冠の リーチで 出す キャラの 割合(2026-11-12 企画者「カンガルー・うさぎ・ひよこ もう少し リーチ 出やすく」)。
 * win: 王冠が 3つ 以上 そろう 回の うち その キャラに する 割合・lose: そろわない 回の うち その キャラに する 割合。
 * lose = win × (当たり ÷ ハズレ = 約0.25) × (1 − 当たる 確率) ÷ 当たる 確率 で、キャラごとの 当たる 確率を 7の リーチと そろえる。
 * のこりは 短い BONUS リーチ
 */
const CROWN_WIN_LOSE = 0.2516;
const CROWN_PICK: Record<string, { win: number; rate: number }> = {
  kyon: { win: 0.03, rate: 0.1 },
  panda: { win: 0.06, rate: 0.2 },
  usagi: { win: 0.2, rate: 0.3 },
  ramen: { win: 0.2, rate: 0.4 },
  golf: { win: 0.2, rate: 0.4 },
  kanojo: { win: 0.015, rate: 0.8 },
  // プレミア: 当たりの 時だけ(王冠 3つ 以上の 約4%)
  premium: { win: 0.04, rate: 1 },
};
const crownWeight = (id: string, win: boolean): number => {
  const c = CROWN_PICK[id];
  if (!c) return 0;
  return win ? c.win : (c.win * CROWN_WIN_LOSE * (1 - c.rate)) / c.rate;
};
function crownStory(res: SpinResult, rng: Rng): Pick<SpinShow, 'crownBig' | 'crownVariant' | 'crownTier'> {
  if (crownReachReel(res.grid) < 0) return { crownBig: null, crownVariant: -1, crownTier: 'blue' };
  const win = res.bonus || res.free > 0;
  const rest = 1 - BIG_REACHES.reduce((a, t) => a + crownWeight(t.id, win), 0);
  const pick = pickW<BigReachType | null>(rng, [...BIG_REACHES, null], (t) => (t ? crownWeight(t.id, win) : rest));
  if (!pick) return { crownBig: null, crownVariant: -1, crownTier: 'blue' };
  const big = pick;
  const crownVariant = big.variants ? big.variants.indexOf(pickW(rng, big.variants, (v) => (win ? v.winWeight : v.loseWeight))) : -1;
  return { crownBig: big, crownVariant, crownTier: tierOf(rng, win) };
}

/**
 * 1回転の 見せ方を 決める(結果 res は もう 決まって いる。rng は 見せ方 専用。払い戻し率は 変わらない)。
 * - 予告: 大きい 当たり・ボーナス・大きい リーチ 成功は よく 出る、ハズレでも 少し。段が 進むほど・色が アツいほど 当たりやすい
 * - 告知ランプ: 当たりが 決まって いる 時だけ(ハズレでは 光らない)
 * 割合は ぜんぶ【仮】
 */
export function planShow(res: SpinResult, bet: number, rng: Rng): SpinShow {
  const reach = reachOf(res.grid);
  // 7が 左から 2リール → キャラの リーチ(3リール目で 決まる)。ダイヤ・キャラが 出ない 時は 小さい リーチ
  const seven = !!reach && reach.chain >= 2 && SEVENS.includes(reach.symbol);
  const bigSuccess = seven && reach!.chain >= 3;
  const pickBig = seven ? pickW<BigReachType | null>(rng, [...BIG_REACHES, null], (t) => (t ? (bigSuccess ? t.winWeight : t.loseWeight) : bigSuccess ? 0 : NO_STORY_LOSE)) : null;
  const big = pickBig;
  const bigOn = !!big;
  const small = !!reach && reach.chain >= 2 && !big;
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
  const out: SpinShow = {
    notice,
    noticeTier: tierOf(rng, hot),
    small,
    big,
    bigTier: tierOf(rng, bigSuccess),
    push: !!big && rng() < (bigSuccess ? 0.7 : 0.35),
    lamp,
    // 2026-11-12 企画者「連続演出とか 文字の 説明系は いらない」→ 連続演出は 出さない
    chain: false,
    fountain: res.win >= bet * FOUNTAIN_X,
    reach,
    bigSuccess: bigSuccess && bigOn,
    smallSuccess: !!reach && reach.chain >= 3,
    // 種類が ある リーチだけ さいごに えらぶ(ほかの 見せ方の 抽選の 順番は そのまま)
    bigVariant: big?.variants ? big.variants.indexOf(pickW(rng, big.variants, (v) => (bigSuccess ? v.winWeight : v.loseWeight))) : -1,
    ...crownStory(res, rng),
  };
  // 2026-11-12 企画者「ステップアップは キョン・パンダ・カンガルー・ヒヨコ・チーターの 順番で」「発展するなら 始まる」
  // → キャラの リーチが ある 時は その キャラの 段まで 必ず 進んで、そこから リーチが 始まる
  const story = out.big ?? out.crownBig;
  const at = story ? STEP_ORDER.indexOf(story.id) : -1;
  // 2026-11-13 企画者「キャラリーチって ステップアップからじゃなくても 出るよね？ やたら ステップアップばっか」→「半分ずつ(当たりに 関係なし)」
  // → キャラの リーチの 半分は ステップアップなしで いきなり 始まる
  if (at >= 0) out.notice = (rng() < STORY_STEP_RATE ? at + 1 : 0) as NoticeLevel;
  // プレミアは 予告なしで いきなり(とつぜん 電話が 鳴る)
  else if (story?.id === 'premium' || story?.id === 'line') out.notice = 0;
  // 2026-11-13 企画者「ブラックアウト復活リーチ」: キャラの リーチの 当たりの 1割は、ハズレたと 見せてから 画面 真っ暗 → 大当たり
  // (当たる 回数は 変わらない。見せ方だけ。プレミアは いつも 当たりなので 出さない)
  const storyWin = out.big ? out.bigSuccess : !!out.crownBig && (res.bonus || res.free > 0);
  out.revive = !!story && story.id !== 'premium' && story.id !== 'line' && storyWin && rng() < REVIVE_RATE;
  // キャラの リーチが ない 時は 5段目(ヒヨコJ)まで。6段目(チーターS)まで 進めば 必ず チーターの リーチ
  return out;
}

/** ブラックアウト復活が 出る 割合(キャラの リーチの 当たりの うち。企画者 2026-11-13「当たりの 1割」) */
export const REVIVE_RATE = 0.1;

/** キャラの リーチの 前に ステップアップが 出る 割合(企画者 2026-11-13「半分ずつ」) */
export const STORY_STEP_RATE = 0.5;

/** ステップアップの キャラの 順番(企画者 2026-11-12)。STEP 1 キョンK → 6 チーターS */
// 2026-11-12 企画者「2」→ うさぎK を パンダY と カンガルーH の 間に(6段)
export const STEP_ORDER: readonly string[] = ['kyon', 'panda', 'usagi', 'ramen', 'golf', 'kanojo'];
