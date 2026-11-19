import { capReward, MINIGAME_REWARD_MULT } from './modes';
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

/** カードの番号 0〜51(マーク×13 + 数字-1)。52・53 は ジョーカー(2026-11-19 企画者「すぐ 終わって つまらない ので ジョーカー 2枚」) */
export type CardId = number;
export const JOKERS: readonly CardId[] = [52, 53];
export const isJoker = (c: CardId): boolean => c >= 52;
/** ジョーカーは マークなし(spade を 返すが 使わない) */
export const cardSuit = (c: CardId): Suit => SUITS[Math.min(3, Math.floor(c / 13))];
/** 1(A)〜13(K) */
export const cardRank = (c: CardId): number => (c % 13) + 1;
export const cardLabel = (c: CardId): string => (isJoker(c) ? 'JOKER' : `${SUIT_MARKS[cardSuit(c)]}${RANK_LABELS[c % 13]}`);
export const isRed = (c: CardId): boolean => !isJoker(c) && (cardSuit(c) === 'heart' || cardSuit(c) === 'diamond');

export const HAND_SIZE = 5;
/** 52枚 + ジョーカー 2枚 */
export const DECK_SIZE = 54;
/** 1手の制限時間(秒) */
export const TURN_SECONDS = 10;

/** 場札と同じ数字、または同じマークなら出せる */
/** top がない(まだ1枚も出していない)ときは、どのカードでも出せる */
/** ジョーカーは いつでも 出せる・ジョーカーの 上には 何でも 出せる(企画者「万能」) */
export const canPlayOn = (card: CardId, top: CardId | undefined): boolean =>
  top === undefined || isJoker(card) || isJoker(top) || cardRank(card) === cardRank(top) || cardSuit(card) === cardSuit(top);

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
// 2026-11-09 企画者「5倍に」→ コイン・EXP を 5倍(1回の プレイで 最大 1,000。modes.ts)
export const CARD_REWARD = {
  clearCoins: 500,
  clearExp: 50,
  cardsPerExp: 4,
  minCardsForReward: 10,
  cardsPerCoin: 5,
} as const;

/** 1回のプレイ全体の報酬。cards: 自分で出した枚数(全ラウンドの合計)、clears: クリアしたラウンドの数 */
export function cardReward(cards: number, clears: number): { coins: number; exp: number } {
  const R = CARD_REWARD;
  const enough = cards >= R.minCardsForReward;
  const coins = clears * R.clearCoins + (enough ? Math.floor(cards / R.cardsPerCoin) * MINIGAME_REWARD_MULT : 0);
  const exp = clears * R.clearExp + (enough ? Math.floor(cards / R.cardsPerExp) * MINIGAME_REWARD_MULT : 0);
  return capReward({ coins, exp });
}

// ---------------- 場の 役(2026-11-19 企画者「場の カードに 役が ついた 時 報酬」) ----------------
/**
 * 手札(出す 前に 表示されて いる 5枚)で ポーカーの 役を 見る(2026-11-19 企画者「出した カードじゃ なくて 出す 前に 表示されてる カード」)。
 * ジョーカーは どの カードの かわりにも なる。スリーカード・フォーカードは 3枚・4枚から(山札が 少ない 時)。
 * 同じ カードで 2回 もらわない: 前の 役の カードが まだ 手札に あって、役が 強く なって いない 時は もらえない。
 * 報酬は 企画者「これで いい」(MONZ コイン)。ロイヤルストレートフラッシュは 特別な アイテム(【未確定】あとで 決める)
 */
export type HandName = 'three' | 'straight' | 'flush' | 'fullhouse' | 'four' | 'straightflush' | 'royal';
export const HAND_INFO: Record<HandName, { label: string; coins: number; rank: number }> = {
  three: { label: 'スリーカード', coins: 50, rank: 1 },
  straight: { label: 'ストレート', coins: 100, rank: 2 },
  flush: { label: 'フラッシュ', coins: 150, rank: 3 },
  fullhouse: { label: 'フルハウス', coins: 300, rank: 4 },
  four: { label: 'フォーカード', coins: 500, rank: 5 },
  straightflush: { label: 'ストレートフラッシュ', coins: 1000, rank: 6 },
  // ロイヤルは コインなし・ダイヤモンドキャットだけ(2026-11-19 企画者「3000 コイン あげないで 猫の 置物だけ」)
  royal: { label: 'ロイヤルストレートフラッシュ', coins: 0, rank: 7 },
};
export const HAND_WINDOW = 5;

/** ジョーカー なしの 5枚以下で いちばん 強い 役(と 使った カード) */
function bestPlain(cards: CardId[]): { name: HandName; used: CardId[] } | null {
  const ranks = cards.map(cardRank);
  const byRank = new Map<number, CardId[]>();
  cards.forEach((c, i) => byRank.set(ranks[i], [...(byRank.get(ranks[i]) ?? []), c]));
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length);
  if (cards.length === 5) {
    const flush = cards.every((c) => cardSuit(c) === cardSuit(cards[0]));
    const set = [...new Set(ranks)].sort((a, b) => a - b);
    const straight = set.length === 5 && (set[4] - set[0] === 4 || set.join() === '1,10,11,12,13');
    const royal = straight && set.join() === '1,10,11,12,13';
    if (straight && flush) return { name: royal ? 'royal' : 'straightflush', used: cards };
    if (groups[0].length === 4) return { name: 'four', used: groups[0] };
    if (groups[0].length === 3 && groups[1]?.length === 2) return { name: 'fullhouse', used: cards };
    if (flush) return { name: 'flush', used: cards };
    if (straight) return { name: 'straight', used: cards };
  } else if (groups[0]?.length === 4) return { name: 'four', used: groups[0] };
  if (groups[0]?.length >= 3) return { name: 'three', used: groups[0].slice(0, 3) };
  return null;
}

/** ジョーカー 入りの カードで いちばん 強い 役(ジョーカーは 使った カードに ふくめる) */
export function bestHand(cards: CardId[]): { name: HandName; used: CardId[] } | null {
  const jokers = cards.filter(isJoker);
  const plain = cards.filter((c) => !isJoker(c));
  if (!jokers.length) return bestPlain(plain);
  let best: { name: HandName; used: CardId[] } | null = null;
  const tryWith = (subs: CardId[]) => {
    const found = bestPlain([...plain, ...subs]);
    // ロイヤルストレートフラッシュは ジョーカー なしの 時だけ(2026-11-19 企画者)。ジョーカーで できた 時は ストレートフラッシュ
    const h = found && found.name === 'royal' ? { ...found, name: 'straightflush' as HandName } : found;
    if (h && (!best || HAND_INFO[h.name].rank > HAND_INFO[best.name].rank)) best = { name: h.name, used: [...h.used.filter((c) => plain.includes(c)), ...jokers] };
  };
  for (let a = 0; a < 52; a++) {
    if (jokers.length === 1) tryWith([a]);
    else for (let b = a; b < 52; b++) tryWith([a, b]);
  }
  return best;
}

export interface HandAward {
  name: HandName;
  used: CardId[];
}

/** 手札が かわった 時: 新しい 役が できたら その 役(もらえない 時は null) */
export function checkHand(hand: (CardId | null)[], last: HandAward | null): HandAward | null {
  const cards = hand.filter((c): c is CardId => c !== null);
  const h = bestHand(cards);
  if (!h) return null;
  if (last && last.used.every((c) => cards.includes(c)) && HAND_INFO[h.name].rank <= HAND_INFO[last.name].rank) return null;
  return h;
}
