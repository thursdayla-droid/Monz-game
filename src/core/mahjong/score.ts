import { decompose, isChiitoi, isKokushi, type Decomp } from './hand';
import { CHUN, doraOf, HAKU, HATSU, isDragon, isHonor, isTerminal, isYaochu, isWind, type Kind, kindOf, isRed, suitOf, type Tile, toCounts, EAST } from './tiles';

/**
 * 役・符・翻・点数(2026-11-08 企画者 仕様書:「通常の 符・翻・点数計算」「簡略化しない」)。
 * ダブル役満 あり・数え役満 あり(企画者 2026-11-08)。
 */

export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';
export interface Meld {
  type: MeldType;
  /** 面子の 牌(チーは 小さい順) */
  tiles: Tile[];
  /** 鳴いた 牌(ankan は なし) */
  called?: Tile;
  /** 誰から 鳴いたか(席の 番号) */
  from?: number;
}
export const meldKind = (m: Meld): Kind => Math.min(...m.tiles.map(kindOf));
export const isKan = (m: Meld): boolean => m.type === 'minkan' || m.type === 'ankan' || m.type === 'kakan';
export const isOpen = (m: Meld): boolean => m.type !== 'ankan';

export interface WinContext {
  /** 鳴いていない 手牌(アガリ牌を ふくむ) */
  hand: Tile[];
  melds: Meld[];
  winTile: Tile;
  tsumo: boolean;
  seatWind: Kind;
  roundWind: Kind;
  dealer: boolean;
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  /** 海底(最後の ツモで アガリ) */
  haitei?: boolean;
  /** 河底(最後の 捨て牌で ロン) */
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  /** ドラ表示牌(種類) */
  doraIndicators: Kind[];
  /** 裏ドラ表示牌(リーチの 時だけ 数える) */
  uraIndicators?: Kind[];
  /** 赤ドラを 使うか(企画者 2026-11-08 あり) */
  useRed?: boolean;
}

export interface Yaku {
  name: string;
  han: number;
  /** 役満の 倍数(1 = 役満・2 = ダブル役満) */
  yakuman?: number;
}

export interface Score {
  yaku: Yaku[];
  han: number;
  fu: number;
  dora: number;
  /** 役満の 倍数(0 = 役満でない・数え役満は 1) */
  yakuman: number;
  /** 満貫などの 名前 */
  limit: '' | '満貫' | '跳満' | '倍満' | '三倍満' | '役満' | 'ダブル役満' | 'トリプル役満' | '数え役満';
  /** 基本点 */
  base: number;
  /** ロンの 時の 点(本場なし) */
  ron: number;
  /** ツモの 時: 親が 払う 点・子が 払う 点(本場なし。親の ツモは 全員 dealerPay) */
  tsumoDealer: number;
  tsumoChild: number;
}

const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

/** 翻と符から 基本点 */
export function basePoints(han: number, fu: number, yakuman = 0): { base: number; limit: Score['limit'] } {
  if (yakuman > 0) return { base: 8000 * yakuman, limit: yakuman === 1 ? '役満' : yakuman === 2 ? 'ダブル役満' : 'トリプル役満' };
  if (han >= 13) return { base: 8000, limit: '数え役満' };
  if (han >= 11) return { base: 6000, limit: '三倍満' };
  if (han >= 8) return { base: 4000, limit: '倍満' };
  if (han >= 6) return { base: 3000, limit: '跳満' };
  const b = fu * 2 ** (han + 2);
  if (han >= 5 || b >= 2000) return { base: 2000, limit: '満貫' };
  return { base: b, limit: '' };
}

/** 基本点から 払う 点 */
export function payments(base: number, dealer: boolean): { ron: number; tsumoDealer: number; tsumoChild: number } {
  if (dealer) return { ron: ceil100(base * 6), tsumoDealer: ceil100(base * 2), tsumoChild: ceil100(base * 2) };
  return { ron: ceil100(base * 4), tsumoDealer: ceil100(base * 2), tsumoChild: ceil100(base) };
}

