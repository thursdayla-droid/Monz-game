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

/** 図柄。crown は ボーナス 専用(並びの 配当は ない) */
export type SymbolId = 'rainbow7' | 'gold7' | 'diamond' | 'bell' | 'cherry' | 'clover' | 'star' | 'crown';
export const SYMBOLS: readonly SymbolId[] = ['rainbow7', 'gold7', 'diamond', 'bell', 'cherry', 'clover', 'star', 'crown'];
export const SYMBOL_NAME: Record<SymbolId, string> = {
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
export const SYMBOL_WEIGHT: Record<SymbolId, number> = {
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
export const PAYTABLE: Record<Exclude<SymbolId, 'crown'>, readonly [number, number, number]> = {
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
export const PAY_SYMBOLS = Object.keys(PAYTABLE) as Exclude<SymbolId, 'crown'>[];

/** ボーナスに 入る 王冠の 数(画面の 15マスの どこでも)【確定】 */
export const BONUS_CROWNS = 3;

/** 出る 確率(合計 1 に ならした もの) */
export function symbolProbs(weights: Record<SymbolId, number> = SYMBOL_WEIGHT): Record<SymbolId, number> {
  const total = SYMBOLS.reduce((a, s) => a + weights[s], 0);
  return Object.fromEntries(SYMBOLS.map((s) => [s, weights[s] / total])) as Record<SymbolId, number>;
}

/** 画面の 図柄。grid[リール][段](段は 上から 0・1・2) */
export type Grid = SymbolId[][];

/** 1回転の 図柄を 決める(1マスずつ 別に 抽選する モデル)。結果は ここで 先に 決まる(リーチ演出は これに 合わせて 選ぶ) */
export function spinGrid(rng: Rng, probs: Record<SymbolId, number> = symbolProbs()): Grid {
  const cum: [SymbolId, number][] = [];
  let a = 0;
  for (const s of SYMBOLS) cum.push([s, (a += probs[s])]);
  const one = (): SymbolId => {
    const r = rng() * a;
    for (const [s, c] of cum) if (r < c) return s;
    return cum[cum.length - 1][0];
  };
  // 王冠は 1リール 1個まで(企画者 2026-11-10)。2個 以上 出たら 1個だけ のこして、ほかは 王冠 以外を 引きなおす
  const other = (): SymbolId => {
    for (;;) {
      const s = one();
      if (s !== 'crown') return s;
    }
  };
  return Array.from({ length: REELS }, () => {
    const col = Array.from({ length: ROWS }, one);
    const at = col.map((x, i) => (x === 'crown' ? i : -1)).filter((i) => i >= 0);
    if (at.length > 1) {
      const keep = at[Math.floor(rng() * at.length)];
      for (const i of at) if (i !== keep) col[i] = other();
    }
    return col;
  });
}

export interface WayWin {
  symbol: Exclude<SymbolId, 'crown'>;
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
  bonus: boolean;
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
export function evaluate(grid: Grid, bet: number): SpinResult {
  const wins: WayWin[] = [];
  for (const s of PAY_SYMBOLS) {
    let ways = 1;
    let len = 0;
    const cells: [number, number][] = [];
    for (let r = 0; r < REELS; r++) {
      const rows = grid[r].map((x, i) => (x === s ? i : -1)).filter((i) => i >= 0);
      if (!rows.length) break;
      ways *= rows.length;
      len++;
      for (const i of rows) cells.push([r, i]);
    }
    if (len >= 3) {
      const length = len as 3 | 4 | 5;
      wins.push({ symbol: s, length, ways, raw: bet * PAYTABLE[s][length - 3] * PAY_SCALE * ways, cells });
    }
  }
  const crownCells: [number, number][] = [];
  grid.forEach((col, r) => col.forEach((x, i) => x === 'crown' && crownCells.push([r, i])));
  const crowns = crownCells.length;
  return { grid, wins, win: Math.round(wins.reduce((a, w) => a + w.raw, 0)), crowns, bonus: crowns >= BONUS_CROWNS, crownCells };
}

/** 1回転(図柄を 決めて 判定) */
export function spin(rng: Rng, bet: number, probs?: Record<SymbolId, number>): SpinResult {
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
export function theory(probs: Record<SymbolId, number> = symbolProbs()) {
  const perSymbol = {} as Record<Exclude<SymbolId, 'crown'>, number>;
  let normal = 0;
  // 1リールの 王冠は 0個か 1個(2個 以上は 1個に して ほかを 王冠 以外に)。王冠 以外の マスで s の 確率 ps
  const c = probs.crown;
  const p0 = (1 - c) ** ROWS;
  for (const s of PAY_SYMBOLS) {
    const ps = probs[s] / (1 - c);
    const e = p0 * ROWS * ps + (1 - p0) * (ROWS - 1) * ps;
    const none = p0 * (1 - ps) ** ROWS + (1 - p0) * (1 - ps) ** (ROWS - 1);
    const m = PAYTABLE[s].map((x) => x * PAY_SCALE);
    const v = m[0] * e ** 3 * none + m[1] * e ** 4 * none + m[2] * e ** 5;
    perSymbol[s] = v;
    normal += v;
  }
  // 王冠が ある リールの 数が 3 以上
  const q = 1 - p0;
  let bonusRate = 0;
  for (let k = BONUS_CROWNS; k <= REELS; k++) bonusRate += choose(REELS, k) * q ** k * (1 - q) ** (REELS - k);
  // 宝箱: 1ラウンドの 期待 (5+1+0)/3 = 2・続く 確率 2/3 → 合計の 期待 2 ÷ (1 - 2/3) = 6
  const pCont = 2 / 3;
  const bonusAvg = ((CHEST_PAY.big + CHEST_PAY.normal + CHEST_PAY.end) / 3) / (1 - pCont);
  return { normal, perSymbol, bonusRate, bonusAvg, bonus: bonusRate * bonusAvg, total: normal + bonusRate * bonusAvg };
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
    sumSq += (got / bet) ** 2;
  }
  const total = spins * bet;
  const mean = (paid + bonusPaid) / total;
  return {
    bet,
    spins,
    normalRtp: paid / total,
    bonusRtp: bonusPaid / total,
    totalRtp: (paid + bonusPaid) / total,
    hitRate: hits / spins,
    plusRate: plus / spins,
    symbolHit: Object.fromEntries(Object.entries(sym).map(([k, v]) => [k, v / spins])),
    bonusRate: bonus / spins,
    bonusAvg: bonus ? bonusPaid / bonus / bet : 0,
    roundingDiff: paid - rawSum,
    stdErr: Math.sqrt(Math.max(0, sumSq / spins - mean * mean) / spins),
  };
}
