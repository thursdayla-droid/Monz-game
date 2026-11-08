import { isAgari, shanten, waits } from './hand';
import { isKan, meldKind, scoreHand, type Meld, type Score, type WinContext } from './score';
import { EAST, isYaochu, KINDS, type Kind, kindOf, shuffledWall, type Tile, toCounts, numOf } from './tiles';

/**
 * 1局の 流れ(配牌 → ツモ → 打牌 → 鳴き・ロン → … → アガリ か 流局)。
 * 2026-11-08 企画者 仕様書 Ver.1.0:「麻雀の ルールを 簡略化しない」。細かい ルールは docs/MAHJONG.md。
 * 席 0 が プレイヤー。Phaser に 依存しない(テスト・CPU で 使う)
 */

export interface RoundRules {
  /** 赤ドラ(企画者 2026-11-08 あり) */
  useRed: boolean;
  /** 喰いタン(企画者 2026-11-08 あり。score.ts は 常に あり) */
  kuitan: boolean;
  /** ダブロン(1枚に 2人以上が ロン)【仮：ふつうの 麻雀どおり あり。上家から 順に 本場・供託】 */
  multiRon: boolean;
}
export const DEFAULT_RULES: RoundRules = { useRed: true, kuitan: true, multiRon: true };

export interface RoundConfig {
  seed: number;
  /** 親の 席 */
  dealer: number;
  roundWind: Kind;
  honba: number;
  /** 場に 出ている リーチ棒(供託)の 本数 */
  sticks: number;
  /** 4人の 持ち点(リーチできるか に 使う) */
  points: number[];
  rules?: Partial<RoundRules>;
  /** テスト用: 山を 決める */
  wall?: Tile[];
}

export interface Discard {
  tile: Tile;
  riichi: boolean;
  /** 鳴かれた */
  called: boolean;
  tsumogiri: boolean;
}

export interface PlayerState {
  hand: Tile[];
  melds: Meld[];
  discards: Discard[];
  /** 0 なし・1 リーチ・2 ダブルリーチ */
  riichi: 0 | 1 | 2;
  ippatsu: boolean;
  /** 見のがした ので この 打牌まで ロンできない */
  furitenTemp: boolean;
  /** リーチ後に 見のがした(この 局は ずっと ロンできない) */
  furitenRiichi: boolean;
  /** 鳴いた 直後の 打牌で 捨てては いけない 牌の 種類(喰い替え) */
  kuikae: Kind[];
}

export interface WinResult {
  seat: number;
  /** ロンされた 席(ツモは null) */
  from: number | null;
  score: Score;
  /** アガリの 点(本場・供託なし)を 誰が いくら 払ったか(席ごと。払った人が プラス) */
  paid: number[];
}

export type RoundResult =
  | { kind: 'win'; wins: WinResult[]; delta: number[] }
  | {
      kind: 'draw';
      reason: 'exhaust' | 'kyuushu';
      tenpai: boolean[];
      delta: number[];
      /** 流し満貫の 人と 払った 点(席ごと。払った人が プラス)(企画者 2026-11-08「流し満貫 アリ」) */
      nagashi?: { seat: number; paid: number[] }[];
    };

export type RoundEvent =
  | { type: 'draw'; seat: number; rinshan: boolean }
  | { type: 'discard'; seat: number; tile: Tile; riichi: boolean }
  | { type: 'call'; seat: number; meld: Meld }
  | { type: 'dora'; indicator: Kind }
  | { type: 'end'; result: RoundResult };

/** ツモの 番の 時に できること */
export interface TurnOptions {
  tsumo: boolean;
  /** 捨てて よい 牌 */
  discards: Tile[];
  /** リーチ できる 捨て牌 */
  riichi: Tile[];
  /** 暗槓・加槓 できる 牌の 種類 */
  ankan: Kind[];
  kakan: Kind[];
  kyuushu: boolean;
}

/** 捨て牌に 対して できること */
export interface ReactOptions {
  ron: boolean;
  pon: Tile[][];
  minkan: Tile[][];
  chi: Tile[][];
}
export type Reaction = { type: 'ron' } | { type: 'pon' | 'minkan' | 'chi'; tiles: Tile[] } | null;

