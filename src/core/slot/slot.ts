import { mulberry32, type Rng } from '../rng';

/**
 * MONZ SLOT(ミニゲーム⑤)の 計算(2026-11-10 企画者の 仕様書。くわしくは docs/SLOT.md)。
 * 画面(Phaser)には 依存しない。乱数は 種から 再現できる(mulberry32)。
 *
 * 【確定】5リール×3段・243WAYS・左から 自動停止・BET 10/50/100(MONZ コイン)・目標の 払い戻し率 95%・
 *        通常配当は 全部 足してから 四捨五入・王冠 3個以上で 宝箱ボーナス(平均 100回転に 1回が 目標)
 * 【仮】図柄の 出る 確率と 配当の 倍率(仕様書の 暫定調整値。あとで 企画者と 決める)
 */

export const REELS = 5;
export const ROWS = 3;
/** BET(MONZ コイン)【確定】 */
export const BETS = [10, 50, 100] as const;
export type Bet = (typeof BETS)[number];

/** 配当の ある 図柄 */
export type PaySymbol = 'rainbow7' | 'gold7' | 'diamond' | 'bell' | 'cherry' | 'clover' | 'star';
/** ふつうの ゲームの 図柄。crown は ボーナス 専用(並びの 配当は ない) */
export type BaseSymbol = PaySymbol | 'crown';
/** 図柄。wild は 特別フリーゲーム だけ(2026-11-11 企画者。どの 図柄の 代わりにも なる・王冠は のぞく) */
export type SymbolId = BaseSymbol | 'wild';
export const SYMBOLS: readonly BaseSymbol[] = ['rainbow7', 'gold7', 'diamond', 'bell', 'cherry', 'clover', 'star', 'crown'];
export const SYMBOL_NAME: Record<SymbolId, string> = {
  wild: 'ワイルド',
  rainbow7: 'レインボー7',
  gold7: 'ゴールド7',
  diamond: 'ダイヤ',
  bell: 'ベル',
  cherry: 'チェリー',
  clover: 'クローバー',
  star: 'スター',
  crown: '王冠',
};

/** 1マスの 出る 割合(%)【仮：仕様書の 暫定案】。合計が ちょうど 100% に なるよう 下で ならす */
export const SYMBOL_WEIGHT: Record<BaseSymbol, number> = {
  rainbow7: 4.21,
  gold7: 7.37,
  diamond: 10.53,
  bell: 14.75,
  cherry: 20.01,
  clover: 20.01,
  star: 20.01,
  // 2026-11-10 企画者「同じ リールに 王冠 2個は やめよう」→ 1リール 1個まで。ボーナスが 約100回に 1回に なるよう 3.1 → 3.7【仮】
  crown: 3.7,
};

/** 3連・4連・5連の 倍率(BET に かける)【仮：仕様書の 暫定調整値】 */
export const PAYTABLE: Record<PaySymbol, readonly [number, number, number]> = {
  rainbow7: [1.708, 5.123, 17.08],
  gold7: [1.282, 3.415, 10.675],
  diamond: [0.856, 2.134, 6.404],
  bell: [0.639, 1.282, 3.415],
  cherry: [0.34, 0.856, 2.134],
  clover: [0.34, 0.639, 1.708],
  star: [0.299, 0.639, 1.708],
};
/**
 * 配当の 倍率に かける 数【仮】。王冠を 1リール 1個までに した(2026-11-10)ので 通常配当が 少し 下がった →
 * 合計 95% に もどすため 仕様書の 倍率を 約2% 上げる
 */
export const PAY_SCALE = 1.0195;
export const PAY_SYMBOLS = Object.keys(PAYTABLE) as PaySymbol[];

/** ボーナスに 入る 王冠の 数(画面の 15マスの どこでも)【確定】 */
export const BONUS_CROWNS = 3;

/** 出る 確率(合計 1 に ならした もの) */
export function symbolProbs(weights: Record<BaseSymbol, number> = SYMBOL_WEIGHT): Record<BaseSymbol, number> {
  const total = SYMBOLS.reduce((a, s) => a + weights[s], 0);
  return Object.fromEntries(SYMBOLS.map((s) => [s, weights[s] / total])) as Record<BaseSymbol, number>;
}

