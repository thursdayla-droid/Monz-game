/**
 * B技(必殺技)の表と、付け替えの決まり(企画者の仕様 2026-10-23、docs/BATTLE.md 5章)。Phaserに依存しない。
 * - 枠は4つ: 通常B・横B・上B・下B
 * - 上Bには「復帰の性能がある技」だけ付けられる。ゲージを使う技・超必殺技は上Bに付けられない
 * - 通常B・横B・下Bは自由(通常必殺技・ゲージを使う技・超必殺技)
 * 技を覚える・付け替えて保存するのは、仕様書の順番6で作る。今は練習場で BUNK の上Bを付けておくだけ。
 */

export const B_SLOTS = ['neutral', 'side', 'up', 'down'] as const;
export type BSlot = (typeof B_SLOTS)[number];

export type BMoveKind = 'normal' | 'gauge' | 'super';

/** 復帰の性能(上Bに付けられる技だけが持つ) */
export interface RecoveryDef {
  /** 上がる速さ(px/秒)と時間(秒)。だいたい 速さ×時間×0.6 くらい上がる */
  speed: number;
  time: number;
  /** スティックで曲げられる角度(度。0=真上。横へこの角度まで) */
  steer: number;
  /** 空中で使える回数(着地・崖つかまり・攻撃を受けると もどる) */
  airUses: number;
}

export interface BMoveDef {
  id: string;
  /** 画面に出す名前【仮】 */
  label: string;
  kind: BMoveKind;
  /** 使うゲージ(0 ならゲージなしで使える) */
  gauge: number;
  recovery?: RecoveryDef;
}

/**
 * 【仮】BUNKの上B(企画者の指示 2026-10-23: 上に上がる技)。名前・動きはこれから決める。
 * 攻撃の当たり判定はまだない(上がるだけ)
 */
export const BUNK_UP_B: BMoveDef = {
  id: 'bunk_rise',
  label: '上B（上昇）',
  kind: 'normal',
  gauge: 0,
  recovery: { speed: 1250, time: 0.42, steer: 55, airUses: 1 },
};

export const B_MOVES: Record<string, BMoveDef> = { [BUNK_UP_B.id]: BUNK_UP_B };

/** その枠に、その技を付けられるか */
export function canEquip(slot: BSlot, move: BMoveDef): boolean {
  if (slot === 'up') return !!move.recovery && move.gauge === 0 && move.kind === 'normal';
  return true;
}

/** 付けている技(枠ごと。null は空き) */
export type BLoadout = Record<BSlot, string | null>;

/** 付け方が決まりに合っているか(合っていない枠は空きにする) */
export function fixLoadout(l: Partial<BLoadout>): BLoadout {
  const out = { neutral: null, side: null, up: null, down: null } as BLoadout;
  for (const slot of B_SLOTS) {
    const m = l[slot] ? B_MOVES[l[slot]!] : undefined;
    if (m && canEquip(slot, m)) out[slot] = m.id;
  }
  return out;
}

/** 練習場で BUNK が付けている技【仮】(付け替えの画面ができるまで) */
export const PRACTICE_LOADOUT: BLoadout = { neutral: null, side: null, up: BUNK_UP_B.id, down: null };

/** スティックの向きから、使うBの枠を決める */
export function slotFor(x: number, y: number): BSlot {
  if (y < -0.5 && Math.abs(y) >= Math.abs(x) * 0.6) return 'up';
  if (y > 0.5 && Math.abs(y) >= Math.abs(x)) return 'down';
  if (Math.abs(x) > 0.5) return 'side';
  return 'neutral';
}
