import { expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant } from '../src/core/battle3d/anime';
import { getTech } from '../src/core/battle3d/techTable';
import { growTechs, formAt } from '../src/core/battle3d/techLearn';
import { addStats, autoGrowthAt, speciesStats } from '../src/core/stats';

const ent = (lv: number, style: 'power' | 'tough' | 'speed' | 'tech', techs?: string[]): AnimeEntrant => {
  const stats = addStats(addStats(speciesStats('bunk').base, autoGrowthAt('bunk', 'dev', lv)), { hp: 0, power: 0, tough: 0, speed: 0, tech: 0, [style]: lv - 1 } as never);
  const inst = instinctFor('bunk', stats);
  return { name: 'B', species: 'bunk', stats, instinct: inst, proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs: techs ?? growTechs('bunk', lv, stats, undefined, inst).state.learned.slice(-4), form: formAt(lv) } as AnimeEntrant;
};

// 攻める側: いつも近づき、近ければパンチ、使える技はすぐ使う。守る側: escape=true なら離れて、よけられる時は よける(受け身も)
function run(lv: number, style: 'power' | 'tough' | 'speed' | 'tech', techs: string[] | undefined, escape: boolean, seed: number) {
  const b = newAnimeBattle(ent(lv, style, techs), ent(lv, style), seed, 'manual');
  const [p, q] = b.f;
  p.pad = { x: 0, z: 0 };
  q.pad = { x: 0, z: 0 };
  let lock = 0, maxLock = 0, worst = '';
  const log: string[] = [];
  for (let i = 0; i < 90 / ANIME.dt && b.winner === null; i++) {
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    p.pad = d > 1.6 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
    if (p.act.k === 'free') {
      if (d < 2.6) giveCommand(b, 0, 'punch');
      for (const t of p.techs) if ((p.cooldown[t] ?? 0) <= b.t && getTech(t).kind !== 'barrier') { giveCommand(b, 0, t); break; }
    }
    if (escape) {
      q.pad = d > 0 ? { x: -dx / d, z: -dz / d } : { x: 1, z: 0 };
      if (q.act.k === 'air' || q.act.k === 'down' || (q.act.k === 'free' && d < 4)) giveCommand(b, 1, 'dodge');
    }
    b.events = [];
    stepAnime(b, ANIME.dt);
    const stuck = (q.act.k === 'hurt' || q.act.k === 'air' || q.act.k === 'down') ;
    if (stuck) { lock += ANIME.dt; log.push(q.act.k); } else { if (lock > maxLock) { maxLock = lock; worst = [...new Set(log)].join('>'); } lock = 0; log.length = 0; }
  }
  if (lock > maxLock) maxLock = lock;
  return { maxLock, worst, hp: q.hp, winner: b.winner, t: b.t };
}

// ハメ技(ずっと動けないまま倒される)がないかの確認(2026-11-03 企画者「ハメ技はないかな？」)。
// いちばん強く攻め続けても、守る側が何もしなくても、動けない時間が続くのは3秒より短い
it('no endless lock: the defender is never stuck (hurt / air / down) for 3 seconds in a row', () => {
  for (const lv of [1, 30, 60, 70])
    for (const style of ['power', 'tough'] as const)
      for (const escape of [false, true])
        for (const seed of [1, 2]) {
          const r = run(lv, style, undefined, escape, seed);
          expect(r.maxLock, `Lv${lv} ${style} ${escape} ${seed} ${r.worst}`).toBeLessThan(3);
        }
});
