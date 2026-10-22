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

/**
 * vip: VIPの家具。企画者決定(2026-10-22): VIPルームを開放すると(はじめてVIPルームに引っ越すと)ショップで買えるようになる。
 * それまではショップに出さない(VIPルームの存在を知らせないため)
 */
export const FURNITURE_SERIES = ['street', 'pop', 'cyber', 'vip'] as const;
export type FurnitureSeries = (typeof FURNITURE_SERIES)[number];
export const SERIES_LABELS: Record<FurnitureSeries, string> = { street: 'STREET', pop: 'POP', cyber: 'CYBER', vip: 'VIP' };
/** 【仮】VIPの家具の値段の倍率 */
const VIP_PRICE = 2;

export const FURNITURE_KINDS = ['bed', 'sofa', 'table', 'carpet', 'light', 'toy'] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

interface KindRule {
  name: string;
  /** 【仮】値段(コイン)。企画者の仮の値段(2026-10-21) */
  price: number;
  /**
   * 【仮】部屋に置いたときの大きさ: 手前(MONZがいちばん大きく見える所)での横幅(画面のpx)。奥に置くほど小さく見える
   */
  width: number;
  /** 【仮】床の上で占める奥行き(横幅に対する割合)。重なりの判定とMONZがよける範囲に使う */
  depth: number;
  /** MONZがその上を歩けるか(カーペットは歩ける。ほかの家具とは重ねられない) */
  walkable: boolean;
}

export const KIND_RULES: Record<FurnitureKind, KindRule> = {
  bed: { name: 'ベッド', price: 500, width: 460, depth: 0.3, walkable: false },
  sofa: { name: 'ソファ', price: 400, width: 380, depth: 0.32, walkable: false },
  table: { name: 'テーブル', price: 250, width: 230, depth: 0.4, walkable: false },
  carpet: { name: 'カーペット', price: 200, width: 420, depth: 0.42, walkable: true },
  light: { name: '照明', price: 300, width: 110, depth: 0.6, walkable: false },
  toy: { name: 'おもちゃ', price: 150, width: 80, depth: 0.8, walkable: false },
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
    price: KIND_RULES[kind].price * (series === 'vip' ? VIP_PRICE : 1),
    file: `assets/furniture/${series}_${kind}.webp`,
  })),
);

/**
 * 企画者の絵が届いている家具(design/furniture/ → make_furniture.py で切り抜き)。届いていない家具は【仮】の見た目。
 * 企画者決定(2026-10-21): 家具の絵は斜め横向き。反転で逆向きにも使う
 */
export const FURNITURE_ART_READY: readonly string[] = ['street_bed'];
export const furnitureKey = (id: string) => `furniture:${id}`;

/**
 * 縦向き(頭が奥・足が手前)の絵がある家具(design/furniture/<名前>_turn.png)。
 * 企画者の指示(2026-10-21): 左右の壁ぎわにも置きたい。ななめの絵はやめて、縦向きの絵をタイルの線に合わせてかたむけて使う
 */
export const FURNITURE_TURN_ART_READY: readonly string[] = ['street_bed'];
export const furnitureTurnKey = (id: string) => `furniture:${id}:turn`;
export const furnitureTurnFile = (id: string) => `assets/furniture/${id}_turn.webp`;

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
