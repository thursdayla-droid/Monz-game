/**
 * MONZのBGM(楽譜と編曲)。音を鳴らす部分には依存しない(テストできるように分けてある)。
 *
 * 方向性: 西海岸の夕暮れを流すような、チルなヒップホップのインスト(歌・ラップなし)。
 * 温かいアナログシンセ、メローなエレピ、深くてやわらかいベース、クリーンでパンチのあるドラム。
 * 既存の曲やメロディは使わず、和音・リズム・メロディはすべてここで書いたオリジナル。
 *
 * 曲は「イントロ → A → B → ブレイク → … → アウトロ」の構成で、最後まで行くと最初に戻る。
 * 同じ部分でも、くり返すたびにドラム・エレピ・ベースの細かい形が少しずつ変わる(飽きにくくするため)。
 * 【仮】企画者が聴いて調整する。
 */

export type SongName = 'title' | 'question' | 'dragon' | 'hatch' | 'home';

export type Inst =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'rim'
  | 'hat'
  | 'openhat'
  | 'shaker'
  | 'crash'
  | 'riser'
  | 'tom'
  | 'ep'
  | 'bass'
  | 'pad'
  | 'lead'
  | 'pluck'
  | 'bell'
  | 'vinyl';

/** 1小節の中の音。beat は小節の頭からの拍(0〜4)、len は拍の長さ */
export interface NoteEvent {
  inst: Inst;
  beat: number;
  len: number;
  pitch: number;
  vel: number;
}

interface Chord {
  /** エレピ・パッド用の和音(MIDI番号、60 = 真ん中のド) */
  v: number[];
  /** ベースの根音 */
  root: number;
  /** ベースの5度 */
  fifth: number;
}

/** 小節の中の和音の切りかわり(beat 0 と 2 など) */
type Slot = { beat: number; c: Chord };

/** メロディ1小節分: [拍, 長さ, 音, 強さ?] */
type Phrase = [number, number, number, number?][];

type Drums = 'none' | 'soft' | 'half' | 'full' | 'toms';
type Bass = 'none' | 'soft' | 'groove' | 'drone';
type Keys = 'none' | 'comp' | 'sustain';

interface Section {
  name: string;
  bars: number;
  /** 小節ごとの和音(足りなければくり返す) */
  prog: Slot[][];
  drums: Drums;
  bass: Bass;
  keys: Keys;
  pad?: number;
  lead?: Phrase[];
  /** 高いメロディを1オクターブ上げる */
  leadUp?: boolean;
  bells?: Phrase[];
  arp?: boolean;
  /** 最後の小節にドラムのフィルを入れる */
  fill?: boolean;
  /** 最後の小節で次の部分へ向けて音をふくらませる */
  riser?: boolean;
  /** 最初の小節の頭にシンバル */
  crash?: boolean;
}

export interface Song {
  name: SongName;
  title: string;
  bpm: number;
  swing: number;
  vinyl: number;
  sections: Section[];
  /** 最後まで行ったら、くり返さずにこの曲へ移る */
  next?: SongName;
  seed: number;
}

const c = (v: number[], root: number, fifth = root + 7): Chord => ({ v, root, fifth });
const bar = (...slots: [number, Chord][]): Slot[] => slots.map(([beat, ch]) => ({ beat, c: ch }));
const one = (ch: Chord): Slot[] => bar([0, ch]);

