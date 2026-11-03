import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { getTech, learnset } from '../src/core/battle3d/techTable';
import { growTechs } from '../src/core/battle3d/techLearn';
import { LOST_TEMPLE } from '../src/core/battle3d/arena';

// ZIPP・PUNI・KLAK の技(2026-11-03 企画者「送ったモンスターも技をつけてほしい」。中身は技リスト案から【仮】)
const st = { hp: 30, power: 30, tough: 30, speed: 12, tech: 16 };
const e = (species: string, techs: string[], form = 1): AnimeEntrant => ({ name: species, species, stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs, form } as AnimeEntrant);
const run = (b: ReturnType<typeof newAnimeBattle>, sec: number) => {
  const ev: AnimeEvent[] = [];
  for (let i = 0; i < sec / ANIME.dt && !animeFinished(b); i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  return ev;
};

describe('ZIPP・PUNI・KLAK の技', () => {
  for (const sp of ['zipp', 'puni', 'klak']) {
    it(`${sp}: 17技・どの技も使える`, () => {
      const rows = learnset(sp);
      expect(rows).toHaveLength(17);
      for (const r of rows) {
        const b = newAnimeBattle(e(sp, [r.name], 3), e('bunk', [], 1), 3, 'manual');
        b.f[0].x = -3; b.f[1].x = 3;
        b.f[1].thinkT = 1e9;
        b.f[1].cooldown.dodge = 1e9;
        giveCommand(b, 0, r.name);
        const ev = run(b, 3);
        expect(ev.some((x) => x.kind === 'call' || x.kind === 'hit' || x.kind === 'heal' || x.kind === 'buff'), r.name).toBe(true);
        expect(getTech(r.name).power).toBeGreaterThanOrEqual(0);
      }
    });
    it(`${sp}: Lv.1・30・60 で自動の技えらび → 試合が終わる`, () => {
      for (const lv of [1, 30, 60]) {
        const form = lv >= 60 ? 3 : lv >= 30 ? 2 : 1;
        const g = growTechs(sp, lv, st as never, undefined, instinctFor('bunk', st)).state.equipped;
        expect(g.length).toBeGreaterThan(0);
        const b = newAnimeBattle(e(sp, g, form), e('bunk', growTechs('bunk', lv, st as never, undefined, instinctFor('bunk', st)).state.equipped, form), lv, 'auto', LOST_TEMPLE);
        run(b, 200);
        expect(animeFinished(b)).toBe(true);
      }
    });
  }
  it('防御ダウン: 受けるダメージが上がる(アーマーブレイク音波)', () => {
    expect(getTech('アーマーブレイク音波').effect).toBe('防御ダウン');
    const b = newAnimeBattle(e('klak', ['アーマーブレイク音波'], 2), e('bunk', [], 1), 5, 'manual');
    b.f[0].x = -2; b.f[1].x = 2;
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9;
    giveCommand(b, 0, 'アーマーブレイク音波');
    const ev = run(b, 3);
    expect(ev.some((x) => x.kind === 'status' && x.effect === '防御ダウン')).toBe(true);
    expect(b.f[1].defDownUntil).toBeGreaterThan(b.t);
  });
});
