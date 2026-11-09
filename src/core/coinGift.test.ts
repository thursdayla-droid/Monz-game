import { describe, expect, it } from 'vitest';
import { applyCoinGifts } from './coinGift';
import { LIFE_KEY, loadLife, newLife, saveLife } from './lifeSave';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('コインの プレゼント(2026-11-09)', () => {
  it('遊んでいる データに 1回だけ 100,000 足す', () => {
    const s = mem();
    saveLife({ ...newLife(), coins: 500 }, s);
    expect(applyCoinGifts(s)).toBe(100000);
    expect(loadLife(s).coins).toBe(100500);
    expect(applyCoinGifts(s)).toBe(0);
    expect(loadLife(s).coins).toBe(100500);
  });
  it('データが ない 人には 足さない', () => {
    const s = mem();
    expect(applyCoinGifts(s)).toBe(0);
    expect(s.getItem(LIFE_KEY)).toBeNull();
  });
});
