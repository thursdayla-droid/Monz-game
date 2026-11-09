import { describe, expect, it } from 'vitest';
import { clearStage, loadProgress, newProgress, saveProgress } from './progress';
import { STAGE_COUNT, stageAt } from './stages';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('MAHJONG QUEST の ステージ(企画者 2026-11-09)', () => {
  it('5ステージ・敵HP 30,000/50,000/60,000/80,000/100,000・ゴールド 200/250/300/350/500', () => {
    expect(STAGE_COUNT).toBe(5);
    expect([0, 1, 2, 3, 4].map((i) => stageAt(i, 1).enemyHp)).toEqual([30000, 50000, 60000, 80000, 100000]);
    expect([0, 1, 2, 3, 4].map((i) => stageAt(i, 1).gold)).toEqual([200, 250, 300, 350, 500]);
  });
  it('2周目は ゴールド 1.5倍・CPU は 強く(5まで)', () => {
    expect(stageAt(0, 2).gold).toBe(300);
    expect(stageAt(4, 2).levels).toEqual([5, 5, 5]);
    expect(stageAt(0, 2).levels[1]).toBeGreaterThan(stageAt(0, 1).levels[1]);
  });
  it('クリアで 次へ・5つめの あとは 2周目の 1つめ', () => {
    const p = newProgress();
    for (let i = 0; i < 4; i++) expect(clearStage(p, 100).lapUp).toBe(false);
    expect(p.stage).toBe(4);
    expect(clearStage(p, 100).lapUp).toBe(true);
    expect([p.stage, p.lap, p.gold, p.clears]).toEqual([0, 2, 500, 5]);
  });
  it('保存して 読める・こわれた データでも 止まらない', () => {
    const s = mem();
    const p = newProgress();
    p.gold = 450;
    p.items = { konbou: 2 };
    saveProgress(p, s);
    expect(loadProgress(s)).toEqual(p);
    s.setItem('monz:mahjong', '{bad');
    expect(loadProgress(s)).toEqual(newProgress());
    s.setItem('monz:mahjong', JSON.stringify({ stage: 99, lap: 0, gold: -5 }));
    expect(loadProgress(s)).toMatchObject({ stage: 4, lap: 1, gold: 0 });
  });
});
