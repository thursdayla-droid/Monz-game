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
}

export const NEEDS_RULES = {
  /** 満腹からぺこぺこになるまで(時間) */
  hungerHours: 12,
  /** ごはん1回で戻るお腹 */
  feedFull: 0.5,
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
  /** 経験値: ごはん・なでる1回ぶん、1日の上限 */
  feedExp: 12,
  petExp: 4,
  dailyExpCap: 50,
} as const;

/** 夜(スマホの時計で22時〜7時)。夜はよく眠る */
export const isNight = (date: Date): boolean => date.getHours() >= 22 || date.getHours() < 7;

export const newNeeds = (): Needs => ({ full: 0.8, sleepy: 0.2, mood: 0.8, asleep: false });

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** seconds 秒ぶん進める(night: 夜かどうか) */
export function stepNeeds(n: Needs, seconds: number, night: boolean): Needs {
  const r = NEEDS_RULES;
  const h = seconds / 3600;
  const full = clamp01(n.full - h / r.hungerHours);
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
  return { full, sleepy, mood, asleep };
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