/** 1つの 面子(手の 中 または 鳴き)を そろえた 形 */
interface Set3 {
  type: 'seq' | 'trip' | 'kan';
  kind: Kind;
  open: boolean;
}

type Wait = 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'tanki';

const GREEN = new Set<Kind>([19, 20, 21, 23, 25, HATSU]);

function countDora(ctx: WinContext): number {
  const all = [...ctx.hand, ...ctx.melds.flatMap((m) => m.tiles)];
  let n = 0;
  for (const ind of ctx.doraIndicators) n += all.filter((t) => kindOf(t) === doraOf(ind)).length;
  if (ctx.riichi || ctx.doubleRiichi) for (const ind of ctx.uraIndicators ?? []) n += all.filter((t) => kindOf(t) === doraOf(ind)).length;
  if (ctx.useRed !== false) n += all.filter((t) => isRed(t)).length;
  return n;
}

/** 状況だけで 決まる 役(形に よらない) */
function situationYaku(ctx: WinContext, closed: boolean): Yaku[] {
  const y: Yaku[] = [];
  if (ctx.doubleRiichi) y.push({ name: 'ダブル立直', han: 2 });
  else if (ctx.riichi) y.push({ name: '立直', han: 1 });
  if ((ctx.riichi || ctx.doubleRiichi) && ctx.ippatsu) y.push({ name: '一発', han: 1 });
  if (ctx.tsumo && closed) y.push({ name: '門前清自摸和', han: 1 });
  if (ctx.haitei && ctx.tsumo && !ctx.rinshan) y.push({ name: '海底摸月', han: 1 });
  if (ctx.houtei && !ctx.tsumo) y.push({ name: '河底撈魚', han: 1 });
  if (ctx.rinshan) y.push({ name: '嶺上開花', han: 1 });
  if (ctx.chankan) y.push({ name: '槍槓', han: 1 });
  return y;
}

/** 役満(形に よる もの)。見つかれば 役満の 役を 返す */
function yakumanOf(ctx: WinContext, counts: number[], sets: Set3[] | null, pair: Kind, wait: Wait | null, closed: boolean): Yaku[] {
  const y: Yaku[] = [];
  const all = [...counts];
  for (const m of ctx.melds) for (const t of m.tiles) all[kindOf(t)]++;
  const kinds = all.map((n, k) => (n > 0 ? k : -1)).filter((k) => k >= 0);
  const wk = kindOf(ctx.winTile);
  if (ctx.tenhou) y.push({ name: '天和', han: 13, yakuman: 1 });
  if (ctx.chiihou) y.push({ name: '地和', han: 13, yakuman: 1 });
  if (sets === null) {
    // 国士無双(13面待ちは ダブル)
    const before = [...counts];
    before[wk]--;
    const thirteen = before.filter((n, k) => isYaochu(k) && n === 1).length === 13;
    y.push(thirteen ? { name: '国士無双十三面待ち', han: 26, yakuman: 2 } : { name: '国士無双', han: 13, yakuman: 1 });
    return y;
  }
  const trips = sets.filter((s) => s.type !== 'seq');
  const concealedTrips = trips.filter((s) => !s.open);
  if (concealedTrips.length === 4) y.push(wait === 'tanki' ? { name: '四暗刻単騎', han: 26, yakuman: 2 } : { name: '四暗刻', han: 13, yakuman: 1 });
  const dragonTrips = trips.filter((s) => isDragon(s.kind)).length;
  if (dragonTrips === 3) y.push({ name: '大三元', han: 13, yakuman: 1 });
  const windTrips = trips.filter((s) => isWind(s.kind)).length;
  if (windTrips === 4) y.push({ name: '大四喜', han: 26, yakuman: 2 });
  else if (windTrips === 3 && isWind(pair)) y.push({ name: '小四喜', han: 13, yakuman: 1 });
  if (kinds.every(isHonor)) y.push({ name: '字一色', han: 13, yakuman: 1 });
  if (kinds.every((k) => GREEN.has(k))) y.push({ name: '緑一色', han: 13, yakuman: 1 });
  if (kinds.every(isTerminal)) y.push({ name: '清老頭', han: 13, yakuman: 1 });
  if (sets.filter((s) => s.type === 'kan').length === 4) y.push({ name: '四槓子', han: 13, yakuman: 1 });
  // 九蓮宝燈(鳴きなし・1種類で 1112345678999+1枚。9面待ちは ダブル)
  if (closed && ctx.melds.length === 0) {
    const s = suitOf(kinds[0]);
    if (s < 3 && kinds.every((k) => suitOf(k) === s)) {
      const base = s * 9;
      const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      const ok = need.every((n, i) => counts[base + i] >= n);
      if (ok) {
        const before = [...counts];
        before[wk]--;
        const junsei = need.every((n, i) => before[base + i] === n);
        y.push(junsei ? { name: '純正九蓮宝燈', han: 26, yakuman: 2 } : { name: '九蓮宝燈', han: 13, yakuman: 1 });
      }
    }
  }
  return y;
}

