/**
 * 擬人化RPG の ロールと 技(2026-11-27 企画者「ロール 独自の 専用技」「技は あんまり 被せたくない」「1キャラずつ 完成させる」)。
 * キャラごとに「ロールの 専用技」＋「その MONZ らしい 技(似た 技は 強い ほうだけ)」を 覚える。お世話・MONZ RUMBLE の 技は 変えない。
 * Phaser に 依存しない。
 */
import { addTechRows, type TechRow } from '../battle3d/techTable';

export type Role = '剣士' | '拳闘士' | '弓矢' | '魔法使い' | '僧侶' | 'ネクロマンサー';

/** 種族の ロール(2026-11-26 企画者 OK・CROWNIE は 剣士。2026-11-27 BUNK・GRIT は 拳闘士) */
export const ROLE_OF: Record<string, Role> = {
  zipp: '剣士',
  riot: '剣士',
  crownie: '剣士',
  bunk: '拳闘士',
  grit: '拳闘士',
  snek: '弓矢',
  vybe: '弓矢',
  klak: '魔法使い',
  mofu: '僧侶',
  shellz: '僧侶',
  puni: 'ネクロマンサー',
};

/** 擬人化RPG だけの 技(企画者 OK 2026-11-27)。数字は 型と 強さから 計算【仮】 */
const RPG_ROWS: TechRow[] = [
  // BUNK(拳闘士)の 専用技
  { species: 'bunk_rpg', name: 'ジャブジャブ', type: '連続攻撃', element: '無', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '素早い 2連パンチ' },
  // 2026-11-27 企画者「スウェイなんとかって 技 分かりにくすぎる」→ アッパーカットに 替えた
  { species: 'bunk_rpg', name: 'アッパーカット', type: '連続攻撃', element: '無', strength: '中', level: 15, condition: 'なし', effect: 'ふらつき', memo: '前の 敵を 下から 打ち上げる。当たると ふらつく' },
  { species: 'bunk_rpg', name: 'ブロウクラッシュ', type: 'ビーム', element: '無', strength: '強', level: 30, condition: 'なし', effect: 'ふらつき', memo: '地面を なぐり、前へ 一直線に 衝撃が 走る' },
  { species: 'bunk_rpg', name: '闘魂チャージ', type: '強化', element: '無', strength: '中', level: 45, condition: 'なし', effect: 'なし', memo: '気合を ためて 攻撃と 速さが 上がる' },
  { species: 'bunk_rpg', name: 'ラッシュ・ザ・キング', type: '連続攻撃', element: '無', strength: '大技', level: 60, condition: 'なし', effect: 'ふらつき', memo: 'こぶしの 連打、最後に 大きな アッパー' },
  // ZIPP(剣士)の 技(2026-11-28 企画者「スキルは もう少し 剣士ぽく。ソードを 使った 技に」→ 11こ 全部 剣の 技。雷は ZIPP らしさ)【案】
  { species: 'zipp_rpg', name: '一閃', type: '連続攻撃', element: '雷', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '素早い 横斬り。当てやすい' },
  { species: 'zipp_rpg', name: '雷光斬り', type: '突進', element: '雷', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '雷を まとって 走りぬけながら 斬る' },
  { species: 'zipp_rpg', name: '飛燕三連', type: '連射', element: '雷', strength: '中', level: 10, condition: 'なし', effect: 'まひ', memo: '剣を 3回 振って、斬撃を 3つ 飛ばす' },
  { species: 'zipp_rpg', name: '疾風突き', type: 'ビーム', element: '雷', strength: '中', level: 15, condition: 'なし', effect: 'なし', memo: '前へ 一気に 踏みこんで、一直線に 突く' },
  { species: 'zipp_rpg', name: '残影連斬', type: '連続攻撃', element: '雷', strength: '中', level: 20, condition: 'なし', effect: 'なし', memo: '残像を 残しながら 4回 斬る' },
  { species: 'zipp_rpg', name: '雷鳴落とし', type: '落下', element: '雷', strength: '中', level: 25, condition: 'なし', effect: 'まひ', memo: '跳び上がって 剣を 地面に 突き立て、雷を 落とす' },
  { species: 'zipp_rpg', name: '十字斬り', type: '連続攻撃', element: '雷', strength: '強', level: 30, condition: 'なし', effect: '防御ダウン', memo: 'X の 字に 2回 斬る。当たると 敵の 守りが 下がる' },
  { species: 'zipp_rpg', name: '迅雷剣舞', type: '回転', element: '雷', strength: '強', level: 40, condition: 'なし', effect: 'まひ', memo: '剣を 振り回して 回り、まわりの 敵を 斬る' },
  { species: 'zipp_rpg', name: '剣気解放', type: '強化', element: '雷', strength: '中', level: 45, condition: 'なし', effect: 'なし', memo: '剣が 光って、しばらく 攻撃と 速さが 上がる' },
  { species: 'zipp_rpg', name: '天裂き', type: 'ビーム', element: '雷', strength: '大技', level: 60, condition: 'なし', effect: 'まひ', memo: '剣を 振り下ろして、前へ 大きな 斬撃を 飛ばす' },
  { species: 'zipp_rpg', name: '千雷一刀', type: '火柱', element: '雷', strength: '大技', level: 70, condition: 'なし', effect: 'まひ', memo: '剣を 天に かかげて 雷を 集め、ねらった 所へ 巨大な 落雷' },
];
addTechRows(RPG_ROWS);

