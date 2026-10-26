/**
 * MYTHCLASH のバトル(3対3勝ち抜き戦)。Phaserに依存しない。画面とは分けて、テストできる形にする。
 * 仕様: docs/MYTHCLASH.md(引き継ぎ仕様書 2026-10-26)。【確定】の決まりは変えない。
 *
 * 1ターン(ラウンド)の流れ:
 *  1. 双方が行動を選ぶ(攻撃側: 通常攻撃/必殺/魔法/交代、防御側: 通常防御/カウンター/魔法防御/交代)
 *  2. 交代を先に処理する(交代して出てきたカードに攻撃が当たる。交代した側は、そのターン防御できない)
 *  3. 攻撃を解決する(ダメージ → 耐える → 回復の順で同時に。企画者 2026-10-26)
 *  4. 毒・火傷(場にいるカードだけ)【時期は未決定。rules.dotTiming】
 *  5. 戦闘不能のカードの代わりを出す → 攻撃側と防御側を入れかえる
 *
 * ダメージの計算の順番【暫定。未決定の所は rules.ts】:
 *  土台の式 → 属性の倍率 → 乱数(±10%) → 防御(通常防御・魔法防御で半分) → 最終ダメージへの割合の補正
 *  (特性の増減・魔法の攻撃低下/強化) → 端数を切り上げ → 最低ダメージ → バリアで吸収 → HPを減らす
 */
import { abilityOf, LOW_HP, type Ability } from './abilities';
import { card as cardDef, type CardDefinition } from './cards';
import { magicEffectOf } from './magic';
import { baseDamage, DEFAULT_RULES, elementMultiplier, type BattleRules } from './rules';
import { mulberry32, type Rng } from '../rng';

export type Side = 0 | 1;
export type AttackKind = 'normal' | 'special' | 'magic';
export type DefenseKind = 'guard' | 'counter' | 'magicGuard';

export type BattleAction =
  | { type: 'attack'; kind: AttackKind }
  | { type: 'defend'; kind: DefenseKind }
  | { type: 'switch'; to: number };

/** 試合の中のカード1枚の状態(CardBattleState) */
export interface CardBattleState {
  id: number;
  def: CardDefinition;
  ability?: Ability;
  hp: number;
  down: boolean;
  /** 一度でも場に出た(相手に公開された) */
  entered: boolean;
  /** 魔法を使って、魔法属性が相手に公開された */
  magicRevealed: boolean;
  /** 次の行動ができない(睡眠・凍結) */
  skip: 'sleep' | 'freeze' | null;
  /** 毒・火傷(どちらか一方だけ) */
  dot: 'poison' | 'burn' | null;
  /** 必殺を使ったので、次の自分の攻撃ターンに必殺を選べない */
  specialLock: boolean;
  /** 試合中1回の特性を使った */
  abilityUsed: boolean;
  /** 追撃の一閃: 必殺を使ったあと、次の通常攻撃を上げる */
  afterSpecial: boolean;
  /** バリア(残りの量) */
  shield: number;
  /** 魔法の攻撃低下(相手にかけられた)・自分の強化。次の1回で消える */
  weakenNormal: number;
  weakenMagic: number;
  boostNormal: number;
  boostMagic: number;
}

export interface TeamState {
  cards: CardBattleState[];
  active: number;
}

export interface BattleState {
  rules: BattleRules;
  teams: [TeamState, TeamState];
  /** このターンの攻撃側 */
  attacker: Side;
  round: number;
  /** 勝った側(引き分けは 'draw')。決まっていなければ null */
  winner: Side | 'draw' | null;
  rng: Rng;
}

