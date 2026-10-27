/**
 * 魔法の効果・特性の説明の文(画面に出す)。Phaserに依存しない。
 * 中身は magic.ts・abilities.ts の決まりから作る(決まりを変えたら、説明も自動で変わる)
 */
import { abilityOf, type Ability } from './abilities';
import type { CardDefinition } from './cards';
import { magicEffectOf } from './magic';
import { DEFAULT_RULES, type BattleRules } from './rules';

const pct = (r: number) => `${Math.round(r * 100)}%`;
const ATTACK_NAMES = { normal: '通常攻撃', special: '必殺技', magic: '魔法', any: '攻撃' } as const;

/** 魔法の追加効果の説明(ダメージのあとに起きること) */
export function describeMagicEffect(c: CardDefinition, rules: BattleRules = DEFAULT_RULES): string {
  const m = magicEffectOf(c.magic.effectCode, rules.strongChance);
  const e = m.effect;
  const chance = m.chance < 1 ? `（${pct(m.chance)}で）` : '';
  switch (e.kind) {
    case 'none':
      return '追加効果なし';
    case 'sleep':
      return `相手を睡眠${chance}。行動が${rules.skipActions}回できない`;
    case 'freeze':
      return `相手を凍結${chance}。行動が${rules.skipActions}回できない`;
    case 'poison':
      return `相手を毒${chance}。毎ターン最大HPの${pct(rules.dotRate)}`;
    case 'burn':
      return `相手を火傷${chance}。毎ターン最大HPの${pct(rules.dotRate)}`;
    case 'weaken':
      return `相手の次の${e.target === 'normal' ? '通常攻撃' : '魔法'} −${pct(e.rate)}${chance}`;
    case 'boost':
      return `自分の次の${e.target === 'normal' ? '通常攻撃' : '魔法'} +${pct(e.rate)}`;
    case 'heal':
      return `自分のHPを${e.amount}回復`;
    case 'drain':
      return `与えたダメージの${pct(e.rate)}を吸収`;
    case 'shield':
      return `自分にバリア${e.amount}`;
  }
}

/** 特性の説明 */
export function describeAbility(ab: Ability): string {
  const d = ab.def;
  switch (d.kind) {
    case 'dealUp': {
      const when = { first: '試合で最初の', always: '', selfLow: '自分のHPが50%以下のとき、', faster: '自分の方が素早いとき、', targetLow: '相手のHPが50%以下のとき、', targetPoison: '相手が毒のとき、', afterSpecial: '必殺技のあとの' }[d.when];
      return `${when}${ATTACK_NAMES[d.attack]}のダメージ +${pct(d.rate)}`;
    }
    case 'takeDown': {
      const when = { first: `最初に受ける${ATTACK_NAMES[d.attack]}`, firstWhileLow: 'HPが50%以下で最初に受ける攻撃', selfHigh: `HPが50%より多いときに受ける${ATTACK_NAMES[d.attack]}` }[d.when];
      return `${when}のダメージ −${pct(d.rate)}`;
    }
    case 'healWhenLow':
      return `HPが50%以下になったらHPを${d.amount}回復（1回）`;
    case 'healOnStatus':
      return `自分の魔法で相手を${d.status === 'sleep' ? '睡眠' : '凍結'}にしたらHPを${d.amount}回復`;
    case 'reflectUp':
      return `カウンターではね返すダメージ +${pct(d.rate)}`;
    case 'healOnKo':
      return `相手を倒したらHPを${d.amount}回復`;
    case 'entryShield':
      return `はじめて場に出たときバリア${d.amount}`;
    case 'drainWhenLow':
      return `HPが50%以下のとき、通常攻撃のダメージの${pct(d.rate)}を吸収`;
    case 'endure':
      return d.minHpRate > 0 ? `HPが${pct(d.minHpRate)}以上なら、倒れるダメージをHP1で耐える（1回）` : '倒れるダメージをHP1で耐える（1回）';
    case 'sleepReroll':
      return '睡眠が外れたら、もう1回だけ判定する';
    case 'none':
      return '';
  }
}

/**
 * カードを大きく見るときの、特性の説明(企画者 2026-10-27: バインダーやパックでカードをアップしたとき、特性がわかるように)。
 * 特性が無いカードは「特性：なし」
 */
export function abilityLines(c: CardDefinition): string[] {
  const ab = abilityOf(c.abilityCode);
  if (!ab || ab.def.kind === 'none' || !ab.name) return ['特性：なし'];
  return [`特性：${ab.name}`, describeAbility(ab)];
}
