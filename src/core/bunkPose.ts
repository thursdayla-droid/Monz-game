/**
 * 【仮】BUNK(元画像のパーツ)のテスト用の動きの計算。Phaserに依存しない。
 * 値は src/render/bunkMotion.json。tools/check_motion.py も同じ計算をする。
 */
export interface BunkMotion {
  breath: { period: number; scaleY: number; scaleX: number; pivot: [number, number] };
  blink: { minInterval: number; maxInterval: number; duration: number; closedScaleY: number };
  fists: Record<string, { pivot: [number, number]; angle: number; bob: number; period: number; phase: number }>;
  eyes: string[];
  still: string[];
}

export interface BreathPose {
  scaleX: number;
  scaleY: number;
}

/** 呼吸: 胴体の足元近く(pivot)を中心に、ごくわずかに伸び縮みする */
export function breathPose(m: BunkMotion, t: number): BreathPose {
  const s = Math.sin((t * Math.PI * 2) / m.breath.period);
  return { scaleX: 1 - m.breath.scaleX * s, scaleY: 1 + m.breath.scaleY * s };
}

/** 拳の小さな揺れ: 手首あたり(pivot)を中心に少し回り、少し上下する */
export function fistPose(m: BunkMotion, part: string, t: number): { angleRad: number; bob: number } {
  const f = m.fists[part];
  const a = Math.sin((t * Math.PI * 2) / f.period + f.phase);
  return { angleRad: (f.angle * a * Math.PI) / 180, bob: f.bob * a };
}

/** まばたき中の目の縦の大きさ(1=開いている)。closedAt はまばたきを始めた時刻 */
export function blinkScale(m: BunkMotion, t: number, closedAt: number): number {
  const k = (t - closedAt) / m.blink.duration;
  if (k < 0 || k > 1) return 1;
  const shut = 1 - Math.abs(k * 2 - 1); // 0→1→0
  return 1 - (1 - m.blink.closedScaleY) * shut;
}
