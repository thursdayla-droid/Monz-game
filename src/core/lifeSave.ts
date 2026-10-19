/**
 * お世話画面の保存(コイン・レベル・お腹などの様子)。最初の質問の保存(save.ts)とは別にして、今までのデータを壊さない。
 * Phaserに依存しない。保存できない環境でも止まらない。
 * 【仮】コインの最初の枚数(0)。コインはレベルが上がったとき・ミニゲームでもらえる(企画者決定)。
 */
import type { HomePlace } from './home';
import { catchUp, dayKey, expToNext, levelUpCoins, newNeeds, NEEDS_RULES, stepNeeds, isNight, type Needs } from './needs';
import type { KeyValueStore } from './save';

export const LIFE_KEY = 'monz:life';
export const LIFE_VERSION = 1;

export interface LifeData {
  version: number;
  coins: number;
  level: number;
  /** 今のレベルでたまった経験値 */
  exp: number;
  /** 今日もらった経験値(1日の上限のため) */
  expDay: string;
  expToday: number;
  /** お腹・眠さ・機嫌(画面には数字を出さない) */
  needs: Needs;
  /** 最後に様子を進めた時刻(ミリ秒)。閉じていた時間に合わせて変化させる */
  lastSeen: number;
  /** 第3段階: 買った家具など。いまは空 */
  items: string[];
  /** お世話画面の場所(いちばん最初に1回だけ決める) */
  place?: HomePlace;
}

export const newLife = (now = Date.now()): LifeData => ({
  version: LIFE_VERSION,
  coins: 0,
  level: 1,
  exp: 0,
  expDay: dayKey(new Date(now)),
  expToday: 0,
  needs: newNeeds(),
  lastSeen: now,
  items: [],
});

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
    return { ...newLife(), ...data, needs: { ...newNeeds(), ...data.needs }, coins: Math.max(0, Math.floor(Number(data.coins) || 0)) };
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

export type LifeEvent = { type: 'coins'; coins: number; delta: number } | { type: 'levelUp'; level: number; coins: number };

/**
 * お世話画面の記録をまとめて持つ(コイン・経験値・お腹などの様子)。変わるたびに保存して知らせる。
 * ショップやミニゲームからもコインの出し入れに使う。
 */
export class LifeRecord {
  private listeners: ((e: LifeEvent) => void)[] = [];

  constructor(
    private data: LifeData,
    private readonly store: KeyValueStore | null = defaultStore(),
  ) {}

  get snapshot(): Readonly<LifeData> {
    return this.data;
  }

  get coins(): number {
    return this.data.coins;
  }

  get needs(): Needs {
    return this.data.needs;
  }

  /** 次のレベルまでの進み具合(0〜1) */
  get expRate(): number {
    return Math.min(1, this.data.exp / expToNext(this.data.level));
  }

  on(fn: (e: LifeEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  private emit(e: LifeEvent): void {
    this.listeners.forEach((f) => f(e));
  }

  private update(patch: Partial<LifeData>): void {
    this.data = { ...this.data, ...patch };
    saveLife(this.data, this.store);
  }

  add(n: number): void {
    if (!n) return;
    this.update({ coins: this.data.coins + Math.floor(n) });
    this.emit({ type: 'coins', coins: this.data.coins, delta: Math.floor(n) });
  }

  /** 足りなければ使わずに false を返す */
  spend(n: number): boolean {
    if (n > this.data.coins) return false;
    this.add(-n);
    return true;
  }

  /** 閉じていた間の変化をまとめて進める(画面を開いたとき) */
  catchUp(now = Date.now()): void {
    this.update({ needs: catchUp(this.data.needs, this.data.lastSeen, now), lastSeen: now });
  }

  /** 【テスト用】時間を hours 時間進めたことにする */
  advance(hours: number, now = Date.now()): void {
    this.update({ needs: catchUp(this.data.needs, now - hours * 3600 * 1000, now), lastSeen: now });
  }

  /** 画面を開いている間、少しずつ進める。保存はたまに(save: true のとき)だけ */
  tick(seconds: number, now = Date.now(), save = false): void {
    this.data = { ...this.data, needs: stepNeeds(this.data.needs, seconds, isNight(new Date(now))), lastSeen: now };
    if (save) saveLife(this.data, this.store);
  }

  /** MONZが自分で寝たり起きたりしたとき */
  setAsleep(asleep: boolean): void {
    if (this.data.needs.asleep !== asleep) this.update({ needs: { ...this.data.needs, asleep } });
  }

  feed(now = Date.now()): void {
    const n = this.data.needs;
    this.update({ needs: { ...n, full: Math.min(1, n.full + NEEDS_RULES.feedFull), mood: Math.min(1, n.mood + NEEDS_RULES.feedMood) } });
    this.gainExp(NEEDS_RULES.feedExp, now);
  }

  pet(happy: boolean, now = Date.now()): void {
    const n = this.data.needs;
    this.update({ needs: { ...n, mood: Math.min(1, n.mood + (happy ? NEEDS_RULES.petMood : NEEDS_RULES.petMood / 3)) } });
    this.gainExp(NEEDS_RULES.petExp, now);
  }

  /** 経験値をためる(1日の上限まで)。たまったらレベルが上がってコインがもらえる */
  private gainExp(amount: number, now: number): void {
    const today = dayKey(new Date(now));
    const used = this.data.expDay === today ? this.data.expToday : 0;
    const got = Math.max(0, Math.min(amount, NEEDS_RULES.dailyExpCap - used));
    let { level, exp } = this.data;
    exp += got;
    const ups: number[] = [];
    while (exp >= expToNext(level)) {
      exp -= expToNext(level);
      level++;
      ups.push(level);
    }
    this.update({ level, exp, expDay: today, expToday: used + got });
    for (const lv of ups) {
      const coins = levelUpCoins(lv);
      this.emit({ type: 'levelUp', level: lv, coins });
      this.add(coins);
    }
  }
}
