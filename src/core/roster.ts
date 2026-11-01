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
};

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
