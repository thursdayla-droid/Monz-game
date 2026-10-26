import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/core/mythclash/abilities';
import { CARDS, card, cardPower, sortCardIds } from '../src/core/mythclash/cards';
import { activeCard, createBattle, legalActions, replaceDowned, resolveRound, validDeck, type BattleAction, type BattleEvent, type BattleState } from '../src/core/mythclash/engine';
import { magicEffectOf } from '../src/core/mythclash/magic';
import { baseDamage, DEFAULT_RULES, elementMultiplier, type BattleRules } from '../src/core/mythclash/rules';
import { eventsFor, viewFor } from '../src/core/mythclash/view';
import { describeAbility, describeMagicEffect } from '../src/core/mythclash/describe';

const N: BattleAction = { type: 'attack', kind: 'normal' };
const SP: BattleAction = { type: 'attack', kind: 'special' };
const MG: BattleAction = { type: 'attack', kind: 'magic' };
const G: BattleAction = { type: 'defend', kind: 'guard' };
const C: BattleAction = { type: 'defend', kind: 'counter' };
const MD: BattleAction = { type: 'defend', kind: 'magicGuard' };
const SW = (to: number): BattleAction => ({ type: 'switch', to });
/** 乱数なし(±0%)にして、ダメージを式どおりに確かめる */
const FLAT: BattleRules = { ...DEFAULT_RULES, randomSpread: 0 };

/** a の1枚目が攻撃側で始まる試合 */
function battle(a: number[], b: number[], rules: BattleRules = FLAT, seed = 1): BattleState {
  const { state } = createBattle(a, b, seed, rules);
  state.attacker = 0;
  return state;
}
/** 今のフェイズ(前半・後半)の攻撃側に atk、防御側に def を選ばせる */
const ph = (s: BattleState, atk: BattleAction, def: BattleAction) => resolveRound(s, s.attacker === 0 ? [atk, def] : [def, atk]);
/** 自分(0)の攻撃フェイズまで進める(相手は通常攻撃・自分は防御) */
const untilMine = (s: BattleState) => {
  while (s.winner === null && s.attacker !== 0) ph(s, N, G);
};
/** 攻撃で受けたHPダメージ(毒・火傷は数えない) */
const dmgTo = (ev: BattleEvent[], side: 0 | 1) => ev.filter((e) => e.type === 'damage' && e.side === side && e.source !== 'dot').reduce((s, e) => s + (e.type === 'damage' ? e.amount : 0), 0);
const expected = (attId: number, tgtId: number, kind: 'normal' | 'special' | 'magic', mult = 1) => {
  const a = card(attId)!;
  const t = card(tgtId)!;
  const el = elementMultiplier(kind === 'magic' ? a.magic.element : a.element, t.element);
  return Math.max(1, Math.ceil(baseDamage(kind, { atk: a.atk, mag: a.mag, magicModifier: a.magic.modifier }, { def: t.def, mag: t.mag }) * el * mult - 1e-9));
};
// 特性も魔法の効果もない、属性が「無」のカード
const PLAIN_A = [12, 60, 61];
const PLAIN_B = [60, 61, 12];

