import { SCORES, type CueName } from './score';
import { loadSound, saveSound, stepToGain, type SoundSettings } from './settings';
import { renderScore } from './synth';
import { playSe, type SeName } from './sfx';

/**
 * 音の再生をまとめて受け持つ(BGM・効果音)。
 * - iPhone は最初のタップの中で unlock() を呼ぶまで音が出ない
 * - BGMは場面ごとの曲(cue)を、先に音にしておいてからループ再生する。切りかえは自然に重ねる(クロスフェード)
 * - BGMと効果音の音量は別々。設定は端末に保存する
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private seBus: GainNode | null = null;
  private buffers = new Map<CueName, Promise<AudioBuffer>>();
  private current: { cue: CueName; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: CueName | null = null;
  private stopped = false;
  settings: SoundSettings = loadSound();

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** タップの中で呼ぶ。2回目以降は何もしない */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.bgmBus = this.ctx.createGain();
      this.seBus = this.ctx.createGain();
      this.bgmBus.connect(this.ctx.destination);
      this.seBus.connect(this.ctx.destination);
      this.applyVolume();
      // 画面が見えないあいだは止める
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    // iOS 向け: タップの中で無音を1回鳴らすと、その後も音が出せる
    const silent = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = silent;
    s.connect(this.ctx.destination);
    s.start(0);
    if (this.wanted && !this.current && !this.stopped) this.playBgm(this.wanted);
  }

  setVolume(kind: 'bgm' | 'se', step: number): void {
    this.settings = { ...this.settings, [kind]: step };
    saveSound(this.settings);
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx || !this.bgmBus || !this.seBus) return;
    const t = this.ctx.currentTime;
    this.bgmBus.gain.setTargetAtTime(stepToGain(this.settings.bgm), t, 0.05);
    this.seBus.gain.setTargetAtTime(stepToGain(this.settings.se), t, 0.02);
  }

  /** 曲を先に音にしておく(切りかえを速くするため) */
  prepare(cue: CueName): Promise<AudioBuffer> {
    let p = this.buffers.get(cue);
    if (!p) {
      p = renderScore(SCORES[cue]());
      p.catch(() => this.buffers.delete(cue));
      this.buffers.set(cue, p);
    }
    return p;
  }

  /** 場面の曲を流す。同じ曲が流れていれば何もしない */
  playBgm(cue: CueName, fade = 1.2): void {
    this.wanted = cue;
    this.stopped = false;
    if (!this.ctx || !this.bgmBus) return;
    if (this.current?.cue === cue) return;
    const ctx = this.ctx;
    const bus = this.bgmBus;
    void this.prepare(cue).then((buffer) => {
      if (this.wanted !== cue || this.stopped || this.current?.cue === cue) return;
      this.fadeOutCurrent(fade);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(1, t + fade);
      src.connect(gain).connect(bus);
      src.start(t);
      this.current = { cue, src, gain };
    });
  }

  /** BGMを止める(fade 秒で小さくする。0 ならすぐ止める) */
  stopBgm(fade = 0.6): void {
    this.stopped = true;
    this.wanted = null;
    this.fadeOutCurrent(fade);
  }

  private fadeOutCurrent(fade: number): void {
    const cur = this.current;
    if (!cur || !this.ctx) return;
    this.current = null;
    const t = this.ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value || 1, t);
    if (fade > 0) cur.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    else cur.gain.gain.setValueAtTime(0, t);
    cur.src.stop(t + fade + 0.05);
  }

  se(name: SeName, opts: { pitch?: number } = {}): void {
    if (!this.ctx || !this.seBus || this.ctx.state !== 'running') return;
    playSe(this.ctx, this.seBus, name, opts.pitch ?? 1);
  }
}

export const audio = new AudioEngine();