// =====================================================================
// タイトル「Sunset Cruise」88 BPM。高級感のある西海岸チル(D♭メジャー)
// =====================================================================
const T = {
  Dbmaj9: c([53, 56, 60, 63], 37, 44),
  Cm9: c([51, 55, 58, 62], 36, 43),
  Bbm9: c([49, 53, 56, 60], 34, 41),
  Ebm9: c([54, 58, 61, 65], 39, 46),
  Ab13: c([54, 58, 60, 65], 44, 39),
  Gbmaj9: c([58, 61, 65, 68], 42, 49),
  Fm9: c([56, 60, 63, 67], 41, 48),
  Ab7sus: c([51, 54, 56, 61], 44, 39),
};
const T_A = [one(T.Dbmaj9), one(T.Cm9), one(T.Bbm9), bar([0, T.Ebm9], [2, T.Ab13])];
const T_B = [one(T.Gbmaj9), one(T.Fm9), one(T.Ebm9), one(T.Ab7sus)];
const T_THEME: Phrase[] = [
  [[0.5, 0.5, 72], [1, 0.5, 75], [1.5, 1.75, 77]],
  [[0.5, 0.5, 75], [1, 1, 72], [2.5, 0.5, 70], [3, 1, 72]],
  [[0, 1.5, 68], [2, 0.5, 70], [2.5, 1.5, 72]],
  [[0, 0.5, 73], [0.5, 0.5, 75], [1, 2.5, 72]],
];
const T_B_MEL: Phrase[] = [
  [[0, 1, 80], [1, 0.5, 82], [1.5, 2, 80]],
  [[0, 0.5, 77], [0.5, 0.5, 75], [1, 2, 77]],
  [[0.5, 0.5, 73], [1, 0.5, 75], [1.5, 1.5, 77], [3, 1, 75]],
  [[0, 3.5, 72]],
];
const title: Song = {
  name: 'title',
  title: 'Sunset Cruise',
  bpm: 88,
  swing: 0.58,
  vinyl: 0.35,
  seed: 101,
  sections: [
    { name: 'intro', bars: 4, prog: T_A, drums: 'none', bass: 'none', keys: 'sustain', pad: 0.5, riser: true },
    { name: 'A', bars: 8, prog: T_A, drums: 'full', bass: 'groove', keys: 'comp', crash: true, lead: [[], [], [], [], ...T_THEME], fill: true },
    { name: 'B', bars: 8, prog: T_B, drums: 'full', bass: 'groove', keys: 'comp', pad: 0.3, lead: [...T_B_MEL, ...T_B_MEL], arp: true, crash: true, fill: true },
    { name: 'A2', bars: 8, prog: T_A, drums: 'full', bass: 'groove', keys: 'comp', lead: [...T_THEME, ...T_THEME], crash: true, riser: true },
    { name: 'break', bars: 4, prog: T_B, drums: 'none', bass: 'soft', keys: 'sustain', pad: 0.6, bells: T_THEME, riser: true },
    { name: 'B2', bars: 8, prog: T_B, drums: 'full', bass: 'groove', keys: 'comp', pad: 0.35, lead: [...T_THEME, ...T_B_MEL], leadUp: true, arp: true, crash: true, fill: true },
    { name: 'outro', bars: 4, prog: T_A, drums: 'soft', bass: 'soft', keys: 'sustain', pad: 0.4 },
  ],
};

