import { describe, expect, it } from 'vitest';
import { BunkBrain } from '../src/core/bunkBehavior';
import { HOME_ACTIONS, HOME_ACTION_LABELS, HOME_LAYOUTS, HOME_PLACES, clipPolygonX, decideHomePlace, insidePolygon } from '../src/core/home';
import { MonzLife, type LifeAct } from '../src/core/life';
import { LIFE_KEY, LifeRecord, loadLife } from '../src/core/lifeSave';
import { catchUp, expToNext, NEEDS_RULES, newNeeds, stepNeeds } from '../src/core/needs';
import { needWeights } from '../src/core/life';
import { mulberry32 } from '../src/core/rng';
import type { KeyValueStore } from '../src/core/save';
import type { BehaviorConfig } from '../src/core/bunkPose';
import type { Personality } from '../src/core/dna';
import motion from '../src/render/bunkMotion.json';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};

describe('home', () => {
  it('picks a random place the first time, then always keeps it', () => {
    const rng = mulberry32(1);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(decideHomePlace(rng));
    expect(seen.size).toBe(HOME_PLACES.length);
    for (let i = 0; i < 20; i++) expect(decideHomePlace(rng, 'garage')).toBe('garage');
    expect(HOME_PLACES).toContain(decideHomePlace(rng, 'broken'));
  });

  it('has six menu buttons in the planner order', () => {
    expect(HOME_ACTIONS.map((a) => HOME_ACTION_LABELS[a])).toEqual(['ごはん', 'ミニゲーム', 'なでる', 'バトル', 'ショップ', '設定']);
  });
});

describe('floor', () => {
  it('clips the walkable floor to the visible screen', () => {
    const clipped = clipPolygonX([[0, 0], [100, 0], [100, 50], [0, 50]], 20, 70);
    expect(Math.min(...clipped.map((p) => p[0]))).toBe(20);
    expect(Math.max(...clipped.map((p) => p[0]))).toBe(70);
    expect(insidePolygon([50, 25], clipped)).toBe(true);
    expect(insidePolygon([80, 25], clipped)).toBe(false);
  });
});

describe('life', () => {
  const run = (seed: number, seconds: number) => {
    const floor = HOME_LAYOUTS.alley.floor;
    const brain = new BunkBrain(motion.behavior as unknown as BehaviorConfig, seed, motion.testPersonality as unknown as Personality);
    const life = new MonzLife(brain, floor, mulberry32(seed), () => 0.5);
    const acts: LifeAct[] = [];
    let outside = 0;
    for (let t = 0; t < seconds; t += 0.05) {
      life.update(0.05);
      if (acts[acts.length - 1] !== life.act) acts.push(life.act);
      if (!insidePolygon([life.x, life.y], floor)) outside++;
    }
    return { life, acts, outside };
  };

  it('stays on the floor and tries many different things, with idle time in between', () => {
    const { acts, outside } = run(7, 600);
    expect(outside).toBe(0);
    expect(new Set(acts).size).toBeGreaterThanOrEqual(6);
    expect(acts.filter((a) => a === 'idle').length).toBeGreaterThan(acts.length / 4);
  });

  it('rarely does the same thing twice in a row', () => {
    const { acts } = run(11, 900);
    const busy = acts.filter((a) => a !== 'idle');
    let repeats = 0;
    for (let i = 1; i < busy.length; i++) if (busy[i] === busy[i - 1]) repeats++;
    expect(repeats / busy.length).toBeLessThan(0.15);
  });

  it('stops moving while paused', () => {
    const { life } = run(3, 30);
    life.pause(2);
    const [x, y] = [life.x, life.y];
    for (let t = 0; t < 1.9; t += 0.05) life.update(0.05);
    expect([life.x, life.y]).toEqual([x, y]);
  });
});

describe('life record', () => {
  it('starts at zero coins and keeps coins after closing', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    expect(rec.coins).toBe(0);
    const seen: number[] = [];
    rec.on((e) => e.type === 'coins' && seen.push(e.coins, e.delta));
    rec.add(25);
    expect(rec.spend(30)).toBe(false);
    expect(rec.spend(10)).toBe(true);
    expect(seen).toEqual([25, 25, 15, -10]);
    expect(new LifeRecord(loadLife(store), store).coins).toBe(15);
    expect(JSON.parse(store.data[LIFE_KEY]).items).toEqual([]);
  });

  it('ignores broken saved data', () => {
    const store = memoryStore();
    store.setItem(LIFE_KEY, '{oops');
    expect(loadLife(store).coins).toBe(0);
  });

  it('reads old saves without needs', () => {
    const store = memoryStore();
    store.setItem(LIFE_KEY, JSON.stringify({ version: 1, coins: 7, level: 1, exp: 0, lastSeen: 0, items: [] }));
    const data = loadLife(store);
    expect(data.coins).toBe(7);
    expect(data.needs.full).toBeGreaterThan(0);
  });

  it('caring twice a day levels up in two to three days and pays coins', () => {
    const store = memoryStore();
    const rec = new LifeRecord(loadLife(store), store);
    const ups: number[] = [];
    rec.on((e) => e.type === 'levelUp' && ups.push(e.level));
    const day = 24 * 3600 * 1000;
    let t = Date.UTC(2026, 9, 1, 3);
    let firstUp = -1;
    for (let d = 0; d < 5; d++) {
      for (const hour of [0, 10]) {
        const now = t + d * day + hour * 3600 * 1000;
        rec.feed(now);
        for (let i = 0; i < 3; i++) rec.pet(true, now);
        if (ups.length && firstUp < 0) firstUp = d;
      }
    }
    expect(firstUp).toBeGreaterThanOrEqual(1);
    expect(firstUp).toBeLessThanOrEqual(2);
    expect(rec.coins).toBeGreaterThan(0);
    // 連打しても1日の上限より多くはたまらない
    const before = rec.snapshot.exp + rec.snapshot.level * 1000;
    const now = t + 9 * day;
    for (let i = 0; i < 100; i++) rec.pet(true, now);
    expect(rec.snapshot.exp + rec.snapshot.level * 1000 - before).toBeLessThanOrEqual(NEEDS_RULES.dailyExpCap + expToNext(1));
  });
});

describe('needs', () => {
  it('gets hungry in about half a day and one meal brings back half', () => {
    let n = { ...newNeeds(), full: 1 };
    n = stepNeeds(n, 6 * 3600, false);
    expect(n.full).toBeCloseTo(0.5, 1);
    n = stepNeeds(n, 6 * 3600, false);
    expect(n.full).toBe(0);
  });

  it('never goes below zero however long the app stays closed', () => {
    const n = catchUp(newNeeds(), 0, 30 * 24 * 3600 * 1000);
    for (const v of [n.full, n.sleepy, n.mood]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('falls asleep when sleepy and wakes up rested in the daytime', () => {
    let n = { ...newNeeds(), sleepy: 0.84 };
    n = stepNeeds(n, 3600, false);
    expect(n.asleep).toBe(true);
    for (let i = 0; i < 300; i++) n = stepNeeds(n, 60, false);
    expect(n.asleep).toBe(false);
  });

  it('hungry MONZ begs for food and grumpy MONZ hops less', () => {
    expect(needWeights({ ...newNeeds(), full: 0.1 }).beg).toBeGreaterThan(0);
    expect(needWeights({ ...newNeeds(), mood: 0.1 }).hop).toBeLessThan(1);
    expect(needWeights(newNeeds()).beg).toBeUndefined();
  });
});
