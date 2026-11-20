import type { Rng } from '../rng';

/**
 * CROWN RUSH(クラウンラッシュ。2026-11-19 企画者)。ROYAL JACKPOT の 新しい ボーナス。画面には 依存しない。
 * 【確定】
 * - 2026-11-20 企画者「15マス」「ルーレットは 3回のみ 1-6」「ボスは 倒したら 100倍」→ 15マス・ちょうど 3回(+1回は なし)・撃破は BET×100
 * - 王冠 3個(今の 宝箱ボーナスの 入り口)で、宝箱ボーナスか CROWN RUSH の どちらかが 半分ずつ(企画者「宝箱ボーナスと 半々」)
 * - (はじめ 20マス・4回 → 2026-11-20 に 15マス・3回)一本道の すごろく。1〜6 が 同じ 確率
 * - 止まった マスの 効果。20マス目(ボス)に 着く か こえたら ボス戦。回数が 0 で ゴール できなければ 終わり
 * - マス(1〜19 に ランダムに 置く・毎回 ちがう): コイン5・宝箱3・追加ルーレット4・ミステリー2・ダイヤ2・王冠2・トラップ1。20マス目は ボス
 * - トラップは 1〜3マス もどる。もどった 先の 効果は 出ない
 * - ボス KING GORO: HP 3・ルーレット 最大 5回・HIT 50%・3 HIT で 撃破(3 MISS で 終わり)。撃破の 確率は 50%
 * - 撃破の 報酬: BET の 10倍 50%・20倍 30%・50倍 15%・100倍 4%・500倍 1%
 * - すごろくの 報酬と ボスの 報酬を 足して、ボーナスの 終わりに まとめて もらう(ボスに 負けても すごろくの ぶんは もらえる)
 * 【仮】(企画者「仮で 決めて OK」): コイン BET×0.5/1/1.5/2・宝箱 BET×1〜5(10回に 1回 さらに +1回)・
 *   ミステリー 半分 BET×1〜3/半分 +1回・ダイヤ BET×3・王冠 BET×5・トラップ 1〜3マス(同じ 確率)
 */
export type RushSquare = 'coin' | 'chest' | 'extra' | 'mystery' | 'diamond' | 'crown' | 'trap' | 'boss';

export const RUSH_GOAL = 15;
export const RUSH_START_SPINS = 3;
/** 1〜14マス目(2026-11-20。+1回の マスは なし)【仮】の 数 */
// 2026-11-20 企画者「ルーレット +1 マス 2個 ぐらい 置いて いいよ」→ +1 を 2つ(コインを 5 → 3)
export const RUSH_SQUARES: Record<Exclude<RushSquare, 'boss'>, number> = { coin: 3, chest: 3, extra: 2, mystery: 2, diamond: 2, crown: 1, trap: 1 };
export const BOSS_HP = 3;
export const BOSS_SPINS = 5;
export const BOSS_HIT = 0.5;
/** 撃破の 報酬(BET の 何倍。2026-11-20 企画者「倒したら 100倍」) */
export const BOSS_MULT = 100;
/** コインの マスの 倍率【仮】 */
export const COIN_MULTS = [0.5, 1, 1.5, 2] as const;
/** 宝箱の マスで さらに +1回 の 割合(2026-11-20 から 0。ルーレットは ちょうど 3回) */
export const CHEST_EXTRA = 0;

export interface RushBoss {
  hp: number;
  left: number;
  hits: number;
  misses: number;
}

export interface RushState {
  bet: number;
  /** 1〜20マス目(board[0] が 1マス目。board[19] は ボス) */
  board: RushSquare[];
  /** 今 いる マス(0 = スタート) */
  pos: number;
  /** のこりの ルーレット */
  spins: number;
  /** ここまでの 報酬(コイン・整数) */
  total: number;
  phase: 'board' | 'boss' | 'done';
  boss?: RushBoss;
  /** ボスを 倒したか・その 報酬(BET の 何倍) */
  defeated?: boolean;
  bossMult?: number;
}

const shuffle = <T>(rng: Rng, a: T[]): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const randInt = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

export function makeBoard(rng: Rng): RushSquare[] {
  const list = Object.entries(RUSH_SQUARES).flatMap(([k, n]) => Array.from({ length: n }, () => k as RushSquare));
  return [...shuffle(rng, list), 'boss'];
}

export const newRush = (rng: Rng, bet: number): RushState => ({ bet, board: makeBoard(rng), pos: 0, spins: RUSH_START_SPINS, total: 0, phase: 'board' });

export const rollDie = (rng: Rng): number => randInt(rng, 1, 6);

