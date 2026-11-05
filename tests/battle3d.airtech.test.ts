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
