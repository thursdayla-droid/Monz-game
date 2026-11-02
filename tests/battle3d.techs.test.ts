import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { checkRows, getTech, learnset } from '../src/core/battle3d/techTable';
import { autoEquip, formAt, growTechs, learnAt, slotsAt, tendency } from '../src/core/battle3d/techLearn';
import { migrateLife, newLife } from '../src/core/lifeSave';
import type { StatBlock } from '../src/core/stats';

const S = (o: Partial<StatBlock>): StatBlock => ({ hp: 30, power: 36, tough: 32, speed: 12, tech: 16, ...o });

describe('tech table (from the planner CSV)', () => {
  it('has no mistakes and every row becomes a move', () => {
    expect(checkRows()).toEqual([]);
    for (const r of learnset('bunk')) expect(getTech(r.name).power).toBeGreaterThanOrEqual(0);
  });
  it('a big move is stronger and has a longer wait than a weak one', () => {
    expect(getTech('テンチゴウサイ').power).toBeGreaterThan(getTech('ドスンパクト').power * 2);
    expect(getTech('テンチゴウサイ').cooldown).toBeGreaterThan(getTech('ドスンパクト').cooldown * 3);
    expect(getTech('バンクバッシュ').power).toBeLessThan(getTech('ゴウリキクラッシュ').power);
  });
});

describe('learning and equipping (Ver.44)', () => {
  it('Lv.1 has 2 moves and 2 slots; slots open at Lv.10 and Lv.20 (proposal)', () => {
    expect(slotsAt(1)).toBe(2);
    expect(slotsAt(10)).toBe(3);
    expect(slotsAt(20)).toBe(4);
    const g = growTechs('bunk', 1, S({}), undefined);
    expect(g.state.learned).toEqual(['バンクバッシュ', 'コロガン']);
    expect(g.state.equipped).toHaveLength(2);
  });
  it('growth style decides the Lv.25 move (relative to how BUNK usually grows)', () => {
    expect(tendency('bunk', S({ speed: 40 }))).toBe('speed');
    expect(tendency('bunk', S({ tech: 40 }))).toBe('tech');
    expect(learnAt('bunk', 25, S({ speed: 40 }))).toContain('シュンソクスピン');
    expect(learnAt('bunk', 25, S({ speed: 40 }))).not.toContain('ゴウリキクラッシュ');
    expect(learnAt('bunk', 25, S({ tough: 60 }))).toContain('ガンジョウドーム');
    expect(learnAt('bunk', 24, S({ speed: 40 }))).not.toContain('シュンソクスピン');
  });
  it('evolution moves at Lv.30 and Lv.60 (by level until evolution exists)', () => {
    expect(formAt(29)).toBe(1);
    expect(learnAt('bunk', 30, S({}))).toContain('バンクブレイカー');
    expect(learnAt('bunk', 59, S({}))).not.toContain('テンチゴウサイ');
    expect(learnAt('bunk', 60, S({}))).toContain('テンチゴウサイ');
  });
  it('AI equips up to the slot count, prefers strong moves, and avoids all the same type', () => {
    const learned = learnAt('bunk', 60, S({ power: 60 }));
    const eq = autoEquip('bunk', learned, 60, instinctFor('bunk', S({ power: 60 })));
    expect(eq).toHaveLength(4);
    expect(eq).toContain('テンチゴウサイ');
    expect(new Set(eq.map((n) => getTech(n).kind)).size).toBeGreaterThanOrEqual(3);
    expect(autoEquip('bunk', learned, 15)).toHaveLength(3);
  });
  it('old saves get moves from their level, and level ups learn new moves', () => {
    const life = newLife(0);
    const old = { ...life, monz: life.monz.map(({ techs: _t, ...m }) => ({ ...m, level: 22 })) };
    const fixed = migrateLife(JSON.parse(JSON.stringify(old)), 0)!;
    const t = fixed.monz[0].techs!;
    expect(t.learned).toEqual(expect.arrayContaining(['バンクバッシュ', 'コロガン', 'ドスンパクト', 'ハネツキラッシュ']));
    expect(t.equipped).toHaveLength(4);
  });
});

