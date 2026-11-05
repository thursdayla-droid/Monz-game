/**
 * 3Dバトルの技を「型 ＋ 属性 ＋ 強さ」から作る(企画者 2026-11-01「お願いします」・docs/TECH_TYPES.md)。
 * 企画者の技の表(data/monz_techs.csv → techData.ts)の1行が、1つの技になる。数字は表に書かず、型と強さから計算する。
 * 型・強さの数字はすべて【仮】(30体の総当たりの自動テストで調整する)。
 */
import { TECHS, type Element, type Tech, type TechKind } from './animeConfig';
import { TECH_ROWS } from './techData';

/** 表の1行 */
export interface TechRow {
  species: string;
  name: string;
  type: string;
  element: string;
  strength: string;
  level: number;
  condition: string;
  effect: string;
  memo: string;
  /** 相手を浮かせるか(true: 浮かせる・false: 浮かせない・なし: 型の ふつう)(2026-11-05 新しい5体) */
  lift?: boolean;
}

/** 技の型(表の「型」)→ 計算での種類。【仮】まだ作っていない型は null(表に書くとテストで分かる) */
export const TYPE_KIND: Record<string, TechKind | null> = {
  突進: 'rush',
  弾: 'shot',
  連射: 'barrage',
  ビーム: 'beam',
  衝撃波: 'quake',
  落下: 'drop',
  設置: 'field',
  火柱: 'pillar',
  連続攻撃: 'combo',
  回転: 'spin',
  守り: 'barrier',
  回復: 'heal',
  強化: 'buff',
  弱体: 'debuff',
  吸収: 'drain',
};

export const ELEMENTS: Element[] = ['炎', '水', '自然', '雷', '光', '闇', '無'];
export const STRENGTHS = ['弱', '中', '強', '大技'] as const;
export type Strength = (typeof STRENGTHS)[number];
export const CONDITIONS = ['なし', 'パワー寄り', 'タフネス寄り', 'スピード寄り', 'テクニック寄り', 'HP寄り', '第1進化', '第2進化'] as const;
/** 追加効果。今動くのは ふらつき・まひ・攻撃ダウン(弱体)・遅くする(設置)・やけど・どく・ねむり・防御ダウン(2026-11-03)。こおりは まだ効かない */
export const EFFECTS = ['なし', 'やけど', 'まひ', 'こおり', 'どく', 'ねむり', 'ふらつき', '遅くする', '攻撃ダウン', '防御ダウン'] as const;
export type Effect = (typeof EFFECTS)[number];

/** 型ごとの「中」の強さの数字【仮】。威力 × 当たりやすさ ÷ 待ち時間 が、だいたいそろうように */
const BASE: Record<TechKind, Omit<Tech, 'name' | 'element' | 'kind'>> = {
  rush: { power: 13, cooldown: 3.5, windup: 0.25, recovery: 0.4, speed: 13, range: 9, size: 1.0, duration: 0, launch: 5, knock: 4 },
  spin: { power: 11, cooldown: 3.5, windup: 0.25, recovery: 0.35, speed: 10, range: 10, size: 1.0, duration: 1.1, launch: 0, knock: 4 },
  shot: { power: 12.5, cooldown: 2.8, windup: 0.3, recovery: 0.25, speed: 17, range: 20, size: 0.6, duration: 0, launch: 0, knock: 3 },
  barrage: { power: 5, cooldown: 3.5, windup: 0.3, recovery: 0.3, speed: 16, range: 20, size: 0.4, duration: 0, launch: 0, knock: 1.2 },
  beam: { power: 16, cooldown: 5.5, windup: 0.65, recovery: 0.45, speed: 0, range: 22, size: 0.6, duration: 0.5, launch: 4, knock: 6 },
  quake: { power: 13, cooldown: 5, windup: 0.4, recovery: 0.45, speed: 9, range: 6, size: 0.6, duration: 0, launch: 6, knock: 3 },
  drop: { power: 16, cooldown: 5.5, windup: 0.35, recovery: 0.5, speed: 0, range: 12, size: 2.4, duration: 0, launch: 6, knock: 3 },
  combo: { power: 14, cooldown: 4.5, windup: 0.2, recovery: 0.4, speed: 12, range: 7, size: 1.0, duration: 0.15, launch: 4, knock: 2 },
  // 2026-11-02 追加(威圧ロア・重力プレス)【案・未承認】
  debuff: { power: 0, cooldown: 8, windup: 0.6, recovery: 0.4, speed: 10, range: 7, size: 0, duration: 0, launch: 0, knock: 0 },
  // 設置の power は「場の中にいる間、1秒ごとのダメージ」(2026-11-03 企画者「重力プレスにもダメージを少し」)【案】
  field: { power: 2.5, cooldown: 7, windup: 0.45, recovery: 0.45, speed: 0, range: 14, size: 3.2, duration: 0, launch: 0, knock: 0 },
  // 通常攻撃(パンチ。animeConfig の TECHS.punch。表の技には使わない)
  jab: { power: 7, cooldown: 0.5, windup: 0.06, recovery: 0.16, speed: 0, range: 1.9, size: 0.9, duration: 0.14, launch: 0, knock: 2 },
  // 2026-11-02 火柱(地面から柱が出る。相手の足もと＋まわり3本・当たるのは1回)【案・未承認】
  pillar: { power: 16, cooldown: 6, windup: 0.5, recovery: 0.5, speed: 0, range: 14, size: 1.0, duration: 0, launch: 7, knock: 2 },
  // 2026-11-03 MOFU の技(技リスト案と同じ数字)【案】。回復の power = 最大HPの何%・強化の power = 何%上がるか(duration 秒)・吸収は弾のように飛んで当てた分の半分を回復
  heal: { power: 18, cooldown: 10, windup: 0.6, recovery: 0.2, speed: 0, range: 0, size: 0, duration: 0.8, launch: 0, knock: 0 },
  buff: { power: 20, cooldown: 12, windup: 0.4, recovery: 0.2, speed: 0, range: 0, size: 0, duration: 6, launch: 0, knock: 0 },
  drain: { power: 10, cooldown: 4.5, windup: 0.4, recovery: 0.25, speed: 14, range: 8, size: 0.8, duration: 0, launch: 0, knock: 2 },
  barrier: { power: 0, cooldown: 7, windup: 0.15, recovery: 0.2, speed: 0, range: 0, size: 1.7, duration: 2.0, launch: 0, knock: 0 },
};

