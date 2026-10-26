/**
 * MYTHCLASH のバトルの数字と、まだ決まっていない決まりの切りかえ(設定)。Phaserに依存しない。
 * 仕様: docs/MYTHCLASH.md(引き継ぎ仕様書 2026-10-26)。
 * 【確定】と書いていない所は、すべて【暫定】【未決定】。あとから変えられるように、ここに集める。
 */
import type { Element } from './cards';

export interface BattleRules {
  /** 属性の倍率【暫定・有力な試作案】有利×1.40／不利×0.60 */
  elementAdvantage: number;
  elementDisadvantage: number;
  /** 最終ダメージの乱数(±10%)【方針】 */
  randomSpread: number;
  /** ダメージ式の係数(通常・必殺の0.75は現行基準、魔法の0.85は確定) */
  scale: number;
  magicScale: number;
  /** 最低ダメージ【未決定】(負の値・0のときにこれにする) */
  minDamage: number;
  /** 毒・火傷: 最大HPの割合【確定 5%】・端数【未決定】・入る時【未決定】 */
  dotRate: number;
  dotRounding: 'ceil' | 'floor' | 'round';
  dotTiming: 'roundEnd' | 'roundStart';
  /** 強い追加効果のコイントス【確定 50%】 */
  strongChance: number;
  /** 睡眠・凍結のあいだに交代できるか【未決定】 */
  canSwitchWhileAsleep: boolean;
  /** 睡眠・凍結と毒・火傷を同時に持てるか【未決定】 */
  sleepAndDotTogether: boolean;
  /** カウンターではね返すダメージを、はね返される側(攻撃した側)の防御で計算し直すか【未決定。前の版の指示書では そうする】 */
  reflectUsesAttackerDef: boolean;
  /** 魔法防御が、相手の自己回復・自己強化・バリアまで止めるか【未決定】 */
  magicGuardBlocksSelfEffects: boolean;
  /** 最後の1枚どうしが同時に戦闘不能になったとき【未決定】 */
  bothLastDown: 'draw' | 'attackerWins' | 'defenderWins';
}

export const DEFAULT_RULES: BattleRules = {
  elementAdvantage: 1.4,
  elementDisadvantage: 0.6,
  randomSpread: 0.1,
  scale: 0.75,
  magicScale: 0.85,
  minDamage: 1,
  dotRate: 0.05,
  dotRounding: 'ceil',
  dotTiming: 'roundEnd',
  strongChance: 0.5,
  canSwitchWhileAsleep: false,
  sleepAndDotTogether: true,
  reflectUsesAttackerDef: true,
  magicGuardBlocksSelfEffects: false,
  bothLastDown: 'draw',
};

/** 有利な相手(攻撃する属性 → 有利になる相手の属性)【確定】炎→自然→雷→水→炎、光と闇は互いに有利、無は等倍 */
const ADVANTAGE: Partial<Record<Element, Element>> = { 炎: '自然', 自然: '雷', 雷: '水', 水: '炎', 光: '闇', 闇: '光' };

export function elementMultiplier(attack: Element, target: Element, rules: BattleRules = DEFAULT_RULES): number {
  if (ADVANTAGE[attack] === target) return rules.elementAdvantage;
  if (ADVANTAGE[target] === attack && attack !== '光' && attack !== '闇') return rules.elementDisadvantage;
  return 1;
}

/** ダメージ式の土台(属性・乱数・防御・補正の前)【暫定バランス値】 */
export function baseDamage(kind: 'normal' | 'special' | 'magic', a: { atk: number; mag: number; magicModifier: number }, t: { def: number; mag: number }, rules: BattleRules = DEFAULT_RULES): number {
  if (kind === 'normal') return (20 + a.atk * 7 - t.def * 2) * rules.scale;
  if (kind === 'special') return (30 + a.atk * 9 - t.def * 2) * rules.scale;
  return (20 + a.mag * 7 + a.magicModifier - t.mag * 2) * rules.scale * rules.magicScale;
}