/** ふつうの 形の 役(役満以外) */
function normalYaku(ctx: WinContext, sets: Set3[], pair: Kind, wait: Wait, closed: boolean): Yaku[] {
  const y: Yaku[] = [];
  const allKinds = [...sets.flatMap((s) => (s.type === 'seq' ? [s.kind, s.kind + 1, s.kind + 2] : [s.kind])), pair];
  const seqs = sets.filter((s) => s.type === 'seq');
  const trips = sets.filter((s) => s.type !== 'seq');
  const yakuhai = (k: Kind) => (k === ctx.seatWind ? 1 : 0) + (k === ctx.roundWind ? 1 : 0) + (isDragon(k) ? 1 : 0);
  // 平和
  if (closed && seqs.length === 4 && yakuhai(pair) === 0 && wait === 'ryanmen') y.push({ name: '平和', han: 1 });
  // 断么九(喰いタン あり 企画者 2026-11-08)
  if (allKinds.every((k) => !isYaochu(k))) y.push({ name: '断么九', han: 1 });
  // 一盃口・二盃口
  if (closed) {
    const key = seqs.map((s) => s.kind).sort((a, b) => a - b);
    let pairs = 0;
    for (let i = 0; i + 1 < key.length; i++)
      if (key[i] === key[i + 1]) {
        pairs++;
        i++;
      }
    if (pairs === 2) y.push({ name: '二盃口', han: 3 });
    else if (pairs === 1) y.push({ name: '一盃口', han: 1 });
  }
  // 役牌
  for (const t of trips) {
    if (t.kind === HAKU) y.push({ name: '役牌 白', han: 1 });
    if (t.kind === HATSU) y.push({ name: '役牌 發', han: 1 });
    if (t.kind === CHUN) y.push({ name: '役牌 中', han: 1 });
    if (t.kind === ctx.seatWind) y.push({ name: `自風 ${'東南西北'[t.kind - EAST]}`, han: 1 });
    if (t.kind === ctx.roundWind) y.push({ name: `場風 ${'東南西北'[t.kind - EAST]}`, han: 1 });
  }
  // 三色同順
  for (let n = 0; n < 7; n++) if ([0, 9, 18].every((b) => seqs.some((s) => s.kind === b + n))) {
    y.push({ name: '三色同順', han: closed ? 2 : 1 });
    break;
  }
  // 一気通貫
  for (const b of [0, 9, 18]) if ([0, 3, 6].every((o) => seqs.some((s) => s.kind === b + o))) {
    y.push({ name: '一気通貫', han: closed ? 2 : 1 });
    break;
  }
  // 混全帯么九・純全帯么九(順子が 1つ 以上)
  const groupHasYaochu = (s: Set3) => (s.type === 'seq' ? isTerminal(s.kind) || isTerminal(s.kind + 2) : isYaochu(s.kind));
  const groupHasTerm = (s: Set3) => (s.type === 'seq' ? isTerminal(s.kind) || isTerminal(s.kind + 2) : isTerminal(s.kind));
  const honroutou = allKinds.every(isYaochu);
  if (seqs.length > 0 && sets.every(groupHasYaochu) && isYaochu(pair)) {
    if (sets.every(groupHasTerm) && isTerminal(pair)) y.push({ name: '純全帯么九', han: closed ? 3 : 2 });
    else y.push({ name: '混全帯么九', han: closed ? 2 : 1 });
  }
  // 対々和
  if (trips.length === 4) y.push({ name: '対々和', han: 2 });
  // 三暗刻
  if (trips.filter((t) => !t.open).length === 3) y.push({ name: '三暗刻', han: 2 });
  // 三色同刻
  for (let n = 0; n < 9; n++) if ([0, 9, 18].every((b) => trips.some((t) => t.kind === b + n))) {
    y.push({ name: '三色同刻', han: 2 });
    break;
  }
  // 三槓子
  if (sets.filter((s) => s.type === 'kan').length === 3) y.push({ name: '三槓子', han: 2 });
  // 小三元
  if (trips.filter((t) => isDragon(t.kind)).length === 2 && isDragon(pair)) y.push({ name: '小三元', han: 2 });
  // 混老頭
  if (honroutou) y.push({ name: '混老頭', han: 2 });
  // 混一色・清一色
  const suits = new Set(allKinds.filter((k) => !isHonor(k)).map(suitOf));
  if (suits.size === 1) {
    if (allKinds.some(isHonor)) y.push({ name: '混一色', han: closed ? 3 : 2 });
    else y.push({ name: '清一色', han: closed ? 6 : 5 });
  }
  return y;
}

