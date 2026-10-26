/**
 * MYTHCLASH のカード(CardDefinition)。Phaserに依存しない。MONZの育成モンスターとは別のデータ。
 * 元は企画者のカード表(design/mythclash/*.csv → tools/mythclash_cards.py → cardData.ts)。値は書きかえない。
 * 企画者決定(2026-10-26): HPは表の値を正式に使う(変わる可能性あり)。No.056 血の女王はダーク童話(tools/mythclash_cards.py の PLANNER_FIXES)。
 * 魔法名・魔法属性・魔法補正値は【暫定】(表の列名どおり)。魔法の効果は magic.ts、特殊能力は abilities.ts。
 */
import { RAW_CARDS } from './cardData';

export const ELEMENTS = ['炎', '水', '雷', '自然', '光', '闇', '無'] as const;
export type Element = (typeof ELEMENTS)[number];
export const RARITIES = ['N', 'R', 'SR', 'UR', 'SEC'] as const;
export type Rarity = (typeof RARITIES)[number];

/** カード表の1行(列をそのまま) */
export interface RawCard {
  no: number;
  name: string;
  nameStatus: string;
  theme: string;
  rarity: string;
  element: string;
  hp: number;
  atk: number;
  def: number;
  mag: number;
  spd: number;
  normalElement: string;
  specialElement: string;
  magicElement: string;
  magicName: string;
  magicModifier: number;
  magicEffectCode: string;
  magicEffectOldText: string;
  abilityCode: string | null;
  note: string | null;
}

export interface CardDefinition {
  /** カードNo(1〜100)。これが一意のID */
  id: number;
  name: string;
  theme: string;
  rarity: Rarity;
  /** 本体属性(通常攻撃・必殺はこの属性。確定) */
  element: Element;
  maxHp: number;
  atk: number;
  def: number;
  mag: number;
  spd: number;
  /** 魔法(名前・属性・補正値は【暫定】) */
  magic: { name: string; element: Element; modifier: number; effectCode: string };
  /** 特殊能力のコード(28枚だけ) */
  abilityCode: string | null;
}

const asElement = (s: string): Element => {
  if (!(ELEMENTS as readonly string[]).includes(s)) throw new Error(`MYTHCLASH: 知らない属性「${s}」`);
  return s as Element;
};

export const CARDS: readonly CardDefinition[] = RAW_CARDS.map((r) => {
  if (!(RARITIES as readonly string[]).includes(r.rarity)) throw new Error(`MYTHCLASH: 知らないレアリティ「${r.rarity}」(No.${r.no})`);
  return {
    id: r.no,
    name: r.name,
    theme: r.theme,
    rarity: r.rarity as Rarity,
    element: asElement(r.element),
    maxHp: r.hp,
    atk: r.atk,
    def: r.def,
    mag: r.mag,
    spd: r.spd,
    magic: { name: r.magicName, element: asElement(r.magicElement), modifier: r.magicModifier, effectCode: r.magicEffectCode },
    abilityCode: r.abilityCode,
  };
});

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export const card = (id: number): CardDefinition | undefined => BY_ID.get(id);

/** カードNoの表示(No.001) */
export const cardNo = (id: number) => `No.${String(id).padStart(3, '0')}`;

/**
 * 総合値(強さの目安。並びかえに使う)【仮】: HP + (攻撃 + 防御 + 魔力 + 素早さ) × 10。
 * HP(100〜180)と ほかの数字(1〜10)の大きさをそろえるため、HP以外は10倍にする
 */
export const cardPower = (c: CardDefinition): number => c.maxHp + (c.atk + c.def + c.mag + c.spd) * 10;

export type CardSort = 'strong' | 'weak' | 'no';
export const CARD_SORT_LABELS: Record<CardSort, string> = { strong: '強い順', weak: '弱い順', no: 'No.順' };

/** カードNoの並びかえ(強い順・弱い順は、同じならNo.順) */
export function sortCardIds(ids: readonly number[], sort: CardSort): number[] {
  const p = (id: number) => cardPower(card(id)!);
  return [...ids].sort((a, b) => (sort === 'strong' ? p(b) - p(a) : sort === 'weak' ? p(a) - p(b) : 0) || a - b);
}