/**
 * 王冠の 数ごとの 出やすさ(ふつうの ゲーム)。1リール 1個まで。
 * 0〜3個は 1マスずつ 抽選した 時と 同じ(3個 = 宝箱 約98回に 1回)。
 * 4個・5個は 企画者(2026-11-11)「もう少し 出やすく」→ 4個 約500回に 1回・5個 約3,000回に 1回【仮】。のこりを 0〜2個で うめる
 */
export const CROWN4_RATE = 1 / 500;
export const CROWN5_RATE = 1 / 3000;
export function crownCountProbs(probs: Record<BaseSymbol, number> = symbolProbs()): number[] {
  const q = 1 - (1 - probs.crown) ** ROWS;
  const b = [0, 1, 2, 3, 4, 5].map((k) => choose(REELS, k) * q ** k * (1 - q) ** (REELS - k));
  const p = [...b];
  p[4] = CROWN4_RATE;
  p[5] = CROWN5_RATE;
  const rest = 1 - p[3] - p[4] - p[5];
  const low = b[0] + b[1] + b[2];
  for (let k = 0; k <= 2; k++) p[k] = (b[k] / low) * rest;
  return p;
}

/** 画面の 図柄。grid[リール][段](段は 上から 0・1・2) */
export type Grid = SymbolId[][];

/** 重みから 1つ 引く 関数を 作る */
function drawer<T extends string>(rng: Rng, items: readonly T[], weight: (t: T) => number): () => T {
  const cum: [T, number][] = [];
  let a = 0;
  for (const t of items) cum.push([t, (a += weight(t))]);
  return () => {
    const r = rng() * a;
    for (const [t, c] of cum) if (r < c) return t;
    return cum[cum.length - 1][0];
  };
}

/**
 * 1回転の 図柄を 決める。結果は ここで 先に 決まる(リーチ演出は これに 合わせて 選ぶ)。
 * 王冠は 1リール 1個まで(企画者 2026-11-10)。王冠の 数を 先に 決めて(crownCountProbs)、王冠の ある リールと 段を えらぶ。
 * ほかの マスは 王冠 以外の 図柄を 1マスずつ 抽選
 */
export function spinGrid(rng: Rng, probs: Record<BaseSymbol, number> = symbolProbs()): Grid {
  const other = drawer(rng, PAY_SYMBOLS, (t) => probs[t]);
  const cp = crownCountProbs(probs);
  let r = rng();
  let k = 0;
  while (k < 5 && (r -= cp[k]) >= 0) k++;
  const reels = [0, 1, 2, 3, 4];
  for (let i = reels.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [reels[i], reels[j]] = [reels[j], reels[i]];
  }
  const crownReels = new Set(reels.slice(0, k));
  return Array.from({ length: REELS }, (_, ri) => {
    const col: SymbolId[] = Array.from({ length: ROWS }, other);
    if (crownReels.has(ri)) col[Math.floor(rng() * ROWS)] = 'crown';
    return col;
  });
}

export interface WayWin {
  symbol: PaySymbol;
  /** 左から 何リール 続いたか(3〜5) */
  length: 3 | 4 | 5;
  /** 成り立った WAYS の 数(各リールの その 図柄の 数を かけた もの) */
  ways: number;
  /** 四捨五入 前の 配当(コイン) */
  raw: number;
  /** 光らせる マス [リール, 段] */
  cells: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  wins: WayWin[];
  /** 通常配当(全部 足して 四捨五入) */
  win: number;
  crowns: number;
  /** 宝箱ボーナス(王冠 ちょうど 3個) */
  bonus: boolean;
  /** 特別フリーゲームの 回数(王冠 4個 = 5回・5個 = 10回。2026-11-11 企画者)。なければ 0 */
  free: number;
  /** 王冠の マス(光らせる) */
  crownCells: [number, number][];
}

/**
 * 243WAYS の 判定【確定】。
 * - 左端の リールから 同じ 図柄が 3リール 以上 続くと 当たり(段は そろわなくて よい)
 * - 1リールに 同じ 図柄が 複数 あれば、その 数だけ WAYS が ふえる(かけ算)
 * - 図柄ごとに いちばん 長い 連続だけで 計算(3連と 4連を 二重に 数えない)
 * - ちがう 図柄の 当たりは 全部 足す。さいごに 四捨五入
 */