/** 符(七対子・平和ツモは 別) */
function fuOf(ctx: WinContext, sets: Set3[], pair: Kind, wait: Wait, closed: boolean, pinfu: boolean): number {
  if (pinfu) return ctx.tsumo ? 20 : 30;
  let fu = 20;
  if (closed && !ctx.tsumo) fu += 10;
  if (ctx.tsumo) fu += 2;
  for (const s of sets) {
    if (s.type === 'seq') continue;
    let f = s.type === 'kan' ? 8 : 2;
    if (!s.open) f *= 2;
    if (isYaochu(s.kind)) f *= 2;
    fu += f;
  }
  // 雀頭(連風牌は 4符)
  if (isDragon(pair)) fu += 2;
  if (pair === ctx.seatWind) fu += 2;
  if (pair === ctx.roundWind) fu += 2;
  if (wait === 'kanchan' || wait === 'penchan' || wait === 'tanki') fu += 2;
  // 鳴いた 平和形(喰い平和)は 30符
  if (fu === 20) return 30;
  return Math.ceil(fu / 10) * 10;
}

/** アガリ牌を どの 面子で 受けたか の 候補 */
function waitsFor(d: Decomp, wk: Kind): { idx: number; wait: Wait }[] {
  const out: { idx: number; wait: Wait }[] = [];
  if (d.pair === wk) out.push({ idx: -1, wait: 'tanki' });
  d.groups.forEach((g, i) => {
    if (g.type === 'trip' && g.kind === wk) out.push({ idx: i, wait: 'shanpon' });
    if (g.type === 'seq' && wk >= g.kind && wk <= g.kind + 2) {
      const pos = wk - g.kind;
      const n = (g.kind % 9) + 1;
      let w: Wait = 'ryanmen';
      if (pos === 1) w = 'kanchan';
      else if ((pos === 2 && n === 1) || (pos === 0 && n === 7)) w = 'penchan';
      out.push({ idx: i, wait: w });
    }
  });
  return out;
}

