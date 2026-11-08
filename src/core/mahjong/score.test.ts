import { describe, expect, it } from 'vitest';
import { isAgari, shanten, waits } from './hand';
import { scoreHand, type Meld, type WinContext } from './score';
import { doraOf, EAST, kindName, parseKinds, parseTiles, SOUTH, toCounts, kindOf } from './tiles';

const counts = (s: string) => toCounts(parseTiles(s));
/** 手牌の 文字(アガリ牌を ふくむ)と アガリ牌から */
function ctx(hand: string, win: string, o: Partial<WinContext> = {}): WinContext {
  const tiles = parseTiles(hand);
  const wk = parseKinds(win)[0];
  const winTile = o.useRed !== false && win === '0m' ? 16 : tiles.find((t) => kindOf(t) === wk)!;
  return { hand: tiles, melds: [], winTile, tsumo: false, seatWind: SOUTH, roundWind: EAST, dealer: false, doraIndicators: [], useRed: true, ...o };
}
const names = (s: ReturnType<typeof scoreHand>) => s?.yaku.map((y) => y.name).sort();

describe('牌', () => {
  it('ドラ表示牌の 次が ドラ', () => {
    expect(kindName(doraOf(parseKinds('9m')[0]))).toBe('1萬');
    expect(kindName(doraOf(parseKinds('4z')[0]))).toBe('東');
    expect(kindName(doraOf(parseKinds('7z')[0]))).toBe('白');
  });
});

describe('手の 形', () => {
  it('アガリ・テンパイ・シャンテン', () => {
    expect(isAgari(counts('123m456p789s11122z'))).toBe(true);
    expect(shanten(counts('123m456p789s1112z'))).toBe(0);
    expect(shanten(counts('123m456p789s1357z'))).toBe(2);
    expect(shanten(counts('1199m1199p1199s1z'))).toBe(0); // 七対子テンパイ
    expect(shanten(counts('19m19p19s1234567z'))).toBe(0); // 国士13面
  });
  it('九蓮宝燈の 形は 9面待ち', () => {
    expect(waits(counts('1112345678999m')).map(kindName)).toEqual(['1萬', '2萬', '3萬', '4萬', '5萬', '6萬', '7萬', '8萬', '9萬']);
  });
  it('4枚 使っている 牌は 待ちに ならない', () => {
    expect(waits(counts('1111m234p567s789s')).map(kindName)).toEqual([]);
  });
});