/** 強さ → 数字の倍率【仮】 */
const MUL: Record<Strength, { power: number; cooldown: number; windup: number; area: number }> = {
  弱: { power: 0.75, cooldown: 0.75, windup: 0.85, area: 0.9 },
  中: { power: 1, cooldown: 1, windup: 1, area: 1 },
  強: { power: 1.35, cooldown: 1.35, windup: 1.15, area: 1.15 },
  大技: { power: 2.2, cooldown: 3.2, windup: 1.6, area: 1.6 },
};

/** 追加効果が付く確率【仮】 */
export const EFFECT_CHANCE: Record<Strength, number> = { 弱: 0.35, 中: 0.5, 強: 0.6, 大技: 0.85 };

/** 表の技(型・強さから数字を計算したもの)。追加効果と強さも持つ */
export interface TableTech extends Tech {
  strength: Strength;
  effect: Effect;
  /** 連続攻撃の回数 */
  hits: number;
}

/** 技ごとの 待ち時間の 倍率(強すぎる技を 調整)【仮】 */
const CD_MUL: Record<string, number> = {
  // 2026-11-05 企画者「シェルズ甲羅タイフーンもう少しクールタイムあっていい。強すぎる」
  甲羅タイフーン: 1.8,
  // 2026-11-05 企画者「スネーク螺旋牙のクールタイムも長くして」
  螺旋牙: 1.8,
};

export function buildTech(row: TechRow): TableTech {
  const kind = TYPE_KIND[row.type];
  if (!kind) throw new Error(`まだ作っていない型: ${row.type}(${row.name})`);
  const st = row.strength as Strength;
  const m = MUL[st];
  const base = BASE[kind];
  return {
    ...base,
    name: row.name,
    element: row.element as Element,
    kind,
    power: base.power * m.power,
    cooldown: base.cooldown * m.cooldown * (CD_MUL[row.name] ?? 1),
    windup: base.windup * m.windup,
    range: base.range * (kind === 'quake' || kind === 'drop' ? m.area : 1),
    size: base.size * (kind === 'beam' || kind === 'drop' || kind === 'barrier' || kind === 'shot' || kind === 'field' || kind === 'pillar' ? m.area : 1),
    duration: base.duration * (kind === 'barrier' ? m.area : 1),
    launch: row.lift === false ? 0 : row.lift === true ? Math.max(5, base.launch) * (st === '大技' ? 1.3 : 1) : base.launch * (st === '大技' ? 1.3 : 1),
    knock: base.knock * (st === '強' ? 1.2 : st === '大技' ? 1.5 : 1),
    strength: st,
    effect: row.effect as Effect,
    hits: kind === 'combo' ? (st === '弱' ? 2 : st === '中' ? 3 : 4) : 1,
  };
}

