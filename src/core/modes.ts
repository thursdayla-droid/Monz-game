/**
 * ミニゲームの一覧。Phaserに依存しない。ミニゲームを増やすときは、ここに1つ足す(セレクト画面に並ぶ)。
 * 企画者決定(2026-10-20): 目標5種類。① MONZ CARD ② ジャンプゲーム ③〜⑤は未定。
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

export const MINIGAMES: readonly MinigameInfo[] = [
  { id: 'card', title: 'MONZ CARD', ready: false, score: '出したカードの枚数', color: '#8a35e0' },
  // 【企画段階】ルールが決まるまで作らない
  { id: 'jump', title: 'ジャンプゲーム', ready: false, score: '走った距離', color: '#ff8a1f' },
];
