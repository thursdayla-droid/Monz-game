import { beatToSec, midiToHz, type NoteEvent, type Song } from './songs';

/**
 * Plays the score as sound (instruments and mixing). Every instrument is synthesized here; no existing songs or recorded sounds are used.
 * Works with both a live AudioContext and an OfflineAudioContext used to produce test recordings.
 */
type Ctx = BaseAudioContext;

function noiseBuffer(ctx: Ctx, seconds: number, seed: number): AudioBuffer {
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
    let s = 11 + ch * 97;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      // Lower the highs gradually for a warm-sounding reverb
      const x = s / 2147483648 - 1;
      d[i] = (i > 0 ? d[i - 1] * 0.35 : 0) + x * 0.65 * Math.pow(1 - i / len, decay);
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

type Kit = Record<'kick' | 'snare' | 'clap' | 'rim' | 'hat' | 'openhat' | 'shaker' | 'crash' | 'tom' | 'vinyl', AudioBuffer>;
const kits = new WeakMap<Ctx, Kit>();

/**
 * Drums and other percussion sounds. Build them once at the start, and after that just play them back (to keep processing light).
 * Simple filters are computed here as well.
 */
function makeKit(ctx: Ctx): Kit {
  const cached = kits.get(ctx);
  if (cached) return cached;
  const sr = ctx.sampleRate;
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  const make = (sec: number, fn: (t: number, i: number) => number): AudioBuffer => {
    const buf = ctx.createBuffer(1, Math.ceil(sec * sr), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, i);
    return buf;
  };
  // Simple filters (pass high / pass low)
  const hp = (cut: number) => {
    const a = 1 / (1 + (2 * Math.PI * cut) / sr);
    let px = 0;
    let py = 0;
    return (x: number) => (py = a * (py + x - px), (px = x), py);
  };
  const lp = (cut: number) => {
    const a = (2 * Math.PI * cut) / sr / (1 + (2 * Math.PI * cut) / sr);
    let y = 0;
    return (x: number) => (y += a * (x - y));
  };
  const kick = (() => {
    let ph = 0;
    const click = lp(4000);
    return make(0.6, (t) => {
      const f = 44 + 96 * Math.exp(-t / 0.028);
      ph += (2 * Math.PI * f) / sr;
      const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.15);
      return Math.sin(ph) * env * 0.95 + click(rnd()) * Math.exp(-t / 0.003) * 0.4;
    });
  })();
  const snare = (() => {
    let ph = 0;
    const h1 = hp(900);
    const l1 = lp(6500);
    const h2 = hp(5000);
    return make(0.35, (t) => {
      ph += (2 * Math.PI * (170 + 50 * Math.exp(-t / 0.02))) / sr;
      const n = rnd();
      const body = l1(h1(n)) * Math.exp(-t / 0.055) * 0.9;
      const snap = h2(n) * Math.exp(-t / 0.018) * 0.45;
      return Math.asin(Math.sin(ph)) * 0.35 * Math.exp(-t / 0.035) + body + snap;
    });
  })();
  const clap = (() => {
    const h = hp(800);
    const l = lp(3000);
    return make(0.3, (t) => {
      const n = l(h(rnd()));
      const bursts = [0, 0.01, 0.021].reduce((a, d) => a + (t >= d ? Math.exp(-(t - d) / 0.004) : 0), 0);
      return n * (bursts * 0.7 + (t > 0.021 ? Math.exp(-(t - 0.021) / 0.06) * 0.8 : 0));
    });
  })();
  const rim = (() => {
    const h = hp(2000);
    return make(0.08, (t) => Math.sin(2 * Math.PI * 1650 * t) * Math.exp(-t / 0.008) * 0.6 + h(rnd()) * Math.exp(-t / 0.006) * 0.5);
  })();
  const hat = (() => {
    const h = hp(7000);
    const h2 = hp(7000);
    return make(0.08, (t) => h2(h(rnd())) * Math.exp(-t / 0.012) * 0.9);
  })();
  const openhat = (() => {
    const h = hp(6500);
    const h2 = hp(6500);
    return make(0.45, (t) => h2(h(rnd())) * Math.exp(-t / 0.09) * 0.7);
  })();
  const shaker = (() => {
    const h = hp(4500);
    const l = lp(9000);
    return make(0.12, (t) => l(h(rnd())) * Math.min(1, t / 0.008) * Math.exp(-t / 0.025) * 0.7);
  })();
  const crash = (() => {
    const h = hp(5000);
    return make(2.6, (t) => h(rnd()) * Math.exp(-t / 0.75) * 0.5);
  })();
  const tom = (() => {
    let ph = 0;
    return make(1.2, (t) => {
      ph += (2 * Math.PI * (100 + 60 * Math.exp(-t / 0.04))) / sr;
      return Math.sin(ph) * Math.min(1, t / 0.004) * Math.exp(-t / 0.35) * 0.9;
    });
  })();
  const vinyl = (() => {
    const h = hp(2500);
    let next = 0;
    let s2 = 99;
    return make(4, (t) => {
      let v = h(rnd()) * 0.004;
      if (t >= next) {
        s2 = (s2 * 1664525 + 1013904223) >>> 0;
        next = t + 0.12 + (s2 / 4294967296) * 0.7;
        v += 0.35;
      }
      return v;
    });
  })();
  const kit: Kit = { kick, snare, clap, rim, hat, openhat, shaker, crash, tom, vinyl };
  kits.set(ctx, kit);
  return kit;
}

