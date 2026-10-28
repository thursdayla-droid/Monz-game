import { describe, expect, it } from 'vitest';
import { LifeRecord, loadLife, newLife } from '../src/core/lifeSave';
import { card } from '../src/core/mythclash/cards';
import { cpuAction, cpuChooser, CPU_LEVELS, type CpuLevel } from '../src/core/mythclash/cpu';
import { createBattle, legalActions, resolveRound } from '../src/core/mythclash/engine';
import { BATTLE_MODE, TOWER, TOWER_FLOORS, towerOpenFloors, towerReward } from '../src/core/mythclash/modes';
import { fixCollection } from '../src/core/mythclash/packs';
import { randomDeck } from '../src/core/mythclash/sim';
import { mulberry32 } from '../src/core/rng';
import type { KeyValueStore } from '../src/core/save';

const memoryStore = (): KeyValueStore => {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};

describe('MYTHCLASH tower', () => {
  it('has 10 floors of 2 small fights and a boss, each with 3 different real cards', () => {
    expect(TOWER).toHaveLength(TOWER_FLOORS);
    for (const floor of TOWER) {
      expect(floor.map((b) => b.boss)).toEqual([false, false, true]);
      for (const b of floor) {
        expect(new Set(b.deck).size).toBe(3);
        for (const id of b.deck) expect(card(id)).toBeDefined();
      }
    }
    // 1階はNばかり・ボスはR1枚とN2枚。10階のボスはUR3枚(企画者 2026-10-27)
    const rar = (f: number, b: number) => TOWER[f][b].deck.map((id) => card(id)!.rarity).sort();
    expect(rar(0, 0)).toEqual(['N', 'N', 'N']);
    expect(rar(0, 2)).toEqual(['N', 'N', 'R']);
    expect(rar(9, 2)).toEqual(['UR', 'UR', 'UR']);
    expect(TOWER[9][2].cpu).toBe('strong');
  });

  it('opens floors up to one above the highest cleared floor', () => {
    expect([towerOpenFloors(0), towerOpenFloors(1), towerOpenFloors(9), towerOpenFloors(10)]).toEqual([1, 2, 10, 10]);
  });

  it('first clears pay a lot, replays pay 20%', () => {
    expect(towerReward(1, true)).toEqual({ coins: 500, exp: 20 });
    expect(towerReward(10, true).coins).toBe(5000);
    expect(towerReward(10, false).coins).toBe(1000);
  });

  it('clearing a floor saves the progress and gives coins and EXP once', () => {
    const store = memoryStore();
    const rec = new LifeRecord({ ...newLife(1), coins: 0 }, store);
    const exp0 = rec.monz.exp + rec.monz.level * 1000;
    expect(rec.mythTowerClear(1, 'run1')).toEqual({ first: true, coins: 500, exp: 20 });
    expect(rec.mythTowerClear(1, 'run1')).toBeNull();
    expect(rec.mythTowerClear(1, 'run2')).toEqual({ first: false, coins: 100, exp: 4 });
    // レベルが上がるとコインも入るので、少なくともこれだけ
    expect(rec.coins).toBeGreaterThanOrEqual(600);
    expect(rec.monz.exp + rec.monz.level * 1000).toBeGreaterThan(exp0);
    expect(loadLife(store).mythclash!.towerCleared).toBe(1);
    rec.mythTowerClear(2, 'run3');
    expect(rec.mythclash.towerCleared).toBe(2);
    // 下の階をもう一度クリアしても、進み具合は下がらない
    rec.mythTowerClear(1, 'run4');
    expect(rec.mythclash.towerCleared).toBe(2);
  });

  it('old saves without tower progress still load; bad values are dropped', () => {
    expect(fixCollection({ owned: { 1: 1 } }).towerCleared).toBeUndefined();
    expect(fixCollection({ owned: {}, towerCleared: 4 }).towerCleared).toBe(4);
    expect(fixCollection({ owned: {}, towerCleared: 99 }).towerCleared).toBe(10);
    expect(fixCollection({ owned: {}, towerCleared: 'x' }).towerCleared).toBeUndefined();
  });
});