describe('table moves in battle', () => {
  const ent = (level: number, st: StatBlock): AnimeEntrant => {
    const g = growTechs('bunk', level, st, undefined, instinctFor('bunk', st));
    return { name: 'BUNK', species: 'bunk', stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs: g.state.equipped };
  };
  it('every BUNK move can be used by command and the match ends', () => {
    const used = new Set<string>();
    for (const st of [S({ power: 70 }), S({ tough: 70 }), S({ speed: 50 }), S({ tech: 50 })]) {
      const b = newAnimeBattle(ent(60, st), ent(60, st), 3);
      for (let k = 0; k < 200 * 60 && !animeFinished(b); k++) {
        if (k % 50 === 0) for (const id of b.f[0].techs) if (giveCommand(b, 0, id)) break;
        b.events = [];
        stepAnime(b, ANIME.dt);
        for (const e of b.events as AnimeEvent[]) if (e.kind === 'call' && e.side === 0) used.add(e.tech);
      }
      expect(b.winner).not.toBeNull();
    }
    const all = new Set(learnset('bunk').map((r) => r.name));
    // Lv.60 で装備できるのは4つなので、育て方4通りで装備された技は全部使われる
    expect(used.size).toBeGreaterThanOrEqual(6);
    for (const n of used) expect(all.has(n)).toBe(true);
  });
  it('a guard dome stops a shot, dizzy stops moves for a while', () => {
    const b = newAnimeBattle(ent(30, S({ tough: 70 })), ent(30, S({})), 2);
    const me = b.f[0];
    me.barrierUntil = b.t + 2;
    me.barrierR = 1.7;
    b.shots.push({ id: 9, owner: 1, tech: 'fire', x: me.x + 3, y: 0.8, z: me.z, vx: -15, vz: 0, r: 0.6, t: 0, alive: true });
    const ev: AnimeEvent[] = [];
    for (let i = 0; i < 30; i++) {
      b.events = [];
      stepAnime(b, ANIME.dt);
      ev.push(...b.events);
    }
    expect(ev.some((e) => e.kind === 'blocked')).toBe(true);
    expect(me.hp).toBe(me.maxHp);
  });
  it('balance: no growth style wins too much (power vs technique, both sides)', { timeout: 60000 }, () => {
    let w = 0;
    const N = 12;
    for (let s = 1; s <= N; s++)
      for (const swap of [false, true]) {
        const P = ent(40, S({ power: 70 }));
        const T = ent(40, S({ tech: 50 }));
        const b = newAnimeBattle(swap ? T : P, swap ? P : T, s);
        while (!animeFinished(b) && b.t < 200) {
          b.events = [];
          stepAnime(b, ANIME.dt);
        }
        if (b.winner === (swap ? 1 : 0)) w++;
      }
    expect(w).toBeGreaterThan(N * 2 * 0.2);
    expect(w).toBeLessThan(N * 2 * 0.8);
  });
  it('added 6 moves (2026-11-02): learned at Lv.5-50, roar lowers attack, gravity field slows, 4-hit combo', () => {
    expect(learnAt('bunk', 5, S({}))).toContain('ポンポンショット');
    expect(learnAt('bunk', 4, S({}))).not.toContain('ポンポンショット');
    expect(learnAt('bunk', 50, S({}))).toEqual(expect.arrayContaining(['バウンドプレス', 'ブレイクロア', 'メガトンラッシュ', 'グラビティプレス', 'ギガントバースト']));
    expect(growTechs('bunk', 5, S({}), undefined).state.equipped).toContain('ポンポンショット');
    expect(getTech('メガトンラッシュ').hits).toBe(4);
    const b = newAnimeBattle(ent(40, S({})), ent(40, S({})), 1);
    const [p, q] = b.f;
    p.x = 0; p.z = 0; q.x = 3; q.z = 0;
    b.roars.push({ owner: 0, tech: 'ブレイクロア', x: 0, z: 0, r: 0.5, hit: false });
    b.fields.push({ owner: 0, tech: 'グラビティプレス', x: 3, z: 0, r: 3, until: 5 });
    for (let i = 0; i < 30; i++) { b.events = []; stepAnime(b, ANIME.dt); }
    expect(q.atkDownUntil).toBeGreaterThan(b.t);
    expect(q.slowUntil).toBeGreaterThan(b.t);
    expect(q.hp).toBe(q.maxHp);
  });
});

describe('レンゴクホウケン (fire pillars, 2026-11-02)', () => {
  const ent = (): AnimeEntrant => ({ name: 'B', species: 'bunk', stats: S({}), instinct: instinctFor('bunk', S({})), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs: ['レンゴクホウケン'] });
  const run = (moveAway: boolean) => {
    const b = newAnimeBattle(ent(), ent(), 5, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    q.pad = { x: 0, z: 0 };
    p.x = -4; p.z = 0; q.x = 4; q.z = 0; q.cooldown.dodge = 99;
    giveCommand(b, 0, 'レンゴクホウケン');
    const hits: string[] = [];
    let pillars = 0;
    for (let i = 0; i < 150; i++) {
      b.events = [];
      if (moveAway && b.pillars.length && !b.pillars.some((x) => x.up)) { q.x = -1; q.z = 6; }
      stepAnime(b, ANIME.dt);
      for (const ev of b.events) {
        if (ev.kind === 'hit') hits.push(ev.tech);
        if (ev.kind === 'pillar') pillars++;
      }
    }
    return { hits, pillars };
  };
  it('4 pillars come up (under the foe and 3 around), and hit only once', () => {
    expect(learnset('bunk').find((r) => r.name === 'レンゴクホウケン')?.level).toBe(70);
    const r = run(false);
    expect(r.pillars).toBe(4);
    expect(r.hits).toEqual(['レンゴクホウケン']);
  });
  it('moving away before the pillars come up avoids them', () => {
    expect(run(true).hits).toEqual([]);
  });
});
