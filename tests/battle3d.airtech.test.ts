import { it, expect } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant } from '../src/core/battle3d/anime';
import { getTech } from '../src/core/battle3d/techTable';
import { TECH_ROWS } from '../src/core/battle3d/techData';

// 2026-11-05 企画者「相手が攻撃で浮き上がってる時 技もコンボに繋がるよね？」→「当たりそうな技はつなげる」
// 体当たり・連続攻撃・回転・弾・ビーム・落下・火柱・吸収の技は、ふっとんで 浮いている相手にも 当たって コンボになる。
// 地面を走る 衝撃波・地面の 罠や場・ほえる声(弱体)は 下を通って 当たらない
const st = { hp: 300, power: 36, tough: 32, speed: 12, tech: 16 };
const e = (species: string, techs: string[]): AnimeEntrant => ({ name: 'B', species, form: 3, stats: st, instinct: instinctFor(species, st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs } as AnimeEntrant);
const GROUND = new Set(['quake', 'field', 'debuff', 'heal', 'buff', 'barrier']);

it('techs that look like they can reach a launched (floating) opponent connect as a combo', () => {
  const miss: string[] = [];
  let n = 0;
  for (const row of TECH_ROWS) {
    const t = getTech(row.name);
    if (GROUND.has(t.kind)) continue;
    n++;
    let ok = false;
    // 相手との 距離を 2つ ためす(近い・中くらい)
    for (const gap of [2.2, 4]) {
      const b = newAnimeBattle(e(row.species, [row.name]), e('bunk', []), 3, 'manual');
      const [p, q] = b.f;
      p.pad = { x: 0, z: 0 };
      q.pad = { x: 0, z: 0 };
      p.x = 0; p.z = 0; q.x = gap; q.z = 0; p.face = 0; q.thinkT = 99;
      // ためた1発で ふっとんだ ところ(ふわっと 落ちる)
      q.act = { k: 'air', t: 0 }; q.y = 1.2; q.vy = 6; q.floatUntil = ANIME.juggle.floatTime;
      q.comboN = 2; q.comboLast = 0; q.comboStart = 0;
      giveCommand(b, 0, row.name);
      for (let i = 0; i < 100 && !ok; i++) { b.events = []; stepAnime(b, ANIME.dt); if (b.events.some((x) => x.kind === 'combo' && x.side === 0)) ok = true; }
      if (ok) break;
    }
    if (!ok) miss.push(`${row.species}:${row.name}(${t.kind})`);
  }
  // ほとんどが つながる(ためが とても長い技・遠くに 置く技 などは 間に合わない ことがある)
  expect(miss.length, miss.join(' ')).toBeLessThanOrEqual(Math.floor(n * 0.25));
});

it('on a floating opponent, a tech that hits can be followed at once by another tech (tech → tech combo), and they stay floating', () => {
  const b = newAnimeBattle(e('bunk', ['バンクバッシュ', '狙い撃ちバースト']), e('bunk', []), 3, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  p.x = 0; p.z = 0; q.x = 2.2; q.z = 0; p.face = 0; q.thinkT = 99;
  q.act = { k: 'air', t: 0 }; q.y = 1.2; q.vy = 7; q.floatUntil = ANIME.juggle.floatTime; q.comboN = 2; q.comboLast = 0; q.comboStart = 0;
  giveCommand(b, 0, 'バンクバッシュ');
  const ev: typeof b.events = [];
  let pressed = false;
  for (let i = 0; i < 120; i++) {
    b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events);
    if (!pressed && b.events.some((x) => x.kind === 'hit' && x.side === 0)) { pressed = true; expect(q.act.k).toBe('air'); giveCommand(b, 0, '狙い撃ちバースト'); }
  }
  expect(ev.some((x) => x.kind === 'cancel' && x.tech === '狙い撃ちバースト')).toBe(true);
  expect(ev.filter((x) => x.kind === 'hit' && x.side === 0).length).toBeGreaterThanOrEqual(2);
});

it('a floating opponent that is not hit again for a while drops and lands on its feet (no knock-down); a spike only knocks down briefly', () => {
  const b = newAnimeBattle(e('bunk', []), e('bunk', []), 3, 'manual');
  const q = b.f[1];
  b.f[0].pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  q.x = 3; q.act = { k: 'air', t: 0 }; q.y = 2; q.vy = 2; q.floatUntil = ANIME.juggle.floatTime; q.comboN = 2; q.comboLast = 0;
  const ev: typeof b.events = [];
  for (let i = 0; i < 120; i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  expect(ev.some((x) => x.kind === 'ukemi' && x.side === 1)).toBe(true);
  expect(q.act.k).not.toBe('down');
  // たたきつけ: たおれるのは 短い
  q.act = { k: 'air', t: 0 }; q.y = 1; q.vy = -14; q.spiked = true; q.ukemi = false;
  for (let i = 0; i < 10 && q.y > 0; i++) stepAnime(b, ANIME.dt);
  for (let i = 0; i < 3; i++) stepAnime(b, ANIME.dt);
  const qa = q.act as { k: string; until?: number };
  expect(qa.k === 'down' && qa.until).toBe(ANIME.juggle.spikeDown);
});
