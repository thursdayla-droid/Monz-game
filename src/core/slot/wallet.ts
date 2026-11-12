/**
 * ROYAL JACKPOT 専用の コイン(2026-11-12 企画者「このスロットは やっぱり 独自の コインを 使う」)。
 * - スロットは この コインで 遊ぶ(BET・当たり・宝箱・フリーゲーム)。
 * - コイン交換: MONZ コイン → スロットの コインは 買える。スロットの コイン → MONZ コインには できない【確定】。
 * - ショップ: スロットの コインで だけ 交換できる アイテム(5個くらい。中身は 企画者が 作る【未確定】)。
 * - 保存は お世話の データとは 別(localStorage 'monz:slotcoin')。
 * 名前・交換の 割合・アイテムの 値段は【仮】
 */

/** コインの 名前(2026-11-12 企画者「コインの 名前は OK」で 決定) */
export const SLOT_COIN_NAME = 'ロイヤルコイン';
/** MONZ コイン 1枚で 何枚 買えるか【仮】 */
export const EXCHANGE_RATE = 1;
/** コイン交換で えらべる MONZ コインの 枚数【仮】 */
export const EXCHANGE_PACKS: readonly number[] = [100, 1000, 10000];

/** ショップの アイテム(企画者が 作る。届くまで 5つの 空き枠) */
export interface SlotShopItem {
  id: string;
  name: string;
  /** スロットの コインの 値段 */
  price: number;
  /** 交換できるか(中身が 決まるまで false) */
  ready: boolean;
}
export const SLOT_SHOP_ITEMS: readonly SlotShopItem[] = [1, 2, 3, 4, 5].map((i) => ({ id: `item${i}`, name: '？？？', price: 0, ready: false }));

export const SLOT_WALLET_KEY = 'monz:slotcoin';

interface WalletData {
  coins: number;
  /** ショップで 交換した アイテムの 数 */
  items: Record<string, number>;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | undefined => {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

function read(store: Store | undefined): WalletData {
  try {
    const d = JSON.parse(store?.getItem(SLOT_WALLET_KEY) ?? '{}') as Partial<WalletData>;
    const coins = Math.max(0, Math.floor(Number(d.coins) || 0));
    const items: Record<string, number> = {};
    if (d.items && typeof d.items === 'object') for (const [k, v] of Object.entries(d.items)) if (Number(v) > 0) items[k] = Math.floor(Number(v));
    return { coins, items };
  } catch {
    return { coins: 0, items: {} };
  }
}

/** スロットの コインの さいふ(SlotScene の コイン) */
export class SlotWallet {
  private data: WalletData;

  constructor(private readonly store: Store | undefined = defaultStore()) {
    this.data = read(store);
  }

  get coins(): number {
    return this.data.coins;
  }

  itemCount(id: string): number {
    return this.data.items[id] ?? 0;
  }

  private save(): void {
    try {
      this.store?.setItem(SLOT_WALLET_KEY, JSON.stringify(this.data));
    } catch {
      /* 保存 できなくても 遊べる */
    }
  }

  add(n: number): void {
    const v = Math.floor(n);
    if (!v) return;
    this.data = { ...this.data, coins: Math.max(0, this.data.coins + v) };
    this.save();
  }

  /** 1回転: BET を はらって 当たりを もらうのを 1回の 保存で(足りなければ false) */
  slotSpin(bet: number, win: number): boolean {
    const b = Math.floor(bet);
    if (!(b > 0) || b > this.data.coins) return false;
    this.data = { ...this.data, coins: this.data.coins - b + Math.max(0, Math.floor(win)) };
    this.save();
    return true;
  }

  /** ショップで 交換(足りない・まだ 交換できない 時は false) */
  buy(item: SlotShopItem): boolean {
    if (!item.ready || !(item.price > 0) || item.price > this.data.coins) return false;
    this.data = { coins: this.data.coins - item.price, items: { ...this.data.items, [item.id]: this.itemCount(item.id) + 1 } };
    this.save();
    return true;
  }
}

/**
 * MONZ コインを はらう 側(LifeRecord)。
 * 2026-11-12 企画者「コインは 売る 予定」→ ロイヤルコインに できるのは ゲームで 増やした MONZ コインだけ(お金で 買った ぶんは 使えない)
 */
export interface MonzPurse {
  readonly earnedCoins: number;
  spendEarned(n: number): boolean;
}

/**
 * コイン交換: MONZ コイン monz 枚 → スロットの コイン monz × EXCHANGE_RATE 枚。
 * ゲームで 増やした MONZ コインが 足りなければ 何も しないで false(お金で 買った ぶんは 使わない)。逆(スロット → MONZ)は ない
 */
export function exchangeCoins(purse: MonzPurse, wallet: SlotWallet, monz: number): boolean {
  const m = Math.floor(monz);
  if (!(m > 0) || !purse.spendEarned(m)) return false;
  wallet.add(m * EXCHANGE_RATE);
  return true;
}
