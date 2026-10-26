/**
 * MYTHCLASH の特殊能力(特性)28種類。企画者の正式仕様(2026-10-26)。Phaserに依存しない。
 * - 「試合中1回」の能力は、交代しても使った状態が残る(カードごとに覚える)
 * - 「初めての」は 1バトル(1試合)で1回(企画者 2026-10-26)
 * - 割合の補正は「最終ダメージ」にかける(計算の順番は engine.ts の damage の説明)
 * - 回復は最大HPをこえない
 * - 特性による効果は、魔法そのものの効果とは別に管理する(ここに書く)
 * No.003 は特性名・発動条件が既存データにないため【未確定】。毒の「+2」強化は廃止(毒は魔法の決まりのまま)。
 */

export type AbilityDef =
  /** 自分の通常攻撃・必殺・魔法の最終ダメージを上げる */
  | { kind: 'dealUp'; attack: 'normal' | 'special' | 'magic'; rate: number; when: 'first' | 'always' | 'selfLow' | 'faster' | 'targetLow' | 'targetPoison' | 'afterSpecial' }
  /** 受ける最終ダメージを下げる */
  | { kind: 'takeDown'; attack: 'normal' | 'special' | 'magic' | 'any'; rate: number; when: 'first' | 'firstWhileLow' | 'selfHigh' }
  /** 自分のHPが50%以下になったとき回復(試合中1回) */
  | { kind: 'healWhenLow'; amount: number }
  /** 自分の魔法で睡眠・凍結を付けられたら回復(無制限) */
  | { kind: 'healOnStatus'; status: 'sleep' | 'freeze'; amount: number }
  /** カウンター成功で、はね返すダメージを上げる */
  | { kind: 'reflectUp'; rate: number }
  /** 相手カードを倒したら回復(次の相手が出る前) */
  | { kind: 'healOnKo'; amount: number }
  /** 初登場のときにバリア(試合中1回) */
  | { kind: 'entryShield'; amount: number }
  /** HPが50%以下なら、通常攻撃で与えたHPダメージの rate を吸収 */
  | { kind: 'drainWhenLow'; rate: number }
  /** 戦闘不能になるダメージをHP1で耐える(試合中1回)。minHpRate: 攻撃の直前のHPがこれ以上のときだけ */
  | { kind: 'endure'; minHpRate: number; attacksOnly: boolean }
  /** 睡眠の50%判定に失敗したら、1回だけ50%で判定し直す(魔法ごと) */
  | { kind: 'sleepReroll' }
  /** 名前・効果が決まっていない(何もしない) */
  | { kind: 'undecided' };

export interface Ability {
  code: string;
  /** 特性名(決まっていないものは null) */
  name: string | null;
  /** 試合中1回 */
  once: boolean;
  def: AbilityDef;
}

/** 「HPが50%以下」の境目(企画者 2026-10-26: 50%) */
export const LOW_HP = 0.5;

