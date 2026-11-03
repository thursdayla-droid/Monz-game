/**
 * 技の習得と装備(企画者 3D BATTLE Ver.44・2026-11-01)。Phaser に依存しない。
 * 【確定】Lv.1 の技は2つ／技はレベル・育成傾向・進化先で習得／最大4つを AI が自動で装備／装備の更新は成長イベント(レベルアップ)のとき
 * 【調整案・未確定】技枠の解放レベル(SLOT_LEVELS)・進化の形態(Lv.30・60)。企画者 2026-11-01「進化は分かれない」
 */
import type { Instinct } from '../autobattle/config';
import { speciesStats, STAT_KEYS, type StatBlock, type StatKey } from '../stats';
import type { SpeciesId } from '../species';
import { getTech, isSupportTech, learnset, type TechRow } from './techTable';

/** 【調整案】技枠: Lv.1 で2つ、Lv.10 で3つ、Lv.20 で4つ */
export const SLOT_LEVELS = [1, 1, 10, 20] as const;
export const MAX_SLOTS = 4;
export const slotsAt = (level: number): number => SLOT_LEVELS.filter((l) => level >= l).length;
/** 【調整案】形態: Lv.30 で第1進化、Lv.60 で第2進化(進化の仕組みができるまでは、レベルで決める) */
export const formAt = (level: number): 1 | 2 | 3 => (level >= 60 ? 3 : level >= 30 ? 2 : 1);

const TENDENCY: Record<string, StatKey> = { パワー寄り: 'power', タフネス寄り: 'tough', スピード寄り: 'speed', テクニック寄り: 'tech', HP寄り: 'hp' };

/**
 * 育成傾向: 種族の「ふつうの伸び方」より、いちばん多く育っている能力(1つ)。
 * いちばん高い能力ではなく、種族の伸びやすさとの差で見る(EVOLUTION.md「いちばん高いステータスだけで決めない」)
 */
