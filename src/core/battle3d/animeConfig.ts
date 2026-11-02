/**
 * 3Dバトル「アニメのモンスターバトル風」(企画者 2026-11-01「アニメのポケモンバトルのような感じ」)の調整値。
 * 企画者がえらんだこと(2026-11-01):
 *  - 派手な技(遠くから撃つ・ぶつけ合う・大きな光や爆発)
 *  - モンスターらしい体(BUNKの3Dモデルが届くまでは仮のモンスター)
 *  - 広い野外のバトル場
 *  - 指示は「技の名前」で出す(Ver.41 の「攻めろ・守れ・避けろ・今だ」から変更)
 * 数字・技の名前・技の種類は すべて【仮】。既存の作品の技名は使わない。長さは m、時間は秒。
 */
export const ANIME = {
  dt: 1 / 60,
  /** 【仮】野外のコート(長方形)。中心から端までの長さ */
  field: { halfX: 12, halfZ: 8 },
  body: { radius: 0.7, minGap: 1.5 },
  timeLimit: 90,
  gravity: 24,
  stat: { hpBase: 120, perHp: 1, powerDiv: 130, toughDiv: 100, walkBase: 3.5, turnRate: 10,
    /** 【仮】動く速さ = walkBase × 倍率。倍率はスピード0で0.9倍 → スピード150(上限)で1.8倍(企画者 2026-11-02「動くスピードはすばやさで変えよう」) */
    moveMin: 0.9, moveMax: 1.8, moveCap: 150,
    /** 【仮】スピード: ためが短い・よけやすい。テクニック: ねらいが正確・クリティカル(1.4倍)・追加効果が付きやすい(2026-11-01 技の表のバランスのため) */
    speedWindupDiv: 300, speedWindupMax: 0.25, speedDodgeDiv: 300, techAim: 100, techCritDiv: 140, techEffectDiv: 150, techCdDiv: 250, techCdMax: 0.2, critMul: 1.4 },
  /** AIが考える間隔・移動の方針を続ける時間 */
  thinkEvery: 0.25,
  moveHold: 0.4,
  /** 動きの勢い(企画者 2026-11-01「もっさりしてロボみたい」→ 生き物らしく)【仮】 */
  // 2026-11-02 企画者「横移動サッじゃなくて歩いてる感じ」→ 急に横へダッシュするのをやめ(burstChance 0)、歩く速さを下げた
  move: { accel: 7, stop: 9, burst: 2.1, burstTime: 0.35, burstChance: 0, hop: 5.5, hopChance: 0.04 },
  /** ジャンプ(プレイヤーのボタン)【仮】高さ 約1.7m・待ち時間 */
  jump: { speed: 9, cooldown: 1.0 },
  /** プレイヤーが動かすときの速さ(AI の歩きより少し速く。2026-11-02)【仮】 */
  // 2026-11-02 企画者「動きもうすこし早く」→ 1.35 → 1.6、歩く速さも 3.0 → 3.5
  pad: { speed: 1.6 },
  /** 遠くから撃ち合う間合い */
  spacing: { ideal: 7, near: 4.5, far: 10 },
  /** よける(横へ飛ぶ)。無敵の時間 */
  dodge: { time: 0.3, invincible: 0.28, distance: 3.4, cooldown: 1.6 },
  /** 指示: 動けない間は待つ。この時間をすぎたら消える。1件だけ(新しい指示で置きかえ) */
  command: { wait: 1.5 },
  /** 【仮】自分で技を出す確率(指示がないときも戦う。1回考えるごと) */
  // 2026-11-02: 自分の MONZ は「オート」なら相手と同じくらい自分で技を出す。「しゅどう」なら出さない(Battle3DScene で切りかえ)
  selfUse: { partner: 0.08, partnerAuto: 0.18, rival: 0.18 },
  /** やられ: ひるみ・吹っ飛び・ダウン */
  hurt: { stun: 0.45, down: 0.9, invincibleAfterDown: 0.5, friction: 6 },
  /** 演出(5ヒット目は無いので、大技とKOだけ) */
  fx: { ko: { zoom: 1.08, slow: 0.8 } },
  victoryDelay: 1.4,
  /** 型ごとの動き(2026-11-01 技の表から)【仮】 */
  quake: { hop: 6 },
  drop: { jump: 13 },
  spin: { turn: 2.2 },
  combo: { reach: 2.0, stun: 0.3, bonus: 1.15 },
  barrage: { count: 3, gap: 0.15 },
  /**
   * 【案・未承認】弱体(ほえる)・設置(重力の場)の数字(2026-11-02 BUNK 追加6技。企画者の承認前なので仮)
   * debuff: 攻撃ダウンの割合と時間 / field: 遅くなる割合・場の残る時間・場から出たあと遅いままの時間
   */
  debuff: { atkDown: 0.75, time: 5 },
  gfield: { slow: 0.6, time: 5, linger: 0.5 },
  /** 連続攻撃4発(メガトンラッシュ)の1発ずつの割合。4発目がフィニッシュ【案】 */
  combo4: [0.2, 0.2, 0.2, 0.4],
  /** 通常攻撃(パンチ)の3連の割合【仮】 */
  jab: { parts: [0.3, 0.3, 0.4] },
  /**
   * 進化で通常攻撃が変わる(2026-11-02 企画者「一進化で4連、最終進化で5連。少し距離伸びて」)【仮】
   * parts: 1発ずつの割合(合計が 威力の倍率)。range: 届く長さ
   */
  jabByForm: [
    { parts: [0.3, 0.3, 0.4], range: 1.9 },
    { parts: [0.25, 0.25, 0.3, 0.5], range: 2.2 },
    { parts: [0.22, 0.22, 0.26, 0.3, 0.6], range: 2.5 },
  ],
  /** 受け身(倒れる時に よける)。起きた後の無敵の時間【仮】 */
  ukemi: { safe: 0.4 },
  /** 追加効果: ふらつき(技を出せず ふらふら)・まひ(遅くなり、ためが長い)【仮】 */
  status: { dizzy: 1.8, para: 3, paraSpeed: 0.55, paraWindup: 1.4 },
  /** AI習熟度(よけるのがうまくなる) Lv.1 → Lv.5 */
  skill: { dodge: [0.25, 0.8], aim: [0.35, 0.05] },
};

