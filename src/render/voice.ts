import type { Emotion } from '../core/reaction';

/** 鳴き声(仮)。音源ファイルの代わりに簡単な電子音で鳴らす。 */
let ctx: AudioContext | null = null;

/** iOSでは最初のタップの中で呼ぶ必要がある */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function playVoice(pitch: number, emotion: Emotion): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const base = 260 * pitch;
  let dur = 0.25;
  switch (emotion) {
    case 'happy':
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 2.2, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.22);
      break;
    case 'angry':
      osc.type = 'sawtooth';
      dur = 0.35;
      osc.frequency.setValueAtTime(base * 0.55, now);
      osc.frequency.linearRampToValueAtTime(base * 0.45, now + dur);
      break;
    case 'surprised':
      osc.type = 'square';
      dur = 0.18;
      osc.frequency.setValueAtTime(base * 1.2, now);
      osc.frequency.exponentialRampToValueAtTime(base * 3, now + 0.1);
      break;
    default:
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, now + dur);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(emotion === 'angry' ? 0.08 : 0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}
