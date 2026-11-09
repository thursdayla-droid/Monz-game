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

describe('やめたら 最初から(企画者 2026-11-09)', () => {
  it('resetRun で ステージ・周・ゴールド・持ち物が もどる(クリア回数は 残る)', async () => {
    const { resetRun } = await import('./progress');
    const p = newProgress();
    Object.assign(p, { stage: 3, lap: 2, gold: 900, items: { a: 1 }, clears: 8 });
    resetRun(p);
    expect(p).toEqual({ ...newProgress(), clears: 8 });
  });
});

describe('アイテム(企画者 2026-11-09)', () => {
  const win = (seat: number, from: number | null) => ({ kind: 'win' as const, delta: [0, 0, 0, 0], wins: [{ seat, from, paid: [0, 0, 0, 0], score: {} as never }] });
  const dmg = (toEnemy: number, toPlayer: number) => ({ toEnemy, toPlayer, hits: [{ winner: toEnemy ? 0 : 2, from: null, amount: toEnemy || toPlayer, target: (toEnemy ? 'enemy' : 'player') as 'enemy' | 'player' }] });
  it('値段: こんぼう・やくそう 200・たて 250・おまもり 300・つるぎ 500', async () => {
    const { ITEMS } = await import('./items');
    expect(ITEMS.map((i) => [i.id, i.price])).toEqual([['konbou', 200], ['yakusou', 200], ['tate', 250], ['omamori', 300], ['tsurugi', 500]]);
  });
  it('こんぼう 1.5倍・おまもり 2倍・つるぎ 3倍＋同じだけ 回復(最大を こえる)・やくそう 回復', async () => {
    const { applyItem } = await import('./items');
    expect(applyItem('konbou', dmg(8000, 0), win(0, 2), 30000).damage.toEnemy).toBe(12000);
    expect(applyItem('omamori', dmg(8000, 0), win(0, 2), 30000).damage.toEnemy).toBe(16000);
    const t = applyItem('tsurugi', dmg(8000, 0), win(0, 2), 30000);
    expect([t.damage.toEnemy, t.heal, t.overMax]).toEqual([24000, 24000, true]);
    const y = applyItem('yakusou', dmg(8000, 0), win(0, 2), 30000);
    expect([y.damage.toEnemy, y.heal, y.overMax]).toEqual([8000, 8000, false]);
  });
  it('攻撃系は 敵が アガった 時は 発動しない・てつのたては ダメージ 0', async () => {
    const { applyItem } = await import('./items');
    expect(applyItem('konbou', dmg(0, 8000), win(2, 0), 30000).used).toBe(false);
    const t = applyItem('tate', dmg(0, 8000), win(2, 0), 30000);
    expect([t.damage.toPlayer, t.used]).toEqual([0, true]);
    expect(applyItem('tate', dmg(8000, 0), win(0, 2), 30000).used).toBe(false);
  });
});

describe('2周目(企画者 2026-11-09)', () => {
  it('2周目は 敵の HP が 倍', () => {
    expect([0, 1, 2, 3, 4].map((i) => stageAt(i, 2).enemyHp)).toEqual([60000, 100000, 120000, 160000, 200000]);
  });
  it('2周目の さいごを クリアしたら 完全クリア・はじめから(3周目なし)', () => {
    const p = newProgress();
    Object.assign(p, { stage: 4, lap: 2, gold: 900, items: { konbou: 1 }, clears: 9 });
    const r = clearStage(p, 750);
    expect(r).toEqual({ lapUp: true, complete: true });
    expect(p).toEqual({ ...newProgress(), clears: 10 });
  });
});
