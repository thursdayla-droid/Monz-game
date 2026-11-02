import { it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant } from '../src/core/battle3d/anime';
const st = { hp: 30, power: 36, tough: 32, speed: 12, tech: 16 };
const e = (): AnimeEntrant => ({ name: 'B', species: 'bunk', stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs: ['バンクバッシュ'] });
it('normal attack: punch in place, 3 hits if the first lands, 0.5s cooldown after, also in the air', () => {
  const b = newAnimeBattle(e(), e(), 1, 'manual'); const [p, q] = b.f; p.pad = { x: 0, z: 0 };
  p.x = 0; p.z = 0; q.x = 1.6; q.z = 0; p.face = 0; q.thinkT = 99; q.cooldown.dodge = 99;
  giveCommand(b, 0, 'punch'); let hits = 0;
  for (let i = 0; i < 40; i++) { b.events = []; stepAnime(b, ANIME.dt); for (const ev of b.events) if (ev.kind === 'hit') hits++; }

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
    giveCommand(b, 0, 'punch');
    let hits = 0;
    for (let i = 0; i < 60; i++) { b.events = []; stepAnime(b, ANIME.dt); for (const ev of b.events) if (ev.kind === 'hit') hits++; }
    expect(hits).toBe(want);
  }
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
