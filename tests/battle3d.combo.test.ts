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

// コンボ3段め(2026-11-05): ためる強い1発・ダッシュ攻撃・通常攻撃から技へ
const hold = (b: AnimeBattle, frames: number) => {
  const ev: AnimeBattle['events'] = [];
  b.f[0].hold = true;
  giveCommand(b, 0, 'punch');
  for (let i = 0; i < frames; i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  b.f[0].hold = false;
  return ev;
};

it('holding the attack button charges; releasing gives a strong hit that launches', () => {
  for (const sp of ['bunk', 'mofu', 'riot', 'snek', 'grit', 'vybe', 'shellz']) {
    const b = newAnimeBattle(e(sp), e(), 1, 'manual');
    const [p, q] = setup(b, 2.2);
    const ev = hold(b, 75);
    expect(p.act.k === 'tech' && p.act.sp, sp).toBe('charge');
    expect(ev.some((x) => x.kind === 'chargeFull'), sp).toBe(true);
    ev.push(...run(b, 60, 0));
    expect(ev.some((x) => x.kind === 'power' && x.sp === 'charge'), sp).toBe(true);
    // ふっとんだ(空中 か たおれた)
    expect(ev.some((x) => x.kind === 'hit' && x.big), sp).toBe(true);
    expect(['air', 'down'].includes(q.act.k) || q.y > 0, sp).toBe(true);
  }
});

it('a short tap does not charge', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  const [p] = setup(b);
  b.f[0].hold = true;
  giveCommand(b, 0, 'punch');
  for (let i = 0; i < 5; i++) stepAnime(b, ANIME.dt);
  b.f[0].hold = false;
  run(b, 40, 0);
  expect(p.act.k === 'tech' && p.act.sp).toBeFalsy();
});

it('ZIPP / PUNI / KLAK do not get a charged hit (their normal attacks stay as they are)', () => {
  for (const sp of ['puni', 'klak']) {
    const b = newAnimeBattle(e(sp), e(), 1, 'manual');
    const [p] = setup(b, 3);
    const ev = hold(b, 75);
    expect(ev.some((x) => x.kind === 'chargeFull' || x.kind === 'power'), sp).toBe(false);
    expect(p.act.k === 'tech' && p.act.sp).toBeFalsy();
  }
});

it('pressing attack while running gives a dash attack that slides in and knocks far', () => {
  const b = newAnimeBattle(e('riot'), e(), 1, 'manual');
  const [p, q] = setup(b, 4.5);
  p.pad = { x: 1, z: 0 };
  for (let i = 0; i < 20; i++) stepAnime(b, ANIME.dt);
  const x0 = p.x;
  giveCommand(b, 0, 'punch');
  const ev = run(b, 50, 0);
  expect(ev.some((x) => x.kind === 'power' && x.sp === 'dash')).toBe(true);
  expect(p.x - x0).toBeGreaterThan(1.2);
  expect(ev.some((x) => x.kind === 'hit')).toBe(true);
  expect(q.x).toBeGreaterThan(4.5);
});

it('a tech pressed right after a normal hit cancels the recovery (faster wind-up)', () => {
  const b = newAnimeBattle({ ...e(), techs: ['バンクバッシュ'] }, e(), 1, 'manual');
  const [p] = setup(b);
  giveCommand(b, 0, 'punch');
  let ev = run(b, 8, 0);
  expect(p.act.k === 'tech' && p.act.id === 'punch' && p.act.hit).toBe(true);
  expect(giveCommand(b, 0, 'バンクバッシュ')).toBe(true);
  ev = run(b, 1, 0);
  expect(ev.some((x) => x.kind === 'cancel')).toBe(true);
  expect(p.act.k === 'tech' && p.act.id).toBe('バンクバッシュ');
});

// コンボ4段め(2026-11-05): よけた・ジャストガードの あとの カウンター
it('dodging an attack opens a counter: the next attack is unblockable and stronger', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  const [p, q] = setup(b);
  // 相手の パンチを よける
  q.pad = { x: 0, z: 0 };
  q.face = Math.PI;
  giveCommand(b, 1, 'punch');
  p.act = { k: 'dodge', t: 0, dx: 0, dz: 1, jump: false };
  const ev = run(b, 6, 0);
  expect(ev.some((x) => x.kind === 'evaded')).toBe(true);
  expect(ev.some((x) => x.kind === 'counterReady')).toBe(true);
  expect(p.counterUntil).toBeGreaterThan(b.t);
  // 相手が ガードしていても 当たる
  run(b, 20, 0);
  p.x = 0; p.z = 0; q.x = 1.6; q.z = 0; p.face = 0;
  q.act = { k: 'guard', t: 1, until: 99 };
  giveCommand(b, 0, 'punch');
  const ev2 = run(b, 15, 0);
  expect(ev2.some((x) => x.kind === 'counter')).toBe(true);
  expect(ev2.some((x) => x.kind === 'hit' && x.counter)).toBe(true);
  expect(ev2.some((x) => x.kind === 'guardHit')).toBe(false);
});

it('a just guard also opens a counter; it closes after a short time', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual');
  const [p, q] = setup(b);
  q.pad = { x: 0, z: 0 };
  q.face = Math.PI;
  p.act = { k: 'guard', t: 0, until: 99 };
  giveCommand(b, 1, 'punch');
  const ev = run(b, 8, 0);
  expect(ev.some((x) => x.kind === 'guardHit' && x.just)).toBe(true);
  expect(ev.some((x) => x.kind === 'counterReady' && x.why === 'just')).toBe(true);
  run(b, 70, 0);
  expect(p.counterUntil).toBeLessThan(b.t);
  giveCommand(b, 0, 'punch');
  expect(run(b, 10, 0).some((x) => x.kind === 'counter')).toBe(false);
});

