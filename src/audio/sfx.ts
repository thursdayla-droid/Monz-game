/**
 * 効果音。すべてその場で合成する(録音した音は使わない)。【仮】企画者が聴いて調整する。
 */
export type SeName =
  | 'tap'
  | 'select'
  | 'next'
  | 'back'
  | 'wing'
  | 'whistle'
  | 'plop'
  | 'boing'
  | 'knock'
  | 'crack'
  | 'crackBig'
  | 'burst'
  | 'spray'
  | 'slam'
  | 'happy'
  | 'angry'
  | 'surprised'
  | 'sting'
  | 'beep'
  | 'beepLast'
  | 'swing'
  | 'bat'
  | 'cheer'
  | 'punch'
  | 'punchHeavy'
  | 'whoosh'
  | 'guard'
  | 'koBlast'
  | 'land'
  | 'hop';

let noise: AudioBuffer | null = null;
function noiseBuf(ctx: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

type Env = [time: number, value: number][];

function tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, freq: Env, gain: Env, end: number): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq[0][1], t + freq[0][0]);
  for (const [dt, v] of freq.slice(1)) o.frequency.exponentialRampToValueAtTime(v, t + dt);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(gain[0][1], 0.0001), t + gain[0][0]);
  for (const [dt, v] of gain.slice(1)) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + dt);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + end);
}

function hiss(ctx: AudioContext, out: AudioNode, t: number, type: BiquadFilterType, freq: Env, q: number, gain: Env, end: number): void {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq[0][1], t);
  for (const [dt, v] of freq.slice(1)) f.frequency.exponentialRampToValueAtTime(v, t + dt);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(gain[0][1], 0.0001), t);
  for (const [dt, v] of gain.slice(1)) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + dt);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + end);
}

/** 音を少しつぶして、太く・荒くする(パンチの「ドスッ」用) */
let crunchCurve: Float32Array | null = null;
function crunch(ctx: AudioContext, out: AudioNode, amount = 3): AudioNode {
  if (!crunchCurve) {
    crunchCurve = new Float32Array(1024);
    for (let i = 0; i < crunchCurve.length; i++) {
      const x = (i / (crunchCurve.length - 1)) * 2 - 1;
      crunchCurve[i] = Math.tanh(x * amount);
    }
  }
  const w = ctx.createWaveShaper();
  w.curve = crunchCurve as Float32Array<ArrayBuffer>;
  w.oversample = '2x';
  w.connect(out);
  return w;
}

