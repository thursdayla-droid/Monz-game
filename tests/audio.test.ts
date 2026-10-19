import { describe, expect, it } from 'vitest';
import { SONGS, barEvents, beatToSec, songSeconds, totalBars, type SongName } from '../src/audio/songs';
import { DEFAULT_SOUND, loadSound, saveSound, stepToGain } from '../src/audio/settings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const names = Object.keys(SONGS) as SongName[];

describe('BGM のつくり', () => {
  it('テンポは 80〜95、歌なし(楽器だけ)', () => {
    for (const n of names) {
      expect(SONGS[n].bpm).toBeGreaterThanOrEqual(80);
      expect(SONGS[n].bpm).toBeLessThanOrEqual(95);
    }
  });

  it('タイトル・質問・育成は 90〜150 秒の長さで、イントロ・ブレイク・アウトロがある', () => {
    for (const n of ['title', 'question', 'home'] as const) {
      const s = SONGS[n];
      expect(songSeconds(s)).toBeGreaterThanOrEqual(90);
      expect(songSeconds(s)).toBeLessThanOrEqual(150);
      const parts = s.sections.map((x) => x.name);
      expect(parts[0]).toBe('intro');
      expect(parts.at(-1)).toBe('outro');
      expect(parts).toContain('break');
    }
  });

  it('イントロとブレイクはドラムなし、Aメロからドラムとベースが入る', () => {
    const s = SONGS.title;
    const drums = (b: number) => barEvents(s, b).filter((e) => ['kick', 'snare'].includes(e.inst)).length;
    const bass = (b: number) => barEvents(s, b).filter((e) => e.inst === 'bass').length;
    expect(drums(0)).toBe(0);
    expect(drums(4)).toBeGreaterThan(0);
    expect(bass(4)).toBeGreaterThan(0);
    const breakStart = s.sections.slice(0, s.sections.findIndex((x) => x.name === 'break')).reduce((n, x) => n + x.bars, 0);
    expect(drums(breakStart)).toBe(0);
  });

  it('同じ部分でも、くり返すとドラムやエレピの形が変わる(飽きにくく)', () => {
    const s = SONGS.home;
    const sig = (b: number) => JSON.stringify(barEvents(s, b).filter((e) => e.inst !== 'vinyl').map((e) => [e.inst, e.beat.toFixed(2), e.pitch]));
    const total = totalBars(s);
    const variants = new Set([5, 9, 13, 5 + total, 9 + total].map(sig));
    expect(variants.size).toBeGreaterThan(2);
    // 同じ小節・同じ周なら同じ音(再現できる)
    expect(sig(7)).toBe(sig(7));
  });

  it('誕生の曲は、終わったら育成の曲へ移る', () => {
    expect(SONGS.hatch.next).toBe('home');
    expect(SONGS.title.next).toBeUndefined();
  });

  it('すべての音が小節の中に収まる', () => {
    for (const n of names) {
      for (let b = 0; b < totalBars(SONGS[n]); b++) {
        for (const e of barEvents(SONGS[n], b)) {
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(4);
          expect(e.vel).toBeGreaterThan(0);
        }
      }
    }
  });

  it('16分音符の裏が跳ねる(swing)。表拍の位置は変わらない', () => {
    expect(beatToSec(1, 90, 0.6)).toBeCloseTo(60 / 90);
    expect(beatToSec(0.25, 90, 0.6)).toBeGreaterThan(60 / 90 / 4);
  });
});

describe('音量の設定', () => {
  it('BGMと効果音を別々に保存できる。おかしな値は直す', () => {
    const s = memory();
    expect(loadSound(s)).toEqual(DEFAULT_SOUND);
    saveSound({ bgm: 3, se: 12 }, s);
    expect(loadSound(s)).toEqual({ bgm: 3, se: 10 });
    s.setItem('monz:sound', '{broken');
    expect(loadSound(s)).toEqual(DEFAULT_SOUND);
  });

  it('0 は無音、10 は最大', () => {
    expect(stepToGain(0)).toBe(0);
    expect(stepToGain(10)).toBe(1);
  });
});
