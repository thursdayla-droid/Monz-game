import { it } from 'vitest';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, newAnimeBattle, stepAnime, type AnimeEntrant } from '../src/core/battle3d/anime';
import { foeEntrant } from '../src/core/battle3d/foe';
import { formAt, growTechs } from '../src/core/battle3d/techLearn';
import type { StatBlock } from '../src/core/stats';
import { profOf } from '../src/core/rumble';

// 強さの バランス調べ(2026-11-05 企画者「強さのバランスは調べてください」)。ふだんは 走らない: BAL=出力先 npx vitest run tests/balance.sim.test.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env: Record<string, string | undefined> = (globalThis as any).process?.env ?? {};
const OUT = env.BAL;
const SP = ['bunk', 'mofu', 'zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz'];
const mk = (sp: string, level: number, seed: number): AnimeEntrant => {
  const r = foeEntrant(level, seed, sp);
  return { ...r, stats: r.stats as StatBlock, form: formAt(level), proficiency: profOf(3), techs: growTechs(sp, level, r.stats as StatBlock, undefined, r.instinct).state.equipped } as AnimeEntrant;
};

it.skipIf(!OUT)('balance: every species pair, CPU vs CPU', async () => {
  const { writeFileSync } = await import(/* @vite-ignore */ 'node:' + 'fs');
  const levels = (env.BAL_LV ?? '15,45,80').split(',').map(Number);
  const N = Number(env.BAL_N ?? 4);
  const res: Record<string, unknown> = {};
  for (const lv of levels) {
    const win: Record<string, number> = {}, games: Record<string, number> = {}, hpLeft: Record<string, number> = {}, time: number[] = [];
    const pair: Record<string, number> = {};
    for (const s of SP) { win[s] = 0; games[s] = 0; hpLeft[s] = 0; }
    for (let i = 0; i < SP.length; i++)
      for (let j = i + 1; j < SP.length; j++)
        for (let k = 0; k < N; k++) {
          const seed = 1000 + lv * 97 + i * 31 + j * 7 + k;
          const [a, c] = k % 2 ? [SP[j], SP[i]] : [SP[i], SP[j]];
          const b = newAnimeBattle(mk(a, lv, seed), mk(c, lv, seed + 1), seed);
          let n = 0;
          while (!animeFinished(b) && n < (ANIME.timeLimit + 10) / ANIME.dt) { b.events = []; stepAnime(b, ANIME.dt); n++; }
          time.push(b.koAt ?? b.t);
          games[a]++; games[c]++;
          const w = b.winner;
          if (w === 0 || w === 1) { const ws = w === 0 ? a : c; win[ws]++; pair[`${ws}>${w === 0 ? c : a}`] = (pair[`${ws}>${w === 0 ? c : a}`] ?? 0) + 1; }
          else { win[a] += 0.5; win[c] += 0.5; }
          hpLeft[a] += b.f[0].hp / b.f[0].maxHp; hpLeft[c] += b.f[1].hp / b.f[1].maxHp;
        }
    res[lv] = { rate: Object.fromEntries(SP.map((s) => [s, +(win[s] / games[s]).toFixed(2)])), hp: Object.fromEntries(SP.map((s) => [s, +(hpLeft[s] / games[s]).toFixed(2)])), avgTime: +(time.reduce((x, y) => x + y, 0) / time.length).toFixed(1), pair };
  }
  writeFileSync(OUT!, JSON.stringify(res, null, 1));
}, 3_600_000);
