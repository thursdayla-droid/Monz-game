import { describe, expect, it } from 'vitest';
import { newGame, nextRound, restoreGame, snapshotGame } from './game';
import { clearSuspend, loadSuspend, MJ_SUSPEND_KEY, saveSuspend } from './progress';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('麻雀クエスト: 中断して 続きから(企画者 2026-11-15「A: 局の はじめから」)', () => {
  it('局の はじめを 保存 → 読みこむと 同じ 点数・同じ 局・同じ 配牌', () => {
    const g = newGame(12345, 0);
    // 1局 すすめる(だれかが ツモ アガリ した ことに して 点を 動かす)
    g.round.result = { kind: 'draw', reason: 'exhaust', tenpai: [true, false, false, false], delta: [3000, -1000, -1000, -1000] } as never;
    nextRound(g);
    const s = mem();
    saveSuspend({ version: 1, stage: 2, lap: 1, item: 'tate', hp: { player: 30000, playerMax: 40000, enemy: 50000, enemyMax: 80000 }, game: snapshotGame(g) }, s);
    const back = loadSuspend(s)!;
    expect([back.stage, back.lap, back.item, back.hp.player]).toEqual([2, 1, 'tate', 30000]);
    const g2 = restoreGame(back.game);
    expect(g2.points).toEqual(g.points);
    expect([g2.kyoku, g2.honba, g2.roundWind]).toEqual([g.kyoku, g.honba, g.roundWind]);
    expect(g2.round.players.map((p) => p.hand.join(','))).toEqual(g.round.players.map((p) => p.hand.join(',')));
  });

  it('こわれた データ・HP 0 は 続きから に しない。消せる', () => {
    const s = mem();
    s.setItem(MJ_SUSPEND_KEY, '{oops');
    expect(loadSuspend(s)).toBeNull();
    const g = newGame(1, 0);
    saveSuspend({ version: 1, stage: 0, lap: 1, item: null, hp: { player: 0, playerMax: 1, enemy: 1, enemyMax: 1 }, game: snapshotGame(g) }, s);
    expect(loadSuspend(s)).toBeNull();
    saveSuspend({ version: 1, stage: 0, lap: 1, item: null, hp: { player: 1, playerMax: 1, enemy: 1, enemyMax: 1 }, game: snapshotGame(g) }, s);
    expect(loadSuspend(s)).not.toBeNull();
    clearSuspend(s);
    expect(loadSuspend(s)).toBeNull();
  });
});
