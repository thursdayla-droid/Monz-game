import type { Level } from './ai';

/**
 * MAHJONG QUEST の ステージ(2026-11-09 企画者「5ステージ 作りたい。5ステージ目 クリアしたら 2周目」)。
 * - 敵は ステージごとに ぜんぶ ちがう(企画者 2026-11-09)。1 オオカミ団・2 ノラネコ団・3 ワニ団・4 ゴリラ団(2〜4 は Claude に 任せる)・5 は 人間3人(企画者が こだわって 決める)。
 *   2〜5 の 絵は まだ【仮：絵が 届くまで オオカミの まま(色ちがいは 変に 見えたので やめた 2026-11-09)】
 * - 敵の HP は 30,000 / 50,000 / 60,000 / 80,000 / 100,000(企画者 2026-11-09)
 * - CPU の 強さは ステージごとに 上がる・2周目は さらに +1【仮】
 * - 勝ちの ゴールド 200 / 250 / 300 / 350 / 500G・2周目は 1.5倍(企画者 2026-11-09 OK)
 * - 話は Claude に 任せる(企画者 2026-11-09)
 */
export interface StageInfo {
  /** 敵の 一味の 名前【仮】 */
  name: string;
  /** 1枚絵の 話(改行あり)【仮】 */
  story: string;
  enemyHp: number;
  /** CPU の 強さ(子分A・ボス・子分B) */
  levels: [Level, Level, Level];
  gold: number;
  /** 敵の 絵(public/assets/mahjong/chars/<名前>.webp)。boss, minionA, minionB */
  art: { boss: string; minionA: string; minionB: string };
  /** 対局の 背景(public/assets/mahjong/bg/<名前>.webp。横長)。ない 時は 色の 背景 */
  bg?: string;
  /** (使わない)絵が まだの 時の 色ちがい。企画者「敵の 色 へん」で やめた 2026-11-09 */
  tint?: number;
}

const WOLVES = { boss: 'boss', minionA: 'minion_a', minionB: 'minion_b' };

export const STAGES: readonly StageInfo[] = [
  {
    name: 'オオカミ団',
    story: '牌の 強さで すべてが 決まる 街。\nゴロツキの オオカミ団が 街を 乗っとった！\nぼろぼろの 勇者が 牌を にぎって 立ちあがる。',
    enemyHp: 30000,
    levels: [1, 2, 1],
    gold: 200,
    art: WOLVES,
    // 2026-11-09 企画者の 背景(夜の 路地裏)
    bg: 'stage1',
  },
  {
    name: 'ノラネコ団',
    story: 'オオカミ団を やぶった 勇者。\n次に 現れたのは、裏通りを しきる ノラネコ団。\n「ニャンだ おまえ？ 牌で しょうぶニャ！」',
    enemyHp: 50000,
    levels: [2, 3, 2],
    gold: 250,
    art: WOLVES,
    // 2026-11-09 企画者の 背景(月夜の 屋上)
    bg: 'stage2',
    tint: 0x7fd4ff,
  },
  {
    name: 'ワニ団',
    story: '街の お金は 地下水路の ワニ団に 流れているらしい。\n暗くて じめじめした 水路を すすむ 勇者。\n「ガブッと 食って やるワニ！」',
    enemyHp: 60000,
    levels: [3, 3, 3],
    gold: 300,
    art: WOLVES,
    tint: 0x9cff8a,
  },
  {
    name: 'ゴリラ団',
    story: '水路の 先は、街を 見おろす 城の 門。\n門を まもる ゴリラ団が 立ちふさがる！\n「ここから 先は 一歩も 通さん！」',
    enemyHp: 80000,
    levels: [3, 4, 3],
    gold: 350,
    art: WOLVES,
    tint: 0xffb36a,
  },
  {
    name: '城の あるじ',
    story: '城の いちばん 上で 待っていたのは、\n牌の 力で 街を 支配する 3人の 人間だった。\nさいごの 対局が はじまる！',
    enemyHp: 100000,
    levels: [4, 5, 4],
    gold: 500,
    art: WOLVES,
    tint: 0xff6a8a,
  },
];

export const STAGE_COUNT = STAGES.length;
export const ENDING_STORY = '街に 平和が もどった！\n…でも、どこかで まだ 牌の 音が する。\nもっと 強い 敵が 待つ 2周目へ！';

/** その 周の その ステージ(2周目からは CPU が +1・ゴールド 1.5倍) */
export function stageAt(index: number, lap: number): StageInfo {
  const s = STAGES[index];
  const up = Math.max(0, lap - 1);
  const lv = (n: Level) => Math.min(5, n + up) as Level;
  return { ...s, levels: [lv(s.levels[0]), lv(s.levels[1]), lv(s.levels[2])], gold: Math.round(s.gold * (lap >= 2 ? 1.5 : 1)) };
}