// =====================================================================
// 質問「Mystic Chill」84 BPM。神秘的で落ち着いたチルビート(Eマイナー)
// =====================================================================
const Q = {
  Em9: c([55, 59, 62, 66], 40, 47),
  Cmaj7s11: c([52, 55, 59, 66], 36, 43),
  Am9: c([55, 59, 60, 64], 45, 40),
  Bsus: c([52, 54, 57, 64], 35, 42),
  Gmaj9: c([54, 57, 59, 62], 43, 38),
  Dadd9: c([54, 57, 62, 64], 38, 45),
};
const Q_A = [one(Q.Em9), one(Q.Cmaj7s11), one(Q.Am9), one(Q.Bsus)];
const Q_B = [one(Q.Cmaj7s11), one(Q.Gmaj9), one(Q.Dadd9), one(Q.Bsus)];
const Q_BELL: Phrase[] = [
  [[0, 0.5, 79], [0.75, 0.5, 78], [1.5, 2, 74]],
  [[0.5, 0.5, 76], [1, 2.5, 79]],
  [[0, 0.5, 81], [0.75, 0.5, 79], [1.5, 2, 76]],
  [[0, 3.5, 78]],
];
const Q_MEL: Phrase[] = [
  [[0, 1.5, 71], [1.5, 0.5, 74], [2, 2, 76]],
  [[0.5, 0.5, 74], [1, 2.5, 71]],
  [[0, 1, 69], [1, 0.5, 71], [1.5, 2, 74]],
  [[0, 0.5, 71], [0.5, 3, 66]],
];
const question: Song = {
  name: 'question',
  title: 'Mystic Chill',
  bpm: 84,
  swing: 0.57,
  vinyl: 0.3,
  seed: 202,
  sections: [
    { name: 'intro', bars: 4, prog: Q_A, drums: 'none', bass: 'none', keys: 'sustain', pad: 0.6, bells: Q_BELL, riser: true },
    { name: 'A', bars: 8, prog: Q_A, drums: 'soft', bass: 'groove', keys: 'comp', pad: 0.35, bells: [[], [], [], [], ...Q_BELL], crash: true, fill: true },
    { name: 'B', bars: 8, prog: Q_B, drums: 'soft', bass: 'groove', keys: 'comp', pad: 0.3, lead: [...Q_MEL, ...Q_MEL], arp: true, crash: true },
    { name: 'break', bars: 4, prog: Q_A, drums: 'none', bass: 'soft', keys: 'sustain', pad: 0.6, bells: Q_BELL, riser: true },
    { name: 'A2', bars: 8, prog: Q_A, drums: 'full', bass: 'groove', keys: 'comp', pad: 0.3, lead: [...Q_MEL, ...Q_MEL], bells: [[], [], [], [], ...Q_BELL], crash: true, fill: true },
    { name: 'outro', bars: 4, prog: Q_B, drums: 'none', bass: 'soft', keys: 'sustain', pad: 0.5, bells: Q_BELL },
  ],
};

// =====================================================================
// ドラゴン「Sky Ritual」80 BPM。幻想的で少し壮大(Dマイナー)
// =====================================================================
const D = {
  Dm9: c([53, 57, 60, 64], 38, 45),
  Bbmaj7: c([53, 57, 58, 62], 34, 41),
  Gm9: c([53, 57, 58, 62], 43, 38),
  Asus: c([52, 57, 62, 64], 33, 40),
  A7: c([52, 55, 61, 64], 33, 40),
};
const D_A = [one(D.Dm9), one(D.Bbmaj7), one(D.Gm9), bar([0, D.Asus], [2, D.A7])];
const D_THEME: Phrase[] = [
  [[0, 1.5, 74], [1.5, 0.5, 76], [2, 2, 77]],
  [[0, 1, 76], [1, 3, 74]],
  [[0, 1.5, 70], [1.5, 0.5, 72], [2, 2, 74]],
  [[0, 2, 73], [2, 2, 76]],
];
const dragon: Song = {
  name: 'dragon',
  title: 'Sky Ritual',
  bpm: 80,
  swing: 0.5,
  vinyl: 0,
  seed: 303,
  sections: [
    { name: 'intro', bars: 4, prog: D_A, drums: 'none', bass: 'drone', keys: 'none', pad: 0.8, bells: D_THEME, riser: true },
    { name: 'A', bars: 8, prog: D_A, drums: 'toms', bass: 'drone', keys: 'sustain', pad: 0.7, bells: [[], [], [], [], ...D_THEME], crash: true },
    { name: 'B', bars: 8, prog: D_A, drums: 'toms', bass: 'soft', keys: 'sustain', pad: 0.7, lead: [...D_THEME, ...D_THEME], crash: true, riser: true },
    { name: 'outro', bars: 4, prog: D_A, drums: 'none', bass: 'drone', keys: 'none', pad: 0.8 },
  ],
};

