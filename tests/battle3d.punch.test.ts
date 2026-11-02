import { it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, commandState, type AnimeEntrant } from '../src/core/battle3d/anime';
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
