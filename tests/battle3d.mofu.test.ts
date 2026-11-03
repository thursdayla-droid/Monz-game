import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { checkRows, getTech, learnset } from '../src/core/battle3d/techTable';
import { growTechs } from '../src/core/battle3d/techLearn';

const st = { hp: 30, power: 30, tough: 30, speed: 12, tech: 16 };
const e = (species: string, techs: string[], form = 1): AnimeEntrant => ({ name: species, species, stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs, form } as AnimeEntrant);
const quiet = (b: ReturnType<typeof newAnimeBattle>) => b.f.forEach((f) => { f.pad = { x: 0, z: 0 }; f.thinkT = 1e9; f.cooldown.dodge = 1e9; });
const run = (b: ReturnType<typeof newAnimeBattle>, sec: number) => {
  const ev: AnimeEvent[] = [];
  for (let i = 0; i < sec / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  return ev;
};

describe('MOFU の技 (2026-11-03)', () => {
  it('17技・Lv.1 は2つ・表にまちがいがない', () => {
    expect(learnset('mofu')).toHaveLength(17);
    expect(checkRows()).toEqual([]);
    expect(growTechs('mofu', 1, st as never, undefined, instinctFor('bunk', st)).state.learned).toEqual(['ふわころ', 'わたげだま']);
    expect(getTech('いやしのしずく').kind).toBe('heal');
    expect(getTech('もりの息吹').kind).toBe('buff');
    expect(getTech('いやしの根脈').kind).toBe('drain');
  });
  it('回復: 最大HPの18%。1試合の合計は80%まで', () => {
    const b = newAnimeBattle(e('mofu', ['いやしのしずく']), e('bunk', []), 1, 'manual');
    quiet(b);
    const p = b.f[0];
    p.hp = 10;
    giveCommand(b, 0, 'いやしのしずく');
    run(b, 2);
    expect(p.hp).toBe(10 + Math.round(p.maxHp * 0.18));
    for (let i = 0; i < 6; i++) {
      p.cooldown['いやしのしずく'] = 0;
      giveCommand(b, 0, 'いやしのしずく');
      run(b, 2);
    }
    expect(p.healed).toBe(Math.round(p.maxHp * 0.8));
  });
  it('強化(もりの息吹): しばらく受けるダメージが減る', () => {
    const dmg = (buff: boolean) => {
      const b = newAnimeBattle(e('mofu', ['もりの息吹']), e('bunk', ['ポンポンショット']), 7, 'manual');
      quiet(b);
      const [p, q] = b.f;
      p.x = 3; q.x = -3; p.z = q.z = 0; q.face = 0;
      if (buff) { giveCommand(b, 0, 'もりの息吹'); run(b, 1); }
      q.stats = { ...q.stats, tech: 0 };
      const hp0 = p.hp;
      giveCommand(b, 1, 'ポンポンショット');
      run(b, 1.2);
      return hp0 - p.hp;
    };
    expect(dmg(true)).toBeLessThan(dmg(false));
  });
  it('吸収: 当てたダメージの半分を回復', () => {
    const b = newAnimeBattle(e('mofu', ['いやしの根脈']), e('bunk', []), 2, 'manual');
    quiet(b);
    const [p, q] = b.f;
    p.x = -3; q.x = 3; p.z = q.z = 0; p.face = 0;
    p.hp = 20;
    giveCommand(b, 0, 'いやしの根脈');
    const ev = run(b, 1.5);
    const hit = ev.find((x) => x.kind === 'hit');
    const heal = ev.find((x) => x.kind === 'heal');
    expect(hit && heal).toBeTruthy();
    if (hit?.kind === 'hit' && heal?.kind === 'heal') expect(heal.amount).toBe(Math.round(hit.damage * 0.5));
  });
  it('千花天幕: 自分の足もとの場。中にいると回復する', () => {
    const b = newAnimeBattle(e('mofu', ['千花天幕'], 3), e('bunk', []), 3, 'manual');
    quiet(b);
    const p = b.f[0];
    p.hp = 30;
    giveCommand(b, 0, '千花天幕');
    const ev = run(b, 4);
    expect(b.fields.some((f) => f.self) || ev.some((x) => x.kind === 'heal' && x.why === '場')).toBe(true);
    expect(ev.filter((x) => x.kind === 'heal' && x.why === '場').length).toBeGreaterThanOrEqual(2);
  });
  it('MOFU(Lv.1)の通常攻撃は ちょっこりタックル(少し前へ)・火は BUNK だけ', () => {
    const b = newAnimeBattle(e('mofu', [], 1), e('bunk', [], 3), 4, 'manual');
    expect(b.f[0].jab.step).toBeGreaterThan(0);
    expect(b.f[0].jab.fire).toBe(0);
    const b2 = newAnimeBattle(e('mofu', [], 3), e('bunk', [], 3), 4, 'manual');
    expect(b2.f[0].jab.fire).toBe(0);
    expect(b2.f[1].jab.fire).toBe(2);
  });
});
