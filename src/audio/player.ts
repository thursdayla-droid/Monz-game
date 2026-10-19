import { Band } from './band';
import { barEvents, secondsPerBar, totalBars, type Song } from './songs';

const LOOKAHEAD = 0.6;
const TICK_MS = 100;

/**
 * Plays one song in real time, scheduling one bar at a time slightly ahead.
 * Rather than prerendering, it plays the score live, so even long songs use little memory, and each repeat changes slightly.
 * When it reaches the end, it returns to the start (or, for a song with next, asks to move to that song).
 */
export class SongPlayer {
  private readonly band: Band;
  private bar = 0;
  private nextBarTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    readonly song: Song,
    private readonly onEnd?: () => void,
  ) {
    this.band = new Band(ctx, destination);
  }

  start(fade: number): void {
    const t = this.ctx.currentTime + 0.08;
    this.band.out.gain.setValueAtTime(0.0001, t);
    this.band.out.gain.exponentialRampToValueAtTime(1, t + Math.max(0.05, fade));
    this.nextBarTime = t;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const ctx = this.ctx;
    // If the screen was hidden and time passed, resume from now (don't play a backlog all at once)
    if (this.nextBarTime < ctx.currentTime - 0.2) this.nextBarTime = ctx.currentTime + 0.05;
    const total = totalBars(this.song);
    while (this.nextBarTime < ctx.currentTime + LOOKAHEAD) {
      if (this.song.next && this.bar >= total) {
        if (!this.ended) {
          this.ended = true;
          this.onEnd?.();
        }
        return;
      }
      this.band.playBar(this.song, barEvents(this.song, this.bar), this.nextBarTime);
      this.nextBarTime += secondsPerBar(this.song);
      this.bar++;
    }
  }

  /** Fade out over fade seconds and stop (0 stops immediately) */
  stop(fade: number): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const g = this.band.out.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    if (fade > 0) g.exponentialRampToValueAtTime(0.0001, t + fade);
    else g.setValueAtTime(0, t);
    setTimeout(() => this.band.out.disconnect(), (fade + 3) * 1000);
  }
}

/** For checking: record a song into a sound buffer (an offline recording of the same performance) */
export async function renderSong(song: Song, bars: number, sampleRate = 32000): Promise<AudioBuffer> {
  const seconds = bars * secondsPerBar(song) + 3;
  const OAC = window.OfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const band = new Band(ctx, ctx.destination);
  for (let b = 0; b < bars; b++) band.playBar(song, barEvents(song, b), 0.05 + b * secondsPerBar(song));
  return ctx.startRendering();
}
