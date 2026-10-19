/**
 * 音量の設定(BGMと効果音を別々に)。端末に保存する。Phaserにも音の再生にも依存しない。
 */
export const SOUND_KEY = 'monz:sound';
export const VOLUME_STEPS = 10;

export interface SoundSettings {
  /** 0〜10 */
  bgm: number;
  /** 0〜10 */
  se: number;
}

export const DEFAULT_SOUND: SoundSettings = { bgm: 7, se: 8 };

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

const store = (): Store => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const clamp = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(VOLUME_STEPS, Math.round(v))) : d);

export function loadSound(s: Store = store()): SoundSettings {
  try {
    const raw = s?.getItem(SOUND_KEY);
    const data = raw ? (JSON.parse(raw) as Partial<SoundSettings>) : {};
    return { bgm: clamp(data.bgm, DEFAULT_SOUND.bgm), se: clamp(data.se, DEFAULT_SOUND.se) };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function saveSound(v: SoundSettings, s: Store = store()): void {
  try {
    s?.setItem(SOUND_KEY, JSON.stringify({ bgm: clamp(v.bgm, DEFAULT_SOUND.bgm), se: clamp(v.se, DEFAULT_SOUND.se) }));
  } catch {
    /* 保存できなくても続ける */
  }
}

/** 0〜10 の段階 → 実際の音量(耳の感じ方に合わせて、小さい側を細かく) */
export const stepToGain = (step: number): number => (step <= 0 ? 0 : Math.pow(step / VOLUME_STEPS, 2));