export interface RoundState {
  cfg: RoundConfig;
  rules: RoundRules;
  players: PlayerState[];
  live: Tile[];
  dead: Tile[];
  /** めくった ドラ表示牌の 数(1〜5) */
  doraCount: number;
  /** 明槓・加槓の あと 打牌で めくる ドラ */
  pendingDora: number;
  kans: number;
  turn: number;
  phase: 'turn' | 'react' | 'chankan' | 'end';
  /** 今 ツモった 牌(鳴いた あとは null) */
  drawn: Tile | null;
  /** 嶺上牌を ツモった 直後 */
  rinshan: boolean;
  /** 今の 捨て牌(または 加槓の 牌) */
  lastTile: { seat: number; tile: Tile } | null;
  /** だれも 鳴いていない(天和・地和・ダブリー・九種九牌) */
  noCalls: boolean;
  /** リーチを 宣言して 捨てた 所(ロンされなければ 成立) */
  pendingRiichi: number | null;
  /** 加槓の 途中(槍槓を 待っている) */
  pendingKakan: { seat: number; meldIndex: number; tile: Tile } | null;
  events: RoundEvent[];
  result: RoundResult | null;
}

export const seatWind = (s: RoundState, seat: number): Kind => EAST + ((seat - s.cfg.dealer + 4) % 4);
export const doraIndicators = (s: RoundState): Kind[] => Array.from({ length: s.doraCount }, (_, i) => kindOf(s.dead[4 + i]));
export const uraIndicators = (s: RoundState): Kind[] => Array.from({ length: s.doraCount }, (_, i) => kindOf(s.dead[9 + i]));

const removeTile = (hand: Tile[], t: Tile) => {
  const i = hand.indexOf(t);
  if (i < 0) throw new Error(`tile ${t} not in hand`);
  hand.splice(i, 1);
};
const sortHand = (h: Tile[]) => h.sort((a, b) => a - b);

export function startRound(cfg: RoundConfig): RoundState {
  const wall = cfg.wall ? [...cfg.wall] : shuffledWall(cfg.seed);
  const dead = wall.splice(wall.length - 14, 14);
  const players: PlayerState[] = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [], riichi: 0, ippatsu: false, furitenTemp: false, furitenRiichi: false, kuikae: [] }));
  // 親から 順に 13枚ずつ
  for (let i = 0; i < 4; i++) {
    const seat = (cfg.dealer + i) % 4;
    players[seat].hand = sortHand(wall.splice(0, 13));
  }
  const s: RoundState = {
    cfg,
    rules: { ...DEFAULT_RULES, ...cfg.rules },
    players,
    live: wall,
    dead,
    doraCount: 1,
    pendingDora: 0,
    kans: 0,
    turn: cfg.dealer,
    phase: 'turn',
    drawn: null,
    rinshan: false,
    lastTile: null,
    noCalls: true,
    pendingRiichi: null,
    pendingKakan: null,
    events: [],
    result: null,
  };
  s.events.push({ type: 'dora', indicator: kindOf(dead[4]) });
  drawTile(s, cfg.dealer, false);
  return s;
}

function drawTile(s: RoundState, seat: number, rinshan: boolean): void {
  const t = rinshan ? s.dead[s.kans - 1] : s.live.shift()!;
  // 嶺上牌を とった ぶん、山の 最後を 王牌へ(海底が 1枚 早く なる)
  if (rinshan) s.live.pop();
  s.players[seat].hand.push(t);
  s.drawn = t;
  s.rinshan = rinshan;
  s.turn = seat;
  s.phase = 'turn';
  s.events.push({ type: 'draw', seat, rinshan });
}

/** ツモ・ロンの 点数の 計算に 渡す 状況 */
function winContext(s: RoundState, seat: number, winTile: Tile, tsumo: boolean, extra: Partial<WinContext> = {}): WinContext {
  const p = s.players[seat];
  const hand = tsumo ? [...p.hand] : [...p.hand, winTile];
  const first = s.noCalls && p.discards.length === 0;
  return {
    hand,
    melds: p.melds,
    winTile,
    tsumo,
    seatWind: seatWind(s, seat),
    roundWind: s.cfg.roundWind,
    dealer: seat === s.cfg.dealer,
    riichi: p.riichi === 1,
    doubleRiichi: p.riichi === 2,
    ippatsu: p.ippatsu,
    haitei: tsumo && s.live.length === 0 && !s.rinshan,
    houtei: !tsumo && s.live.length === 0,
    rinshan: tsumo && s.rinshan,
    tenhou: tsumo && first && seat === s.cfg.dealer,
    chiihou: tsumo && first && seat !== s.cfg.dealer,
    doraIndicators: doraIndicators(s),
    uraIndicators: uraIndicators(s),
    useRed: s.rules.useRed,
    ...extra,
  };
}

