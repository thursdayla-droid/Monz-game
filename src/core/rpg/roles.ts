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
  { species: 'bunk_rpg', name: 'ジャブジャブ', type: '連続攻撃', element: '無', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '左右の パンチで 拳の 気弾を 2発 飛ばす。遠くの 敵にも 届く' },
  // 2026-11-27 企画者「スウェイなんとかって 技 分かりにくすぎる」→ アッパーカットに 替えた
  { species: 'bunk_rpg', name: 'アッパーカット', type: '連続攻撃', element: '無', strength: '中', level: 15, condition: 'なし', effect: 'ふらつき', memo: '下から 打ち上げる 一発。敵を 浮かせて しばらく 動けなく する' },
  { species: 'bunk_rpg', name: 'ブロウクラッシュ', type: 'ビーム', element: '無', strength: '強', level: 30, condition: 'なし', effect: 'ふらつき', memo: '地面を なぐり、前へ 一直線に 衝撃が 走る' },
  { species: 'bunk_rpg', name: '闘魂チャージ', type: '強化', element: '無', strength: '中', level: 45, condition: 'なし', effect: 'なし', memo: '気合を ためて 攻撃と 速さが 上がる。ふつうの 攻撃の 3段めで 衝撃波が 出る' },
  { species: 'bunk_rpg', name: 'ラッシュ・ザ・キング', type: '連続攻撃', element: '無', strength: '大技', level: 60, condition: 'なし', effect: 'ふらつき', memo: 'こぶしの 連打、最後に 大きな アッパー' },
  // ZIPP(剣士)の 技(2026-11-28 企画者「スキルは 剣士ぽく」→ 同じ日「拳闘士と 技が 一緒すぎる(見た目・動き・中身)」→ 剣士だけの 動き方に 作り直し)【案】
  { species: 'zipp_rpg', name: '一閃', type: '連続攻撃', element: '雷', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '剣を 大きく 振って、前の 広い 範囲を まとめて 斬る' },
  { species: 'zipp_rpg', name: '雷光斬り', type: '突進', element: '雷', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '敵の 間を 一瞬で 走りぬけ、通った 敵を ぜんぶ 斬る' },
  { species: 'zipp_rpg', name: '瞬歩斬り', type: '突進', element: '雷', strength: '中', level: 5, condition: 'なし', effect: 'なし', memo: 'ねらった 敵の 前まで 一瞬で 踏みこんで、そのまま 斬る' },
  { species: 'zipp_rpg', name: '飛燕三連', type: '連射', element: '雷', strength: '中', level: 10, condition: 'なし', effect: 'まひ', memo: '剣を 振って、三日月の 斬撃を 3つ 飛ばす' },
  { species: 'zipp_rpg', name: '疾風突き', type: 'ビーム', element: '雷', strength: '中', level: 15, condition: 'なし', effect: 'なし', memo: '一歩 踏みこんで まっすぐ 突く。並んだ 敵を つらぬいて 遠くへ 飛ばす' },
  { species: 'zipp_rpg', name: '残影連斬', type: '連続攻撃', element: '雷', strength: '中', level: 20, condition: 'なし', effect: 'なし', memo: 'ねらった 敵の まわりに 残像が 出て、4回 斬りつける' },
  { species: 'zipp_rpg', name: '雷鳴落とし', type: '落下', element: '雷', strength: '中', level: 25, condition: 'なし', effect: 'まひ', memo: '跳び上がって 剣を 地面に 突き立て、雷を 落とす' },
  { species: 'zipp_rpg', name: '十字斬り', type: '連続攻撃', element: '雷', strength: '強', level: 30, condition: 'なし', effect: '防御ダウン', memo: 'はなれた 敵の 場所に X の 字の 斬撃を 刻む。当たると 守りが 下がる' },
  { species: 'zipp_rpg', name: '居合・雷切', type: '連続攻撃', element: '雷', strength: '強', level: 40, condition: 'なし', effect: 'まひ', memo: '剣を 構えて ためて、一瞬で 大きく 斬りはらう。とても 強い 一撃' },
  { species: 'zipp_rpg', name: '剣気解放', type: '強化', element: '雷', strength: '中', level: 45, condition: 'なし', effect: 'なし', memo: 'しばらく 攻撃が 上がり、ふつうの 攻撃でも 小さな 斬撃が 飛ぶ' },
  { species: 'zipp_rpg', name: '天裂き', type: '連射', element: '雷', strength: '大技', level: 60, condition: 'なし', effect: 'まひ', memo: '剣を 振り下ろして、敵を つらぬいて 進む 巨大な 斬撃を 飛ばす' },
  { species: 'zipp_rpg', name: '千雷一刀', type: '火柱', element: '雷', strength: '大技', level: 70, condition: 'なし', effect: 'まひ', memo: '剣を 天に かかげて 雷を 呼び、まわりの 敵 1体ずつに 近い 順で 雷を 落とす' },
  // SNEK(弓矢)の 専用技(2026-11-28 企画者「他の キャラの 技とか ロールの 動き 確認」→ SNEK から・今までと 同じ 形)【案】
  { species: 'snek_rpg', name: 'ダブルショット', type: '連射', element: '闇', strength: '弱', level: 1, condition: 'なし', effect: 'なし', memo: '矢を 2本 いっしょに 撃つ' },
  { species: 'snek_rpg', name: 'アローレイン', type: '火柱', element: '闇', strength: '中', level: 20, condition: 'なし', effect: 'どく', memo: 'ねらった 所に 毒の 矢を 雨の ように ふらせる' },
  { species: 'snek_rpg', name: 'チャージショット', type: 'ビーム', element: '闇', strength: '強', level: 30, condition: 'なし', effect: 'なし', memo: 'ボタンを 押して いる 間 弓を 引きしぼる。はなすと 敵を つらぬく 大きな 矢' },
  { species: 'snek_rpg', name: '鷹の目', type: '強化', element: '無', strength: '中', level: 45, condition: 'なし', effect: 'なし', memo: 'しばらく 攻撃が 上がり、ふつうの 矢が 敵を つらぬく' },
  { species: 'snek_rpg', name: '千本矢', type: '連射', element: '闇', strength: '大技', level: 60, condition: 'なし', effect: 'どく', memo: '前に 広く 9本の 毒矢を いっきに 放つ' },
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
    ['瞬歩斬り', 5],
    ['飛燕三連', 10],
    ['疾風突き', 15],
    ['残影連斬', 20],
    ['雷鳴落とし', 25],
    ['十字斬り', 30],
    ['居合・雷切', 40],
    ['剣気解放', 45],
    ['天裂き', 60],
    ['千雷一刀', 70],
  ],
  // 2026-11-28 Claude の 案【案】: 弓矢の 専用技 5 ＋ しぼった SNEK の 技 5
  snek: [
    ['毒牙', 1],
    ['ダブルショット', 1],
    ['影すべり', 10],
    ['毒のしずく', 15],
    ['アローレイン', 20],
    ['見切りの影', 25],
    ['チャージショット', 30],
    ['鷹の目', 45],
    ['千本矢', 60],
    ['蛇行黒閃', 70],
  ],
};

