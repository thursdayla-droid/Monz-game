import { assetUrl } from '../assetUrl';
import type { BgmFile } from './bgmFiles';
import type { Song } from './songs';

const cache = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(assetUrl(`assets/bgm/${file}`))
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
    cache.set(file, p);
  }
  return p;
}

/**
 * 企画者の曲ファイルを流す。SongPlayer と同じ使い方(start / stop)。
 * ファイルの読み込みが終わってから鳴り始める。読み込めなかったら鳴らさない。
 */
export class FilePlayer {
  private readonly out: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    readonly song: Song,
    private readonly bgm: BgmFile,
    private readonly onEnd?: () => void,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(destination);
  }

  /** fromIntro=false なら skip 秒目から流す */
  start(fade: number, fromIntro = true): void {
    loadBuffer(this.ctx, this.bgm.file)
      .then((buffer) => {
        if (this.stopped) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = this.bgm.loop;
        src.connect(this.out);
        const t = this.ctx.currentTime + 0.05;
        src.start(t, fromIntro ? 0 : Math.min(this.bgm.skip ?? 0, buffer.duration - 1));
        this.out.gain.setValueAtTime(0.0001, t);
        this.out.gain.exponentialRampToValueAtTime(1, t + Math.max(0.05, fade));
        if (!this.bgm.loop) src.onended = () => !this.stopped && this.onEnd?.();
        this.source = src;
      })
      .catch(() => {
        /* 読み込めなくても止まらない */
      });
  }

  stop(fade: number): void {
    this.stopped = true;
    const g = this.out.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    if (fade > 0) g.exponentialRampToValueAtTime(0.0001, t + fade);
    else g.setValueAtTime(0, t);
    const src = this.source;
    setTimeout(() => {
      try {
        src?.stop();
      } catch {
        /* もう止まっている */
      }
      this.out.disconnect();
    }, (fade + 0.2) * 1000);
  }
}
