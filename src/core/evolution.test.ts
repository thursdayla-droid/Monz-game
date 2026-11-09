import { describe, expect, it } from 'vitest';
import { careArtId, evoName, evolvedAt, formOf } from './evolution';

describe('進化(2026-11-09)', () => {
  it('Lv.30 で 第2形態・Lv.60 で 第3形態', () => {
    expect([1, 29, 30, 59, 60, 100].map(formOf)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('名前と 絵', () => {
    expect([evoName('zipp', 10), evoName('zipp', 30), evoName('zipp', 60)]).toEqual(['ZIPP', 'ZIPRO', 'ZIPRAX']);
    expect([careArtId('bunk', 5), careArtId('bunk', 31), careArtId('crownie', 70)]).toEqual(['bunk', 'bunk_f2', 'crownie_f3']);
  });
  it('レベルアップで 進化した かどうか', () => {
    expect([evolvedAt(29, 30), evolvedAt(30, 31), evolvedAt(59, 60), evolvedAt(28, 61)]).toEqual([2, 0, 3, 3]);
  });
});
