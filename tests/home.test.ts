import { describe, expect, it } from 'vitest';
import { HOME_ACTIONS, HOME_ACTION_LABELS, HOME_PLACES, pickHomePlace } from '../src/core/home';
import { mulberry32 } from '../src/core/rng';

describe('home', () => {
  it('picks every place over time and never repeats the last one', () => {
    const rng = mulberry32(1);
    const seen = new Set<string>();
    let last = pickHomePlace(rng);
    for (let i = 0; i < 60; i++) {
      const p = pickHomePlace(rng, last);
      expect(p).not.toBe(last);
      seen.add(p);
      last = p;
    }
    expect(seen.size).toBe(HOME_PLACES.length);
  });

  it('has four buttons in the planner order', () => {
    expect(HOME_ACTIONS.map((a) => HOME_ACTION_LABELS[a])).toEqual(['ごはん', 'なでる', 'ミニゲーム', 'きがえ']);
  });
});