describe('点数', () => {
  it('平和・断么九 ロン(子) 2翻30符 2000', () => {
    const s = scoreHand(ctx('234m456m567p345s88s', '4m'));
    expect(names(s)).toEqual(['平和', '断么九'].sort());
    expect([s!.han, s!.fu, s!.ron]).toEqual([2, 30, 2000]);
  });
  it('立直・平和・断么九・ツモ(子) 4翻20符 1300・2600', () => {
    const s = scoreHand(ctx('234m456m567p345s88s', '4m', { tsumo: true, riichi: true }));
    expect([s!.han, s!.fu, s!.tsumoChild, s!.tsumoDealer]).toEqual([4, 20, 1300, 2600]);
  });
  it('七対子・断么九 ロン(子) 3翻25符 3200', () => {
    const s = scoreHand(ctx('2288m3377p445566s', '5s'));
    expect(names(s)).toEqual(['七対子', '断么九'].sort());
    expect([s!.han, s!.fu, s!.ron]).toEqual([3, 25, 3200]);
  });
  it('場風の 暗刻・嵌張 ロン 1翻40符 1300', () => {
    const s = scoreHand(ctx('123m456p789s99s111z', '2m'));
    expect(names(s)).toEqual(['場風 東']);
    expect([s!.han, s!.fu, s!.ron]).toEqual([1, 40, 1300]);
  });
  it('役が ないと アガれない(ドラだけ)', () => {
    const chi: Meld = { type: 'chi', tiles: parseTiles('123p'), called: parseTiles('1p')[0], from: 3 };
    const s = scoreHand({ ...ctx('234m456m345s99s', '4m', { doraIndicators: [parseKinds('1m')[0]] }), melds: [chi] });
    expect(s).toBeNull();
  });
  it('喰いタン(鳴いた 断么九)1翻30符 1000', () => {
    const chi: Meld = { type: 'chi', tiles: parseTiles('234p'), called: parseTiles('2p')[0], from: 3 };
    const s = scoreHand({ ...ctx('234m456m345s88s', '4m'), melds: [chi] });
    expect(names(s)).toEqual(['断么九']);
    expect(s!.ron).toBe(1000);
  });
  it('赤ドラ・ドラも 数える', () => {
    const s = scoreHand(ctx('234m406m567p345s88s', '4m', { doraIndicators: [parseKinds('7s')[0]] }));
    // 平和・断么九・赤1・ドラ2(8索×2) = 5翻 満貫
    expect(s!.dora).toBe(3);
    expect([s!.limit, s!.ron]).toEqual(['満貫', 8000]);
  });
  it('親の 満貫ツモは 4000オール', () => {
    // 立直・ツモ・平和・断么九・ドラ1(2萬)
    const s = scoreHand(ctx('234m456m567p345s88s', '4m', { tsumo: true, riichi: true, dealer: true, seatWind: EAST, doraIndicators: [parseKinds('1m')[0]] }));
    expect([s!.limit, s!.tsumoChild, s!.tsumoDealer]).toEqual(['満貫', 4000, 4000]);
  });
  it('四暗刻単騎は ダブル役満', () => {
    const s = scoreHand(ctx('111222333m444p77z', '7z', { tsumo: true, dealer: true, seatWind: EAST }));
    expect(s!.limit).toBe('ダブル役満');
  });
  it('混一色・一気通貫・役牌 白 で 跳満(子 ロン 12000)', () => {
    const s = scoreHand(ctx('123m456m789m555z77z', '7z'));
    expect(names(s)).toEqual(['一気通貫', '役牌 白', '混一色'].sort());
    expect([s!.limit, s!.ron]).toEqual(['跳満', 12000]);
  });
  it('4翻30符は 7700(切り上げ満貫なし)', () => {
    // 立直・一発・平和・断么九
    const s = scoreHand(ctx('234m456m567p345s88s', '4m', { riichi: true, ippatsu: true }));
    expect([s!.han, s!.fu, s!.ron]).toEqual([4, 30, 7700]);
  });
  it('国士無双十三面待ちは ダブル役満(親ロン 96000)', () => {
    const s = scoreHand(ctx('19m19p19s12345677z', '7z', { dealer: true, seatWind: EAST }));
    expect([s!.limit, s!.ron]).toEqual(['ダブル役満', 96000]);
  });
  it('ふつうの 国士は 役満 32000', () => {
    const s = scoreHand(ctx('19m19p19s12345677z', '1z'));
    expect([s!.limit, s!.ron]).toEqual(['役満', 32000]);
  });
  it('純正九蓮宝燈は ダブル役満', () => {
    const s = scoreHand(ctx('11123455678999m', '5m'));
    expect(names(s)).toEqual(['純正九蓮宝燈']);
  });
  it('数え役満(13翻以上)', () => {
    // 立直・一発・ツモ・清一色・一気通貫・ドラ3 ≥ 13
    const s = scoreHand(ctx('123456789m11122m', '2m', { tsumo: true, riichi: true, ippatsu: true, doraIndicators: [parseKinds('9m')[0]] }));
    expect(s!.limit).toBe('数え役満');
  });
  it('シャンポンの ロンは 明刻(三暗刻に ならない)', () => {
    const s = scoreHand(ctx('111m333p555s777z22s', '7z'));
    // 111m・333p・555s 暗刻 + 77z を ロン → 明刻。三暗刻 + 役牌中 + 対々和
    expect(names(s)).toEqual(['三暗刻', '対々和', '役牌 中'].sort());
  });
});