export interface RushStep {
  die: number;
  /** 進む 前・止まった マス(トラップの 時は もどる 前) */
  from: number;
  to: number;
  square: RushSquare | null;
  coins: number;
  extra: number;
  /** トラップで もどった 先(もどらない 時は undefined) */
  back?: number;
  /** ボス戦へ */
  boss: boolean;
}

/** すごろくの ルーレット 1回(die は 先に 決めた 目。画面の 表示と 同じ 数を わたす) */
export function rushMove(s: RushState, die: number, rng: Rng): RushStep {
  if (s.phase !== 'board' || s.spins <= 0) throw new Error('rush: cannot move');
  s.spins--;
  const from = s.pos;
  const to = Math.min(RUSH_GOAL, from + die);
  s.pos = to;
  const step: RushStep = { die, from, to, square: null, coins: 0, extra: 0, boss: false };
  if (to >= RUSH_GOAL) {
    step.square = 'boss';
    step.boss = true;
    s.phase = 'boss';
    s.boss = { hp: BOSS_HP, left: BOSS_SPINS, hits: 0, misses: 0 };
    return step;
  }
  const sq = s.board[to - 1];
  step.square = sq;
  const b = s.bet;
  switch (sq) {
    case 'coin':
      step.coins = Math.round(b * COIN_MULTS[Math.floor(rng() * COIN_MULTS.length)]);
      break;
    case 'chest':
      step.coins = b * randInt(rng, 1, 5);
      if (CHEST_EXTRA > 0 && rng() < CHEST_EXTRA) step.extra = 1;
      break;
    case 'extra':
      step.extra = 1;
      break;
    case 'mystery':
      // 【仮】BET×1〜5(2026-11-20 から +1回は なし)
      step.coins = b * randInt(rng, 1, 5);
      break;
    case 'diamond':
      step.coins = b * 3;
      break;
    case 'crown':
      step.coins = b * 5;
      break;
    case 'trap':
      step.back = Math.max(0, to - randInt(rng, 1, 3));
      s.pos = step.back;
      break;
  }
  s.total += step.coins;
  s.spins += step.extra;
  if (s.spins <= 0) s.phase = 'done';
  return step;
}

/** ボス戦の ルーレット 1回(hit は 先に 決めた 結果) */
export function bossSpin(s: RushState, hit: boolean, rng: Rng): { hit: boolean; defeated: boolean; over: boolean; mult?: number } {
  const bo = s.boss;
  if (s.phase !== 'boss' || !bo || bo.left <= 0) throw new Error('rush: no boss');
  bo.left--;
  if (hit) {
    bo.hits++;
    bo.hp--;
  } else bo.misses++;
  if (bo.hp <= 0) {
    void rng;
    const mult = BOSS_MULT;
    s.defeated = true;
    s.bossMult = mult;
    s.total += s.bet * mult;
    s.phase = 'done';
    return { hit, defeated: true, over: true, mult };
  }
  // のこりで 3 HIT に とどかない(3 MISS)・回数 0
  if (bo.misses > BOSS_SPINS - BOSS_HP || bo.left <= 0) {
    s.defeated = false;
    s.phase = 'done';
    return { hit, defeated: false, over: true };
  }
  return { hit, defeated: false, over: false };
}

export const rollHit = (rng: Rng): boolean => rng() < BOSS_HIT;

/** 保存から もどす(おかしな データは 捨てる) */
export function fixRush(raw: unknown, bets: readonly number[]): RushState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Partial<RushState>;
  const sqs: RushSquare[] = ['coin', 'chest', 'extra', 'mystery', 'diamond', 'crown', 'trap', 'boss'];
  if (!bets.includes(Number(d.bet)) || !Array.isArray(d.board) || d.board.length !== RUSH_GOAL || !d.board.every((x) => sqs.includes(x))) return undefined;
  const phase = d.phase === 'boss' || d.phase === 'done' ? d.phase : 'board';
  const n = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  const s: RushState = { bet: Number(d.bet), board: d.board, pos: n(d.pos, 0, RUSH_GOAL), spins: n(d.spins, 0, 99), total: n(d.total, 0, 1e12), phase };
  if (phase === 'boss') {
    const b = (d.boss ?? {}) as Partial<RushBoss>;
    s.boss = { hp: n(b.hp, 0, BOSS_HP), left: n(b.left, 0, BOSS_SPINS), hits: n(b.hits, 0, BOSS_HP), misses: n(b.misses, 0, BOSS_SPINS) };
    if (s.boss.hp <= 0 || s.boss.left <= 0) s.phase = 'done';
  }
  if (d.defeated !== undefined) s.defeated = d.defeated === true;
  if (d.bossMult !== undefined) s.bossMult = n(d.bossMult, 0, 500);
  return s;
}