describe('MYTHCLASH cards (from the planner\'s table, unchanged)', () => {
  it('has 100 cards No.001-100 with the confirmed rarity counts and SEC', () => {
    expect(CARDS.map((c) => c.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    const count = (r: string) => CARDS.filter((c) => c.rarity === r).length;
    expect([count('N'), count('R'), count('SR'), count('UR'), count('SEC')]).toEqual([40, 30, 18, 9, 3]);
    expect(CARDS.filter((c) => c.rarity === 'SEC').map((c) => [c.id, c.name, c.element])).toEqual([
      [26, '天空神ゼウス', '雷'],
      [56, '血の女王', '闇'],
      [100, '黒潮の略奪王', '水'],
    ]);
    // 企画者決定 2026-10-26: 血の女王はダーク童話(ダーク童話26・世界神話30)・HPは表の値
    expect([card(56)!.theme, card(100)!.maxHp, card(1)!.maxHp]).toEqual(['ダーク童話', 180, 145]);
    const theme = (t: string) => CARDS.filter((c) => c.theme === t).length;
    expect([theme('ダーク童話'), theme('世界神話')]).toEqual([26, 30]);
  });

  it('has 28 abilities (N5/R6/SR10/UR5/SEC2), all with a definition; magic codes all map', () => {
    const withAb = CARDS.filter((c) => c.abilityCode);
    const by = (r: string) => withAb.filter((c) => c.rarity === r).length;
    expect([withAb.length, by('N'), by('R'), by('SR'), by('UR'), by('SEC')]).toEqual([28, 5, 6, 10, 5, 2]);
    for (const c of withAb) expect(ABILITIES[c.abilityCode!]).toBeDefined();
    for (const c of CARDS) expect(() => magicEffectOf(c.magic.effectCode)).not.toThrow();
    // 毒・火傷の古い数字(4・5・8)は使わない
    expect(magicEffectOf('poison8')).toEqual(magicEffectOf('poison4'));
    expect(magicEffectOf('burn8').effect).toEqual({ kind: 'burn' });
    // No.003: 特性なし(毒は魔法「深海の劇毒」で付く)。「+2」強化は廃止
    expect(ABILITIES.poison_plus2).toMatchObject({ name: null, def: { kind: 'none' } });
    expect(card(3)!.magic).toMatchObject({ name: '深海の劇毒', effectCode: 'poison8' });
    expect(magicEffectOf('poison8').effect).toEqual({ kind: 'poison' });
  });
});

describe('MYTHCLASH battle rules', () => {
  it('cards can be sorted by power (strong / weak) and by number', () => {
    const ids = [26, 1, 60, 100, 12];
    const strong = sortCardIds(ids, 'strong');
    for (let i = 1; i < strong.length; i++) expect(cardPower(card(strong[i - 1])!)).toBeGreaterThanOrEqual(cardPower(card(strong[i])!));
    expect(sortCardIds(ids, 'weak')).toEqual([...strong].reverse().sort((a, b) => cardPower(card(a)!) - cardPower(card(b)!) || a - b));
    expect(sortCardIds(ids, 'no')).toEqual([1, 12, 26, 60, 100]);
  });

  it('magic effects and abilities have readable descriptions', () => {
    expect(describeMagicEffect(card(14)!)).toContain('睡眠');
    expect(describeMagicEffect(card(3)!)).toContain('毒');
    for (const c of CARDS) expect(describeMagicEffect(c).length).toBeGreaterThan(0);
    for (const ab of Object.values(ABILITIES)) if (ab.def.kind !== 'none') expect(describeAbility(ab).length).toBeGreaterThan(0);
    expect(describeAbility(ABILITIES.first_normal20)).toBe('試合で最初の通常攻撃のダメージ +20%');
  });

  it('after a knockout, the player can choose the next card later (pending), the CPU picks right away', () => {
    const s = battle(PLAIN_A, PLAIN_B);
    s.teams[1].cards[0].hp = 1;
    // 自分(0)が攻撃して相手(1)を倒す。相手の代わりは「あとで選ぶ」
    const ev = resolveRound(s, [N, G], (side) => (side === 1 ? null : undefined));
    expect(ev.some((e) => e.type === 'down')).toBe(true);
    expect(s.pending).toEqual([1]);
    expect(s.teams[1].cards[0].down).toBe(true);
    // 2枚目ではなく3枚目を選ぶ
    const ev2 = replaceDowned(s, 1, 2);
    expect(s.teams[1].active).toBe(2);
    expect(ev2[0]).toEqual({ type: 'enter', side: 1, id: PLAIN_B[2] });
    expect(s.pending).toEqual([]);
    expect(legalActions(s, 1).length).toBeGreaterThan(0);
    // 選ばずに次のターンへ進めたときは、控えの若い番号にする
    const t = battle(PLAIN_A, PLAIN_B);
    t.teams[1].cards[0].hp = 1;
    resolveRound(t, [N, G], () => null);
    resolveRound(t, [G, N]);
    expect([t.teams[1].active, t.pending]).toEqual([1, []]);
  });

  it('deck must be 3 different cards; faster card attacks first', () => {
    expect(validDeck([1, 1, 2])).toBe(false);
    expect(validDeck([1, 2, 3])).toBe(true);
    expect(() => createBattle([1, 1, 2], [3, 4, 5], 1)).toThrow();
    // 001(素早さ8) と 060(素早さ1)
    expect(createBattle([60, 61, 12], [1, 2, 4], 1).state.attacker).toBe(1);
  });

  it('guard halves normal attacks but not specials; counter reflects specials only', () => {
    let s = battle(PLAIN_A, PLAIN_B);
    let ev = resolveRound(s, [N, G]);
    expect(dmgTo(ev, 1)).toBe(expected(12, 60, 'normal', 0.5));
    s = battle(PLAIN_A, PLAIN_B);
    ev = resolveRound(s, [SP, G]);
    expect(dmgTo(ev, 1)).toBe(expected(12, 60, 'special'));
    // カウンター成功: 必殺のダメージを攻撃した側が受ける(相手は0)
    s = battle(PLAIN_A, PLAIN_B);
    ev = resolveRound(s, [SP, C]);
    expect(dmgTo(ev, 1)).toBe(0);
    expect(dmgTo(ev, 0)).toBe(expected(12, 12, 'special'));
    // 通常攻撃にカウンター: 失敗して、そのままくらう
    s = battle(PLAIN_A, PLAIN_B);
    ev = resolveRound(s, [N, C]);
    expect(ev.some((e) => e.type === 'counter' && !e.success)).toBe(true);
    expect(dmgTo(ev, 1)).toBe(expected(12, 60, 'normal'));
  });

  it('magic guard halves magic and fully cancels its added effect', () => {
    const always = { ...FLAT, strongChance: 1 };
    // 014 眠り茨の姫(睡眠の魔法)
    let s = battle([14, 60, 61], PLAIN_B, always);
    resolveRound(s, [MG, MD]);
    expect(activeCard(s, 1).skip).toBeNull();
    s = battle([14, 60, 61], PLAIN_B, always);
    resolveRound(s, [MG, G]);
    expect(activeCard(s, 1).skip).toBe('sleep');
  });

  it('a special locks that card from special on its next attack turn, kept through switching', () => {
    const canSpecial = (s: BattleState) => legalActions(s, 0).some((a) => a.type === 'attack' && a.kind === 'special');
    // 012(素早さ2) と 060(素早さ1): 自分(0)が前半の攻撃側
    const s = battle(PLAIN_A, PLAIN_B);
    ph(s, SP, G);
    ph(s, N, G);
    expect([s.round, s.half, s.attacker]).toEqual([2, 1, 0]);
    expect(canSpecial(s)).toBe(false);
    // ターンの最初に交代 → 交代した自分は、このターン攻撃なし(前半は交代だけ、後半は相手の攻撃)
    resolveRound(s, [SW(1), G]);
    expect([s.half, s.attacker]).toEqual([2, 1]);
    ph(s, N, G);
    // 次のターンの最初に、もどす。ロックは残っている
    // 行動は いつも [自分, 相手] の順
    resolveRound(s, [SW(0), s.attacker === 1 ? N : G]);
    expect(s.teams[0].active).toBe(0);
    expect(s.teams[0].cards[0].specialLock).toBe(true);
    untilMine(s);
    expect(canSpecial(s)).toBe(false);
    // 必殺を使わずに自分の攻撃フェイズが終わったら、外れる
    ph(s, N, G);
    untilMine(s);
    expect(canSpecial(s)).toBe(true);
  });

  it('a turn has two halves: the faster card attacks first, then the other; switching only at the start of a turn', () => {
    // 001(素早さ8) と 060(素早さ1)
    const s = battle([1, 60, 61], PLAIN_B);
    expect([s.round, s.half, s.attacker]).toEqual([1, 1, 0]);
    expect(legalActions(s, 0).some((a) => a.type === 'switch')).toBe(true);
    ph(s, N, G);
    expect([s.round, s.half, s.attacker]).toEqual([1, 2, 1]);
    // 後半は交代できない
    expect(legalActions(s, 0).some((a) => a.type === 'switch')).toBe(false);
    expect(legalActions(s, 1).some((a) => a.type === 'switch')).toBe(false);
    ph(s, N, G);
    expect([s.round, s.half, s.attacker]).toEqual([2, 1, 0]);
    // 相手のカードが素早くなると、相手が前半の攻撃側
    const t = battle([60, 61, 12], [1, 61, 12]);
    t.attacker = 1;
    ph(t, N, G);
    ph(t, N, G);
    expect([t.round, t.half, t.attacker]).toEqual([2, 1, 1]);
  });

  it('the side that switched has no attack phase that turn; a knockout in the first half ends the turn', () => {
    // 後半の攻撃側(相手)が最初に交代 → 前半だけでターンが終わる
    let s = battle(PLAIN_A, PLAIN_B);
    const ev = resolveRound(s, [N, SW(1)]);
    expect(ev.some((e) => e.type === 'attack')).toBe(true);
    expect([s.round, s.half]).toEqual([2, 1]);
    // 前半で倒れたら、後半はなし
    s = battle(PLAIN_A, PLAIN_B);
    s.teams[1].cards[0].hp = 1;
    resolveRound(s, [N, G]);
    expect([s.round, s.half, s.teams[1].active]).toEqual([2, 1, 1]);
    // 両方が交代 → 攻撃なしでターンが終わる
    s = battle(PLAIN_A, PLAIN_B);
    const ev2 = resolveRound(s, [SW(1), SW(1)]);
    expect(ev2.some((e) => e.type === 'attack')).toBe(false);
    expect([s.round, s.half]).toEqual([2, 1]);
  });

  it('poison and burn hit once at the end of the turn (not after each half)', () => {
    const s = battle(PLAIN_A, PLAIN_B);
    s.teams[1].cards[0].dot = 'poison';
    const dot = (ev: BattleEvent[]) => ev.filter((e) => e.type === 'damage' && e.source === 'dot').length;
    expect(dot(ph(s, N, G))).toBe(0);
    expect(dot(ph(s, N, G))).toBe(1);
  });

  it('switching goes first: the attack hits the card that came in (which cannot defend)', () => {
    const s = battle(PLAIN_A, PLAIN_B);
    const ev = resolveRound(s, [N, SW(1)]);
    expect(s.teams[1].cards[0].hp).toBe(card(60)!.maxHp);
    expect(s.teams[1].cards[1].hp).toBe(card(61)!.maxHp - expected(12, 61, 'normal'));
    expect(ev.findIndex((e) => e.type === 'switch')).toBeLessThan(ev.findIndex((e) => e.type === 'damage'));
    // 同時交代: 攻撃はない
    const s2 = battle(PLAIN_A, PLAIN_B);
    const ev2 = resolveRound(s2, [SW(1), SW(2)]);
    expect(ev2.filter((e) => e.type === 'damage')).toHaveLength(0);
    expect([s2.teams[0].active, s2.teams[1].active]).toEqual([1, 2]);
  });

  it('hides unseen opponent cards and unused magic elements; keeps revealed cards revealed', () => {
    const s = battle([1, 2, 3], [4, 5, 6]);
    let v = viewFor(s, 0);
    expect(v.opponent[1]).toEqual({ hidden: true });
    expect(v.opponent[0]).toMatchObject({ hidden: false, id: 4, magicElement: null });
    expect(v.me[1]).toMatchObject({ id: 2, magicElement: '炎' });
    resolveRound(s, [G, SW(1)]);
    v = viewFor(s, 0);
    expect(v.opponent[1]).toMatchObject({ hidden: false, id: 5 });
    resolveRound(s, [N, SW(0)]);
    // 控えにもどっても公開のまま。まだ出ていない3枚目は「？？？」
    v = viewFor(s, 0);
    expect(v.opponent[1]).toMatchObject({ hidden: false, id: 5, active: false });
    expect(v.opponent[2]).toEqual({ hidden: true });
    // 魔法を使うと魔法属性がわかる(相手が攻撃側のターンに)
    resolveRound(s, [N, G]);
    expect(viewFor(s, 0).opponent[0]).toMatchObject({ magicElement: null });
    resolveRound(s, [G, MG]);
    expect(viewFor(s, 0).opponent[0]).toMatchObject({ magicElement: '闇' });
    // 新しい試合では、また非公開
    expect(viewFor(battle([1, 2, 3], [4, 5, 6]), 0).opponent[0]).toMatchObject({ magicElement: null });
    // ログ: 相手のまだ出ていないカードの番号は出さない
    const fake: BattleEvent[] = [{ type: 'enter', side: 1, id: 6 }];
    expect(eventsFor(s, 0, fake)).toHaveLength(0);
  });

  it('poison: 5% of max HP each round while active, paused on the bench, never stacked with burn', () => {
    const always = { ...FLAT, strongChance: 1 };
    // 019 鼠群の王(毒)
    const s = battle([19, 60, 61], PLAIN_B, always);
    resolveRound(s, [MG, G]);
    const tgt = s.teams[1].cards[0];
    expect(tgt.dot).toBe('poison');
    const hp = tgt.hp;
    resolveRound(s, [G, N]);
    expect(tgt.hp).toBe(hp - Math.ceil(tgt.def.maxHp * 0.05));
    // 控えでは止まる
    resolveRound(s, [G, SW(1)]);
    const benched = tgt.hp;
    resolveRound(s, [G, N]);
    resolveRound(s, [G, N]);
    expect(tgt.hp).toBe(benched);
    // 火傷は上書きしない
    const s2 = battle([8, 60, 61], PLAIN_B, always);
    s2.teams[1].cards[0].dot = 'poison';
    resolveRound(s2, [MG, G]);
    expect(s2.teams[1].cards[0].dot).toBe('poison');
  });

  it('sleep: loses the next action once, with no immunity (can be put to sleep again right away)', () => {
    const always = { ...FLAT, strongChance: 1 };
    const s = battle([14, 60, 61], PLAIN_B, always);
    resolveRound(s, [MG, G]);
    expect(activeCard(s, 1).skip).toBe('sleep');
    const ev = resolveRound(s, [G, N]);
    expect(ev.some((e) => e.type === 'skip')).toBe(true);
    expect(dmgTo(ev, 0)).toBe(0);
    resolveRound(s, [MG, G]);
    expect(activeCard(s, 1).skip).toBe('sleep');
  });

  it('sleep: can switch out at the start of a turn; the skip is kept (not used up) while on the bench', () => {
    const always = { ...FLAT, strongChance: 1 };
    // 014(素早さ5) と 029(素早さ6): 相手(1)が前半の攻撃側
    const s = battle([14, 60, 61], [29, 60, 61], always);
    s.attacker = 1;
    ph(s, N, G);
    ph(s, MG, G);
    expect(activeCard(s, 1).skip).toBe('sleep');
    // 次のターンの最初: 眠っていても交代できる(行動できない1回は使わない)
    expect([s.half, s.attacker]).toEqual([1, 1]);
    expect(legalActions(s, 1)).toContainEqual(SW(1));
    let ev = resolveRound(s, [G, SW(1)]);
    expect(ev.some((e) => e.type === 'skip')).toBe(false);
    expect(s.teams[1].cards[0].skip).toBe('sleep');
    // 控えにいる間は減らない
    ph(s, N, G);
    expect(s.teams[1].cards[0].skip).toBe('sleep');
    // ターンの最初にもどす → まだ減らない
    resolveRound(s, [(s.attacker as number) === 0 ? N : G, SW(0)]);
    expect(s.teams[1].active).toBe(0);
    expect(s.teams[1].cards[0].skip).toBe('sleep');
    while (s.half !== 1) ph(s, N, G);
    // 場にもどったあとの、はじめての行動で1回できない
    ev = ph(s, s.attacker === 1 ? N : G, s.attacker === 1 ? G : N);
    expect(ev.some((e) => e.type === 'skip' && e.side === 1)).toBe(true);
    expect(s.teams[1].cards[0].skip).toBeNull();
  });
});

describe('MYTHCLASH abilities (official 2026-10-26)', () => {
  it('001 狩人の一矢: first normal attack +20%, once per match even after switching', () => {
    const s = battle([1, 60, 61], PLAIN_B);
    const first = dmgTo(ph(s, N, G), 1);
    expect(first).toBe(expected(1, 60, 'normal', 1.2 * 0.5));
    ph(s, N, G);
    // 交代して、次のターンにもどす
    resolveRound(s, [SW(1), G]);
    ph(s, N, G);
    resolveRound(s, [SW(0), s.attacker === 1 ? N : G]);
    expect(s.teams[0].active).toBe(0);
    while (!(s.half === 1 && s.attacker === 0)) ph(s, N, G);
    expect(dmgTo(ph(s, N, G), 1)).toBe(expected(1, 60, 'normal', 0.5));
  });

  it('002 先駆けの牙 (faster), 020 窮地の反撃 (low HP), 058 とどめの一撃 (target low), 094 毒狩りの刃 (poisoned)', () => {
    expect(dmgTo(resolveRound(battle([2, 60, 61], PLAIN_B), [N, G]), 1)).toBe(expected(2, 60, 'normal', 1.15 * 0.5));
    let s = battle([20, 60, 61], PLAIN_B);
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(20, 60, 'normal', 0.5));
    s = battle([20, 60, 61], PLAIN_B);
    s.teams[0].cards[0].hp = 50;
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(20, 60, 'normal', 1.1 * 0.5));
    s = battle([58, 60, 61], PLAIN_B);
    s.teams[1].cards[0].hp = 50;
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(58, 60, 'normal', 1.25 * 0.5));
    s = battle([94, 60, 61], PLAIN_B);
    s.teams[1].cards[0].dot = 'burn';
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(94, 60, 'normal', 0.5));
    s = battle([94, 60, 61], PLAIN_B);
    s.teams[1].cards[0].dot = 'poison';
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(94, 60, 'normal', 1.15 * 0.5));
  });

  it('007 黄金の生命力: heals 15 when HP falls to 50% or less, once; heal never exceeds max HP', () => {
    const s = battle(PLAIN_B, [7, 60, 61]);
    const me = s.teams[1].cards[0];
    me.hp = Math.floor(me.def.maxHp * 0.5) + 5;
    const before = me.hp;
    const ev = resolveRound(s, [N, G]);
    expect(ev.some((e) => e.type === 'ability' && e.code === 'heal_below15')).toBe(true);
    expect(me.hp).toBe(before - dmgTo(ev, 1) + 15);
    resolveRound(s, [G, N]);
    expect(resolveRound(s, [N, G]).some((e) => e.type === 'ability')).toBe(false);
  });

  it('014/017: heal when own magic puts the target to sleep / freezes it', () => {
    const always = { ...FLAT, strongChance: 1 };
    const s = battle([14, 60, 61], PLAIN_B, always);
    s.teams[0].cards[0].hp = 100;
    resolveRound(s, [MG, G]);
    expect(s.teams[0].cards[0].hp).toBe(115);
    const s2 = battle([17, 60, 61], PLAIN_B, always);
    s2.teams[0].cards[0].hp = 100;
    resolveRound(s2, [MG, G]);
    expect([s2.teams[1].cards[0].skip, s2.teams[0].cards[0].hp]).toEqual(['freeze', 110]);
    // 魔法防御で失敗したら回復しない
    const s3 = battle([14, 60, 61], PLAIN_B, always);
    s3.teams[0].cards[0].hp = 100;
    resolveRound(s3, [MG, MD]);
    expect(s3.teams[0].cards[0].hp).toBe(100);
  });

  it('026/074 first magic up, 044 背水の必殺, 035 追撃の一閃 (no stacking)', () => {
    expect(dmgTo(resolveRound(battle([74, 60, 61], PLAIN_B), [MG, G]), 1)).toBe(expected(74, 60, 'magic', 1.2));
    const s = battle([44, 60, 61], PLAIN_B);
    s.teams[0].cards[0].hp = 60;
    expect(dmgTo(resolveRound(s, [SP, G]), 1)).toBe(expected(44, 60, 'special', 1.15));
    const t = battle([35, 60, 61], PLAIN_B);
    resolveRound(t, [SP, G]);
    resolveRound(t, [G, N]);
    expect(dmgTo(resolveRound(t, [N, G]), 1)).toBe(expected(35, 60, 'normal', 1.2 * 0.5));
    resolveRound(t, [G, N]);
    expect(dmgTo(resolveRound(t, [N, G]), 1)).toBe(expected(35, 60, 'normal', 0.5));
  });

  it('027/029/059/087/095: take-damage reductions', () => {
    // 059 初撃の防壁: 初めて受ける通常攻撃 -30%(1回)
    let s = battle(PLAIN_A, [59, 60, 61]);
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(12, 59, 'normal', 0.5 * 0.7));
    ph(s, N, G);
    untilMine(s);
    expect(dmgTo(ph(s, N, G), 1)).toBe(expected(12, 59, 'normal', 0.5));
    // 029 必殺封じの盾
    s = battle(PLAIN_A, [29, 60, 61]);
    expect(dmgTo(resolveRound(s, [SP, G]), 1)).toBe(expected(12, 29, 'special', 0.8));
    // 087 魔法障壁
    s = battle(PLAIN_A, [87, 60, 61]);
    expect(dmgTo(resolveRound(s, [MG, G]), 1)).toBe(expected(12, 87, 'magic', 0.75));
    // 027 窮地の守護: HP50%以下で初めて受ける攻撃 -25%
    s = battle(PLAIN_A, [27, 60, 61]);
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(12, 27, 'normal', 0.5));
    s.teams[1].cards[0].hp = 60;
    ph(s, N, G);
    untilMine(s);
    expect(dmgTo(ph(s, N, G), 1)).toBe(expected(12, 27, 'normal', 0.5 * 0.75));
    // 095 余裕の防御: HPが50%をこえている間 -10%
    s = battle(PLAIN_A, [95, 60, 61]);
    expect(dmgTo(resolveRound(s, [N, G]), 1)).toBe(expected(12, 95, 'normal', 0.5 * 0.9));
  });

  it('036 反撃の誘い: counter reflect +20%', () => {
    const s = battle(PLAIN_A, [36, 60, 61]);
    const ev = resolveRound(s, [SP, C]);
    expect(dmgTo(ev, 0)).toBe(expected(12, 12, 'special', 1.2));
  });

  it('039 勝者の生命力 and 045 登場の守護', () => {
    const s = battle([39, 60, 61], PLAIN_B);
    s.teams[1].cards[0].hp = 1;
    s.teams[0].cards[0].hp = 50;
    resolveRound(s, [N, G]);
    expect(s.teams[0].cards[0].hp).toBe(70);
    // 045: 初登場でバリア15
    const t = battle(PLAIN_A, [45, 60, 61]);
    expect(t.teams[1].cards[0].shield).toBe(15);
    const ev = resolveRound(t, [N, G]);
    expect(ev.find((e) => e.type === 'damage')).toMatchObject({ absorbed: Math.min(15, expected(12, 45, 'normal', 0.5)) });
  });

  it('056 鮮血の吸収: below half HP, normal attacks drain 15% of HP damage', () => {
    const s = battle([56, 60, 61], PLAIN_B);
    s.teams[0].cards[0].hp = 80;
    const ev = resolveRound(s, [N, G]);
    expect(s.teams[0].cards[0].hp).toBe(80 + Math.ceil(dmgTo(ev, 1) * 0.15));
  });

  it('057 不屈の生命 / 082 最後の踏ん張り: survive with 1 HP once; endure and heal happen together', () => {
    let s = battle(PLAIN_A, [57, 60, 61]);
    const me = s.teams[1].cards[0];
    me.hp = Math.ceil(me.def.maxHp * 0.25);
    me.hp = Math.ceil(me.def.maxHp * 0.25);
    const ev57 = resolveRound(s, [SP, G]);
    expect([me.hp, me.down, ev57.some((e) => e.type === 'endure')]).toEqual([1, false, true]);
    // 2回目はない
    s = battle(PLAIN_A, [82, 60, 61]);
    s.teams[1].cards[0].hp = 3;
    resolveRound(s, [SP, G]);
    expect([s.teams[1].cards[0].hp, s.teams[1].cards[0].down]).toEqual([1, false]);
    ph(s, N, G);
    untilMine(s);
    ph(s, N, G);
    expect(s.teams[1].cards[0].down).toBe(true);
    // 057 は、攻撃の直前のHPが25%未満なら耐えない
    s = battle(PLAIN_A, [57, 60, 61]);
    s.teams[1].cards[0].hp = 3;
    resolveRound(s, [SP, G]);
    expect(s.teams[1].cards[0].down).toBe(true);
  });

  it('062 夢への執念: one 50% retry when the sleep roll fails', () => {
    let retried = 0;
    for (let seed = 1; seed < 40; seed++) {
      const s = battle([62, 60, 61], PLAIN_B, FLAT, seed);
      const ev = resolveRound(s, [MG, G]);
      if (ev.some((e) => e.type === 'ability' && e.code === 'sleep_reroll')) retried++;
    }
    expect(retried).toBeGreaterThan(5);
  });
});