describe('役を ひとつずつ', () => {
  const pon = (s: string, from = 1): Meld => ({ type: 'pon', tiles: parseTiles(s), called: parseTiles(s)[0], from });
  const chi = (s: string): Meld => ({ type: 'chi', tiles: parseTiles(s), called: parseTiles(s)[0], from: 3 });
  const kan = (s: string, type: Meld['type'] = 'ankan'): Meld => ({ type, tiles: parseTiles(s), called: type === 'ankan' ? undefined : parseTiles(s)[0], from: type === 'ankan' ? undefined : 1 });
  const has = (s: ReturnType<typeof scoreHand>, name: string) => expect(names(s)).toContain(name);
  const cases: [string, () => ReturnType<typeof scoreHand>, string][] = [
    ['一気通貫', () => scoreHand(ctx('123456789m234p55s', '5s', { riichi: true })), '一気通貫'],
    ['三色同順', () => scoreHand(ctx('123m123p123s456s99m', '9m', { riichi: true })), '三色同順'],
    ['混全帯么九', () => scoreHand(ctx('123m789p123s111z99s', '9s', { riichi: true })), '混全帯么九'],
    ['純全帯么九', () => scoreHand(ctx('123m789p123s999s11m', '1m', { riichi: true })), '純全帯么九'],
    ['二盃口', () => scoreHand(ctx('112233m556677p99s', '9s')), '二盃口'],
    ['対々和', () => scoreHand({ ...ctx('222m333p44s', '4s'), melds: [pon('555s'), pon('777p')] }), '対々和'],
    ['三色同刻', () => scoreHand(ctx('222m222p222s345s99m', '9m', { tsumo: true })), '三色同刻'],
    ['三槓子', () => scoreHand({ ...ctx('234m55s', '5s'), melds: [kan('2222p'), kan('3333s'), kan('7777m', 'minkan')] }), '三槓子'],
    ['小三元', () => scoreHand(ctx('555z666z77z234m456p', '4p')), '小三元'],
    ['混老頭', () => scoreHand(ctx('111m999p111s222z99s', '1m')), '混老頭'],
    ['清一色', () => scoreHand(ctx('123345567789p22p', '2p')), '清一色'],
    ['大三元', () => scoreHand(ctx('555z666z777z234m99p', '9p')), '大三元'],
    ['小四喜', () => scoreHand(ctx('111z222z333z44z234m', '4m')), '小四喜'],
    ['大四喜', () => scoreHand(ctx('111z222z333z444z55m', '5m')), '大四喜'],
    ['字一色', () => scoreHand(ctx('111z222z333z555z77z', '7z')), '字一色'],
    ['緑一色', () => scoreHand(ctx('223344s666s888s66z', '6z')), '緑一色'],
    ['清老頭', () => scoreHand(ctx('111m999m111p999p11s', '1s')), '清老頭'],
    ['四槓子', () => scoreHand({ ...ctx('55s', '5s'), melds: [kan('2222p'), kan('3333s'), kan('7777m', 'minkan'), kan('1111z')] }), '四槓子'],
    ['海底摸月', () => scoreHand(ctx('234m456m567p345s88s', '4m', { tsumo: true, haitei: true })), '海底摸月'],
    ['河底撈魚', () => scoreHand(ctx('234m456m567p345s88s', '4m', { houtei: true })), '河底撈魚'],
    ['嶺上開花', () => scoreHand({ ...ctx('234m567p345s88s', '4m', { tsumo: true, rinshan: true }), melds: [kan('2222p')] }), '嶺上開花'],
    ['槍槓', () => scoreHand(ctx('234m456m567p345s88s', '4m', { chankan: true })), '槍槓'],
    ['天和', () => scoreHand(ctx('234m456m567p345s88s', '4m', { tsumo: true, tenhou: true, dealer: true })), '天和'],
    ['ダブル立直', () => scoreHand(ctx('234m456m567p345s88s', '4m', { doubleRiichi: true })), 'ダブル立直'],
    ['自風 南', () => scoreHand(ctx('222z234m456p789s11m', '1m')), '自風 南'],
    ['役牌 發(鳴き)', () => scoreHand({ ...ctx('234m456p789s11m', '1m'), melds: [pon('666z')] }), '役牌 發'],
  ];
  for (const [label, f, name] of cases) it(label, () => has(f(), name));
  it('鳴いた 一気通貫は 1翻・混一色は 2翻', () => {
    const s = scoreHand({ ...ctx('456789m111z99m', '9m'), melds: [chi('123m')] });
    expect(s!.yaku.find((y) => y.name === '一気通貫')!.han).toBe(1);
    expect(s!.yaku.find((y) => y.name === '混一色')!.han).toBe(2);
  });
  it('平和は 両面待ちとして 取れる 時だけ(嵌張と 両方 取れれば 高いほう)', () => {
    // 345m に 4m で アガリ(34+5 の 嵌張 でも 3+45 でも ない: 35 の 嵌張)は 平和なし
    const s = scoreHand(ctx('345m456p789s234s88p', '4m', { riichi: true }));
    expect(names(s)).not.toContain('平和');
    // 2345m に 2m: 345 + 2? → 234 + 5 単騎 / 2 + 345 → 両面(1-4 では ない)… ここは 23 + 45 の 両面と みなせる 形
    const t = scoreHand(ctx('234567m456p789s88p', '7m'));
    expect(names(t)).toContain('平和');
  });
});
