import { describe, expect, it } from 'vitest';
import { rumbleReward } from './rumble';

describe('MONZ RUMBLE の ごほうび(2026-11-07 企画者)', () => {
  it('STREET KING: Nステージめは 10×N、2回目からは 2割', () => {
    expect(rumbleReward('story', 1, true)).toEqual({ exp: 10, coins: 10 });
    expect(rumbleReward('story', 2, true)).toEqual({ exp: 20, coins: 20 });
    expect(rumbleReward('story', 30, true)).toEqual({ exp: 300, coins: 300 });
    expect(rumbleReward('story', 1, false)).toEqual({ exp: 2, coins: 2 });
    expect(rumbleReward('story', 30, false)).toEqual({ exp: 60, coins: 60 });
  });
  it('バトルモード: ★1=10 ★2=30 ★3=50 ★4=100 ★5=500、2回目からは 2割', () => {
    expect([1, 2, 3, 4, 5].map((n) => rumbleReward('free', n, true).coins)).toEqual([10, 30, 50, 100, 500]);
    expect([1, 2, 3, 4, 5].map((n) => rumbleReward('free', n, false).exp)).toEqual([2, 6, 10, 20, 100]);
  });
});

import { LifeRecord, newLife } from './lifeSave';

describe('rumbleWin: 1回目と 2回目', () => {
  it('同じ ステージ・同じ CPU は 2回目から 2割', () => {
    const r = new LifeRecord(newLife(1));
    const c0 = r.coins;
    expect(r.rumbleWin('story', 3).first).toBe(true);
    expect(r.coins - c0).toBe(30);
    expect(r.rumbleWin('story', 3)).toMatchObject({ first: false, coins: 6 });
    expect(r.rumbleWin('story', 2).first).toBe(false); // 先まで クリアした あとの 前の ステージ
    expect(r.rumbleWin('free', 5, 5)).toMatchObject({ first: true, coins: 500 });
    expect(r.rumbleWin('free', 5, 5)).toMatchObject({ first: false, coins: 100 });
    expect(r.rumbleWin('free', 1, 1).first).toBe(true);
    expect(r.snapshot.rumble).toEqual({ cleared: 3, cpuWon: [5, 1] });
  });
});

describe('最大レベル 100(2026-11-07 企画者)', () => {
  it('どれだけ 勝っても 100 で 止まる', () => {
    const r = new LifeRecord(newLife(1));
    for (let i = 0; i < 3000; i++) r.rumbleWin('free', 5, 5);
    expect(r.monz.level).toBe(100);
    expect(r.monz.exp).toBe(0);
    expect(r.expRate).toBe(1);
  });
});

describe('型は 自由ポイントで 決まる(2026-11-07 企画者)', () => {
  it('いちばん多く 入れた 能力。同じ数なら 先に なった 方。HP は 型に ならない', () => {
    const r = new LifeRecord(newLife(1));
    for (let i = 0; i < 3000; i++) r.rumbleWin('free', 5, 5);
    expect(r.monz.growType).toBeUndefined();
    r.allocate('hp');
    expect(r.monz.growType).toBeUndefined();
    r.allocate('tough');
    expect(r.monz.growType).toBe('tough');
    r.allocate('speed');
    expect(r.monz.growType).toBe('tough'); // 1 と 1 → 先の タフネス
    r.allocate('speed');
    expect(r.monz.growType).toBe('speed');
    // Lv.100 でも その場で 型の 技を 覚える
    expect(r.monz.techs?.learned).toContain('瞬速スピン');
    expect(r.monz.techs?.learned).toContain('頑丈ドーム');
    expect(r.monz.techs?.learned).not.toContain('剛力クラッシュ');
  });
});