export function evaluate(grid: Grid, bet: number, scale = PAY_SCALE): SpinResult {
  const wins: WayWin[] = [];
  for (const s of PAY_SYMBOLS) {
    let ways = 1;
    let len = 0;
    const cells: [number, number][] = [];
    for (let r = 0; r < REELS; r++) {
      // ワイルドは どの 図柄の 代わりにも なる
      const rows = grid[r].map((x, i) => (x === s || x === 'wild' ? i : -1)).filter((i) => i >= 0);
      if (!rows.length) break;
      ways *= rows.length;
      len++;
      for (const i of rows) cells.push([r, i]);
    }
    if (len >= 3) {
      const length = len as 3 | 4 | 5;
      wins.push({ symbol: s, length, ways, raw: bet * PAYTABLE[s][length - 3] * scale * ways, cells });
    }
  }
  const crownCells: [number, number][] = [];
  grid.forEach((col, r) => col.forEach((x, i) => x === 'crown' && crownCells.push([r, i])));
  const crowns = crownCells.length;
  return { grid, wins, win: Math.round(wins.reduce((a, w) => a + w.raw, 0)), crowns, bonus: crowns === BONUS_CROWNS, free: crowns >= 5 ? FREE_BY_CROWNS[5] : crowns === 4 ? FREE_BY_CROWNS[4] : 0, crownCells };
}

/** 1回転(図柄を 決めて 判定) */
export function spin(rng: Rng, bet: number, probs?: Record<BaseSymbol, number>): SpinResult {
  return evaluate(spinGrid(rng, probs), bet);
}

// ---------------- 宝箱ボーナス【確定】 ----------------

export type ChestContent = 'big' | 'normal' | 'end';
/** 宝箱の 中身の 報酬(BET の 何倍)【確定】 */
export const CHEST_PAY: Record<ChestContent, number> = { big: 5, normal: 1, end: 0 };

/** 1ラウンドの 3つの 宝箱(毎回 まぜる。大当たり・普通・終了が 1つずつ) */
export function dealChests(rng: Rng): [ChestContent, ChestContent, ChestContent] {
  const a: ChestContent[] = ['big', 'normal', 'end'];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a as [ChestContent, ChestContent, ChestContent];
}

export interface BonusState {
  bet: number;
  round: number;
  /** これまでの 合計(コイン) */
  total: number;
  chests: [ChestContent, ChestContent, ChestContent];
  over: boolean;
  history: ChestContent[];
}

export const newBonus = (rng: Rng, bet: number): BonusState => ({ bet, round: 1, total: 0, chests: dealChests(rng), over: false, history: [] });

/** 宝箱を 1つ えらぶ。終了なら over。続くなら 新しい 3つ */
export function pickChest(b: BonusState, index: number, rng: Rng): ChestContent {
  if (b.over) return 'end';
  const got = b.chests[Math.max(0, Math.min(2, index))];
  b.history.push(got);
  b.total += b.bet * CHEST_PAY[got];
  if (got === 'end') b.over = true;
  else {
    b.round++;
    b.chests = dealChests(rng);
  }
  return got;
}

// ---------------- 特別フリーゲーム(2026-11-11 企画者) ----------------
/**
 * 【確定】王冠 4個 → 5回・5個 → 10回。5リール × 5段(3,125通り)・配当表は 同じ。
 * ワイルドが 1つでも 新しく 出たら その 回は 回数を 使わない。ワイルドは 止まった 所に のこる(もう ワイルドが ある 所には 何も 止まらない)。
 * フリーゲーム中に 王冠 3個 以上で 回数 +5。
 * 配当は ふつうと 同じ(2026-11-11 企画者「10分の1 しないで いい」)。【仮】ワイルドの 出やすさ(1マス 約1%)
 */
export const FREE_BY_CROWNS: Record<4 | 5, number> = { 4: 5, 5: 10 };
export const FREE_ROWS = 5;
export const FREE_RETRIGGER = 5;
// 2026-11-11 企画者「フリーゲームは 10分の1 しないで いい」→ ふつうと 同じ 配当
export const FREE_PAY_SCALE = PAY_SCALE;
/** ワイルドの 重み(ほかの 図柄の 重みと 同じ 単位。合計 約104 なので 約1%) */
export const FREE_WILD_WEIGHT = 1.0;

