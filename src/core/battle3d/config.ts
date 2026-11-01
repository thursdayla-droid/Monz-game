/**
 * 3Dオートバトル(企画者 BATTLE SYSTEM Ver.41・2026-10-31)の調整値。Phaser・Three.js に依存しない。
 * 【確定】と書いたもの以外は、すべて【仮】(試しながら調整する)。計算のコードには数字を書かず、ここだけ直す。
 * 長さの単位は m(メートル)くらい、時間は秒。
 */
export const B3 = {
  /** 1回の計算の時間(秒)。60回/秒 */
  dt: 1 / 60,
  /** 【仮】アリーナ: 正方形の床。中心から壁までの長さ。最初は平らで障害物なし(Ver.41) */
  arena: { half: 7 },
  /** 体の半径・2体がこれより近づかない距離 */
  body: { radius: 0.45, minGap: 0.95 },
  /** 【仮】試合の最長時間(秒)。時間切れは残りHPの割合が多いほうの勝ち(Ver.41 に決まりがないので仮) */
  timeLimit: 90,
  /** 重力・ジャンプ(Y) */
  gravity: 26,
  jump: { speed: 9, stamina: 6 },

  /** ステータス → 強さ(10/30 のオートバトルと同じ考え) */
  stat: { hpBase: 210, perHp: 1, powerDiv: 60, toughDiv: 60, walkBase: 3.0, walkPerSpeed: 0.012, turnRate: 14 },

  /** AIが状況を見直す間隔(秒)と、移動の方針を続ける最低の時間(秒)(10/30 の仮の値) */
  thinkEvery: 0.2,
  moveHold: 0.5,

  /**
   * 技。windup=ため / active=当たる時間 / recovery=すき。reach=前への届く長さ、arc=当たる角度(左右の半分・ラジアン)、
   * height=上下の当たる幅、power=威力、stun=当たった相手のひるみ、push=押す距離、launch=打ち上げる速さ(空中へ)。
   * 攻撃の前に相手のほうを向くが、ためが始まったら向きは変えない(Ver.41【確定】: 無制限に追いかけない → 空振りがある)
   */
  moves: {
    /** すばやいパンチ(基本) */
    jab: { windup: 0.16, active: 0.08, recovery: 0.24, reach: 1.25, arc: 0.6, height: 1.0, power: 5, stamina: 6, stun: 0.44, push: 0.15, launch: 0, dash: 0 },
    /** まっすぐパンチ(基本) */
    straight: { windup: 0.26, active: 0.1, recovery: 0.34, reach: 1.5, arc: 0.45, height: 1.0, power: 8, stamina: 10, stun: 0.5, push: 0.3, launch: 0, dash: 0.3 },
    /** 中段キック(基本。2026-11-01 格闘ゲームらしく) */
    kick: { windup: 0.22, active: 0.1, recovery: 0.36, reach: 1.55, arc: 0.5, height: 1.0, power: 8, stamina: 10, stun: 0.48, push: 0.45, launch: 0, dash: 0.15 },
    /** 【仮】技の枠(4つ)。10/30 の「技を4つ自動で付ける」を残す(企画者 2026-11-01)。名前は画面に出さない */
    upper: { windup: 0.3, active: 0.1, recovery: 0.45, reach: 1.25, arc: 0.5, height: 1.0, power: 9, stamina: 14, stun: 0.6, push: 0.2, launch: 9.5, dash: 0 },
    smash: { windup: 0.5, active: 0.12, recovery: 0.6, reach: 1.6, arc: 0.55, height: 1.0, power: 15, stamina: 20, stun: 0.7, push: 1.4, launch: 4, dash: 0.2 },
    rush: { windup: 0.34, active: 0.16, recovery: 0.5, reach: 1.4, arc: 0.4, height: 1.0, power: 10, stamina: 16, stun: 0.5, push: 0.9, launch: 0, dash: 2.6 },
    spin: { windup: 0.36, active: 0.14, recovery: 0.5, reach: 1.45, arc: 1.6, height: 1.0, power: 9, stamina: 16, stun: 0.5, push: 0.8, launch: 0, dash: 0 },
    /** 空中の追撃(打ち上げた相手を、ジャンプして打つ) */
    aerial: { windup: 0.14, active: 0.12, recovery: 0.3, reach: 1.3, arc: 0.8, height: 1.6, power: 7, stamina: 8, stun: 0.5, push: 0.4, launch: 3, dash: 0 },
    /** ジャストガードのあとの反撃 */
    counter: { windup: 0.07, active: 0.1, recovery: 0.3, reach: 1.5, arc: 0.9, height: 1.2, power: 13, stamina: 0, stun: 0.6, push: 1.0, launch: 0, dash: 0.4 },
  },
  /** 【仮】技の枠に入れる候補(本能で4つをAIが自動でえらぶ。今は候補が4つなので全部) */
  skillPool: ['upper', 'smash', 'rush', 'spin'] as const,

  /** コンボ【確定】最大5ヒット(地上＋空中の合計)。ダメージの割合は【調整案】 */
  combo: { max: 5, scale: [1, 0.9, 0.8, 0.7, 0.6], /** ひるみ・空中が終わってから、これより後に当たったら数え直す */ grace: 0.12, /** 当たったときに、すきを短くする割合(次につなげるため) */ hitCancel: 0.85 },
  /** 吹っ飛び: 床の上をすべる。friction が大きいほど早く止まる */
  knock: { friction: 9 },
  /** 間合い(格闘ゲームらしく近い間合いで攻め合う)・踏みこみ・バックステップ【仮】 */
  spacing: {
    ideal: 1.6,
    stepChance: 0.3,
    dash: { time: 0.2, dist: 1.5, stamina: 4 },
    backdash: { time: 0.24, dist: 1.3, stamina: 5 },
  },
  /** 5ヒット目のあと、たおれて起きるまで(この間は当たらない) */
  down: { time: 0.9, invincible: 0.9, landDown: 0.35 },

  /** ガード: 受けるダメージの割合など */
  guard: { damageRate: 0.2, staminaPerBlock: 8, hold: 1.0, exhaustedRate: 0.5 },
  /** ジャストガード【確定】PERFECT 0〜100ms / GOOD 100〜350ms / 先読み(攻撃のためより前からガード)は PERFECT にしない。反撃機会 300ms */
  justGuard: { perfect: 0.1, good: 0.35, counterWindow: 0.3, goodDamage: 0.1, perfectStagger: 0.3, goodStagger: 0.12 },
  /** 回避: 横へステップ。無敵の時間・距離 */
  evade: { time: 0.34, invincible: 0.26, distance: 1.8, stamina: 18 },
  /** スタミナ。0で息切れ【確定】(ガード・ジャストガードが弱くなり、反撃できない)。数値は【調整案】 */
  stamina: { max: 100, regen: 15, exhaustedRegen: 22, recoverAt: 45, exhaustedSlow: 0.75 },

  /** プレイヤーの指示【確定】4つ・予約は800ms・1件・置きかえ・同じ指示の連打で延長しない・実行した時にクールダウン */
  orders: { reserve: 0.8, cooldown: { attack: 2.0, defend: 2.0, evade: 2.0, now: 3.0 }, attackBoost: 2.5, defendHold: 1.2 },

  /** 演出【確定】の値(5ヒット目・KO)。画面の側で使う */
  fx: { fifth: { hitStop: 0.05, zoom: 1.05, zoomTime: 0.12, vfx: 0.25, vibrate: 80 }, ko: { zoom: 1.08, slow: 0.8 } },
  /** KOのあと、勝ったほうが勝利モーションを始めるまで(秒) */
  victoryDelay: 1.2,

  /** AI習熟度【確定】5種 Lv.1〜5。判断の精度が上がる(攻撃力は上がらない)。下は Lv.1 → Lv.5 の幅【調整案】 */
  skill: {
    /** ガード・回避を始める時間のずれ(秒・ばらつき) */
    timingError: [0.3, 0.05],
    /** 相手の攻撃に反応する確率 */
    react: [0.35, 0.85],
    /** すきに反撃する確率 */
    punish: [0.2, 0.8],
    /** 届かない所で攻撃してしまう確率 */
    badRange: [0.35, 0.05],
    /** 壁に気づく距離 */
    wallSense: [0.6, 1.8],
    /** ひるんだ相手に、続けて攻撃する確率(コンボ) */
    chain: [0.3, 0.85],
    /** 回り込みの多さ */
    circle: [0.15, 0.6],
  },
};

export type MoveName = keyof typeof B3.moves;
export type OrderName = keyof typeof B3.orders.cooldown;
export const ORDER_NAMES: OrderName[] = ['attack', 'defend', 'evade', 'now'];
/** AI習熟度の5種【確定】 */
export const PROFICIENCY_KEYS = ['attack', 'defense', 'evasion', 'counter', 'spacing'] as const;
export type ProficiencyKey = (typeof PROFICIENCY_KEYS)[number];
export type Proficiency = Record<ProficiencyKey, number>;
