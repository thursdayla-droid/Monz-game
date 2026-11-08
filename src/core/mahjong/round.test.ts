import { describe, expect, it } from 'vitest';
import { newGame, nextRound } from './game';
import { shanten } from './hand';
import { damageOf } from './rpg';
import { doDiscard, doKan, doKyuushu, doTsumo, isFuriten, reactOptions, resolveReactions, startRound, turnOptions, type Reaction, type RoundState } from './round';
import { EAST, kindOf, parseTiles, toCounts } from './tiles';

/** かんたんな ボット: アガれれば アガる・リーチできれば する・シャンテンが 下がる 牌を 捨てる・ときどき 鳴く */
function botTurn(s: RoundState, rnd: () => number) {
  const o = turnOptions(s);
  if (o.tsumo) return doTsumo(s);
  if (o.kyuushu && rnd() < 0.5) return doKyuushu(s);
  if (o.ankan.length && rnd() < 0.5) return doKan(s, o.ankan[0]);
  if (o.kakan.length && rnd() < 0.5) return doKan(s, o.kakan[0]);
  if (o.riichi.length) return doDiscard(s, o.riichi[0], true);
  const p = s.players[s.turn];
  let best = o.discards[0];
  let bs = 99;
  for (const t of o.discards) {
    const h = [...p.hand];
    h.splice(h.indexOf(t), 1);
    const sh = shanten(toCounts(h), p.melds.length);
    if (sh < bs) [bs, best] = [sh, t];
  }
  return doDiscard(s, best);
}
function botReact(s: RoundState, rnd: () => number) {
  const choices: Reaction[] = [0, 1, 2, 3].map((i) => {
    const o = reactOptions(s, i);
    if (o.ron) return { type: 'ron' };
    if (o.minkan.length && rnd() < 0.3) return { type: 'minkan', tiles: o.minkan[0] };
    if (o.pon.length && rnd() < 0.3) return { type: 'pon', tiles: o.pon[0] };
    if (o.chi.length && rnd() < 0.2) return { type: 'chi', tiles: o.chi[0] };
    return null;
  });
  return resolveReactions(s, choices);
}
function playRound(s: RoundState, rnd: () => number) {
  for (let guard = 0; guard < 2000 && s.phase !== 'end'; guard++) {
    if (s.phase === 'turn') botTurn(s, rnd);
    else botReact(s, rnd);
  }
  expect(s.phase).toBe('end');
  return s.result!;
}

const SEEDS = 150;
describe('1局の 流れ', () => {
  it('配牌は 13枚・親は 14枚・王牌14枚・山の 残り', () => {
    const s = startRound({ seed: 1, dealer: 0, roundWind: EAST, honba: 0, sticks: 0, points: [25000, 25000, 25000, 25000] });
    expect(s.players.map((p) => p.hand.length)).toEqual([14, 13, 13, 13]);
    expect(s.dead.length).toBe(14);
    expect(s.live.length).toBe(136 - 14 - 53);
  });
  it('ボットで 半荘を 150回: 止まらない・点数の 合計は 変わらない', () => {
    let wins = 0;
    let draws = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      let x = seed;
      const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
      const g = newGame(seed);
      for (let n = 0; n < 60 && !g.over; n++) {
        const r = playRound(g.round, rnd);
        if (r.kind === 'win') {
          wins++;
          // HP の ダメージは 0 以上
          const d = damageOf(r, 1);
          expect(d.toEnemy).toBeGreaterThanOrEqual(0);
          expect(d.toPlayer).toBeGreaterThanOrEqual(0);
        } else draws++;
        nextRound(g);
        expect(g.points.reduce((a, b) => a + b, 0) + g.sticks * 1000).toBe(100000);
      }
      expect(g.over).toBe(true);
    }
    expect(wins).toBeGreaterThan(draws / 3);
  }, 120000);
});

describe('フリテン・見のがし', () => {
  it('自分の 捨て牌に 待ちが あると ロンできない', () => {
    const s = startRound({ seed: 3, dealer: 0, roundWind: EAST, honba: 0, sticks: 0, points: [25000, 25000, 25000, 25000] });
    // 席1 を 23m の 両面待ちに して、1m を 捨てた ことに する
    s.players[1].hand = parseTiles('23m456p789s11122z');
    s.players[1].discards = [{ tile: parseTiles('1m')[0], riichi: false, called: false, tsumogiri: false }];
    expect(isFuriten(s, 1)).toBe(true);
    s.players[1].discards = [];
    expect(isFuriten(s, 1)).toBe(false);
  });
  it('見のがすと 次の 自分の 打牌まで ロンできない', () => {
    const s = startRound({ seed: 3, dealer: 0, roundWind: EAST, honba: 0, sticks: 0, points: [25000, 25000, 25000, 25000] });
    s.players[1].hand = parseTiles('23m456p789s11122z');
    // 親が 4萬を 捨てる
    const four = parseTiles('4m')[0] + 1;
    s.players[0].hand[0] = four;
    s.drawn = four;
    doDiscard(s, four);
    expect(reactOptions(s, 1).ron).toBe(true);
    resolveReactions(s, [null, null, null, null]);
    expect(s.players[1].furitenTemp).toBe(true);
    expect(isFuriten(s, 1)).toBe(true);
  });
});

