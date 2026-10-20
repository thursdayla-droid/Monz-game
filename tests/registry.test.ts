import { describe, expect, it } from 'vitest';
import { MINIGAMES } from '../src/core/modes';
import { newSeed } from '../src/core/rng';
import { SPECIES, speciesName } from '../src/core/species';

describe('registries', () => {
  it('lists the planner-given MONZ with BUNK ready', () => {
    expect(Object.values(SPECIES).map((s) => s.name)).toEqual(['BUNK', 'MOFU', 'ZIPP', 'PUNI', 'KLAK']);
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