const panner = (ctx: Ctx, pan: number): AudioNode => {
  if (typeof ctx.createStereoPanner !== 'function') return ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
};

/** Mixer for one song (each instrument's volume, reverb, echo) */
export class Band {
  readonly out: GainNode;
  private readonly ep: AudioNode;
  private readonly epR: AudioNode;
  private readonly bass: AudioNode;
  private readonly pad: AudioNode;
  private readonly lead: AudioNode;
  private readonly pluck: AudioNode;
  private readonly bell: AudioNode;
  private readonly drums: AudioNode;
  private readonly hiss: AudioBuffer;
  private readonly kit: Kit;

  constructor(private readonly ctx: Ctx, destination: AudioNode) {
    this.hiss = noiseBuffer(ctx, 2, 9);
    this.kit = makeKit(ctx);
    this.out = ctx.createGain();
    this.out.connect(destination);

    // Mix: gentle compression → warm EQ
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.015;
    comp.release.value = 0.25;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowshelf';
    warm.frequency.value = 180;
    warm.gain.value = 2;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 7000;
    air.gain.value = 1.5;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    comp.connect(warm).connect(air).connect(master).connect(limiter).connect(this.out);

    // Reverb (spacious) and echo (delay, dotted eighth)
    const verb = ctx.createConvolver();
    verb.buffer = reverbImpulse(ctx, 1.8, 2.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    verb.connect(verbOut).connect(comp);
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dLp = ctx.createBiquadFilter();
    dLp.type = 'lowpass';
    dLp.frequency.value = 2500;
    delay.connect(dLp).connect(fb).connect(delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.3;
    dLp.connect(delayOut).connect(comp);
    delayOut.connect(verb);

    const bus = (gain: number, verbSend: number, delaySend = 0, chain: AudioNode[] = []): AudioNode => {
      const input = ctx.createGain();
      let node: AudioNode = input;
      for (const c of chain) node = node.connect(c);
      const g = ctx.createGain();
      g.gain.value = gain;
      node.connect(g).connect(comp);
      if (verbSend) {
        const s = ctx.createGain();
        s.gain.value = verbSend;
        g.connect(s).connect(verb);
      }
      if (delaySend) {
        const s = ctx.createGain();
        s.gain.value = delaySend;
        g.connect(s).connect(delay);
      }
      return input;
    };
    const lp = (f: number, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = 'lowpass';
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };

    // Electric piano: spread slightly left and right (chorus-like), gentle wobble (tremolo)
    const trem = ctx.createGain();
    trem.gain.value = 0.82;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.6;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.18;
    lfo.connect(lfoAmt).connect(trem.gain);
    lfo.start(0);
    this.ep = bus(1.0, 0.45, 0.06, [lp(3400), trem, panner(ctx, -0.25)]);
    this.epR = bus(1.0, 0.45, 0.06, [lp(3400), panner(ctx, 0.25)]);
    // Bass: deep and soft (round with only the lows, saturated just a little)
    this.bass = bus(0.85, 0, 0, [softClip(ctx, 1.4), lp(520)]);
    // Pad: warm analog synth (the filter opens and closes slowly)
    const padLp = lp(900, 1.2);
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.07;
    const padLfoAmt = ctx.createGain();
    padLfoAmt.gain.value = 450;
    padLfo.connect(padLfoAmt).connect(padLp.frequency);
    padLfo.start(0);
    this.pad = bus(0.2, 0.9, 0, [padLp]);
    this.lead = bus(0.24, 0.5, 0.35, [lp(2400, 1.5)]);
    this.pluck = bus(0.16, 0.35, 0.45, [lp(2200, 3), panner(ctx, 0.3)]);
    this.bell = bus(0.2, 0.9, 0.3, [panner(ctx, -0.2)]);
    this.drums = bus(0.8, 0.07, 0, []);
  }

  /** Play one bar of the score starting at time t */
  playBar(song: Song, events: NoteEvent[], t: number): void {
    const spb = 60 / song.bpm;
    let prevLead: NoteEvent | undefined;
    let prevBass: NoteEvent | undefined;
    for (const e of events) {
      const at = t + beatToSec(Math.max(0, e.beat), song.bpm, song.swing);
      const dur = e.len * spb;
      switch (e.inst) {
        case 'ep':
          this.epNote(at, dur, e.pitch, e.vel);
          break;
        case 'bass':
          this.bassNote(at, dur, e.pitch, e.vel, prevBass && Math.abs(prevBass.pitch - e.pitch) <= 2 ? prevBass.pitch : undefined);
          prevBass = e;
          break;
        case 'pad':
          this.padNote(at, dur, e.pitch, e.vel);
          break;
        case 'lead':
          this.leadNote(at, dur, e.pitch, e.vel, prevLead && e.beat - (prevLead.beat + prevLead.len) < 0.3 ? prevLead.pitch : undefined);
          prevLead = e;
          break;
        case 'pluck':
          this.pluckNote(at, dur, e.pitch, e.vel);
          break;
        case 'bell':
          this.bellNote(at, dur, e.pitch, e.vel);
          break;
        case 'riser':
          this.riser(at, dur, e.vel);
          break;
        case 'vinyl':
          this.vinyl(at, dur, e.vel);
          break;
        default:
          this.drum(e, at, dur);
      }
    }
  }

  private epNote(t: number, dur: number, pitch: number, vel: number): void {
    const ctx = this.ctx;
    const f = midiToHz(pitch);
    const end = t + dur + 0.7;
    // Alternate notes between left and right for a sense of width
    const out = pitch % 2 ? this.ep : this.epR;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const mg = ctx.createGain();
    // The bright attack at the start of the note (the bell-like core of the tine) → softens right away
    mg.gain.setValueAtTime(f * (0.8 + vel * 1.8), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.07, t + 0.45);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.5);
    g.gain.setTargetAtTime(peak * 0.25, t + 0.5, 1.2);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.2);
    car.connect(g).connect(out);
    for (const o of [car, mod]) {
      o.start(t);
      o.stop(end);
    }
  }

