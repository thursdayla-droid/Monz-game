import { it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant } from '../src/core/battle3d/anime';
import { checkRows, getTech, learnset } from '../src/core/battle3d/techTable';
import { growTechs } from '../src/core/battle3d/techLearn';
import { speciesStats } from '../src/core/stats';

// 2026-11-05 新しい5体の 技(企画者の設計案 docs/NEW5_TECHS.md)
const NEW5 = ['riot', 'snek', 'grit', 'vybe', 'shellz'];
const st = { hp: 300, power: 36, tough: 32, speed: 12, tech: 16 };
const e = (species: string, techs: string[], form = 3): AnimeEntrant => ({ name: 'X', species, form, stats: st, instinct: instinctFor(species, st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs } as AnimeEntrant);

it('each new species has 17 moves in the table with no mistakes', () => {
  expect(checkRows()).toEqual([]);
  for (const sp of NEW5) expect(learnset(sp).length, sp).toBe(17);
});

it('every move of the new 5 species can be used and ends (nobody gets stuck)', () => {
  for (const sp of NEW5)
    for (const r of learnset(sp)) {
      const b = newAnimeBattle(e(sp, [r.name]), e('bunk', []), 5, 'manual');
      const [p, q] = b.f;
      p.pad = { x: 0, z: 0 };
      q.pad = { x: 0, z: 0 };
      p.x = 0; q.x = 3; p.z = q.z = 0; p.face = 0;
      expect(giveCommand(b, 0, r.name), r.name).toBe(true);
      let used = false;
      for (let i = 0; i < 600 && !animeFinished(b); i++) {
        stepAnime(b, ANIME.dt);
        if (p.act.k === 'tech' && p.act.id === r.name) used = true;
        if (used && p.act.k === 'free') break;
      }
      expect(used, r.name).toBe(true);
      expect(p.act.k, `${sp} ${r.name}`).not.toBe('tech');
    }
});

it('only the moves the plan says "launch" lift the opponent (others push)', () => {
  expect(getTech('火花爪').launch).toBeGreaterThan(0);
  expect(getTech('シェルブレイカー').launch).toBeGreaterThan(0);
  expect(getTech('悪噛み').launch).toBe(0);
  expect(getTech('ドスンヘッド').launch).toBe(0);
});

it('a new species learns its moves by level and the CPU (rival) uses them', () => {
  for (const sp of NEW5) {
    const s = speciesStats(sp as never).base;
    const g = growTechs(sp, 40, { ...s, power: s.power + 20 }, undefined, instinctFor(sp, s));
    expect(g.state.learned.length, sp).toBeGreaterThanOrEqual(9);
    expect(g.state.equipped.length, sp).toBe(4);
    // CPU どうしで 戦うと 技を 使う
    const b = newAnimeBattle(e(sp, g.state.equipped, 2), e(sp, g.state.equipped, 2), 7);
    const used = new Set<string>();
    for (let i = 0; i < 60 / ANIME.dt && !animeFinished(b); i++) {
      b.events = [];
      stepAnime(b, ANIME.dt);
      for (const x of b.events) if (x.kind === 'call') used.add(x.tech);
    }
    expect([...used].filter((n) => g.state.equipped.includes(n)).length, sp).toBeGreaterThanOrEqual(2);
  }
});

it('roars do not reach a floating opponent', () => {
  const b = newAnimeBattle(e('grit', ['ドスグロウル']), e('bunk', []), 3, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  p.x = 0; q.x = 2.5; p.face = 0;
  q.act = { k: 'air', t: 0 }; q.y = 2; q.vy = 3; q.floatUntil = 9;
  giveCommand(b, 0, 'ドスグロウル');
  for (let i = 0; i < 40; i++) stepAnime(b, ANIME.dt);
  expect(q.atkDownUntil).toBe(0);
});