/** その 席の 待ち(13枚の 時) */
export function waitsOf(s: RoundState, seat: number, hand = s.players[seat].hand): Kind[] {
  return waits(toCounts(hand), s.players[seat].melds.length);
}

/** フリテンか(自分の 捨て牌に 待ちが ある・見のがし) */
export function isFuriten(s: RoundState, seat: number): boolean {
  const p = s.players[seat];
  if (p.furitenTemp || p.furitenRiichi) return true;
  const w = waitsOf(s, seat);
  return p.discards.some((d) => w.includes(kindOf(d.tile)));
}

/** その 牌で ロン できるか(役あり・フリテンでない) */
function canRon(s: RoundState, seat: number, tile: Tile, chankan = false): Score | null {
  const p = s.players[seat];
  const c = toCounts([...p.hand, tile]);
  if (!isAgari(c, p.melds.length)) return null;
  if (isFuriten(s, seat)) return null;
  return scoreHand(winContext(s, seat, tile, false, { chankan }));
}

/** 喰い替えで 捨てられない 牌の 種類 */
function kuikaeKinds(meld: Meld): Kind[] {
  const ck = kindOf(meld.called!);
  if (meld.type === 'pon') return [ck];
  if (meld.type !== 'chi') return [];
  const ks = meld.tiles.map(kindOf).sort((a, b) => a - b);
  const out = [ck];
  // 両端を 鳴いた 時は 反対の 筋も だめ(例: 34 に 2 → 5 も だめ)
  if (ck === ks[0] && numOf(ks[2]) < 9) out.push(ks[2] + 1);
  if (ck === ks[2] && numOf(ks[0]) > 1) out.push(ks[0] - 1);
  return out;
}

export function turnOptions(s: RoundState): TurnOptions {
  const seat = s.turn;
  const p = s.players[seat];
  const o: TurnOptions = { tsumo: false, discards: [], riichi: [], ankan: [], kakan: [], kyuushu: false };
  if (s.phase !== 'turn') return o;
  const counts = toCounts(p.hand);
  if (s.drawn !== null && isAgari(counts, p.melds.length)) o.tsumo = scoreHand(winContext(s, seat, s.drawn, true)) !== null;
  // 打牌
  if (p.riichi) o.discards = s.drawn !== null ? [s.drawn] : [];
  else o.discards = [...new Set(p.hand)].filter((t) => !p.kuikae.includes(kindOf(t)));
  // リーチ(門前・1000点以上・山が 4枚以上)
  const closed = p.melds.every((m) => m.type === 'ankan');
  // (14枚で テンパイ以上の 時だけ 調べる)
  if (!p.riichi && closed && s.drawn !== null && s.cfg.points[seat] >= 1000 && s.live.length >= 4 && shanten(counts, p.melds.length) <= 0) {
    for (const t of new Set(p.hand)) {
      const rest = [...p.hand];
      removeTile(rest, t);
      if (waits(toCounts(rest), p.melds.length).length) o.riichi.push(t);
    }
  }
  // カン(山が あって 4回まで。鳴いた 直後は できない)
  if (s.drawn !== null && s.live.length > 0 && s.kans < 4) {
    for (let k = 0; k < KINDS; k++) {
      if (counts[k] === 4) {
        if (!p.riichi) o.ankan.push(k);
        else if (kindOf(s.drawn) === k) {
          // リーチ後は 待ちが 変わらない 時だけ
          const before = waitsOf(s, seat, p.hand.filter((t) => t !== s.drawn));
          const after = waits(toCounts(p.hand.filter((t) => kindOf(t) !== k)), p.melds.length + 1);
          if (before.length && before.join() === after.join()) o.ankan.push(k);
        }
      }
    }
    if (!p.riichi) for (const m of p.melds) if (m.type === 'pon' && counts[meldKind(m)] >= 1) o.kakan.push(meldKind(m));
  }
  // 九種九牌(最初の ツモ・だれも 鳴いていない)
  if (s.noCalls && p.discards.length === 0 && s.drawn !== null) o.kyuushu = counts.filter((n, k) => n > 0 && isYaochu(k)).length >= 9;
  return o;
}