/** 役が あるか(役が ないと アガれない。ドラは 役ではない) */
export function finish(yaku: Yaku[], fu: number, dora: number, dealer: boolean): Score | null {
  if (yaku.length === 0) return null;
  const ym = yaku.filter((y) => y.yakuman);
  if (ym.length) {
    const mult = ym.reduce((a, y) => a + (y.yakuman ?? 0), 0);
    const { base, limit } = basePoints(13, fu, mult);
    return { yaku: ym, han: ym.reduce((a, y) => a + y.han, 0), fu, dora: 0, yakuman: mult, limit, base, ...payments(base, dealer) };
  }
  const han = yaku.reduce((a, y) => a + y.han, 0) + dora;
  const { base, limit } = basePoints(han, fu);
  return { yaku, han, fu, dora, yakuman: limit === '数え役満' ? 1 : 0, limit, base, ...payments(base, dealer) };
}

/**
 * アガリの 点数を 出す。アガリの 形でない・役が ない 時は null。
 * 分け方が いくつか ある 時は いちばん 高い 点に なる 分け方を 使う
 */
export function scoreHand(ctx: WinContext): Score | null {
  const counts = toCounts(ctx.hand);
  const closed = ctx.melds.every((m) => !isOpen(m));
  const meldSets: Set3[] = ctx.melds.map((m) => ({ type: isKan(m) ? 'kan' : m.type === 'chi' ? 'seq' : 'trip', kind: meldKind(m), open: isOpen(m) }));
  const dora = countDora(ctx);
  const sit = situationYaku(ctx, closed);
  const candidates: Score[] = [];
  const better = (a: Score, b: Score) => (a.ron !== b.ron ? a.ron > b.ron : a.han !== b.han ? a.han > b.han : a.fu > b.fu);

  // 国士無双
  if (ctx.melds.length === 0 && isKokushi(counts)) {
    const s = finish(yakumanOf(ctx, counts, null, -1, null, true), 0, 0, ctx.dealer);
    if (s) candidates.push(s);
  }
  // 七対子(二盃口の 形でも 取れるが、高いほうを 使う)
  if (ctx.melds.length === 0 && isChiitoi(counts)) {
    const kinds = counts.map((n, k) => (n ? k : -1)).filter((k) => k >= 0);
    const ym: Yaku[] = [];
    if (ctx.tenhou) ym.push({ name: '天和', han: 13, yakuman: 1 });
    if (ctx.chiihou) ym.push({ name: '地和', han: 13, yakuman: 1 });
    if (kinds.every(isHonor)) ym.push({ name: '字一色', han: 13, yakuman: 1 });
    if (ym.length) candidates.push(finish(ym, 25, 0, ctx.dealer)!);
    else {
      const y: Yaku[] = [...sit, { name: '七対子', han: 2 }];
      if (kinds.every((k) => !isYaochu(k))) y.push({ name: '断么九', han: 1 });
      if (kinds.every(isYaochu)) y.push({ name: '混老頭', han: 2 });
      const suits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));
      if (suits.size === 1) y.push(kinds.some(isHonor) ? { name: '混一色', han: 3 } : { name: '清一色', han: 6 });
      const s = finish(y, 25, dora, ctx.dealer);
      if (s) candidates.push(s);
    }
  }
  // ふつうの 形
  const wk = kindOf(ctx.winTile);
  for (const d of decompose(counts)) {
    for (const { idx, wait } of waitsFor(d, wk)) {
      const sets: Set3[] = d.groups.map((g, i) => ({
        type: g.type,
        kind: g.kind,
        // ロンで 受けた 刻子は 明刻
        open: g.type === 'trip' && i === idx && !ctx.tsumo,
      }));
      const all = [...sets, ...meldSets];
      const ym = yakumanOf(ctx, counts, all, d.pair, wait, closed);
      if (ym.length) {
        const s = finish(ym, 0, 0, ctx.dealer);
        if (s) candidates.push(s);
        continue;
      }
      const ny = normalYaku(ctx, all, d.pair, wait, closed);
      const pinfu = ny.some((y) => y.name === '平和');
      // 平和の ツモは 門前清自摸和と 両方 つく
      const yaku = [...sit, ...ny];
      const fu = fuOf(ctx, all, d.pair, wait, closed, pinfu);
      const s = finish(yaku, fu, dora, ctx.dealer);
      if (s) candidates.push(s);
    }
  }
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (better(b, a) ? b : a));
}
