import { describe, expect, it } from 'vitest';
import { QUESTIONS, decideFirstMonz, isComplete } from '../src/core/questions';
import { SAVE_VERSION, clearSave, loadSave, writeSave, type KeyValueStore } from '../src/core/save';

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('questions', () => {
  it('5問で、2問目だけ3択、ほかは4択', () => {
    expect(QUESTIONS.map((q) => q.choices.length)).toEqual([4, 3, 4, 4, 4]);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(5);
  });

  it('全部答えたときだけ完了になる', () => {
    const answers: Record<string, string> = {};
    for (const q of QUESTIONS) {
      expect(isComplete(answers)).toBe(false);
      answers[q.id] = q.choices[0].id;
    }
    expect(isComplete(answers)).toBe(true);
    expect(isComplete({ ...answers, money: 'unknown' })).toBe(false);
  });

  it('同じ 答えでも いろいろな MONZ が 生まれる・答えで 生まれやすさが 変わる(2026-11-08 企画者)', () => {
    const answers = { personality: 'energetic', world: 'city', play: 'battle', pinch: 'charge', money: 'yakiniku' };
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const got: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const m = decideFirstMonz(answers, rnd);
      got[m] = (got[m] ?? 0) + 1;
    }
    expect(Object.keys(got).length).toBe(10);
    expect(got.crownie).toBeUndefined();
    // 元気・街・バトル・正面突破・焼肉 → BUNK・RIOT が 生まれやすい
    expect(got.bunk).toBeGreaterThan(got.shellz);
    expect(got.riot).toBeGreaterThan(got.mofu);
  });
});

describe('save', () => {
  it('保存して読み込める。消すと読み込めない', () => {
    const s = memory();
    expect(loadSave(s)).toBeNull();
    writeSave({ version: SAVE_VERSION, answers: { personality: 'cool' }, answeredAt: 'now', firstMonz: 'bunk' }, s);
    expect(loadSave(s)?.answers.personality).toBe('cool');
    clearSave(s);
    expect(loadSave(s)).toBeNull();
  });

  it('壊れたデータや保存できない環境でも止まらない', () => {
    const broken: KeyValueStore = { getItem: () => '{oops', setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };
    expect(loadSave(broken)).toBeNull();
    expect(writeSave({ version: SAVE_VERSION, answers: {}, answeredAt: '', firstMonz: 'bunk' }, broken)).toBe(false);
    expect(() => clearSave(broken)).not.toThrow();
    expect(loadSave(null)).toBeNull();
  });
});
