import { shanten } from './hand';
import { doDiscard, doKan, doKyuushu, doTsumo, reactOptions, turnOptions, visibleCounts, type Reaction, type RoundState } from './round';
import { meldKind } from './score';
import { EAST, HAKU, isHonor, isYaochu, KINDS, type Kind, kindOf, numOf, type Tile, toCounts, isRed } from './tiles';
import { mulberry32, type Rng } from '../rng';

/**
 * CPU の 麻雀(2026-11-08 企画者 仕様書「CPU の 麻雀の 強さも 段階的に 上昇」)。
 * 強さ 1〜5【仮】:
 *   1 … シャンテン数だけ 見る・ときどき 打ちまちがえる・守らない
 *   2 … 1 より まちがいが 少ない・役牌は 鳴く
 *   3 … 受け入れ枚数(来れば 進む 牌の 数)で えらぶ・リーチには 少し 守る
 *   4 … 3 ＋ 鳴いて 速く する・押し引き(手が 遠ければ 守る)
 *   5 … 4 ＋ 守りが うまい(筋・字牌の 見えている 数)・まちがいなし
 * ルール(九種九牌は CPU は 必ず 流す)は 企画者 2026-11-08
 */
export type Level = 1 | 2 | 3 | 4 | 5;

export interface Cpu {
  level: Level;
  rng: Rng;
}
export const makeCpu = (level: Level, seed: number): Cpu => ({ level, rng: mulberry32(seed) });

const MISTAKE: Record<Level, number> = { 1: 0.3, 2: 0.15, 3: 0.05, 4: 0.02, 5: 0 };

/** 手から 1枚 ぬいた 時の シャンテン数と 受け入れ枚数 */
function evalDiscard(hand: Tile[], melds: number, t: Tile, unseen: number[]): { sh: number; ukeire: number } {
  const h = [...hand];
  h.splice(h.indexOf(t), 1);
  const c = toCounts(h);
  const sh = shanten(c, melds);
  let ukeire = 0;
  for (let k = 0; k < KINDS; k++) {
    if (unseen[k] <= 0) continue;
    c[k]++;
    if (shanten(c, melds) < sh) ukeire += unseen[k];
    c[k]--;
  }
  return { sh, ukeire };
}

/** その 牌の 価値(低い ほど 先に 捨てる。孤立した 字牌・端牌 から) */
function keepValue(s: RoundState, seat: number, t: Tile): number {
  const k = kindOf(t);
  let v = 0;
  if (isHonor(k)) {
    const yakuhai = k >= HAKU || k === s.cfg.roundWind || k === EAST + ((seat - s.cfg.dealer + 4) % 4);
    v += yakuhai ? 2 : 0;
  } else {
    v += isYaochu(k) ? 1 : 3 - Math.abs(numOf(k) - 5) * 0.4;
  }
  if (isRed(t, s.rules.useRed)) v += 3;
  // ドラ
  const doraKinds = s.events.filter((e) => e.type === 'dora').map((e) => (e as { indicator: Kind }).indicator);
  for (const ind of doraKinds) {
    const d = ind < 27 ? ind - (ind % 9) + (((ind % 9) + 1) % 9) : ind <= 30 ? EAST + ((ind - EAST + 1) % 4) : HAKU + ((ind - HAKU + 1) % 3);
    if (d === k) v += 3;
  }
  return v;
}

/** 危ない 度合い(0 = 安全)。リーチ・鳴いて 手が 進んでいそうな 人に 対して */
function danger(s: RoundState, seat: number, t: Tile, level: Level, vis: number[]): number {
  const k = kindOf(t);
  let worst = 0;
  for (let o = 0; o < 4; o++) {
    if (o === seat) continue;
    const p = s.players[o];
    const threat = p.riichi ? 1 : p.melds.length >= 3 ? 0.6 : p.melds.length === 2 && level >= 5 ? 0.3 : 0;
    if (!threat) continue;
    // 現物(その人が 捨てた 牌・リーチ後に だれかが 通した 牌)は 安全
    const genbutsu = p.discards.some((d) => kindOf(d.tile) === k);
    if (genbutsu) continue;
    let d = 1;
    if (isHonor(k)) d = vis[k] >= 3 ? 0.05 : vis[k] === 2 ? 0.25 : 0.6;
    else if (level >= 4) {
      // 筋(4 が 通れば 1・7、など)
      const n = numOf(k);
      const out = (dn: number) => p.discards.some((x) => kindOf(x.tile) === k + dn);
      const suji = (n <= 3 && out(3)) || (n >= 7 && out(-3)) || (n > 3 && n < 7 && out(-3) && out(3));
      if (suji) d = 0.4;
      if (isYaochu(k)) d *= 0.8;
    }
    worst = Math.max(worst, d * threat);
  }
  return worst;
}