// コンボ5段め(2026-11-05): 空中の追い打ち・たたきつけ・しめ
it('pressing attack near a launched opponent jumps up for an air follow-up; pressing again keeps juggling, the 3rd spikes them down', () => {
  for (const sp of ['bunk', 'riot', 'grit', 'snek', 'vybe', 'shellz', 'mofu', 'zipp']) {
    const b = newAnimeBattle(e(sp), e(), 1, 'manual');
    const [p, q] = setup(b, 2.4);
    q.act = { k: 'air', t: 0 };
    q.y = 1.6;
    q.vy = 4;
    const ev = run(b, 90, 12);
    expect(ev.some((x) => x.kind === 'power' && x.sp === 'air'), sp).toBe(true);
    expect(ev.filter((x) => x.kind === 'hit').length, sp).toBeGreaterThanOrEqual(3);
    expect(ev.some((x) => x.kind === 'spike'), sp).toBe(true);
    run(b, 60, 0);
    expect(p.y, sp).toBe(0);
    expect(q.juggleN, sp).toBe(0);
  }
});

it('the last hit of a long normal chain is a finisher that launches', () => {
  const b = newAnimeBattle(e('bunk', 2), e(), 1, 'manual');
  const [, q] = setup(b, 1.6);
  // すでに 3発 受けている
  q.act = { k: 'hurt', t: 0, until: 1 };
  q.comboN = 3;
  q.comboStart = b.t;
  q.comboLast = b.t;
  const ev = run(b, 80, 9);
  expect(ev.some((x) => x.kind === 'finish')).toBe(true);
  expect(ev.some((x) => x.kind === 'hit' && x.big)).toBe(true);
});

it('right after a charged launch, the attack button works at once (no waiting) and jumps for the follow-up', () => {
  for (const sp of ['bunk', 'riot', 'shellz']) {
    const b = newAnimeBattle(e(sp), e(), 1, 'manual');
    const [p, q] = setup(b, 2.2);
    hold(b, 60);
    // はなして 強い1発 → ふっとぶまで
    let ev: AnimeBattle['events'] = [];
    for (let i = 0; i < 40 && q.act.k !== 'air'; i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
    expect(q.act.k, sp).toBe('air');
    // すぐ 押す(待ち時間の間でも)
    let chased = false;
    ev = [];
    for (let i = 0; i < 90; i++) {
      if (i % 10 === 0) expect(i > 0 || giveCommand(b, 0, 'punch'), sp).toBe(true);
      if (i % 10 === 0 && i > 0) giveCommand(b, 0, 'punch');
      b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events);
      if (b.events.some((x) => x.kind === 'power' && x.sp === 'air')) chased = true;
    }
    expect(chased, sp).toBe(true);
    expect(ev.filter((x) => x.kind === 'hit').length, sp).toBeGreaterThanOrEqual(2);
    void p;
  }
});

it('a guard dome can be cancelled midway with dodge (2026-11-05)', () => {
  const b = newAnimeBattle({ ...e(), techs: ['頑丈ドーム'] }, e(), 1, 'manual');
  const [p] = setup(b, 4);
  giveCommand(b, 0, '頑丈ドーム');
  run(b, 20, 0);
  expect(p.barrierUntil).toBeGreaterThan(b.t);
  p.pad = { x: 0, z: 1 };
  expect(giveCommand(b, 0, 'dodge')).toBe(true);
  run(b, 2, 0);
  expect(p.act.k).toBe('dodge');
  expect(p.barrierUntil).toBeLessThanOrEqual(b.t);
});

it('ZIPP electric dash chains like a combo (form 2: 3 in a row), then a short wait — no endless lock (2026-11-05)', () => {
  const b = newAnimeBattle(e('zipp', 2), e(), 1, 'manual');
  const [p, q] = setup(b, 5);
  const dashes: boolean[] = [];
  for (let k = 0; k < 4; k++) {
    q.x = p.x + 5; q.z = p.z; q.act = { k: 'free' };
    const ok = giveCommand(b, 0, 'punch');
    dashes.push(ok);
    if (!ok) break;
    let used = false;
    for (let i = 0; i < 200; i++) { stepAnime(b, ANIME.dt); if (p.act.k === 'tech') used = true; if (used && p.act.k === 'free') break; }
  }
  expect(dashes).toEqual([true, true, true, false]);
  for (let i = 0; i < 60; i++) stepAnime(b, ANIME.dt);
  expect(giveCommand(b, 0, 'punch')).toBe(true);
});

it('ZIPP electric dash has no wait between dashes of a chain (2026-11-05)', () => {
  const b = newAnimeBattle(e('zipp'), e(), 1, 'manual');
  const [p] = setup(b, 5);
  giveCommand(b, 0, 'punch');
  let used = false;
  for (let i = 0; i < 200; i++) { stepAnime(b, ANIME.dt); if (p.act.k === 'tech') used = true; if (used && p.act.k === 'free') break; }
  expect(used).toBe(true);
  expect(p.act.k).toBe('free');
  expect(giveCommand(b, 0, 'punch')).toBe(true);
});
