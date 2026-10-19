import { describe, expect, it } from 'vitest';
import { SCORES, beatToSec, loopSeconds, type CueName } from '../src/audio/score';
import { DEFAULT_SOUND, loadSound, saveSound, stepToGain } from '../src/audio/settings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('BGM の楽譜', () => {
  const cues: CueName[] = ['title', 'question', 'mystery', 'birth'];

  it('どの曲もゆったりしたテンポで、すべての音がループの中に収まる', () => {
    for (const cue of cues) {
      const s = SCORES[cue]();
      expect(s.bpm).toBeGreaterThanOrEqual(70);
      expect(s.bpm).toBeLessThanOrEqual(100);
      const beats = s.bars * 4;
      for (const n of [...s.ep, ...s.bass, ...s.pad, ...s.lead, ...s.bell]) {
        expect(n.beat).toBeGreaterThanOrEqual(-0.1);
        expect(n.beat).toBeLessThan(beats);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1.2);
      }
      for (const d of s.drums) expect(d.beat).toBeLessThan(beats);
    }
  });

  it('タイトル・質問・誕生はビートあり、ドラゴンの曲はビートなし', () => {
    expect(SCORES.title().drums.length).toBeGreaterThan(0);
    expect(SCORES.question().drums.length).toBeGreaterThan(0);
    expect(SCORES.birth().drums.length).toBeGreaterThan(0);
    expect(SCORES.mystery().drums.length).toBe(0);
  });

  it('16分音符の裏が跳ねる(swing)。表拍の位置は変わらない', () => {
    expect(beatToSec(1, 90, 0.6)).toBeCloseTo(60 / 90);
    expect(beatToSec(0.25, 90, 0.5)).toBeCloseTo((60 / 90) / 4);
    expect(beatToSec(0.25, 90, 0.6)).toBeGreaterThan((60 / 90) / 4);
    expect(loopSeconds(SCORES.title())).toBeCloseTo(8 * 4 * (60 / SCORES.title().bpm));
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
    expect(stepToGain(5)).toBeLessThan(0.5);
  });
});
