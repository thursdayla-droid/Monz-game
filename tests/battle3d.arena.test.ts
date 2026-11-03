import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { coverSpot, lineOfSight, LOST_TEMPLE, rayHit, resolveBody, type ArenaMap } from '../src/core/battle3d/arena';

const st = { hp: 30, power: 30, tough: 30, speed: 12, tech: 16 };
const e = (techs: string[] = [], prof = 2): AnimeEntrant => ({ name: 'B', species: 'bunk', stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: prof, defense: prof, evasion: prof, counter: prof, spacing: prof }, techs });
/** テスト用の小さなマップ: まん中に柱1本 */
const ONE: ArenaMap = { id: 't', name: 't', radius: 18, start: [{ x: -5, z: 0 }, { x: 5, z: 0 }], obstacles: [{ kind: 'circle', x: 0, z: 0, r: 1, h: 5, look: 'pillar' }] };
const quiet = (b: ReturnType<typeof newAnimeBattle>) => b.f.forEach((f) => { f.pad = { x: 0, z: 0 }; f.thinkT = 1e9; f.cooldown.dodge = 1e9; });
const run = (b: ReturnType<typeof newAnimeBattle>, sec: number, each?: () => void) => {
  const ev: AnimeEvent[] = [];
  for (let i = 0; i < sec / ANIME.dt; i++) { each?.(); b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  return ev;
};

describe('マップ(ロストテンプル 2026-11-03)', () => {
  it('ロストテンプルは直径36m・はじめの位置は物の外', () => {
    expect(LOST_TEMPLE.radius * 2).toBe(36);
    for (const p of LOST_TEMPLE.start) { const q = { ...p }; expect(resolveBody(LOST_TEMPLE, q, 0.7)).toBe(false); }
  });
  it('当たりの計算: 柱の向こうは見通せない・横は見通せる・中から押し出す・外の壁', () => {
    expect(lineOfSight(ONE, { x: -5, z: 0 }, { x: 5, z: 0 })).toBe(false);
    expect(lineOfSight(ONE, { x: -5, z: 2 }, { x: 5, z: 2 })).toBe(true);
    expect(rayHit(ONE, -5, 0, 5, 0)!.x).toBeCloseTo(-1, 1);
    const p = { x: 0.2, z: 0 };
    resolveBody(ONE, p, 0.7);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.7, 3);
    const q = { x: 30, z: 0 };
    resolveBody(ONE, q, 0.7);
    expect(Math.hypot(q.x, q.z)).toBeCloseTo(17.3, 3);
    // 高い所(柱より上)は通る
    expect(lineOfSight(ONE, { x: -5, z: 0 }, { x: 5, z: 0 }, 6)).toBe(true);
  });
  it('1. MONZ は柱に ぶつかって止まる(すりぬけない)', () => {
    const b = newAnimeBattle(e(), e(), 1, 'manual', ONE);
    quiet(b);
    const p = b.f[0];
    p.pad = { x: 1, z: 0 };
    b.f[1].x = 10; b.f[1].z = 6;
    let minD = 99;
    run(b, 3, () => { minD = Math.min(minD, Math.hypot(p.x, p.z)); });
    expect(minD).toBeGreaterThan(1 + ANIME.body.radius - 0.05);
    expect(p.x).toBeLessThan(0);
  });
  it('柱にそって すべる(ななめに押すと横へ ぬけられる・引っかからない)', () => {
    const b = newAnimeBattle(e(), e(), 1, 'manual', ONE);
    quiet(b);
    const p = b.f[0];
    p.x = -3; p.z = 0.3;
    p.pad = { x: 1, z: 0.25 };
    b.f[1].x = 10; b.f[1].z = -8;
    run(b, 3);
    expect(p.x).toBeGreaterThan(1);
  });
  it('2・3. 弾は柱に当たって消え、柱のうしろの相手には当たらない', () => {
    const b = newAnimeBattle(e(['ポンポンショット']), e(), 2, 'manual', ONE);
    quiet(b);
    const [p, q] = b.f;
    p.face = 0;
    const hp = q.hp;
    giveCommand(b, 0, 'ポンポンショット');
    const ev = run(b, 2);
    expect(ev.some((x) => x.kind === 'wallHit')).toBe(true);
    expect(q.hp).toBe(hp);
    // 柱がなければ当たる
    const b2 = newAnimeBattle(e(['ポンポンショット']), e(), 2, 'manual', { ...ONE, obstacles: [] });
    quiet(b2);
    b2.f[0].face = 0;
    giveCommand(b2, 0, 'ポンポンショット');
    run(b2, 2);
    expect(b2.f[1].hp).toBeLessThan(hp);
  });
  it('ビームは柱で止まる・衝撃波は柱のうしろに とどかない', () => {
    const b = newAnimeBattle(e(['ギガントバースト']), e(), 3, 'manual', ONE);
    quiet(b);
    const hp = b.f[1].hp;
    b.f[0].face = 0;
    giveCommand(b, 0, 'ギガントバースト');
    const ev = run(b, 2.5);
    expect(ev.some((x) => x.kind === 'wallHit')).toBe(true);
    expect(b.f[1].hp).toBe(hp);
    const m: ArenaMap = { ...ONE, obstacles: [{ kind: 'circle', x: -2, z: 0, r: 1, h: 5, look: 'pillar' }] };
    const c = newAnimeBattle(e(['ドスンパクト']), e(), 3, 'manual', m);
    quiet(c);
    c.f[0].x = -4.2; c.f[1].x = 0.5;
    giveCommand(c, 0, 'ドスンパクト');
    run(c, 2);
    expect(c.f[1].hp).toBe(hp);
  });
  it('かくれる所は、相手から見えない柱のうしろ', () => {
    const spot = coverSpot(ONE, { x: -4, z: 2 }, { x: 5, z: 0 }, 7)!;
    expect(spot).toBeTruthy();
    expect(lineOfSight(ONE, spot, { x: 5, z: 0 })).toBe(false);
  });
  it('4・5. AI は柱を よけて歩き、柱の横から回りこんで見通せる所へ行く(うまさ★5)', () => {
    let seen = 0;
    let stuck = 0;
    for (let s = 1; s <= 6; s++) {
      const b = newAnimeBattle(e([], 5), e([], 5), 10 + s, 'auto', ONE);
      b.f.forEach((f) => { f.thinkT = 0; });
      for (const f of b.f) for (const k in f.cooldown) f.cooldown[k] = 1e9;
      let open = 0;
      let last = { x: b.f[0].x, z: b.f[0].z };
      let still = 0;
      run(b, 12, () => {
        if (lineOfSight(ONE, b.f[0], b.f[1])) open++;
        const mv = Math.hypot(b.f[0].x - last.x, b.f[0].z - last.z);
        still = mv < 1e-4 && b.f[0].act.k === 'free' ? still + 1 : 0;
        if (still > 120) stuck++;
        last = { x: b.f[0].x, z: b.f[0].z };
        for (const f of b.f) if (Math.hypot(f.x, f.z) < 1 + ANIME.body.radius - 0.05) throw new Error('柱の中に入った');
      });
      if (open > 12 / ANIME.dt / 2) seen++;
    }
    expect(seen).toBeGreaterThanOrEqual(5);
    expect(stuck).toBe(0);
  });
  it('ロストテンプルで オートどうしの試合が ふつうに終わる', () => {
    for (let s = 1; s <= 4; s++) {
      const b = newAnimeBattle(e(['バンクバッシュ', 'ポンポンショット', 'ドスンパクト']), e(['コロガン', 'ポンポンショット']), s, 'auto', LOST_TEMPLE);
      while (!animeFinished(b) && b.t < 100) { b.events = []; stepAnime(b, ANIME.dt * 2); }
      expect(b.winner).not.toBeNull();
    }
  });
});
