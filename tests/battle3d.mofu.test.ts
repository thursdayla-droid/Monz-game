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
  it('MOFU の通常攻撃は ツルのムチ(中くらいの距離。BUNK のパンチより遠くまで)・火は BUNK だけ', () => {
    const b = newAnimeBattle(e('mofu', [], 1), e('bunk', [], 3), 4, 'manual');
    expect(b.f[0].jab.whip).toBe(true);
    expect(b.f[0].jab.range).toBeGreaterThan(3);
    expect(b.f[0].jab.fire).toBe(0);
    expect(b.f[1].jab.fire).toBe(2);
    // 3m はなれた相手に当たる(BUNK のパンチでは とどかない)
    quiet(b);
    const [p, q] = b.f;
    p.x = 0; q.x = 3; p.z = q.z = 0; p.face = 0;
    giveCommand(b, 0, 'punch');
    const ev = run(b, 1);
    expect(ev.filter((x) => x.kind === 'hit').length).toBe(1);
    // MOFUR は2発・MOFUGARD は3発
    for (const [form, want] of [[2, 2], [3, 3]] as const) {
      const bf = newAnimeBattle(e('mofu', [], form), e('bunk', [], 1), 4, 'manual');
      quiet(bf);
      bf.f[0].x = 0; bf.f[1].x = 3; bf.f[0].z = bf.f[1].z = 0; bf.f[0].face = 0;
      // 押すたびに1発(2026-11-04)。続けて押すと 2発・3発
      let n = 0;
      for (let i = 0; i < 72; i++) { if (i % 9 === 0) giveCommand(bf, 0, 'punch'); n += run(bf, 1 / 60).filter((x) => x.kind === 'hit').length; }
      expect(n).toBe(want);
    }
    const b2 = newAnimeBattle(e('bunk', [], 1), e('bunk', [], 1), 4, 'manual');
    quiet(b2);
    b2.f[0].x = 0; b2.f[1].x = 3; b2.f[0].z = b2.f[1].z = 0; b2.f[0].face = 0;
    giveCommand(b2, 0, 'punch');
    expect(run(b2, 1).filter((x) => x.kind === 'hit').length).toBe(0);
  });
});
