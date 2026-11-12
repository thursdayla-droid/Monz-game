/**
 * ミニゲームの一覧。Phaserに依存しない。ミニゲームを増やすときは、ここに1つ足す(セレクト画面に並ぶ)。
 * 企画者決定(2026-10-20): 目標5種類。① MONZ CARD ② ダッシュモンズ(走ってジャンプするゲーム) ③ MONZ SLUGGER(バッティング) ④ 麻雀クエスト ⑤ MONZ SLOT(2026-11-10)。
 * ready: 遊べるか(まだのものは「SOON」)。scene: そのゲームの画面の名前(作ったら入れる)。
 * score: ランキング・最高記録に使う点数の呼び方。
 */
export interface MinigameInfo {
  id: string;
  title: string;
  ready: boolean;
  scene?: string;
  score: string;
  /** セレクト画面の看板の色(未定のゲームは灰色) */
  color: string;
}

/** 目標の数(セレクト画面には、まだ決まっていないぶんも「？？？」の枠を出す) */
export const MINIGAME_SLOTS = 5;

/**
 * ミニゲーム(MONZ CARD・ダッシュモンズ・MONZ SLUGGER)の ごほうびの 倍率と 1回の プレイの 上限
 * (2026-11-09 企画者「経験値と コイン 5倍に。少なすぎた。1回の プレイで 経験値と コイン 最大 1,000 まで」)
 */
export const MINIGAME_REWARD_MULT = 5;
export const MINIGAME_REWARD_MAX = 1000;
export const capReward = (r: { coins: number; exp: number }) => ({ coins: Math.min(MINIGAME_REWARD_MAX, r.coins), exp: Math.min(MINIGAME_REWARD_MAX, r.exp) });

export const MINIGAMES: readonly MinigameInfo[] = [
  { id: 'card', title: 'MONZ CARD', ready: true, scene: 'CardTitle', score: '出したカードの枚数', color: '#8a35e0' },
  // 【企画段階】ルールが決まるまで作らない
  { id: 'dash', title: 'ダッシュモンズ', ready: true, scene: 'Dash', score: '走った距離', color: '#ff8a1f' },
  { id: 'slugger', title: 'MONZ SLUGGER', ready: true, scene: 'Slugger', score: 'スコア', color: '#2fb8e0' },
  // ④ 麻雀クエスト(2026-11-08 企画者 仕様書 Ver.1.0。docs/MAHJONG.md。2026-11-09 企画者の タイトルの 絵の 名前)
  { id: 'mahjong', title: '麻雀クエスト', ready: true, scene: 'MahjongQuest', score: 'ステージ', color: '#9b5cff' },
  // ⑤ ROYAL JACKPOT(仕様書の 仮名 MONZ SLOT。名前は 2026-11-10 企画者。docs/SLOT.md)。看板の 絵は まだ(名前を 重ねて 出す)【仮】
  { id: 'slot', title: 'ROYAL JACKPOT', ready: true, scene: 'SlotTitle', score: 'コイン', color: '#ffb000' },
];
