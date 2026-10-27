/**
 * MYTHCLASH の CPU の強さ(企画者決定 2026-10-27: 弱い・普通・強い)。Phaserに依存しない。
 * CPU は見えてよい情報だけで決める(相手のまだ使っていない魔法の属性は知らない。ふつうの属性・数字はカードに書いてあるので知っている)。
 * - 弱い: 適当に選ぶ(交代しない)
 * - 普通: 前からのかんたんなAI(sim.ts の aiAction)
 * - 強い: 属性の相性を考えてダメージの大きい攻撃を選ぶ・強い方の攻撃を読んで防ぐ・倒れたら相性のよいカードを出す。
 *   ただし必殺を読んでのカウンターは いつもではない(企画者「全部カウンター成功だとつまらない」→【仮】相手が必殺を使えるときに50%)。
 *   シミュレーション(同じカードどうし): 普通に約65%、弱いに約79%勝つ。普通は弱いに約60%
 * 【仮】確率の数字はすべて、遊んでみて調整する
 */
import { activeCard, legalActions, type AttackKind, type BattleAction, type BattleState, type CardBattleState, type ChooseReplacement, type Side } from './engine';
import { magicEffectOf } from './magic';
import { baseDamage, elementMultiplier } from './rules';
import { aiAction } from './sim';
import type { Rng } from '../rng';

export type CpuLevel = 'weak' | 'normal' | 'strong';
export const CPU_LEVELS: readonly CpuLevel[] = ['weak', 'normal', 'strong'];
export const CPU_LABELS: Record<CpuLevel, string> = { weak: '弱い', normal: '普通', strong: '強い' };

/** 強いCPUの数字【仮】 */
export const STRONG_CPU = {
  /** 相手が必殺を使えるときに、カウンターを選ぶ割合 */
  counter: 0.5,
  /** 必殺がいちばん強いときに、必殺を選ぶ割合(カウンターされるかもしれないので、いつもは使わない) */
  special: 0.6,
  /** いちばんよい手ではなく、適当に選ぶ割合(読まれすぎないように) */
  random: 0.05,
} as const;

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const same = (a: BattleAction, b: BattleAction) => JSON.stringify(a) === JSON.stringify(b);
const pickOf = <T>(xs: readonly T[], rng: Rng): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

/** att が tgt に kind で攻撃したときの、だいたいのダメージ(乱数・特性は入れない)。魔法の属性は、見えていなければ等倍で考える */
export function roughDamage(s: BattleState, att: CardBattleState, tgt: CardBattleState, kind: AttackKind, magicKnown = true): number {
  const el = kind === 'magic' ? (magicKnown ? elementMultiplier(att.def.magic.element, tgt.def.element, s.rules) : 1) : elementMultiplier(att.def.element, tgt.def.element, s.rules);
  const d = baseDamage(kind, { atk: att.def.atk, mag: att.def.mag, magicModifier: att.def.magic.modifier }, { def: tgt.def.def, mag: tgt.def.mag }, s.rules) * el;
  return Math.max(1, d);
}

/** a が b にどれだけ有利か(大きいほど a が有利)。お互いのいちばん強い攻撃をくらべる */
function matchup(s: BattleState, a: CardBattleState, b: CardBattleState, bMagicKnown: boolean): number {
  const give = Math.max(roughDamage(s, a, b, 'normal'), roughDamage(s, a, b, 'magic'));
  const take = Math.max(roughDamage(s, b, a, 'normal'), roughDamage(s, b, a, 'magic', bMagicKnown));
  return give / b.hp - take / a.hp;
}

function weakAction(s: BattleState, side: Side, rng: Rng): BattleAction {
  const legal = legalActions(s, side).filter((a) => a.type !== 'switch');
  if (!legal.length) return legalActions(s, side)[0];
  const has = (a: BattleAction) => legal.some((l) => same(l, a));
  const r = rng();
  if (side === s.attacker) {
    if (r < 0.15 && has({ type: 'attack', kind: 'special' })) return { type: 'attack', kind: 'special' };
    const kind = rng() < 0.55 ? 'normal' : 'magic';
    return has({ type: 'attack', kind }) ? { type: 'attack', kind } : legal[0];
  }
  if (r < 0.12 && has({ type: 'defend', kind: 'counter' })) return { type: 'defend', kind: 'counter' };
  const kind = rng() < 0.5 ? 'guard' : 'magicGuard';
  return has({ type: 'defend', kind }) ? { type: 'defend', kind } : legal[0];
}

