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
  | 'hop'
  | 'mcSlash'
  | 'mcSpecial'
  | 'mcMagic'
  | 'mcHit'
  | 'mcThunder'
  | 'mcFire'
  | 'mcWater'
  | 'mcNature'
  | 'mcLight'
  | 'mcDark'
  | 'mcCounter'
  | 'mcCutin'
  | 'mcGuardOk'
  | 'mcPoison'
  | 'mcHeal'
  | 'mcDrain'
  | 'mcMagicGuardOk'
  | 'mcBuff'
  | 'mcBurn'
  | 'mcSelect';

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

/**
 * ひびき(大きな部屋で鳴らしたような残り音)。重い音に少しまぜて、重厚感を出す(企画者 2026-10-26: 重厚感のある効果音)。
 * 消えていくノイズで作る(音のファイルは使わない)
 */
/** 出口(効果音の音量)ごとに1つのひびき。いくつ鳴らしても、ひびきの強さは同じ */
const reverbs = new WeakMap<AudioNode, ConvolverNode>();
function reverb(ctx: AudioContext, out: AudioNode, wet: number): AudioNode {
  let conv = reverbs.get(out);
  if (!conv) {
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    conv = ctx.createConvolver();
    conv.buffer = ir;
    conv.connect(out);
    reverbs.set(out, conv);
  }
  const g = ctx.createGain();
  g.gain.value = wet;
  g.connect(conv);
  return g;
}