/** 表の行のまちがいをさがす(テストで使う)。まちがいの説明の一覧を返す */
export function checkRows(rows: TechRow[] = TECH_ROWS): string[] {
  const bad: string[] = [];
  const names = new Map<string, TechRow>();
  for (const r of rows) {
    const at = `${r.species} ${r.name}`;
    if (!(r.type in TYPE_KIND)) bad.push(`${at}: 型「${r.type}」は一覧にない`);
    if (!ELEMENTS.includes(r.element as Element)) bad.push(`${at}: 属性「${r.element}」`);
    if (!STRENGTHS.includes(r.strength as Strength)) bad.push(`${at}: 強さ「${r.strength}」`);
    if (!(CONDITIONS as readonly string[]).includes(r.condition)) bad.push(`${at}: 条件「${r.condition}」`);
    if (!(EFFECTS as readonly string[]).includes(r.effect)) bad.push(`${at}: 追加効果「${r.effect}」`);
    if (!(r.level >= 1 && r.level <= 100)) bad.push(`${at}: レベル ${r.level}`);
    if (r.strength === '大技' && r.condition !== '第2進化') bad.push(`${at}: 大技は第2進化の技だけ`);
    const same = names.get(r.name);
    if (same && (same.type !== r.type || same.element !== r.element || same.strength !== r.strength)) bad.push(`${at}: 同じ名前で中身がちがう`);
    names.set(r.name, r);
  }
  for (const sp of new Set(rows.map((r) => r.species))) {
    const lv1 = rows.filter((r) => r.species === sp && r.level === 1 && r.condition === 'なし');
    if (lv1.length !== 2) bad.push(`${sp}: Lv.1 の技は2つ(今 ${lv1.length}つ)`);
  }
  return bad;
}

const TABLE = new Map<string, TableTech>();
for (const r of TECH_ROWS) if (TYPE_KIND[r.type] && !TABLE.has(r.name)) TABLE.set(r.name, buildTech(r));

/** 自分の まわりに置く場(中にいると自分が回復・守られる)の技(2026-11-03 MOFU) */
export const SELF_FIELD_TECHS = new Set(['千花天幕']);

/** 攻撃しない技(回復・強化・守り・弱体・自分の場) */
export const isSupportTech = (id: string): boolean => ['heal', 'buff', 'barrier', 'debuff'].includes(getTech(id).kind) || SELF_FIELD_TECHS.has(id);

/** 技の id(= 技の名前)から、技の数字を出す。前の試作の4つ(dash など)も使える */
/**
 * 技の名前を かえた時の 前の名前 → 今の名前(2026-11-05 企画者「全部カタカナも変なので、バランスよく漢字に」「技の名前は任せます」)。
 * 前の名前で 保存された 技も 読めるように(lifeSave の fixTechs・getTech で 使う)
 */
export const TECH_RENAME: Record<string, string> = {
  火花爪: '火花',
  万象ぷにドーム: '万象ねむりぷに玉',
  王者の牙: '王者の爪',
  ハネツキラッシュ: '跳ねつき連撃',
  ゴウリキクラッシュ: '剛力クラッシュ',
  ガンジョウドーム: '頑丈ドーム',
  シュンソクスピン: '瞬速スピン',
  ネライウチバースト: '狙い撃ちバースト',
  バウンドプレス: '跳躍プレス',
  ブレイクロア: '威圧ロア',
  グラビティプレス: '重力プレス',
  テンチゴウサイ: '天地轟砕',
  レンゴクホウケン: '煉獄崩拳',
  クイックリープ: '跳雷リープ',
  スパークレイン: '雷針スパーク',
  ライトレール: '光軌レール',
  ビッグぷにプレス: '大ぷにプレス',
  バウンドウェーブ: 'ぽよん三重波',
  エナジーぷにドレイン: 'ぷに触手ドレイン',
  ぷにぷにウォール: 'ぷにぷに防壁',
  クラップタックル: '横這いタックル',
  スナップラッシュ: '挟撃スナップ',
  ロックオンライン: '照準ライン',
  ヘビークラッシュ: '重甲クラッシュ',
  クランプシェル: '鋏盾クランプ',
  クイッククランプ: '背面クランプ',
  クロスワイヤー: '十字ワイヤー',
  ディレイボム: '時限ボム',
  アーマーブレイク音波: '装甲砕き音波',
  スナイプライン: '狙撃ライン',
  トラップチェイン: '連鎖トラップ',
};
export const renameTech = (name: string): string => TECH_RENAME[name] ?? name;

export function getTech(id: string): TableTech {
  const t = TABLE.get(renameTech(id));
  if (t) return t;
  const old = (TECHS as Record<string, Tech>)[id];
  if (old) return { ...old, strength: '中', effect: 'なし', hits: 1 };
  throw new Error(`技がない: ${id}`);
}

/** 技の説明(表の メモから、日付や 決めた時の メモ「（…）」を のぞいた 文) */
export function techDesc(name: string): string {
  const r = TECH_ROWS.find((x) => x.name === renameTech(name));
  if (!r) return '';
  return r.memo.replace(/[（(][^（）()]*(20\d\d|企画者|案|仮)[^（）()]*[）)]/g, '').replace(/【[^】]*】/g, '').trim();
}

/** その種族の表の行(覚えるレベルの順) */
export const learnset = (species: string): TechRow[] => TECH_ROWS.filter((r) => r.species === species).sort((a, b) => a.level - b.level);
