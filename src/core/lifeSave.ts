/**
 * プレイヤーのデータの保存(コイン・持ち物・場所と、育てているMONZごとのレベル・経験値・ステータス・お腹などの様子)。
 * 最初の質問の保存(save.ts)とは別にして、今までのデータを壊さない。Phaserに依存しない。保存できない環境でも止まらない。
 * - 版(version)を持ち、古い形のデータは新しい形に引き継ぐ(1 → 2 → 3 → 4)。引き継ぎは版が上がるので、2回かかることはない
 * - 保存するたびに、1つ前の正しいデータを予備(backup)に残す。読めなかったら予備から戻す
 * 【仮】コインの最初の枚数(0)。コインはレベルが上がったとき・ミニゲームでもらえる(企画者決定)。
 */
import { ALL_PLACES, SECRET_PLACE, type HomePlace } from './home';
import { furniture, isFurniture, itemPrice, MOVE_TICKET } from './furniture';
import { catchUp, dayKey, expToNext, levelUpCoins, newNeeds, NEEDS_RULES, stepNeeds, isNight, type Needs } from './needs';
import type { KeyValueStore } from './save';
import { isSpecies, type SpeciesId } from './species';
import { addStats, autoGrowthAt, currentStats, FREE_POINTS_PER_LEVEL, levelUpRng, LOVE_RULES, rollAutoGrowth, STAT_KEYS, STAT_MAX, zeroStats, type StatBlock, type StatKey } from './stats';

export const LIFE_KEY = 'monz:life';
export const LIFE_BACKUP_KEY = 'monz:life:backup';
export const LIFE_VERSION = 4;
/** 同じ報酬を2回渡さないために覚えておく、最近の報酬の番号の数 */
const CLAIMED_KEEP = 200;

/** 育てているMONZ1匹ぶん */
export interface MonzData {
  /** この1匹の番号(同じ種類を2匹持っても区別できる) */
  uid: string;
  species: SpeciesId;
  /** プレイヤーがつけた名前(生まれたときにつける)。なければ種類の名前 */
  name?: string;
  level: number;
  /** 今のレベルでたまった経験値 */
  exp: number;
  /** 今日お世話でもらった経験値(お世話の1日の上限のため)。expPetToday はそのうち、なでるでもらったぶん */
  expDay: string;
  expToday: number;
  expPetToday: number;
  /** まだ振り分けていない自由ポイント */
  statPoints: number;
  /** レベルアップの自動成長の合計 / 自由に振り分けた合計(src/core/stats.ts) */
  auto: StatBlock;
  alloc: StatBlock;
  /** 愛(お世話で育つ)。loveDay の日に、ごはん・なでるで増やした量 */
  love: number;
  loveDay: string;
  loveFeedToday: number;
  lovePetToday: number;
  /** これまでのお世話の回数(将来の性格の変化に使う) */
  careCount: { feed: number; pet: number };
  /** お腹・眠さ・機嫌(画面には数字を出さない) */
  needs: Needs;
  bornAt: number;
}

/**
 * 持ち物(アイテムボックス)。アイテムの番号だけを保存する(src/core/furniture.ts)。
 * owned: 持っている物を1個ずつ(同じ家具を2つ買えば2つ並ぶ。引越し券も同じ)。
 * placed: 部屋に置いてある家具(owned のうちのいくつか)。置いていない家具はアイテムボックスの中。
 */
export interface Inventory {
  owned: string[];
  placed: PlacedItem[];
}

/** 部屋に置いた家具1つ。x, y は足元(床に接する所)の位置で、部屋の絵の座標。flip: 左右反転。turn: 奥向き(左右の壁ぞいに置く向き) */
export interface PlacedItem {
  uid: string;
  item: string;
  x: number;
  y: number;
  flip: boolean;
  turn?: boolean;
}