export type BattleEvent =
  | { type: 'enter'; side: Side; id: number }
  | { type: 'switch'; side: Side; from: number; to: number }
  | { type: 'skip'; side: Side; id: number; reason: 'sleep' | 'freeze' }
  | { type: 'attack'; side: Side; id: number; kind: AttackKind }
  | { type: 'defend'; side: Side; id: number; kind: DefenseKind }
  | { type: 'damage'; side: Side; id: number; amount: number; absorbed: number; source: AttackKind | 'reflect' | 'dot' }
  | { type: 'counter'; side: Side; id: number; success: boolean }
  | { type: 'status'; side: Side; id: number; status: 'sleep' | 'freeze' | 'poison' | 'burn' | 'weaken' | 'boost' | 'shield'; applied: boolean }
  | { type: 'heal'; side: Side; id: number; amount: number; source: 'magic' | 'drain' | 'ability' }
  | { type: 'ability'; side: Side; id: number; code: string }
  | { type: 'endure'; side: Side; id: number }
  | { type: 'magicReveal'; side: Side; id: number; element: string }
  | { type: 'down'; side: Side; id: number }
  | { type: 'end'; winner: Side | 'draw' };

const other = (s: Side): Side => (s === 0 ? 1 : 0);

function newCardState(id: number): CardBattleState {
  const def = cardDef(id);
  if (!def) throw new Error(`MYTHCLASH: カード No.${id} がない`);
  return { id, def, ability: abilityOf(def.abilityCode), hp: def.maxHp, down: false, entered: false, magicRevealed: false, skip: null, dot: null, specialLock: false, abilityUsed: false, afterSpecial: false, shield: 0, weakenNormal: 0, weakenMagic: 0, boostNormal: 0, boostMagic: 0 };
}

/** デッキが正しいか(ちがうカードIDが3枚。企画者決定) */
export function validDeck(ids: readonly number[]): boolean {
  return ids.length === 3 && new Set(ids).size === 3 && ids.every((id) => !!cardDef(id));
}

/** 試合を始める。最初の攻撃側は、場に出たカードの素早さが高い方(同じなら乱数) */
export function createBattle(deckA: readonly number[], deckB: readonly number[], seed: number, rules: BattleRules = DEFAULT_RULES): { state: BattleState; events: BattleEvent[] } {
  if (!validDeck(deckA) || !validDeck(deckB)) throw new Error('MYTHCLASH: デッキはちがうカード3枚');
  const rng = mulberry32(seed);
  const teams: [TeamState, TeamState] = [
    { cards: deckA.map(newCardState), active: 0 },
    { cards: deckB.map(newCardState), active: 0 },
  ];
  const sa = teams[0].cards[0].def.spd;
  const sb = teams[1].cards[0].def.spd;
  const attacker: Side = sa > sb ? 0 : sb > sa ? 1 : rng() < 0.5 ? 0 : 1;
  const state: BattleState = { rules, teams, attacker, round: 1, winner: null, rng };
  const events: BattleEvent[] = [];
  enter(state, 0, events);
  enter(state, 1, events);
  return { state, events };
}

export const activeCard = (s: BattleState, side: Side) => s.teams[side].cards[s.teams[side].active];

function enter(s: BattleState, side: Side, events: BattleEvent[]): void {
  const c = activeCard(s, side);
  const first = !c.entered;
  c.entered = true;
  events.push({ type: 'enter', side, id: c.id });
  const ab = c.ability;
  if (first && ab && ab.def.kind === 'entryShield' && !c.abilityUsed) {
    c.abilityUsed = true;
    c.shield = Math.max(c.shield, ab.def.amount);
    events.push({ type: 'ability', side, id: c.id, code: ab.code });
  }
}

/** その側が、今このターンに選べる行動 */
export function legalActions(s: BattleState, side: Side): BattleAction[] {
  if (s.winner !== null) return [];
  const t = s.teams[side];
  const c = activeCard(s, side);
  const out: BattleAction[] = [];
  const asleep = !!c.skip;
  if (side === s.attacker) {
    if (!asleep) {
      out.push({ type: 'attack', kind: 'normal' });
      if (!c.specialLock) out.push({ type: 'attack', kind: 'special' });
      out.push({ type: 'attack', kind: 'magic' });
    }
  } else if (!asleep) {
    out.push({ type: 'defend', kind: 'guard' }, { type: 'defend', kind: 'counter' }, { type: 'defend', kind: 'magicGuard' });
  }
  // 眠っている・凍っているときは「何もしない」(行動が1回消える)を先頭に。交代はできる(企画者 2026-10-26)
  if (asleep) out.push({ type: 'defend', kind: 'guard' });
  if (!asleep || s.rules.canSwitchWhileAsleep) t.cards.forEach((o, i) => { if (i !== t.active && !o.down) out.push({ type: 'switch', to: i }); });
  return out;
}