// =====================================================================
// 誕生「First Light」82 BPM。温かく感動的(E♭メジャー)。終わったら育成の曲へ
// =====================================================================
const H = {
  Ebmaj9: c([55, 58, 62, 65], 39, 46),
  Abmaj9: c([55, 58, 60, 63], 44, 39),
  Cm9: c([51, 55, 58, 62], 36, 43),
  Bb9sus: c([53, 56, 60, 63], 46, 41),
};
const H_PROG = [one(H.Ebmaj9), one(H.Abmaj9), one(H.Cm9), one(H.Bb9sus)];
const H_MEL: Phrase[] = [
  [[0, 0.5, 70], [0.5, 0.5, 72], [1, 1.5, 74], [2.5, 1.5, 75]],
  [[0, 1, 77], [1, 0.5, 75], [1.5, 2.5, 72]],
  [[0, 0.5, 70], [0.5, 0.5, 72], [1, 1, 74], [2, 2, 79]],
  [[0, 1, 77], [1, 3, 74]],
  [[0, 0.5, 70], [0.5, 0.5, 72], [1, 1.5, 74], [2.5, 1.5, 75]],
  [[0, 1, 77], [1, 0.5, 79], [1.5, 2.5, 82]],
  [[0, 1, 80], [1, 1, 79], [2, 2, 77]],
  [[0, 4, 79]],
];
const hatch: Song = {
  name: 'hatch',
  title: 'First Light',
  bpm: 82,
  swing: 0.56,
  vinyl: 0.2,
  seed: 404,
  next: 'home',
  sections: [
    { name: 'intro', bars: 2, prog: [one(H.Ebmaj9), one(H.Abmaj9)], drums: 'none', bass: 'soft', keys: 'sustain', pad: 0.6, bells: [[[0, 0.5, 82], [0.5, 0.5, 79], [1, 2.5, 75]], [[0, 0.5, 77], [0.5, 3, 74]]] },
    { name: 'theme', bars: 8, prog: H_PROG, drums: 'half', bass: 'soft', keys: 'comp', pad: 0.45, lead: H_MEL, crash: true },
  ],
};

// =====================================================================
// 育成「Backyard Groove」90 BPM。心地よく長く聴ける西海岸ヒップホップ(A♭メジャー)
// =====================================================================
const M = {
  Abmaj9: c([55, 58, 60, 63], 44, 39),
  Fm9: c([56, 60, 63, 67], 41, 48),
  Dbmaj9: c([53, 56, 60, 63], 37, 44),
  Eb9sus: c([56, 58, 61, 65], 39, 46),
  Bbm9: c([49, 53, 56, 60], 34, 41),
  Eb13: c([55, 61, 65, 67], 39, 46),
  Abmaj7: c([55, 60, 63, 67], 44, 39),
  Gm7b5: c([53, 56, 58, 62], 43, 37),
  C7: c([52, 58, 63, 64], 36, 43),
};
const M_A = [one(M.Abmaj9), one(M.Fm9), one(M.Dbmaj9), one(M.Eb9sus)];
const M_B = [one(M.Bbm9), one(M.Eb13), one(M.Abmaj7), bar([0, M.Gm7b5], [2, M.C7])];
const M_MEL: Phrase[] = [
  [[0.5, 0.5, 75], [1, 0.5, 77], [1.5, 1, 80], [3, 0.75, 77]],
  [[0, 0.5, 75], [0.5, 2, 72], [3, 0.5, 70], [3.5, 0.5, 72]],
  [[0, 1.5, 77], [1.5, 0.5, 75], [2, 1.5, 72]],
  [[0.5, 0.5, 70], [1, 3, 75]],
];
const M_B_MEL: Phrase[] = [
  [[0, 0.75, 77], [0.75, 0.25, 80], [1, 2, 82]],
  [[0, 0.5, 79], [0.5, 0.5, 77], [1, 2.5, 79]],
  [[0, 1, 75], [1, 0.5, 77], [1.5, 2, 80]],
  [[0, 1, 79], [1, 1, 77], [2, 2, 76]],
];
const home: Song = {
  name: 'home',
  title: 'Backyard Groove',
  bpm: 90,
  swing: 0.59,
  vinyl: 0.3,
  seed: 505,
  sections: [
    { name: 'intro', bars: 4, prog: M_A, drums: 'none', bass: 'none', keys: 'comp', pad: 0.3, riser: true },
    { name: 'A', bars: 8, prog: M_A, drums: 'full', bass: 'groove', keys: 'comp', crash: true, fill: true },
    { name: 'A2', bars: 8, prog: M_A, drums: 'full', bass: 'groove', keys: 'comp', lead: [...M_MEL, ...M_MEL], arp: true, fill: true },
    { name: 'B', bars: 8, prog: M_B, drums: 'full', bass: 'groove', keys: 'comp', pad: 0.3, lead: [...M_B_MEL, ...M_B_MEL], crash: true, riser: true },
    { name: 'break', bars: 4, prog: M_B, drums: 'none', bass: 'soft', keys: 'sustain', pad: 0.55, bells: M_MEL, riser: true },
    { name: 'B2', bars: 8, prog: M_B, drums: 'full', bass: 'groove', keys: 'comp', pad: 0.3, lead: [...M_B_MEL, ...M_B_MEL], leadUp: true, arp: true, crash: true, fill: true },
    { name: 'A3', bars: 8, prog: M_A, drums: 'full', bass: 'groove', keys: 'comp', lead: [...M_MEL, ...M_MEL], crash: true },
    { name: 'outro', bars: 4, prog: M_A, drums: 'soft', bass: 'soft', keys: 'sustain', pad: 0.4 },
  ],
};

