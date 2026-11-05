/**
 * 新しい5体の 技の 動き(2026-11-05 企画者「新しい3匹 全部一緒でつまらない。オリジナル性がないし、攻撃の種類も全体でワンパターン化してる」)。
 * 技ごとに「どう動いて・いつ・どこに 当てるか」を 1歩ずつ 書く。設計案(docs/NEW5_TECHS.md)の 動きの説明 どおりに【仮】
 *
 * 1歩(BeastStep):
 * - mv: 体の動き(clawR/clawL = 前足で ひっかく・bite = かみつく・head = 頭突き・shoulder = 肩・tail = しっぽ・shell = 甲羅・zap = 口から 吐く/ほえる)
 * - t: 時間(秒)・go: 相手へ 進む長さ(m。マイナスは うしろへ)・side: 横へ 進む長さ(m。+ = 右)
 * - jump: とび上がる 速さ(pounce = 相手の 所へ 着地するように 前へも とぶ)・dive: 空中から 下へ つっこむ 速さ
 * - spin: その場で 1回まわる・ghost: 影に もぐる(当たらない・うすく 見える)・orbit: 相手の まわりを 回る(角度)
 * - hit: 当てる(at: 何割の 時・contact: 歩いている間 ずっと・n / every: 何回 ・何秒ごと・cx: 自分の 何m 前を まん中に・r: 広さ・
 *   arc: 前から 左右に 何ラジアンまで(3.2 = まわり ぜんぶ)・part: 強さ(技の威力 × part)・launch: 浮かせる高さ・knock: 押す強さ・
 *   bind: 相手を 目の前に つかまえる 秒・throwBack: うしろへ 投げる・pull: 引きよせる・ground: 地面だけ(浮いた相手に 当たらない))
 * - fx: 光(claw = 爪の線・bite = キバ・head = 風の輪・slam = 地面に ドスン・stomp = 地面の ゆれ・flame = 炎・shadow = 影・ring = まわりの 弧・abyss = 闇の うず・nova = 大爆発)
 */
export interface BeastHit {
  at?: number;
  contact?: boolean;
  n?: number;
  every?: number;
  cx?: number;
  r: number;
  arc?: number;
  part: number;
  launch?: number;
  knock?: number;
  bind?: number;
  throwBack?: boolean;
  pull?: boolean;
  ground?: boolean;
}
export interface BeastStep {
  mv: string;
  t: number;
  go?: number;
  side?: number;
  jump?: number;
  pounce?: boolean;
  dive?: number;
  spin?: boolean;
  ghost?: boolean;
  orbit?: number;
  /** 影に もぐって 相手の うしろへ 回る(1歩の はじめに) */
  behind?: boolean;
  hit?: BeastHit;
  fx?: string;
}