/** 技の種類(表の「型」から決まる。techTable.ts)。2026-11-01 回転・連射・落下・連続攻撃・守り を追加 */
export type TechKind = 'rush' | 'shot' | 'beam' | 'quake' | 'spin' | 'barrage' | 'drop' | 'combo' | 'barrier' | 'debuff' | 'field' | 'jab';
export type Element = '炎' | '水' | '自然' | '雷' | '光' | '闇' | '無';

export interface Tech {
  /** 【仮】技の名前(画面のボタン) */
  name: string;
  element: Element;
  kind: TechKind;
  power: number;
  cooldown: number;
  /** ため(この間に向きを決める。動けない) */
  windup: number;
  recovery: number;
  /** rush: 走る速さ・とどく距離 / shot: 弾の速さ・大きさ / beam: 長さ・太さ・出ている時間 / quake: 広がる速さ・いちばん外の大きさ */
  speed: number;
  range: number;
  size: number;
  duration: number;
  /** 当たると吹っ飛ぶ(空中へ)・ダウンする */
  launch: number;
  knock: number;
}

/**
 * 前の試作の技4つ(見本・テスト用)。ゲームの技は企画者の技の表(techTable.ts)から作る。名前は企画者のイメージ図(2026-10-23)の「ダッシュアタック」「グラウンドブレイク」と、仮の名前2つ。
 * 色違いのライバルも同じ技(仮)。
 */
export const TECHS = {
  /** 通常攻撃(2026-11-02 企画者「通常攻撃もいれよう」)。近くでパンチ1発。待ち時間ほぼなし・威力は弱い【仮】。技の枠には入れない */
  // 2026-11-02 企画者「連打はやめ・クールタイム0.5秒」「その場でパンチ。ヒットしたら3連ぐらい」「空中でも」→ 型 jab。1発目が当たったら3連(合計 power)。待ち時間は攻撃が終わってから0.5秒
  punch: { name: 'パンチ', element: '無', kind: 'jab', power: 7, cooldown: 0.5, windup: 0.06, recovery: 0.16, speed: 0, range: 1.9, size: 0.9, duration: 0.14, launch: 0, knock: 2 },
  /** ガンジョウドームの爆発(反撃)。ドームが攻撃を受けると広がる衝撃波【仮】威力10・届く長さ4.5 */
  domeBurst: { name: 'ガンジョウドーム', element: '無', kind: 'quake', power: 10, cooldown: 0, windup: 0, recovery: 0, speed: 14, range: 4.5, size: 0.6, duration: 0, launch: 5, knock: 5 },
  dash: { name: 'ダッシュアタック', element: '無', kind: 'rush', power: 13, cooldown: 3.5, windup: 0.25, recovery: 0.4, speed: 13, range: 9, size: 1.0, duration: 0, launch: 5, knock: 4 },
  fire: { name: 'ファイアショット', element: '炎', kind: 'shot', power: 11, cooldown: 2.8, windup: 0.3, recovery: 0.25, speed: 15, range: 20, size: 0.6, duration: 0, launch: 0, knock: 3 },
  beam: { name: 'ライトニングビーム', element: '雷', kind: 'beam', power: 20, cooldown: 7, windup: 0.75, recovery: 0.5, speed: 0, range: 22, size: 0.7, duration: 0.55, launch: 4, knock: 6 },
  quake: { name: 'グラウンドブレイク', element: '自然', kind: 'quake', power: 16, cooldown: 6, windup: 0.5, recovery: 0.45, speed: 9, range: 6, size: 0.6, duration: 0, launch: 7, knock: 3 },
} satisfies Record<string, Tech>;

/** 技の id = 技の名前(表の技)。前の試作の4つは dash・fire・beam・quake */
export type TechId = string;
export const TECH_IDS = Object.keys(TECHS);
