import { beatToSec, loopSeconds, midiToHz, type DrumHit, type Note, type Score } from './score';

/**
 * 楽譜をまとめて音にする(OfflineAudioContext で先に作っておき、ループ再生する)。
 * 楽器はすべてここで合成する(録音した音や既存の曲は使わない)。
 */

const SAMPLE_RATE = 32000;
const TAIL_SEC = 3;

type Ctx = BaseAudioContext;

function noiseBuffer(ctx: Ctx, seconds: number, seed = 1): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = s / 2147483648 - 1;
  }
  return buf;
}

function reverbImpulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = 7 + ch * 99;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 2147483648 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function softClip(ctx: Ctx, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  ws.curve = curve;
  return ws;
}

interface Buses {
  ep: AudioNode;
  bass: AudioNode;
  pad: AudioNode;
  lead: AudioNode;
  bell: AudioNode;
  drums: AudioNode;
  noise: AudioBuffer;
}

function buildBuses(ctx: Ctx, out: AudioNode): Buses {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  comp.connect(master).connect(out);

  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(ctx, 2.2, 3);
  const verbGain = ctx.createGain();
  verbGain.gain.value = 0.32;
  verb.connect(verbGain).connect(comp);
  const send = (node: AudioNode, amount: number) => {
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(verb);
  };

  // エレピ: やわらかく、ゆっくり揺れる(トレモロ)
  const epIn = ctx.createGain();
  const epLp = ctx.createBiquadFilter();
  epLp.type = 'lowpass';
  epLp.frequency.value = 3200;
  const trem = ctx.createGain();
  trem.gain.value = 0.85;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.2;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 0.15;
  lfo.connect(lfoAmt).connect(trem.gain);
  lfo.start(0);
  const epOut = ctx.createGain();
  epOut.gain.value = 0.42;
  epIn.connect(epLp).connect(trem).connect(epOut).connect(comp);
  send(epOut, 0.6);

  // ベース: 太く丸い(低い音だけ通し、少しだけ歪ませる)
  const bassIn = ctx.createGain();
  const bassLp = ctx.createBiquadFilter();
  bassLp.type = 'lowpass';
  bassLp.frequency.value = 420;
  bassLp.Q.value = 0.8;
  const bassOut = ctx.createGain();
  bassOut.gain.value = 0.62;
  bassIn.connect(softClip(ctx, 1.8)).connect(bassLp).connect(bassOut).connect(comp);

  const padIn = ctx.createGain();
  const padLp = ctx.createBiquadFilter();
  padLp.type = 'lowpass';
  padLp.frequency.value = 1100;
  const padOut = ctx.createGain();
  padOut.gain.value = 0.22;
  padIn.connect(padLp).connect(padOut).connect(comp);
  send(padOut, 1.2);

  const leadIn = ctx.createGain();
  const leadLp = ctx.createBiquadFilter();
  leadLp.type = 'lowpass';
  leadLp.frequency.value = 2000;
  leadLp.Q.value = 2;
  const leadOut = ctx.createGain();
  leadOut.gain.value = 0.16;
  leadIn.connect(leadLp).connect(leadOut).connect(comp);
  send(leadOut, 0.9);

  const bellOut = ctx.createGain();
  bellOut.gain.value = 0.2;
  bellOut.connect(comp);
  send(bellOut, 1.4);

  const drumOut = ctx.createGain();
  drumOut.gain.value = 0.8;
  drumOut.connect(comp);
  send(drumOut, 0.08);

  return { ep: epIn, bass: bassIn, pad: padIn, lead: leadIn, bell: bellOut, drums: drumOut, noise: noiseBuffer(ctx, 1.5, 3) };
}

/** エレピ(FMで鐘のような芯を作り、すぐ丸くなる音) */
function epNote(ctx: Ctx, out: AudioNode, t: number, dur: number, pitch: number, vel: number): void {
  const f = midiToHz(pitch);
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * 1;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(f * 1.6 * vel, t);
  modGain.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
  mod.connect(modGain).connect(car.frequency);
  const tine = ctx.createOscillator();
  tine.frequency.value = f * 4;
  const tineGain = ctx.createGain();
  tineGain.gain.setValueAtTime(0.06 * vel, t);
  tineGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  const g = ctx.createGain();
  const peak = 0.22 * vel;
  const end = t + dur + 0.6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(peak * 0.5, t + 0.4);
  g.gain.setTargetAtTime(peak * 0.35, t + 0.4, 0.8);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.18);
  car.connect(g);
  tine.connect(tineGain).connect(g);
  g.connect(out);
  for (const o of [car, mod, tine]) {
    o.start(t);
    o.stop(end);
  }
}

