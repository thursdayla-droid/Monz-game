/**
 * 【仮】BUNK(元画像のパーツ)のテスト用の動きの計算。Phaserに依存しない。
 * 値は src/render/bunkMotion.json。tools/check_motion.py も同じ計算をする。
 */
export type BunkPoseName = 'guard' | 'down';
export type BunkFace = 'closed' | 'angry' | 'sad' | 'happy';

export interface FistMotion {
  pivot: [number, number];
  angle: number;
  bob: number;
  period: number;
  phase: number;
}

export interface PoseMotion {
  dir: string;
  cutout: string;
  fists: Record<string, FistMotion>;
  still: string[];
  jab?: { part: string; dx: number; dy: number; scale: number; duration: number };
}

export interface BehaviorConfig {
  guardTime: [number, number];
  downTime: [number, number];
  walkTime: [number, number];
  sleepTime: [number, number];
  walkChance: number;
  sleepChance: number;
  walkSpeed: number;
  hopPeriod: number;
  hopHeight: number;
  walkTilt: number;
  walkSwing: number;
  idleTilt: number;
  idleTiltPeriod: number;
  jabInterval: [number, number];
  switchTime: number;
  switchSquash: number;
  sleepSink: number;
  sleepBreathPeriod: number;
  sleepBreathScale: number;
  reactTime: number;
  happyHop: number;
  angryShake: number;
}

export interface BunkMotion {
  anchor: [number, number];
  breath: { period: number; scaleY: number; scaleX: number; pivot: [number, number] };
  blink: { minInterval: number; maxInterval: number; duration: number };
  faces: { dir: string; z: number; names: BunkFace[] };
  poses: Record<BunkPoseName, PoseMotion>;
  behavior: BehaviorConfig;
  /**
   * 一時的に使わない物(2026-10-21 BUNK の絵の作り直し中)。新しい基本の絵と合わない古い絵を出さないため。
   * 'down': 腕を下ろした姿(かわりに構えた姿を出す) / 'faces': 表情の顔(まばたき・怒る・喜ぶの顔を出さない)
   */
  disabled?: ('down' | 'faces')[];
}

export interface BreathPose {
  scaleX: number;
  scaleY: number;
}

/** 呼吸: 胴体の足元近く(pivot)を中心に、ごくわずかに伸び縮みする。amount で大きさ、period で速さを変えられる */
export function breathPose(m: BunkMotion, t: number, amount = 1, period = m.breath.period): BreathPose {
  const s = Math.sin((t * Math.PI * 2) / period) * amount;
  return { scaleX: 1 - m.breath.scaleX * s, scaleY: 1 + m.breath.scaleY * s };
}

/** 拳の小さな揺れ: 手首あたり(pivot)を中心に少し回り、少し上下する。swing は歩くときの追加の揺れ(度) */
export function fistPose(f: FistMotion, t: number, swing = 0): { angleRad: number; bob: number } {
  const a = Math.sin((t * Math.PI * 2) / f.period + f.phase);
  return { angleRad: ((f.angle * a + swing) * Math.PI) / 180, bob: f.bob * a };
}

/** 拳を突き出す動きの強さ(0→1→0)。k は突き出しを始めてからの割合(0〜1) */
export function jabAmount(k: number): number {
  if (k <= 0 || k >= 1) return 0;
  return k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
}
