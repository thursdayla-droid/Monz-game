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
  jump: { speed: 11, cooldown: 1.0 },  // 2026-11-03 企画者「ジャンプもう少し高く」→ 9(約1.7m)→11(約2.5m)【仮】
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
  // 防御ダウン: 受けるダメージ +25%・10秒・重ならない(企画者 2026-11-02 アーマーブレイク音波)
  defDown: { mul: 1.25, time: 10 },
  gfield: { slow: 0.6, time: 5, linger: 0.5 },
  /**
   * 火柱(2026-11-02 企画者「自分の地面を殴って、使った時にいる相手の真下とその周り3箇所ぐらい下から炎の柱」)【仮】
   * ring: まわりの3本の、まん中からの距離 / warn: 地面が光ってから柱が出るまで(まん中)/ gap: まわりの柱が1本ずつ遅れる時間 / burst: 柱が当たる時間 / life: 柱が見えている時間
   */
  pillar: { ring: 2.2, warn: 0.55, gap: 0.12, burst: 0.4, life: 0.75 },
  /** 連続攻撃4発(メガトンラッシュ)の1発ずつの割合。4発目がフィニッシュ【案】 */
  combo4: [0.2, 0.2, 0.2, 0.4],
  /** 通常攻撃(パンチ)の3連の割合【仮】 */
  jab: { parts: [0.3, 0.3, 0.4] },
  /**
   * 進化で通常攻撃が変わる(2026-11-02 企画者「一進化で4連、最終進化で5連。少し距離伸びて」)【仮】
   * parts: 1発ずつの割合(合計が 威力の倍率)。range: 届く長さ
   */
  jabByForm: [
    { parts: [0.3, 0.3, 0.4], range: 1.9, step: 0, fire: 0 },
    // 2026-11-02 企画者「進化した時の通常攻撃もう少し強く」「少し前にでてパンチ」「パンチから火が少し飛ぶ」→
    // step: 1発ごとに前へ出る長さ。fire: 1 = グローブから火の粉、2 = さいごの1発(か外れた1発)で小さい火の玉が飛ぶ【仮】
    { parts: [0.3, 0.3, 0.4, 0.6], range: 2.2, step: 0.35, fire: 1 },
    { parts: [0.28, 0.28, 0.32, 0.4, 0.72], range: 2.5, step: 0.45, fire: 2 },
  ] as { parts: number[]; range: number; step: number; fire: number }[],
  /** 最終進化のパンチから飛ぶ火の玉が消えるまでの時間(15×0.27 ≒ 4m)【仮】 */
  punchFire: { life: 0.27 },
  /**
   * MOFU の通常攻撃 ツルのムチ(2026-11-03 企画者)【仮】: とどく長さ 3.4 / 3.8 / 4.2。
   * 2026-11-03 企画者「長くて強いから モフは単発、モファーは2コンボ、モフガルドは3コンボ」→ 1 / 2 / 3発・合計の威力の倍率 0.45 / 1.0 / 1.44
   */
  /**
   * ZIPP の通常攻撃「電撃ダッシュ」(2026-11-03 企画者「電撃のエフェクトで前に…貯めることができて、貯めた分前に進む」)【仮】。
   * ボタンを押している間 ためる(最大 charge 秒・hold 秒で自動で出る)。はなすと、ためた分 前へ走ってぶつかる。
   * min/max: 走る長さ(ためなし〜最大)・p0/p1: 威力の倍率(パンチの威力 × これ)
   */
  zdash: {
    charge: 0.9,
    hold: 1.6,
    speed: 26,
    recover: 0.22,
    cool: 0.45,
    byForm: [
      { min: 2.5, max: 6, p0: 1.0, p1: 1.6 },
      { min: 3, max: 7.5, p0: 1.25, p1: 2.0 },
      { min: 3.5, max: 9, p0: 1.5, p1: 2.4 },
    ],
  },
  /**
   * ZIPP の技の動き(2026-11-03 企画者「もっとジグザグに攻撃したり、他のキャラと被らない動き」)【仮】
   * zig: 突進・回転が 左右に曲がる間かく(秒)と角度。blink: 連続攻撃で 相手のまわりへ 一瞬で回りこむ距離。
   * shotZig: 弾が左右にゆれる速さ。dart: 歩きは「さっと走って、ぴたっと止まる」(走る秒・止まる秒)
   */
  zipp: { zig: 0.13, zigAng: 0.75, spinZig: 0.17, blink: 1.35, shotZig: 9, shotZigT: 0.09, dart: [0.32, 0.14] as [number, number], dartSpeed: [1.4, 0.1] as [number, number], dodge: 1.2 },
  whipByForm: [
    { parts: [0.45], range: 3.4 },
    { parts: [0.45, 0.55], range: 3.8 },
    { parts: [0.42, 0.42, 0.6], range: 4.2 },
  ],
  /** 受け身(倒れる時に よける)。起きた後の無敵の時間【仮】 */
  ukemi: { safe: 0.4 },
  /** 追加効果: ふらつき(技を出せず ふらふら)・まひ(遅くなり、ためが長い)【仮】 */
  status: { dizzy: 1.8, para: 3, paraSpeed: 0.55, paraWindup: 1.4 },
  /**
   * やけど・どく・ねむり(2026-11-03 企画者「決めてください。変だったら変えます」)【案】
   * burn: 3秒・1秒ごとに最大HPの2%(合計6%)。poison: 8秒・1秒ごとに最大HPの1%(合計8%)。どちらも よろけない。同じ効果がまたかかったら時間を数え直すだけ(重ならない)
   * sleep: 2.5秒 何もできない。攻撃を受けると起きる。かかったあと(起きてから)5秒は もう一度ねむらない(ハメにならないように)
   */
  burn: { time: 3, every: 1, pct: 0.02 },
  poison: { time: 8, every: 1, pct: 0.01 },
  sleep: { time: 2.0, immune: 5 },  // 2026-11-03 2.5→2.0(MOFU の技で、ねむり＋攻撃で3秒こえて動けなくなったため)
  /** グラビティプレスの場の中にいると、1秒ごとに少しダメージ(よろけない。2026-11-03 企画者「ダメージを少し」)【案】 */
  fieldTick: 1.0,
  /**
   * 回復・強化・吸収(2026-11-03 MOFU の技。技リスト案 docs/TECHS_ALL_DRAFT.md)【案】
   * heal.cap: 1試合で回復できるのは最大HPの60%まで(回復しすぎない)。selfField: 自分の場(千花天幕)の中は 1秒ごとに最大HPの2%回復・受けるダメージ0.7倍
   * drain: 当てたダメージの半分を回復
   */
  heal: { cap: 0.8 },
  drain: { ratio: 0.5 },
  selfField: { healPct: 0.03, guard: 0.6 },
  /** AI習熟度(よけるのがうまくなる) Lv.1 → Lv.5 */
  skill: { dodge: [0.25, 0.8], aim: [0.35, 0.05] },
  /**
   * マップ(柱・壁)での AI(2026-11-03 ロストテンプル)【仮】。[うまさ★1, ★5] の あいだ
   * blockedShoot: 柱で見通せない時、遠くから撃つ技を えらぶ重さの倍率 / flank: 回りこむ確率 / cover: 弾が来た時 柱へにげる確率
   * coverDist: にげる柱の遠さ(これより遠い柱は使わない) / coverHold: かくれている時間
   */
  arenaAi: { blockedShoot: [0.6, 0.05], flank: [0.25, 0.9], cover: [0.03, 0.45], coverDist: 6, coverHold: 1.4, flankFlip: 1.6 },
};

/** 技の種類(表の「型」から決まる。techTable.ts)。2026-11-01 回転・連射・落下・連続攻撃・守り を追加 */
export type TechKind = 'rush' | 'shot' | 'beam' | 'quake' | 'spin' | 'barrage' | 'drop' | 'combo' | 'barrier' | 'debuff' | 'field' | 'jab' | 'pillar' | 'heal' | 'buff' | 'drain';
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
  punchFire: { name: 'パンチの火', element: '炎', kind: 'shot', power: 5, cooldown: 0, windup: 0, recovery: 0, speed: 15, range: 4, size: 0.45, duration: 0, launch: 0, knock: 2 },
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
/** 技として使えるもの(ドームの爆発・パンチの火は ほかの技から出るだけ) */
export const TECH_IDS = Object.keys(TECHS).filter((k) => k !== 'domeBurst' && k !== 'punchFire');
