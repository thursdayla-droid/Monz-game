import type { Rng } from './rng';

/**
 * スクラッチ(2026-11-17 企画者)。ROYAL JACKPOT の ショップで 1枚 100,000 RC → お世話画面の アイテムに 入る → 使うと 3つ 削る。
 * 2つ 同じ マークが そろったら 当たり。マークごとに 当たりが ちがう。当たる 確率は 画面に 出さない(企画者「公表しない」)。
 * 【確定】下の 表は 企画者の 数字
 */
export type ScratchKind = 'coin' | 'exp';
export type ScratchMark = 'cherry' | 'clover' | 'star' | 'bell' | 'diamond' | 'gold7' | 'rainbow7' | 'crown';

export const SCRATCH_ITEMS: Record<ScratchKind, string> = { coin: 'scratch_coin', exp: 'scratch_exp' };
export const SCRATCH_NAMES: Record<ScratchKind, string> = { coin: 'コインスクラッチ', exp: 'EXPスクラッチ' };
/** ROYAL JACKPOT の ショップの 値段(RC) */
export const SCRATCH_PRICE = 100_000;

export interface ScratchPrize {
  /** そろう マーク(null = ハズレ) */
  mark: ScratchMark | null;
  /** もらえる 量(コインスクラッチは MONZ コイン・経験値スクラッチは 経験値) */
  amount: number;
  /** 出る 割合(%) */
  rate: number;
}

export const SCRATCH_TABLE: Record<ScratchKind, readonly ScratchPrize[]> = {
  // 10% ハズレ・19% 1,000・20% 2,000・40% 5,000・10% 10,000・1% 50,000(MONZ コイン)
  coin: [
    { mark: null, amount: 0, rate: 10 },
    { mark: 'cherry', amount: 1000, rate: 19 },
    { mark: 'clover', amount: 2000, rate: 20 },
    { mark: 'bell', amount: 5000, rate: 40 },
    { mark: 'diamond', amount: 10000, rate: 10 },
    { mark: 'gold7', amount: 50000, rate: 1 },
  ],
  // 10% ハズレ・16% 100・20% 200・40% 500・10% 1,000・3% 5,000・1% 10,000(経験値)
  exp: [
    { mark: null, amount: 0, rate: 10 },
    { mark: 'star', amount: 100, rate: 16 },
    { mark: 'cherry', amount: 200, rate: 20 },
    { mark: 'clover', amount: 500, rate: 40 },
    { mark: 'bell', amount: 1000, rate: 10 },
    { mark: 'gold7', amount: 5000, rate: 3 },
    { mark: 'rainbow7', amount: 10000, rate: 1 },
  ],
};

export interface ScratchResult {
  kind: ScratchKind;
  /** 3つの マス(左から) */
  marks: [ScratchMark, ScratchMark, ScratchMark];
  prize: ScratchPrize;
}

const shuffle = <T>(rng: Rng, a: T[]): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 1枚 削る 結果を 先に 決める。当たり = 当たりの マーク 2つ + ちがう マーク 1つ・ハズレ = 3つとも ちがう */
export function drawScratch(kind: ScratchKind, rng: Rng): ScratchResult {
  const table = SCRATCH_TABLE[kind];
  let r = rng() * table.reduce((a, p) => a + p.rate, 0);
  let prize = table[table.length - 1];
  for (const p of table) if ((r -= p.rate) < 0) {
    prize = p;
    break;
  }
  const pool = table.map((p) => p.mark).filter((m): m is ScratchMark => !!m);
  let marks: ScratchMark[];
  if (prize.mark) {
    const others = pool.filter((m) => m !== prize.mark);
    marks = shuffle(rng, [prize.mark, prize.mark, others[Math.floor(rng() * others.length)]]);
  } else marks = shuffle(rng, [...pool]).slice(0, 3);
  return { kind, marks: marks as [ScratchMark, ScratchMark, ScratchMark], prize };
}