/** 種族ごとに 覚える 技と レベル(専用技 ＋ しぼった その MONZ の 技) */
export const RPG_LEARN: Record<string, [string, number][]> = {
  bunk: [
    ['ジャブジャブ', 1],
    ['バンクバッシュ', 1],
    ['ドスンパクト', 10],
    ['アッパーカット', 15],
    ['跳ねつき連撃', 20],
    ['瞬速スピン', 25],
    ['ブロウクラッシュ', 30],
    ['剛力クラッシュ', 40],
    ['闘魂チャージ', 45],
    ['ラッシュ・ザ・キング', 60],
    ['煉獄崩拳', 70],
  ],
  // 2026-11-27 Claude の 案【案】: 剣士の 専用技 5 ＋ しぼった ZIPP の 技 6
  zipp: [
    ['一閃', 1],
    ['雷光斬り', 1],
    ['飛燕三連', 10],
    ['疾風突き', 15],
    ['残影連斬', 20],
    ['雷鳴落とし', 25],
    ['十字斬り', 30],
    ['迅雷剣舞', 40],
    ['剣気解放', 45],
    ['天裂き', 60],
    ['千雷一刀', 70],
  ],
};

/** 擬人化の 3D モデル(企画者の Tripo・軽くした もの) */
export const RPG_MODEL: Record<string, string> = { bunk: 'assets/rpg/bunk_rpg.glb', zipp: 'assets/rpg/zipp_rpg.glb' };
/** 擬人化の モデルが ある 種族(試作で 切りかえる 順) */
export const RPG_SPECIES = Object.keys(RPG_MODEL);

/** 技の 説明(擬人化RPG の 専用技は ここ・ほかは 技の 表の メモ) */
export const rpgTechDesc = (name: string): string | null => RPG_ROWS.find((r) => r.name === name)?.memo ?? null;

/** その レベルで 覚えている 技(覚える 順) */
export const rpgLearned = (species: string, level: number): string[] => (RPG_LEARN[species] ?? []).filter(([, l]) => level >= l).map(([n]) => n);

/** 技ごとの 特別な 動き【仮】: combo = 連打の 回数・finale = 最後の 一発の 倍・counter = 構えて 反撃・haste = 速さの 倍 */
export const RPG_SPECIAL: Record<string, { combo?: number; finale?: number; counter?: boolean; haste?: number; shots?: number }> = {
  ジャブジャブ: { combo: 2 },
  アッパーカット: { combo: 1, finale: 2.2 },
  闘魂チャージ: { haste: 1.25 },
  'ラッシュ・ザ・キング': { combo: 6, finale: 2.5 },
  一閃: { combo: 1 },
  十字斬り: { combo: 2 },
  剣気解放: { haste: 1.15 },
  残影連斬: { combo: 4 },
  飛燕三連: { shots: 3 },
};

/** ロールの 初めの 武器(2026-11-28 企画者「ロールに よって 武器だけは 初期の 装備」)。3D は 武器の ファイル(まだ ない 武器は なし) */
export const START_WEAPON: Record<Role, string> = {
  剣士: 'ストリートソード',
  拳闘士: 'レザーグローブ',
  弓矢: 'ショートボウ',
  魔法使い: 'ウッドスタッフ',
  僧侶: 'ウッドスタッフ',
  ネクロマンサー: 'ウッドスタッフ',
};
export const WEAPON_MODEL: Record<string, string> = { ストリートソード: 'assets/rpg/gear/w_sword1.glb' };
/** 装備の 絵(企画者の 絵。名前 → 絵) */
export const GEAR_ICON: Record<string, string> = { ストリートソード: 'assets/rpg/gear/w_sword1.webp' };