const sameAction = (a: BattleAction, b: BattleAction) => JSON.stringify(a) === JSON.stringify(b);

function heal(c: CardBattleState, side: Side, amount: number, source: 'magic' | 'drain' | 'ability', events: BattleEvent[]): void {
  if (c.down || amount <= 0) return;
  const got = Math.min(amount, c.def.maxHp - c.hp);
  c.hp += got;
  events.push({ type: 'heal', side, id: c.id, amount: got, source });
}

/**
 * ダメージを受ける(耐える・HPが減ったときの回復も同時に。企画者 2026-10-26: 耐えると回復は同時)。
 * 受けたHPダメージ(バリアで吸収した分は除く)を返す
 */
function takeDamage(side: Side, c: CardBattleState, amount: number, source: AttackKind | 'reflect' | 'dot', events: BattleEvent[]): number {
  const absorbed = Math.min(c.shield, amount);
  c.shield -= absorbed;
  let hpDmg = amount - absorbed;
  const before = c.hp;
  const ab = c.ability;
  // 耐える(試合中1回)
  if (hpDmg >= c.hp && ab && ab.def.kind === 'endure' && !c.abilityUsed) {
    const isAttack = source !== 'dot';
    if ((!ab.def.attacksOnly || isAttack) && before >= c.def.maxHp * ab.def.minHpRate) {
      hpDmg = c.hp - 1;
      c.abilityUsed = true;
      events.push({ type: 'endure', side, id: c.id }, { type: 'ability', side, id: c.id, code: ab.code });
    }
  }
  c.hp = Math.max(0, c.hp - hpDmg);
  events.push({ type: 'damage', side, id: c.id, amount: hpDmg, absorbed, source });
  // HPが50%以下になったとき回復(試合中1回)
  if (c.hp > 0 && ab && ab.def.kind === 'healWhenLow' && !c.abilityUsed && c.hp <= c.def.maxHp * LOW_HP) {
    c.abilityUsed = true;
    events.push({ type: 'ability', side, id: c.id, code: ab.code });
    heal(c, side, ab.def.amount, 'ability', events);
  }
  if (c.hp <= 0 && !c.down) {
    c.down = true;
    events.push({ type: 'down', side, id: c.id });
  }
  return hpDmg;
}

/** 攻撃する側の特性で、最終ダメージにかける倍率(使った試合中1回の特性はここで使ったことにする) */
function dealMultiplier(att: CardBattleState, tgt: CardBattleState, kind: AttackKind, side: Side, events: BattleEvent[]): number {
  let m = 1;
  const ab = att.ability;
  if (ab && ab.def.kind === 'dealUp' && ab.def.attack === kind) {
    const d = ab.def;
    let on = false;
    if (d.when === 'first') on = !att.abilityUsed;
    else if (d.when === 'always') on = true;
    else if (d.when === 'selfLow') on = att.hp <= att.def.maxHp * LOW_HP;
    else if (d.when === 'faster') on = att.def.spd > tgt.def.spd;
    else if (d.when === 'targetLow') on = tgt.hp <= tgt.def.maxHp * LOW_HP;
    else if (d.when === 'targetPoison') on = tgt.dot === 'poison';
    else if (d.when === 'afterSpecial') on = att.afterSpecial;
    if (on) {
      if (ab.once) att.abilityUsed = true;
      m *= 1 + d.rate;
      events.push({ type: 'ability', side, id: att.id, code: ab.code });
    }
  }
  if (kind === 'normal' && att.afterSpecial) att.afterSpecial = false;
  // 魔法の追加効果(かけられた攻撃低下・自分の強化)。次の1回で消える
  if (kind === 'normal') {
    m *= (1 - att.weakenNormal) * (1 + att.boostNormal);
    att.weakenNormal = 0;
    att.boostNormal = 0;
  }
  if (kind === 'magic') {
    m *= (1 - att.weakenMagic) * (1 + att.boostMagic);
    att.weakenMagic = 0;
    att.boostMagic = 0;
  }
  return m;
}