export const SONGS: Record<SongName, Song> = { title, question, dragon, hatch, home };

export const totalBars = (s: Song): number => s.sections.reduce((n, sec) => n + sec.bars, 0);
export const secondsPerBar = (s: Song): number => (4 * 60) / s.bpm;
export const songSeconds = (s: Song): number => totalBars(s) * secondsPerBar(s);
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 拍 → 秒(16分音符の裏を swing の分だけ遅らせる) */
export function beatToSec(beat: number, bpm: number, swing: number): number {
  const spb = 60 / bpm;
  const sixteenth = Math.floor(beat * 4 + 1e-6);
  const frac = beat * 4 - sixteenth;
  const pairStart = Math.floor(sixteenth / 2) * 2;
  const inPair = sixteenth - pairStart + frac;
  const swung = inPair < 1 ? inPair * (swing * 2) : swing * 2 + (inPair - 1) * (2 - swing * 2);
  return ((pairStart + swung) / 4) * spb;
}

/** 決まった種から作る乱数(くり返しのたびの変化を、毎回同じように再現する) */
function rngFrom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 曲の何小節目が、どの部分の何小節目か */
export function locate(s: Song, barIndex: number): { section: Section; index: number; inSection: number } {
  let n = barIndex % totalBars(s);
  for (let i = 0; i < s.sections.length; i++) {
    const sec = s.sections[i];
    if (n < sec.bars) return { section: sec, index: i, inSection: n };
    n -= sec.bars;
  }
  throw new Error('unreachable');
}

const KICK_PATTERNS: number[][] = [
  [0, 0.75, 2.5],
  [0, 2.25, 2.5],
  [0, 0.75, 2.25, 3.5],
  [0, 1.75, 2.5],
];
const COMP_PATTERNS: [number, number, number][][] = [
  [[0, 1.4, 0.7], [1.75, 0.5, 0.5], [2.75, 1.1, 0.6]],
  [[0, 2, 0.7], [2.5, 1.3, 0.55]],
  [[0.5, 1, 0.6], [2, 0.5, 0.5], [3, 0.9, 0.6]],
  [[0, 0.75, 0.65], [1.5, 0.5, 0.45], [2.5, 1.4, 0.6]],
];
const BASS_PATTERNS: [number, number, 'root' | 'fifth' | 'oct' | 'next', number][][] = [
  [[0, 0.9, 'root', 1], [1.5, 0.4, 'root', 0.7], [2.5, 0.6, 'fifth', 0.85], [3.5, 0.4, 'next', 0.7]],
  [[0, 1.6, 'root', 1], [2.25, 0.5, 'fifth', 0.8], [3, 0.5, 'root', 0.75], [3.75, 0.25, 'next', 0.6]],
  [[0, 0.75, 'root', 1], [0.75, 0.25, 'oct', 0.55], [1.5, 0.9, 'root', 0.8], [2.75, 0.5, 'fifth', 0.75], [3.5, 0.4, 'next', 0.65]],
];

