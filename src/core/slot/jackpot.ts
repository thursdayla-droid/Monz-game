import type { Rng } from '../rng';
import { payOf, REELS, ROWS, type Grid, type PaySymbol, type SpinResult, type WayWin } from './slot';

/**
 * 7の 大当たり(2026-11-17 企画者「7が そろったら パチンコの 大当たり みたいに」)。画面には 依存しない。
 * 【確定】
 * - ふつうの ゲームで ゴールド7・レインボー7 が 3つ 以上 そろうと 大当たり(特別フリーゲームの 中は 今までの まま)
 * - その 7の 配当(今までと 同じ 枚数)を 回数に 分けて、毎回 そろう(BET は いらない)。企画者「20回 くらい」→ 3つ 20回・4つ 25回・5つ 30回
 * - レインボー7 の 大当たりの あとは、すぐ 次の 大当たり(確定)。次が レインボー7 なら また 続く(連チャン)
 * - 7の 出る 確率は そのまま(企画者「確率は そのままで いい」)
 * 【仮】次の 大当たりが レインボー7 に なる 割合(RAINBOW_NEXT)・次の 大当たりは 3つ そろいの 配当
 */
export const JACKPOT_ROUNDS = 20;
/** 何回 そろうか(2026-11-17 企画者「7が 4個だと 25R で、5個で 30R」) */
export const ROUNDS_BY_LENGTH: Record<3 | 4 | 5, number> = { 3: 20, 4: 25, 5: 30 };
export const roundsOf = (length: 3 | 4 | 5): number => ROUNDS_BY_LENGTH[length] ?? JACKPOT_ROUNDS;
/** 次の 大当たりが レインボー7(また 続く)の 割合【仮】。のこりは ゴールド7(そこで おわり) */
export const RAINBOW_NEXT = 1 / 3;
/**
 * 大当たりの とちゅうで 7が そろって もう 1回 大当たりが ふえる(上乗せ)割合(大当たり 1回 ごと)。
 * 2026-11-17 企画者「50% ぐらい」「ショップで 換金 できる アイテムは 高く する つもり」【仮】
 */
export const STOCK_RATE = 0.5;
export type JackpotSymbol = 'gold7' | 'rainbow7';
const SEVENS: readonly JackpotSymbol[] = ['rainbow7', 'gold7'];
/** 大当たり中に そろう 図柄(7と 王冠は 出さない。まぎらわしい ため) */
const LINE_SYMBOLS: readonly PaySymbol[] = ['diamond', 'bell', 'cherry', 'clover', 'star'];

export interface JackpotState {
  bet: number;
  symbol: JackpotSymbol;
  /** 何つ そろいの 大当たりか(3〜5) */
  length: 3 | 4 | 5;
  /** この 大当たりで もらえる 合計(コイン) */
  total: number;
  /** 全部で 何回 そろうか(roundsOf) */
  rounds: number;
  /** 終わった 回数(0〜rounds) */
  round: number;
  /** これまでに もらった 枚数(この 大当たりの 中) */
  paid: number;
  /** 何回目の 大当たりか(連チャン。1 から) */
  chain: number;
  /** 連チャン ぜんぶの 合計(これまでの 大当たりの ぶんも ふくむ) */
  chainTotal: number;
  /** 上乗せの 7が そろう 回(0 から。-1 = なし)と その 7 */
  addAt: number;
  addSym: JackpotSymbol;
  /** 上乗せで たまった 大当たり(この あとに 順番に) */
  stock: JackpotSymbol[];
}

/** その 回転で 大当たりに なる 7の 当たり(レインボー7 を 先に) */
export function jackpotWin(res: SpinResult): WayWin | undefined {
  for (const s of SEVENS) {
    const w = res.wins.find((x) => x.symbol === s);
    if (w) return w;
  }
  return undefined;
}

/** その 回転で すぐ もらう 枚数(7の ぶんは 大当たりで 分けて もらう) */
export function payNowWithJackpot(res: SpinResult, w: WayWin | undefined): number {
  if (!w) return res.win;
  return Math.max(0, Math.round(res.wins.filter((x) => x !== w).reduce((a, x) => a + x.raw, 0)));
}

const drawSeven = (rng: Rng): JackpotSymbol => (rng() < RAINBOW_NEXT ? 'rainbow7' : 'gold7');

