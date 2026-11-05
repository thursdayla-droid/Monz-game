import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { growTechs } from '../src/core/battle3d/techLearn';

// ガード(2026-11-04 企画者「その場で押すだけだとガード」「ずっとできない」「少しダメージ」「ジャストガード成功だとすぐ動ける」)
const st = { hp: 30, power: 30, tough: 30, speed: 12, tech: 16 };
const e = (species: string, techs: string[], form = 1): AnimeEntrant => ({ name: species, species, stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs, form } as AnimeEntrant);
const run = (b: ReturnType<typeof newAnimeBattle>, sec: number) => {
  const ev: AnimeEvent[] = [];
  for (let i = 0; i < sec / ANIME.dt && !animeFinished(b); i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  return ev;
};
const duel = (meSp = 'bunk', foeTechs: string[] = ['バンクバッシュ'], meTechs: string[] = []) => {
  const b = newAnimeBattle(e(meSp, meTechs), e('bunk', foeTechs), 5, 'manual');
  for (const f of b.f) { f.pad = { x: 0, z: 0 }; f.techMode = 'manual'; f.thinkT = 1e9; f.cooldown.dodge = 1e9; f.z = 0; }
  b.f[0].x = -2.5; b.f[1].x = 2.5;
  return b;
};
/** 相手のバンクバッシュを 受ける。guardAt: 何秒前に ガードを始めるか(null = ガードしない) */
const take = (guardLead: number | null, foe = 'バンクバッシュ', meSp = 'bunk') => {
  const b = duel(meSp, [foe]);
  giveCommand(b, 1, foe);
  // 当たる時刻を さがす(ガードなしで)
  const probe = duel(meSp, [foe]);
  giveCommand(probe, 1, foe);
  let tHit = 0;
  for (let i = 0; i < 3 / ANIME.dt; i++) { probe.events = []; stepAnime(probe, ANIME.dt); if (probe.events.some((x) => x.kind === 'hit')) { tHit = probe.t; break; } }
  const ev: AnimeEvent[] = [];
  let started = false;
  for (let i = 0; i < 3 / ANIME.dt; i++) {
    if (guardLead !== null && !started && b.t >= tHit - guardLead - ANIME.dt * 1.5) { started = true; b.f[0].guardHold = true; giveCommand(b, 0, 'guard'); }
    b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events);
  }
  return { b, ev, hp: b.f[0].hp, max: b.f[0].maxHp };
};

describe('ガード', () => {
  it('ガードすると 少しだけ ダメージ(2割くらい)', () => {
    const none = take(null);
    const g = take(0.5);
    const d0 = none.max - none.hp;
    const d1 = g.max - g.hp;
    expect(d1).toBeGreaterThan(0);
    expect(d1).toBeLessThan(d0 * 0.4);
    expect(g.ev.some((x) => x.kind === 'guardHit' && !x.just)).toBe(true);
  });
  it('ジャストガード: ダメージなし・すぐ動ける', () => {
    const g = take(0.05);
    expect(g.ev.some((x) => x.kind === 'guardHit' && x.just)).toBe(true);
    expect(g.hp).toBe(g.max);
  });
  it('ずっとは ガードできない(量が0で こわれる)', () => {
    const b = duel();
    b.f[0].guardHold = true;
    giveCommand(b, 0, 'guard');
    const ev = run(b, 8);
    expect(ev.some((x) => x.kind === 'guardBreak')).toBe(true);
  });
  it('はなすと ガードをやめる・量は もどる', () => {
    const b = duel();
    b.f[0].guardHold = true;
    giveCommand(b, 0, 'guard');
    run(b, 1);
    expect(b.f[0].act.k).toBe('guard');
    const g = b.f[0].guardGauge;
    b.f[0].guardHold = false;
    run(b, 3);
    expect(b.f[0].act.k).toBe('free');
    expect(b.f[0].guardGauge).toBeGreaterThan(g);
  });
  it('ガードは 待ち時間なしで 続けて出せる(2026-11-04 企画者)', () => {
    const b = duel();
    for (let k = 0; k < 4; k++) {
      b.f[0].guardHold = true;
      expect(giveCommand(b, 0, 'guard')).toBe(true);
      run(b, 0.3);
      expect(b.f[0].act.k).toBe('guard');
      b.f[0].guardHold = false;
      run(b, 0.05);
      expect(b.f[0].act.k).toBe('free');
    }
  });
  it('はさむ技・罠は ガードできない', () => {
    const b = newAnimeBattle(e('bunk', []), e('klak', ['背面クランプ'], 3), 5, 'manual');
    for (const f of b.f) { f.pad = { x: 0, z: 0 }; f.techMode = 'manual'; f.thinkT = 1e9; f.cooldown.dodge = 1e9; f.z = 0; }
    b.f[0].x = -2; b.f[1].x = 2;
    b.f[0].guardHold = true;
    giveCommand(b, 0, 'guard');
    run(b, 0.3);
    giveCommand(b, 1, '背面クランプ');
    const ev = run(b, 1.5);
    expect(ev.some((x) => x.kind === 'hit' && x.target === 0)).toBe(true);
  });
  it('CPU も ガードする・試合は ちゃんと終わる', () => {
    let guards = 0;
    for (let s = 0; s < 10; s++) {
      const mk = (sp: string) => ({ ...e(sp, growTechs(sp, 30, st as never, undefined, instinctFor('bunk', st)).state.equipped, 2), proficiency: { attack: 4, defense: 5, evasion: 3, counter: 3, spacing: 3 } }) as AnimeEntrant;
      const b = newAnimeBattle(mk('bunk'), mk('zipp'), s + 1, 'auto');
      const ev = run(b, 200);
      guards += ev.filter((x) => x.kind === 'guard').length;
      expect(animeFinished(b)).toBe(true);
    }
    expect(guards).toBeGreaterThan(0);
  });
});