function bassNote(ctx: Ctx, out: AudioNode, t: number, dur: number, pitch: number, vel: number, from?: number): void {
  const f = midiToHz(pitch);
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  for (const o of [o1, o2]) {
    if (from) {
      o.frequency.setValueAtTime(midiToHz(from), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    } else o.frequency.setValueAtTime(f, t);
  }
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  const g = ctx.createGain();
  const peak = 0.55 * vel;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.setTargetAtTime(peak * 0.7, t + 0.05, 0.25);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
  o1.connect(g);
  o2.connect(g2).connect(g);
  g.connect(out);
  for (const o of [o1, o2]) {
    o.start(t);
    o.stop(t + dur + 0.4);
  }
}

function padNote(ctx: Ctx, out: AudioNode, t: number, dur: number, pitch: number, vel: number): void {
  const f = midiToHz(pitch);
  const g = ctx.createGain();
  const peak = 0.12 * vel;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(1.2, dur * 0.4));
  g.gain.setValueAtTime(peak, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.4);
  g.connect(out);
  for (const det of [-7, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 1.5);
  }
}

/** レトロなシンセ(矩形波、少しビブラート) */
function leadNote(ctx: Ctx, out: AudioNode, t: number, dur: number, pitch: number, vel: number): void {
  const f = midiToHz(pitch);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = f;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibAmt = ctx.createGain();
  vibAmt.gain.setValueAtTime(0, t);
  vibAmt.gain.linearRampToValueAtTime(f * 0.006, t + 0.3);
  vib.connect(vibAmt).connect(o.frequency);
  const g = ctx.createGain();
  const peak = 0.3 * vel;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.setTargetAtTime(peak * 0.6, t + 0.05, 0.2);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
  o.connect(g).connect(out);
  for (const x of [o, vib]) {
    x.start(t);
    x.stop(t + dur + 0.5);
  }
}

function bellNote(ctx: Ctx, out: AudioNode, t: number, dur: number, pitch: number, vel: number): void {
  const f = midiToHz(pitch);
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * 3.5;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 2, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.1, t + dur);
  mod.connect(mg).connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25 * vel, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1);
  car.connect(g).connect(out);
  for (const o of [car, mod]) {
    o.start(t);
    o.stop(t + dur + 1.1);
  }
}

function noiseHit(ctx: Ctx, b: Buses, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, offset = 0): void {
  const src = ctx.createBufferSource();
  src.buffer = b.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(b.drums);
  src.start(t, offset % 1);
  src.stop(t + dur + 0.02);
}

function drum(ctx: Ctx, b: Buses, t: number, hit: DrumHit, i: number): void {
  const v = hit.vel;
  switch (hit.kind) {
    case 'kick': {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g).connect(b.drums);
      o.start(t);
      o.stop(t + 0.45);
      noiseHit(ctx, b, t, 0.012, 'lowpass', 2500, 0.7, 0.25 * v, i * 0.013);
      break;
    }
    case 'snare': {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(210, t);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(b.drums);
      o.start(t);
      o.stop(t + 0.14);
      noiseHit(ctx, b, t, 0.2, 'bandpass', 1900, 0.6, 0.55 * v, i * 0.031);
      break;
    }
    case 'clap':
      for (const d of [0, 0.011, 0.022]) noiseHit(ctx, b, t + d, d === 0.022 ? 0.16 : 0.02, 'bandpass', 1300, 1.2, 0.35 * v, i * 0.017 + d);
      break;
    case 'rim': {
      const o = ctx.createOscillator();
      o.frequency.value = 1750;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      o.connect(g).connect(b.drums);
      o.start(t);
      o.stop(t + 0.05);
      noiseHit(ctx, b, t, 0.03, 'bandpass', 3200, 2, 0.3 * v, i * 0.007);
      break;
    }
    case 'hat':
      noiseHit(ctx, b, t, 0.045, 'highpass', 7200, 0.7, 0.2 * v, i * 0.019);
      break;
    case 'openhat':
      noiseHit(ctx, b, t, 0.22, 'highpass', 6800, 0.7, 0.16 * v, i * 0.023);
      break;
    case 'shaker':
      noiseHit(ctx, b, t, 0.06, 'bandpass', 5200, 1.5, 0.12 * v, i * 0.029);
      break;
  }
}

