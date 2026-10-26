import { assetUrl } from '../assetUrl';
import type { BgmFile, BgmName } from './bgmFiles';

const cache = new Map<string, Promise<AudioBuffer>>();

/** 曲を読み込んでおく(何度呼んでも1回だけ読む) */
export function loadBuffer(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  return loadAudio(ctx, `assets/bgm/${file}`);
}

/** 音のファイルを読み込んでおく(path は assets/ からの場所。効果音でも使う) */
export function loadAudio(ctx: BaseAudioContext, path: string): Promise<AudioBuffer> {
  const file = path;
  let p = cache.get(file);
  if (!p) {
    const url = assetUrl(path);
    // 確認用ページでは曲がページに埋め込まれている(data:)。fetch が禁止されている場所でも鳴るよう、自分で読む
    const bytes = url.startsWith('data:') ? Promise.resolve(dataUrlToBuffer(url)) : fetch(url).then((r) => r.arrayBuffer());
    p = bytes.then((data) => ctx.decodeAudioData(data));
    // 失敗したら、次は読み直せるようにする
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}

function dataUrlToBuffer(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * 企画者の曲ファイルを流す(フェードイン・フェードアウトつき)。
 * ファイルの読み込みが終わってから鳴り始める。読み込めなかったら鳴らさない。
 */
export class FilePlayer {
  private readonly out: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    readonly name: BgmName,
    private readonly bgm: BgmFile,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(destination);
  }

  start(fade: number): void {
    loadBuffer(this.ctx, this.bgm.file)
      .then((buffer) => {
        if (this.stopped) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = this.bgm.loop;
        src.connect(this.out);
        const t = this.ctx.currentTime + 0.05;
        src.start(t);
        this.out.gain.setValueAtTime(0.0001, t);
        this.out.gain.exponentialRampToValueAtTime(1, t + Math.max(0.05, fade));
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
