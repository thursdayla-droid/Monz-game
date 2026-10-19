/**
 * BGMの楽譜(音を鳴らす部分には依存しない。テストできるように分けてある)。
 * 方向性: ゆったりした西海岸ヒップホップのインスト(歌なし)。温かいエレピ、太く丸いベース、少し跳ねるハイハット、
 * レトロなシンセ。既存の曲は使わず、和音・リズム・メロディはすべてここで書いたオリジナル。
 * 【仮】企画者が聴いて調整する。
 */

export type CueName = 'title' | 'question' | 'mystery' | 'birth';

/** 拍(beat)単位の音符。pitch は MIDI ノート番号(60 = ド) */
export interface Note {
  beat: number;
  len: number;
  pitch: number;
  vel: number;
}

export interface DrumHit {
  beat: number;
  kind: 'kick' | 'snare' | 'clap' | 'rim' | 'hat' | 'openhat' | 'shaker';
  vel: number;
}

export interface Score {
  bpm: number;
  bars: number;
  /** 16分音符の跳ね具合(0.5 = まっすぐ, 0.6 前後で跳ねる) */
  swing: number;
  ep: Note[];
  bass: Note[];
  pad: Note[];
  lead: Note[];
  bell: Note[];
  drums: DrumHit[];
  /** 風のような音(神秘的な場面用) 0〜1 */
  wind: number;
  /** レコードのかすかなノイズ 0〜1 */
  vinyl: number;
  /** 高いシンセの音程をすべらせるか */
  glideLead?: boolean;
  /** ベースの音色。round = 丸いだけ(神秘的な場面用)、growl = 太くうなる(標準) */
  bassTone?: 'round' | 'growl';
}

/** 1小節ずつの和音。voicing はエレピ・パッド用、bass は低音の根音 */
interface Chord {
  voicing: number[];
  bass: number;
  fifth: number;
}

const ch = (voicing: number[], bass: number, fifth = bass + 7): Chord => ({ voicing, bass, fifth });