function strongAction(s: BattleState, side: Side, rng: Rng): BattleAction {
  const legal = legalActions(s, side);
  const has = (a: BattleAction) => legal.some((l) => same(l, a));
  const me = activeCard(s, side);
  const op = activeCard(s, other(side));
  // 交代はしない(交代すると、そのターンの攻撃が無くなるので、シミュレーションでは かえって弱くなった)
  const acts = legal.filter((a) => a.type !== 'switch');
  if (!acts.length) return legal[0];
  if (rng() < STRONG_CPU.random) return pickOf(acts, rng);
  if (side === s.attacker) {
    const score = (kind: AttackKind) => {
      let d = roughDamage(s, me, op, kind);
      // 魔法の追加効果(相手にかかる効果は、まだ付いていなければ少し高く見る)
      if (kind === 'magic') {
        const eff = magicEffectOf(me.def.magic.effectCode).effect.kind;
        if ((eff === 'poison' || eff === 'burn') && !op.dot) d *= 1.25;
        else if ((eff === 'sleep' || eff === 'freeze') && !op.skip) d *= 1.3;
        else if (eff !== 'none') d *= 1.1;
      }
      // 倒せるなら、それがいちばん
      if (d >= op.hp) d *= 2;
      return d;
    };
    const kinds = (['normal', 'magic', 'special'] as AttackKind[]).filter((k) => has({ type: 'attack', kind: k }));
    // 眠っている・凍っているときは攻撃できない(「何もしない」)
    if (!kinds.length) return acts[0];
    kinds.sort((a, b) => score(b) - score(a));
    // 必殺はカウンターされるかもしれないので、いちばん強くても いつもは使わない
    if (kinds[0] === 'special' && kinds.length > 1 && rng() >= STRONG_CPU.special) return { type: 'attack', kind: kinds[1] };
    return { type: 'attack', kind: kinds[0] };
  }
  // 防御: 相手が必殺を使えるなら、ときどきカウンター。あとは強い方の攻撃を防ぐ
  if (!op.specialLock && has({ type: 'defend', kind: 'counter' }) && rng() < STRONG_CPU.counter) return { type: 'defend', kind: 'counter' };
  const n = roughDamage(s, op, me, 'normal');
  const m = roughDamage(s, op, me, 'magic', op.magicRevealed);
  const lean = m / (n + m);
  const kind = rng() < (lean > 0.5 ? 0.85 : 0.15) ? 'magicGuard' : 'guard';
  return has({ type: 'defend', kind }) ? { type: 'defend', kind } : acts[0];
}

/** CPUの行動 */
export function cpuAction(s: BattleState, side: Side, level: CpuLevel, rng: Rng): BattleAction {
  if (level === 'weak') return weakAction(s, side, rng);
  if (level === 'strong') return strongAction(s, side, rng);
  return aiAction(s, side, rng);
}

/** 倒されたあとに出すカード。強いCPUは相性のよいカード、ほかは控えの若い番号 */
export function cpuReplacement(s: BattleState, side: Side, level: CpuLevel, alive: number[]): number {
  if (level !== 'strong' || alive.length < 2) return alive[0];
  const op = activeCard(s, other(side));
  // 相手のカードも倒れているとき(同時)は、まだ誰が出てくるかわからないので若い番号
  if (op.down) return alive[0];
  let best = alive[0];
  let bestM = -Infinity;
  for (const i of alive) {
    const m = matchup(s, s.teams[side].cards[i], op, op.magicRevealed);
    if (m > bestM) [best, bestM] = [i, m];
  }
  return best;
}

/** 両方CPUのとき(シミュレーション)の、倒されたあとの選び方 */
export const cpuChooser =
  (s: BattleState, levels: [CpuLevel, CpuLevel]): ChooseReplacement =>
  (side, alive) =>
    cpuReplacement(s, side, levels[side], alive);