describe('MYTHCLASH battle mode and CPU levels', () => {
  it('wins pay 100 / 200 / 400 coins', () => {
    expect(CPU_LEVELS.map((l) => BATTLE_MODE[l].coins)).toEqual([100, 200, 400]);
    const rec = new LifeRecord({ ...newLife(1), coins: 0 }, memoryStore());
    expect(rec.mythBattleWin('strong', 'b1')).toEqual({ coins: 400, exp: 20 });
    expect(rec.mythBattleWin('strong', 'b1')).toBeNull();
  });

  it('every CPU level only picks legal actions and games finish', () => {
    const rng = mulberry32(3);
    for (const lv of CPU_LEVELS) {
      for (let g = 0; g < 40; g++) {
        const levels: [CpuLevel, CpuLevel] = [lv, CPU_LEVELS[g % 3]];
        const { state } = createBattle(randomDeck(rng), randomDeck(rng), g);
        const ch = cpuChooser(state, levels);
        while (state.winner === null && state.round < 200) {
          const acts = [cpuAction(state, 0, levels[0], rng), cpuAction(state, 1, levels[1], rng)] as const;
          acts.forEach((a, side) => expect(legalActions(state, side as 0 | 1)).toContainEqual(a));
          resolveRound(state, [acts[0], acts[1]], ch);
        }
        expect(state.winner).not.toBeNull();
      }
    }
  });

  it('the strong CPU does not always counter', () => {
    // 相手が必殺を使える防御の場面で、カウンターは半分くらい
    const rng = mulberry32(11);
    let counters = 0;
    let n = 0;
    for (let g = 0; g < 300; g++) {
      const { state } = createBattle([1, 2, 3], [4, 5, 6], g);
      const def = state.attacker === 0 ? 1 : 0;
      const a = cpuAction(state, def, 'strong', rng);
      n++;
      if (a.type === 'defend' && a.kind === 'counter') counters++;
    }
    expect(counters / n).toBeGreaterThan(0.3);
    expect(counters / n).toBeLessThan(0.7);
  });
});

describe('MYTHCLASH opponents', () => {
  it('every tower battle has its own opponent, and battle mode has one per CPU level', async () => {
    const { ALL_OPPONENTS, opponentFor, towerOpponent } = await import('../src/core/mythclash/opponents');
    expect(ALL_OPPONENTS).toHaveLength(33);
    expect(new Set(ALL_OPPONENTS.map((o) => o.id)).size).toBe(33);
    expect(new Set(ALL_OPPONENTS.map((o) => o.name)).size).toBe(33);
    for (const o of ALL_OPPONENTS) expect(o.name && o.title && o.line).toBeTruthy();
    expect(opponentFor({ mode: 'tower', floor: 10, battle: 2, runId: 'r' })).toEqual(towerOpponent(10, 2));
    expect(opponentFor({ mode: 'battle', level: 'weak' }).id).toBe('b-weak');
  });
});

describe('MYTHCLASH tower: beaten opponents', () => {
  it('remembers beaten opponents (once each); old saves and bad values load fine', () => {
    const store = memoryStore();
    const rec = new LifeRecord({ ...newLife(1), coins: 0 }, store);
    expect(rec.mythTowerBeat('t1-1')).toBe(true);
    rec.mythTowerBeat('t1-1');
    rec.mythTowerBeat('t10-3');
    expect(loadLife(store).mythclash!.towerBeaten).toEqual(['t1-1', 't10-3']);
    expect(fixCollection({ owned: {} }).towerBeaten).toBeUndefined();
    expect(fixCollection({ owned: {}, towerBeaten: ['t2-2', 'x', 5, 't11-1', 't2-2'] }).towerBeaten).toEqual(['t2-2']);
  });
});