/** 擬人化の 3D モデル(企画者の Tripo・軽くした もの) */
// snek は 3D が まだ ない ので ZIPP の 体を 借りる【仮】(2026-11-28 企画者「今 できて いるの 仮で 使って」)
export const RPG_MODEL: Record<string, string> = { bunk: 'assets/rpg/bunk_rpg.glb', zipp: 'assets/rpg/zipp_rpg.glb', snek: 'assets/rpg/zipp_rpg.glb' };
/** 擬人化の モデルが ある 種族(試作で 切りかえる 順) */
export const RPG_SPECIES = Object.keys(RPG_MODEL);

/** 擬人化での 説明(MONZ の 技を 擬人化で 使う ときの 中身) */
const RPG_DESC: Record<string, string> = {
  バンクバッシュ: '肩から 体当たり。ぶつかった 敵を 大きく ふき飛ばす',
  ドスンパクト: '跳び上がって 地面を 踏みつけ、まわりの 敵を ふらつかせる',
  跳ねつき連撃: '前へ 跳ねながら 3回 なぐる。1回ごとに 前へ 進む',
  瞬速スピン: '雷を まとって 回りながら フックを 2回。まわりの 敵 ぜんぶに 当たる',
  剛力クラッシュ: 'ボタンを 押して いる 間 力を ためる。はなすと 重い ストレート。ためきると 炎の 衝撃波が 前へ 飛ぶ',
  煉獄崩拳: '地面を なぐって、ねらった 所に 炎の 柱を 立てる',
  // SNEK(弓矢)
  毒牙: '毒を ぬった 矢を 1本 撃つ。当たると どくに なる ことが ある',
  影すべり: '後ろへ すべって 下がり ながら 矢を 3本 撃つ',
  毒のしずく: '毒の 矢を 地面に 撃ちこみ、しばらく 毒の 場を つくる',
  見切りの影: 'かまえて、攻撃 されたら よけて 反撃 する',
  蛇行黒閃: '黒い 光の 矢を 放ち、まっすぐ 前の 敵を ぜんぶ つらぬく',
};
/** 技の 説明(擬人化RPG の 専用技は ここ・ほかは 技の 表の メモ) */
export const rpgTechDesc = (name: string): string | null => RPG_DESC[name] ?? RPG_ROWS.find((r) => r.name === name)?.memo ?? null;