export const ABILITIES: Record<string, Ability> = {
  first_normal20: { code: 'first_normal20', name: '狩人の一矢', once: true, def: { kind: 'dealUp', attack: 'normal', rate: 0.2, when: 'first' } },
  faster_normal15: { code: 'faster_normal15', name: '先駆けの牙', once: false, def: { kind: 'dealUp', attack: 'normal', rate: 0.15, when: 'faster' } },
  // No.003: 特性名・発動条件は既存データになし【未確定】。毒の+2強化は廃止(企画者 2026-10-26)
  poison_plus2: { code: 'poison_plus2', name: null, once: false, def: { kind: 'undecided' } },
  heal_below15: { code: 'heal_below15', name: '黄金の生命力', once: true, def: { kind: 'healWhenLow', amount: 15 } },
  sleep_heal15: { code: 'sleep_heal15', name: '夢喰いの恩恵', once: false, def: { kind: 'healOnStatus', status: 'sleep', amount: 15 } },
  freeze_heal10: { code: 'freeze_heal10', name: '氷結の恵み', once: false, def: { kind: 'healOnStatus', status: 'freeze', amount: 10 } },
  low_normal10: { code: 'low_normal10', name: '窮地の反撃', once: false, def: { kind: 'dealUp', attack: 'normal', rate: 0.1, when: 'selfLow' } },
  first_normal25: { code: 'first_normal25', name: '七羽の奇襲', once: true, def: { kind: 'dealUp', attack: 'normal', rate: 0.25, when: 'first' } },
  first_magic15: { code: 'first_magic15', name: '雷帝の威光', once: true, def: { kind: 'dealUp', attack: 'magic', rate: 0.15, when: 'first' } },
  low_first_reduce25: { code: 'low_first_reduce25', name: '窮地の守護', once: true, def: { kind: 'takeDown', attack: 'any', rate: 0.25, when: 'firstWhileLow' } },
  first_special_reduce20: { code: 'first_special_reduce20', name: '必殺封じの盾', once: true, def: { kind: 'takeDown', attack: 'special', rate: 0.2, when: 'first' } },
  after_special_normal20: { code: 'after_special_normal20', name: '追撃の一閃', once: false, def: { kind: 'dealUp', attack: 'normal', rate: 0.2, when: 'afterSpecial' } },
  counter_bait20: { code: 'counter_bait20', name: '反撃の誘い', once: false, def: { kind: 'reflectUp', rate: 0.2 } },
  kill_heal20: { code: 'kill_heal20', name: '勝者の生命力', once: false, def: { kind: 'healOnKo', amount: 20 } },
  low_special15: { code: 'low_special15', name: '背水の必殺', once: false, def: { kind: 'dealUp', attack: 'special', rate: 0.15, when: 'selfLow' } },
  entry_shield15: { code: 'entry_shield15', name: '登場の守護', once: true, def: { kind: 'entryShield', amount: 15 } },
  low_normal_drain15: { code: 'low_normal_drain15', name: '鮮血の吸収', once: false, def: { kind: 'drainWhenLow', rate: 0.15 } },
  endure25: { code: 'endure25', name: '不屈の生命', once: true, def: { kind: 'endure', minHpRate: 0.25, attacksOnly: true } },
  execute_normal25: { code: 'execute_normal25', name: 'とどめの一撃', once: false, def: { kind: 'dealUp', attack: 'normal', rate: 0.25, when: 'targetLow' } },
  first_normal_reduce30: { code: 'first_normal_reduce30', name: '初撃の防壁', once: true, def: { kind: 'takeDown', attack: 'normal', rate: 0.3, when: 'first' } },
  sleep_reroll: { code: 'sleep_reroll', name: '夢への執念', once: false, def: { kind: 'sleepReroll' } },
  heal_below20: { code: 'heal_below20', name: '逆境の再生', once: true, def: { kind: 'healWhenLow', amount: 20 } },
  first_magic20: { code: 'first_magic20', name: '魔力の解放', once: true, def: { kind: 'dealUp', attack: 'magic', rate: 0.2, when: 'first' } },
  execute_normal20: { code: 'execute_normal20', name: '追い詰める刃', once: false, def: { kind: 'dealUp', attack: 'normal', rate: 0.2, when: 'targetLow' } },
  // HP条件なし。攻撃以外(毒・火傷)のダメージでも耐えるかは【未決定】→ ひとまず攻撃だけ
  endure1: { code: 'endure1', name: '最後の踏ん張り', once: true, def: { kind: 'endure', minHpRate: 0, attacksOnly: true } },
  first_magic_reduce25: { code: 'first_magic_reduce25', name: '魔法障壁', once: true, def: { kind: 'takeDown', attack: 'magic', rate: 0.25, when: 'first' } },
  poison_normal15: { code: 'poison_normal15', name: '毒狩りの刃', once: false, def: { kind: 'dealUp', attack: 'normal', rate: 0.15, when: 'targetPoison' } },
  high_normal_reduce10: { code: 'high_normal_reduce10', name: '余裕の防御', once: false, def: { kind: 'takeDown', attack: 'normal', rate: 0.1, when: 'selfHigh' } },
};

export const abilityOf = (code: string | null): Ability | undefined => (code ? ABILITIES[code] : undefined);
