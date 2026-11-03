/**
 * MONZ の全キャラクター(10種族×3形態=30体)の入れ物(企画者 2026-11-01「キャラ全部いったん作っちゃおう」→「先に入れ物だけ作る」)。
 * Phaser・Three.js に依存しない。
 * - 進化は分かれない(企画者 2026-11-01)。形態: 1 = 初期形態、2 = 第1進化(Lv.30)、3 = 第2進化(Lv.60)【調整案】
 * - 名前・体の形・属性・得意は、企画者の種族の表(data/monz_species.csv)から。決まっていないものは「（未定）」
 * - 見た目(絵・3Dモデル)は企画者が用意する。こちらで描かない(CLAUDE.md)。モデルがない種族は、3Dバトルで仮のモンスターになる
 */
import { formAt } from './battle3d/techLearn';
import { ROSTER_ROWS } from './rosterData';

export interface RosterRow {
  species: string;
  form: number;
  name: string;
  body: string;
  element: string;
  favorite: string;
  memo: string;
}

export const UNDECIDED = '（未定）';
export const BODY_TYPES = ['丸い体', '四つ足', '二本足', '飛ぶ', '長い体'];
export const ELEMENTS = ['炎', '水', '自然', '雷', '光', '闇', '無'];
export const FAVORITES = ['パワー', 'タフネス', 'スピード', 'テクニック', 'HP'];

/** 3Dモデル(企画者が用意したもの。軽くしたもの)。ない種族は仮のモンスター */
export const MODEL_FILES: Record<string, string> = {
  bunk: 'assets/battle3d/bunk.glb',
  // BUNKER(BUNK の第1進化。企画者の Tripo モデル・骨入り。2026-11-03 新しいものに差しかえ)
  'bunk:2': 'assets/battle3d/bunker.glb',
  // BUNKLORD(第2進化)。2026-11-03 企画者の新しい Tripo モデルに差しかえ(骨はそろっている。前の、骨を直したモデルは unused/battle3d/)
  'bunk:3': 'assets/battle3d/bunklord.glb',
  // MOFU・MOFUR・MOFUGARD(企画者の Tripo モデル・骨入り 2026-11-03)。元は design/battle3d/mofu/
  mofu: 'assets/battle3d/mofu.glb',
  'mofu:2': 'assets/battle3d/mofur.glb',
  'mofu:3': 'assets/battle3d/mofugard.glb',
};
/** 骨がずれていて、骨を動かすと形がくずれるモデル(体全体だけで動かす)。今はなし */
export const MODEL_NO_BONES = new Set<string>();
/** 腕の攻撃の動きの大きさ(肩が高い・上着があるモデルは、大きく回すとくずれるので小さく)【仮】 */
export const MODEL_ATTACK_AMP: Record<string, number> = { bunk: 1, 'bunk:2': 0.8, 'bunk:3': 0.65 };
/** 【仮】形態ごとのゲームの中の高さ(進化すると大きくなる) */
export const MODEL_HEIGHT = [1.55, 1.8, 2.0];

/** そのレベルで使う3Dモデル(今の形態のモデルがなければ、1つ前の形態のモデル)。なければ null(仮のモンスター) */
export function modelFor(species: string, level: number): { file: string; form: number; height: number; bones: boolean; amp: number } | null {
  for (let f = formAt(level); f >= 1; f--) {
    const key = f === 1 ? species : `${species}:${f}`;
    const file = MODEL_FILES[key];
    if (file) return { file, form: f, height: MODEL_HEIGHT[f - 1], bones: !MODEL_NO_BONES.has(key), amp: MODEL_ATTACK_AMP[key] ?? 1 };
  }
  return null;
}

/** 種族の一覧(表の順) */
export const rosterSpecies = (): string[] => [...new Set(ROSTER_ROWS.map((r) => r.species))];

/** その種族・形態の行 */
export const rosterRow = (species: string, form: number): RosterRow | undefined => ROSTER_ROWS.find((r) => r.species === species && r.form === form);

/** レベルから、今の形態の行(進化の仕組みができるまではレベルで決める) */
export const formOf = (species: string, level: number): RosterRow | undefined => rosterRow(species, formAt(level));

/** 決まっているか */
export const decided = (v: string | undefined): boolean => !!v && v !== UNDECIDED;

/** 表のまちがいをさがす(テストで使う) */
export function checkRoster(rows: RosterRow[] = ROSTER_ROWS): string[] {
  const bad: string[] = [];
  for (const r of rows) {
    const at = `${r.species} 形態${r.form}`;
    if (![1, 2, 3].includes(r.form)) bad.push(`${at}: 形態は1〜3`);
    if (r.body !== UNDECIDED && !BODY_TYPES.includes(r.body)) bad.push(`${at}: 体の形「${r.body}」`);
    if (r.element !== UNDECIDED && !ELEMENTS.includes(r.element)) bad.push(`${at}: 属性「${r.element}」`);
    if (r.favorite !== UNDECIDED && !FAVORITES.includes(r.favorite)) bad.push(`${at}: 得意「${r.favorite}」`);
  }
  for (const sp of rosterSpecies()) for (const f of [1, 2, 3]) if (!rosterRow(sp, f)) bad.push(`${sp}: 形態${f}がない`);
  return bad;
}