/** その レベルで 覚えている 技(覚える 順) */
export const rpgLearned = (species: string, level: number): string[] => (RPG_LEARN[species] ?? []).filter(([, l]) => level >= l).map(([n]) => n);

/** 技ごとの 特別な 動き【仮】: combo = 連打の 回数・finale = 最後の 一発の 倍・counter = 構えて 反撃・haste = 速さの 倍 */
/** 剣士の 技の 動き方(拳闘士と ちがう 中身): arc 広く 斬る・through 走りぬけ・thrust 突き・flurry ねらった 敵に 連続・xcut はなれた 所に X・iai ため斬り・wave つらぬく 斬撃・storm まわり 全部に 落雷 */
/** 弓矢の 動き方: arrow1 矢 1本・volley 何本も 扇に・backstep 下がり ながら 撃つ・rain 矢の 雨・charged 引きしぼって 大きな 矢 */
export type SwordMove = 'tackle' | 'stomp' | 'upper' | 'hopcombo' | 'spinhook' | 'heavy' | 'jabs' | 'arc' | 'dashcut' | 'through' | 'thrust' | 'flurry' | 'xcut' | 'iai' | 'wave' | 'storm' | 'arrow1' | 'volley' | 'backstep' | 'rain' | 'charged';
export const RPG_SPECIAL: Record<string, { combo?: number; finale?: number; counter?: boolean; haste?: number; shots?: number; move?: SwordMove; windup?: number; swordWave?: boolean; fistShock?: boolean; charge?: boolean; hawk?: boolean }> = {
  // 拳闘士(BUNK)の 技(2026-11-28 企画者「まずは 拳闘士 直して いこう」→ 剣士と 同じく 技ごとに ちがう 中身・動き・見た目)【案】
  ジャブジャブ: { move: 'jabs', windup: 0.08 },
  バンクバッシュ: { move: 'tackle' },
  ドスンパクト: { move: 'stomp', windup: 0.35 },
  アッパーカット: { move: 'upper', windup: 0.25 },
  跳ねつき連撃: { move: 'hopcombo' },
  瞬速スピン: { move: 'spinhook' },
  剛力クラッシュ: { move: 'heavy', windup: 0.15, charge: true },
  闘魂チャージ: { haste: 1.25, fistShock: true },
  'ラッシュ・ザ・キング': { combo: 6, finale: 2.5 },
  一閃: { move: 'arc', windup: 0.12 },
  雷光斬り: { move: 'through' },
  瞬歩斬り: { move: 'dashcut' },
  飛燕三連: { shots: 3 },
  疾風突き: { move: 'thrust', windup: 0.2 },
  残影連斬: { move: 'flurry', combo: 4 },
  十字斬り: { move: 'xcut', windup: 0.3 },
  '居合・雷切': { move: 'iai', windup: 0.7 },
  剣気解放: { swordWave: true },
  天裂き: { move: 'wave', windup: 0.45 },
  千雷一刀: { move: 'storm', windup: 0.6 },
  // 弓矢(SNEK)【案】
  毒牙: { move: 'arrow1', windup: 0.12 },
  ダブルショット: { move: 'volley', shots: 2, windup: 0.1 },
  影すべり: { move: 'backstep', windup: 0.05 },
  アローレイン: { move: 'rain', windup: 0.3 },
  見切りの影: { counter: true },
  チャージショット: { move: 'charged', windup: 0.12, charge: true },
  鷹の目: { hawk: true },
  千本矢: { move: 'volley', shots: 9, windup: 0.35 },
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
/**
 * ロールの 武器(弱い 順)。2026-11-28 企画者「ステージ10 までは 下位の 武器しか 落ちない。剣士で いうと ストリートソードと 鉄骨ブレードの 2種類」
 * → 1〜10階で 落ちるのは はじめの 2つ・11階から 5つ ぜんぶ【仮】
 */
const STAFFS = ['ウッドスタッフ', 'ランタンロッド', 'クリスタルロッド', '時計塔の杖', 'ほうき星の杖'];
export const WEAPON_LIST: Record<Role, string[]> = {
  剣士: ['ストリートソード', '鉄骨ブレード', 'ネオンレイピア', 'ムーンエッジ', '雷刃'],
  // 2026-11-28 企画者「一緒の 感じ やめよう」→ 武器ごとに 雰囲気を 変えた 名前で 決定(「良いね」)
  拳闘士: ['レザーグローブ', 'スパイクナックル', 'ボクサーラップ', 'ブルドッグガントレット', 'キングフィスト'],
  弓矢: ['ショートボウ', 'ハンターボウ', 'ツインアロー', 'ファルコンボウ', '流星弓'],
  魔法使い: STAFFS,
  僧侶: STAFFS,
  ネクロマンサー: STAFFS,
};
/**
 * ガチャ だけで 出る 特別な 武器(2026-11-28 企画者「炎と 闇の 武器・各ロールに 作る・ガチャで しか 出ない・確率は 低い・ランクも ある・強くて カッコいい」)。
 * 名前は【仮】。弓矢・杖は まだ【未確定】(ロールが 動く ように なってから)。敵や 置き物からは 落ちない
 */
export const GACHA_WEAPONS: Record<Role, string[]> = {
  剣士: ['紅蓮剣', '黒影刃'],
  拳闘士: ['爆炎ナックル', '冥王の拳'],
  弓矢: [],
  魔法使い: [],
  僧侶: [],
  ネクロマンサー: [],
};
/** ガチャで 特別な 武器が 出る 確率【仮】(ガチャの 画面は まだ ない) */
export const GACHA_WEAPON_RATE = 0.01;
/** グローブ(拳闘士の 武器)か */
export const isGlove = (name: string): boolean => WEAPON_LIST.拳闘士.includes(name) || GACHA_WEAPONS.拳闘士.includes(name);
/** ガチャの 武器か */
export const isGachaWeapon = (name: string): boolean => Object.values(GACHA_WEAPONS).some((l) => l.includes(name));
/** 下位の 武器の 数・下位 だけが 落ちる 階 */
export const WEAPON_LOW = { count: 2, untilFloor: 10 };
export const WEAPON_MODEL: Record<string, string> = { ストリートソード: 'assets/rpg/gear/w_sword1.glb', 鉄骨ブレード: 'assets/rpg/gear/w_sword2.glb' };
/** 3D の 武器の 手に 持つ 長さの 倍(ふつう 1)。鉄骨ブレードは 大きな 剣 */
export const WEAPON_MODEL_LEN: Record<string, number> = { 鉄骨ブレード: 1.25 };
/** 装備の 絵(企画者の 絵。名前 → 絵) */
export const GEAR_ICON: Record<string, string> = { ストリートソード: 'assets/rpg/gear/w_sword1.webp', 鉄骨ブレード: 'assets/rpg/gear/w_sword2.webp', ネオンレイピア: 'assets/rpg/gear/w_sword3.webp' };
/** 武器ごとの 通常攻撃の 範囲の ちがい(ロールの ふつうに 足す)【仮】。ストリートソード・レザーグローブ = ふつう */
export const WEAPON_REACH: Record<string, { range: number; arc: number }> = {
  ストリートソード: { range: 0, arc: 0 },
  鉄骨ブレード: { range: 0.4, arc: 0.15 },
  ネオンレイピア: { range: 0.6, arc: -0.25 },
  ムーンエッジ: { range: 0, arc: 0.5 },
  雷刃: { range: 0.1, arc: 0.05 },
  レザーグローブ: { range: 0, arc: 0 },
  // 拳闘士(ボクサー = 連打が 速い は【未実装】)
  スパイクナックル: { range: 0, arc: 0.05 },
  ボクサーラップ: { range: -0.1, arc: 0 },
  ブルドッグガントレット: { range: 0.1, arc: 0.45 },
  キングフィスト: { range: 0.35, arc: 0.1 },
  紅蓮剣: { range: 0.4, arc: 0.2 },
  黒影刃: { range: 0.45, arc: 0.1 },
  爆炎ナックル: { range: 0.3, arc: 0.2 },
  冥王の拳: { range: 0.35, arc: 0.15 },
  // 杖(クリスタル = ためが 速い・弓の 特徴は ロールが 動くように なってから【未実装】)
  ウッドスタッフ: { range: 0, arc: 0 },
  ランタンロッド: { range: 0.3, arc: 0 },
  クリスタルロッド: { range: 0, arc: 0 },
  時計塔の杖: { range: 0, arc: 0.45 },
  ほうき星の杖: { range: 0.15, arc: 0.1 },
};
/** 武器ごとの 攻撃の 上がり方の 倍(ふつう = 1)【仮】。スパイクナックル = 一発が 重い */
export const WEAPON_POWER: Record<string, number> = { スパイクナックル: 1.5, キングフィスト: 1.3, ほうき星の杖: 1.4, 鉄骨ブレード: 1.1, 紅蓮剣: 1.7, 黒影刃: 1.6, 爆炎ナックル: 1.7, 冥王の拳: 1.6 };
/**
 * 武器ごとの 通常攻撃の 打ち方(2026-11-28 企画者 OK)。ランクでは 変わらない【仮】
 * cool = 次を 打てる までの 倍・hits = 何段 まで 続くか(ふつう 3)・knock = 敵を 押す 強さ・last = さいごの 一撃・color = 光の 色
 */
export interface WeaponStyle {
  thrust?: boolean;
  cool?: number;
  hits?: number;
  knock?: number;
  last?: 'slam' | 'pierce' | 'spin' | 'bolt' | 'bleed' | 'upper' | 'quake' | 'wave' | 'flamewave' | 'shadow' | 'eruption' | 'abyss';
  /** 1発ごとの おまけ: burn = やけど・blast = 小さな 爆発・drain = HP を すう */
  every?: 'burn' | 'blast' | 'drain';
  color: number;
}
export const WEAPON_STYLE: Record<string, WeaponStyle> = {
  ストリートソード: { color: 0xfff0d8 },
  鉄骨ブレード: { cool: 1.25, knock: 3, last: 'slam', color: 0xff9a3a },
  // 2026-11-28 企画者「1発め 2発めも 切れなくて 良い。真っ直ぐ だけ」→ ぜんぶ 突き(細く 長く まっすぐ)
  ネオンレイピア: { thrust: true, cool: 0.8, last: 'pierce', color: 0xff4ae8 }, // 色は 企画者の 絵(ネオンの ピンク・2026-11-28)
  ムーンエッジ: { last: 'spin', color: 0xc8d8ff },
  雷刃: { last: 'bolt', color: 0xffe24a },
  レザーグローブ: { color: 0xfff0d8 },
  スパイクナックル: { cool: 1.15, last: 'bleed', color: 0xff4a4a },
  ボクサーラップ: { cool: 0.7, hits: 4, last: 'upper', color: 0xa8ff5a },
  ブルドッグガントレット: { knock: 6, last: 'quake', color: 0xb8b8c8 },
  キングフィスト: { last: 'wave', color: 0xffd23a },
  // ガチャの 武器(炎・闇)【仮】
  紅蓮剣: { every: 'burn', last: 'flamewave', color: 0xff5a1a },
  黒影刃: { every: 'drain', cool: 0.9, last: 'shadow', color: 0xa05aff },
  爆炎ナックル: { every: 'blast', last: 'eruption', color: 0xff6a1a },
  冥王の拳: { every: 'drain', knock: 2, last: 'abyss', color: 0x9a4aff },
};
/** ためる 技か(押して いる 間 ためる) */
export const isChargeTech = (name: string): boolean => !!RPG_SPECIAL[name]?.charge;
