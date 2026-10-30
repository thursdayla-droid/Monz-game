/**
 * MONZ の新しいバトル(オートバトル。企画者の指示書 2026-10-30)の調整値。Phaserに依存しない。
 * 数字はすべて【仮】(テストしながら調整する)。ここだけ直せば戦い方が変わるように、計算のコードには数字を書かない。
 */

export const AUTO_BATTLE = {
  /** 戦う場所(画面の座標。横画面 1280×720) */
  arena: { x0: 120, x1: 1160, ground: 600 },
  /** 2匹がこれより近づかない(体の幅) */
  bodyGap: 110,
  /** 【仮】試合の最長時間(秒)。時間切れは、残りHPの割合が多いほうの勝ち。同じなら引き分け */
  timeLimit: 90,
  /** AIが状況を見直す間隔(秒)と、移動の方針(近づく・下がる・待つ)を続ける最低の時間(秒)。企画者の仮の値 */
  thinkEvery: 0.2,
  moveHold: 0.5,

  /** ステータス → 戦いの強さ(育成ステータスの反映。どれも【仮】) */
  stat: {
    /** 最大HP = base + HP×perHp */
    hpBase: 150,
    perHp: 1,
    /** 攻撃 = 技の威力 ×(1 + パワー/powerDiv)。防御 = ×(toughDiv/(toughDiv + タフネス)) */
    powerDiv: 60,
    toughDiv: 60,
    /** 歩く速さ(px/秒) = walkBase + スピード×walkPerSpeed */
    walkBase: 240,
    walkPerSpeed: 3,
    /** 攻撃のためが短くなる割合(スピード150で これだけ短く) */
    windupCutAtMax: 0.3,
    /** 相手の攻撃に気づく確率 = reactBase + テクニック/150 × reactPerTech(上限 reactMax) */
    reactBase: 0.35,
    reactPerTech: 0.4,
    reactMax: 0.85,
    /** 会心(1.5倍)の確率 = テクニック/150 × critMax */
    critMax: 0.15,
    critMul: 1.5,
  },

  /** 基本の攻撃(4つの技の枠とは別。名前は【仮】・画面に出さない) */
  attacks: {
    /** すばやいパンチ */
    jab: { windup: 0.22, active: 0.1, recovery: 0.3, reach: 165, power: 6, stamina: 8, stun: 0.28, push: 40 },
    /** 大きなパンチ(ためが長い・すきが大きい) */
    strong: { windup: 0.5, active: 0.12, recovery: 0.55, reach: 185, power: 13, stamina: 18, stun: 0.5, push: 90 },
  },

  /** ガード: 受けるダメージの割合・続けている間のスタミナ・受けたときに減るスタミナ */
  guard: { damageRate: 0.25, staminaPerSec: 14, staminaPerBlock: 10, minTime: 0.35, maxTime: 0.9 },
  /** 回避: 後ろへ飛ぶ。無敵の時間・動く距離・スタミナ */
  dodge: { time: 0.35, invincible: 0.28, distance: 150, stamina: 22 },
  /** スタミナ: 最大・1秒に回復する量。少ないと大きな攻撃・回避ができない */
  stamina: { max: 100, regen: 16, low: 30 },
  /** HPが これより少ない(割合)とピンチ */
  lowHp: 0.3,
  /** 判断のゆらぎ(大きいほど気まぐれ) */
  noise: 0.25,
};

export type AutoAttackName = keyof typeof AUTO_BATTLE.attacks;

/**
 * 本能(AIの行動のくせ。6ステータスとは別。企画者の指示書 2026-10-30 の5項目)。0〜1。
 * 【仮】第1段階は、種族の初期値＋育ったステータスから少しずつ決める。お世話・戦闘経験での変化は第2段階で作る
 */
export interface Instinct {
  /** 攻撃本能: どれくらい攻めるか */
  attack: number;
  /** 防衛本能: どれくらい守るか */
  defense: number;
  /** 狩猟・カウンター傾向: 相手のすきをねらう */
  counter: number;
  /** 闘争本能: 大きな攻撃・戦いへの積極さ */
  fight: number;
  /** 生存本能: ピンチで生き残ろうとする */
  survival: number;
}

/** 【仮】種族ごとの本能の初期値。まだ BUNK だけ */
export const SPECIES_INSTINCT: Record<string, Instinct> = {
  bunk: { attack: 0.6, defense: 0.45, counter: 0.4, fight: 0.6, survival: 0.4 },
};
export const DEFAULT_INSTINCT: Instinct = { attack: 0.5, defense: 0.5, counter: 0.5, fight: 0.5, survival: 0.5 };

/**
 * 【仮】ステータスの育ち方で本能が少し変わる(同じ種族でも育て方で戦い方が変わる、の最初の一歩)。
 * パワーが高い → 攻撃・闘争、タフネス → 防衛、スピード → 狩猟、テクニック → 狩猟・防衛、HP → 闘争。
 * ステータスの合計に対する割合で見るので、レベルが上がっただけでは変わらない
 */
export const INSTINCT_FROM_STATS = {
  /** ステータスのかたよりが本能を動かす強さ(最大でこれだけ変わる) */
  strength: 0.5,
};
