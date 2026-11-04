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

describe('ZIPP らしい動き (2026-11-03 企画者)', () => {
  const setup = (form = 1) => {
    const b = newAnimeBattle(e('zipp', ['ジップタックル', '閃走ラッシュ', 'ジグザグスピン'], form), e('bunk', [], 1), 7, 'manual');
    b.f[0].pad = { x: 0, z: 0 };
    b.f[0].techMode = 'manual';
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9; b.f[1].pad = { x: 0, z: 0 };
    return b;
  };
  it('電撃ダッシュ: ためた分 遠くへ走る・ためるほど強い', () => {
    const go = (hold: number) => {
      const b = setup();
      b.f[0].x = -12; b.f[1].x = 12; b.f[0].z = b.f[1].z = 0;
      b.f[0].hold = true;
      giveCommand(b, 0, 'punch');
      run(b, hold);
      b.f[0].hold = false;
      const x0 = b.f[0].x;
      run(b, 1);
      return b.f[0].x - x0;
    };
    const tap = go(0.05);
    const full = go(1.2);
    expect(tap).toBeGreaterThan(2);
    expect(tap).toBeLessThan(3.5);
    expect(full).toBeGreaterThan(5.5);
  });
  it('電撃ダッシュ: 当たる・ためたほうがダメージが大きい', () => {
    const dmg = (hold: number) => {
      const b = setup();
      b.f[0].x = -1.6; b.f[1].x = 1.6; b.f[0].z = b.f[1].z = 0; b.f[0].z = b.f[1].z = 0;
      b.f[0].hold = true;
      giveCommand(b, 0, 'punch');
      run(b, hold);
      b.f[0].hold = false;
      const ev = run(b, 1);
      const h = ev.find((x) => x.kind === 'hit');
      return h && h.kind === 'hit' ? h.damage : 0;
    };
    const a = dmg(0.05);
    const c = dmg(1.2);
    expect(a).toBeGreaterThan(0);
    expect(c).toBeGreaterThan(a);
  });
  it('ジグザグ: 突進は 左右にぶれながら進む', () => {
    const b = setup();
    b.f[0].x = -6; b.f[1].x = 6; b.f[0].z = b.f[1].z = 0;
    giveCommand(b, 0, 'ジップタックル');
    let maxZ = 0, minZ = 0;
    for (let i = 0; i < 1.2 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); maxZ = Math.max(maxZ, b.f[0].z); minZ = Math.min(minZ, b.f[0].z); }
    expect(maxZ).toBeGreaterThan(0.3);
    expect(minZ).toBeLessThan(-0.3);
  });
  it('連続攻撃: 1発ごとに 相手のまわりへ 回りこむ', () => {
    const b = setup();
    b.f[0].x = -1.6; b.f[1].x = 1.6; b.f[0].z = b.f[1].z = 0;
    giveCommand(b, 0, '閃走ラッシュ');
    const ev = run(b, 2.5);
    expect(ev.filter((x) => x.kind === 'blink').length).toBeGreaterThanOrEqual(2);
    expect(ev.filter((x) => x.kind === 'hit').length).toBeGreaterThanOrEqual(2);
  });
});

describe('PUNI・KLAK の通常攻撃 (2026-11-03 企画者)', () => {
  const setup = (sp: string, form = 1) => {
    const b = newAnimeBattle(e(sp, [], form), e('bunk', [], 1), 9, 'manual');
    b.f[0].pad = { x: 0, z: 0 }; b.f[0].techMode = 'manual';
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9; b.f[1].pad = { x: 0, z: 0 }; b.f[1].techMode = 'manual';
    b.f[0].z = b.f[1].z = 0;
    return b;
  };
  it('PUNI: 水の玉は1発だけ・進化するほど遠くまで とどく', () => {
    const reach = (form: number, gap: number) => {
      const b = setup('puni', form);
      b.f[0].x = -gap / 2; b.f[1].x = gap / 2;
      giveCommand(b, 0, 'punch');
      const ev = run(b, 2);
      return ev.filter((x) => x.kind === 'hit').length;
    };
    expect(reach(1, 6)).toBe(1);
    expect(reach(1, 10)).toBe(0);
    expect(reach(2, 10)).toBe(1);
    expect(reach(3, 13)).toBe(1);
  });
  it('KLAK: 前に置いた罠を ふむと はさまれて 動けない', () => {
    const b = setup('klak', 1);
    b.f[0].x = -3; b.f[1].x = 3;
    giveCommand(b, 0, 'punch');
    run(b, 0.8);
    expect(b.traps.length).toBe(1);
    const tp = b.traps[0];
    expect(tp.x).toBeGreaterThan(-2);
    // 相手が 罠の上へ歩いてくる
    b.f[1].pad = { x: -1, z: 0 };
    let snapped = false;
    for (let i = 0; i < 3 / ANIME.dt && !snapped; i++) { b.events = []; stepAnime(b, ANIME.dt); snapped = b.events.some((x) => x.kind === 'trapSnap'); }
    expect(snapped).toBe(true);
    const f1 = b.f[1];
    const x0 = f1.x;
    b.f[1].pad = { x: 1, z: 0 };
    // 少しのあいだ 動けない
    run(b, 0.5);
    expect(Math.abs(f1.x - x0)).toBeLessThan(0.3);
  });
  it('KLAK: 待ち時間は長め(パンチより長い)・進化すると たくさん置ける', () => {
    const b = setup('klak', 3);
    b.f[0].x = -6; b.f[1].x = 8;
    giveCommand(b, 0, 'punch');
    run(b, 0.6);
    expect(b.f[0].cooldown.punch - b.t).toBeGreaterThan(1.5);
    for (let i = 0; i < 3; i++) { b.f[0].cooldown.punch = 0; b.f[0].x -= 2.5; giveCommand(b, 0, 'punch'); run(b, 0.6); }
    expect(b.traps.filter((t) => t.owner === 0).length).toBe(3);
  });
});