/** rng を 渡すと 上乗せ(STOCK_RATE)を 先に 決める */
export function newJackpot(bet: number, w: Pick<WayWin, 'symbol' | 'length' | 'raw'>, chain = 1, before = 0, rng?: Rng, stock: JackpotSymbol[] = []): JackpotState {
  const rounds = roundsOf(w.length);
  const add = !!rng && rng() < STOCK_RATE;
  // 上乗せは 2回目〜さいごの 2つ前 の どこか(さいごの 方だと 気づきにくい)
  const addAt = add && rng ? 1 + Math.floor(rng() * (rounds - 3)) : -1;
  const addSym = add && rng ? drawSeven(rng) : 'gold7';
  return { bet, symbol: w.symbol as JackpotSymbol, length: w.length, total: Math.max(rounds, Math.round(w.raw)), rounds, round: 0, paid: 0, chain, chainTotal: before, addAt, addSym, stock: [...stock] };
}

/** 次に 回す 回が 上乗せの 回なら その 7 */
export const stockAt = (s: JackpotState): JackpotSymbol | undefined => (s.addAt === s.round ? s.addSym : undefined);

/** i 回目(0 から)に もらう 枚数。合計が ぴったり total に なる(あまりは 後ろの 回に 1枚ずつ) */
export function roundPay(s: Pick<JackpotState, 'total' | 'rounds'>, i: number): number {
  const base = Math.floor(s.total / s.rounds);
  const rest = s.total - base * s.rounds;
  return base + (i >= s.rounds - rest ? 1 : 0);
}

/** 1回 進める。もらう 枚数を 返す(もう 終わって いれば 0) */
export function playRound(s: JackpotState): number {
  if (s.round >= s.rounds) return 0;
  const pay = roundPay(s, s.round);
  const up = stockAt(s);
  if (up) s.stock.push(up);
  s.round++;
  s.paid += pay;
  s.chainTotal += pay;
  return pay;
}

export const jackpotOver = (s: JackpotState): boolean => s.round >= s.rounds;

/**
 * 次の 大当たり。レインボー7 の あとは かならず(ゴールド7 か レインボー7 を 抽選)。
 * それ いがいは 上乗せで たまった 大当たり(なければ おわり = undefined)。fromStock: 上乗せの ぶんか
 */
export function nextJackpot(s: JackpotState, rng: Rng): (JackpotState & { fromStock: boolean }) | undefined {
  const stock = [...s.stock];
  let symbol: JackpotSymbol | undefined;
  let fromStock = false;
  if (s.symbol === 'rainbow7') symbol = drawSeven(rng);
  else if (stock.length) {
    symbol = stock.shift();
    fromStock = true;
  }
  if (!symbol) return undefined;
  return { ...newJackpot(s.bet, { symbol, length: 3, raw: s.bet * payOf(symbol, 3) }, s.chain + 1, s.chainTotal, rng, stock), fromStock };
}

/**
 * 大当たり中の 1回の 図柄。まん中の 段が 5つ そろう(どの 図柄かは 毎回 ちがう)。
 * ほかの マスは 7・王冠 以外から ばらばらに
 */
export function jackpotGrid(rng: Rng, seven?: JackpotSymbol): { grid: Grid; symbol: PaySymbol } {
  // seven: 上乗せの 回は その 7が そろう
  const symbol = seven ?? LINE_SYMBOLS[Math.floor(rng() * LINE_SYMBOLS.length)];
  const others = LINE_SYMBOLS.filter((t) => t !== symbol);
  const grid: Grid = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => others[Math.floor(rng() * others.length)]));
  for (let r = 0; r < REELS; r++) grid[r][1] = symbol;
  return { grid, symbol };
}

/**
 * 7が そろった 時に 続く 大当たりの 平均の 回数(はじめの 1回も ふくむ)。テスト・バランス用。
 * X = ゴールド/レインボー を 2:1 で えらんだ 大当たり 1回からの 平均。G = 1 + p X・R = 1 + p X + X・X = (2G + R) / 3
 */
export function chainCounts(p = STOCK_RATE, q = RAINBOW_NEXT): { gold: number; rainbow: number } {
  // X = (1-q)(1 + pX) + q(1 + pX + X) → X (1 - p - q) = 1
  const x = 1 / (1 - p - q);
  return { gold: 1 + p * x, rainbow: 1 + p * x + x };
}

/** レインボー7 1回から もらえる 平均(BET の 何倍。連チャンの ぶんも ふくむ。次からは 3つ そろいの 配当) */
export function rainbowChainValue(length: 3 | 4 | 5 = 3): number {
  const c = chainCounts();
  return payOf('rainbow7', length) + (c.rainbow - 1) * payOf('gold7', 3);
}