/** ツモの 番の 行動を 決めて 実行する */
export function cpuTurn(s: RoundState, cpu: Cpu): void {
  const seat = s.turn;
  const p = s.players[seat];
  const o = turnOptions(s);
  if (o.tsumo) {
    doTsumo(s);
    return;
  }
  if (o.kyuushu) {
    doKyuushu(s);
    return;
  }
  const melds = p.melds.length;
  const sh0 = shanten(toCounts(p.hand), melds);
  // 暗槓: シャンテンが 下がらない 時・リーチ中で 許される 時
  for (const k of o.ankan) {
    const rest = p.hand.filter((t) => kindOf(t) !== k);
    if (p.riichi || shanten(toCounts(rest), melds + 1) <= sh0) {
      doKan(s, k);
      return;
    }
  }
  for (const k of o.kakan) {
    if (cpu.level >= 3 && !s.players.some((x, i) => i !== seat && x.riichi)) {
      doKan(s, k);
      return;
    }
  }
  if (p.riichi) {
    doDiscard(s, o.discards[0]);
    return;
  }
  const vis = visibleCounts(s, seat);
  const unseen = vis.map((n) => 4 - n);
  const cands = o.discards.map((t) => ({ t, ...evalDiscard(p.hand, melds, t, unseen), keep: keepValue(s, seat, t), danger: cpu.level >= 3 ? danger(s, seat, t, cpu.level, vis) : 0 }));
  // 押し引き: だれかが 危ない 時、手が 遠ければ 守る
  const threatened = s.players.some((x, i) => i !== seat && (x.riichi || (x.melds.length >= 3 && cpu.level >= 4)));
  const fold = threatened && cpu.level >= 3 && (sh0 >= (cpu.level >= 4 ? 2 : 3) || (cpu.level >= 5 && sh0 >= 1 && s.live.length < 20));
  const score = (c: (typeof cands)[number]) => {
    if (fold) return -c.danger * 1000 - c.sh * 10 + c.ukeire * 0.01;
    const uk = cpu.level >= 3 ? c.ukeire : 0;
    return -c.sh * 1000 + uk * 3 - c.keep * 2 - c.danger * (cpu.level >= 4 ? 60 : 20);
  };
  cands.sort((a, b) => score(b) - score(a));
  let pick = cands[0];
  if (cpu.rng() < MISTAKE[cpu.level]) pick = cands[Math.min(cands.length - 1, 1 + Math.floor(cpu.rng() * Math.min(3, cands.length - 1)))] ?? pick;
  // リーチ: テンパイで リーチできる 牌なら する(守っている 時は しない)
  if (!fold && o.riichi.includes(pick.t) && pick.sh === 0) {
    doDiscard(s, pick.t, true);
    return;
  }
  doDiscard(s, pick.t);
}

/** 役牌(三元牌・場風・自風) */
const isYakuhai = (s: RoundState, seat: number, k: Kind) => k >= HAKU || k === s.cfg.roundWind || k === EAST + ((seat - s.cfg.dealer + 4) % 4);

/** 捨て牌に 対する 返事を 決める */
export function cpuReact(s: RoundState, seat: number, cpu: Cpu): Reaction {
  const o = reactOptions(s, seat);
  if (o.ron) return { type: 'ron' };
  if (!s.lastTile) return null;
  const p = s.players[seat];
  const k = kindOf(s.lastTile.tile);
  const melds = p.melds.length;
  const sh0 = shanten(toCounts(p.hand), melds);
  const closedAll = melds === 0 || p.melds.every((m) => m.type === 'ankan');
  // 役が つきそうか(役牌が ある・断么九に できる・混一色/清一色に 近い)
  const all = [...p.hand, ...p.melds.flatMap((m) => m.tiles)];
  const hasYakuhaiTrip = p.melds.some((m) => m.type !== 'chi' && isYakuhai(s, seat, meldKind(m)));
  const tanyaoOk = all.every((t) => !isYaochu(kindOf(t))) || all.filter((t) => isYaochu(kindOf(t))).length <= 1;
  const suitCounts = [0, 1, 2].map((su) => all.filter((t) => kindOf(t) < 27 && Math.floor(kindOf(t) / 9) === su).length);
  const flush = Math.max(...suitCounts) + all.filter((t) => isHonor(kindOf(t))).length >= all.length - 1;
  const after = (used: Tile[]) => {
    const rest = p.hand.filter((t) => !used.includes(t));
    // 鳴いた あと 1枚 捨てる → いちばん よい 捨て牌の シャンテン
    let best = 9;
    for (const t of new Set(rest)) {
      const r = [...rest];
      r.splice(r.indexOf(t), 1);
      best = Math.min(best, shanten(toCounts(r), melds + 1));
    }
    return best;
  };
  const threatened = s.players.some((x, i) => i !== seat && x.riichi);
  // 役牌の ポンは だいたい する
  if (o.pon.length && isYakuhai(s, seat, k) && cpu.level >= 2 && after(o.pon[0]) < sh0) return { type: 'pon', tiles: o.pon[0] };
  if (o.minkan.length && isYakuhai(s, seat, k) && cpu.level >= 4 && !threatened) return { type: 'minkan', tiles: o.minkan[0] };
  if (cpu.level < 4 || threatened) return null;
  // 門前で 手が 速い 時は 鳴かない
  if (closedAll && sh0 <= 1) return null;
  const yakuOk = hasYakuhaiTrip || (tanyaoOk && !isYaochu(k)) || flush;
  if (!yakuOk) return null;
  if (o.pon.length && after(o.pon[0]) < sh0) return { type: 'pon', tiles: o.pon[0] };
  for (const c of o.chi) if (after(c) < sh0) return { type: 'chi', tiles: c };
  return null;
}

