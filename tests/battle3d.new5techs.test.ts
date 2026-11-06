import { describe, it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeBattle, type AnimeEntrant } from '../src/core/battle3d/anime';
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

// 2026-11-05 企画者「同じような技ばっかりもやめて」→ 技ごとに ちがう しくみ
describe('each new move works in its own way', () => {
  const setup = (sp: string, techs: string[], gap = 4) => {
    const b = newAnimeBattle(e(sp, techs), e('bunk', []), 3, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    q.pad = { x: 0, z: 0 };
    q.thinkT = 99;
    q.cooldown.dodge = q.cooldown.guard = 99;
    p.x = 0; q.x = gap; p.z = q.z = 0; p.face = 0;
    return { b, p, q };
  };
  const run = (b: AnimeBattle, n: number) => { const ev: AnimeBattle['events'] = []; for (let i = 0; i < n; i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); } return ev; };
  it('RIOT: 炎環走り rings the foe with 8 fires, 炎の爪痕 draws 3 fire lines, 火岩けり lobs 3 rocks, 獣性ブースト sets normal attacks on fire', () => {
    let { b } = setup('riot', ['炎環走り']);
    giveCommand(b, 0, '炎環走り'); run(b, 40);
    expect(b.fields.filter((f) => f.tech === '炎環走り').length).toBe(8);
    ({ b } = setup('riot', ['炎の爪痕']));
    giveCommand(b, 0, '炎の爪痕'); run(b, 40);
    expect(b.fields.filter((f) => f.tech === '炎の爪痕' && f.shape === 'line').length).toBe(3);
    ({ b } = setup('riot', ['火岩けり'], 8));
    giveCommand(b, 0, '火岩けり'); run(b, 25);
    expect(b.shots.filter((s) => s.tech === '火岩けり' && s.vy !== undefined).length).toBe(3);
    const r = setup('riot', ['獣性ブースト'], 1.6);
    giveCommand(r.b, 0, '獣性ブースト'); run(r.b, 40);
    expect(r.p.fireJabUntil ?? 0).toBeGreaterThan(r.b.t);
  });
  it('SNEK: 影すべり comes out behind the foe, 見切りの影 slips behind and bites when hit, 鱗の膜 sheds and escapes, 黒鱗 leaves poison', () => {
    let { b, p, q } = setup('snek', ['影すべり']);
    giveCommand(b, 0, '影すべり'); run(b, 30);
    expect(p.x).toBeGreaterThan(q.x);
    ({ b, p, q } = setup('snek', ['見切りの影'], 1.6));
    q.face = Math.PI;
    giveCommand(b, 0, '見切りの影'); run(b, 20);
    let ev: AnimeBattle['events'] = [];
    for (let i = 0; i < 90 && !ev.some((x) => x.kind === 'hit' && x.side === 0); i++) { if (i % 15 === 0) { q.face = Math.PI; giveCommand(b, 1, 'punch'); } ev.push(...run(b, 1)); }
    expect(ev.some((x) => x.kind === 'hit' && x.side === 0)).toBe(true);
    ({ b, p, q } = setup('snek', ['鱗の膜'], 1.6));
    giveCommand(b, 0, '鱗の膜'); run(b, 20);
    const x0 = p.x;
    for (let i = 0; i < 90 && Math.abs(p.x - x0) < 1; i++) { if (i % 15 === 0) { q.face = Math.PI; giveCommand(b, 1, 'punch'); } run(b, 1); }
    expect(Math.abs(p.x - x0)).toBeGreaterThan(2);
    ({ b, p } = setup('snek', ['黒鱗']));
    giveCommand(b, 0, '黒鱗'); run(b, 40);
    p.pad = { x: 0, z: 1 };
    run(b, 60);
    expect(b.fields.some((f) => f.tech === '黒鱗' && f.effect === 'どく')).toBe(true);
  });
  it('GRIT: 大岩おこし pushes up a rock under the foe, 押し出し shoves far, 踏ん張り refills the guard', () => {
    let { b, q } = setup('grit', ['大岩おこし']);
    giveCommand(b, 0, '大岩おこし'); run(b, 50);
    expect(b.pillars.some((p) => p.look === 'rock')).toBe(true);
    ({ b, q } = setup('grit', ['押し出し'], 2.2));
    giveCommand(b, 0, '押し出し'); run(b, 60);
    expect(q.x).toBeGreaterThan(5);
    const g = setup('grit', ['踏ん張り']);
    g.p.guardGauge = 1;
    giveCommand(g.b, 0, '踏ん張り'); run(g.b, 40);
    expect(g.p.guardGauge).toBeGreaterThan(ANIME.guard.max * 0.9);
  });
  it('VYBE: 電気の種 mines burst when stepped on, 連鎖いなずま drops bolts, 雷紋 grows, ヴァイガルドライブ fires all around, 光狼のキバ homes', () => {
    let { b, q } = setup('vybe', ['電気の種']);
    giveCommand(b, 0, '電気の種'); run(b, 40);
    const m = b.fields.find((f) => f.mine)!;
    expect(m).toBeTruthy();
    run(b, 20);
    q.x = m.x; q.z = m.z;
    // 雲の下に 入ると 雷が 落ちる
    expect(run(b, 40).some((x) => x.kind === 'hit' && x.side === 0)).toBe(true);
    ({ b } = setup('vybe', ['連鎖いなずま']));
    giveCommand(b, 0, '連鎖いなずま'); run(b, 30);
    expect(b.pillars.filter((p) => p.look === 'bolt').length).toBeGreaterThanOrEqual(4);
    ({ b } = setup('vybe', ['雷紋'], 9));
    giveCommand(b, 0, '雷紋'); run(b, 30);
    const r0 = b.shots[0].r; run(b, 20);
    expect(b.shots[0].r).toBeGreaterThan(r0);
    ({ b } = setup('vybe', ['ヴァイガルドライブ'], 9));
    giveCommand(b, 0, 'ヴァイガルドライブ');
    let most = 0;
    for (let i = 0; i < 90; i++) { run(b, 1); most = Math.max(most, b.shots.length); }
    expect(most).toBeGreaterThanOrEqual(10);
    ({ b } = setup('vybe', ['光狼のキバ'], 9));
    giveCommand(b, 0, '光狼のキバ'); run(b, 40);
    expect(b.shots[0]?.home).toBeGreaterThan(0);
  });
  it('SHELLZ: 甲羅こもり cannot be hit for a while, 泡のつぶて traps, 潮の渦 pulls toward its middle, 間欠泉 is a water pillar', () => {
    let { b, p, q } = setup('shellz', ['甲羅こもり']);
    giveCommand(b, 0, '甲羅こもり'); run(b, 40);
    expect(p.safeUntil).toBeGreaterThan(b.t);
    ({ b } = setup('shellz', ['泡のつぶて'], 8));
    giveCommand(b, 0, '泡のつぶて'); run(b, 40);
    expect(b.shots.some((s) => s.bind)).toBe(true);
    ({ b, p, q } = setup('shellz', ['潮の渦'], 2.9));
    giveCommand(b, 0, '潮の渦'); run(b, 40);
    const d0 = Math.hypot(q.x - p.x, q.z - p.z);
    run(b, 30);
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(d0);
    ({ b } = setup('shellz', ['間欠泉']));
    giveCommand(b, 0, '間欠泉'); run(b, 50);
    expect(b.pillars.some((p) => p.look === 'water')).toBe(true);
  });
  it('GRIT (stronger): ドスグロウル pushes the foe away, 凄みの眼 freezes, 岩鉄ボディ sends a shockwave, 黒い息 leaves smoke', () => {
    let { b, q } = setup('grit', ['ドスグロウル'], 2.5);
    giveCommand(b, 0, 'ドスグロウル'); run(b, 70);
    expect(q.x).toBeGreaterThan(3.5);
    expect(q.atkDownUntil).toBeGreaterThan(0);
    ({ b, q } = setup('grit', ['凄みの眼'], 4));
    giveCommand(b, 0, '凄みの眼');
    let frozen = false;
    for (let i = 0; i < 60; i++) { run(b, 1); if (q.act.k === 'hurt') frozen = true; }
    expect(frozen).toBe(true);
    let p;
    ({ b, p, q } = setup('grit', ['岩鉄ボディ'], 1.6));
    giveCommand(b, 0, '岩鉄ボディ'); run(b, 15);
    for (let i = 0; i < 90 && !b.quakes.length; i++) { if (i % 15 === 0) { q.face = Math.PI; giveCommand(b, 1, 'punch'); } run(b, 1); }
    expect(b.quakes.some((k) => k.owner === 0)).toBe(true);
    void p;
    ({ b } = setup('grit', ['黒い息'], 5));
    giveCommand(b, 0, '黒い息'); run(b, 150);
    expect(b.fields.some((f) => f.tech === '黒い息')).toBe(true);
  });
  it('SHELLZ (stronger): 水玉ショット fires 3, 潮の壁 stops shots, 鉄甲羅 hurts a close attacker, 潮だまり makes 3 puddles, 大瀑布砲 pushes far', () => {
    let { b, q } = setup('shellz', ['水玉ショット'], 8);
    giveCommand(b, 0, '水玉ショット'); run(b, 30);
    expect(b.shots.filter((s) => s.tech === '水玉ショット').length).toBe(3);
    let p;
    ({ b, p, q } = setup('shellz', ['潮の壁'], 8));
    giveCommand(b, 0, '潮の壁'); run(b, 20);
    expect(b.fields.some((f) => f.wall)).toBe(true);
    b.shots.push({ id: 999, owner: 1, tech: 'punchFire', x: 4, y: 0.8, z: 0, vx: -10, vz: 0, r: 0.4, t: 0, alive: true });
    run(b, 40);
    expect(p.hp).toBe(p.maxHp);
    ({ b, p, q } = setup('shellz', ['鉄甲羅'], 1.6));
    giveCommand(b, 0, '鉄甲羅'); run(b, 15);
    for (let i = 0; i < 60 && q.hp === q.maxHp; i++) { if (i % 15 === 0) { q.face = Math.PI; giveCommand(b, 1, 'punch'); } run(b, 1); }
    expect(q.hp).toBeLessThan(q.maxHp);
    ({ b } = setup('shellz', ['潮だまり'], 4));
    giveCommand(b, 0, '潮だまり'); run(b, 40);
    expect(b.fields.filter((f) => f.tech === '潮だまり').length).toBe(3);
    ({ b, q } = setup('shellz', ['大瀑布砲'], 4));
    giveCommand(b, 0, '大瀑布砲'); run(b, 150);
    expect(q.x).toBeGreaterThan(7);
  });
  it('RIOT (2026-11-05): 火花 lobs a fireball onto the foe, 王者の爪 fires 3 fire slashes, 爆走牙 leaves magma', () => {
    let { b } = setup('riot', ['火花'], 5);
    giveCommand(b, 0, '火花');
    let ev = run(b, 30);
    expect(b.shots.some((s) => s.tech === '火花' && s.vy !== undefined)).toBe(true);
    ev = ev.concat(run(b, 60));
    expect(ev.some((x) => x.kind === 'hit' && x.side === 0)).toBe(true);
    ({ b } = setup('riot', ['王者の爪'], 8));
    giveCommand(b, 0, '王者の爪');
    for (let i = 0; i < 60 && !b.shots.length; i++) run(b, 1);
    expect(b.shots.filter((s) => s.tech === '王者の爪' && s.look === 'slash').length).toBe(3);
    ({ b } = setup('riot', ['爆走牙'], 8));
    giveCommand(b, 0, '爆走牙'); run(b, 50);
    expect(b.fields.some((f) => f.tech === '爆走牙' && f.magma)).toBe(true);
  });
});