export function tendency(species: string, stats: StatBlock, allowed: StatKey[] = ['power', 'tough', 'speed', 'tech', 'hp']): StatKey {
  const w = speciesStats(species as SpeciesId).weight;
  const wSum = STAT_KEYS.reduce((s, k) => s + w[k], 0) || 1;
  const sSum = STAT_KEYS.reduce((s, k) => s + stats[k], 0) || 1;
  let best: StatKey = 'power';
  let bestD = -Infinity;
  for (const k of allowed) {
    const d = stats[k] / sSum - w[k] / wSum;
    if (d > bestD + 1e-9) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** この行の条件を、今みたしているか */
function meets(row: TechRow, level: number, tend: StatKey): boolean {
  if (level < row.level) return false;
  if (row.condition === 'なし') return true;
  if (row.condition === '第1進化') return formAt(level) >= 2;
  if (row.condition === '第2進化') return formAt(level) >= 3;
  return TENDENCY[row.condition] === tend;
}

/**
 * 成長イベントで覚える技。今まで覚えた技は忘れない。
 * 育て方の条件は「そのとき」の傾向で決まる(あとで育て方を変えると、別の技も覚えられる)
 */
export function learnAt(species: string, level: number, stats: StatBlock, learned: string[] = []): string[] {
  // 育て方は、その種族の表にある「○○寄り」の中から選ぶ(表にない傾向だと、何も覚えられないため)
  const used = [...new Set(learnset(species).map((r) => TENDENCY[r.condition]).filter(Boolean))] as StatKey[];
  const tend = tendency(species, stats, used.length ? used : undefined);
  const out = [...learned];
  for (const row of learnset(species)) if (!out.includes(row.name) && meets(row, level, tend)) out.push(row.name);
  return out;
}

/**
 * AI が技を自動で装備する(プレイヤーは付けかえない)。
 * 強い技・新しい技を優先しつつ、同じ型ばかりにならないようにする。本能で好みが少し変わる【仮】
 */
export function autoEquip(species: string, learned: string[], level: number, instinct?: Instinct): string[] {
  const slots = slotsAt(level);
  const rows = learnset(species);
  const lvOf = (n: string) => rows.find((r) => r.name === n)?.level ?? 1;
  const rank = { 弱: 0, 中: 1, 強: 2, 大技: 4 } as const;
  const like = (n: string) => {
    const k = getTech(n).kind;
    if (!instinct) return 0;
    if (k === 'barrier') return instinct.defense + instinct.survival * 0.5;
    if (k === 'rush' || k === 'spin' || k === 'combo') return instinct.attack;
    if (k === 'quake' || k === 'drop' || k === 'beam') return instinct.fight;
    return instinct.counter * 0.5 + 0.25;
  };
  const chosen: string[] = [];
  const pool = [...learned];
  while (chosen.length < slots && pool.length) {
    let best = pool[0];
    let bestS = -Infinity;
    for (const n of pool) {
      const t = getTech(n);
      const same = chosen.filter((c) => getTech(c).kind === t.kind).length;
      // 育て方・進化で覚えた技は、その MONZ らしさなので優先する(2026-11-02 技が16個になり、強い技ばかり選ばれたため)
      const own = rows.find((r) => r.name === n)?.condition !== 'なし' ? 3 : 0;
      // 遠くから撃つ技が1つもなければ、1つは入れる(遠距離の選択肢。2026-11-02 ポンポンショット)
      const far = ['shot', 'barrage', 'beam'];
      const needFar = far.includes(t.kind) && !chosen.some((c) => far.includes(getTech(c).kind)) ? 1 : 0;
      // 攻撃しない技(回復・強化・守り など)ばかりにしない: 攻撃の技を2つ以上のこす(2026-11-03 MOFU の技が入って、守りと回復ばかり選ばれたため)
      const supports = chosen.filter(isSupportTech).length;
      const attacks = chosen.length - supports;
      const sup = isSupportTech(n);
      const tooMany = sup && slots >= 3 && supports >= slots - 2 ? -100 : 0;
      const needAtk = !sup && attacks < 2 ? 2 : 0;
      const s = rank[t.strength] * 2 + lvOf(n) * 0.04 + like(n) + own + needFar - same * 2.5 + tooMany + needAtk;
      if (s > bestS) {
        bestS = s;
        best = n;
      }
    }
    chosen.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  // 覚えた順(レベルの順)に並べる(ボタンの並びが急に変わらないように)
  return chosen.sort((a, b) => lvOf(a) - lvOf(b) || learned.indexOf(a) - learned.indexOf(b));
}

/** 技の記録(保存データ)。覚えた技と、装備している技 */
export interface TechState {
  learned: string[];
  equipped: string[];
  /** プレイヤーが自分で装備を決めた(2026-11-02 企画者「試合前に覚えた技から自分で4個セッティング」)。決めた後はレベルアップで勝手に変えない */
  manual?: boolean;
}

/** 自分で決めた装備をそろえる(覚えていない技・同じ技を外し、開いている枠の数まで) */
export function setEquip(learned: string[], wanted: string[], level: number): string[] {
  const out: string[] = [];
  for (const n of wanted) if (learned.includes(n) && !out.includes(n) && out.length < slotsAt(level)) out.push(n);
  return out;
}

/** 成長イベント(レベルアップ)での更新。新しく覚えた技も返す */
export function growTechs(species: string, level: number, stats: StatBlock, prev: TechState | undefined, instinct?: Instinct): { state: TechState; newly: string[] } {
  const before = prev?.learned ?? [];
  const learned = learnAt(species, level, stats, before);
  const newly = learned.filter((n) => !before.includes(n));
  // 自分で決めた装備は変えない(新しく開いた枠だけ、空いていれば足す)
  if (prev?.manual) {
    const keep = setEquip(learned, prev.equipped, level);
    for (const n of autoEquip(species, learned, level, instinct)) if (keep.length < slotsAt(level) && !keep.includes(n)) keep.push(n);
    return { state: { learned, equipped: keep, manual: true }, newly };
  }
  return { state: { learned, equipped: autoEquip(species, learned, level, instinct) }, newly };
}

/** その種族に技の表があるか(まだ表のない種族は、前の試作の技を使う) */
export const hasTechTable = (species: string): boolean => learnset(species).length > 0;