describe('ダメージ(仕様書 4)', () => {
  const win = (seat: number, from: number | null, ron: number, paid: number[]) => ({
    kind: 'win' as const,
    delta: [0, 0, 0, 0],
    wins: [{ seat, from, paid, score: { ron } as never }],
  });
  it('ボスから ロンは 100%・子分から ロンは 50%', () => {
    expect(damageOf(win(0, 1, 8000, [0, 8000, 0, 0]), 1).toEnemy).toBe(8000);
    expect(damageOf(win(0, 2, 8000, [0, 0, 8000, 0]), 1).toEnemy).toBe(4000);
  });
  it('プレイヤーの ツモは 3人の 支払いの 合計', () => {
    expect(damageOf(win(0, null, 0, [0, 4000, 2000, 2000]), 1).toEnemy).toBe(8000);
    expect(damageOf(win(0, null, 0, [0, 4000, 4000, 4000]), 1).toEnemy).toBe(12000);
  });
  it('CPU の ロン(プレイヤーから)は 100%・ツモは プレイヤーが 払う 点・CPU どうしは なし', () => {
    expect(damageOf(win(2, 0, 3900, [3900, 0, 0, 0]), 1).toPlayer).toBe(3900);
    expect(damageOf(win(2, null, 0, [4000, 2000, 0, 2000]), 1).toPlayer).toBe(4000);
    expect(damageOf(win(2, 3, 8000, [0, 0, 0, 8000]), 1).toPlayer).toBe(0);
  });
});

void kindOf;

describe('流し満貫・飛び(企画者 2026-11-08)', () => {
  it('捨て牌が 全部 么九牌で 鳴かれていなければ 満貫(子: 親4000・子2000)', () => {
    const s = startRound({ seed: 5, dealer: 0, roundWind: EAST, honba: 0, sticks: 0, points: [25000, 25000, 25000, 25000] });
    const yao = parseTiles('19m19p19s1234z');
    s.players[1].discards = yao.map((tile) => ({ tile, riichi: false, called: false, tsumogiri: false }));
    s.players[2].discards = parseTiles('5m').map((tile) => ({ tile, riichi: false, called: false, tsumogiri: false }));
    s.live = [];
    s.lastTile = { seat: 2, tile: s.players[2].discards[0].tile };
    s.phase = 'react';
    const r = resolveReactions(s, [null, null, null, null])!;
    expect(r.kind).toBe('draw');
    expect(r.delta).toEqual([-4000, 8000, -2000, -2000]);
    // プレイヤー(席0)は 親で 4000 払う → 4000 ダメージ
    expect(damageOf(r, 1).toPlayer).toBe(4000);
  });
  it('点数が 0 より 下に なったら 半荘おわり', () => {
    const g = newGame(9);
    g.round.result = { kind: 'win', wins: [], delta: [-26000, 26000, 0, 0] };
    nextRound(g);
    expect(g.over).toBe(true);
    expect(g.tobi).toBe(true);
  });
});

describe('ウマ・次の 半荘(企画者 2026-11-08)', () => {
  it('自分の 順位の ウマだけ: 1位は 敵へ・4位は 自分へ', async () => {
    const { umaDamage } = await import('./rpg');
    const g = newGame(2);
    g.points = [40000, 30000, 20000, 10000];
    expect(umaDamage(g)).toMatchObject({ toEnemy: 10000, toPlayer: 0 });
    g.points = [10000, 30000, 20000, 40000];
    expect(umaDamage(g)).toMatchObject({ toEnemy: 0, toPlayer: 10000 });
  });
  it('次の 半荘は 点数を 戻さない', async () => {
    const { nextHanchan } = await import('./game');
    const g = newGame(2);
    g.points = [40000, 30000, 20000, 10000];
    g.over = true;
    nextHanchan(g);
    expect(g.points).toEqual([40000, 30000, 20000, 10000]);
    expect(g.round.cfg.points).toBe(g.points);
    expect([g.roundWind, g.kyoku, g.over]).toEqual([EAST, 0, false]);
  });
});