export function reactOptions(s: RoundState, seat: number): ReactOptions {
  const o: ReactOptions = { ron: false, pon: [], minkan: [], chi: [] };
  if (!s.lastTile || seat === s.lastTile.seat) return o;
  const { tile } = s.lastTile;
  if (s.phase === 'chankan') {
    o.ron = canRon(s, seat, tile, true) !== null;
    return o;
  }
  if (s.phase !== 'react') return o;
  o.ron = canRon(s, seat, tile) !== null;
  const p = s.players[seat];
  // 河底の 牌・リーチ中は 鳴けない
  if (s.live.length === 0 || p.riichi) return o;
  const k = kindOf(tile);
  const same = p.hand.filter((t) => kindOf(t) === k);
  const pairs = new Map<string, Tile[]>();
  for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) pairs.set(`${same[i] === k * 4}|${same[j] === k * 4}`, [same[i], same[j]]);
  // 鳴いた あと 捨てる 牌が ない 時は 鳴けない
  const canDiscardAfter = (used: Tile[], ban: Kind[]) => p.hand.filter((t) => !used.includes(t)).some((t) => !ban.includes(kindOf(t)));
  for (const pr of pairs.values()) if (canDiscardAfter(pr, [k])) o.pon.push(pr);
  if (same.length === 3 && s.kans < 4) o.minkan.push(same);
  // チーは 次の 人だけ
  if (seat === (s.lastTile.seat + 1) % 4 && k < 27) {
    const n = numOf(k);
    const pick = (kk: Kind) => {
      const ts = p.hand.filter((t) => kindOf(t) === kk);
      // 赤と ふつうの 両方 あれば 両方の 鳴き方
      return [...new Set(ts.map((t) => (t === kk * 4 ? t : ts.find((x) => x !== kk * 4)!)))];
    };
    const combos: [number, number][] = [];
    if (n >= 3) combos.push([-2, -1]);
    if (n >= 2 && n <= 8) combos.push([-1, 1]);
    if (n <= 7) combos.push([1, 2]);
    for (const [a, b] of combos) {
      for (const ta of pick(k + a)) for (const tb of pick(k + b)) {
        const meld: Meld = { type: 'chi', tiles: [ta, tb, tile].sort((x, y) => x - y), called: tile };
        if (canDiscardAfter([ta, tb], kuikaeKinds(meld))) o.chi.push([ta, tb]);
      }
    }
  }
  return o;
}

/** どこかで 鳴きが 入った → 一発・最初の 巡目は おわり */
function breakFirst(s: RoundState): void {
  s.noCalls = false;
  for (const p of s.players) p.ippatsu = false;
}

function revealDora(s: RoundState, n: number): void {
  for (let i = 0; i < n && s.doraCount < 5; i++) {
    s.doraCount++;
    s.events.push({ type: 'dora', indicator: kindOf(s.dead[4 + s.doraCount - 1]) });
  }
}

/** ツモ アガリ */
export function doTsumo(s: RoundState): RoundResult {
  const seat = s.turn;
  const score = scoreHand(winContext(s, seat, s.drawn!, true));
  if (!score) throw new Error('tsumo not allowed');
  const paid = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) if (i !== seat) paid[i] = i === s.cfg.dealer || seat === s.cfg.dealer ? score.tsumoDealer : score.tsumoChild;
  return endWith(s, { kind: 'win', wins: [{ seat, from: null, score, paid }], delta: [] });
}

/** 打牌(riichi: リーチを 宣言して 捨てる) */
export function doDiscard(s: RoundState, tile: Tile, riichi = false): void {
  const seat = s.turn;
  const p = s.players[seat];
  if (s.phase !== 'turn' || !p.hand.includes(tile)) throw new Error('discard not allowed');
  if (riichi ? !turnOptions(s).riichi.includes(tile) : p.riichi ? tile !== s.drawn : p.kuikae.includes(kindOf(tile))) throw new Error('discard not allowed');
  removeTile(p.hand, tile);
  sortHand(p.hand);
  if (p.riichi) p.ippatsu = false;
  if (riichi) {
    p.riichi = s.noCalls && p.discards.length === 0 ? 2 : 1;
    p.ippatsu = true;
    s.pendingRiichi = seat;
  }
  p.discards.push({ tile, riichi, called: false, tsumogiri: tile === s.drawn });
  p.furitenTemp = false;
  p.kuikae = [];
  s.drawn = null;
  s.rinshan = false;
  // 明槓・加槓の ドラは 打牌で めくる
  if (s.pendingDora) {
    revealDora(s, s.pendingDora);
    s.pendingDora = 0;
  }
  s.lastTile = { seat, tile };
  s.phase = 'react';
  s.events.push({ type: 'discard', seat, tile, riichi });
}