/** 受ける側の特性で、最終ダメージにかける倍率 */
function takeMultiplier(tgt: CardBattleState, kind: AttackKind, side: Side, events: BattleEvent[]): number {
  const ab = tgt.ability;
  if (!ab || ab.def.kind !== 'takeDown') return 1;
  const d = ab.def;
  if (d.attack !== 'any' && d.attack !== kind) return 1;
  let on = false;
  if (d.when === 'first') on = !tgt.abilityUsed;
  else if (d.when === 'firstWhileLow') on = !tgt.abilityUsed && tgt.hp <= tgt.def.maxHp * LOW_HP;
  else if (d.when === 'selfHigh') on = tgt.hp > tgt.def.maxHp * LOW_HP;
  if (!on) return 1;
  if (ab.once) tgt.abilityUsed = true;
  events.push({ type: 'ability', side, id: tgt.id, code: ab.code });
  return 1 - d.rate;
}

/** 端数を切り上げて、最低ダメージにそろえる */
const finalize = (x: number, rules: BattleRules) => Math.max(rules.minDamage, Math.ceil(x - 1e-9));

/** 1つの攻撃を解決する */
function resolveAttack(s: BattleState, side: Side, kind: AttackKind, defense: DefenseKind | null, events: BattleEvent[]): void {
  const rules = s.rules;
  const att = activeCard(s, side);
  const tSide = other(side);
  const tgt = activeCard(s, tSide);
  events.push({ type: 'attack', side, id: att.id, kind });
  if (kind === 'magic' && !att.magicRevealed) {
    att.magicRevealed = true;
    events.push({ type: 'magicReveal', side, id: att.id, element: att.def.magic.element });
  }
  const atkElement = kind === 'magic' ? att.def.magic.element : att.def.element;
  const elem = elementMultiplier(atkElement, tgt.def.element, rules);
  // 乱数は1回だけ引く(カウンターではね返すときも同じ値)
  const roll = 1 + (s.rng() * 2 - 1) * rules.randomSpread;
  const stats = { atk: att.def.atk, mag: att.def.mag, magicModifier: att.def.magic.modifier };
  let dmg = baseDamage(kind, stats, { def: tgt.def.def, mag: tgt.def.mag }, rules) * elem * roll;
  if (kind === 'normal' && defense === 'guard') dmg *= 0.5;
  if (kind === 'magic' && defense === 'magicGuard') dmg *= 0.5;
  const deal = dealMultiplier(att, tgt, kind, side, events);
  if (kind === 'special') {
    att.specialLock = true;
    if (att.ability?.def.kind === 'dealUp' && att.ability.def.when === 'afterSpecial') att.afterSpecial = true;
  }
  // カウンター: 必殺にだけ成功し、必殺のダメージを100%はね返す(確定)。通常攻撃・魔法には無効
  if (defense === 'counter') {
    const ok = kind === 'special';
    events.push({ type: 'counter', side: tSide, id: tgt.id, success: ok });
    if (ok) {
      let back = rules.reflectUsesAttackerDef ? baseDamage('special', stats, { def: att.def.def, mag: att.def.mag }, rules) * elem * roll : dmg;
      back *= deal;
      const ab = tgt.ability;
      if (ab && ab.def.kind === 'reflectUp') {
        back *= 1 + ab.def.rate;
        events.push({ type: 'ability', side: tSide, id: tgt.id, code: ab.code });
      }
      takeDamage(side, att, finalize(back, rules), 'reflect', events);
      return;
    }
  }
  dmg *= deal * takeMultiplier(tgt, kind, tSide, events);
  const hpDmg = takeDamage(tSide, tgt, finalize(dmg, rules), kind, events);
  // 鮮血の吸収: HPが50%以下なら、通常攻撃で与えたHPダメージの一部を吸収
  const ab = att.ability;
  if (kind === 'normal' && ab && ab.def.kind === 'drainWhenLow' && att.hp <= att.def.maxHp * LOW_HP && hpDmg > 0) {
    events.push({ type: 'ability', side, id: att.id, code: ab.code });
    heal(att, side, Math.ceil(hpDmg * ab.def.rate), 'ability', events);
  }
  if (kind === 'magic') applyMagicEffect(s, side, att, tSide, tgt, defense === 'magicGuard', hpDmg, events);
  if (tgt.down && ab && ab.def.kind === 'healOnKo') {
    events.push({ type: 'ability', side, id: att.id, code: ab.code });
    heal(att, side, ab.def.amount, 'ability', events);
  }
}

