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

export function newJackpot(bet: number, w: Pick<WayWin, 'symbol' | 'length' | 'raw'>, chain = 1, before = 0): JackpotState {
  const rounds = roundsOf(w.length);
  return { bet, symbol: w.symbol as JackpotSymbol, length: w.length, total: Math.max(rounds, Math.round(w.raw)), rounds, round: 0, paid: 0, chain, chainTotal: before };
}

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
  s.round++;
  s.paid += pay;
  s.chainTotal += pay;
  return pay;
}

export const jackpotOver = (s: JackpotState): boolean => s.round >= s.rounds;

/** レインボー7 の あとの 次の 大当たり(ゴールド7 なら そこで おわり)。レインボー7 で なければ undefined */
export function nextJackpot(s: JackpotState, rng: Rng): JackpotState | undefined {
  if (s.symbol !== 'rainbow7') return undefined;
  const symbol: JackpotSymbol = rng() < RAINBOW_NEXT ? 'rainbow7' : 'gold7';
  return newJackpot(s.bet, { symbol, length: 3, raw: s.bet * payOf(symbol, 3) }, s.chain + 1, s.chainTotal);
}

/**
 * 大当たり中の 1回の 図柄。まん中の 段が 5つ そろう(どの 図柄かは 毎回 ちがう)。
 * ほかの マスは 7・王冠 以外から ばらばらに
 */
export function jackpotGrid(rng: Rng): { grid: Grid; symbol: PaySymbol } {
  const symbol = LINE_SYMBOLS[Math.floor(rng() * LINE_SYMBOLS.length)];
  const others = LINE_SYMBOLS.filter((t) => t !== symbol);
  const grid: Grid = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => others[Math.floor(rng() * others.length)]));
  for (let r = 0; r < REELS; r++) grid[r][1] = symbol;
  return { grid, symbol };
}

/** レインボー7 1回から もらえる 平均(BET の 何倍。連チャンの ぶんも ふくむ)。テスト・バランス用 */
export function rainbowChainValue(length: 3 | 4 | 5 = 3): number {
  // 次の 大当たりは かならず 1回。それが レインボーなら また 続く → 平均 1 / (1 - RAINBOW_NEXT) 回
  const extra = 1 / (1 - RAINBOW_NEXT);
  const avgNext = RAINBOW_NEXT * payOf('rainbow7', 3) + (1 - RAINBOW_NEXT) * payOf('gold7', 3);
  return payOf('rainbow7', length) + extra * avgNext;
}