it('SHELLZ 甲羅のトゲ charges forward, hits hard and returns to where it started (2026-11-05)', () => {
  const b = newAnimeBattle(e('shellz', ['甲羅のトゲ']), e('bunk', []), 3, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  q.thinkT = 99;
  q.cooldown.dodge = q.cooldown.guard = 99;
  p.x = 0; q.x = 3.5; p.z = q.z = 0; p.face = 0;
  giveCommand(b, 0, '甲羅のトゲ');
  let far = 0;
  let hit = false;
  for (let i = 0; i < 120; i++) { b.events = []; stepAnime(b, ANIME.dt); far = Math.max(far, p.x); if (b.events.some((x) => x.kind === 'hit' && x.side === 0)) hit = true; }
  expect(hit).toBe(true);
  expect(far).toBeGreaterThan(1.5);
  expect(Math.abs(p.x)).toBeLessThan(0.4);
});

it('SHELLZ 甲羅タイフーン spins around the foe in a big circle and hits several times (2026-11-05)', () => {
  const b = newAnimeBattle(e('shellz', ['甲羅タイフーン']), e('bunk', []), 3, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  q.thinkT = 99;
  q.cooldown.dodge = q.cooldown.guard = 99;
  p.x = 0; q.x = 2.2; p.z = q.z = 0; p.face = 0;
  giveCommand(b, 0, '甲羅タイフーン');
  let turned = 0;
  let last = Math.atan2(p.z - q.z, p.x - q.x);
  let hits = 0;
  for (let i = 0; i < 150; i++) {
    b.events = []; stepAnime(b, ANIME.dt);
    const g = Math.atan2(p.z - q.z, p.x - q.x);
    turned += Math.abs(Math.atan2(Math.sin(g - last), Math.cos(g - last)));
    last = g;
    hits += b.events.filter((x) => x.kind === 'hit' && x.side === 0).length;
  }
  expect(turned).toBeGreaterThan(4);
  expect(hits).toBeGreaterThanOrEqual(3);
});

it('RIOT flame breath reaches far (about 12m) in a straight line (2026-11-05)', () => {
  for (const [dx, dz, want] of [[10, 0, true], [4, 0, true], [15, 0, false], [8, 3, false]] as const) {
    const b = newAnimeBattle(e('riot', ['爆炎ブレス']), e('bunk', []), 5, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    q.pad = { x: 0, z: 0 };
    p.x = -8; p.z = 0; q.x = -8 + dx; q.z = dz; p.face = 0;
    const hp = q.hp;
    giveCommand(b, 0, '爆炎ブレス');
    for (let i = 0; i < 200; i++) {
      stepAnime(b, ANIME.dt);
      p.face = 0;
    }
    expect(q.hp < hp, `${dx},${dz}`).toBe(want);
  }
});

it('SNEK dark tongue hits from middle range (about 8m), not far (2026-11-05)', () => {
  for (const [dx, want] of [[7, true], [2.5, true], [10.5, false]] as const) {
    const b = newAnimeBattle(e('snek', ['闇の舌']), e('bunk', []), 5, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    q.pad = { x: 0, z: 0 };
    p.x = -6; p.z = 0; q.x = -6 + dx; q.z = 0; p.face = 0;
    const hp = q.hp;
    giveCommand(b, 0, '闇の舌');
    for (let i = 0; i < 150; i++) {
      stepAnime(b, ANIME.dt);
      p.face = 0;
    }
    expect(q.hp < hp, `${dx}`).toBe(want);
  }
});

it('GRIT bulldozer / bull crusher break the guard when every hit lands (2026-11-05)', () => {
  for (const name of ['ブルドーザー', 'ブルクラッシャー']) {
    for (const guarding of [true, false]) {
      const b = newAnimeBattle(e('grit', [name]), e('bunk', []), 5, 'manual');
      const [p, q] = b.f;
      p.pad = { x: 0, z: 0 };
      q.pad = { x: 0, z: 0 };
      p.x = -4; p.z = 0; q.x = -1.5; q.z = 0; p.face = 0;
      q.guardGauge = ANIME.guard.max;
      giveCommand(b, 0, name);
      let broke = false;
      for (let i = 0; i < 200; i++) {
        b.events = [];
        if (guarding && q.act.k === 'free') q.act = { k: 'guard', t: 1, until: 99 };
        stepAnime(b, ANIME.dt);
        p.face = Math.atan2(q.z - p.z, q.x - p.x);
        if (b.events.some((x) => x.kind === 'guardBreak' && x.side === 1)) broke = true;
      }
      expect(broke, `${name} guard=${guarding}`).toBe(true);
    }
  }
});

it('SHELLZ tide wall stops the opponent attacks and the opponent cannot pass (2026-11-05)', () => {
  const b = newAnimeBattle(e('shellz', ['潮の壁']), e('riot', ['爆炎ブレス', '牙王クラッシュ']), 5, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  p.x = -4; p.z = 0; q.x = 3; q.z = 0; p.face = 0; q.face = Math.PI;
  giveCommand(b, 0, '潮の壁');
  for (let i = 0; i < 40; i++) stepAnime(b, ANIME.dt);
  expect(b.fields.some((f) => f.wall)).toBe(true);
  const hp = p.hp;
  // 炎の息も 体当たりも とどかない
  for (const t of ['爆炎ブレス', '牙王クラッシュ']) {
    q.cooldown[t] = 0;
    giveCommand(b, 1, t);
    for (let i = 0; i < 55; i++) {
      stepAnime(b, ANIME.dt);
      q.face = Math.PI;
    }
  }
  expect(p.hp).toBe(hp);
});

it('the opponent cannot walk through the SHELLZ tide wall (2026-11-05)', () => {
  for (const wall of [true, false]) {
    const b = newAnimeBattle(e('shellz', ['潮の壁']), e('riot', []), 5, 'manual');
    const [p, q] = b.f;
    p.pad = { x: 0, z: 0 };
    q.pad = { x: 0, z: 0 };
    p.x = -4; p.z = 0; q.x = 0; q.z = 0; p.face = 0;
    if (wall) giveCommand(b, 0, '潮の壁');
    for (let i = 0; i < 40; i++) stepAnime(b, ANIME.dt);
    q.pad = { x: -1, z: 0 };
    for (let i = 0; i < 150; i++) stepAnime(b, ANIME.dt);
    expect(q.x > -2.3, `wall=${wall} x=${q.x}`).toBe(wall);
  }
});

it('CROWNIE has the BUNK moves as dark moves (same names, element 闇) and can fight (2026-11-06)', () => {
  const bunk = learnset('bunk');
  const crown = learnset('crownie');
  expect(crown.map((r) => getTech(r.name).name)).toEqual(bunk.map((r) => r.name));
  for (const r of crown) {
    expect(getTech(r.name).element).toBe('闇');
    expect(getTech(r.name).power).toBe(getTech(r.name.replace('@闇', '')).power);
  }
  const s = speciesStats('crownie' as never).base;
  expect(s).toEqual(speciesStats('bunk').base);
  const g = growTechs('crownie', 100, s, undefined, instinctFor('crownie', s));
  expect(g.state.equipped.length).toBe(4);
  const b = newAnimeBattle(e('crownie', g.state.equipped, 3), e('bunk', [], 3), 9);
  for (let i = 0; i < 100 / ANIME.dt && !animeFinished(b); i++) stepAnime(b, ANIME.dt);
  expect(b.winner).not.toBeNull();
});