export function playSe(ctx: AudioContext, out: AudioNode, name: SeName, pitch: number): void {
  const t = ctx.currentTime + 0.005;
  const p = pitch;
  switch (name) {
    case 'tap':
      tone(ctx, out, t, 'sine', [[0, 900 * p], [0.05, 600 * p]], [[0, 0.25], [0.06, 0.0001]], 0.08);
      break;
    case 'select':
      tone(ctx, out, t, 'triangle', [[0, 660 * p], [0.08, 990 * p]], [[0, 0.22], [0.14, 0.0001]], 0.16);
      tone(ctx, out, t + 0.06, 'sine', [[0, 1320 * p]], [[0, 0.12], [0.12, 0.0001]], 0.14);
      break;
    case 'next':
      hiss(ctx, out, t, 'bandpass', [[0, 600], [0.18, 3000]], 1.2, [[0, 0.0001], [0.08, 0.25], [0.22, 0.0001]], 0.24);
      break;
    case 'back':
      hiss(ctx, out, t, 'bandpass', [[0, 3000], [0.18, 600]], 1.2, [[0, 0.0001], [0.08, 0.2], [0.22, 0.0001]], 0.24);
      break;
    case 'wing':
      // ドラゴンの羽ばたき(低い風の音)
      hiss(ctx, out, t, 'lowpass', [[0, 250], [0.25, 700], [0.5, 200]], 0.8, [[0, 0.0001], [0.2, 0.5 * p], [0.55, 0.0001]], 0.6);
      break;
    case 'whistle':
      // 落ちていく音(ヒューー)
      tone(ctx, out, t, 'sine', [[0, 1800], [1.4, 380]], [[0, 0.0001], [0.15, 0.12], [1.3, 0.1], [1.45, 0.0001]], 1.5);
      break;
    case 'plop':
      // ポトッ
      tone(ctx, out, t, 'sine', [[0, 520 * p], [0.09, 140 * p]], [[0, 0.6], [0.16, 0.0001]], 0.18);
      hiss(ctx, out, t, 'lowpass', [[0, 1200]], 0.7, [[0, 0.35], [0.06, 0.0001]], 0.07);
      break;
    case 'boing':
      // 籠がたわむ(ボヨン)
      tone(ctx, out, t, 'triangle', [[0, 180 * p], [0.08, 320 * p], [0.2, 200 * p], [0.32, 260 * p]], [[0, 0.35], [0.4, 0.0001]], 0.42);
      break;
    case 'knock':
      // ゴトッ(木の籠に卵が当たる)
      tone(ctx, out, t, 'sine', [[0, 240 * p], [0.05, 120 * p]], [[0, 0.45], [0.1, 0.0001]], 0.12);
      hiss(ctx, out, t, 'bandpass', [[0, 900 * p]], 3, [[0, 0.3], [0.04, 0.0001]], 0.05);
      break;
    case 'crack':
      hiss(ctx, out, t, 'highpass', [[0, 2500]], 0.7, [[0, 0.45], [0.05, 0.0001]], 0.06);
      hiss(ctx, out, t + 0.04, 'highpass', [[0, 3200]], 0.7, [[0, 0.25], [0.03, 0.0001]], 0.04);
      break;
    case 'crackBig':
      for (const d of [0, 0.05, 0.09, 0.16]) hiss(ctx, out, t + d, 'highpass', [[0, 1800 + d * 6000]], 0.7, [[0, 0.5], [0.05, 0.0001]], 0.06);
      tone(ctx, out, t, 'sine', [[0, 160], [0.2, 90]], [[0, 0.3], [0.25, 0.0001]], 0.26);
      break;
    case 'burst': {
      // 誕生: 光がはじける(きらめく和音 + 風)
      hiss(ctx, out, t, 'bandpass', [[0, 400], [0.5, 5000], [1.4, 1200]], 0.8, [[0, 0.0001], [0.05, 0.5], [1.5, 0.0001]], 1.6);
      const chord = [63, 67, 70, 74, 79, 82];
      chord.forEach((m, i) => {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        tone(ctx, out, t + i * 0.04, 'triangle', [[0, f]], [[0, 0.0001], [0.02, 0.12], [2.2, 0.0001]], 2.3);
        tone(ctx, out, t + i * 0.04, 'sine', [[0, f * 2]], [[0, 0.0001], [0.02, 0.05], [1.5, 0.0001]], 1.6);
      });
      tone(ctx, out, t, 'sine', [[0, 70], [0.6, 45]], [[0, 0.6], [0.8, 0.0001]], 0.85);
      break;
    }
    case 'spray':
      // スプレーを吹く(プシュー)
      hiss(ctx, out, t, 'highpass', [[0, 3000], [0.3, 5000]], 0.7, [[0, 0.0001], [0.03, 0.3], [0.35, 0.0001]], 0.4);
      break;
    case 'slam':
      // 名前がドン!(低い音 + はじける音)
      tone(ctx, out, t, 'sine', [[0, 110], [0.25, 42]], [[0, 0.9], [0.45, 0.0001]], 0.5);
      tone(ctx, out, t, 'square', [[0, 70], [0.1, 40]], [[0, 0.25], [0.15, 0.0001]], 0.18);
      hiss(ctx, out, t, 'bandpass', [[0, 1800]], 0.6, [[0, 0.5], [0.18, 0.0001]], 0.2);
      hiss(ctx, out, t, 'highpass', [[0, 6000]], 0.7, [[0, 0.25], [0.3, 0.0001]], 0.32);
      break;
    case 'happy':
      tone(ctx, out, t, 'triangle', [[0, 300 * p], [0.12, 660 * p], [0.22, 480 * p]], [[0, 0.0001], [0.02, 0.2], [0.26, 0.0001]], 0.28);
      break;
    case 'angry':
      tone(ctx, out, t, 'sawtooth', [[0, 150 * p], [0.3, 120 * p]], [[0, 0.0001], [0.02, 0.09], [0.35, 0.0001]], 0.37);
      break;
    case 'beep':
      // カウントダウンの「ピッ」(残り3秒・2秒)
      tone(ctx, out, t, 'square', [[0, 1320]], [[0, 0.0001], [0.005, 0.16], [0.11, 0.0001]], 0.12);
      tone(ctx, out, t, 'sine', [[0, 2640]], [[0, 0.0001], [0.005, 0.08], [0.08, 0.0001]], 0.09);
      break;
    case 'beepLast':
      // カウントダウンの最後(残り1秒)「ピー」
      tone(ctx, out, t, 'square', [[0, 1760]], [[0, 0.0001], [0.005, 0.18], [0.3, 0.12], [0.42, 0.0001]], 0.44);
      tone(ctx, out, t, 'sine', [[0, 3520]], [[0, 0.0001], [0.005, 0.07], [0.35, 0.0001]], 0.37);
      break;
    case 'sting': {
      // タイトルが出る瞬間の「ジャーン!」(低いドン + 明るい和音 + シンバル)
      tone(ctx, out, t, 'sine', [[0, 120], [0.3, 40]], [[0, 0.9], [0.6, 0.0001]], 0.65);
      tone(ctx, out, t, 'triangle', [[0, 69.3]], [[0, 0.0001], [0.01, 0.35], [1.6, 0.0001]], 1.7);
      hiss(ctx, out, t, 'highpass', [[0, 5000]], 0.7, [[0, 0.32], [1.6, 0.0001]], 1.7);
      hiss(ctx, out, t, 'bandpass', [[0, 1500]], 0.8, [[0, 0.4], [0.12, 0.0001]], 0.14);
      // D♭メジャー9の和音(タイトル曲と同じ調)。少しずつずらして広がりを出す
      const chord = [49, 61, 65, 68, 72, 75, 80];
      chord.forEach((m, i) => {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        tone(ctx, out, t + i * 0.012, 'sawtooth', [[0, f]], [[0, 0.0001], [0.01, 0.045], [0.25, 0.02], [1.8, 0.0001]], 1.9);
        tone(ctx, out, t + i * 0.012, 'triangle', [[0, f * 2]], [[0, 0.0001], [0.01, 0.06], [1.4, 0.0001]], 1.5);
      });
      break;
    }
    case 'surprised':
      tone(ctx, out, t, 'square', [[0, 330 * p], [0.1, 820 * p]], [[0, 0.0001], [0.02, 0.1], [0.18, 0.0001]], 0.2);
      break;
    case 'swing':
      // MONZ SLUGGER: バットを振る「ブンッ」
      hiss(ctx, out, t, 'bandpass', [[0, 300], [0.16, 1400]], 1.5, [[0, 0.0001], [0.06, 0.45], [0.2, 0.0001]], 0.22);
      break;
    case 'bat': {
      // MONZ SLUGGER: 芯でとらえた「カキーーン!」。p: 強さ(0.9 ふつう 〜 1.3 ジャストミート)
      const ring = 0.25 + 0.45 * (p - 0.9);
      // 当たった瞬間の「カッ」(鋭いノイズ)と「ドン」(低い音)
      hiss(ctx, out, t, 'highpass', [[0, 3500]], 0.7, [[0, 0.9], [0.025, 0.0001]], 0.03);
      hiss(ctx, out, t, 'bandpass', [[0, 1400]], 2.5, [[0, 0.7], [0.06, 0.0001]], 0.07);
      tone(ctx, out, t, 'sine', [[0, 180], [0.09, 55]], [[0, 0.9], [0.12, 0.0001]], 0.13);
      // 金属バットの「キーン」(かさならない高さの音を重ねる)
      for (const [f, g] of [[1720, 0.32], [2580, 0.2], [4650, 0.12], [6100, 0.06]] as const) {
        tone(ctx, out, t + 0.004, 'sine', [[0, f * (0.98 + 0.04 * (p - 0.9))], [ring, f * 0.985]], [[0, g], [ring, 0.0001]], ring + 0.02);
      }
      // ひびき(少し遅れて小さく)
      if (p > 1.05) for (const d of [0.07, 0.14]) tone(ctx, out, t + d, 'sine', [[0, 1720]], [[0, 0.1 / (d * 14)], [ring * 0.8, 0.0001]], ring);
      break;
    }
    case 'punch': {
      // バトル: パンチが当たった「バシッ」。p: 強さ(1 ふつう)【仮】
      const o = crunch(ctx, out, 2.5);
      hiss(ctx, out, t, 'highpass', [[0, 3200]], 0.8, [[0, 0.75 * p], [0.022, 0.0001]], 0.03);
      hiss(ctx, o, t, 'bandpass', [[0, 1300 * p], [0.07, 700]], 1.1, [[0, 0.7], [0.08, 0.0001]], 0.09);
      tone(ctx, o, t, 'sine', [[0, 190 * p], [0.1, 55]], [[0, 0.9], [0.13, 0.0001]], 0.14);
      break;
    }
    case 'punchHeavy': {
      // バトル: 強いパンチ「ドゴォッ」(低い音を太く + はじける音 + 少し遅れたひびき)
      const o = crunch(ctx, out, 4);
      hiss(ctx, out, t, 'highpass', [[0, 2600]], 0.7, [[0, 0.95], [0.03, 0.0001]], 0.04);
      hiss(ctx, o, t, 'bandpass', [[0, 1000], [0.16, 380]], 0.9, [[0, 0.85], [0.18, 0.0001]], 0.2);
      tone(ctx, o, t, 'sine', [[0, 150 * p], [0.22, 38]], [[0, 1], [0.3, 0.0001]], 0.32);
      tone(ctx, o, t, 'square', [[0, 80 * p], [0.12, 35]], [[0, 0.35], [0.16, 0.0001]], 0.18);
      hiss(ctx, out, t + 0.05, 'lowpass', [[0, 600], [0.3, 200]], 0.7, [[0, 0.35], [0.35, 0.0001]], 0.36);
      break;
    }
    case 'whoosh':
      // バトル: 空を切る「シュッ」。p が大きいほど高く短い
      hiss(ctx, out, t, 'bandpass', [[0, 700 * p], [0.1, 2600 * p]], 2.2, [[0, 0.0001], [0.035, 0.32], [0.13, 0.0001]], 0.14);
      break;
    case 'guard':
      // バトル: ガードで受けた「カンッ」
      tone(ctx, out, t, 'triangle', [[0, 1250], [0.12, 900]], [[0, 0.32], [0.16, 0.0001]], 0.17);
      tone(ctx, out, t, 'sine', [[0, 2600]], [[0, 0.12], [0.08, 0.0001]], 0.09);
      hiss(ctx, out, t, 'highpass', [[0, 4000]], 0.7, [[0, 0.35], [0.025, 0.0001]], 0.03);
      break;
    case 'koBlast': {
      // バトル: ふっとばして アウト「ドカーン」
      const o = crunch(ctx, out, 5);
      tone(ctx, o, t, 'sine', [[0, 120], [0.6, 30]], [[0, 1], [0.8, 0.0001]], 0.85);
      hiss(ctx, o, t, 'lowpass', [[0, 3000], [0.9, 200]], 0.7, [[0, 0.8], [1.0, 0.0001]], 1.05);
      hiss(ctx, out, t, 'highpass', [[0, 5000]], 0.7, [[0, 0.4], [0.4, 0.0001]], 0.42);
      break;
    }
    case 'land':
      // バトル: 着地「トッ」
      tone(ctx, out, t, 'sine', [[0, 140 * p], [0.06, 70]], [[0, 0.35], [0.08, 0.0001]], 0.09);
      hiss(ctx, out, t, 'lowpass', [[0, 900]], 0.7, [[0, 0.18], [0.05, 0.0001]], 0.06);
      break;
    case 'hop':
      // バトル: ジャンプ「ピョン」(軽く)
      tone(ctx, out, t, 'sine', [[0, 300 * p], [0.1, 620 * p]], [[0, 0.0001], [0.015, 0.16], [0.12, 0.0001]], 0.13);
      hiss(ctx, out, t, 'bandpass', [[0, 1500]], 1.5, [[0, 0.08], [0.06, 0.0001]], 0.07);
      break;
    case 'cheer':
      // MONZ SLUGGER: ホームランの歓声(ふくらんで消える ざわめき + 指笛)
      hiss(ctx, out, t, 'bandpass', [[0, 700], [0.6, 1600], [1.8, 900]], 0.6, [[0, 0.0001], [0.35, 0.45], [1.9, 0.0001]], 2.0);
      hiss(ctx, out, t + 0.05, 'bandpass', [[0, 2400], [1.5, 2000]], 1.2, [[0, 0.0001], [0.4, 0.18], [1.7, 0.0001]], 1.8);
      tone(ctx, out, t + 0.25, 'sine', [[0, 1900], [0.18, 2600], [0.4, 2300]], [[0, 0.0001], [0.05, 0.12], [0.45, 0.0001]], 0.5);
      break;
  }
}
