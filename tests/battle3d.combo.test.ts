import { it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeBattle, type AnimeEntrant } from '../src/core/battle3d/anime';
// コンボ1段め(2026-11-04): 押すたびに1発・つながると数える・長いほど弱く・必ず ぬけられる
const st = { hp: 30, power: 36, tough: 32, speed: 12, tech: 16 };
const e = (species = 'bunk', form = 1): AnimeEntrant => ({ name: 'B', species, form, stats: st, instinct: instinctFor(species, st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs: [] });
const setup = (b: AnimeBattle, gap = 1.6) => {
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  p.x = 0; p.z = 0; q.x = gap; q.z = 0; p.face = 0; q.thinkT = 99; q.cooldown.dodge = 99; q.cooldown.guard = 99;
  return [p, q] as const;
};
const run = (b: AnimeBattle, frames: number, every = 9) => {
  const ev: AnimeBattle['events'] = [];
  for (let i = 0; i < frames; i++) { if (every && i % every === 0) giveCommand(b, 0, 'punch'); b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  return ev;
};

it('mashing BUNK punches connects: the 2nd and 3rd hits are counted as a combo', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  setup(b);
  const ev = run(b, 60);
  const combos = ev.filter((x) => x.kind === 'combo').map((x) => (x.kind === 'combo' ? x.n : 0));
  expect(combos).toEqual([2, 3]);
});

it('pressing slowly does not combo (each press is its own hit)', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  setup(b);
  const ev = run(b, 200, 70);
  expect(ev.filter((x) => x.kind === 'hit').length).toBeGreaterThanOrEqual(2);
  expect(ev.some((x) => x.kind === 'combo')).toBe(false);
});

it('long combos hit weaker, and a very long combo always breaks (short safe time)', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  const [, q] = setup(b);
  // すでに 15発 受けている ことにする
  q.act = { k: 'hurt', t: 0, until: 1 };
  q.comboN = ANIME.chain.breakHits - 1;
  q.comboStart = b.t;
  q.comboLast = b.t;
  giveCommand(b, 0, 'punch');
  const ev = run(b, 30, 0);
  expect(ev.some((x) => x.kind === 'hit')).toBe(true);
  expect(ev.some((x) => x.kind === 'comboBreak')).toBe(true);
  expect(b.t < q.safeUntil || q.act.k !== 'hurt').toBe(true);
  expect(q.comboN).toBe(0);
});

it('combo damage scale goes down with the hit count', () => {
  const dmgAt = (n: number) => {
    const b = newAnimeBattle(e(), e(), 7, 'manual');
    const [, q] = setup(b);
    if (n > 1) { q.act = { k: 'hurt', t: 0, until: 1 }; q.comboN = n - 1; q.comboStart = b.t; q.comboLast = b.t; }
    const hp = q.hp;
    giveCommand(b, 0, 'punch');
    run(b, 12, 0);
    return hp - q.hp;
  };
  expect(dmgAt(10)).toBeLessThan(dmgAt(1));
});

it('a combo lasting too long (over 5 seconds) also breaks', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  const [, q] = setup(b);
  b.t = 10;
  q.act = { k: 'hurt', t: 0, until: 1 };
  q.comboN = 5;
  q.comboStart = b.t - ANIME.chain.breakTime - 0.1;
  q.comboLast = b.t;
  giveCommand(b, 0, 'punch');
  const ev = run(b, 30, 0);
  expect(ev.some((x) => x.kind === 'comboBreak')).toBe(true);
});

it('PUNI / KLAK normal attacks keep their cooldown (no rapid fire)', () => {
  for (const sp of ['puni', 'klak']) {
    const b = newAnimeBattle(e(sp), e(), 1, 'manual');
    const [p] = setup(b);
    expect(p.jab.parts.length).toBe(1);
    giveCommand(b, 0, 'punch');
    run(b, 2, 0);
    // 1回 使うと 待ち時間がある(連打できない)
    expect((p.cooldown.punch ?? 0) > b.t).toBe(true);
  }
});

it('new 5 species: each press is one move (claw, bite, headbutt...), mashing connects the whole chain', () => {
  for (const sp of ['riot', 'snek', 'grit', 'vybe', 'shellz']) {
    for (const form of [1, 2, 3]) {
      const b = newAnimeBattle(e(sp, form), e(), 1, 'manual');
      const [p] = setup(b, 2.2);
      const want = ANIME.monJab[sp][form - 1].moves.length;
      expect(p.jab.moves?.length).toBe(want);
      const ev = run(b, 20 * want + 40, 9);
      const hits = ev.filter((x) => x.kind === 'hit').length;
      const top = Math.max(0, ...ev.map((x) => (x.kind === 'combo' ? x.n : 0)));
      expect(hits, `${sp} ${form}`).toBeGreaterThanOrEqual(want);
      expect(top, `${sp} ${form}`).toBeGreaterThanOrEqual(want);
      // とびこむので 前へ出ている
      expect(p.x).toBeGreaterThan(0.2);
    }
  }
});
