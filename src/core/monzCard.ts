import { mulberry32, type Rng } from './rng';

/**
 * ミニゲーム「MONZ CARD」のルール(企画者仕様 2026-10-20)。Phaserに依存しない。
 * - トランプ52枚(ジョーカーなし)。手札5枚・残り47枚が山札。最初は場札なし(企画者決定 2026-10-20: 1枚目は手札から好きなカード)
 * - 2枚目からは、場札と同じ数字か同じマークのカードを出せる。出したら山札から1枚補充(山札がなければ補充なし)
 * - 出せるカードがない、または時間切れでゲームオーバー
 * - 52枚すべてが場に出たら(山札も手札も0枚)ラウンドクリア → 新しい52枚で次のラウンド
 * カードの場所は1つの表(where)だけで持ち、手札・山札・CARD TRACKER はすべてここから作る(表示と中身がずれない)。
 * シャッフルは種(seed)から決まるので、同じ種と同じ手順なら同じ結果になる(将来のランキングの確認用)。
 */
export const SUITS = ['spade', 'heart', 'diamond', 'club'] as const;
export type Suit = (typeof SUITS)[number];
export const SUIT_MARKS: Record<Suit, string> = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' };
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/** カードの番号 0〜51(マーク×13 + 数字-1) */
export type CardId = number;
export const cardSuit = (c: CardId): Suit => SUITS[Math.floor(c / 13)];
/** 1(A)〜13(K) */
export const cardRank = (c: CardId): number => (c % 13) + 1;
export const cardLabel = (c: CardId): string => `${SUIT_MARKS[cardSuit(c)]}${RANK_LABELS[c % 13]}`;
export const isRed = (c: CardId): boolean => cardSuit(c) === 'heart' || cardSuit(c) === 'diamond';

export const HAND_SIZE = 5;
export const DECK_SIZE = 52;
/** 1手の制限時間(秒) */
export const TURN_SECONDS = 10;

/** 場札と同じ数字、または同じマークなら出せる */
/** top がない(まだ1枚も出していない)ときは、どのカードでも出せる */
export const canPlayOn = (card: CardId, top: CardId | undefined): boolean => top === undefined || cardRank(card) === cardRank(top) || cardSuit(card) === cardSuit(top);

export type CardPlace = 'deck' | 'hand' | 'used';

export interface Round {
  /** ラウンドの番号(1から) */
  round: number;
  seed: number;
  /** 山札(先頭から引く) */
  deck: CardId[];
  /** 手札(最大5枚。場所を保つため、出したところは補充したカードが入る) */
  hand: (CardId | null)[];
  /** 場に出た順(最後が今の場札) */
  played: CardId[];
}

/** 種からシャッフル(フィッシャー–イェーツ) */
export function shuffled(seed: number): CardId[] {
  const rng: Rng = mulberry32(seed);
  const a = Array.from({ length: DECK_SIZE }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 新しいラウンド: 52枚をシャッフル → 手札5枚 → 残り47枚が山札。場札はまだない(1枚目は手札から好きに出せる) */
export function newRound(round: number, seed: number): Round {
  const cards = shuffled(seed);
  const hand = cards.splice(0, HAND_SIZE);
  return { round, seed, deck: cards, hand, played: [] };
}

/** 今の場札(まだ1枚も出していなければ undefined) */
export const topCard = (r: Round): CardId | undefined => r.played[r.played.length - 1];

/** そのカードが今どこにあるか(CARD TRACKER の元) */
export function placeOf(r: Round, c: CardId): CardPlace {
  if (r.played.includes(c)) return 'used';
  if (r.hand.includes(c)) return 'hand';
  return 'deck';
}

/** まだ場に出ていないカード(手札+山札)の数 */
export const remainingCount = (r: Round): number => DECK_SIZE - r.played.length;

/** 手札のうち、出せるカードの場所(番号) */
export const playableSlots = (r: Round): number[] =>
  r.hand.flatMap((c, i) => (c !== null && canPlayOn(c, topCard(r)) ? [i] : []));

export const isCleared = (r: Round): boolean => r.deck.length === 0 && r.hand.every((c) => c === null);
export const isStuck = (r: Round): boolean => !isCleared(r) && playableSlots(r).length === 0;

/** 手札の slot のカードを出す。出せなければ null。出したら山札から補充した新しい状態を返す */
export function play(r: Round, slot: number): Round | null {
  const c = r.hand[slot];
  if (c === null || c === undefined || !canPlayOn(c, topCard(r))) return null;
  const deck = r.deck.slice();
  const hand = r.hand.slice();
  hand[slot] = deck.length ? deck.shift()! : null;
  return { ...r, deck, hand, played: [...r.played, c] };
}

/**
 * 報酬(【仮】数字は企画者の方針から 2026-10-20):
 * - ラウンドクリアごとに100コイン(何ラウンド目でも固定)・EXP+10
 * - 出したカード4枚ごとにEXP+1
 * - ゲームオーバーのとき、10枚以上出していたら、出した枚数÷5コイン(切り捨て)。9枚以下はコインもEXPもなし
 */
export const CARD_REWARD = {
  clearCoins: 100,
  clearExp: 10,
  cardsPerExp: 4,
  minCardsForReward: 10,
  cardsPerCoin: 5,
} as const;

/** 1回のプレイ全体の報酬。cards: 自分で出した枚数(全ラウンドの合計)、clears: クリアしたラウンドの数 */
export function cardReward(cards: number, clears: number): { coins: number; exp: number } {
  const R = CARD_REWARD;
  const enough = cards >= R.minCardsForReward;
  const coins = clears * R.clearCoins + (enough ? Math.floor(cards / R.cardsPerCoin) : 0);
  const exp = clears * R.clearExp + (enough ? Math.floor(cards / R.cardsPerExp) : 0);
  return { coins, exp };
}
