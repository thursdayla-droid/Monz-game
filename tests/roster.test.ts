import { describe, expect, it } from 'vitest';
import { checkRoster, formOf, MODEL_FILES, modelFor, rosterSpecies } from '../src/core/roster';
import { isSpecies, SPECIES } from '../src/core/species';

describe('roster (all characters: 10 species x 3 forms)', () => {
  it('has 10 species with 3 forms each and no mistakes', () => {
    expect(rosterSpecies()).toHaveLength(10);
    expect(checkRoster()).toEqual([]);
    for (const sp of rosterSpecies()) expect(isSpecies(sp)).toBe(true);
    expect(Object.keys(SPECIES)).toHaveLength(10);
  });
  it('form changes at Lv.30 and Lv.60 (proposal)', () => {
    expect(formOf('bunk', 1)?.form).toBe(1);
    expect(formOf('bunk', 30)?.form).toBe(2);
    expect(formOf('bunk', 60)?.form).toBe(3);
  });
  it('only species with a 3D model use one (others are the placeholder monster)', () => {
    expect(Object.keys(MODEL_FILES)).toEqual(['bunk', 'bunk:2', 'bunk:3', 'mofu', 'mofu:2', 'mofu:3']);
    expect(modelFor('bunk', 1)?.file).toContain('bunk.glb');
    expect(modelFor('bunk', 30)?.file).toContain('bunker.glb');
    expect(modelFor('bunk', 60)?.file).toContain('bunklord.glb');
    // BUNKLORD は骨を直したので、骨で動かす
    expect(modelFor('bunk', 60)?.bones).toBe(true);
    expect(modelFor('bunk', 30)?.bones).toBe(true);
    // MOFU の3Dモデル(2026-11-03)
    expect(modelFor('mofu', 1)?.file).toContain('mofu.glb');
    expect(modelFor('mofu', 60)?.file).toContain('mofugard.glb');
    expect(modelFor('zipp', 1)).toBeNull();
  });
});