// 決まった並びの小さな乱数(人の演奏のような「ゆれ」を毎回同じに出す)
function wobble(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

function epComp(chords: Chord[], pattern: { beat: number; len: number; vel: number }[], seed: number, every = 1): Note[] {
  const r = wobble(seed);
  const notes: Note[] = [];
  chords.forEach((c, bar) => {
    for (const p of pattern) {
      c.voicing.forEach((pitch, i) => {
        // 和音を少しだけずらして弾く(指で弾いた感じ)
        notes.push({ beat: bar * 4 * every + p.beat + i * 0.012 + r() * 0.02, len: p.len, pitch, vel: p.vel * (0.9 + r() * 0.15) });
      });
    }
  });
  return notes;
}

function bassLine(chords: Chord[], pattern: { beat: number; len: number; vel: number; deg: 'root' | 'fifth' | 'oct' | 'approach' }[], seed: number): Note[] {
  const r = wobble(seed);
  const notes: Note[] = [];
  chords.forEach((c, bar) => {
    const next = chords[(bar + 1) % chords.length];
    for (const p of pattern) {
      const pitch = p.deg === 'root' ? c.bass : p.deg === 'fifth' ? c.fifth : p.deg === 'oct' ? c.bass + 12 : next.bass + (next.bass > c.bass ? -1 : 1);
      notes.push({ beat: bar * 4 + p.beat + r() * 0.015, len: p.len, pitch, vel: p.vel });
    }
  });
  return notes;
}

function drumBar(bar: number, hits: [number, DrumHit['kind'], number][], seed: number): DrumHit[] {
  const r = wobble(seed + bar * 31);
  return hits.map(([beat, kind, vel]) => ({ beat: bar * 4 + beat, kind, vel: vel * (0.92 + r() * 0.16) }));
}

function hats16(bar: number, accents: number[], openAt: number[] = []): DrumHit[] {
  const hits: DrumHit[] = [];
  for (let i = 0; i < 16; i++) {
    const beat = i / 4;
    if (openAt.includes(beat)) {
      hits.push({ beat: bar * 4 + beat, kind: 'openhat', vel: 0.55 });
      continue;
    }
    const v = accents[i % accents.length];
    if (v > 0) hits.push({ beat: bar * 4 + beat, kind: 'hat', vel: v });
  }
  return hits;
}

const melody = (bar: number, notes: [number, number, number, number?][]): Note[] =>
  notes.map(([beat, len, pitch, vel]) => ({ beat: bar * 4 + beat, len, pitch, vel: vel ?? 0.7 }));

// ---------- タイトル: オシャレで少し生意気、クール。Fマイナー系、96 BPM ----------
function title(): Score {
  const prog = [
    ch([56, 60, 63, 67], 41, 48), // Fm9
    ch([56, 60, 61, 65], 37, 44), // D♭maj7
    ch([56, 60, 61, 65], 34, 41), // B♭m9
    ch([52, 58, 63, 67], 36, 43), // C7(#9) ← 少し緊張感のある和音
  ];
  const chords = [...prog, ...prog];
  const drums: DrumHit[] = [];
  for (let bar = 0; bar < 8; bar++) {
    drums.push(
      ...drumBar(
        bar,
        [
          [0, 'kick', 1],
          [0.75, 'kick', 0.6],
          [1, 'snare', 1],
          [1, 'clap', 0.55],
          [2.25, 'kick', 0.7],
          [2.5, 'kick', 0.9],
          [3, 'snare', 1],
          [3, 'clap', 0.6],
          ...(bar % 2 === 1 ? ([[3.75, 'kick', 0.6]] as [number, DrumHit['kind'], number][]) : []),
        ],
        11,
      ),
      ...hats16(bar, [0.8, 0.3, 0.55, 0.35], bar % 4 === 3 ? [3.5] : []),
    );
  }
  return {
    bpm: 96,
    bars: 8,
    swing: 0.58,
    // エレピは短めに刻む(のんびりしすぎないように)
    ep: epComp(chords, [
      { beat: 0, len: 0.9, vel: 0.72 },
      { beat: 1.5, len: 0.35, vel: 0.55 },
      { beat: 2.75, len: 0.6, vel: 0.62 },
    ], 3),
    bass: bassLine(chords, [
      { beat: 0, len: 0.7, vel: 1, deg: 'root' },
      { beat: 0.75, len: 0.2, vel: 0.65, deg: 'oct' },
      { beat: 1.5, len: 0.4, vel: 0.85, deg: 'root' },
      { beat: 2.5, len: 0.55, vel: 0.9, deg: 'fifth' },
      { beat: 3.5, len: 0.4, vel: 0.75, deg: 'approach' },
    ], 5),
    pad: [],
    // 高いシンセ(音程をすべらせる)。前半は呼びかけ、後半は答え
    lead: [
      ...melody(1, [[2, 0.5, 79, 0.6], [2.5, 1.2, 80, 0.7]]),
      ...melody(2, [[0, 0.5, 79, 0.6], [0.5, 1.5, 77, 0.65]]),
      ...melody(3, [[2, 0.5, 79, 0.6], [2.5, 0.5, 82, 0.7], [3, 1, 84, 0.7]]),
      ...melody(5, [[2, 0.5, 79, 0.6], [2.5, 1.2, 80, 0.7]]),
      ...melody(6, [[0, 0.5, 84, 0.65], [0.5, 0.5, 82, 0.6], [1, 1.5, 80, 0.65]]),
      ...melody(7, [[2, 0.5, 79, 0.6], [2.5, 1.4, 76, 0.65]]),
    ],
    bell: [],
    drums,
    wind: 0,
    vinyl: 0.25,
    glideLead: true,
  };
}

// ---------- 質問: 軽快で遊び心。100 BPM ----------
function question(): Score {
  const prog = [
    ch([54, 58, 61, 65], 42, 49), // G♭maj7
    ch([56, 60, 63, 65], 41, 48), // Fm7
    ch([54, 58, 61, 65], 39, 46), // E♭m9
    ch([56, 60, 63, 66], 44, 51), // A♭13 風
  ];
  const chords = [...prog, ...prog];
  const drums: DrumHit[] = [];
  for (let bar = 0; bar < 8; bar++) {
    drums.push(
      ...drumBar(
        bar,
        [
          [0, 'kick', 0.85],
          [1, 'rim', 0.8],
          [1.75, 'kick', 0.5],
          [2.25, 'kick', 0.65],
          [3, 'rim', 0.8],
          [3, 'clap', bar % 2 ? 0.5 : 0.25],
        ],
        17,
      ),
      ...hats16(bar, [0.55, 0.35, 0.5, 0.4]),
      ...[0.5, 1.5, 2.5, 3.5].map((b) => ({ beat: bar * 4 + b, kind: 'shaker' as const, vel: 0.35 })),
    );
  }
  // 遊び心のあるアルペジオ(高めのシンセ)
  const arp: Note[] = [];
  chords.forEach((c, bar) => {
    if (bar % 2 === 0) return;
    [0, 0.5, 1, 1.5, 2.25, 3].forEach((b, i) => arp.push({ beat: bar * 4 + b, len: 0.22, pitch: c.voicing[i % c.voicing.length] + 12, vel: 0.5 }));
  });
  return {
    bpm: 100,
    bars: 8,
    swing: 0.56,
    ep: epComp(chords, [
      { beat: 0.5, len: 0.25, vel: 0.6 },
      { beat: 1.5, len: 0.25, vel: 0.5 },
      { beat: 2.25, len: 0.25, vel: 0.55 },
      { beat: 3.5, len: 0.25, vel: 0.5 },
    ], 7),
    bass: bassLine(chords, [
      { beat: 0, len: 0.4, vel: 1, deg: 'root' },
      { beat: 0.75, len: 0.2, vel: 0.6, deg: 'oct' },
      { beat: 1.5, len: 0.4, vel: 0.8, deg: 'root' },
      { beat: 2.5, len: 0.3, vel: 0.75, deg: 'fifth' },
      { beat: 3.25, len: 0.2, vel: 0.6, deg: 'oct' },
      { beat: 3.75, len: 0.2, vel: 0.6, deg: 'approach' },
    ], 9),
    pad: [],
    lead: arp,
    bell: [],
    drums,
    wind: 0,
    vinyl: 0.2,
  };
}

// ---------- ドラゴン: ビートなし、神秘的。72 BPM ----------
function mystery(): Score {
  const prog = [
    ch([58, 61, 65, 72], 34), // B♭m(add9)
    ch([54, 58, 61, 72], 30), // G♭maj7(#11)
    ch([51, 54, 58, 65], 27), // E♭m9
    ch([53, 58, 60, 65], 29), // Fsus4
  ];
  const chords = [...prog, ...prog];
  const pad: Note[] = chords.flatMap((c, bar) => c.voicing.map((pitch) => ({ beat: bar * 4, len: 4.2, pitch, vel: 0.55 })));
  const bass: Note[] = chords.map((c, bar) => ({ beat: bar * 4, len: 4, pitch: c.bass, vel: 0.6 }));
  const bell: Note[] = [
    ...melody(0, [[1, 2, 77, 0.4], [2.5, 2, 82, 0.3]]),
    ...melody(2, [[0.5, 2, 75, 0.35], [2, 2, 73, 0.3]]),
    ...melody(4, [[1, 2, 82, 0.4], [3, 2, 77, 0.3]]),
    ...melody(6, [[0, 2, 80, 0.35], [1.5, 2, 77, 0.3], [3, 2, 72, 0.3]]),
  ];
  return { bpm: 72, bars: 8, swing: 0.5, ep: [], bass, pad, lead: [], bell, drums: [], wind: 0.8, vinyl: 0, bassTone: 'round' };
}

// ---------- 誕生・ホーム: 明るく温かい。E♭メジャー、94 BPM。長く聴いても疲れない ----------
function birth(): Score {
  const prog = [
    ch([55, 58, 62, 65], 39, 46), // E♭maj9
    ch([51, 55, 58, 62], 36, 43), // Cm9
    ch([55, 60, 63, 67], 44, 51), // A♭maj9
    ch([53, 56, 60, 63], 46, 41), // B♭9sus
  ];
  const chords = [...prog, ...prog];
  const drums: DrumHit[] = [];
  for (let bar = 0; bar < 8; bar++) {
    drums.push(
      ...drumBar(
        bar,
        [
          [0, 'kick', 0.9],
          [1, 'snare', 0.7],
          [1.5, 'kick', 0.45],
          [2.5, 'kick', 0.75],
          [3, 'snare', 0.75],
          [3, 'clap', 0.35],
        ],
        23,
      ),
      ...hats16(bar, [0.55, 0.2, 0.4, 0.25]),
    );
  }
  return {
    bpm: 94,
    bars: 8,
    swing: 0.57,
    ep: epComp(chords, [
      { beat: 0, len: 1.8, vel: 0.65 },
      { beat: 2, len: 0.5, vel: 0.45 },
      { beat: 2.75, len: 1.1, vel: 0.55 },
    ], 13),
    bass: bassLine(chords, [
      { beat: 0, len: 1.2, vel: 0.95, deg: 'root' },
      { beat: 1.75, len: 0.4, vel: 0.65, deg: 'root' },
      { beat: 2.5, len: 0.9, vel: 0.8, deg: 'fifth' },
      { beat: 3.5, len: 0.45, vel: 0.6, deg: 'approach' },
    ], 15),
    pad: chords.flatMap((c, bar) => c.voicing.map((pitch) => ({ beat: bar * 4, len: 4, pitch: pitch + 12, vel: 0.25 }))),
    lead: [
      ...melody(0, [[2, 0.5, 79], [2.5, 0.5, 82], [3, 1, 84]]),
      ...melody(1, [[0, 1.5, 82], [2.5, 0.5, 79], [3, 0.75, 77]]),
      ...melody(2, [[0, 2, 75]]),
      ...melody(4, [[2, 0.5, 79], [2.5, 0.5, 82], [3, 1, 87]]),
      ...melody(5, [[0, 1, 84], [1.5, 0.5, 82], [2, 1.5, 79]]),
      ...melody(6, [[0.5, 0.5, 77], [1, 0.5, 79], [1.5, 2, 75]]),
    ],
    bell: [],
    drums,
    wind: 0,
    vinyl: 0.2,
    glideLead: true,
  };
}

export const SCORES: Record<CueName, () => Score> = { title, question, mystery, birth };

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 拍 → 秒(16分音符の裏を swing の分だけ遅らせる) */
export function beatToSec(beat: number, bpm: number, swing: number): number {
  const spb = 60 / bpm;
  const sixteenth = Math.floor(beat * 4 + 1e-6);
  const frac = beat * 4 - sixteenth;
  const pairStart = Math.floor(sixteenth / 2) * 2;
  const inPair = sixteenth - pairStart + frac; // 0〜2
  const swung = inPair < 1 ? inPair * (swing * 2) : swing * 2 + (inPair - 1) * (2 - swing * 2);
  return ((pairStart + swung) / 4) * spb;
}

export const loopSeconds = (s: Score): number => s.bars * 4 * (60 / s.bpm);
