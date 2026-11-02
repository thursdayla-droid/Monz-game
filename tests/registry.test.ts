import { describe, expect, it } from 'vitest';
import { MINIGAMES } from '../src/core/modes';
import { newSeed } from '../src/core/rng';
import { SPECIES, speciesName } from '../src/core/species';

describe('registries', () => {
  it('lists the planner-given MONZ with BUNK ready', () => {
    // 2026-11-01: 10種族(5つは まだ名前が決まっていない入れ物)
    expect(Object.values(SPECIES).map((s) => s.name)).toEqual(['BUNK', 'MOFU', 'ZIPP', 'PUNI', 'KLAK', 'RIOT', 'SNEK', 'GRIT', 'VYBE', 'SHELLZ']);
    expect(SPECIES.bunk.ready).toBe(true);
    expect(speciesName('bunk')).toBe('BUNK');
  });

  it('lists minigames with unique ids', () => {
    const ids = MINIGAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MINIGAMES[0].title).toBe('MONZ CARD');
  });

  it('makes 32-bit seeds', () => {
    const s = newSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});

import { cleanName, NAME_MAX } from '../src/core/naming';

describe('naming', () => {
  it('trims, limits length and falls back to the species name', () => {
    expect(cleanName('  ポチ  ', 'BUNK')).toBe('ポチ');
    expect(cleanName('', 'BUNK')).toBe('BUNK');
    expect(cleanName('   ', 'BUNK')).toBe('BUNK');
    expect(Array.from(cleanName('あいうえおかきくけこ', 'BUNK')).length).toBe(NAME_MAX);
    expect(cleanName('a\nb', 'BUNK')).toBe('ab');
  });
});

describe('2026-11-02 the 5 placeholder species got their names', () => {
  it('an old save with monz6 (placeholder) reads as RIOT', async () => {
    const { migrateLife, newLife } = await import('../src/core/lifeSave');
    const old = newLife(0) as unknown as { monz: Record<string, unknown>[] };
    old.monz.push({ ...old.monz[0], uid: 'm2', species: 'monz6' });
    const fixed = migrateLife(JSON.parse(JSON.stringify(old)), 0)!;
    expect(fixed.monz.map((m) => m.species)).toEqual(['bunk', 'riot']);
  });
});
