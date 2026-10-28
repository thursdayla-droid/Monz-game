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

describe('MYTHCLASH: opponent abilities stay hidden until they trigger', () => {
  it('abilityKnown is false for the opponent until an ability event, always true for own cards', async () => {
    const { viewFor } = await import('../src/core/mythclash/view');
    const rng = mulberry32(5);
    let revealedSeen = false;
    for (let g = 0; g < 60 && !revealedSeen; g++) {
      // No.001(狩人の一矢)と No.026(雷帝の威光)は最初の攻撃で発動する特性
      const { state } = createBattle([2, 4, 5], [1, 26, 3], g);
      expect(viewFor(state, 0).opponent.every((c) => c.hidden || !c.abilityKnown)).toBe(true);
      expect(viewFor(state, 1).me.every((c) => c.abilityKnown)).toBe(true);
      const ch = cpuChooser(state, ['normal', 'normal']);
      while (state.winner === null && state.round < 200) {
        const ev = resolveRound(state, [cpuAction(state, 0, 'normal', rng), cpuAction(state, 1, 'normal', rng)], ch);
        const v = viewFor(state, 0);
        for (const c of v.opponent) {
          if (c.hidden) continue;
          const fired = state.teams[1].cards.find((x) => x.id === c.id)!.abilityRevealed;
          expect(c.abilityKnown).toBe(fired);
        }
        if (ev.some((e) => e.type === 'ability' && e.side === 1)) revealedSeen = true;
      }
    }
    expect(revealedSeen).toBe(true);
  });
});

describe('MYTHCLASH No.101 Mr.CLASH (special card)', () => {
  it('is never in packs or random CPU decks, and is a known card', async () => {
    const { drawPackCard } = await import('../src/core/mythclash/packs');
    const { CARDS, MR_CLASH, isSpecialCard } = await import('../src/core/mythclash/cards');
    const rng = mulberry32(9);
    for (let i = 0; i < 50000; i++) expect(drawPackCard(rng)).not.toBe(MR_CLASH);
    for (let i = 0; i < 3000; i++) expect(randomDeck(rng)).not.toContain(MR_CLASH);
    expect(CARDS.some((c) => c.id === MR_CLASH)).toBe(false);
    expect(isSpecialCard(MR_CLASH)).toBe(true);
    expect(card(MR_CLASH)).toMatchObject({ name: 'Mr.CLASH', rarity: 'LR', maxHp: 200, atk: 10, def: 8, mag: 10, spd: 9 });
    expect(fixCollection({ owned: { 101: 1 } }).owned).toEqual({ 101: 1 });
  });

  it('王者の証: while it is on the field, the opponent cannot switch (it is announced on entry)', () => {
    const { state, events } = createBattle([101, 1, 2], [3, 4, 5], 1);
    expect(events.some((e) => e.type === 'ability' && e.side === 0 && e.code === 'king_lock')).toBe(true);
    expect(state.half).toBe(1);
    expect(legalActions(state, 1).some((a) => a.type === 'switch')).toBe(false);
    expect(legalActions(state, 0).some((a) => a.type === 'switch')).toBe(true);
  });

  it('is given once (when the 10F boss is beaten)', () => {
    const rec = new LifeRecord({ ...newLife(1), coins: 0 }, memoryStore());
    expect(rec.mythGetSpecialCard(101)).toBe(true);
    expect(rec.mythGetSpecialCard(101)).toBe(false);
    expect(rec.mythclash.owned[101]).toBe(1);
    expect(rec.mythclash.packs).toBe(0);
  });
});