export interface FreeState {
  bet: number;
  /** のこりの 回数 */
  left: number;
  /** はじめの 回数 */
  games: number;
  /** 回した 回数(回数を 使わない 回も 数える) */
  played: number;
  /** これまでの 合計(コイン) */
  total: number;
  /** ワイルドが のこって いる マス [リール][段] */
  sticky: boolean[][];
}

export const newFree = (bet: number, games: number): FreeState => ({ bet, left: games, games, played: 0, total: 0, sticky: Array.from({ length: REELS }, () => Array(FREE_ROWS).fill(false)) });

export interface FreeSpinResult {
  res: SpinResult;
  /** 新しく 出た ワイルド [リール, 段] */
  newWilds: [number, number][];
  /** 回数を 使ったか(新しい ワイルドが なければ 使う) */
  used: boolean;
  /** ふえた 回数(王冠 3個 以上で +5) */
  added: number;
}

/** フリーゲームを 1回 回す(state を 進める) */
export function freeSpin(state: FreeState, rng: Rng, probs: Record<BaseSymbol, number> = symbolProbs()): FreeSpinResult {
  const items: SymbolId[] = [...SYMBOLS, 'wild'];
  const one = drawer(rng, items, (t) => (t === 'wild' ? FREE_WILD_WEIGHT / 100 : probs[t as BaseSymbol]));
  const noCrown = drawer(rng, items.filter((t) => t !== 'crown'), (t) => (t === 'wild' ? FREE_WILD_WEIGHT / 100 : probs[t as BaseSymbol]));
  const newWilds: [number, number][] = [];
  const grid: Grid = Array.from({ length: REELS }, (_, r) => {
    let crown = false;
    return Array.from({ length: FREE_ROWS }, (_, i) => {
      if (state.sticky[r][i]) return 'wild' as SymbolId;
      // 王冠は 1リール 1個まで
      const s = crown ? noCrown() : one();
      if (s === 'crown') crown = true;
      if (s === 'wild') newWilds.push([r, i]);
      return s;
    });
  });
  const res = evaluate(grid, state.bet, FREE_PAY_SCALE);
  for (const [r, i] of newWilds) state.sticky[r][i] = true;
  const added = res.crowns >= BONUS_CROWNS ? FREE_RETRIGGER : 0;
  const used = newWilds.length === 0;
  state.played++;
  state.total += res.win;
  state.left += added - (used ? 1 : 0);
  // フリーゲームの 中では 宝箱・フリーゲームの 入り口に しない
  res.bonus = false;
  res.free = 0;
  return { res, newWilds, used, added };
}

/** フリーゲームを さいごまで 回した 合計(しらべる 用) */
export function playFree(bet: number, games: number, rng: Rng): FreeState {
  const st = newFree(bet, games);
  while (st.left > 0 && st.played < 1000) freeSpin(st, rng);
  return st;
}

// ---------------- 理論値(しらべる 用) ----------------

/** n個から k個 えらぶ 数 */
const choose = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

/**
 * 理論の 払い戻し率(四捨五入 前)。1マスずつ 別に 抽選する モデルなので、
 * 図柄 s の 1リールの 数の 期待値 = 3p、続きが 切れる 確率 = (1-p)^3 で 正確に 出せる
 */