/** 重い音: そのままの音と、ひびきの両方へ */
function heavy(ctx: AudioContext, out: AudioNode, wet = 0.45, amount = 5): AudioNode {
  const both = ctx.createGain();
  both.connect(crunch(ctx, out, amount));
  both.connect(reverb(ctx, out, wet));
  return both;
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
    case 'mcSlash': {
      // MYTHCLASH 通常攻撃: 空を切る「ヒュッ」→ 刃の「シャキン」→ 当たる「ズドッ」(企画者 2026-10-26: 攻撃音をもっと強く)
      hiss(ctx, out, t, 'bandpass', [[0, 600], [0.1, 4200]], 1.6, [[0, 0.0001], [0.05, 0.5], [0.12, 0.0001]], 0.13);
      tone(ctx, out, t + 0.07, 'triangle', [[0, 2600], [0.25, 1900]], [[0, 0.3], [0.3, 0.0001]], 0.32);
      tone(ctx, out, t + 0.07, 'sine', [[0, 3900], [0.2, 3500]], [[0, 0.12], [0.2, 0.0001]], 0.22);
      const o = heavy(ctx, out, 0.35, 4);
      hiss(ctx, out, t + 0.09, 'highpass', [[0, 3000]], 0.7, [[0, 0.8], [0.03, 0.0001]], 0.04);
      hiss(ctx, o, t + 0.09, 'bandpass', [[0, 1500], [0.15, 450]], 1, [[0, 0.8], [0.17, 0.0001]], 0.18);
      tone(ctx, o, t + 0.09, 'sine', [[0, 170], [0.22, 42]], [[0, 1], [0.28, 0.0001]], 0.3);
      break;
    }
    case 'mcSpecial': {
      // MYTHCLASH 必殺技: ためる「ギュイーン」→ 大きな「ドゴォォン」+ ひびき
      tone(ctx, out, t, 'sawtooth', [[0, 180], [0.26, 950]], [[0, 0.0001], [0.24, 0.22], [0.28, 0.0001]], 0.3);
      hiss(ctx, out, t, 'bandpass', [[0, 400], [0.26, 3000]], 2, [[0, 0.0001], [0.24, 0.35], [0.28, 0.0001]], 0.3);
      const b = t + 0.28;
      const o = heavy(ctx, out, 0.6, 6);
      tone(ctx, o, b, 'sine', [[0, 55], [1.2, 24]], [[0, 0.9], [1.4, 0.0001]], 1.45);
      hiss(ctx, out, b, 'highpass', [[0, 2500]], 0.7, [[0, 1], [0.05, 0.0001]], 0.06);
      tone(ctx, o, b, 'sine', [[0, 120], [0.55, 26]], [[0, 1], [0.7, 0.0001]], 0.72);
      tone(ctx, o, b, 'square', [[0, 75], [0.3, 30]], [[0, 0.45], [0.35, 0.0001]], 0.36);
      hiss(ctx, o, b, 'lowpass', [[0, 3200], [0.8, 160]], 0.7, [[0, 0.9], [0.9, 0.0001]], 0.92);
      hiss(ctx, out, b + 0.08, 'bandpass', [[0, 900], [0.9, 300]], 0.6, [[0, 0.3], [1.0, 0.0001]], 1.02);
      break;
    }
    case 'mcMagic': {
      // MYTHCLASH 魔法: きらめく音が駆けあがって →「ブワァン」
      [880, 1320, 1760, 2640].forEach((f, i) => tone(ctx, out, t + i * 0.035, 'sine', [[0, f], [0.25, f * 1.02]], [[0, 0.2], [0.28, 0.0001]], 0.3));
      hiss(ctx, out, t, 'bandpass', [[0, 3200], [0.25, 900]], 3, [[0, 0.0001], [0.08, 0.3], [0.3, 0.0001]], 0.32);
      const b = t + 0.2;
      const o = crunch(ctx, out, 3.5);
      tone(ctx, o, b, 'sine', [[0, 320], [0.35, 70]], [[0, 0.95], [0.45, 0.0001]], 0.47);
      tone(ctx, o, b, 'triangle', [[0, 480], [0.35, 110]], [[0, 0.4], [0.4, 0.0001]], 0.42);
      hiss(ctx, o, b, 'lowpass', [[0, 2400], [0.5, 300]], 0.8, [[0, 0.6], [0.55, 0.0001]], 0.57);
      break;
    }
    case 'mcHit': {
      // MYTHCLASH ダメージが入った「ドスッ」。p: 強さ(ダメージが大きいほど低く・長く)
      const o = heavy(ctx, out, 0.3, 5);
      hiss(ctx, out, t, 'highpass', [[0, 2800]], 0.7, [[0, 0.85], [0.03, 0.0001]], 0.04);
      hiss(ctx, o, t, 'bandpass', [[0, 950], [0.2 * p, 280]], 0.9, [[0, 0.9], [0.22 * p, 0.0001]], 0.24 * p);
      tone(ctx, o, t, 'sine', [[0, 150 / p], [0.28 * p, 36]], [[0, 1], [0.34 * p, 0.0001]], 0.36 * p);
      tone(ctx, o, t, 'square', [[0, 62], [0.14, 30]], [[0, 0.4], [0.18, 0.0001]], 0.2);
      break;
    }
    case 'mcThunder': {
      // 雷の魔法: 「バリバリッ」→ 落ちる「ドガァン」→ ゴロゴロ
      hiss(ctx, out, t, 'highpass', [[0, 5000], [0.18, 1500]], 0.9, [[0, 0.0001], [0.02, 0.9], [0.06, 0.3], [0.08, 0.8], [0.2, 0.0001]], 0.22);
      const o = heavy(ctx, out, 0.7, 7);
      hiss(ctx, o, t + 0.12, 'lowpass', [[0, 5000], [0.6, 250]], 0.7, [[0, 1], [0.7, 0.0001]], 0.72);
      tone(ctx, o, t + 0.12, 'sine', [[0, 90], [0.8, 28]], [[0, 1], [1.0, 0.0001]], 1.02);
      hiss(ctx, o, t + 0.5, 'lowpass', [[0, 300], [1.6, 90]], 0.6, [[0, 0.0001], [0.3, 0.55], [1.7, 0.0001]], 1.8);
      break;
    }
    case 'mcFire': {
      // 炎の魔法: 「ゴォォッ」と燃え上がる + 爆ぜる
      hiss(ctx, out, t, 'bandpass', [[0, 300], [0.5, 1400]], 0.7, [[0, 0.0001], [0.15, 0.8], [0.8, 0.0001]], 0.82);
      const o = heavy(ctx, out, 0.5, 5);
      tone(ctx, o, t + 0.1, 'sawtooth', [[0, 70], [0.6, 40]], [[0, 0.5], [0.7, 0.0001]], 0.72);
      tone(ctx, o, t + 0.12, 'sine', [[0, 140], [0.5, 40]], [[0, 0.9], [0.6, 0.0001]], 0.62);
      for (let i = 0; i < 6; i++) hiss(ctx, out, t + 0.15 + i * 0.07, 'highpass', [[0, 2500]], 1, [[0, 0.35], [0.03, 0.0001]], 0.04);
      break;
    }
    case 'mcWater': {
      // 水の魔法: 「ザバァン」と打ちつける波 + しぶき
      hiss(ctx, out, t, 'lowpass', [[0, 600], [0.25, 3000], [0.8, 500]], 0.8, [[0, 0.0001], [0.2, 0.9], [0.85, 0.0001]], 0.9);
      const o = heavy(ctx, out, 0.55, 4);
      tone(ctx, o, t + 0.18, 'sine', [[0, 130], [0.5, 45]], [[0, 0.9], [0.6, 0.0001]], 0.62);
      for (let i = 0; i < 5; i++) tone(ctx, out, t + 0.25 + i * 0.06, 'sine', [[0, 900 + i * 230], [0.06, 400]], [[0, 0.12], [0.08, 0.0001]], 0.09);
      break;
    }
    case 'mcNature': {
      // 自然の魔法: 葉がざわめく「ザワザワ」→ 根が打ちつける「ドンッ」
      hiss(ctx, out, t, 'bandpass', [[0, 2500], [0.4, 4000]], 1.2, [[0, 0.0001], [0.1, 0.4], [0.2, 0.15], [0.3, 0.4], [0.45, 0.0001]], 0.5);
      const o = heavy(ctx, out, 0.5, 5);
      tone(ctx, o, t + 0.35, 'sine', [[0, 110], [0.4, 38]], [[0, 1], [0.5, 0.0001]], 0.52);
      hiss(ctx, o, t + 0.35, 'lowpass', [[0, 1500], [0.4, 200]], 0.7, [[0, 0.6], [0.45, 0.0001]], 0.47);
      break;
    }
    case 'mcLight': {
      // 光の魔法: 天からの和音「ファーン」→ まぶしい「ドォン」
      [523, 659, 784, 1047].forEach((f) => tone(ctx, reverb(ctx, out, 0.8), t, 'triangle', [[0, f], [0.6, f]], [[0, 0.0001], [0.15, 0.12], [0.7, 0.0001]], 0.72));
      hiss(ctx, out, t, 'highpass', [[0, 6000]], 0.7, [[0, 0.0001], [0.3, 0.25], [0.5, 0.0001]], 0.52);
      const o = heavy(ctx, out, 0.6, 4);
      tone(ctx, o, t + 0.4, 'sine', [[0, 200], [0.5, 50]], [[0, 0.9], [0.6, 0.0001]], 0.62);
      break;
    }
    case 'mcDark': {
      // 闇の魔法: 低い「ブゥゥン」とうず巻く音 → 「ズゥン」
      const o = heavy(ctx, out, 0.7, 6);
      tone(ctx, o, t, 'sawtooth', [[0, 55], [0.5, 40]], [[0, 0.0001], [0.3, 0.45], [0.55, 0.0001]], 0.57);
      hiss(ctx, out, t, 'bandpass', [[0, 300], [0.45, 900]], 4, [[0, 0.0001], [0.3, 0.4], [0.5, 0.0001]], 0.52);
      tone(ctx, o, t + 0.45, 'sine', [[0, 85], [0.9, 25]], [[0, 1], [1.1, 0.0001]], 1.12);
      break;
    }
    case 'mcCounter': {
      // カウンター: 金属の「ガキィン」→ はね返す「シュバッ」→「ドゴォン」
      const r = reverb(ctx, out, 0.6);
      tone(ctx, r, t, 'triangle', [[0, 1800], [0.4, 1500]], [[0, 0.45], [0.5, 0.0001]], 0.52);
      tone(ctx, out, t, 'square', [[0, 2700], [0.1, 2400]], [[0, 0.18], [0.12, 0.0001]], 0.13);
      hiss(ctx, out, t, 'highpass', [[0, 3500]], 0.7, [[0, 0.9], [0.04, 0.0001]], 0.05);
      hiss(ctx, out, t + 0.18, 'bandpass', [[0, 3500], [0.15, 600]], 1.6, [[0, 0.0001], [0.05, 0.5], [0.16, 0.0001]], 0.17);
      const o = heavy(ctx, out, 0.5, 6);
      tone(ctx, o, t + 0.32, 'sine', [[0, 140], [0.5, 32]], [[0, 1], [0.6, 0.0001]], 0.62);
      hiss(ctx, o, t + 0.32, 'lowpass', [[0, 2500], [0.5, 200]], 0.7, [[0, 0.8], [0.55, 0.0001]], 0.57);
      break;
    }
    case 'mcCutin': {
      // 必殺技のカットイン: 「ジャキーン」と鋭い光 + 低いうなり
      tone(ctx, reverb(ctx, out, 0.7), t, 'sawtooth', [[0, 1200], [0.3, 2400]], [[0, 0.0001], [0.05, 0.18], [0.35, 0.0001]], 0.37);
      hiss(ctx, out, t, 'bandpass', [[0, 1500], [0.3, 6000]], 2, [[0, 0.0001], [0.08, 0.45], [0.32, 0.0001]], 0.34);
      tone(ctx, heavy(ctx, out, 0.5, 4), t, 'sine', [[0, 60], [0.5, 45]], [[0, 0.0001], [0.1, 0.7], [0.6, 0.0001]], 0.62);
      break;
    }
    // ---- ここから下の3つは、ファイルが読み込めなかったときの仮の音(本番は seFiles.ts のファイル) ----
    case 'mcGuardOk':
      // 防御成功【仮】: 盾で受ける金属音
      tone(ctx, reverb(ctx, out, 0.5), t, 'triangle', [[0, 1400], [0.3, 1100]], [[0, 0.4], [0.35, 0.0001]], 0.37);
      tone(ctx, heavy(ctx, out, 0.3, 4), t, 'sine', [[0, 120], [0.2, 50]], [[0, 0.7], [0.25, 0.0001]], 0.27);
      break;
    case 'mcPoison':
      // 毒【仮】: ぶくぶく
      for (let i = 0; i < 5; i++) tone(ctx, out, t + i * 0.08, 'sine', [[0, 300 + i * 40], [0.07, 520 + i * 40]], [[0, 0.2], [0.08, 0.0001]], 0.09);
      break;
    case 'mcDrain':
      // HP吸収【仮】: 吸いこむ音
      hiss(ctx, out, t, 'bandpass', [[0, 3000], [0.4, 400]], 3, [[0, 0.0001], [0.2, 0.35], [0.45, 0.0001]], 0.47);
      break;
    case 'mcMagicGuardOk':
      // 魔法防御成功【仮】: 光の壁ではじく音
      tone(ctx, reverb(ctx, out, 0.6), t, 'sine', [[0, 1600], [0.4, 1200]], [[0, 0.3], [0.45, 0.0001]], 0.47);
      break;
    case 'mcBuff':
      // ステータス上昇【仮】: 上がっていく音
      tone(ctx, out, t, 'triangle', [[0, 400], [0.35, 1200]], [[0, 0.25], [0.4, 0.0001]], 0.42);
      break;
    case 'mcSelect':
      // 行動を選んだ【仮】: カチッ
      tone(ctx, out, t, 'square', [[0, 900], [0.05, 600]], [[0, 0.2], [0.07, 0.0001]], 0.08);
      break;
    case 'mcBurn':
      // 火傷【仮】: ぼっと燃える音
      hiss(ctx, out, t, 'bandpass', [[0, 500], [0.3, 1500]], 0.8, [[0, 0.0001], [0.08, 0.5], [0.4, 0.0001]], 0.42);
      break;
    case 'mcHeal':
      // 回復【仮】: きらきら上がる音
      [660, 880, 1100, 1320].forEach((f, i) => tone(ctx, reverb(ctx, out, 0.5), t + i * 0.06, 'sine', [[0, f]], [[0, 0.18], [0.3, 0.0001]], 0.32));
      break;
    case 'cheer':
      // MONZ SLUGGER: ホームランの歓声(ふくらんで消える ざわめき + 指笛)
      hiss(ctx, out, t, 'bandpass', [[0, 700], [0.6, 1600], [1.8, 900]], 0.6, [[0, 0.0001], [0.35, 0.45], [1.9, 0.0001]], 2.0);
      hiss(ctx, out, t + 0.05, 'bandpass', [[0, 2400], [1.5, 2000]], 1.2, [[0, 0.0001], [0.4, 0.18], [1.7, 0.0001]], 1.8);
      tone(ctx, out, t + 0.25, 'sine', [[0, 1900], [0.18, 2600], [0.4, 2300]], [[0, 0.0001], [0.05, 0.12], [0.45, 0.0001]], 0.5);
      break;
  }
}
