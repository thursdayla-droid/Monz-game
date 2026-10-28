/**
 * MYTHCLASH のカードパックと、持っているカード(コレクション)。Phaserに依存しない。
 * - 1パック500コインで1枚(確定)。10パックは5,000コイン。確率は同じ・確定枠なし(確定)
 * - レアの確率: SEC 0.2%(確定)。N60%・R28%・SR9%・UR2.8%【仮】。同じレアの中は均等。天井なし。重複あり
 * - 重複したカードは枚数として記録する(売る・合成などは作らない)
 * - バトル解放: ちがうカードを3種類以上(確定)
 * 買う処理は LifeRecord.buyPacks(コインと持っているカードを1回の保存でいっしょに変える)。お世話画面のショップと MYTHCLASH の画面の両方から使う
 */
import { CARDS, RARITIES, SPECIAL_CARDS, type Rarity } from './cards';
import { TOWER_FLOORS } from './modes';
import type { Rng } from '../rng';

export const PACK_PRICE = 500;
/** 一度に買える数(1パック・10パック) */
export const PACK_COUNTS = [1, 10] as const;
export type PackCount = (typeof PACK_COUNTS)[number];

/** レアの出る確率。SEC だけ確定、ほかは【仮】 */
export const PACK_RATES: Record<Exclude<Rarity, 'LR'>, number> = { N: 0.6, R: 0.28, SR: 0.09, UR: 0.028, SEC: 0.002 };

/** バトルが遊べるようになる、ちがうカードの数 */
export const BATTLE_UNLOCK_KINDS = 3;

const BY_RARITY: Record<Exclude<Rarity, 'LR'>, number[]> = Object.fromEntries(RARITIES.map((r) => [r, CARDS.filter((c) => c.rarity === r).map((c) => c.id)])) as Record<Exclude<Rarity, 'LR'>, number[]>;

/** 1パック開ける(カードNoを返す) */
export function drawPackCard(rng: Rng): number {
  const roll = rng();
  let acc = 0;
  let rarity: Exclude<Rarity, 'LR'> = 'N';
  for (const r of RARITIES) {
    acc += PACK_RATES[r];
    if (roll < acc) {
      rarity = r;
      break;
    }
  }
  const pool = BY_RARITY[rarity];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

export function openPacks(count: number, rng: Rng): number[] {
  return Array.from({ length: count }, () => drawPackCard(rng));
}

export interface MythCollection {
  /** カードNo → 持っている枚数 */
  owned: Record<string, number>;
  /** 今までに開けたパックの数 */
  packs: number;
  /** 前に組んだデッキ(ちがうカード3枚。先頭から出る)。古いデータには無い */
  deck?: number[];
  /** ストーリーモード(タワー)で、クリアしたいちばん上の階(企画者 2026-10-27)。古いデータには無い(0階と同じ) */
  towerCleared?: number;
  /** BLOOD TOWER で倒したことのある相手(t<階>-<戦い>)。階の画面で その相手のカードを見せる(企画者 2026-10-28)。古いデータには無い */
  towerBeaten?: string[];
}

export const newCollection = (): MythCollection => ({ owned: {}, packs: 0 });

/** 保存されていたコレクションをそろえる(知らないカード・おかしな枚数は捨てる) */
export function fixCollection(raw: unknown): MythCollection {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<MythCollection>;
  const owned: Record<string, number> = {};
  const known = new Set([...CARDS, ...SPECIAL_CARDS].map((c) => String(c.id)));
  for (const [k, v] of Object.entries(d.owned && typeof d.owned === 'object' ? d.owned : {})) {
    const n = Math.floor(Number(v));
    if (known.has(k) && Number.isFinite(n) && n > 0) owned[k] = n;
  }
  const packs = Math.floor(Number(d.packs));
  const deck = Array.isArray(d.deck) ? d.deck.map(Number) : [];
  const deckOk = deck.length === 3 && new Set(deck).size === 3 && deck.every((id) => owned[id] > 0);
  const tower = Math.min(TOWER_FLOORS, Math.floor(Number(d.towerCleared)));
  const beaten = Array.isArray(d.towerBeaten) ? [...new Set(d.towerBeaten.filter((x): x is string => typeof x === 'string' && /^t([1-9]|10)-[1-3]$/.test(x)))] : [];
  return { owned, packs: Number.isFinite(packs) && packs > 0 ? packs : 0, ...(deckOk ? { deck } : {}), ...(tower > 0 ? { towerCleared: tower } : {}), ...(beaten.length ? { towerBeaten: beaten } : {}) };
}

export function addCards(col: MythCollection, ids: readonly number[]): MythCollection {
  const owned = { ...col.owned };
  for (const id of ids) owned[id] = (owned[id] ?? 0) + 1;
  return { ...col, owned, packs: col.packs + ids.length };
}

/** デッキを組めるか(ちがうカード3枚で、全部持っている) */
export const deckOwned = (col: MythCollection, deck: readonly number[]): boolean => deck.length === 3 && new Set(deck).size === 3 && deck.every((id) => ownedCount(col, id) > 0);

export const ownedCount = (col: MythCollection, id: number): number => col.owned[id] ?? 0;
/** 持っているカードの種類の数(所持種類数) */
export const ownedKinds = (col: MythCollection): number => Object.keys(col.owned).length;
export const battleUnlocked = (col: MythCollection): boolean => ownedKinds(col) >= BATTLE_UNLOCK_KINDS;
/** バトル解放まで、あと何種類 */
export const kindsToUnlock = (col: MythCollection): number => Math.max(0, BATTLE_UNLOCK_KINDS - ownedKinds(col));
