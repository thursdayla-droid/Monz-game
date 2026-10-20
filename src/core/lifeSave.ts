/**
 * プレイヤーのデータの保存(コイン・持ち物・場所と、育てているMONZごとのレベル・経験値・ステータス・お腹などの様子)。
 * 最初の質問の保存(save.ts)とは別にして、今までのデータを壊さない。Phaserに依存しない。保存できない環境でも止まらない。
 * - 版(version)を持ち、古い形のデータは新しい形に引き継ぐ(1 → 2)
 * - 保存するたびに、1つ前の正しいデータを予備(backup)に残す。読めなかったら予備から戻す
 * 【仮】コインの最初の枚数(0)。コインはレベルが上がったとき・ミニゲームでもらえる(企画者決定)。
 */
import { HOME_PLACES, type HomePlace } from './home';
import { catchUp, dayKey, expToNext, levelUpCoins, newNeeds, NEEDS_RULES, stepNeeds, isNight, type Needs } from './needs';
import type { KeyValueStore } from './save';
import { isSpecies, type SpeciesId } from './species';

export const LIFE_KEY = 'monz:life';
export const LIFE_BACKUP_KEY = 'monz:life:backup';
export const LIFE_VERSION = 2;
/** 企画者決定(2026-10-20): レベルが1上がるごとに 0.1 ステータスポイント */
export const STAT_POINTS_PER_LEVEL = 0.1;
/** 同じ報酬を2回渡さないために覚えておく、最近の報酬の番号の数 */
const CLAIMED_KEEP = 200;

/** 育てているMONZ1匹ぶん */
export interface MonzData {
  /** この1匹の番号(同じ種類を2匹持っても区別できる) */
  uid: string;
  species: SpeciesId;
  level: number;
  /** 今のレベルでたまった経験値 */
  exp: number;
  /** 今日お世話でもらった経験値(お世話の1日の上限のため)。expPetToday はそのうち、なでるでもらったぶん */
  expDay: string;
  expToday: number;
  expPetToday: number;
  /** まだ振り分けていないステータスポイント */
  statPoints: number;
  /** 振り分けたポイント(能力の名前 → ポイント)。【未確定】能力の種類は決まったら */
  stats: Record<string, number>;
  /** お腹・眠さ・機嫌(画面には数字を出さない) */
  needs: Needs;
  bornAt: number;
}

/** 持ち物(第3段階: 家具・コスチューム)。アイテムの番号だけを保存する */
export interface Inventory {
  owned: string[];
  placed: { item: string; x: number; y: number }[];
}

export interface LifeData {
  version: number;
  coins: number;
  /** 今お世話画面にいるMONZ */
  activeMonz: string;
  monz: MonzData[];
  inventory: Inventory;
  /** お世話画面の場所(いちばん最初に1回だけ決める) */
  place?: HomePlace;
  /** 最後に様子を進めた時刻(ミリ秒)。閉じていた時間に合わせて変化させる */
  lastSeen: number;
  /** 最近もらった報酬の番号(同じ報酬を2回もらわないため) */
  claimed: string[];
}

export const newMonz = (species: SpeciesId, uid: string, now = Date.now()): MonzData => ({
  uid,
  species,
  level: 1,
  exp: 0,
  expDay: dayKey(new Date(now)),
  expToday: 0,
  expPetToday: 0,
  statPoints: 0,
  stats: {},
  needs: newNeeds(),
  bornAt: now,
});

export const newLife = (now = Date.now(), species: SpeciesId = 'bunk'): LifeData => ({
  version: LIFE_VERSION,
  coins: 0,
  activeMonz: 'm1',
  monz: [newMonz(species, 'm1', now)],
  inventory: { owned: [], placed: [] },
  lastSeen: now,
  claimed: [],
});

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const num = (v: unknown, fallback: number, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : fallback);

