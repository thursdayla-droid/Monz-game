import type { Level } from './ai';

/**
 * MAHJONG QUEST の ステージ(2026-11-09 企画者「5ステージ 作りたい。5ステージ目 クリアしたら 2周目」)。
 * - 敵は ステージごとに ぜんぶ ちがう(企画者 2026-11-09)。STAGE 1 は オオカミ団。2〜5 の 絵は まだ【仮：絵が 届くまで オオカミの 色ちがい】
 * - 敵の HP は どの ステージも 30,000(企画者 2026-11-09)
 * - CPU の 強さは ステージごとに 上がる・2周目は さらに +1【仮】
 * - 勝ちの ゴールド 200 / 250 / 300 / 350 / 500G・2周目は 1.5倍(企画者 2026-11-09 OK)
 * - 話の 文は Claude の 下書き【仮：企画者が 直す】
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
  /** 絵が まだの 時の 色(オオカミの 色ちがい)【仮】 */
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
  },
  {
    name: '？？？団',
    story: 'オオカミ団を やぶった 勇者。\nだが 街の 奥には もっと 強い 一味が いた…。',
    enemyHp: 30000,
    levels: [2, 3, 2],
    gold: 250,
    art: WOLVES,
    tint: 0x7fd4ff,
  },
  {
    name: '？？？団',
    story: 'うわさを 聞いた 一味が 勇者を 待ちかまえる。\n「その 牌、こっちに よこしな！」',
    enemyHp: 30000,
    levels: [3, 3, 3],
    gold: 300,
    art: WOLVES,
    tint: 0x9cff8a,
  },
  {
    name: '？？？団',
    story: '王の 城の 門番たちが 立ちふさがる。\nあと 少しで 街を とりもどせる！',
    enemyHp: 30000,
    levels: [3, 4, 3],
    gold: 350,
    art: WOLVES,
    tint: 0xffb36a,
  },
  {
    name: '？？？団',
    story: 'ついに 城の いちばん 上へ。\n街を 支配する 王との さいごの 対局が はじまる！',
    enemyHp: 30000,
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
