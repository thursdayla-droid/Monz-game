import type { Answers } from './questions';

/**
 * 端末内の保存(localStorage)。Phaserに依存しない。
 * 保存できない環境(プライベートブラウズなど)でも止まらないようにする。
 */
export const SAVE_KEY = 'monz:save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  /** 初回の質問の回答 */
  answers: Answers;
  answeredAt: string;
  /** 最初に出会ったMONZ */
  firstMonz: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadSave(store = defaultStore()): SaveData | null {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.version === SAVE_VERSION && data.answers ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData, store = defaultStore()): boolean {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(data));
    return !!store;
  } catch {
    return false;
  }
}

export function clearSave(store = defaultStore()): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* 消せなくても続ける */
  }
}