export interface LifeData {
  version: number;
  coins: number;
  /** 今お世話画面にいるMONZ */
  activeMonz: string;
  monz: MonzData[];
  inventory: Inventory;
  /** お世話部屋(生まれた後に選ぶ。引越し券で変えられる) */
  place?: HomePlace;
  /** 4つめの部屋を見つけたか(引越し券を買うと見つかる。一度見つけたら、次の引越しでも出る) */
  secretRoom?: boolean;
  /** VIPルームを開放したか(はじめてVIPルームに引っ越したとき)。開放するとショップでVIPの家具が買える(企画者決定 2026-10-22) */
  vipOpen?: boolean;
  /** 最後に様子を進めた時刻(ミリ秒)。閉じていた時間に合わせて変化させる */
  lastSeen: number;
  /** 最近もらった報酬の番号(同じ報酬を2回もらわないため) */
  claimed: string[];
  /** ミニゲームごとの自分の最高記録(将来のランキング用にも) */
  records: Record<string, MinigameRecord>;
}

export interface MinigameRecord {
  /** いちばん多く出した枚数・走った距離など(ゲームごとのスコア) */
  bestScore: number;
  /** いちばん進んだラウンドなど */
  bestRound: number;
  plays: number;
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
  auto: zeroStats(),
  alloc: zeroStats(),
  love: LOVE_RULES.initial,
  loveDay: dayKey(new Date(now)),
  loveFeedToday: 0,
  lovePetToday: 0,
  careCount: { feed: 0, pet: 0 },
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
  records: {},
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
    const level = num(d.level, 1, 1);
    const m = { ...base.monz[0], level, exp: num(d.exp, 0), expDay: String(d.expDay ?? base.monz[0].expDay), expToday: num(d.expToday, 0), needs: { ...newNeeds(), ...(d.needs as object) } };
    const items = Array.isArray(d.items) ? (d.items as unknown[]).map(String) : [];
    return migrateLife({ ...base, coins: d.coins, monz: [m], inventory: { owned: items, placed: [] }, place: d.place, lastSeen: d.lastSeen, version: 2 }, now);
  }
  if (d.version === 2 || d.version === 3) {
    // 版2・版3 → 版4: ステータスを整数にした(企画者決定 2026-10-20)。
    // Lv.N なら、自動成長はランダム3×(N−1)(MONZの番号とレベルから決まるので、何度やっても同じ)、
    // 自由ポイントは (N−1) を未使用として入れ直す(版3で0.1ずつ振り分けていたぶんも、いったんポイントに戻す)。
    // 足すのではなく「レベルから決まる値」をそのまま入れ、版も上がるので、2回かかることはない。愛・名前などはそのまま。
    const monz4 = (Array.isArray(d.monz) ? (d.monz as Record<string, unknown>[]) : []).map((m) => {
      const level = Math.floor(num(m?.level, 1, 1));
      const species = String(m?.species);
      if (!isSpecies(species) || typeof m?.uid !== 'string') return m;
      const { stats: _old, ...rest } = m;
      return { ...rest, auto: autoGrowthAt(species, m.uid, level), alloc: zeroStats(), statPoints: (level - 1) * FREE_POINTS_PER_LEVEL };
    });
    return migrateLife({ ...d, monz: monz4, version: 4 }, now);
  }
  if (d.version !== 4) return null;
  const block = (v: unknown): StatBlock => Object.fromEntries(STAT_KEYS.map((k) => [k, Math.round(num((v as StatBlock | undefined)?.[k], 0))])) as StatBlock;
  const monz = (Array.isArray(d.monz) ? (d.monz as Partial<MonzData>[]) : [])
    .filter((m) => m && typeof m.uid === 'string' && isSpecies(String(m.species)))
    .map((m) => {
      const fresh = newMonz(m.species as SpeciesId, m.uid as string, now);
      return {
        ...fresh,
        ...m,
        level: Math.floor(num(m.level, 1, 1)),
        exp: num(m.exp, 0),
        statPoints: Math.round(num(m.statPoints, 0)),
        auto: block(m.auto),
        alloc: block(m.alloc),
        love: Math.min(LOVE_RULES.max, num(m.love, LOVE_RULES.initial)),
        careCount: { ...fresh.careCount, ...m.careCount },
        needs: { ...newNeeds(), ...m.needs },
      };
    });
  if (!monz.length) return null;
  const inv = (d.inventory ?? {}) as Partial<Inventory>;
  return {
    version: LIFE_VERSION,
    coins: Math.floor(num(d.coins, 0)),
    activeMonz: monz.some((m) => m.uid === d.activeMonz) ? String(d.activeMonz) : monz[0].uid,
    monz,
    inventory: fixInventory(inv),
    place: (ALL_PLACES as readonly string[]).includes(String(d.place)) ? (d.place as HomePlace) : undefined,
    ...(d.vipOpen === true ? { vipOpen: true } : {}),
    ...(d.secretRoom === true ? { secretRoom: true } : {}),
    lastSeen: num(d.lastSeen, now),
    claimed: Array.isArray(d.claimed) ? (d.claimed as unknown[]).map(String).slice(-CLAIMED_KEEP) : [],
    records: d.records && typeof d.records === 'object' ? (d.records as Record<string, MinigameRecord>) : {},
  };
}