  private bassNote(t: number, dur: number, pitch: number, vel: number, from?: number): void {
    const ctx = this.ctx;
    const f = midiToHz(pitch);
    const end = t + dur + 0.4;
    const g = ctx.createGain();
    const peak = 0.55 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.setTargetAtTime(peak * 0.75, t + 0.05, 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.07);
    g.connect(this.bass);
    const glide = (o: OscillatorNode, mul: number) => {
      if (from) {
        o.frequency.setValueAtTime(midiToHz(from) * mul, t);
        o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.08);
      } else o.frequency.setValueAtTime(f * mul, t);
    };
    const sub = ctx.createOscillator();
    glide(sub, 1);
    sub.connect(g);
    // Add overtones just a touch (so the bass stays audible on an iPhone speaker)
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    glide(tri, 2);
    const tg = ctx.createGain();
    tg.gain.value = 0.22;
    tri.connect(tg).connect(g);
    for (const o of [sub, tri]) {
      o.start(t);
      o.stop(end);
    }
  }

  private padNote(t: number, dur: number, pitch: number, vel: number): void {
    const ctx = this.ctx;
    const f = midiToHz(pitch);
    const g = ctx.createGain();
    const peak = 0.085 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(1.5, dur * 0.4));
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.1);
    g.connect(this.pad);
    for (const det of [-8, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 1.2);
    }
  }

  /** Lead melody: a warm analog-synth sound (triangle + a little square), sliding between notes */
  private leadNote(t: number, dur: number, pitch: number, vel: number, from?: number): void {
    const ctx = this.ctx;
    const f = midiToHz(pitch);
    const g = ctx.createGain();
    const peak = 0.3 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.setTargetAtTime(peak * 0.75, t + 0.06, 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
    g.connect(this.lead);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const va = ctx.createGain();
    va.gain.setValueAtTime(0, t);
    va.gain.linearRampToValueAtTime(f * 0.007, t + 0.35);
    vib.connect(va);
    const mk = (type: OscillatorType, level: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      if (from) {
        o.frequency.setValueAtTime(midiToHz(from), t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
      } else o.frequency.setValueAtTime(f, t);
      va.connect(o.frequency);
      const lg = ctx.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(g);
      return o;
    };
    const oscs = [mk('triangle', 1), mk('square', 0.12), vib];
    for (const o of oscs) {
      o.start(t);
      o.stop(t + dur + 0.6);
    }
  }

  /** Analog-synth arpeggio (short, plucked sound) */
  private pluckNote(t: number, dur: number, pitch: number, vel: number): void {
    const ctx = this.ctx;
    const f = midiToHz(pitch);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 4;
    lpf.frequency.setValueAtTime(f * 8, t);
    lpf.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.2, dur) + 0.15);
    o.connect(lpf).connect(g).connect(this.pluck);
    o.start(t);
    o.stop(t + dur + 0.4);
  }

  private bellNote(t: number, dur: number, pitch: number, vel: number): void {
    const ctx = this.ctx;
    const f = midiToHz(pitch);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.6, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + Math.max(0.4, dur));
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
    car.connect(g).connect(this.bell);
    for (const o of [car, mod]) {
      o.start(t);
      o.stop(t + dur + 1.5);
    }
  }

  /** Play a prepared percussion sound (rate = playback speed, which also changes the pitch) */
  private hit(buf: AudioBuffer, t: number, gain: number, rate = 1, out: AudioNode = this.drums, length?: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.start(t);
    if (length) src.stop(t + length);
  }

  private drum(e: NoteEvent, t: number, dur: number): void {
    const k = this.kit;
    const v = e.vel;
    switch (e.inst) {
      case 'kick':
        this.hit(k.kick, t, 1.05 * v);
        break;
      case 'snare':
        this.hit(k.snare, t, 0.75 * v);
        break;
      case 'clap':
        this.hit(k.clap, t, 0.6 * v);
        break;
      case 'rim':
        this.hit(k.rim, t, 0.55 * v);
        break;
      case 'hat':
        this.hit(k.hat, t, 0.38 * v, 1 + ((t * 13.7) % 1) * 0.06);
        break;
      case 'openhat':
        this.hit(k.openhat, t, 0.3 * v);
        break;
      case 'shaker':
        this.hit(k.shaker, t, 0.3 * v);
        break;
      case 'crash':
        this.hit(k.crash, t, 0.28 * v);
        break;
      case 'tom':
        this.hit(k.tom, t, 0.85 * v, midiToHz(e.pitch) / 100, this.drums, Math.max(0.6, dur) + 0.5);
        break;
    }
  }

  /** Builds toward the next section (noise swelling upward) */
  private riser(t: number, dur: number, vel: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.hiss;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + dur * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    src.connect(f).connect(g).connect(this.pad);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** Faint record crackle (just loop a prepared sound) */
  private vinyl(t: number, dur: number, amount: number): void {
    this.hit(this.kit.vinyl, t, 0.12 * amount, 1, this.drums, dur);
  }
}