/** 魔法の追加効果(魔法防御なら、相手にかかる効果は完全に無効) */
function applyMagicEffect(s: BattleState, side: Side, att: CardBattleState, tSide: Side, tgt: CardBattleState, guarded: boolean, hpDmg: number, events: BattleEvent[]): void {
  const rules = s.rules;
  const m = magicEffectOf(att.def.magic.effectCode, rules.strongChance);
  const e = m.effect;
  if (e.kind === 'none') return;
  if (m.onTarget && (guarded || tgt.down)) return;
  if (!m.onTarget && guarded && rules.magicGuardBlocksSelfEffects) return;
  let hit = m.chance >= 1 || s.rng() < m.chance;
  const ab = att.ability;
  // 夢への執念: 睡眠の判定に失敗したら、1回だけ判定し直す
  if (!hit && e.kind === 'sleep' && ab && ab.def.kind === 'sleepReroll') {
    events.push({ type: 'ability', side, id: att.id, code: ab.code });
    hit = s.rng() < m.chance;
  }
  if (e.kind === 'sleep' || e.kind === 'freeze') {
    const ok = hit && !tgt.skip && (rules.sleepAndDotTogether || !tgt.dot);
    if (ok) tgt.skip = e.kind;
    events.push({ type: 'status', side: tSide, id: tgt.id, status: e.kind, applied: ok });
    if (ok && ab && ab.def.kind === 'healOnStatus' && ab.def.status === e.kind) {
      events.push({ type: 'ability', side, id: att.id, code: ab.code });
      heal(att, side, ab.def.amount, 'ability', events);
    }
    return;
  }
  if (e.kind === 'poison' || e.kind === 'burn') {
    // 毒と火傷は同時に持てない(先に付いた方が優先・上書きなし)
    const ok = hit && !tgt.dot && (rules.sleepAndDotTogether || !tgt.skip);
    if (ok) tgt.dot = e.kind;
    events.push({ type: 'status', side: tSide, id: tgt.id, status: e.kind, applied: ok });
    return;
  }
  if (!hit) return;
  if (e.kind === 'weaken') {
    if (e.target === 'normal') tgt.weakenNormal = Math.max(tgt.weakenNormal, e.rate);
    else tgt.weakenMagic = Math.max(tgt.weakenMagic, e.rate);
    events.push({ type: 'status', side: tSide, id: tgt.id, status: 'weaken', applied: true });
  } else if (e.kind === 'boost') {
    if (e.target === 'normal') att.boostNormal = Math.max(att.boostNormal, e.rate);
    else att.boostMagic = Math.max(att.boostMagic, e.rate);
    events.push({ type: 'status', side, id: att.id, status: 'boost', applied: true });
  } else if (e.kind === 'heal') heal(att, side, e.amount, 'magic', events);
  else if (e.kind === 'drain') heal(att, side, Math.ceil(hpDmg * e.rate), 'drain', events);
  else if (e.kind === 'shield') {
    att.shield = Math.max(att.shield, e.amount);
    events.push({ type: 'status', side, id: att.id, status: 'shield', applied: true });
  }
}

