import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { getTech } from '../src/core/battle3d/techTable';

const st = { hp: 30, power: 36, tough: 32, speed: 12, tech: 16 };
const e = (techs: string[] = ['バンクバッシュ']): AnimeEntrant => ({ name: 'B', species: 'bunk', stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs });
const quiet = (b: ReturnType<typeof newAnimeBattle>) => {
  for (const f of b.f) {
    f.pad = { x: 0, z: 0 };
    f.thinkT = 1e9;
  }
};
const run = (b: ReturnType<typeof newAnimeBattle>, sec: number) => {
  const ev: AnimeEvent[] = [];
  for (let i = 0; i < sec / ANIME.dt; i++) {
    b.events = [];
    stepAnime(b, ANIME.dt);
    ev.push(...b.events);
  }
  return ev;
};

describe('やけど・どく・ねむり・場のダメージ (2026-11-03)', () => {
  it('やけど: 3秒・1秒ごとに最大HPの2%。よろけない', () => {
    const b = newAnimeBattle(e(), e(), 1, 'manual');
    quiet(b);
    const q = b.f[1];
    q.burnUntil = b.t + ANIME.burn.time;
    q.burnTick = b.t + 1;
    const hp0 = q.hp;
    const ev = run(b, 4);
    const chips = ev.filter((x) => x.kind === 'chip');
    expect(chips).toHaveLength(3);
    expect(hp0 - q.hp).toBe(3 * Math.round(q.maxHp * 0.02));
    expect(q.act.k).toBe('free');
  });
  it('どく: 8秒・1秒ごとに最大HPの1%', () => {
    const b = newAnimeBattle(e(), e(), 1, 'manual');
    quiet(b);
    const q = b.f[1];
    q.poisonUntil = b.t + ANIME.poison.time;
    q.poisonTick = b.t + 1;
    const ev = run(b, 9);
    expect(ev.filter((x) => x.kind === 'chip')).toHaveLength(8);
  });
  it('ねむり: 何もできない・攻撃で起きる・すぐには もう一度ねむらない', () => {
    const t = getTech('ポンポンショット') as { effect: string; strength: string };
    const old = t.effect;
    t.effect = 'ねむり';
    try {
      const b = newAnimeBattle(e(['ポンポンショット']), e(), 3, 'manual');
      quiet(b);
      const [p, q] = b.f;
      p.x = -2; q.x = 2; p.z = q.z = 0; p.face = 0;
      q.cooldown.dodge = 1e9;
      p.stats = { ...p.stats, tech: 400 }; // かかりやすく
      let slept = false;
      for (let k = 0; k < 8 && !slept; k++) {
        p.cooldown['ポンポンショット'] = 0;
        p.x = q.x - 4; p.z = q.z; p.face = 0;
        giveCommand(b, 0, 'ポンポンショット');
        const ev = run(b, 0.7);
        slept = ev.some((x) => x.kind === 'status' && x.effect === 'ねむり');
      }
      expect(slept).toBe(true);
      expect(q.act.k).toBe('hurt');
      expect(b.t < q.sleepSafeUntil).toBe(true);
      // ねむっている間は何もできない → 攻撃を受けると起きる(ふつうのやられに)
      expect(b.t < q.sleepUntil).toBe(true);
      p.cooldown['ポンポンショット'] = 0;
      p.x = q.x - 4; p.face = 0;
      giveCommand(b, 0, 'ポンポンショット');
      const ev2 = run(b, 0.7);
      expect(ev2.some((x) => x.kind === 'hit')).toBe(true);
      expect(ev2.some((x) => x.kind === 'status' && x.effect === 'ねむり')).toBe(false);
      expect(q.sleepUntil).toBeLessThanOrEqual(b.t);
    } finally {
      t.effect = old;
    }
  });
  it('グラビティプレス: 場の中にいると1秒ごとに少しダメージ(よろけない)', () => {
    const b = newAnimeBattle(e(['グラビティプレス']), e(), 1, 'manual');
    quiet(b);
    const [p, q] = b.f;
    p.x = -3; q.x = 3; p.z = q.z = 0; p.face = 0; q.cooldown.dodge = 1e9;
    giveCommand(b, 0, 'グラビティプレス');
    const ev = run(b, 4);
    const chips = ev.filter((x) => x.kind === 'chip');
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.every((x) => x.kind === 'chip' && x.damage < 10)).toBe(true);
    expect(q.act.k).toBe('free');
  });
});
