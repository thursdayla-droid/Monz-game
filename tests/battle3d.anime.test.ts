import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME, TECHS } from '../src/core/battle3d/animeConfig';
import { getTech } from '../src/core/battle3d/techTable';
import { animeFinished, commandState, giveCommand, newAnimeBattle, stepAnime, type AnimeBattle, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import type { StatBlock } from '../src/core/stats';

const LV30: StatBlock = { hp: 40, power: 40, tough: 35, speed: 20, tech: 22 };
const ent = (p = 2): AnimeEntrant => ({ name: 'BUNK', species: 'bunk', stats: LV30, instinct: instinctFor('bunk', LV30), proficiency: { attack: p, defense: p, evasion: p, counter: p, spacing: p } });
function run(b: AnimeBattle, sec: number, each?: (e: AnimeEvent) => void): void {
  const end = b.t + sec;
  while (b.t < end && !animeFinished(b)) {
    b.events = [];
    stepAnime(b, ANIME.dt);
    if (each) b.events.forEach(each);
  }
}

describe('3D battle (anime monster battle style)', () => {
  it('always ends and is the same for the same seed and commands', () => {
    for (let s = 1; s <= 15; s++) {
      const b = newAnimeBattle(ent(), ent(), s);
      run(b, 200);
      expect(b.winner).not.toBeNull();
    }
    const a = newAnimeBattle(ent(), ent(), 4);
    const c = newAnimeBattle(ent(), ent(), 4);
    giveCommand(a, 0, 'fire');
    giveCommand(c, 0, 'fire');
    run(a, 20);
    run(c, 20);
    expect([a.f[0].x, a.f[1].hp]).toEqual([c.f[0].x, c.f[1].hp]);
  });

  it('a technique command makes the MONZ call and use that technique, then it cools down', () => {
    for (const id of ['dash', 'fire', 'beam', 'quake'] as const) {
      const b = newAnimeBattle(ent(), ent(), 7);
      expect(giveCommand(b, 0, id)).toBe(true);
      const ev: AnimeEvent[] = [];
      run(b, 0.2, (e) => ev.push(e));
      expect(ev.some((e) => e.kind === 'call' && e.side === 0 && e.tech === id && e.byCommand)).toBe(true);
      expect(commandState(b, 0, id)).toBe('cooldown');
      expect(giveCommand(b, 0, id)).toBe(false);
      run(b, TECHS[id].cooldown);
      expect(commandState(b, 0, id)).toBe('ready');
    }
  });

  it('a command waits while the MONZ cannot move, and disappears after a while', () => {
    const b = newAnimeBattle(ent(), ent(), 3);
    b.f[0].act = { k: 'hurt', t: 0, until: 5 };
    giveCommand(b, 0, 'fire');
    expect(commandState(b, 0, 'fire')).toBe('queued');
    const ev: AnimeEvent[] = [];
    run(b, ANIME.command.wait + 0.1, (e) => ev.push(e));
    expect(ev.some((e) => e.kind === 'command' && e.state === 'expired')).toBe(true);
    expect(commandState(b, 0, 'fire')).toBe('ready');
  });

  it('shots fly and can hit, beams and shockwaves hit, and two shots clash', () => {
    const kinds = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      const b = newAnimeBattle(ent(), ent(), s);
      let k = 0;
      run(b, 120, (e) => {
        if (e.kind === 'hit') kinds.add(getTech(e.tech).kind);
        if (e.kind === 'clash') kinds.add('clash');
        if (e.kind === 'evaded') kinds.add('evaded');
        if (k++ % 200 === 0) giveCommand(b, 0, (['fire', 'beam', 'quake', 'dash'] as const)[(k / 200) % 4 | 0]);
      });
    }
    for (const x of ['shot', 'beam', 'quake', 'rush', 'evaded']) expect(kinds.has(x)).toBe(true);
    // ぶつかり合い(2つの弾が正面から)
    const b = newAnimeBattle(ent(), ent(), 1);
    b.shots.push({ id: 1, owner: 0, tech: 'fire', x: -1, y: 0.8, z: 0, vx: 10, vz: 0, r: 0.6, t: 0, alive: true }, { id: 2, owner: 1, tech: 'fire', x: 1, y: 0.8, z: 0, vx: -10, vz: 0, r: 0.6, t: 0, alive: true });
    const ev: AnimeEvent[] = [];
    run(b, 0.2, (e) => ev.push(e));
    expect(ev.some((e) => e.kind === 'clash')).toBe(true);
    expect(b.shots.length).toBe(0);
  });

  it('giving commands helps you win', () => {
    let w = 0;
    for (let s = 1; s <= 20; s++) {
      const b = newAnimeBattle(ent(), ent(), s);
      for (let k = 0; k < 200 * 60 && !animeFinished(b); k++) {
        if (k % 60 === 0) for (const id of ['beam', 'quake', 'dash', 'fire'] as const) if (giveCommand(b, 0, id)) break;
        b.events = [];
        stepAnime(b, ANIME.dt);
      }
      if (b.winner === 0) w++;
    }
    expect(w).toBeGreaterThan(12);
  });
  it('manual mode: my MONZ never uses a move by itself (only by command), auto mode does', () => {
    for (const mode of ['manual', 'auto'] as const) {
      let self = 0;
      for (let sd = 1; sd <= 5; sd++) {
        const b = newAnimeBattle(ent(), ent(), sd, mode);
        run(b, 40, (e) => {
          if (e.kind === 'call' && e.side === 0 && !e.byCommand) self++;
        });
      }
      if (mode === 'manual') expect(self).toBe(0);
      else expect(self).toBeGreaterThan(5);
    }
  });
});
