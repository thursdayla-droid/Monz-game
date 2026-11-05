import { formAt } from '../src/core/battle3d/techLearn';
import { describe, expect, it } from 'vitest';
import { canPlay, CPU_LEVELS, nextStage, STORY_COUNT, STORY_STAGES } from '../src/core/rumble';
import { LifeRecord, migrateLife, newLife } from '../src/core/lifeSave';

describe('MONZ RUMBLE のモード (2026-11-03)', () => {
  it('ストーリーは30ステージ。敵はだんだん強く、さいごはボス(Lv.100・うまさ5)(2026-11-05)', () => {
    expect(STORY_COUNT).toBe(30);
    expect(STORY_STAGES).toHaveLength(STORY_COUNT);
    for (let i = 1; i < STORY_STAGES.length; i++) {
      expect(STORY_STAGES[i].enemy.level).toBeGreaterThan(STORY_STAGES[i - 1].enemy.level);
      expect(STORY_STAGES[i].enemy.prof).toBeGreaterThanOrEqual(STORY_STAGES[i - 1].enemy.prof - 1);
    }
    const last = STORY_STAGES[STORY_COUNT - 1];
    expect(last.enemy).toMatchObject({ level: 100, prof: 5, boss: true, form: 3 });
    // 1〜10 は 第1形態・11〜20 は 第2形態・21〜30 は 最終進化。10種族 × 3形態 = 30体が 1回ずつ
    const seen = new Set<string>();
    for (const st of STORY_STAGES) {
      expect(st.enemy.form).toBe(st.no <= 10 ? 1 : st.no <= 20 ? 2 : 3);
      expect(formAt(st.enemy.level)).toBe(st.enemy.form);
      seen.add(`${st.enemy.species}:${st.enemy.form}`);
      expect(st.enemy.hp).toBeGreaterThan(1);
    }
    expect(seen.size).toBe(30);
    // 6章(5戦ずつ)。1〜2章 草原・3〜4章 ストリート・5〜6章 チャンピオン。30戦目は KROWN
    expect(STORY_STAGES.map((st) => st.chapter)).toEqual(Array.from({ length: 30 }, (_, i) => Math.ceil((i + 1) / 5)));
    for (const st of STORY_STAGES) expect(st.map).toBe(st.chapter <= 2 ? 'grassland' : st.chapter <= 4 ? 'street' : 'champion');
    expect(last.enemy.name).toBe('KROWN');
    // HP は だんだん 多く
    expect(STORY_STAGES[29].enemy.hp).toBeGreaterThan(STORY_STAGES[0].enemy.hp * 2);
  });
  it('遊べるのは クリアしたマスと次のマスだけ', () => {
    expect(nextStage(0)).toBe(1);
    expect(canPlay(1, 0)).toBe(true);
    expect(canPlay(2, 0)).toBe(false);
    expect(canPlay(3, 5)).toBe(true);
    expect(canPlay(6, 5)).toBe(true);
    expect(canPlay(20, 20)).toBe(true);
  });
  it('CPU の強さは5つ。強いほど レベルとうまさが上', () => {
    expect(CPU_LEVELS).toHaveLength(5);
    for (let i = 1; i < CPU_LEVELS.length; i++) expect(CPU_LEVELS[i].prof).toBeGreaterThan(CPU_LEVELS[i - 1].prof);
  });
  it('クリアは保存され、古いデータ(記録なし)も読める', () => {
    const store = new Map<string, string>();
    const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const rec = new LifeRecord(newLife(0), kv);
    rec.clearStage(3);
    rec.clearStage(2);
    expect(rec.snapshot.rumble?.cleared).toBe(3);
    const back = migrateLife(JSON.parse(JSON.stringify(rec.snapshot)), 0)!;
    expect(back.rumble?.cleared).toBe(3);
    const old = migrateLife(JSON.parse(JSON.stringify(newLife(0))), 0)!;
    expect(old.rumble).toBeUndefined();
  });
});