/** 風の音(ゆっくり音色が動くノイズ) */
function wind(ctx: Ctx, out: AudioNode, b: Buses, seconds: number, amount: number): void {
  const src = ctx.createBufferSource();
  src.buffer = b.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(500, 0);
  for (let t = 0; t < seconds; t += 4) f.frequency.linearRampToValueAtTime(t % 8 === 0 ? 900 : 380, t + 4);
  const g = ctx.createGain();
  g.gain.value = 0.06 * amount;
  src.connect(f).connect(g).connect(out);
  src.start(0);
  src.stop(seconds);
}

/** レコードのかすかなノイズ(プチッという音を少しだけ) */
function vinyl(ctx: Ctx, b: Buses, seconds: number, amount: number): void {
  let s = 99;
  for (let t = 0.05; t < seconds; ) {
    s = (s * 1664525 + 1013904223) >>> 0;
    t += 0.15 + (s / 4294967296) * 0.9;
    noiseHit(ctx, b, t, 0.004, 'highpass', 3000, 0.5, 0.05 * amount, (s % 1000) / 1000);
  }
}

/** 拍 → 秒。ゆらしで 0 秒より前になった音は、ループの最後に回す(頭につながる) */
function timeOf(beat: number, score: Score): number {
  const t = beatToSec(beat, score.bpm, score.swing);
  return t < 0 ? t + loopSeconds(score) : t;
}

function play(notes: Note[], score: Score, fn: (t: number, dur: number, n: Note, prev?: Note) => void): void {
  const spb = 60 / score.bpm;
  notes.forEach((n, i) => fn(timeOf(n.beat, score), n.len * spb, n, notes[i - 1]));
}

/** 楽譜を音にして、ループしてもつなぎ目が出ないバッファを返す */
export async function renderScore(score: Score): Promise<AudioBuffer> {
  const loop = loopSeconds(score);
  const total = loop + TAIL_SEC;
  const OAC = (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  const ctx = new OAC(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  const b = buildBuses(ctx, ctx.destination);
  play(score.ep, score, (t, d, n) => epNote(ctx, b.ep, t, d, n.pitch, n.vel));
  play(score.bass, score, (t, d, n, prev) => bassNote(ctx, b.bass, t, d, n.pitch, n.vel, prev && Math.abs(prev.pitch - n.pitch) <= 2 ? prev.pitch : undefined));
  play(score.pad, score, (t, d, n) => padNote(ctx, b.pad, t, d, n.pitch, n.vel));
  play(score.lead, score, (t, d, n) => leadNote(ctx, b.lead, t, d, n.pitch, n.vel));
  play(score.bell, score, (t, d, n) => bellNote(ctx, b.bell, t, d, n.pitch, n.vel));
  score.drums.forEach((h, i) => drum(ctx, b, timeOf(h.beat, score), h, i));
  if (score.wind > 0) wind(ctx, b.bell, b, loop, score.wind);
  if (score.vinyl > 0) vinyl(ctx, b, loop, score.vinyl);
  const rendered = await ctx.startRendering();

  // ループの長さに切りそろえ、はみ出した余韻を頭に重ねる(つなぎ目で音が途切れないように)
  const len = Math.round(loop * SAMPLE_RATE);
  const out = ctx.createBuffer(2, len, SAMPLE_RATE);
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, len));
    for (let i = len; i < src.length; i++) dst[i - len] += src[i];
    // 念のため大きすぎる音をおさえる
    for (let i = 0; i < len; i++) dst[i] = Math.tanh(dst[i] * 1.05) / 1.05;
  }
  return out;
}
