/**
 * お世話画面の保存(コイン・レベルなど)。最初の質問の保存(save.ts)とは別にして、今までのデータを壊さない。
 * Phaserに依存しない。保存できない環境でも止まらない。
 * 【仮】コインの最初の枚数(0)、レベルの上がり方は未確定。
 */
import type { HomePlace } from './home';
import type { KeyValueStore } from './save';

export const LIFE_KEY = 'monz:life';
export const LIFE_VERSION = 1;

export interface LifeData {
  version: number;
  coins: number;
  /** 【仮】見た目だけ。上がり方は未確定 */
  level: number;
  exp: number;
  /** 最後にお世話画面を見た時刻(ミリ秒)。閉じていた時間に合わせた変化(第2段階)に使う */
  lastSeen: number;
  /** 第3段階: 買った家具など。いまは空 */
  items: string[];
  /** お世話画面の場所(いちばん最初に1回だけ決める) */
  place?: HomePlace;
}

export const newLife = (now = Date.now()): LifeData => ({ version: LIFE_VERSION, coins: 0, level: 1, exp: 0, lastSeen: now, items: [] });

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadLife(store = defaultStore()): LifeData {
  try {
    const raw = store?.getItem(LIFE_KEY);
    if (!raw) return newLife();
    const data = JSON.parse(raw) as Partial<LifeData>;
    if (data.version !== LIFE_VERSION) return newLife();
    // 足りない項目は初期値でうめる(あとで項目を増やしても読めるように)
    return { ...newLife(), ...data, coins: Math.max(0, Math.floor(Number(data.coins) || 0)) };
  } catch {
    return newLife();
  }
}

export function clearLife(store = defaultStore()): void {
  try {
    store?.removeItem(LIFE_KEY);
  } catch {
    /* 消せなくても続ける */
  }
}

export function saveLife(data: LifeData, store = defaultStore()): void {
  try {
    store?.setItem(LIFE_KEY, JSON.stringify(data));
  } catch {
    /* 保存できなくても続ける */
  }
}

/** コインの出し入れ。増減を知らせる(画面の表示を動かすため)。ショップやミニゲームからも使う */
export class Wallet {
  private listeners: ((coins: number, delta: number) => void)[] = [];

  constructor(
    private data: LifeData,
    private readonly store: KeyValueStore | null = defaultStore(),
  ) {}

  get coins(): number {
    return this.data.coins;
  }

  onChange(fn: (coins: number, delta: number) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  add(n: number): void {
    if (!n) return;
    this.data = { ...this.data, coins: this.data.coins + Math.floor(n) };
    saveLife(this.data, this.store);
    this.listeners.forEach((f) => f(this.data.coins, n));
  }

  /** 足りなければ使わずに false を返す */
  spend(n: number): boolean {
    if (n > this.data.coins) return false;
    this.add(-n);
    return true;
  }
}
