import type { KeyValueStore } from '../save';
import type { GameSnapshot } from './game';
import type { Hp } from './rpg';
import { MAX_LAP, STAGE_COUNT } from './stages';

/**
 * MAHJONG QUEST の 進み具合(どの ステージ・何周目・ゴールド・持ち物)。
 * お世話の データ(monz:life)とは 別の 場所に 保存する(古い データに 影響しない)。
 * 対局の 途中は 局の はじめごとに 保存(MjSuspend。2026-11-15 企画者「一時停止して いつでも 続きから」→ A: 局の はじめから)
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
export function clearStage(p: MjProgress, gold: number): { lapUp: boolean; complete: boolean } {
  p.gold += gold;
  p.clears++;
  if (p.stage + 1 >= STAGE_COUNT) {
    // 2周目の さいごで 完全クリア → 3周目は なし。はじめ(1周目の STAGE 1)から(企画者 2026-11-09)
    if (p.lap >= MAX_LAP) {
      Object.assign(p, { ...newProgress(), clears: p.clears });
      return { lapUp: true, complete: true };
    }
    p.stage = 0;
    p.lap++;
    return { lapUp: true, complete: false };
  }
  p.stage++;
  return { lapUp: false, complete: false };
}

/**
 * はじめから(2026-11-09 企画者「やめなければ 続きから。一度 やめたら 最初の ステージから」)。
 * ステージ・周・ゴールド・持ち物を もどす。クリアした 回数(記録)だけ 残す
 */
export function resetRun(p: MjProgress): void {
  Object.assign(p, { ...newProgress(), clears: p.clears });
}

/** 対局の 中断(局の はじめの 状態)。続きからは その 局の 配牌から */
export const MJ_SUSPEND_KEY = 'monz:mahjong:suspend';

export interface MjSuspend {
  version: 1;
  stage: number;
  lap: number;
  /** まだ 発動して いない アイテム */
  item: string | null;
  hp: Hp;
  game: GameSnapshot;
}

export function saveSuspend(s: MjSuspend, store = defaultStore()): void {
  try {
    store?.setItem(MJ_SUSPEND_KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても 続ける */
  }
}

/** 中断の データ(こわれて いたら null) */
export function loadSuspend(store = defaultStore()): MjSuspend | null {
  try {
    const raw = store?.getItem(MJ_SUSPEND_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<MjSuspend>;
    const num = (v: unknown) => Number.isFinite(Number(v));
    const g = d.game;
    const h = d.hp;
    if (d.version !== 1 || !num(d.stage) || !num(d.lap) || !g || !h) return null;
    if (!Array.isArray(g.points) || g.points.length !== 4 || !g.points.every(num)) return null;
    if (![g.seed, g.roundWind, g.kyoku, g.startDealer, g.honba, g.sticks, g.count].every(num)) return null;
    if (![h.player, h.playerMax, h.enemy, h.enemyMax].every(num) || h.player <= 0 || h.enemy <= 0) return null;
    return { version: 1, stage: Number(d.stage), lap: Number(d.lap), item: typeof d.item === 'string' ? d.item : null, hp: { ...h }, game: { ...g, points: g.points.map(Number) } };
  } catch {
    return null;
  }
}

export function clearSuspend(store = defaultStore()): void {
  try {
    store?.removeItem?.(MJ_SUSPEND_KEY);
  } catch {
    /* なにも しない */
  }
}