/** 保存されていたデータを、今の形にそろえる(古い版の引き継ぎ・足りない項目の補い・おかしな値の直し)。直せなければ null */
export function migrateLife(raw: unknown, now = Date.now()): LifeData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const base = newLife(now);
  if (d.version === 1) {
    // 版1: MONZ1匹ぶんのレベル・経験値・様子が、データのいちばん上にあった
    const m = { ...base.monz[0], level: num(d.level, 1, 1), exp: num(d.exp, 0), expDay: String(d.expDay ?? base.monz[0].expDay), expToday: num(d.expToday, 0), needs: { ...newNeeds(), ...(d.needs as object) } };
    const items = Array.isArray(d.items) ? (d.items as unknown[]).map(String) : [];
    return migrateLife({ ...base, coins: d.coins, monz: [m], inventory: { owned: items, placed: [] }, place: d.place, lastSeen: d.lastSeen, version: 2 }, now);
  }
  if (d.version !== 2) return null;
  const monz = (Array.isArray(d.monz) ? (d.monz as Partial<MonzData>[]) : [])
    .filter((m) => m && typeof m.uid === 'string' && isSpecies(String(m.species)))
    .map((m) => ({ ...newMonz(m.species as SpeciesId, m.uid as string, now), ...m, level: num(m.level, 1, 1), exp: num(m.exp, 0), statPoints: num(m.statPoints, 0), needs: { ...newNeeds(), ...m.needs } }));
  if (!monz.length) return null;
  const inv = (d.inventory ?? {}) as Partial<Inventory>;
  return {
    version: LIFE_VERSION,
    coins: Math.floor(num(d.coins, 0)),
    activeMonz: monz.some((m) => m.uid === d.activeMonz) ? String(d.activeMonz) : monz[0].uid,
    monz,
    inventory: { owned: Array.isArray(inv.owned) ? inv.owned.map(String) : [], placed: Array.isArray(inv.placed) ? inv.placed : [] },
    place: (HOME_PLACES as readonly string[]).includes(String(d.place)) ? (d.place as HomePlace) : undefined,
    lastSeen: num(d.lastSeen, now),
    claimed: Array.isArray(d.claimed) ? (d.claimed as unknown[]).map(String).slice(-CLAIMED_KEEP) : [],
  };
}

