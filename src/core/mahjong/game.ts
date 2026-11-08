import { startRound, type RoundResult, type RoundRules, type RoundState } from './round';
import { EAST, SOUTH } from './tiles';

/**
 * 半荘(東場・南場)の 流れ(企画者 2026-11-08「半荘」「親が 続く 決まりは ふつうの 麻雀」)。
 * - 親が アガる・流局で 親が テンパイ → 親は そのまま(連荘)・本場 +1
 * - 流局(親が ノーテン) → 親が 次へ・本場 +1
 * - 子が アガる → 親が 次へ・本場 0
 * - 九種九牌 → 親は そのまま・本場 +1
 * 南4局が おわったら 半荘おわり。西入・飛び・アガリやめは【未確定】(今は なし)
 */
export interface GameState {
  seed: number;
  points: number[];
  roundWind: number;
  /** 何局目(0〜3)。親 = (startDealer + kyoku) % 4 */
  kyoku: number;
  startDealer: number;
  honba: number;
  sticks: number;
  round: RoundState;
  /** 何回目の 局か(種を 変える ため) */
  count: number;
  over: boolean;
  rules?: Partial<RoundRules>;
}

export const START_POINTS = 25000;
export const dealerOf = (g: GameState): number => (g.startDealer + g.kyoku) % 4;

function begin(g: GameState): void {
  g.round = startRound({ seed: (g.seed * 7919 + g.count * 104729) >>> 0, dealer: dealerOf(g), roundWind: g.roundWind, honba: g.honba, sticks: g.sticks, points: g.points, rules: g.rules });
}

export function newGame(seed: number, startDealer = 0, rules?: Partial<RoundRules>): GameState {
  const g = { seed, points: [START_POINTS, START_POINTS, START_POINTS, START_POINTS], roundWind: EAST, kyoku: 0, startDealer, honba: 0, sticks: 0, count: 0, over: false, rules } as GameState;
  begin(g);
  return g;
}

/** 局の 結果で 点を 動かし、次の 局へ(半荘が おわれば over) */
export function nextRound(g: GameState): void {
  const r: RoundResult | null = g.round.result;
  if (!r) throw new Error('round not finished');
  const dealer = dealerOf(g);
  // リーチ棒は round の 中で points から 引かれ、sticks に 入っている
  g.sticks = g.round.cfg.sticks;
  for (let i = 0; i < 4; i++) g.points[i] += r.delta[i];
  let keep: boolean;
  if (r.kind === 'win') {
    g.sticks = 0;
    keep = r.wins.some((w) => w.seat === dealer);
    g.honba = keep ? g.honba + 1 : 0;
  } else {
    keep = r.reason === 'kyuushu' || r.tenpai[dealer];
    g.honba++;
  }
  if (!keep) {
    g.kyoku++;
    if (g.kyoku === 4) {
      g.kyoku = 0;
      g.roundWind++;
    }
  }
  g.count++;
  if (g.roundWind > SOUTH) {
    g.over = true;
    return;
  }
  begin(g);
}