/** 暗槓・加槓 */
export function doKan(s: RoundState, kind: Kind): void {
  const seat = s.turn;
  const p = s.players[seat];
  const o = turnOptions(s);
  if (o.ankan.includes(kind)) {
    const tiles = p.hand.filter((t) => kindOf(t) === kind);
    tiles.forEach((t) => removeTile(p.hand, t));
    const meld: Meld = { type: 'ankan', tiles };
    p.melds.push(meld);
    breakFirst(s);
    s.kans++;
    // 前の カンの ドラが まだなら 先に めくる。暗槓の ドラは すぐ
    revealDora(s, s.pendingDora + 1);
    s.pendingDora = 0;
    s.events.push({ type: 'call', seat, meld });
    drawTile(s, seat, true);
    return;
  }
  if (o.kakan.includes(kind)) {
    const tile = p.hand.find((t) => kindOf(t) === kind)!;
    const mi = p.melds.findIndex((m) => m.type === 'pon' && meldKind(m) === kind);
    // 槍槓を 待つ
    s.pendingKakan = { seat, meldIndex: mi, tile };
    s.lastTile = { seat, tile };
    s.phase = 'chankan';
    if ([0, 1, 2, 3].every((i) => !reactOptions(s, i).ron)) finishKakan(s);
    return;
  }
  throw new Error('kan not allowed');
}

function finishKakan(s: RoundState): void {
  const k = s.pendingKakan!;
  const p = s.players[k.seat];
  removeTile(p.hand, k.tile);
  const m = p.melds[k.meldIndex];
  p.melds[k.meldIndex] = { ...m, type: 'kakan', tiles: [...m.tiles, k.tile] };
  s.pendingKakan = null;
  breakFirst(s);
  s.kans++;
  revealDora(s, s.pendingDora);
  s.pendingDora = 1;
  s.events.push({ type: 'call', seat: k.seat, meld: p.melds[k.meldIndex] });
  drawTile(s, k.seat, true);
}

/** 九種九牌で 流す */
export function doKyuushu(s: RoundState): RoundResult {
  if (!turnOptions(s).kyuushu) throw new Error('kyuushu not allowed');
  return endWith(s, { kind: 'draw', reason: 'kyuushu', tenpai: [false, false, false, false], delta: [0, 0, 0, 0] });
}

/**
 * 捨て牌(槍槓の 時は 加槓の 牌)に 対する 4人の 返事を まとめて 決める。
 * ロン > ポン・カン > チー。ロンを 見のがした 人は フリテン
 */
export function resolveReactions(s: RoundState, choices: Reaction[]): RoundResult | null {
  const last = s.lastTile!;
  const opts = [0, 1, 2, 3].map((i) => reactOptions(s, i));
  // 見のがし
  for (let i = 0; i < 4; i++)
    if (opts[i].ron && choices[i]?.type !== 'ron') {
      s.players[i].furitenTemp = true;
      if (s.players[i].riichi) s.players[i].furitenRiichi = true;
    }
  // ロン(上家から 順)
  const order = [1, 2, 3].map((d) => (last.seat + d) % 4);
  const rons = order.filter((i) => choices[i]?.type === 'ron' && opts[i].ron);
  if (rons.length) {
    const winners = s.rules.multiRon ? rons : rons.slice(0, 1);
    const chankan = s.phase === 'chankan';
    const wins: WinResult[] = winners.map((seat) => {
      const score = canRon(s, seat, last.tile, chankan)!;
      const paid = [0, 0, 0, 0];
      paid[last.seat] = score.ron;
      return { seat, from: last.seat, score, paid };
    });
    return endWith(s, { kind: 'win', wins, delta: [] });
  }
  if (s.phase === 'chankan') {
    finishKakan(s);
    return null;
  }
  // リーチ 成立(ロンされなかった)
  if (s.pendingRiichi !== null) {
    s.cfg.points[s.pendingRiichi] -= 1000;
    s.cfg.sticks++;
    s.pendingRiichi = null;
  }
  // 鳴き
  const callOrder = order.filter((i) => choices[i] && choices[i]!.type !== 'ron');
  const kan = callOrder.find((i) => choices[i]!.type === 'minkan' || choices[i]!.type === 'pon');
  const chi = callOrder.find((i) => choices[i]!.type === 'chi');
  const who = kan ?? chi;
  if (who !== undefined) {
    const c = choices[who] as { type: 'pon' | 'minkan' | 'chi'; tiles: Tile[] };
    const ok = (c.type === 'pon' ? opts[who].pon : c.type === 'minkan' ? opts[who].minkan : opts[who].chi).some((x) => x.join() === c.tiles.join());
    if (!ok) throw new Error('call not allowed');
    const p = s.players[who];
    c.tiles.forEach((t) => removeTile(p.hand, t));
    const meld: Meld = { type: c.type, tiles: [...c.tiles, last.tile].sort((a, b) => a - b), called: last.tile, from: last.seat };
    p.melds.push(meld);
    s.players[last.seat].discards[s.players[last.seat].discards.length - 1].called = true;
    breakFirst(s);
    s.events.push({ type: 'call', seat: who, meld });
    s.lastTile = null;
    if (c.type === 'minkan') {
      s.kans++;
      revealDora(s, s.pendingDora);
      s.pendingDora = 1;
      drawTile(s, who, true);
    } else {
      p.kuikae = kuikaeKinds(meld);
      s.turn = who;
      s.drawn = null;
      s.phase = 'turn';
    }
    return null;
  }
  // だれも 何もしない → 次の 人が ツモ(山が なければ 流局)
  s.lastTile = null;
  if (s.live.length === 0) return exhaustiveDraw(s);
  drawTile(s, (last.seat + 1) % 4, false);
  return null;
}