const readKey = (store: KeyValueStore | null, key: string): LifeData | null => {
  try {
    const raw = store?.getItem(key);
    return raw ? migrateLife(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

/** 読み込む。保存が壊れていたら予備から戻す。どちらもなければ新しく始める */
export function loadLife(store = defaultStore()): LifeData {
  return readKey(store, LIFE_KEY) ?? readKey(store, LIFE_BACKUP_KEY) ?? newLife();
}

export function clearLife(store = defaultStore()): void {
  try {
    store?.removeItem(LIFE_KEY);
    store?.removeItem(LIFE_BACKUP_KEY);
  } catch {
    /* 消せなくても続ける */
  }
}

export function saveLife(data: LifeData, store = defaultStore()): void {
  try {
    // 今保存されている正しいデータを予備に残してから、新しいデータを保存する
    const current = store?.getItem(LIFE_KEY);
    if (current && readKey(store, LIFE_KEY)) store?.setItem(LIFE_BACKUP_KEY, current);
    store?.setItem(LIFE_KEY, JSON.stringify(data));
  } catch {
    /* 保存できなくても続ける */
  }
}

export type LifeEvent = { type: 'coins'; coins: number; delta: number } | { type: 'levelUp'; level: number; coins: number };

/** ミニゲームなどからの報酬。runId は1回のプレイごとの番号(同じ番号の報酬は2回もらえない) */
export interface Reward {
  runId: string;
  /** どこからの報酬か(ミニゲームの id など) */
  source: string;
  coins: number;
  exp: number;
}

/**
 * プレイヤーのデータをまとめて持つ(コイン・持ち物と、今のMONZのレベル・経験値・お腹などの様子)。
 * 変わるたびに保存して知らせる。お世話画面・ショップ・ミニゲームから同じ窓口で使う。
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

  /** 今お世話しているMONZ */
  get monz(): Readonly<MonzData> {
    return this.data.monz.find((m) => m.uid === this.data.activeMonz) ?? this.data.monz[0];
  }

  get coins(): number {
    return this.data.coins;
  }

  get level(): number {
    return this.monz.level;
  }

  get needs(): Needs {
    return this.monz.needs;
  }

  /** 今日はもう、なでても経験値が増えない(お世話マックス)か */
  petMaxed(now = Date.now()): boolean {
    const m = this.monz;
    if (m.expDay !== dayKey(new Date(now))) return false;
    return (m.expPetToday ?? 0) >= NEEDS_RULES.petDailyCap || m.expToday >= NEEDS_RULES.dailyExpCap;
  }

  /** 次のレベルまでの進み具合(0〜1) */
  get expRate(): number {
    return Math.min(1, this.monz.exp / expToNext(this.monz.level));
  }

  on(fn: (e: LifeEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  private emit(e: LifeEvent): void {
    this.listeners.forEach((f) => f(e));
  }

  /** データを変えて保存する(save=false なら保存はあとで) */
  private update(patch: Partial<LifeData>, monzPatch?: Partial<MonzData>, save = true): void {
    const uid = this.monz.uid;
    this.data = { ...this.data, ...patch, monz: monzPatch ? this.data.monz.map((m) => (m.uid === uid ? { ...m, ...monzPatch } : m)) : (patch.monz ?? this.data.monz) };
    if (save) saveLife(this.data, this.store);
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

  /**
   * ミニゲームなどの報酬を受け取る。同じ runId の報酬は2回もらえない(false を返す)。
   * 企画者決定(2026-10-20): ミニゲームのコイン・経験値に1日の上限はない(お世話の上限とは別)。
   */
  grant(reward: Reward, now = Date.now()): boolean {
    if (this.data.claimed.includes(reward.runId)) return false;
    this.update({ claimed: [...this.data.claimed, reward.runId].slice(-CLAIMED_KEEP) });
    if (reward.coins) this.add(reward.coins);
    if (reward.exp) this.gainExp(reward.exp, now, 'other');
    return true;
  }

  /** 閉じていた間の変化をまとめて進める(画面を開いたとき) */
  catchUp(now = Date.now()): void {
    this.update({ lastSeen: now }, { needs: catchUp(this.needs, this.data.lastSeen, now) });
  }

  /** 【テスト用】時間を hours 時間進めたことにする */
  advance(hours: number, now = Date.now()): void {
    this.update({ lastSeen: now }, { needs: catchUp(this.needs, now - hours * 3600 * 1000, now) });
  }

  /** 画面を開いている間、少しずつ進める。保存はたまに(save: true のとき)だけ */
  tick(seconds: number, now = Date.now(), save = false): void {
    this.update({ lastSeen: now }, { needs: stepNeeds(this.needs, seconds, isNight(new Date(now))) }, save);
  }

  /** 眠らせる・起こす */
  setAsleep(asleep: boolean): void {
    if (this.needs.asleep !== asleep) this.update({}, { needs: { ...this.needs, asleep } });
  }

  feed(now = Date.now()): void {
    const n = this.needs;
    this.update({}, { needs: { ...n, full: Math.min(1, n.full + NEEDS_RULES.feedFull), mood: Math.min(1, n.mood + NEEDS_RULES.feedMood) } });
    this.gainExp(NEEDS_RULES.feedExp, now, 'feed');
  }

  pet(happy: boolean, now = Date.now()): void {
    const n = this.needs;
    this.update({}, { needs: { ...n, mood: Math.min(1, n.mood + (happy ? NEEDS_RULES.petMood : NEEDS_RULES.petMood / 3)) } });
    this.gainExp(NEEDS_RULES.petExp, now, 'pet');
  }

  /**
   * 経験値をためる。たまったらレベルが上がって、コインとステータスポイントがもらえる。
   * kind: お世話(feed・pet)は1日の上限あり(なでるぶんは、さらに少ない上限)。ミニゲームなど(other)は上限なし。
   */
  private gainExp(amount: number, now: number, kind: 'feed' | 'pet' | 'other'): void {
    const m = this.monz;
    const today = dayKey(new Date(now));
    const used = m.expDay === today ? m.expToday : 0;
    const usedPet = m.expDay === today ? (m.expPetToday ?? 0) : 0;
    const care = kind !== 'other';
    let room = care ? NEEDS_RULES.dailyExpCap - used : Infinity;
    if (kind === 'pet') room = Math.min(room, NEEDS_RULES.petDailyCap - usedPet);
    const got = Math.max(0, Math.min(amount, room));
    let { level, exp, statPoints } = m;
    exp += got;
    const ups: number[] = [];
    while (exp >= expToNext(level)) {
      exp -= expToNext(level);
      level++;
      statPoints = Math.round((statPoints + STAT_POINTS_PER_LEVEL) * 10) / 10;
      ups.push(level);
    }
    this.update({}, { level, exp, statPoints, expDay: today, expToday: care ? used + got : used, expPetToday: kind === 'pet' ? usedPet + got : usedPet });
    for (const lv of ups) {
      const coins = levelUpCoins(lv);
      this.emit({ type: 'levelUp', level: lv, coins });
      this.add(coins);
    }
  }
}
