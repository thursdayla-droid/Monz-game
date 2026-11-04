import { it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeBattle, type AnimeEntrant } from '../src/core/battle3d/anime';
const st = { hp: 30, power: 36, tough: 32, speed: 12, tech: 16 };
const e = (): AnimeEntrant => ({ name: 'B', species: 'bunk', stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs: ['バンクバッシュ'] });
/** ボタンを 0.15秒ごとに 押す(連打)。2026-11-04 から 押すたびに1発 */
const mash = (b: AnimeBattle, frames: number, on?: (ev: AnimeBattle['events'][number]) => void, until = frames) => {
  for (let i = 0; i < frames; i++) { if (i % 9 === 0 && i < until) giveCommand(b, 0, 'punch'); b.events = []; stepAnime(b, ANIME.dt); if (on) for (const ev of b.events) on(ev); }
};
it('normal attack: one press = one hit; mashing gives 3 hits, then a cooldown; also in the air', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual'); const [p, q] = b.f; p.pad = { x: 0, z: 0 };
  p.x = 0; p.z = 0; q.x = 1.6; q.z = 0; p.face = 0; q.thinkT = 99; q.cooldown.dodge = 99;
  // 1回だけ 押すと 1発
  let one = 0;
  giveCommand(b, 0, 'punch');
  for (let i = 0; i < 60; i++) { b.events = []; stepAnime(b, ANIME.dt); for (const ev of b.events) if (ev.kind === 'hit') one++; }
  expect(one).toBe(1);
  for (let i = 0; i < 90; i++) { b.events = []; stepAnime(b, ANIME.dt); }
  p.x = 0; p.z = 0; q.x = 1.6; q.z = 0; p.face = 0;
  let hits = 0;
  mash(b, 50, (ev) => { if (ev.kind === 'hit') hits++; });

  expect(hits).toBe(3);
  expect(giveCommand(b, 0, 'punch')).toBe(false);
  // 空中
  for (let i = 0; i < 80; i++) { b.events = []; stepAnime(b, ANIME.dt); }
  q.x = p.x + 1.6; q.z = p.z; p.face = 0; giveCommand(b, 0, 'jump'); for (let i = 0; i < 10; i++) { b.events = []; stepAnime(b, ANIME.dt); }
  expect(p.y).toBeGreaterThan(0.3);
  expect(giveCommand(b, 0, 'punch')).toBe(true); b.events = []; stepAnime(b, ANIME.dt);
  expect(p.act.k).toBe('tech');
});

it('evolution changes the normal attack (form 2: 4 hits, form 3: 5 hits, longer reach)', () => {
  for (const [form, want] of [[1, 3], [2, 4], [3, 5]] as const) {
    const b = newAnimeBattle({ ...e(), form }, e(), 1, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    p.x = 0; p.z = 0; q.x = form === 3 ? 2.6 : 1.6; q.z = 0; p.face = 0; q.thinkT = 99; q.cooldown.dodge = 99;
    let hits = 0;
    let fire = 0;
    mash(b, 100, (ev) => { if (ev.kind === 'hit') ev.tech === 'punchFire' ? fire++ : hits++; }, 15 * want - 10);
    expect(hits).toBe(want);
    // 最終進化だけ、さいごに火の玉が飛ぶ(2026-11-02)
    expect(fire).toBe(form === 3 ? 1 : 0);
  }
});

it('evolved punches step forward; form 3 throws a short fireball even when the punch misses', () => {
  for (const form of [1, 2] as const) {
    const b = newAnimeBattle({ ...e(), form }, e(), 1, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    p.x = 0; p.z = 0; q.x = 2.4; q.z = 0; p.face = 0; q.thinkT = 99; q.cooldown.dodge = 99;
    mash(b, 70);
    if (form === 1) expect(p.x).toBeCloseTo(0, 1);
    else expect(p.x).toBeGreaterThan(0.2);
  }
  const b = newAnimeBattle({ ...e(), form: 3 }, e(), 1, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  p.x = 0; p.z = 0; q.x = 5.5; q.z = 0; p.face = 0; q.thinkT = 99; q.cooldown.dodge = 99;
  const got: string[] = [];
  // 相手が ガードすることも あるので、火の玉が はじけた所で 数える
  mash(b, 130, (ev) => { if (ev.kind === 'hit') got.push(ev.tech); else if (ev.kind === 'explode' && ev.tech === 'punchFire') got.push('boom'); }, 70);
  expect(got.filter((x) => x === 'punch')).toEqual([]);
  expect(got.length).toBeGreaterThan(0);
});

it('ukemi: pressing dodge while knocked into the air or down gets up with a roll', () => {
  const b = newAnimeBattle(e(), e(), 2, 'manual');
  const p = b.f[0];
  p.pad = { x: 0, z: 0 };
  b.f[1].thinkT = 99;
  p.act = { k: 'air', t: 0 };
  p.vy = 5; p.y = 0.5;
  giveCommand(b, 0, 'dodge');
  const ev: string[] = [];
  for (let i = 0; i < 60; i++) { b.events = []; stepAnime(b, ANIME.dt); for (const x of b.events) ev.push(x.kind); }
  expect(ev).toContain('ukemi');
  expect(p.act.k).not.toBe('down');
});

it('while knocked down, buttons are not reserved (only dodge for ukemi)', () => {
  const b = newAnimeBattle(e(), e(), 3, 'manual');
  const p = b.f[0];
  p.pad = { x: 0, z: 0 };
  p.act = { k: 'down', t: 0, until: 1 };
  expect(giveCommand(b, 0, 'punch')).toBe(false);
  expect(giveCommand(b, 0, 'バンクバッシュ')).toBe(false);
  expect(giveCommand(b, 0, 'dodge')).toBe(true);
});

it('guard dome: when it is hit, it bursts and the blast hits a nearby attacker', () => {
  const b = newAnimeBattle(e(), e(), 4, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  p.x = 0; p.z = 0; q.x = 1.6; q.z = 0; q.face = Math.PI; p.thinkT = 99; q.thinkT = 99; q.cooldown.dodge = 99;
  p.barrierUntil = 5; p.barrierR = 1.7;
  q.pad = { x: 0, z: 0 };
  giveCommand(b, 1, 'punch');
  const ev: string[] = [];
  for (let i = 0; i < 60; i++) { b.events = []; stepAnime(b, ANIME.dt); for (const x of b.events) ev.push(x.kind); }
  expect(ev).toContain('domeBurst');
  expect(p.hp).toBe(p.maxHp);
  expect(q.hp).toBeLessThan(q.maxHp);
});
