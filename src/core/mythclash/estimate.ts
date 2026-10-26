/**
 * ダメージの目安(企画者 2026-10-26: 相手の攻撃・必殺でどのくらい受けるか。魔法は使われたら次のターンからわかる)。Phaserに依存しない。
 * 土台の式 × 属性 × 乱数のはば(±)で、いちばん小さい〜大きい値を出す。特性・攻撃低下などの補正は入れない(目安)。
 * 見せてよい情報だけを使う: 相手の魔法は、そのカードが一度使って魔法属性が公開されるまで出さない(null)
 */
import { activeCard, type AttackKind, type BattleState, type Side } from './engine';
import { baseDamage, elementMultiplier } from './rules';

export interface DamageRange {
  min: number;
  max: number;
}

/** attacker の場のカードが、相手の場のカードに kind で攻撃したときの目安(防御なし) */
export function estimateDamage(s: BattleState, attacker: Side, kind: AttackKind): DamageRange {
  const rules = s.rules;
  const a = activeCard(s, attacker);
  const t = activeCard(s, attacker === 0 ? 1 : 0);
  const el = elementMultiplier(kind === 'magic' ? a.def.magic.element : a.def.element, t.def.element, rules);
  const base = baseDamage(kind, { atk: a.def.atk, mag: a.def.mag, magicModifier: a.def.magic.modifier }, { def: t.def.def, mag: t.def.mag }, rules) * el;
  const fin = (x: number) => Math.max(rules.minDamage, Math.ceil(x - 1e-9));
  return { min: fin(base * (1 - rules.randomSpread)), max: fin(base * (1 + rules.randomSpread)) };
}

/** 相手(viewer の反対)の攻撃の目安。魔法は、相手の場のカードが魔法を使ったあとだけ */
export function incomingEstimates(s: BattleState, viewer: Side): { normal: DamageRange; special: DamageRange; magic: DamageRange | null; specialLocked: boolean } {
  const op: Side = viewer === 0 ? 1 : 0;
  const c = activeCard(s, op);
  return {
    normal: estimateDamage(s, op, 'normal'),
    special: estimateDamage(s, op, 'special'),
    magic: c.magicRevealed ? estimateDamage(s, op, 'magic') : null,
    specialLocked: c.specialLock,
  };
}

/** 半分にしたとき(防御・魔法防御)の目安 */
export const halved = (r: DamageRange, minDamage = 1): DamageRange => ({ min: Math.max(minDamage, Math.ceil(r.min * 0.5 - 1e-9)), max: Math.max(minDamage, Math.ceil(r.max * 0.5 - 1e-9)) });
