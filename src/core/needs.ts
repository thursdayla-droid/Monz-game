/**
 * MONZの「お腹・眠さ・機嫌」と経験値(第2段階)。Phaserに依存しない。
 * 企画者決定(2026-10-19): 数字は画面に出さず、様子で伝える。1日2回くらいのお世話でちょうどよい。
 * アプリを閉じている間も変化する。放置しても取り返しのつかない状態にはしない(下がりきったら止まるだけ)。
 * 【仮】数字はすべて調整用の仮の値。
 */

export interface Needs {
  /** お腹のふくれぐあい(1=満腹, 0=ぺこぺこ) */
  full: number;
  /** 眠さ(0=元気, 1=とても眠い) */
  sleepy: number;
  /** 機嫌(1=ごきげん, 0=ふきげん) */
  mood: number;
  /** いま眠っているか */
  asleep: boolean;
  /** なでてほしさのゲージ(1=満たされている, 0=さみしい)。見えない。企画者決定(2026-10-21) */
  touch: number;
  /** お腹・なでるのゲージが 0 のまま続いている秒数(愛がへる。lifeSave の applyNeglect が使う) */
  zeroFullSec: number;
  zeroTouchSec: number;
}

export const NEEDS_RULES = {
  /** 満腹からぺこぺこになるまで(時間)。企画者決定(2026-10-21): ゲージ10目もりが1時間に1へる */
  hungerHours: 10,
  /** ごはん1回で戻るお腹(企画者決定 2026-10-21: 2目もり) */
  feedFull: 0.2,
  /** なでるのゲージ: 10目もりが1時間に1へる。なでると1目もりもどる(企画者決定 2026-10-21) */
  touchHours: 10,
  petTouch: 0.1,
  /** 何もしないとき、機嫌が1から0になるまで(時間)。お腹がすいていると早く下がる */
  moodHours: 14,
  hungryMoodFactor: 1.6,
  /** 起きていて眠くなるまで(時間)。夜は早く眠くなる */
  awakeHours: 14,
  nightFactor: 2.5,
  /** 眠って元気になるまで(時間) */
  sleepHours: 2,
  /** これより眠いと自分で眠る / これより元気になると起きる */
  fallAsleepAt: 0.85,
  wakeUpAt: 0.05,
  /** ごはん・なでるで上がる機嫌 */
  feedMood: 0.15,
  petMood: 0.12,
  /**
   * お世話の経験値: ごはん・なでる1回ぶんと、1日の上限。
   * 企画者決定(2026-10-20): 上限は残す。なでるだけで上限に届かないよう、なでるぶんは1日 petDailyCap まで。
   * ごはん2回(30)+なでる5回(20)でちょうど50。
   */
  feedExp: 15,
  petExp: 4,
  petDailyCap: 20,
  dailyExpCap: 50,
} as const;

/** 夜(スマホの時計で22時〜7時)。夜はよく眠る */
export const isNight = (date: Date): boolean => date.getHours() >= 22 || date.getHours() < 7;

/** 生まれたときの様子。企画者決定(2026-10-21): お腹・なでるのゲージは10目もりの5から */
export const newNeeds = (): Needs => ({ full: 0.5, sleepy: 0.2, mood: 0.8, asleep: false, touch: 0.5, zeroFullSec: 0, zeroTouchSec: 0 });

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** seconds 秒ぶん進める(night: 夜かどうか) */
export function stepNeeds(n: Needs, seconds: number, night: boolean): Needs {
  const r = NEEDS_RULES;
  const h = seconds / 3600;
  const full = clamp01(n.full - h / r.hungerHours);
  const touch = clamp01((n.touch ?? 1) - h / r.touchHours);
  // 0 になってからの時間だけを数える(0 になる前の時間は数えない)
  const atZero = (before: number, hours: number) => Math.max(0, seconds - before * hours * 3600);
  const zeroFullSec = full <= 0 ? (n.zeroFullSec ?? 0) + atZero(n.full, r.hungerHours) : 0;
  const zeroTouchSec = touch <= 0 ? (n.zeroTouchSec ?? 0) + atZero(n.touch ?? 1, r.touchHours) : 0;
  const mood = clamp01(n.mood - (h / r.moodHours) * (full < 0.25 ? r.hungryMoodFactor : 1));
  let sleepy = n.sleepy;
  let asleep = n.asleep;
  if (asleep) {
    sleepy = clamp01(sleepy - h / r.sleepHours);
    // 夜はなかなか起きない
    if (sleepy <= r.wakeUpAt && !night) asleep = false;
  } else {
    sleepy = clamp01(sleepy + (h / r.awakeHours) * (night ? r.nightFactor : 1));
    if (sleepy >= r.fallAsleepAt) asleep = true;
  }
  return { full, sleepy, mood, asleep, touch, zeroFullSec, zeroTouchSec };
}

/** 閉じていた間をまとめて進める(最大7日。1分ずつ、夜かどうかも時刻どおりに) */
export function catchUp(n: Needs, fromMs: number, toMs: number): Needs {
  const start = Math.max(fromMs, toMs - 7 * 24 * 3600 * 1000);
  let t = start;
  let cur = n;
  const STEP = 60_000;
  while (t < toMs) {
    const dt = Math.min(STEP, toMs - t);
    cur = stepNeeds(cur, dt / 1000, isNight(new Date(t)));
    t += dt;
  }
  return cur;
}

/** そのレベルから次のレベルまでに必要な経験値(1日2回のお世話で2〜3日) */
export const expToNext = (level: number): number => 110 + (level - 1) * 15;

/** レベルが上がったときにもらえるコイン */
export const levelUpCoins = (newLevel: number): number => newLevel * 10;

/** ローカルの日付('2026-10-19')。1日の経験値の上限に使う */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/**
 * 今の気分のひとこと(お世話画面の左上、名前の下)。企画者決定(2026-10-21): 「今日もよろしく！」をやめて、今の気分を出す。
 * 上から順に、当てはまった最初のものを出す。【仮】言葉と目安(ゲージ3以下など)
 */
export function moodWord(n: Needs): string {
  if (n.asleep) return 'すやすや ねてる…';
  if (n.full <= 0.3 + 1e-9) return 'おなか すいた…';
  if ((n.touch ?? 1) <= 0.3 + 1e-9) return 'さみしい… なでて';
  if (n.sleepy > 0.6) return 'ねむい…';
  if (n.full >= 0.95) return 'おなか いっぱい！';
  if (n.mood < 0.3) return 'ごきげん ななめ';
  if (n.mood > 0.7) return 'ごきげん！';
  return 'のんびり';
}
