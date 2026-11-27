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
};

/** 技の 説明(擬人化RPG の 専用技は ここ・ほかは 技の 表の メモ) */
export const rpgTechDesc = (name: string): string | null => RPG_ROWS.find((r) => r.name === name)?.memo ?? null;

/** その レベルで 覚えている 技(覚える 順) */
export const rpgLearned = (species: string, level: number): string[] => (RPG_LEARN[species] ?? []).filter(([, l]) => level >= l).map(([n]) => n);

/** 技ごとの 特別な 動き【仮】: combo = 連打の 回数・finale = 最後の 一発の 倍・counter = 構えて 反撃・haste = 速さの 倍 */
export const RPG_SPECIAL: Record<string, { combo?: number; finale?: number; counter?: boolean; haste?: number }> = {
  ジャブジャブ: { combo: 2 },
  アッパーカット: { combo: 1, finale: 2.2 },
  闘魂チャージ: { haste: 1.25 },
  'ラッシュ・ザ・キング': { combo: 6, finale: 2.5 },
};
