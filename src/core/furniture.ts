/**
 * 家具とアイテムの一覧表。Phaserに依存しない。
 * 企画者決定(2026-10-21):
 * - 家具は STREET・POP・CYBER の3シリーズ × 6種類(ベッド・ソファ・テーブル・カーペット・照明・おもちゃ)
 * - シリーズと部屋は関係ない(どの部屋にも、どのシリーズの家具も置ける)。だから部屋の情報は持たせない
 * - 同じ家具を2つ以上買える。家具どうしは重ねて置けない。MONZの通り道はふさげない
 * - 照明は床に置くスタンド。照明ではMONZは何もしない
 * - 買った家具・引越し券は「アイテムボックス」に入る(タブは「家具」「その他」)
 * 家具を増やすときは、FURNITURE_KINDS / FURNITURE_SERIES に足すか、FURNITURE に1行足す。
 */

export const FURNITURE_SERIES = ['street', 'pop', 'cyber'] as const;
export type FurnitureSeries = (typeof FURNITURE_SERIES)[number];
export const SERIES_LABELS: Record<FurnitureSeries, string> = { street: 'STREET', pop: 'POP', cyber: 'CYBER' };

export const FURNITURE_KINDS = ['bed', 'sofa', 'table', 'carpet', 'light', 'toy'] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

interface KindRule {
  name: string;
  /** 【仮】値段(コイン)。企画者の仮の値段(2026-10-21) */
  price: number;
  /**
   * 【仮】床の上で占める広さ [横, 奥行き](部屋の絵の座標、手前での大きさ)。重なりの判定とMONZがよける範囲に使う。
   * 家具の絵が届いたら、絵に合わせて直す
   */
  foot: [number, number];
  /** MONZがその上を歩けるか(カーペットは歩ける。ほかの家具とは重ねられない) */
  walkable: boolean;
}

export const KIND_RULES: Record<FurnitureKind, KindRule> = {
  bed: { name: 'ベッド', price: 500, foot: [300, 150], walkable: false },
  sofa: { name: 'ソファ', price: 400, foot: [260, 110], walkable: false },
  table: { name: 'テーブル', price: 250, foot: [180, 100], walkable: false },
  carpet: { name: 'カーペット', price: 200, foot: [320, 160], walkable: true },
  light: { name: '照明', price: 300, foot: [70, 50], walkable: false },
  toy: { name: 'おもちゃ', price: 150, foot: [70, 50], walkable: false },
};

export interface FurnitureDef {
  id: string;
  series: FurnitureSeries;
  kind: FurnitureKind;
  /** 画面に出す名前(例: STREET ベッド) */
  name: string;
  price: number;
  /** 絵(public/ からの場所)。横向きの絵があるときは side も */
  file: string;
  side?: string;
}

export const furnitureId = (series: FurnitureSeries, kind: FurnitureKind) => `${series}_${kind}`;

export const FURNITURE: FurnitureDef[] = FURNITURE_SERIES.flatMap((series) =>
  FURNITURE_KINDS.map((kind) => ({
    id: furnitureId(series, kind),
    series,
    kind,
    name: `${SERIES_LABELS[series]} ${KIND_RULES[kind].name}`,
    price: KIND_RULES[kind].price,
    file: `assets/furniture/${series}_${kind}.webp`,
  })),
);

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
export const furniture = (id: string): FurnitureDef | undefined => BY_ID.get(id);
export const isFurniture = (id: string): boolean => BY_ID.has(id);

/** 家具以外のアイテム(アイテムボックスの「その他」) */
export interface OtherItemDef {
  id: string;
  name: string;
  price: number;
  /** ショップの説明。企画者決定: 引越し券は「好きな部屋へ1回引っ越せる」だけ(4つめの部屋のことは書かない) */
  text: string;
}

export const MOVE_TICKET = 'move_ticket';

export const OTHER_ITEMS: OtherItemDef[] = [
  // 【仮】値段 10,000コイン
  { id: MOVE_TICKET, name: '引越し券', price: 10000, text: '好きな部屋へ1回引っ越せる' },
];

/** 買えるもの(家具・その他)の値段。知らない番号なら undefined */
export function itemPrice(id: string): number | undefined {
  return furniture(id)?.price ?? OTHER_ITEMS.find((i) => i.id === id)?.price;
}
