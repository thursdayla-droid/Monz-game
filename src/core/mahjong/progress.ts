import type { KeyValueStore } from '../save';
import { STAGE_COUNT } from './stages';

/**
 * MAHJONG QUEST の 進み具合(どの ステージ・何周目・ゴールド・持ち物)。
 * お世話の データ(monz:life)とは 別の 場所に 保存する(古い データに 影響しない)。
 * 対局の 途中の セーブは しない【未確定】
 */
export const MJ_KEY = 'monz:mahjong';

export interface MjProgress {
  version: 1;
  /** 次に 遊ぶ ステージ(0〜4) */
  stage: number;
  /** 何周目(1〜) */
  lap: number;
  /** この ミニゲームだけの お金(企画者 2026-11-08。はじめは 0G) */
  gold: number;
  /** 持っている アイテム(道具屋 5段目)と 数 */
  items: Record<string, number>;
  /** これまでに クリアした ステージの 数(全部の 周の 合計) */
  clears: number;
}

export const newProgress = (): MjProgress => ({ version: 1, stage: 0, lap: 1, gold: 0, items: {}, clears: 0 });

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadProgress(store = defaultStore()): MjProgress {
  try {
    const raw = store?.getItem(MJ_KEY);
    if (!raw) return newProgress();
    const d = JSON.parse(raw) as Partial<MjProgress>;
    const n = (v: unknown, f: number, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Math.floor(Number(v))) : f);
    return {
      version: 1,
      stage: Math.min(STAGE_COUNT - 1, n(d.stage, 0)),
      lap: n(d.lap, 1, 1),
      gold: n(d.gold, 0),
      items: typeof d.items === 'object' && d.items ? Object.fromEntries(Object.entries(d.items).map(([k, v]) => [k, n(v, 0)]).filter(([, v]) => (v as number) > 0)) : {},
      clears: n(d.clears, 0),
    };
  } catch {
    return newProgress();
  }
}

export function saveProgress(p: MjProgress, store = defaultStore()): void {
  try {
    store?.setItem(MJ_KEY, JSON.stringify(p));
  } catch {
    /* 保存できなくても 続ける */
  }
}

/** ステージ クリア: ゴールドを もらい、次の ステージへ(5つめなら 次の 周の 1つめ)。周が 変わったら true */
export function clearStage(p: MjProgress, gold: number): { lapUp: boolean } {
  p.gold += gold;
  p.clears++;
  if (p.stage + 1 >= STAGE_COUNT) {
    p.stage = 0;
    p.lap++;
    return { lapUp: true };
  }
  p.stage++;
  return { lapUp: false };
}

/**
 * はじめから(2026-11-09 企画者「やめなければ 続きから。一度 やめたら 最初の ステージから」)。
 * ステージ・周・ゴールド・持ち物を もどす。クリアした 回数(記録)だけ 残す
 */
export function resetRun(p: MjProgress): void {
  Object.assign(p, { ...newProgress(), clears: p.clears });
}
