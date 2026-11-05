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

it('new 5 species moves each have their own motion and hit an opponent in front', async () => {
  const { BEAST } = await import('../src/core/battle3d/beastScripts');
  const miss: string[] = [];
  for (const name of Object.keys(BEAST)) {
    const row = NEW5.flatMap((sp) => learnset(sp)).find((r) => r.name === name);
    expect(row, name).toBeTruthy();
    let ok = false;
    for (const gap of [2.2, 4]) {
      const b = newAnimeBattle(e(row!.species, [name]), e('bunk', []), 5, 'manual');
      const [p, q] = b.f;
      p.pad = { x: 0, z: 0 };
      q.pad = { x: 0, z: 0 };
      p.x = 0; q.x = gap; p.z = q.z = 0; p.face = 0; q.thinkT = 99;
      q.cooldown.dodge = q.cooldown.guard = 99;
      giveCommand(b, 0, name);
      for (let i = 0; i < 240 && !ok; i++) { b.events = []; stepAnime(b, ANIME.dt); if (b.events.some((x) => x.kind === 'hit' && x.side === 0)) ok = true; }
      if (ok) break;
    }
    if (!ok) miss.push(name);
  }
  expect(miss).toEqual([]);
});

it('GRIT 頑固ガード: hardens the body (no dome) — hits do not make it flinch and do less damage', () => {
  const b = newAnimeBattle(e('grit', ['頑固ガード']), e('bunk', []), 3, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  p.x = 0; q.x = 1.6; q.face = Math.PI; p.face = 0;
  giveCommand(b, 0, '頑固ガード');
  for (let i = 0; i < 30; i++) stepAnime(b, ANIME.dt);
  expect(p.barrierUntil).toBeLessThan(b.t);
  expect(p.armorUntil ?? 0).toBeGreaterThan(b.t);
  let hurt = false;
  for (let i = 0; i < 90; i++) { if (i % 15 === 0) { q.face = Math.PI; giveCommand(b, 1, 'punch'); } stepAnime(b, ANIME.dt); if (p.act.k === 'hurt') hurt = true; }
  expect(hurt).toBe(false);
  expect(p.hp).toBeLessThan(p.maxHp);
});

it('SNEK 影の抜け殻 leaves the shadow where it was and slides back; 黒蛇玉 weaves; GRIT 黒い息 is slow and big', () => {
  const b = newAnimeBattle(e('snek', ['影の抜け殻', '黒蛇玉']), e('bunk', []), 3, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  q.thinkT = 99;
  p.x = 0; q.x = 4; p.face = 0;
  giveCommand(b, 0, '影の抜け殻');
  for (let i = 0; i < 60; i++) stepAnime(b, ANIME.dt);
  expect(b.fields.some((fl) => fl.tech === '影の抜け殻' && Math.abs(fl.x) < 0.6)).toBe(true);
  expect(p.x).toBeLessThan(-0.8);
  giveCommand(b, 0, '黒蛇玉');
  for (let i = 0; i < 40 && !b.shots.length; i++) stepAnime(b, ANIME.dt);
  expect(b.shots[0]?.zig).toBe(1);
  const g = newAnimeBattle(e('grit', ['黒い息']), e('bunk', []), 3, 'manual');
  g.f[0].pad = { x: 0, z: 0 };
  g.f[1].pad = { x: 0, z: 0 };
  g.f[1].x = 8;
  giveCommand(g, 0, '黒い息');
  for (let i = 0; i < 40 && !g.shots.length; i++) stepAnime(g, ANIME.dt);
  const s = g.shots[0];
  expect(Math.hypot(s.vx, s.vz)).toBeLessThan(getTech('黒い息').speed * 0.6);
});