/**
 * 曲の barIndex 小節目(何周目でも)に鳴らす音を作る。
 * loop は何周目か(0から)。周回や小節ごとに、ドラム・エレピ・ベースの形を少しずつ変える。
 */
export function barEvents(s: Song, barIndex: number): NoteEvent[] {
  const total = totalBars(s);
  const loop = Math.floor(barIndex / total);
  const { section: sec, inSection } = locate(s, barIndex);
  const next = locate(s, barIndex + 1);
  const r = rngFrom(s.seed * 7919 + barIndex * 104729 + loop * 31);
  const ev: NoteEvent[] = [];
  const add = (inst: Inst, beat: number, len: number, pitch: number, vel: number) => ev.push({ inst, beat, len, pitch, vel });
  const slots = sec.prog[inSection % sec.prog.length];
  const nextSlots = next.section.prog[next.inSection % next.section.prog.length];
  const chordAt = (beat: number) => [...slots].reverse().find((sl) => sl.beat <= beat)!.c;
  const isLast = inSection === sec.bars - 1;

  // ---- ドラム ----
  if (sec.crash && inSection === 0) add('crash', 0, 4, 0, 0.6);
  const fillBar = sec.fill && isLast;
  if (sec.drums === 'full' || sec.drums === 'half' || sec.drums === 'soft') {
    const soft = sec.drums === 'soft';
    const half = sec.drums === 'half';
    const kicks = half ? [0, 2.5] : soft ? [0, 2.5] : KICK_PATTERNS[Math.floor(r() * KICK_PATTERNS.length)];
    for (const k of kicks) if (!(fillBar && k > 2.9)) add('kick', k, 0.5, 0, k === 0 ? 1 : 0.75 + r() * 0.15);
    if (half) {
      add('snare', 2, 0.5, 0, 0.85);
      add('clap', 2, 0.5, 0, 0.35);
    } else if (soft) {
      add('rim', 1, 0.25, 0, 0.8);
      add('rim', 3, 0.25, 0, 0.85);
    } else {
      add('snare', 1, 0.5, 0, 0.95);
      add('clap', 1, 0.5, 0, 0.4);
      if (!fillBar) {
        add('snare', 3, 0.5, 0, 1);
        add('clap', 3, 0.5, 0, 0.45);
      }
      // ゴーストノート(小さいスネア)
      if (r() < 0.5) add('snare', [1.75, 2.75, 3.75][Math.floor(r() * 3)], 0.25, 0, 0.18);
    }
    // ハイハット: 8分か16分、強弱をつける。ときどき開く
    const sixteenths = !soft && !half && r() < 0.6;
    for (let i = 0; i < 16; i++) {
      const b = i / 4;
      if (fillBar && b >= 3) break;
      if (!sixteenths && i % 2 === 1) continue;
      if (i === 14 && r() < 0.35) {
        add('openhat', b, 0.5, 0, 0.5);
        continue;
      }
      const accent = i % 4 === 0 ? 0.8 : i % 2 === 0 ? 0.55 : 0.32;
      add('hat', b, 0.1, 0, accent * (soft ? 0.6 : 1) * (0.85 + r() * 0.3));
    }
    if (soft || half) for (const b of [0.5, 1.5, 2.5, 3.5]) add('shaker', b, 0.2, 0, 0.4);
    if (fillBar) {
      // 次の部分へつなぐフィル(スネアの連打がだんだん強く)
      const steps = r() < 0.5 ? [3, 3.25, 3.5, 3.75] : [3, 3.5, 3.625, 3.75, 3.875];
      steps.forEach((b, i) => add('snare', b, 0.2, 0, 0.45 + i * 0.12));
      add('kick', 3, 0.5, 0, 0.9);
    }
  } else if (sec.drums === 'toms') {
    // 幻想的な太鼓(やわらかく、ゆったり)
    add('tom', 0, 1, 43, 0.9);
    add('tom', 1.5, 0.5, 40, 0.5);
    add('tom', 2, 1, 38, 0.75);
    if (r() < 0.6) add('tom', 3.5, 0.5, 45, 0.45);
    for (const b of [1, 3]) add('shaker', b, 0.3, 0, 0.35);
  }
  if (sec.riser && isLast) add('riser', 0, 4, 0, 0.8);

  // ---- ベース ----
  if (sec.bass === 'groove') {
    const pat = BASS_PATTERNS[(Math.floor(r() * BASS_PATTERNS.length) + (inSection % 2)) % BASS_PATTERNS.length];
    for (const [b, len, deg, vel] of pat) {
      const ch = chordAt(b);
      const nextRoot = nextSlots[0].c.root;
      const pitch = deg === 'root' ? ch.root : deg === 'fifth' ? ch.fifth : deg === 'oct' ? ch.root + 12 : nextRoot + (nextRoot > ch.root ? -1 : nextRoot === ch.root ? 7 : 1);
      add('bass', b, len, pitch, vel);
    }
  } else if (sec.bass === 'soft') {
    for (const sl of slots) add('bass', sl.beat, (slots.find((x) => x.beat > sl.beat)?.beat ?? 4) - sl.beat, sl.c.root, 0.75);
  } else if (sec.bass === 'drone') {
    add('bass', 0, 4, slots[0].c.root, 0.6);
  }

  // ---- エレピ・パッド ----
  if (sec.keys === 'comp') {
    const pat = COMP_PATTERNS[Math.floor(r() * COMP_PATTERNS.length)];
    for (const [b, len, vel] of pat) {
      const ch = chordAt(b);
      // ときどき和音の一番上を変えて、弾き方を変える
      const voicing = r() < 0.3 ? [...ch.v.slice(0, -1), ch.v[ch.v.length - 1] + (r() < 0.5 ? 2 : -1)] : ch.v;
      voicing.forEach((p, i) => add('ep', b + i * 0.012, len, p, vel * (0.92 + r() * 0.12)));
    }
  } else if (sec.keys === 'sustain') {
    for (const sl of slots) {
      const len = (slots.find((x) => x.beat > sl.beat)?.beat ?? 4) - sl.beat;
      sl.c.v.forEach((p, i) => add('ep', sl.beat + i * 0.02, len, p, 0.75));
    }
  }
  if (sec.pad) for (const sl of slots) {
    const len = (slots.find((x) => x.beat > sl.beat)?.beat ?? 4) - sl.beat;
    sl.c.v.forEach((p) => add('pad', sl.beat, len, p + 12, sec.pad!));
  }

  // ---- メロディ ----
  const phrase = (list: Phrase[] | undefined, inst: Inst, up = 0) => {
    const p = list?.[inSection % list.length];
    p?.forEach(([b, len, pitch, vel]) => add(inst, b, len, pitch + up, vel ?? 0.7));
  };
  phrase(sec.lead, 'lead', sec.leadUp ? 12 : 0);
  phrase(sec.bells, 'bell', 0);
  if (sec.arp) {
    // アナログシンセのアルペジオ(和音の音を16分で上下に)
    const ch = chordAt(0);
    const notes = [...ch.v, ch.v[1] + 12, ch.v[2] + 12];
    const order = r() < 0.5 ? [0, 2, 1, 3, 4, 3, 2, 1] : [0, 1, 2, 3, 2, 4, 3, 1];
    for (let i = 0; i < 8; i++) add('pluck', 2 + i * 0.25, 0.2, notes[order[i]] + 12, 0.45 + (i % 2 ? 0 : 0.1));
  }
  if (s.vinyl > 0) add('vinyl', 0, 4, 0, s.vinyl);
  return ev;
}