/** 荒牌流局(テンパイの 人に 3000点を 分ける) */
function exhaustiveDraw(s: RoundState): RoundResult {
  const tenpai = s.players.map((_, i) => waitsOf(s, i).length > 0);
  const delta = [0, 0, 0, 0];
  // 流し満貫(企画者 2026-11-08 アリ): 捨て牌が 全部 么九牌で 1枚も 鳴かれていない → 満貫ツモと 同じ 点。
  // その 時は ノーテン罰符は なし・本場は 付けない【仮：ふつうの 決まり】
  const nagashi = s.players
    .map((p, seat) => ({ p, seat }))
    .filter(({ p }) => p.discards.length > 0 && p.discards.every((d) => isYaochu(kindOf(d.tile)) && !d.called))
    .map(({ seat }) => {
      const paid = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) if (i !== seat) paid[i] = i === s.cfg.dealer || seat === s.cfg.dealer ? 4000 : 2000;
      return { seat, paid };
    });
  if (nagashi.length) {
    for (const n of nagashi)
      for (let i = 0; i < 4; i++) {
        delta[i] -= n.paid[i];
        delta[n.seat] += n.paid[i];
      }
    return endWith(s, { kind: 'draw', reason: 'exhaust', tenpai, delta, nagashi });
  }
  const n = tenpai.filter(Boolean).length;
  if (n > 0 && n < 4) for (let i = 0; i < 4; i++) delta[i] = tenpai[i] ? 3000 / n : -3000 / (4 - n);
  return endWith(s, { kind: 'draw', reason: 'exhaust', tenpai, delta });
}

/** 局を おえる。アガリの 時は 点の 動き(本場・供託ふくむ)を 出す */
function endWith(s: RoundState, r: RoundResult): RoundResult {
  if (r.kind === 'win') {
    const delta = [0, 0, 0, 0];
    const h = s.cfg.honba;
    r.wins.forEach((w, i) => {
      for (let j = 0; j < 4; j++) {
        if (!w.paid[j]) continue;
        // 本場は ロン 300・ツモ 1人 100(ダブロンは 上家の アガリだけ)
        const bonus = i === 0 ? (w.from === null ? 100 * h : 300 * h) : 0;
        delta[j] -= w.paid[j] + bonus;
        delta[w.seat] += w.paid[j] + bonus;
      }
    });
    // 供託は 上家(いちばん 先)の アガリへ。まだ 成立していない リーチは 数えない
    delta[r.wins[0].seat] += s.cfg.sticks * 1000;
    r.delta = delta;
  }
  s.result = r;
  s.phase = 'end';
  s.events.push({ type: 'end', result: r });
  return r;
}

/** 牌の 見えている 枚数(CPU 用: 捨て牌・鳴き・ドラ表示・自分の 手) */
export function visibleCounts(s: RoundState, seat: number): number[] {
  const c = new Array<number>(KINDS).fill(0);
  for (const t of s.players[seat].hand) c[kindOf(t)]++;
  for (const p of s.players) {
    for (const d of p.discards) if (!d.called) c[kindOf(d.tile)]++;
    for (const m of p.melds) for (const t of m.tiles) c[kindOf(t)]++;
  }
  for (const k of doraIndicators(s)) c[k]++;
  return c;
}

export { isKan };