/** 持ち物をそろえる。置いてある家具は、持っている数より多くならないようにする(おかしなデータは捨てる) */
function fixInventory(inv: Partial<Inventory>): Inventory {
  const owned = Array.isArray(inv.owned) ? inv.owned.map(String) : [];
  const left = new Map<string, number>();
  for (const id of owned) left.set(id, (left.get(id) ?? 0) + 1);
  const placed: PlacedItem[] = [];
  const uids = new Set<string>();
  for (const [i, raw] of (Array.isArray(inv.placed) ? inv.placed : []).entries()) {
    const p = (raw ?? {}) as Partial<PlacedItem>;
    const item = String(p.item);
    if (!(left.get(item) ?? 0) || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) continue;
    left.set(item, left.get(item)! - 1);
    let uid = typeof p.uid === 'string' && p.uid ? p.uid : `p${i + 1}`;
    while (uids.has(uid)) uid += '_';
    uids.add(uid);
    placed.push({ uid, item, x: Number(p.x), y: Number(p.y), flip: p.flip === true, ...(p.turn === true ? { turn: true } : {}) });
  }
  return { owned, placed };
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

export type LifeEvent = { type: 'coins'; coins: number; delta: number } | { type: 'levelUp'; level: number; coins: number; gain: StatBlock };

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

  /** 今のMONZの名前を決める(生まれたとき) */
  setName(name: string): void {
    this.update({}, { name });
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

  /** なでるのゲージがMAXか(MAXのときは、なでても経験値が入らない) */
  get touchFull(): boolean {
    return (this.needs.touch ?? 0) >= NEEDS_RULES.gaugeMax;
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

  // ---------------- アイテム(家具・引越し券) ----------------

  /** 持っている数(置いてある家具もふくむ) */
  owns(id: string): number {
    return this.data.inventory.owned.filter((o) => o === id).length;
  }

  /** アイテムボックスに入っている数(持っている数 − 部屋に置いてある数) */
  inBox(id: string): number {
    return this.owns(id) - this.data.inventory.placed.filter((p) => p.item === id).length;
  }

  /** ショップで買う。コインが足りない・知らない番号なら買わずに false */
  buy(id: string): boolean {
    const price = itemPrice(id);
    // VIPの家具は、VIPルームを開放してから
    if (furniture(id)?.series === 'vip' && !this.data.vipOpen) return false;
    if (price === undefined || !this.spend(price)) return false;
    const inv = this.data.inventory;
    // 引越し券を買うと、4つめの部屋が見つかる(それまでは存在を知らせない)
    this.update({ inventory: { ...inv, owned: [...inv.owned, id] }, ...(id === MOVE_TICKET ? { secretRoom: true } : {}) });
    return true;
  }

  /** アイテムボックスの家具を部屋に置く。置いた家具の番号(なければ null)。置ける場所かどうかは画面の側で確かめる */
  placeItem(id: string, x: number, y: number, flip = false): string | null {
    if (!isFurniture(id) || this.inBox(id) <= 0) return null;
    const inv = this.data.inventory;
    const used = new Set(inv.placed.map((p) => p.uid));
    let n = inv.placed.length + 1;
    while (used.has(`p${n}`)) n++;
    const uid = `p${n}`;
    this.update({ inventory: { ...inv, placed: [...inv.placed, { uid, item: id, x, y, flip }] } });
    return uid;
  }

  /** 置いてある家具を動かす・向きを変える */
  movePlaced(uid: string, x: number, y: number, flip?: boolean, turn?: boolean): void {
    const inv = this.data.inventory;
    const t = turn ?? false;
    this.update({ inventory: { ...inv, placed: inv.placed.map((p) => (p.uid === uid ? { uid, item: p.item, x, y, flip: flip ?? p.flip, ...((turn === undefined ? p.turn : t) ? { turn: true } : {}) } : p)) } });
  }

  /** 置いてある家具をしまう(アイテムボックスにもどす) */
  storePlaced(uid: string): void {
    const inv = this.data.inventory;
    this.update({ inventory: { ...inv, placed: inv.placed.filter((p) => p.uid !== uid) } });
  }

  /**
   * 引越し券を1枚使って引っ越す。券がない・今の部屋と同じなら false。
   * 企画者決定(2026-10-21): 使った券はなくなる。置いてある家具はすべてアイテムボックスにもどる(新しい部屋で置き直し)。
   * MONZのレベル・ステータス・お世話の様子・コイン・持ち物はそのまま。
   */
  moveTo(place: HomePlace): boolean {
    const inv = this.data.inventory;
    const i = inv.owned.indexOf(MOVE_TICKET);
    if (i < 0 || place === this.data.place) return false;
    // 4つめの部屋は、見つけてから(引越し券を買ってから)でないと引っ越せない
    if (place === SECRET_PLACE && !this.data.secretRoom) return false;
    this.update({ place, inventory: { owned: inv.owned.filter((_, k) => k !== i), placed: [] }, ...(place === SECRET_PLACE ? { vipOpen: true } : {}) });
    return true;
  }

  /** 4つめの部屋を見つけた(引越し券を買ったとき) */
  findSecretRoom(): void {
    if (!this.data.secretRoom) this.update({ secretRoom: true });
  }

  /** ミニゲームの記録を残す。新記録なら true */
  record(game: string, score: number, round: number): boolean {
    const old = this.data.records[game] ?? { bestScore: 0, bestRound: 0, plays: 0 };
    const best = score > old.bestScore;
    this.update({ records: { ...this.data.records, [game]: { bestScore: Math.max(old.bestScore, score), bestRound: Math.max(old.bestRound, round), plays: old.plays + 1 } } });
    return best;
  }

  /** 閉じていた間の変化をまとめて進める(画面を開いたとき) */
  catchUp(now = Date.now()): void {
    this.update({ lastSeen: now }, { needs: catchUp(this.needs, this.data.lastSeen, now) });
    this.applyNeglect();
  }

  /** 【テスト用】時間を hours 時間進めたことにする */
  advance(hours: number, now = Date.now()): void {
    this.update({ lastSeen: now }, { needs: catchUp(this.needs, now - hours * 3600 * 1000, now) });
    this.applyNeglect();
  }

  /** 画面を開いている間、少しずつ進める。保存はたまに(save: true のとき)だけ */
  tick(seconds: number, now = Date.now(), save = false): void {
    this.update({ lastSeen: now }, { needs: stepNeeds(this.needs, seconds, isNight(new Date(now))) }, save);
    this.applyNeglect(save);
  }

  /** お腹・なでるのゲージが 0 のまま続いた時間のぶん、愛をへらす(企画者決定 2026-10-21。0 より下にはならない) */
  private applyNeglect(save = true): void {
    const n = this.needs;
    const per = LOVE_RULES.neglectSec;
    const kf = Math.floor((n.zeroFullSec ?? 0) / per);
    const kt = Math.floor((n.zeroTouchSec ?? 0) / per);
    if (kf + kt === 0) return;
    const love = Math.max(0, Math.round((this.monz.love - LOVE_RULES.neglect * (kf + kt)) * 10) / 10);
    this.update({}, { love, needs: { ...n, zeroFullSec: (n.zeroFullSec ?? 0) - kf * per, zeroTouchSec: (n.zeroTouchSec ?? 0) - kt * per } }, save);
  }

  /** 眠らせる・起こす */
  setAsleep(asleep: boolean): void {
    if (this.needs.asleep !== asleep) this.update({}, { needs: { ...this.needs, asleep } });
  }

  feed(now = Date.now()): void {
    const n = this.needs;
    // 愛が増えるのは、ごはんを2目もり ぜんぶ食べられるとき(ゲージ 8 以下)だけ(企画者決定 2026-10-21)
    if (n.full <= LOVE_RULES.feedAtMost + 1e-9) this.gainLove('feed', now);
    const m = this.monz;
    this.update({}, { needs: { ...this.needs, zeroFullSec: 0, full: Math.min(1, n.full + NEEDS_RULES.feedFull), mood: Math.min(1, n.mood + NEEDS_RULES.feedMood) }, careCount: { ...m.careCount, feed: m.careCount.feed + 1 } });
    this.gainExp(NEEDS_RULES.feedExp, now, 'feed');
  }

  pet(happy: boolean, now = Date.now()): void {
    const n = this.needs;
    // なでると愛 +0.2。なでるのゲージが 9 以下のときだけ(企画者決定 2026-10-21)
    if ((n.touch ?? 0) <= LOVE_RULES.petAtMost + 1e-9) this.gainLove('pet', now);
    const m = this.monz;
    this.update({}, { needs: { ...this.needs, touch: Math.min(1, (n.touch ?? 0) + NEEDS_RULES.petTouch), zeroTouchSec: 0, mood: Math.min(1, n.mood + (happy ? NEEDS_RULES.petMood : NEEDS_RULES.petMood / 3)) }, careCount: { ...m.careCount, pet: m.careCount.pet + 1 } });
    // 経験値は、なでるのゲージがMAXでなかったときだけ(企画者決定 2026-10-21)
    if ((n.touch ?? 0) < NEEDS_RULES.gaugeMax) this.gainExp(NEEDS_RULES.petExp, now, 'pet');
  }

  /** 愛を増やす(最大値まで)。loveFeedToday・lovePetToday は記録だけ(上限には使わない) */
  private gainLove(kind: 'feed' | 'pet', now: number): void {
    const m = this.monz;
    const today = dayKey(new Date(now));
    const fed = m.loveDay === today ? m.loveFeedToday : 0;
    const petted = m.loveDay === today ? m.lovePetToday : 0;
    const want = kind === 'feed' ? LOVE_RULES.feed : LOVE_RULES.pet;
    const got = Math.max(0, Math.min(want, LOVE_RULES.max - m.love));
    const love = Math.round((m.love + got) * 10) / 10;
    this.update({}, { love, loveDay: today, loveFeedToday: fed + (kind === 'feed' ? got : 0), lovePetToday: petted + (kind === 'pet' ? got : 0) });
  }

  /**
   * 自由ポイントを1つ振り分ける。振り直しはできない(企画者決定)。愛には振れない。最大(150)の能力にも振れない。
   * ポイントが足りなければ false。
   */
  allocate(stat: StatKey): boolean {
    const m = this.monz;
    if (m.statPoints < 1 || !STAT_KEYS.includes(stat) || currentStats(m)[stat] >= STAT_MAX) return false;
    this.update({}, { statPoints: m.statPoints - 1, alloc: { ...m.alloc, [stat]: m.alloc[stat] + 1 } });
    return true;
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
    // 1日の上限があるのは、ごはんの経験値だけ(なでるはゲージで決まる。ミニゲームは上限なし)
    const care = kind === 'feed';
    const room = care ? NEEDS_RULES.dailyExpCap - used : Infinity;
    const got = Math.max(0, Math.min(amount, room));
    let { level, exp, statPoints, auto } = m;
    exp += got;
    const ups: number[] = [];
    const gains: StatBlock[] = [];
    while (exp >= expToNext(level)) {
      exp -= expToNext(level);
      level++;
      // 自動成長(ランダムに合計+3。得意な能力ほど入りやすい)と、自由ポイント+1
      const gain = rollAutoGrowth(m.species, levelUpRng(m.uid, level), currentStats({ ...m, auto }));
      auto = addStats(auto, gain);
      gains.push(gain);
      statPoints += FREE_POINTS_PER_LEVEL;
      ups.push(level);
    }
    this.update({}, { level, exp, statPoints, auto, expDay: today, expToday: care ? used + got : used, expPetToday: kind === 'pet' ? usedPet + got : usedPet });
    for (const [i, lv] of ups.entries()) {
      const coins = levelUpCoins(lv);
      this.emit({ type: 'levelUp', level: lv, coins, gain: gains[i] });
      this.add(coins);
    }
  }
}
