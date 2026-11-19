import { describe, expect, it } from 'vitest';
import { readPending, savePending, settlePending, settlePendingOnBoot } from './cardPending';
import { DIAMOND_CAT } from './furniture';
import { LifeRecord, loadLife, newLife, saveLife } from './lifeSave';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('MONZ CARD の 途中の 役(2026-11-19 企画者)', () => {
  it('まとめて もらう・2回は もらわない', () => {
    const s = mem();
    const r = new LifeRecord(newLife(1), s);
    savePending({ playId: 'p1', hands: ['three', 'royal'] }, s);
    expect(settlePending(r, s)).toEqual({ coins: 50, cats: 1 });
    expect(r.coins).toBe(50);
    expect(r.owns(DIAMOND_CAT)).toBe(1);
    expect(readPending(s)).toBeNull();
    savePending({ playId: 'p1', hands: ['three', 'royal'] }, s);
    expect(settlePending(r, s)).toEqual({ coins: 0, cats: 0 });
    expect(r.coins).toBe(50);
  });

  it('途中で 閉じた → 次に 開いた 時に もらう', () => {
    const s = mem();
    saveLife(newLife(1), s);
    savePending({ playId: 'p2', hands: ['four'] }, s);
    settlePendingOnBoot(s);
    expect(loadLife(s).coins).toBe(500);
    expect(readPending(s)).toBeNull();
  });
});