/** 毒・火傷: 場にいるカードだけ、最大HPの5%(控えでは止まる) */
function tickDots(s: BattleState, events: BattleEvent[]): void {
  for (const side of [0, 1] as Side[]) {
    const c = activeCard(s, side);
    if (c.down || !c.dot) continue;
    const raw = c.def.maxHp * s.rules.dotRate;
    const amount = s.rules.dotRounding === 'ceil' ? Math.ceil(raw) : s.rules.dotRounding === 'floor' ? Math.floor(raw) : Math.round(raw);
    takeDamage(side, c, amount, 'dot', events);
  }
}

/**
 * 戦闘不能になった場のカードの代わりを出す。choose: 出すカードの番号(なければ、残りの1番目)【未決定: だれが選ぶか】
 * 残りがなければ、その側の負け
 */
function replaceDown(s: BattleState, events: BattleEvent[], choose?: (side: Side, alive: number[]) => number): void {
  const out: Side[] = [];
  for (const side of [0, 1] as Side[]) {
    const t = s.teams[side];
    if (!t.cards[t.active].down) continue;
    const alive = t.cards.map((c, i) => (c.down ? -1 : i)).filter((i) => i >= 0);
    if (!alive.length) {
      out.push(side);
      continue;
    }
    const pick = choose?.(side, alive);
    t.active = pick !== undefined && alive.includes(pick) ? pick : alive[0];
    enter(s, side, events);
  }
  if (out.length === 2) s.winner = s.rules.bothLastDown === 'draw' ? 'draw' : s.rules.bothLastDown === 'attackerWins' ? s.attacker : other(s.attacker);
  else if (out.length === 1) s.winner = other(out[0]);
  if (s.winner !== null) events.push({ type: 'end', winner: s.winner });
}

/** 1ターン進める。actions[side] がその側の行動(選べない行動なら、選べる行動の1番目にする) */
export function resolveRound(s: BattleState, actions: [BattleAction, BattleAction], choose?: (side: Side, alive: number[]) => number): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (s.winner !== null) return events;
  const acts = ([0, 1] as Side[]).map((side) => {
    const legal = legalActions(s, side);
    return legal.some((a) => sameAction(a, actions[side])) ? actions[side] : legal[0];
  }) as [BattleAction, BattleAction];
  const attackerCard = activeCard(s, s.attacker);
  // 睡眠・凍結: 次の行動が1回できない(耐性なし)
  const skipped: [boolean, boolean] = [false, false];
  for (const side of [0, 1] as Side[]) {
    const c = activeCard(s, side);
    if (c.skip && acts[side].type !== 'switch') {
      events.push({ type: 'skip', side, id: c.id, reason: c.skip });
      c.skip = null;
      skipped[side] = true;
    }
  }
  // 交代を先に(同時)
  for (const side of [0, 1] as Side[]) {
    const a = acts[side];
    if (a.type !== 'switch') continue;
    const t = s.teams[side];
    const from = t.cards[t.active].id;
    t.active = a.to;
    events.push({ type: 'switch', side, from, to: t.cards[a.to].id });
    enter(s, side, events);
  }
  const atk = acts[s.attacker];
  const dfn = acts[other(s.attacker)];
  const defense = !skipped[other(s.attacker)] && dfn.type === 'defend' ? dfn.kind : null;
  if (defense) events.push({ type: 'defend', side: other(s.attacker), id: activeCard(s, other(s.attacker)).id, kind: defense });
  if (!skipped[s.attacker] && atk.type === 'attack') resolveAttack(s, s.attacker, atk.kind, defense, events);
  // 必殺のロック: このターンが自分の攻撃ターンで、必殺を使わなかったら外す
  if (!(atk.type === 'attack' && atk.kind === 'special') && atk.type !== 'switch') attackerCard.specialLock = false;
  if (s.rules.dotTiming === 'roundEnd') tickDots(s, events);
  replaceDown(s, events, choose);
  if (s.winner === null) {
    s.attacker = other(s.attacker);
    s.round++;
    if (s.rules.dotTiming === 'roundStart') {
      tickDots(s, events);
      replaceDown(s, events, choose);
    }
  }
  return events;
}