const P = Math.PI;
export const BEAST: Record<string, BeastStep[]> = {
  // ---------------- RIOT(炎・無。爪と牙で 猛然と とびかかる) ----------------
  悪噛み: [
    { mv: 'bite', t: 0.2, go: 0.7, side: -0.4, hit: { at: 0.6, r: 1.6, arc: 0.9, part: 0.45 }, fx: 'bite' },
    { mv: 'bite', t: 0.22, go: 0.4, side: 0.8, hit: { at: 0.6, r: 1.6, arc: 1.1, part: 0.55, knock: 1.4 }, fx: 'bite' },
  ],
  ガルルショック: [
    { mv: 'zap', t: 0.22, hit: { at: 0.9, cx: 1.6, r: 1.3, arc: P, part: 0.4, ground: true }, fx: 'wave' },
    { mv: 'zap', t: 0.16, hit: { at: 0.5, cx: 3.0, r: 1.5, arc: P, part: 0.35, ground: true }, fx: 'wave' },
    { mv: 'zap', t: 0.16, hit: { at: 0.5, cx: 4.4, r: 1.7, arc: P, part: 0.35, ground: true }, fx: 'wave' },
  ],
  噛みつきダイブ: [{ mv: 'bite', t: 0.6, jump: 7, pounce: true, hit: { contact: true, r: 1.7, arc: 1.3, part: 1, knock: 1.6 }, fx: 'bite' }],
  牙王クラッシュ: [
    { mv: 'clawR', t: 0.32, jump: 5, go: 1.2 },
    { mv: 'head', t: 0.28, dive: 9, hit: { at: 0.5, cx: 1.2, r: 1.8, arc: P, part: 1, knock: 2.8 }, fx: 'slam' },
  ],
  ライオファング: [
    { mv: 'clawR', t: 0.18, go: 0.6, hit: { at: 0.6, r: 1.7, arc: 1, part: 0.25 }, fx: 'claw' },
    { mv: 'clawL', t: 0.18, go: 0.3, hit: { at: 0.6, r: 1.7, arc: 1, part: 0.25 }, fx: 'claw' },
    { mv: 'bite', t: 0.34, jump: 5, go: 0.4, hit: { at: 0.4, r: 1.9, arc: 1.2, part: 0.5, launch: 8 }, fx: 'flameBurst' },
  ],
  爆炎ブレス: [{ mv: 'zap', t: 0.75, hit: { n: 6, every: 0.11, at: 0.08, cx: 2.2, r: 2.2, arc: 0.55, part: 0.18 }, fx: 'flame' }],
  爆走牙: [{ mv: 'bite', t: 0.7, go: 8, hit: { contact: true, r: 1.6, arc: 1, part: 1, launch: 7.5 }, fx: 'fireTrail' }],
  轟炎牙王: [
    { mv: 'clawR', t: 0.75, jump: 12, pounce: true, fx: 'flameAura' },
    { mv: 'head', t: 0.35, dive: 14, hit: { at: 0.4, r: 3.6, arc: P, part: 1 }, fx: 'nova' },
  ],
  // ---------------- SNEK(闇・無。毒牙・とぐろ・しっぽ・影で ほんろうする) ----------------
  毒牙: [{ mv: 'bite', t: 0.32, go: 1.2, hit: { at: 0.55, r: 2.7, arc: 0.6, part: 1 }, fx: 'darkBite' }],
  尾払い: [{ mv: 'tail', t: 0.42, spin: true, hit: { at: 0.45, r: 2.5, arc: P, part: 1, launch: 6.5 }, fx: 'ring' }],
  牙落とし: [
    { mv: 'bite', t: 0.34, jump: 8, go: 1 },
    { mv: 'bite', t: 0.26, dive: 12, hit: { at: 0.45, r: 1.9, arc: P, part: 1, knock: 1.4 }, fx: 'darkSlam' },
  ],
  螺旋牙: [
    { mv: 'bite', t: 0.24, orbit: 1.6, hit: { at: 0.7, r: 2.2, arc: 1.4, part: 0.3 }, fx: 'darkBite' },
    { mv: 'bite', t: 0.24, orbit: 1.6, hit: { at: 0.7, r: 2.2, arc: 1.4, part: 0.3 }, fx: 'darkBite' },
    { mv: 'tail', t: 0.36, spin: true, hit: { at: 0.5, r: 2.4, arc: P, part: 0.4, launch: 7 }, fx: 'ring' },
  ],
  毒蛇の顎: [{ mv: 'bite', t: 0.55, go: 6.5, hit: { contact: true, r: 2.3, arc: 1.2, part: 1, knock: 2 }, fx: 'bigJaw' }],
  冥府のとぐろ: [
    { mv: 'tail', t: 1.1, spin: true, hit: { n: 5, every: 0.2, at: 0.05, r: 3.6, arc: P, part: 0.14, pull: true }, fx: 'abyss' },
    { mv: 'tail', t: 0.36, spin: true, hit: { at: 0.4, r: 3.6, arc: P, part: 0.3, knock: 3 }, fx: 'abyssBurst' },
  ],
  // ---------------- GRIT(無・闇。重い ブルドッグ。受け止めて 重い反撃) ----------------
  ドスンヘッド: [{ mv: 'head', t: 0.34, go: 1.8, hit: { contact: true, r: 1.5, arc: 1, part: 1, knock: 3.2 }, fx: 'head' }],
  地鳴らし: [
    { mv: 'clawR', t: 0.22, hit: { at: 0.95, cx: 1.3, r: 1.1, arc: P, part: 0.3, ground: true }, fx: 'stomp' },
    { mv: 'clawR', t: 0.12, hit: { at: 0.5, cx: 2.6, r: 1.1, arc: P, part: 0.25, ground: true }, fx: 'stomp' },
    { mv: 'clawR', t: 0.12, hit: { at: 0.5, cx: 3.9, r: 1.2, arc: P, part: 0.25, ground: true }, fx: 'stomp' },
    { mv: 'clawR', t: 0.12, hit: { at: 0.5, cx: 5.2, r: 1.3, arc: P, part: 0.25, ground: true }, fx: 'stomp' },
  ],
  ブルドーザー: [{ mv: 'shoulder', t: 1.05, go: 6.5, hit: { n: 6, every: 0.15, at: 0.08, r: 1.7, arc: 1.2, part: 0.17, knock: 1.4 }, fx: 'shove' }],
  グリットプレス: [
    { mv: 'head', t: 0.5, jump: 7, pounce: true },
    { mv: 'head', t: 0.24, dive: 12, hit: { at: 0.4, r: 2.3, arc: P, part: 1, knock: 2 }, fx: 'slam' },
  ],
  ブルクラッシャー: [{ mv: 'shoulder', t: 0.5, go: 4.2, hit: { contact: true, r: 1.6, arc: 1.1, part: 1, launch: 8 }, fx: 'head' }],
  グリットタイタン: [
    { mv: 'head', t: 0.85, jump: 13, pounce: true },
    { mv: 'head', t: 0.35, dive: 16, hit: { at: 0.4, r: 4, arc: P, part: 1 }, fx: 'titan' },
  ],
  // ---------------- VYBE(雷・光。軽い狼。爪・牙・しっぽ・口の電気を つなぐ。ZIPP = 電撃ダッシュの 一撃離脱 とは ちがう) ----------------
  ビリカミ: [
    { mv: 'bite', t: 0.16, go: 0.7, hit: { at: 0.6, r: 1.6, arc: 1, part: 0.45 }, fx: 'sparkBite' },
    { mv: 'bite', t: 0.16, go: 0.3, hit: { at: 0.6, r: 1.6, arc: 1, part: 0.55 }, fx: 'sparkBite' },
  ],
  閃爪: [
    { mv: 'clawR', t: 0.15, side: 0.7, go: 0.5, hit: { at: 0.6, r: 1.6, arc: 1.2, part: 0.5 }, fx: 'spark' },
    { mv: 'clawL', t: 0.15, side: -1.4, hit: { at: 0.6, r: 1.6, arc: 1.2, part: 0.5 }, fx: 'spark' },
  ],
  光牙バイト: [{ mv: 'bite', t: 0.42, jump: 4, pounce: true, hit: { contact: true, r: 1.7, arc: 1.2, part: 1, knock: 1.5 }, fx: 'lightBite' }],
  早足クロー: [
    { mv: 'clawR', t: 0.13, orbit: 0.9, hit: { at: 0.6, r: 1.9, arc: 1.5, part: 0.25 }, fx: 'spark' },
    { mv: 'clawL', t: 0.13, orbit: 0.9, hit: { at: 0.6, r: 1.9, arc: 1.5, part: 0.25 }, fx: 'spark' },
    { mv: 'clawR', t: 0.13, orbit: 0.9, hit: { at: 0.6, r: 1.9, arc: 1.5, part: 0.25 }, fx: 'spark' },
    { mv: 'clawL', t: 0.13, orbit: 0.9, hit: { at: 0.6, r: 1.9, arc: 1.5, part: 0.25 }, fx: 'spark' },
  ],
  ヴァイガスラッシュ: [
    { mv: 'clawR', t: 0.16, go: 0.6, hit: { at: 0.6, r: 1.7, arc: 1, part: 0.25 }, fx: 'spark' },
    { mv: 'tail', t: 0.3, spin: true, hit: { at: 0.5, r: 2.2, arc: 3.2, part: 0.3 }, fx: 'sparkRing' },
    { mv: 'clawL', t: 0.3, jump: 5, hit: { at: 0.4, r: 1.9, arc: 1.2, part: 0.45, launch: 7.5 }, fx: 'sparkUp' },
  ],
  サンダークロス: [
    { mv: 'clawR', t: 0.16, go: 0.6, hit: { at: 0.6, r: 1.7, arc: 1, part: 0.3 }, fx: 'cross' },
    { mv: 'clawL', t: 0.16, go: 0.2, hit: { at: 0.6, r: 1.7, arc: 1, part: 0.3 }, fx: 'cross' },
    { mv: 'zap', t: 0.32, hit: { at: 0.4, r: 2, arc: 1.2, part: 0.4, launch: 7 }, fx: 'sparkUp' },
  ],
  // ---------------- SHELLZ(水・無。甲羅で守り、水で 距離をとる 亀。GRIT = 近くで 受け止めて 反撃) ----------------
  甲羅ドン: [{ mv: 'shell', t: 0.36, side: 0.6, spin: true, hit: { at: 0.5, r: 2, arc: 3.2, part: 1, knock: 1.6 }, fx: 'shellRing' }],
  甲羅のトゲ: [
    { mv: 'shell', t: 0.24, hit: { at: 0.5, r: 2, arc: 1.6, part: 0.5 }, fx: 'spikes' },
    { mv: 'shell', t: 0.24, hit: { at: 0.5, r: 2, arc: 1.6, part: 0.5, knock: 1.4 }, fx: 'spikes' },
  ],
  どっしりプレス: [
    { mv: 'head', t: 0.34, jump: 5.5, pounce: true },
    { mv: 'shell', t: 0.24, dive: 11, hit: { at: 0.4, r: 2.1, arc: 3.2, part: 1, knock: 1.8 }, fx: 'splashSlam' },
  ],
  亀スライド: [{ mv: 'head', t: 0.55, go: 6, hit: { contact: true, r: 1.6, arc: 1.2, part: 1, knock: 1.8 }, fx: 'waterTrail' }],
  シェルブレイカー: [
    { mv: 'shell', t: 0.2, go: -0.4 },
    { mv: 'shell', t: 0.36, go: 3.6, hit: { contact: true, r: 1.7, arc: 1.2, part: 1, launch: 7.5 }, fx: 'spikes' },
  ],
  甲羅タイフーン: [
    { mv: 'shell', t: 0.95, spin: true, hit: { n: 4, every: 0.2, at: 0.1, r: 3, arc: 3.2, part: 0.2, knock: 0.8 }, fx: 'whirl' },
    { mv: 'shell', t: 0.3, spin: true, hit: { at: 0.4, r: 3.2, arc: 3.2, part: 0.25, knock: 2.6 }, fx: 'splashSlam' },
  ],
  // ---- 2026-11-05 企画者「同じような技ばっかりもやめて」で 入れかえた技 ----
  // RIOT 跳び退き火炎: 足もとで 炎を はじけさせ、うしろへ 跳んで にげる(当たらない)
  跳び退き火炎: [
    { mv: 'zap', t: 0.16, hit: { at: 0.5, r: 2.3, arc: P, part: 0.8, knock: 2.2 }, fx: 'flameBurst' },
    { mv: 'clawR', t: 0.42, go: -4, jump: 6, ghost: true },
  ],
  // GRIT 押し出し: 肩で ぶつかって 遠くまで 押しとばす
  押し出し: [{ mv: 'shoulder', t: 0.4, go: 2.2, hit: { contact: true, r: 1.6, arc: 1.2, part: 0.7, knock: 6 }, fx: 'shove' }],
  // SNEK 闇の舌: 舌を のばして 引きよせ → かみつく
  闇の舌: [
    { mv: 'zap', t: 0.3, hit: { at: 0.4, cx: 3, r: 1.5, arc: P, part: 0.4, pull: true }, fx: 'tongue' },
    { mv: 'bite', t: 0.26, hit: { at: 0.6, r: 2, arc: 1.2, part: 0.6, knock: 1.6 }, fx: 'darkBite' },
  ],
  // SNEK 影すべり: 影に もぐって 相手の うしろへ → うしろから かみつく
  影すべり: [
    { mv: 'head', t: 0.4, ghost: true, behind: true, fx: 'shadow' },
    { mv: 'bite', t: 0.24, hit: { at: 0.5, r: 1.9, arc: P, part: 1, knock: 1.6 }, fx: 'darkBite' },
  ],
  // VYBE 雷撃ダイブ: 高く跳んで、いなずまに なって 落ちる(まわりにも 落雷)
  雷撃ダイブ: [
    { mv: 'clawR', t: 0.55, jump: 11, pounce: true, fx: 'sparkAura' },
    { mv: 'head', t: 0.3, dive: 16, hit: { at: 0.4, r: 2.4, arc: P, part: 1 }, fx: 'thunderDive' },
  ],
};