export function theory(probs: Record<BaseSymbol, number> = symbolProbs()) {
  const perSymbol = {} as Record<PaySymbol, number>;
  let normal = 0;
  // 1リールの 王冠は 0個か 1個。王冠 以外の マスで s の 確率 ps。王冠の ある リールの 割合は 王冠の 数の 平均 ÷ 5(リールどうしの 関係は 小さいので むし)
  const c = probs.crown;
  const cp = crownCountProbs(probs);
  const p0 = 1 - cp.reduce((a, p, k) => a + p * k, 0) / REELS;
  for (const s of PAY_SYMBOLS) {
    const ps = probs[s] / (1 - c);
    const e = p0 * ROWS * ps + (1 - p0) * (ROWS - 1) * ps;
    const none = p0 * (1 - ps) ** ROWS + (1 - p0) * (1 - ps) ** (ROWS - 1);
    const m = PAYTABLE[s].map((x) => x * PAY_SCALE);
    const v = m[0] * e ** 3 * none + m[1] * e ** 4 * none + m[2] * e ** 5;
    perSymbol[s] = v;
    normal += v;
  }
  // 宝箱は 王冠 ちょうど 3個
  const bonusRate = cp[3];
  // 宝箱: 1ラウンドの 期待 (5+1+0)/3 = 2・続く 確率 2/3 → 合計の 期待 2 ÷ (1 - 2/3) = 6
  const pCont = 2 / 3;
  const bonusAvg = ((CHEST_PAY.big + CHEST_PAY.normal + CHEST_PAY.end) / 3) / (1 - pCont);
  return { normal, perSymbol, bonusRate, bonusAvg, bonus: bonusRate * bonusAvg, total: normal + bonusRate * bonusAvg, free4Rate: cp[4], free5Rate: cp[5] };
}

export interface SimResult {
  bet: number;
  spins: number;
  /** 通常配当の 払い戻し率(四捨五入 後) */
  normalRtp: number;
  bonusRtp: number;
  totalRtp: number;
  /** 通常の 当たり(1枚 以上 もどる)の 割合 */
  hitRate: number;
  /** BET 以上 もどった 割合 */
  plusRate: number;
  /** 図柄ごとの 当たりの 割合(その 図柄が 3連 以上) */
  symbolHit: Record<string, number>;
  bonusRate: number;
  bonusAvg: number;
  /** 特別フリーゲーム(払い戻し率・入った 割合・1回の 平均 BET の 何倍) */
  freeRtp: number;
  freeRate: number;
  freeAvg: number;
  /** 四捨五入で ずれた 合計(+ なら 多く 払った) */
  roundingDiff: number;
  /** 合計の 払い戻し率の ぶれ(標準誤差。±2倍 くらいの 中に 本当の 値が ある) */
  stdErr: number;
}

/** モンテカルロ(実際に たくさん 回して しらべる) */
export function simulate(bet: number, spins: number, seed = 1): SimResult {
  const rng = mulberry32(seed);
  const probs = symbolProbs();
  let paid = 0;
  let rawSum = 0;
  let hits = 0;
  let plus = 0;
  let bonus = 0;
  let bonusPaid = 0;
  let free = 0;
  let freePaid = 0;
  const sym: Record<string, number> = {};
  let sumSq = 0;
  for (let n = 0; n < spins; n++) {
    let got = 0;
    const r = spin(rng, bet, probs);
    paid += r.win;
    got += r.win;
    rawSum += r.wins.reduce((a, w) => a + w.raw, 0);
    if (r.win > 0) hits++;
    if (r.win >= bet) plus++;
    for (const w of r.wins) sym[w.symbol] = (sym[w.symbol] ?? 0) + 1;
    if (r.bonus) {
      bonus++;
      const b = newBonus(rng, bet);
      while (!b.over) pickChest(b, Math.floor(rng() * 3), rng);
      bonusPaid += b.total;
      got += b.total;
    }
    if (r.free) {
      free++;
      const f = playFree(bet, r.free, rng);
      freePaid += f.total;
      got += f.total;
    }
    sumSq += (got / bet) ** 2;
  }
  const total = spins * bet;
  const mean = (paid + bonusPaid + freePaid) / total;
  return {
    bet,
    spins,
    normalRtp: paid / total,
    bonusRtp: bonusPaid / total,
    totalRtp: (paid + bonusPaid + freePaid) / total,
    freeRtp: freePaid / total,
    freeRate: free / spins,
    freeAvg: free ? freePaid / free / bet : 0,
    hitRate: hits / spins,
    plusRate: plus / spins,
    symbolHit: Object.fromEntries(Object.entries(sym).map(([k, v]) => [k, v / spins])),
    bonusRate: bonus / spins,
    bonusAvg: bonus ? bonusPaid / bonus / bet : 0,
    roundingDiff: paid - rawSum,
    stdErr: Math.sqrt(Math.max(0, sumSq / spins - mean * mean) / spins),
  };
}
