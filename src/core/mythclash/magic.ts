/**
 * MYTHCLASH の魔法の追加効果。カード表の「魔法効果コード（旧）」を、新しい決まりに移しかえる。Phaserに依存しない。
 * 確定(引き継ぎ仕様書 2026-10-26):
 * - 強い追加効果(睡眠・凍結・毒・火傷・強い攻撃低下など)はコイントス50%。失敗してもダメージは入る
 * - 睡眠・凍結: 行動を2回できなくする(2026-10-27 企画者。前は1回。回数は rules.skipActions)。耐性なし
 * - 毒・火傷: 最大HPの5%を毎ターン、戦闘不能になるまで。古い「固定ダメージ・2回分」は使わない(コードの数字は捨てる)
 * - 軽い攻撃低下(−10%)・回復・吸収は必ず発動の方針
 * - 魔法防御: 魔法の追加効果を完全に無効
 * それ以外(攻撃低下−15%・魔法低下・バリア・自分の強化の区分、続く長さ、回復量)は【暫定】【未確定】。
 */

export type MagicEffect =
  | { kind: 'none' }
  | { kind: 'sleep' | 'freeze' | 'poison' | 'burn' }
  /** 相手の次の通常攻撃(atk)・魔法(mag)のダメージを rate だけ下げる */
  | { kind: 'weaken'; target: 'normal' | 'magic'; rate: number }
  /** 自分の次の通常攻撃・魔法のダメージを rate だけ上げる */
  | { kind: 'boost'; target: 'normal' | 'magic'; rate: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'drain'; rate: number }
  | { kind: 'shield'; amount: number };

export interface MagicEffectDef {
  effect: MagicEffect;
  /** 発動する確率 */
  chance: number;
  /** 決まり方: confirmed=確定ルール / tentative=方針・暫定 / undecided=区分が決まっていない */
  status: 'confirmed' | 'tentative' | 'undecided';
  /** 相手にかかる効果か(魔法防御で無効になる) */
  onTarget: boolean;
}

/** 古い効果コードを、新しい効果に移しかえる */
export function magicEffectOf(code: string, strongChance = 0.5): MagicEffectDef {
  const n = Number(code.replace(/^[a-z]+/, '')) || 0;
  if (code === 'none') return { effect: { kind: 'none' }, chance: 1, status: 'confirmed', onTarget: false };
  if (code === 'sleep' || code === 'freeze') return { effect: { kind: code }, chance: strongChance, status: 'confirmed', onTarget: true };
  // 毒・火傷: 古い数字(4・5・8)は使わない。最大HP5%の決まりにそろえる(企画者決定 2026-10-26)
  if (code.startsWith('poison')) return { effect: { kind: 'poison' }, chance: strongChance, status: 'confirmed', onTarget: true };
  if (code.startsWith('burn')) return { effect: { kind: 'burn' }, chance: strongChance, status: 'confirmed', onTarget: true };
  if (code.startsWith('atk')) {
    // 強い攻撃低下(−20%)は50%の案、軽い(−10%)は必ず発動の方針。−15% は区分が決まっていない(【未確定】ひとまず必ず発動)
    if (n >= 20) return { effect: { kind: 'weaken', target: 'normal', rate: n / 100 }, chance: strongChance, status: 'tentative', onTarget: true };
    if (n <= 10) return { effect: { kind: 'weaken', target: 'normal', rate: n / 100 }, chance: 1, status: 'tentative', onTarget: true };
    return { effect: { kind: 'weaken', target: 'normal', rate: n / 100 }, chance: 1, status: 'undecided', onTarget: true };
  }
  if (code.startsWith('mag')) return { effect: { kind: 'weaken', target: 'magic', rate: n / 100 }, chance: 1, status: 'undecided', onTarget: true };
  if (code.startsWith('buffatk')) return { effect: { kind: 'boost', target: 'normal', rate: n / 100 }, chance: 1, status: 'undecided', onTarget: false };
  if (code.startsWith('buffmag')) return { effect: { kind: 'boost', target: 'magic', rate: n / 100 }, chance: 1, status: 'undecided', onTarget: false };
  if (code.startsWith('heal')) return { effect: { kind: 'heal', amount: n }, chance: 1, status: 'tentative', onTarget: false };
  if (code.startsWith('drain')) return { effect: { kind: 'drain', rate: n / 100 }, chance: 1, status: 'tentative', onTarget: false };
  if (code.startsWith('shield')) return { effect: { kind: 'shield', amount: n }, chance: 1, status: 'undecided', onTarget: false };
  throw new Error(`MYTHCLASH: 知らない魔法効果コード「${code}」`);
}
