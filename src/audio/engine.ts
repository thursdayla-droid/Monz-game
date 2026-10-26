import { BGM_FILES, type BgmName } from './bgmFiles';
import { FilePlayer, loadAudio, loadBuffer } from './filePlayer';
import { SE_FILES, SE_MAX_VOICES } from './seFiles';
import { loadSound, saveSound, stepToGain, type SoundSettings } from './settings';
import { playSe, type SeName } from './sfx';

/**
 * 音の再生をまとめて受け持つ(BGM・効果音)。
 * - iPhone は最初のタップの中で unlock() を呼ぶまで音が出ない
 * - BGM は企画者の曲ファイル(src/audio/bgmFiles.ts)。曲を切りかえるときは重ねてなめらかに入れかえる
 * - BGMと効果音の音量は別々。設定は端末に保存する
 * - 効果音は、企画者のファイルがあればそれを鳴らす(seFiles.ts)。無ければプログラムで作った音
 * - 全部の音は最後にリミッター(DynamicsCompressor)を通す。たくさん同時に鳴っても音が割れないように(2026-10-26)
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private seBus: GainNode | null = null;
  /** 読み込んだ効果音のファイル */
  private seBuffers = new Map<SeName, AudioBuffer>();
  /** 今鳴っている効果音の数(名前ごと) */
  private voices = new Map<SeName, number>();
  private current: FilePlayer | null = null;
  private wanted: BgmName | null = null;
  settings: SoundSettings = loadSound();

  private touched = false;

  /** Sound has been enabled with a tap (the iPhone limitation is lifted) */
  get unlocked(): boolean {
    return this.touched && !!this.ctx;
  }

  /** Call inside a tap. Does nothing after the first time */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.bgmBus = this.ctx.createGain();
      this.seBus = this.ctx.createGain();
      // リミッター: 大きすぎる音をおさえて、音割れを防ぐ
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(this.ctx.destination);
      this.bgmBus.connect(limiter);
      this.seBus.connect(limiter);
      this.applyVolume();
      // Pause while the screen is not visible
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
    this.touched = true;
    if (this.ctx.state !== 'running') void this.ctx.resume();
    // For iOS: playing silence once inside a tap allows sound from then on
    const silent = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = silent;
    s.connect(this.ctx.destination);
    s.start(0);
    // 曲の読み込みには少し時間がかかるので、最初のタップのときに読み始めておく
    for (const { file } of Object.values(BGM_FILES)) void loadBuffer(this.ctx, file).catch(() => undefined);
    if (this.wanted && !this.current) this.playBgm(this.wanted);
    this.preloadSe(Object.keys(SE_FILES) as SeName[]);
  }

  /** 効果音のファイルを先に読んでおく(その画面を開いたときに呼ぶ。音が出せるようになる前なら、あとで読む) */
  preloadSe(names: SeName[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const name of names) {
      const f = SE_FILES[name];
      if (!f || this.seBuffers.has(name)) continue;
      void loadAudio(ctx, f.file)
        .then((b) => this.seBuffers.set(name, b))
        .catch(() => undefined);
    }
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

  /** この場面の曲を流す(重ねて入れかえる)。同じ曲が流れていれば何もしない(そのまま続ける) */
  playBgm(name: BgmName, fade = 1.5): void {
    this.wanted = name;
    if (!this.ctx || !this.bgmBus) return;
    if (this.current?.name === name) return;
    this.current?.stop(fade);
    const player = new FilePlayer(this.ctx, this.bgmBus, name, BGM_FILES[name]);
    player.start(fade);
    this.current = player;
  }

  /** Stop the BGM (fade it out over fade seconds; 0 stops immediately) */
  stopBgm(fade = 0.6): void {
    this.wanted = null;
    this.current?.stop(fade);
    this.current = null;
  }

  se(name: SeName, opts: { pitch?: number } = {}): void {
    if (!this.ctx || !this.seBus || this.ctx.state !== 'running') return;
    const buf = this.seBuffers.get(name);
    if (!buf) {
      playSe(this.ctx, this.seBus, name, opts.pitch ?? 1);
      return;
    }
    // 同じ音が重なりすぎないように
    const n = this.voices.get(name) ?? 0;
    if (n >= SE_MAX_VOICES) return;
    this.voices.set(name, n + 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = SE_FILES[name]?.gain ?? 1;
    src.connect(g).connect(this.seBus);
    src.onended = () => this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1));
    src.start();
  }
}

export const audio = new AudioEngine();
