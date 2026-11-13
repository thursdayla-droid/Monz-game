import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { SLOT_COIN_NAME, SlotWallet } from '../core/slot/wallet';
import { pickWeighted, randomSeed, mulberry32, type Rng } from '../core/rng';
import { BETS, CHEST_PAY, dealChests, FREE_ROWS, freeSpin, SYMBOL_WEIGHT, newBonus, newFree, pickChest, REELS, ROWS, SYMBOL_NAME, SYMBOLS, spin, type BonusState, type ChestContent, type FreeSpinResult, type FreeState, type SpinResult, type SymbolId } from '../core/slot/slot';
import { UI_FONT } from '../ui/paint';
import { fillSize, safeInsets } from '../ui/viewport';
import { planShow, STEP_ORDER, type SpinShow } from '../core/slot/reach';
import { pinTextures } from '../render/texBudget';
import { CAB_FILE, CAB_KEY, cabinetLayout, cabinetTexture, type Rect } from './slotCabinet';
import { COIN_ART_FILE, COIN_ART_KEY, coinFountain, cutIn, fitArt, STEP_FILES, idleAnim, LAMP_FILES, lcdRays, NoticeLamp, PUSH_FILE, PUSH_KEY, pushButton, stepUp, tierText } from './slotFx';

/**
 * MONZ SLOT(ミニゲーム⑤)の 画面(2026-11-10 企画者の 仕様書。docs/SLOT.md)。2段目: スロット画面。
 * - たての 全画面。上: 大きな 液晶(リーチ演出は 4段目)・まん中: 5リール×3段・下: コイン・WIN・BET・SPIN
 * - 2026-11-12〜 スロット 専用の コインで 遊ぶ(src/core/slot/wallet.ts。MONZ コインから 交換。もどせない)。回した 時に 結果を 決めて、BET と 当たりを 1回で 保存(SlotWallet.slotSpin)
 * - リールは 左から 順に 自動で 止まる【確定】。止まる 時間は【仮】
 * - 当たりの 見せ方(企画者 2026-11-10「A」): BET 以上 もどる 当たりは 大きく 光る・BET より 少ない 当たりは 細い 枠と WIN の 数字だけ
 * - 図柄の 絵は 企画者の 絵(2026-11-10。読めない 時は プログラムで 描いた 絵)
 * - オートスピン(企画者 2026-11-10): 回数を えらぶ(最大 100回)。ボーナス・コイン不足・もう一度 押すと 止まる。速さは 前の ふつうの 速さ
 * - 宝箱ボーナス【確定】: 液晶に 宝箱 3つ。えらぶ たびに コインを もらって 保存(とちゅうで 閉じても 続きから)
 */
const W = 720;
const BASE_H = 1280;
/** 図柄の マスの 大きさ(台の 絵の リールの 窓に 合わせて 決める。いちばん 大きく 124) */
const CELL_MAX = 124;
const GAP = 8;
const SAVE_KEY = 'monz:slot';
/** 企画者の ROYAL JACKPOT の ロゴ */
const LOGO_KEY = 'slot:logo';
/** 止まる 時間(ms)【仮】: 1つめ・あとは 1つずつ */
// 2026-11-10 企画者「今の 速度は オートの 時で いい。(ふつうは)じゃっかん 遅く」
const STOP_FIRST = 1000;
const STOP_STEP = 340;
/** オートスピンの 時の 止まる 時間(前の ふつうの 速さ。企画者 2026-11-10「今の 速度は オートの 時で いい」) */
export const AUTO_STOP_FIRST = 750;
export const AUTO_STOP_STEP = 260;
/** オートの 回数(企画者 2026-11-10「回数を 決められる ように。最大 100回」)。えらべる 数は【仮】 */
export const AUTO_COUNTS = [10, 25, 50, 100] as const;
const SPIN_SPEED = 2.6; // 1ms に すすむ 点

/** プログラムで 描いた 仮の 図柄(企画者の 絵が 読めなかった 時の 代わり) */
const drawnKey = (s: SymbolId) => `slot:sym:${s}`;
/** 企画者の 図柄の 絵(2026-11-10。元は design/slot/symbols/<名前>.png) */
const artKey = (s: SymbolId) => `slot:symart:${s}`;
const artFile = (s: SymbolId) => `assets/slot/sym_${s}.webp`;
let symScene: Phaser.Scene | null = null;
/** 液晶の 背景(企画者 2026-11-10。元は design/slot/lcd/)。normal ふだん・red 赤い 稲妻・gold 金の 光 */
const LCD_BGS = ['normal', 'red', 'gold'] as const;
type LcdBg = (typeof LCD_BGS)[number];
const lcdBgKey = (n: LcdBg) => `slot:lcd:${n}`;
/** 届いた 説明の 絵(ボーナス・フリーゲームの 前。2026-11-12 企画者が 用意する) */
const GUIDE_ART: readonly string[] = ['bonus', 'free'];
/** 1枚絵の 下の 帯の 文字: 左下の 王冠ランプに かぶらない よう 右へ ずらす 量(点)・使える はば(絵の はばに 対する 割合) */
const BAND_SHIFT = 56;
const BAND_ROOM = 0.7;
/** 企画者の キャラの リーチ(2026-11-11〜。1人 1つ) */
interface StoryReach {
  id: string;
  /** キャラの 絵(design/slot/chara/<名前>_original.png → にせの ます目を 消した → public/assets/slot/chara_<名前>.webp) */
  chara: string;
  charaFile: string;
  /** 題の 色 */
  color: string;
  /** 1枚絵(3枚)。title: 大きい 文字・line: セリフ・chara: キャラを 出す・prop: 仮の 絵の かわりの 絵文字・bg: 仮の 背景の 色 */
  panels: { title?: string; line?: string; chara?: boolean; prop?: string; bg?: number; titleSide?: 'left' | 'right'; crowd?: boolean }[];
  /** 結果。icon: 仮の 絵文字・show: ハズレでも 見せるか */
  /**
   * 届いた 1枚絵(public/assets/slot/reach/<id>_<名前>.webp)。名前: 1・2・3(何枚目)・2-1(2枚目の 1番目の 種類)・win・lose
   * 絵が ある 1枚は 仮の 見た目の かわりに その 絵を 液晶 いっぱいに 出す
   */
  art?: string[];
  win: { text: string; icon: string; show?: boolean; top?: boolean };
  /** top: 文字の 帯を 上に(絵の 下に 大事な ものが ある 時) */
  lose: { text: string; icon: string; show: boolean; top?: boolean };
  /**
   * 種類が ある リーチ(BIG_REACHES の variants と 同じ 順)。panel 番目の 1枚絵の 題・絵・セリフを 種類で かえる。
   * next: その 次の 1枚絵の セリフ(質問 → 答え など)
   */
  variants?: { panel: number; list: { title?: string; prop?: string; color?: string; line?: string; next?: string }[] };
}
const STORY_REACHES: StoryReach[] = [
  {
    // 2026-11-11 企画者 リーチ①: 夜の お店に 可愛い子が いるか。どっちの 子だろう… キョン子なら 当たり・ブタ子なら ハズレ
    id: 'kyon',
    chara: 'slot:chara:kyonk',
    charaFile: 'assets/slot/chara_kyonk.webp',
    art: ['1', '2', '3', 'win', 'lose'],
    color: '#ff6ad5',
    panels: [
      { line: '今夜は\n可愛い子 いるかな〜？', chara: true },
      { title: 'CLUB MONZ', line: 'どっちの 子だ…！？', prop: '👤 ❓ 👤' },
      { line: '入るぞ…！', prop: '🚪' },
    ],
    win: { text: 'キョン子だ！！ 当たり！', icon: '🦌💕' },
    lose: { text: 'ブタ子だった…', icon: '🐷', show: true },
  },
  {
    // 2026-11-11 企画者 リーチ②: 風呂に 入りたくない パンダY が 風呂に 入るか 入らないか。入ったら 当たり
    id: 'panda',
    chara: 'slot:chara:panday',
    charaFile: 'assets/slot/chara_panday.webp',
    art: ['1', '2', '3', 'win', 'lose'],
    color: '#7de8ff',
    panels: [
      { line: '風呂…\nめんどくさいな〜', chara: true },
      // 2026-11-12 企画者「お風呂 わいたよ〜 が かぶってる」→ 絵の 右(ドアの 上)に
      { title: 'お風呂 わいたよ〜', line: '入る…？ 入らない…？', prop: '🛁', bg: 0x0a2a3a, titleSide: 'right' },
      { line: '入るか…！？', prop: '🛁❓', bg: 0x0a2a3a },
    ],
    win: { text: '風呂に 入った！！ 当たり！', icon: '🐼🛁✨' },
    lose: { text: '今日も 風呂キャンセル…', icon: '🐼💤', show: true },
  },
  {
    // 2026-11-11 企画者 リーチ③: アイドルの ライブ。歌って いるのが うさぎの アイドル達なら 当たり・カバの アイドル達なら ハズレ
    id: 'usagi',
    chara: 'slot:chara:usagik',
    charaFile: 'assets/slot/chara_usagik.webp',
    art: ['1', '2', '3', 'win', 'lose'],
    color: '#ffb3e6',
    panels: [
      { line: '今日は 推しの\nライブだぜ！', chara: true },
      { title: 'LIVE STAGE', line: 'だれが 出てくる…！？', prop: '🎤✨', bg: 0x2a0a30 },
      { line: '幕が 上がる…！', prop: '🎭', bg: 0x2a0a30 },
    ],
    win: { text: 'うさぎの アイドル達だ！！ 当たり！', icon: '🐰🎤🐰' },
    lose: { text: 'カバの アイドル達だった…', icon: '🦛🎤🦛', show: true },
  },
  {
    // 2026-11-11 企画者 リーチ④: ラーメンを 食べて 星5！なら 当たり。ラーメンは 3種類で 当たりやすさが ちがう(名前は【仮】)
    id: 'ramen',
    chara: 'slot:chara:kangarooh',
    charaFile: 'assets/slot/chara_kangarooh.webp',
    art: ['1', '2-1', '2-2', '2-3', '3', 'win', 'lose'],
    color: '#ffb347',
    panels: [
      { line: '腹へった〜\nラーメン 食うぞ！', chara: true },
      { line: 'いただきます！', prop: '🍜', bg: 0x2a1408 },
      { title: '評価は…！？', line: 'ズズッ…', prop: '⭐❓', bg: 0x2a1408 },
    ],
    variants: {
      panel: 1,
      list: [
        { title: 'しょうゆラーメン', prop: '🍜', color: '#c8a070' },
        { title: 'みそラーメン', prop: '🍜🔥', color: '#ff9a3a' },
        { title: '特製とんこつラーメン', prop: '🍜✨', color: '#ffd23a' },
      ],
    },
    win: { text: '星5！！ 当たり！', icon: '⭐⭐⭐⭐⭐' },
    lose: { text: '星2… イマイチ…', icon: '⭐⭐', show: true },
  },
  {
    // 2026-11-11 企画者 リーチ⑤: パターを 打って 入れば 当たり。芝生で 当たりやすさが ちがう(名前は【仮】)
    id: 'golf',
    chara: 'slot:chara:hiyokoj',
    charaFile: 'assets/slot/chara_hiyokoj.webp',
    art: ['1', '2-1', '2-2', '2-3', '3', 'win', 'lose'],
    color: '#9dff6a',
    panels: [
      { line: 'この パター\n決めてやる…！', chara: true },
      { line: 'ラインを 読んで…', prop: '⛳', bg: 0x0a2a10 },
      { title: '入るか…！？', line: 'コロコロ…', prop: '⚪ ➡ ⛳', bg: 0x0a2a10 },
    ],
    variants: {
      panel: 1,
      list: [
        { title: 'ボコボコの 芝生', prop: '⛳🪨', color: '#b0a080' },
        { title: 'ふつうの 芝生', prop: '⛳🌱', color: '#7ad85a' },
        { title: 'ピカピカの 芝生', prop: '⛳✨', color: '#ffd23a' },
      ],
    },
    win: { text: 'カップイン！！ 当たり！', icon: '⛳🐤🎉' },
    // 2026-11-13 企画者「ハズレの 時 カップに 入ってる ところが 文字と 重なって 見えなかった」→ 文字は 上に
    lose: { text: 'カップの ふちで 止まった…', icon: '⛳💧', show: true, top: true },
  },
  {
    // 2026-11-11 企画者 リーチ⑥: 彼女に 質問されて 答える。彼女が 喜べば 当たり
    id: 'kanojo',
    chara: 'slot:chara:cheetahs',
    charaFile: 'assets/slot/chara_cheetahs.webp',
    art: ['1', '2', '3', 'win', 'lose'],
    color: '#ff8ab3',
    panels: [
      { line: '今日は\n彼女と デート…', chara: true },
      { title: '彼女', line: '「ねぇ、私の\nどこが 好き？」', prop: '👩❓', bg: 0x2a0a1a },
      { title: '答えは…！？', line: '「えっと… ぜんぶ！」', chara: true },
    ],
    // 2026-11-11 企画者「質問と 答えを 増やす」。毎回 どれか 1つ(どれでも 当たりやすさは 同じ)。中身は【仮】
    // 2026-11-12 企画者「仕事と 私は やめよう」→ 5つ
    variants: {
      panel: 1,
      list: [
        { line: '「ねぇ、私の\nどこが 好き？」', next: '「えっと… ぜんぶ！」' },
        { line: '「ねぇ、私\n太った？」', next: '「ぜ、ぜんぜん！」' },
        { line: '「今日 何の日か\n覚えてる？」', next: '「え… えーっと…」' },
        { line: '「髪 切ったの\n気づいた？」', next: '「と、とっくに 気づいてたよ！」' },
        { line: '「ねぇ、私の\n好きな 食べ物は？」', next: '「…い、いちご！」' },
      ],
    },
    win: { text: '彼女 ごきげん！！ 当たり！', icon: '👩💖🐆' },
    lose: { text: '彼女 おこっちゃった…', icon: '👩💢', show: true },
  },
  {
    // 2026-11-12 企画者「プレミア 演出・100% 当たる」: アライグマR が 電話「みんな どこ？」→ アライグマR が 行く → みんなが バーベキュー して いる
    id: 'premium',
    chara: 'slot:chara:araigumar',
    charaFile: 'assets/slot/chara_araigumar.webp',
    art: ['win', '1', '2', '3'],
    color: '#ffd23a',
    panels: [
      // 2026-11-12 企画者「みんな 集合 じゃなくて みんな どこに いるの？ で アライグマが いく 感じ」
      { title: 'プルルルル…', line: '「もしもし？ みんな どこに いるの？」', chara: true, prop: '📱', bg: 0x3a1a08 },
      { title: '屋上だって！', line: '「今 行く〜！」', chara: true, prop: '🏃💨', bg: 0x2a1408 },
      { title: 'みんな いた！！', line: '「バーベキュー してる〜！」', crowd: true, bg: 0x4a2008 },
    ],
    win: { text: 'プレミア 確定！！ 大当たり！', icon: '🍖🎉👑' },
    lose: { text: '', icon: '', show: false },
  },
];
const symKey = (s: SymbolId) => (symScene?.textures.exists(artKey(s)) ? artKey(s) : drawnKey(s));

interface ReelView {
  imgs: Phaser.GameObjects.Image[];
  offset: number;
  spinning: boolean;
  /** 回る 速さの 倍率(リーチの 時は ゆっくり) */
  speed: number;
}
/** リーチの 時の 時間(ms)【仮】。オートの 時は 0.6倍 */
// 2026-11-11 企画者「タンタンと 進みすぎ。もっと リーチを 長く」→ 約 1.6〜1.7倍【仮。中身は 企画者が 考える】
const SMALL_REACH_MS = 2200;
const BIG_REACH_MS = 4600;
/** 企画者の キャラの リーチは 長め(2026-11-12 企画者「リーチは 楽しみたいから 少し 長めで」→「1枚 1枚 長く」1枚 4.2秒) */
const STORY_REACH_MS = 12600;
/** キャラの リーチの 結果の 絵を 見せる 長さ(この あと さいごの リールが 止まる) */
// 2026-11-12 企画者「当たり ハズレの 絵は もう少し 見たい」→ 2.4 → 4秒 →「3.5秒で 良い」
const STORY_RESULT_MS = 3500;
const LAST_REEL_MS = 1700;
/** 特別フリーゲームの 止まる 時間(2026-11-11 企画者「もう少し ゆっくり」)【仮】 */
// 2026-11-11 企画者「フリーゲーム もっと ゆっくりで いい」→ さらに ゆっくり【仮】
const FREE_STOP_FIRST = 1500;
const FREE_STOP_STEP = 550;

export class SlotScene extends Phaser.Scene {
  private H = BASE_H;
  private cell = CELL_MAX;
  /** 今の 段の 数(ふつう 3・特別フリーゲーム 5) */
  private rows = ROWS;
  /** ふつうの 時の 図柄の 大きさ */
  private baseCell = CELL_MAX;
  /** リールの 窓(この 中に リールを 入れる) */
  private reelWin = { x: 0, y: 0, w: 0, h: 0 };
  private reelBg?: Phaser.GameObjects.Graphics;
  /** 特別フリーゲーム(2026-11-11 企画者) */
  private free?: FreeState;
  private lastFree?: FreeSpinResult;
  /** のこって いる ワイルドの 絵 [リール][段] */
  private stickyImgs: (Phaser.GameObjects.Image | undefined)[][] = [];
  /** フリーゲームの 大きな パネル(液晶と リールの 窓を まとめて おおう)と 上の 帯 */
  private freePanel?: Phaser.GameObjects.Graphics;
  private freeTop?: Phaser.GameObjects.Container;
  /** リールの 見える 範囲(上・下)。回る 図柄が はみ出ない ように */
  private reelClip = { top: 0, bottom: 0 };
  /** 絵の 重なりの 順(フリーゲームの 時は パネルより 前) */
  private get zReel(): number {
    return this.rows === FREE_ROWS ? 6.3 : 2;
  }
  private get reelW(): number {
    return REELS * this.cell + (REELS - 1) * GAP;
  }
  private rng: Rng = mulberry32(randomSeed());
  private bet: number = BETS[0];
  /** 2026-11-12〜 スロット 専用の コイン(MONZ コインでは ない) */
  private record!: SlotWallet;
  private reels: ReelView[] = [];
  private reelX = 0;
  private reelY = 0;
  private busy = false;
  private credit!: Phaser.GameObjects.Text;
  private winText!: Phaser.GameObjects.Text;
  private lcd!: Phaser.GameObjects.Container;
  private lcdBox = { x: 0, y: 0, w: 0, h: 0 };
  private glow: Phaser.GameObjects.GameObject[] = [];
  private betBtns: Phaser.GameObjects.Text[] = [];
  private spinBtn!: Phaser.GameObjects.Container;
  private spinLabel!: Phaser.GameObjects.Text;
  private autoBtn!: Phaser.GameObjects.Container;
  private autoLabel!: Phaser.GameObjects.Text;
  /** オートの 残り(0 なら オートでは ない) */
  private autoLeft = 0;
  private autoNow = false;
  private picker?: Phaser.GameObjects.Container;
  private bonus?: BonusState;
  private lastShow?: SpinShow;
  private countTween?: Phaser.Tweens.Tween;
  private lamp!: NoticeLamp;
  private lcdBgImg?: Phaser.GameObjects.Image;
  private lcdDim?: Phaser.GameObjects.Rectangle;
  private shown = 0;

  constructor() {
    super('Slot');
  }

  private unpin?: () => void;

  preload(): void {
    // スロットの 絵は 先に 読んで あとで 使う(まだ 出ていない 図柄・リーチ・ステップアップ)ので、この 画面の 間は メモリから 外さない
    // (2026-11-12 公開ページで 外されて、王冠・ダイヤが 仮の 絵・ステップアップが 白黒に ならなかった)
    this.unpin?.();
    this.unpin = pinTextures('slot:');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unpin?.();
      this.unpin = undefined;
    });
    // 企画者の 図柄の 絵(メモリから 外されて いたら 読みなおす)
    // 2026-11-12 企画者の ワイルドの 絵(元は design/slot/symbols/wild_original.png)も
    for (const s of [...SYMBOLS, 'wild' as const]) if (!this.textures.exists(artKey(s))) this.load.image(artKey(s), assetUrl(artFile(s)));
    // 企画者の 台の 背景(2026-11-10)
    if (!this.textures.exists(CAB_KEY)) this.load.image(CAB_KEY, assetUrl(CAB_FILE));
    if (!this.textures.exists(PUSH_KEY)) this.load.image(PUSH_KEY, assetUrl(PUSH_FILE));
    for (const [k, f] of LAMP_FILES) if (!this.textures.exists(k)) this.load.image(k, assetUrl(f));
    if (!this.textures.exists(COIN_ART_KEY)) this.load.image(COIN_ART_KEY, assetUrl(COIN_ART_FILE));
    if (!this.textures.exists(LOGO_KEY)) this.load.image(LOGO_KEY, assetUrl('assets/slot/logo.webp'));
    for (const [k, f] of STEP_FILES) if (!this.textures.exists(k)) this.load.image(k, assetUrl(f));
    // 企画者の キャラ(2026-11-11)
    for (const d of STORY_REACHES) {
      if (!this.textures.exists(d.chara)) this.load.image(d.chara, assetUrl(d.charaFile));
      for (const a of d.art ?? []) if (!this.textures.exists(`slot:reach:${d.id}:${a}`)) this.load.image(`slot:reach:${d.id}:${a}`, assetUrl(`assets/slot/reach/${d.id}_${a}.webp`));
    }
    for (const c of CHEST_COLORS) for (const o of [false, true]) if (!this.textures.exists(chestArtKey(c, o))) this.load.image(chestArtKey(c, o), assetUrl(`assets/slot/chest_${c}_${o ? 'o' : 'c'}.webp`));
    // 企画者の 説明の 絵(2026-11-12〜。届いたら public/assets/slot/guide_bonus.webp・guide_free.webp)
    for (const g of GUIDE_ART) if (!this.textures.exists(`slot:guide:${g}`)) this.load.image(`slot:guide:${g}`, assetUrl(`assets/slot/guide_${g}.webp`));
    // 企画者の 液晶の 背景(ふだん・赤・金。2026-11-10)
    for (const n of LCD_BGS) if (!this.textures.exists(lcdBgKey(n))) this.load.image(lcdBgKey(n), assetUrl(`assets/slot/lcd_${n}.webp`));
  }

  create(): void {
    symScene = this;
    this.reels = [];
    this.glow = [];
    this.betBtns = [];
    this.busy = false;
    this.autoLeft = 0;
    this.autoNow = false;
    this.picker = undefined;
    this.bonus = undefined;
    this.free = undefined;
    this.rows = ROWS;
    this.stickyImgs = [];
    this.freeFx = undefined;
    this.freeFxTimers = [];
    this.H = Math.max(BASE_H, fillSize(this, { w: W, h: BASE_H }, { minRatio: 0.4, maxRatio: W / BASE_H }).h);
    this.scale.setGameSize(W, this.H);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(W, BASE_H));
    this.record = new SlotWallet();
    this.bet = loadBet();
    this.shown = this.record.coins;
    for (const s of [...SYMBOLS, 'wild' as const]) if (!this.textures.exists(drawnKey(s))) drawSymbolTexture(this, s);
    for (const c of CHEST_COLORS) for (const o of [false, true]) if (!this.textures.exists(drawnChestKey(c, o))) drawChestTexture(this, c, o);
    this.layout();
    // 2026-11-12 企画者の スロットの 曲
    audio.playBgm('slot');
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.baseCell = this.cell;
    // 特別フリーゲームの とちゅうで 閉じていたら 続きから
    const savedFree = loadSave().free;
    if (savedFree) {
      this.busy = true;
      this.free = savedFree;
      this.time.delayedCall(400, () => {
        this.setRows(FREE_ROWS);
        this.drawSticky();
        this.freeHud('つづきから！');
        this.winText.setText(savedFree.total.toLocaleString()).setColor('#ffd23a');
        this.startFreeFx();
        audio.playBgm('slotBonus');
        this.freeLoop(900);
      });
      return;
    }
    // ボーナスの とちゅうで 閉じていたら 続きから
    const saved = loadSave().bonus;
    if (saved) {
      this.busy = true;
      this.bonus = { ...saved, chests: dealChests(this.rng), over: false };
      audio.playBgm('slotBonus');
      this.time.delayedCall(400, () => this.bonusRound(true));
    }
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 0): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center' }).setOrigin(0.5);
  }

  /** 企画者の 台の 背景を 使って いるか */
  private cab = false;
  private tray: Rect = { x: 24, y: 0, w: W - 48, h: 250 };

  private layout(): void {
    const H = this.H;
    const bottom = H - safeInsets(this).bottom - 24;
    const L = cabinetLayout(W, H, GAP, CELL_MAX);
    const cabKey = cabinetTexture(this, W, H, L);
    this.cab = !!cabKey;
    if (cabKey) {
      // 企画者の 台の 背景(窓に 液晶・リール・ボタンを 合わせる)
      this.add.image(0, 0, cabKey).setOrigin(0, 0).setDepth(-10);
      this.cell = L.cell;
      this.reelWin = { ...L.reel };
      const reelH = this.rows * this.cell + (this.rows - 1) * GAP;
      this.reelX = L.reel.x + (L.reel.w - this.reelW) / 2;
      this.reelY = L.reel.y + (L.reel.h - reelH) / 2;
      this.lcdBox = { x: L.lcd.x, y: L.lcd.y, w: L.lcd.w, h: L.lcd.h };
      this.tray = L.tray;
      // 回っている 図柄が 窓の 外に 見えない ように、窓の 上と 下の 絵を 前に もう一度 置く
      const over = (y0: number, y1: number) => this.add.image(0, 0, cabKey).setOrigin(0, 0).setDepth(6).setCrop(0, y0, W, y1 - y0);
      over(L.lcd.y + L.lcd.h, L.reel.y + 2);
      over(L.reel.y + L.reel.h - 2, L.tray.y);
    } else {
      // 背景(紫の ネオン)。絵が 読めなかった 時
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x2a0f4a, 0x2a0f4a, 0x0d0614, 0x0d0614, 1).fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) bg.fillStyle(i % 2 ? 0xff8a1f : 0x9b5cff, 0.06).fillCircle(Math.random() * W, Math.random() * H, 120 + Math.random() * 160);
      this.cell = CELL_MAX;
      // 下: コイン・WIN(上の 段)と BET・SPIN(下の 段)
      const uiTop = bottom - 250;
      this.tray = { x: 24, y: uiTop, w: W - 48, h: 250 };
      this.reelY = uiTop - 26 - (this.rows * this.cell + (this.rows - 1) * GAP);
      this.reelX = (W - this.reelW) / 2;
      this.reelWin = { x: this.reelX, y: this.reelY, w: this.reelW, h: this.rows * this.cell + (this.rows - 1) * GAP };
      // 上: 液晶
      const top = 96;
      this.lcdBox = { x: 24, y: top, w: W - 48, h: this.reelY - 40 - top };
    }

    // もどる・題
    const back = this.text(86, 46, '◀ もどる', 26).setBackgroundColor('#16101ccc').setPadding(16, 8, 16, 10).setDepth(8).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    if (!this.cab) {
      const title = this.text(W / 2 + 70, 46, 'ROYAL JACKPOT', 40, '#ffd23a', 8).setDepth(8);
      title.setShadow(0, 4, '#9b5cff', 0, true, true);
    }
    // 確認用ページだけ: コインを 足す(確認用ページは コインが 0 から なので)
    if (['Slot', 'SlotTitle'].includes((window as { __MONZ_START?: string }).__MONZ_START ?? '')) {
      const dev = this.text(W - 150, 104, '+10,000 コイン（確認用）', 18, '#16101c').setBackgroundColor('#7de8ff').setPadding(10, 6, 10, 8).setDepth(30).setInteractive({ useHandCursor: true });
      dev.on('pointerdown', () => {
        if (this.busy) return;
        this.record.add(10000);
        this.shown = this.record.coins;
        this.credit.setText(this.shown.toLocaleString());
      });
      // 宝箱ボーナスを すぐ ためす(ふつうは 約 100回に 1回なので)
      const bon = this.text(W - 150, 146, 'ボーナスを ためす（確認用）', 18, '#16101c').setBackgroundColor('#ffd23a').setPadding(10, 6, 10, 8).setDepth(30).setInteractive({ useHandCursor: true });
      bon.on('pointerdown', () => {
        if (this.busy || this.autoLeft > 0) return;
        this.busy = true;
        audio.unlock();
        this.startBonus();
      });
      // 特別フリーゲームを すぐ ためす(2026-11-11)
      const fg = this.text(W - 150, 188, 'フリーゲームを ためす（確認用）', 18, '#16101c').setBackgroundColor('#ff8a1f').setPadding(10, 6, 10, 8).setDepth(30).setInteractive({ useHandCursor: true });
      fg.on('pointerdown', () => {
        if (this.busy || this.autoLeft > 0) return;
        this.busy = true;
        audio.unlock();
        this.startFree(5);
      });
    }

    this.drawLcd();
    this.drawCabinet();
    this.drawReels();
    this.drawUi();
  }

  // ---------------- 液晶(上) ----------------

  private drawLcd(): void {
    const { x, y, w, h } = this.lcdBox;
    if (this.cab) {
      // 台の 絵の 液晶の 窓(ふちは 絵)。少し 色を のせる
      const g0 = this.add.graphics().setDepth(4);
      g0.fillGradientStyle(0x3a1466, 0x5a1a7a, 0x120818, 0x1a0a2a, 0.55).fillRect(x + 4, y + 4, w - 8, h - 8);
      this.makeLcdBg();
      this.lcd = this.add.container(x + w / 2, y + h / 2).setDepth(5);
      this.lcdIdle();
      return;
    }
    // 液晶は リールの 図柄より 前(上から 入って くる 図柄を かくす)
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0xffd23a, 1).fillRoundedRect(x - 8, y - 8, w + 16, h + 16, 26);
    g.fillStyle(0x16101c, 1).fillRoundedRect(x, y, w, h, 20);
    g.fillGradientStyle(0x3a1466, 0x5a1a7a, 0x120818, 0x1a0a2a, 1).fillRect(x + 10, y + 10, w - 20, h - 20);
    this.makeLcdBg();
    this.lcd = this.add.container(x + w / 2, y + h / 2).setDepth(5);
    // 液晶の まわりを 背景の 色で かくす(演出が 液晶の 外に はみ出さない ように)。金の ふちは その 上
    const H = this.H;
    const at = (yy: number) => Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x2a0f4a), Phaser.Display.Color.ValueToColor(0x0d0614), H, yy);
    const col = (yy: number) => { const c = at(yy); return Phaser.Display.Color.GetColor(c.r, c.g, c.b); };
    const cv = this.add.graphics().setDepth(5.5);
    cv.fillGradientStyle(col(0), col(0), col(y - 8), col(y - 8), 1).fillRect(0, 0, W, y - 8);
    cv.fillGradientStyle(col(y), col(y), col(y + h), col(y + h), 1).fillRect(0, y - 8, x - 8, h + 16).fillRect(x + w + 8, y - 8, W - x - w - 8, h + 16);
    const rim = this.add.graphics().setDepth(5.6);
    rim.lineStyle(8, 0xffd23a, 1).strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 22);
    rim.lineStyle(10, 0x16101c, 1).strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, 16);
    this.lcdIdle();
  }

  /** 液晶の 背景の 絵(液晶の 四角に ぴったり。はみ出す 所は 切る) */
  private makeLcdBg(): void {
    const { x, y, w, h } = this.lcdBox;
    this.lcdBgImg = undefined;
    if (!this.textures.exists(lcdBgKey('normal'))) return;
    this.lcdBgImg = this.add.image(x + w / 2, y + h / 2, lcdBgKey('normal')).setDepth(4.2);
    this.lcdDim = this.add.rectangle(x + w / 2, y + h / 2, w - 8, h - 8, 0x0d0614, 0.25).setDepth(4.3);
    this.setLcdBg('normal');
  }

  /** 液晶の 背景を 入れかえる(dim: 上に のせる 暗さ。文字を 読みやすく) */
  private setLcdBg(n: LcdBg, dim = 0.25): void {
    const img = this.lcdBgImg;
    if (!img || !this.textures.exists(lcdBgKey(n))) return;
    const { w, h } = this.lcdBox;
    img.setTexture(lcdBgKey(n));
    const iw = img.frame.width;
    const ih = img.frame.height;
    const iw0 = w - 8;
    const ih0 = h - 8;
    const k = Math.max(iw0 / iw, ih0 / ih);
    img.setScale(k);
    // 見える 所だけ(まん中)
    const cw = iw0 / k;
    const ch = ih0 / k;
    img.setCrop((iw - cw) / 2, (ih - ch) / 2, cw, ch);
    this.lcdDim?.setFillStyle(0x0d0614, dim);
  }

  /** 液晶を 入れかえる */
  private lcdShow(items: Phaser.GameObjects.GameObject[]): void {
    this.lcd.removeAll(true);
    this.lcd.add(items);
  }

  private lcdIdle(): void {
    this.setLcdBg('normal');
    const h = this.lcdBox.h;
    // 企画者の ロゴ(2026-11-10。元は design/slot/logo.png)。ない 時は 文字
    let logo: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.textures.exists(LOGO_KEY)) {
      const img = this.add.image(0, -h * 0.06, LOGO_KEY);
      img.setScale(Math.min((h * 0.72) / img.height, (this.lcdBox.w * 0.82) / img.width));
      logo = img;
    } else {
      const t = this.text(0, -h * 0.12, 'ROYAL JACKPOT', Math.min(90, h * 0.24, this.lcdBox.w * 0.115), '#ffd23a', 10);
      t.setShadow(0, 6, '#ff4ad8', 0, true, true);
      logo = t;
    }
    const sub = this.text(0, this.textures.exists(LOGO_KEY) ? h * 0.38 : h * 0.18, 'SPIN を 押してね', Math.min(30, h * 0.09), '#e8dcf4');
    this.tweens.add({ targets: logo, scale: logo.scale * 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // ⑥ 待っている 間も 液晶が 動く【仮】
    this.lcdShow([...idleAnim(this, this.lcdBox), logo, sub]);
  }

  // ---------------- リール(まん中) ----------------

  private drawCabinet(): void {
    const g = this.add.graphics().setDepth(6.5);
    const x = this.reelX;
    const y = this.reelY;
    const h = this.rows * this.cell + (this.rows - 1) * GAP;
    if (this.cab) {
      // ⑧ 告知ランプ(王冠の 形。液晶の 左下)。枠と 窓の 外を かくすのは 台の 絵
      this.lamp = new NoticeLamp(this, this.lcdBox.x + 50, this.lcdBox.y + this.lcdBox.h - 30, 84);
      return;
    }
    // 枠(金)
    g.lineStyle(10, 0xffd23a, 1).strokeRoundedRect(x - 14, y - 14, this.reelW + 28, h + 28, 18);
    g.lineStyle(4, 0x16101c, 1).strokeRoundedRect(x - 20, y - 20, this.reelW + 40, h + 40, 22);
    // ⑧ 告知ランプ(王冠の 形。液晶の 左下)
    this.lamp = new NoticeLamp(this, this.lcdBox.x + 46, this.lcdBox.y + this.lcdBox.h - 4);
    // リールの 上と 下を かくす 板(回っている 図柄が はみ出ない ように)。上の 板は 液晶の 下の はしまで
    // 液晶の 演出(光の 線など)も はみ出さない ように、リールより 前・液晶より 前
    const cover = this.add.graphics().setDepth(6);
    const lcdBottom = this.lcdBox.y + this.lcdBox.h + 8;
    cover.fillStyle(0x16101c, 1).fillRect(0, lcdBottom, W, y - 14 - lcdBottom);
    cover.fillStyle(0x16101c, 1).fillRect(0, y + h + 14, W, 40 + this.cell);
  }

  private cellPos(r: number, i: number): { x: number; y: number } {
    return { x: this.reelX + r * (this.cell + GAP) + this.cell / 2, y: this.reelY + i * (this.cell + GAP) + this.cell / 2 };
  }

  private drawReels(): void {
    const h = this.rows * this.cell + (this.rows - 1) * GAP;
    const g = this.add.graphics().setDepth(this.rows === FREE_ROWS ? 6.25 : 0);
    this.reelBg = g;
    for (let r = 0; r < REELS; r++) {
      const x = this.reelX + r * (this.cell + GAP);
      g.fillGradientStyle(0xfdf6ff, 0xfdf6ff, 0xd8c8ec, 0xd8c8ec, 1).fillRoundedRect(x, this.reelY, this.cell, h, 12);
    }
    for (let r = 0; r < REELS; r++) {
      const imgs: Phaser.GameObjects.Image[] = [];
      // 見える 3つ + 上に 1つ(回る 時に 上から 入って くる)
      for (let i = -1; i < this.rows; i++) {
        const p = this.cellPos(r, i);
        // いちばん 上の 予備(i = -1)は フリーゲームの 時 見せない(パネルの 上に はみ出す)
        imgs.push(this.add.image(p.x, p.y, symKey(this.randSym())).setDisplaySize(this.cell - 10, this.cell - 10).setDepth(this.zReel).setVisible(!(this.rows === FREE_ROWS && i < 0)));
      }
      this.reels.push({ imgs, offset: 0, spinning: false, speed: 1 });
    }
  }

  /**
   * 回って いる 間に 見える 図柄(見た目 だけ)。2026-11-11 企画者「リールに ずっと 王冠 出ちゃってる」→
   * 前は 8つを 同じ 割合(王冠 1/8)で 出して いた。本当の 出やすさに 合わせ、王冠は 出さない(王冠は 止まった 時だけ)
   */
  private randSym(): SymbolId {
    const items = SYMBOLS.filter((x) => x !== 'crown');
    return pickWeighted(this.rng, items, items.map((x) => SYMBOL_WEIGHT[x]));
  }

  update(_t: number, dt: number): void {
    for (let r = 0; r < this.reels.length; r++) {
      const v = this.reels[r];
      if (!v.spinning) continue;
      v.offset += SPIN_SPEED * v.speed * Math.min(dt, 50);
      const step = this.cell + GAP;
      while (v.offset >= step) {
        v.offset -= step;
        // いちばん 下の 絵を 上へ 回して、新しい 図柄に
        const last = v.imgs.pop()!;
        // 絵の 大きさが ちがう(企画者の 絵 256・仮の ワイルド 160)ので、毎回 大きさを 合わせる
        last.setTexture(symKey(this.randSym())).setDisplaySize(this.cell - 10, this.cell - 10);
        v.imgs.unshift(last);
      }
      v.imgs.forEach((img, k) => {
        img.setY(this.cellPos(r, k - 1).y + v.offset);
        // フリーゲームの パネルの 外に はみ出す 図柄は 見せない
        if (this.rows === FREE_ROWS) img.setVisible(img.y - this.cell / 2 >= this.reelClip.top - 4 && img.y + this.cell / 2 <= this.reelClip.bottom + 4);
      });
    }
  }

  // ---------------- 下の ボタン ----------------

  /** 下の ボタン(コイン・WIN・BET・AUTO・SPIN)。台の 絵の ボタンの 台に 合わせて 置く(画面が 短い 時は 少し 小さく) */
  private drawUi(): void {
    const UW = 672;
    const UH = 250;
    const t = this.tray;
    const k = Math.min(1, t.w / UW, t.h / UH);
    const ui = this.add.container(t.x + (t.w - UW * k) / 2, t.y + (t.h - UH * k) / 2).setDepth(7).setScale(k);
    const g = this.add.graphics();
    ui.add(g);
    // コインと WIN の 箱
    const box = (x: number, w: number, label: string, color: number) => {
      g.fillStyle(0x16101c, 0.92).fillRoundedRect(x, 0, w, 86, 16);
      g.lineStyle(4, color, 1).strokeRoundedRect(x, 0, w, 86, 16);
      ui.add(this.text(x + w / 2, 18, label, 18, '#c8bcd8'));
    };
    box(0, 320, SLOT_COIN_NAME, 0xffd23a);
    box(UW - 320, 320, 'WIN', 0xff8a1f);
    this.credit = this.text(160, 56, this.shown.toLocaleString(), 36, '#ffd23a');
    this.winText = this.text(UW - 160, 56, '0', 36, '#ffffff');
    ui.add([this.credit, this.winText]);

    // BET(10・50・100)
    const by = 180;
    ui.add(this.text(86, by - 52, 'BET', 20, '#c8bcd8'));
    BETS.forEach((b, i) => {
      const bt = this.text(46 + i * 92, by, String(b), 30, '#16101c').setPadding(12, 14, 12, 16).setFixedSize(84, 0);
      bt.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.busy) return;
        audio.se('tap');
        this.bet = b;
        saveBet(b);
        this.paintBets();
      });
      this.betBtns.push(bt);
      ui.add(bt);
    });
    this.paintBets();

    // AUTO(回数を えらぶ・回っている 間は STOP)
    const ac = this.add.container(330, by);
    const abg = this.add.graphics();
    abg.fillStyle(0x16101c, 1).fillRoundedRect(-56, -54, 112, 108, 20);
    abg.fillGradientStyle(0xffd23a, 0xffd23a, 0xff8a1f, 0xff8a1f, 1).fillRoundedRect(-50, -48, 100, 96, 16);
    this.autoLabel = this.text(0, 0, 'AUTO', 26, '#16101c');
    ac.add([abg, this.autoLabel]);
    ac.setSize(112, 108).setInteractive({ useHandCursor: true });
    ac.on('pointerdown', () => this.tapAuto());
    this.autoBtn = ac;
    ui.add(ac);

    // SPIN(大きな 丸い ボタン)
    const c = this.add.container(UW - 130, by);
    const bgc = this.add.graphics();
    bgc.fillStyle(0x16101c, 1).fillRoundedRect(-130, -62, 260, 124, 62);
    bgc.fillGradientStyle(0xc070ff, 0xc070ff, 0x7a2ad0, 0x7a2ad0, 1).fillRoundedRect(-122, -54, 244, 108, 54);
    bgc.lineStyle(6, 0xffd23a, 1).strokeRoundedRect(-122, -54, 244, 108, 54);
    this.spinLabel = this.text(0, 0, 'SPIN', 52, '#ffffff', 8);
    c.add([bgc, this.spinLabel]);
    c.setSize(260, 124).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => (this.autoLeft > 0 ? this.stopAuto() : this.doSpin()));
    this.spinBtn = c;
    ui.add(c);
  }

  // ---------------- オート ----------------

  private tapAuto(): void {
    this.tweens.add({ targets: this.autoBtn, scale: 0.92, duration: 70, yoyo: true });
    if (this.autoLeft > 0) return this.stopAuto();
    if (this.busy || this.picker) return;
    audio.se('tap');
    // 回数を えらぶ
    const c = this.add.container(W / 2, this.reelY + 190).setDepth(40);
    const dim = this.add.rectangle(0, 0, W * 2, this.H * 3, 0x000000, 0.55).setInteractive();
    const panel = this.add.rectangle(0, 0, 600, 330, 0x16101c, 0.97).setStrokeStyle(5, 0xffd23a);
    c.add([dim, panel, this.text(0, -118, 'オート 何回 回す？', 32, '#ffd23a')]);
    AUTO_COUNTS.forEach((n, i) => {
      const b = this.text(-210 + i * 140, -10, `${n}回`, 32, '#16101c').setBackgroundColor('#ffd23a').setPadding(16, 14, 16, 16).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => {
        this.closePicker();
        this.startAuto(n);
      });
      c.add(b);
    });
    const no = this.text(0, 108, 'やめる', 26, '#ffffff').setBackgroundColor('#3a2a4a').setPadding(22, 10, 22, 12).setInteractive({ useHandCursor: true });
    no.on('pointerdown', () => {
      audio.se('back');
      this.closePicker();
    });
    dim.on('pointerdown', () => this.closePicker());
    c.add(no);
    this.picker = c;
  }

  private closePicker(): void {
    this.picker?.destroy();
    this.picker = undefined;
  }

  private startAuto(n: number): void {
    if (this.record.coins < this.bet) {
      audio.se('tap', { pitch: 0.7 });
      this.toast('コインが たりないよ');
      return;
    }
    audio.se('select');
    this.autoLeft = n;
    this.doSpin(true);
  }

  /** オートを 止める(今 回っている 1回は 最後まで) */
  private stopAuto(): void {
    if (this.autoLeft <= 0) return;
    audio.se('back');
    this.autoLeft = 0;
    this.paintAuto();
  }

  private paintAuto(): void {
    const on = this.autoLeft > 0;
    this.spinLabel.setText(on ? `STOP\n残り ${this.autoLeft}` : 'SPIN').setFontSize(on ? 30 : 52);
    this.autoLabel.setText(on ? 'STOP' : 'AUTO');
  }

  /** 1回 おわった 時: オートなら 次へ */
  private afterSpin(): void {
    if (this.autoLeft <= 0) return;
    if (this.record.coins < this.bet) {
      this.toast('コインが たりないよ');
      this.autoLeft = 0;
      this.paintAuto();
      return;
    }
    this.time.delayedCall(350, () => {
      if (this.autoLeft > 0 && !this.busy) this.doSpin(true);
    });
  }

  private paintBets(): void {
    this.betBtns.forEach((t, i) => {
      const on = BETS[i] === this.bet;
      t.setBackgroundColor(on ? '#ffd23a' : '#3a2a4a').setColor(on ? '#16101c' : '#c8bcd8');
    });
  }

  // ---------------- 回す ----------------

  private doSpin(auto = false): void {
    if (this.busy || this.picker) return;
    if (!auto) this.tweens.add({ targets: this.spinBtn, scale: 0.94, duration: 70, yoyo: true });
    if (this.record.coins < this.bet) {
      audio.se('tap', { pitch: 0.7 });
      this.toast('コインが たりないよ');
      this.autoLeft = 0;
      this.paintAuto();
      return;
    }
    // 結果は 先に 決める(リーチ演出は 4段目で これに 合わせて えらぶ)
    const res = spin(this.rng, this.bet);
    if (!this.record.slotSpin(this.bet, res.win)) return;
    this.busy = true;
    this.clearGlow();
    audio.unlock();
    audio.se('whoosh');
    this.shown -= this.bet;
    this.credit.setText(this.shown.toLocaleString());
    this.countTween?.stop();
    this.winText.setText('0').setColor('#ffffff');
    this.lcdIdle();
    this.autoNow = auto && this.autoLeft > 0;
    if (this.autoNow) this.autoLeft--;
    this.paintAuto();
    if (this.autoNow && this.autoLeft === 0) this.spinLabel.setText('SPIN').setFontSize(52);
    // 見せ方(予告・リーチ)を 決める。結果は もう 決まって いる(払い戻し率は 変わらない)
    const show = planShow(res, this.bet, this.rng);
    this.lastShow = show;
    this.crownOn = false;
    this.bigPlayed = false;
    this.crownStory = null;
    const first = this.autoNow ? AUTO_STOP_FIRST : STOP_FIRST;
    for (const v of this.reels) {
      v.spinning = true;
      v.speed = 1;
    }
    this.lamp.off();
    const fast = this.autoNow;
    let t = 0;
    // ⑧ 告知ランプ(回しはじめに 光る 時)
    if (show.lamp === 'pre') this.time.delayedCall(250, () => this.lamp.light());
    // ① ステップアップ予告(② 色)
    // 2026-11-12 企画者「ステップアップは 各リーチの 1枚目の 白黒で。発展するなら 始まる」
    // → 段ごとに ちがう キャラの 白黒。この 回に キャラの リーチが ある 時は さいごの 段が その キャラ(リーチで 色が つく)
    if (show.notice) t += stepUp(this, this.lcd, this.lcdBox, show.notice, show.noticeTier, fast, this.stepFaces()) + 150;
    // ⑨ 連続演出は なくした(2026-11-12 企画者「連続演出とか 文字の 説明系は いらない」)
    this.time.delayedCall(Math.max(first, t + 300), () => this.stopNext(0, res, show));
  }

  /** リールを 1つずつ 止める。2リール目・3リール目の あとで リーチ */
  private stopNext(r: number, res: SpinResult, show: SpinShow): void {
    this.stopReel(r, res, r === REELS - 1);
    if (r === REELS - 1) return;
    const k = this.autoNow ? 0.6 : 1;
    const step = this.autoNow ? AUTO_STOP_STEP : STOP_STEP;
    const next = (ms: number) => this.time.delayedCall(ms, () => this.stopNext(r + 1, res, show));
    // BONUS リーチ(企画者 2026-11-10「2つ 王冠 出たら リーチ 始まっても いい」)。図柄の リーチより 先
    const crownAt = this.crownReachAt(res);
    if (r === crownAt) {
      this.crownOn = true;
      for (let i = r + 1; i < REELS; i++) this.reels[i].speed = 0.32;
      const def = STORY_REACHES.find((d) => d.id === show.crownBig?.id);
      if (def) {
        // 2026-11-12 企画者「王冠 2個 そろって キャラの リーチも」: 王冠を 光らせて キャラの リーチ → のこりの リールを 止めて 結果
        this.crownStory = def;
        res.crownCells.forEach(([cr, ci]) => {
          if (!this.reels[cr].spinning) this.cellGlow(cr, ci, true, 0xffd23a);
        });
        this.storyReach(def, { ...show, big: show.crownBig, bigVariant: show.crownVariant, bigTier: show.crownTier }, STORY_REACH_MS * k);
        return void next(STORY_REACH_MS * k);
      }
      this.crownPanel(1, res);
    }
    if (this.crownStory) return void next(700 * k);
    if (this.crownOn) {
      if (r + 1 === REELS - 1) {
        // さいごの リール: 3つめの 王冠は…！？
        const lead = r === crownAt ? 1600 : 0;
        this.time.delayedCall(lead * k, () => this.crownPanel(2, res));
        return void next((lead + 3300) * k);
      }
      return void next(1600 * k);
    }
    if (r === 1 && show.big) {
      // キャラの リーチ(2026-11-12 企画者「7が 2個 出て リーチ」): 3〜5リール目が ゆっくり・3リール目で 決まる
      for (let i = 2; i < REELS; i++) this.reels[i].speed = 0.35;
      this.markReach(res, show, 2);
      this.bigPlayed = true;
      const bigMs = (STORY_REACHES.some((d) => d.id === show.big?.id) ? STORY_REACH_MS : BIG_REACH_MS) * k;
      this.bigReach(show, bigMs);
      // ③ PUSH ボタン(押すと 3リール目が 止まる)
      if (show.push)
        return void this.time.delayedCall(bigMs, () => pushButton(this, this.lcd, this.lcdBox, show.bigTier, this.autoNow ? 700 : 4000, () => next(250)));
      return void next(bigMs);
    }
    if (r === 1 && show.small) {
      // 小さい リーチ: 3リール目が ゆっくり
      this.smallReach(res, show);
      for (let i = 2; i < REELS; i++) this.reels[i].speed = 0.45;
      return void next(SMALL_REACH_MS * k);
    }
    if (r === 2 && show.small && !show.big) {
      // 小さい リーチ 失敗
      this.lcdIdle();
    }
    // キャラの リーチの 結果の 絵を ゆっくり 見せてから 次の リール(2026-11-12 企画者「リーチは 楽しみたい」)
    if (r === 2 && this.bigPlayed) return void next((STORY_REACHES.some((d) => d.id === show.big?.id) ? STORY_RESULT_MS : LAST_REEL_MS) * k);
    next(step);
  }

  private crownOn = false;
  /** 王冠の BONUS リーチで 見せて いる キャラの リーチ */
  private crownStory: StoryReach | null = null;
  /** この 回転で キャラの リーチを 見せた(王冠の リーチが 先の 時は 見せない) */
  private bigPlayed = false;

  /** 2つめの 王冠が 出る リール(その あとに まだ リールが ある 時だけ)。なければ -1 */
  private crownReachAt(res: SpinResult): number {
    const reels = res.grid.map((col, r) => (col.includes('crown') ? r : -1)).filter((r) => r >= 0);
    return reels.length >= 2 && reels[1] < REELS - 1 ? reels[1] : -1;
  }

  /**
   * BONUS リーチの 1枚絵(企画者の 絵 3枚が 入る ところ【仮】)。
   * 1: 王冠が 2つ そろった・2: 3つめの 王冠は…！？(さいごの リール)・3: 成功(BONUS の 時)
   */
  private crownPanel(n: 1 | 2 | 3, res: SpinResult): void {
    const { w, h } = this.lcdBox;
    const items: Phaser.GameObjects.GameObject[] = [];
    const key = `slot:creach:${n}`;
    if (this.textures.exists(key)) {
      const img = this.add.image(0, 0, key);
      const kk = Math.max((w - 8) / img.width, (h - 8) / img.height);
      img.setScale(kk);
      const cw = (w - 8) / kk;
      const ch = (h - 8) / kk;
      img.setCrop((img.width - cw) / 2, (img.height - ch) / 2, cw, ch);
      items.push(img);
    } else {
      // 仮: 金の 光と 王冠
      this.setLcdBg('gold', n === 2 ? 0.45 : 0.2);
      items.push(lcdRays(this, this.lcdBox, n === 3 ? 0xffffff : 0xffd23a, n === 2 ? 0.18 : 0.3, 14, 0, 0, n === 2 ? 2500 : 5000));
      const crowns = n === 1 ? 2 : 3;
      for (let i = 0; i < crowns; i++) {
        const c = this.add.image((i - (crowns - 1) / 2) * w * 0.22, -h * 0.12, symKey('crown'));
        c.setDisplaySize(h * 0.3, h * 0.3);
        if (n === 2 && i === 2) c.setTint(0x000000).setAlpha(0.6);
        items.push(c);
        this.tweens.add({ targets: c, y: c.y - 8, duration: 300 + i * 60, yoyo: true, repeat: -1 });
      }
    }
    // 2026-11-12 企画者「文字の 説明系は いらない」→ 2枚目の「3つめの 王冠は…！？」は 出さない
    const word = n === 1 ? 'BONUS リーチ！' : n === 2 ? '' : 'BONUS 確定!!';
    const t = this.text(0, h * 0.3, word, Math.min(52, h * 0.13, (w * 0.88) / Math.max(6, word.length)), '#ffd23a', 10);
    t.setShadow(0, 5, '#ff4ad8', 0, true, true);
    items.push(t);
    this.lcdShow(items);
    t.setScale(1.8);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
    if (n === 2) this.tweens.add({ targets: t, scale: 1.06, duration: 220, yoyo: true, repeat: -1, delay: 260 });
    // 王冠を 光らせる(止まって いる リールの)
    if (n === 1)
      res.crownCells.forEach(([r, i]) => {
        if (this.reels[r].spinning) return;
        this.cellGlow(r, i, true, 0xffd23a);
      });
    audio.se(n === 1 ? 'mcSpecial' : n === 2 ? 'mcThunder' : 'koBlast');
    if (n !== 1) this.cameras.main.shake(n === 3 ? 400 : 220, n === 3 ? 0.01 : 0.005);
  }

  /** そろって いる リーチ図柄を 光らせる(reels: 何リール目まで) */
  private markReach(res: SpinResult, show: SpinShow, reels: number): void {
    if (!show.reach) return;
    for (let r = 0; r < reels; r++)
      res.grid[r].forEach((x, i) => {
        if (x !== show.reach!.symbol) return;
        const p = this.cellPos(r, i);
        const f = this.add.rectangle(p.x, p.y, this.cell - 2, this.cell - 2).setStrokeStyle(6, 0xffd23a).setDepth(3);
        this.tweens.add({ targets: f, alpha: 0.3, duration: 260, yoyo: true, repeat: -1 });
        // ④ そろいそうな 図柄が ふるえる
        const img = this.reels[r].imgs[i + 1];
        if (!this.glow.includes(img)) {
          this.tweens.add({ targets: img, angle: { from: -7, to: 7 }, duration: 90, yoyo: true, repeat: -1 });
          this.glow.push(img);
        }
        this.glow.push(f);
      });
  }

  /** 大きい リーチの 成功・失敗【仮の 見た目】 */
  private reachResult(ok: boolean): void {
    const story = STORY_REACHES.find((d) => d.id === this.lastShow?.big?.id);
    if (story) return this.storyResult(story, ok);
    const h = this.lcdBox.h;
    if (ok) {
      this.setLcdBg('gold', 0.1);
      const t = this.text(0, 0, '成功!!', Math.min(110, h * 0.3), '#ffd23a', 12);
      this.lcdShow([this.add.rectangle(0, 0, this.lcdBox.w - 20, h - 20, 0xffffff, 0.35), t]);
      t.setScale(2.4);
      this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.cameras.main.flash(260, 255, 255, 200);
      audio.se('koBlast');
    } else {
      // 2026-11-10 企画者「ざんねんは いらない」→ 失敗の 時は 何も 出さずに もとの 液晶へ
      this.lcdIdle();
    }
  }

  /** 小さい リーチ【仮の 見た目】 */
  private smallReach(res: SpinResult, show: SpinShow): void {
    const h = this.lcdBox.h;
    this.markReach(res, show, 2);
    const t = this.text(0, -h * 0.05, 'リーチ！', Math.min(96, h * 0.26), '#ffd23a', 12);
    t.setShadow(0, 6, '#ff4ad8', 0, true, true);
    // 2026-11-12 企画者「文字の 説明系は いらない」→「○○ が そろうか…？」・連続演出は 出さない
    this.lcdShow([t]);
    this.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, scale: 1.06, duration: 300, yoyo: true, repeat: -1, delay: 260 });
    audio.se('mcCutin');
  }

  /** 大きい リーチ【仮の 見た目】。企画者の リーチ演出(7種類くらい)が 入る ところ */
  /**
   * 企画者の キャラの リーチ(STORY_REACHES)。3枚の 1枚絵(今は 仮の 見た目。キャラは 企画者の 絵)→ 4リール目で 結果。
   * 1枚絵が 届いたら panels[i].art(slot:reach:<id>:<i>)を 置けば その 絵を 液晶 いっぱいに 出す
   */
  private storyReach(def: StoryReach, show: SpinShow, ms: number): void {
    const { w, h } = this.lcdBox;
    this.setLcdBg('normal', 0.5);
    const panel = (n: number) => {
      let pd = def.panels[n];
      let color = def.color;
      const v = def.variants ? def.variants.list[show.bigVariant] : undefined;
      if (v && def.variants!.panel === n) {
        pd = { ...pd, title: v.title ?? pd.title, prop: v.prop ?? pd.prop, line: v.line ?? pd.line };
        color = v.color ?? color;
      }
      if (v?.next && def.variants!.panel + 1 === n) pd = { ...pd, line: v.next };
      const items: Phaser.GameObjects.GameObject[] = [];
      const vKey = v && def.variants!.panel === n ? `slot:reach:${def.id}:${n + 1}-${show.bigVariant + 1}` : '';
      const artKey = vKey && this.textures.exists(vKey) ? vKey : `slot:reach:${def.id}:${n + 1}`;
      const hasArt = this.textures.exists(artKey);
      const ab = this.artBox();
      if (hasArt) items.push(...this.reachArt(artKey, ab));
      else {
        items.push(this.add.rectangle(0, 0, w - 8, h - 8, pd.bg ?? 0x120818, 0.6));
        if (pd.chara && this.textures.exists(def.chara)) {
          const k = this.add.image(-w * 0.28, h * 0.08, def.chara);
          k.setScale((h * 0.95) / k.height);
          if (n === 0) {
            k.setX(-w * 0.7);
            this.tweens.add({ targets: k, x: -w * 0.28, duration: 420, ease: 'Back.easeOut' });
          } else this.tweens.add({ targets: k, y: k.y - 8, duration: 260, yoyo: true, repeat: -1 });
          items.push(k);
        }
        if (pd.prop) items.push(this.text(pd.chara ? w * 0.14 : 0, -h * 0.02, pd.prop, Math.min(70, h * 0.2), '#ffffff', 0));
        // みんなが 集まる(全員の キャラを 横に ならべて 1人ずつ とび出す)【仮の 見た目】
        if (pd.crowd) {
          const keys = STORY_REACHES.map((d) => d.chara).filter((k) => this.textures.exists(k));
          keys.forEach((k, i) => {
            const im = this.add.image((i - (keys.length - 1) / 2) * ((w - 40) / keys.length), h * 0.12, k);
            im.setScale((h * 0.55) / im.height);
            const y0 = im.y;
            im.setY(h);
            this.tweens.add({ targets: im, y: y0, duration: 300, delay: i * 180, ease: 'Back.easeOut' });
            items.push(im);
          });
        }
      }
      if (hasArt) {
        // 絵が ある 時: 文字は 上と 下の 帯に 1行で(絵の キャラに かぶらない)
        const bandH = Math.min(h * 0.15, 52);
        const top = ab.cy - ab.h / 2;
        const bot = ab.cy + ab.h / 2;
        // titleSide: 題を 左か 右に 寄せる(絵の キャラに かぶる 時)
        const side = pd.titleSide === 'right' ? 1 : pd.titleSide === 'left' ? -1 : 0;
        const tw = side ? ab.w * 0.48 : ab.w;
        const tx0 = ab.cx + side * (ab.w / 2 - tw / 2);
        if (pd.title) items.push(this.add.rectangle(tx0, top + bandH / 2, tw, bandH, 0x000000, 0.55));
        if (pd.line) items.push(this.add.rectangle(ab.cx, bot - bandH / 2, ab.w, bandH, 0x000000, 0.55));
        const fit = (t: string, max: number, room = 0.9) => Math.min(max, bandH * 0.62, (ab.w * room) / t.length);
        if (pd.title) items.push(this.text(tx0, top + bandH / 2, pd.title, Math.min(fit(pd.title, 38), (tw * 0.9) / pd.title.length), color, 6));
        if (pd.line) {
          const one = pd.line.replace(/\n/g, ' ');
          const y = bot - bandH / 2;
          // 下の 帯は 左下の 王冠ランプに かぶらない よう 少し 右へ
          const bx = ab.cx + BAND_SHIFT;
          items.push(n === def.panels.length - 1 ? tierText(this, bx, y, one, fit(one, 36, BAND_ROOM), show.bigTier) : this.text(bx, y, one, fit(one, 30, BAND_ROOM), '#ffffff', 5));
        }
        pd = { ...pd, title: undefined, line: undefined };
      }
      const tx = pd.chara && !hasArt ? w * 0.14 : 0;
      if (pd.title) items.push(this.text(tx, -h * 0.3, pd.title, Math.min(40, h * 0.11, (w * 0.62) / pd.title.length), color, 8));
      if (pd.line) {
        const t = n === def.panels.length - 1 ? tierText(this, tx, h * 0.3, pd.line, Math.min(36, h * 0.095, ((pd.chara && !hasArt ? 0.62 : 0.9) * w) / Math.max(...pd.line.split('\n').map((l) => l.length))), show.bigTier) : this.text(tx, h * 0.24, pd.line, Math.min(28, h * 0.075), '#ffffff', 6);
        items.push(t);
      }
      // 漫画の「ゴゴゴ」みたいな 文字(2026-11-12 企画者「漫画の ズズズ みたいな ワクワク感」)。2枚目 ゴゴゴ・3枚目 ドドド
      // 題を 右に 寄せた 1枚は ゴゴゴを 左に
      if (n > 0) items.push(...this.mangaSfx(n === def.panels.length - 1 ? 'ドドドド' : 'ゴゴゴゴ', n === def.panels.length - 1, def.panels[n].titleSide === 'right' ? -1 : 1, hasArt ? ab : undefined));
      this.lcdShow(items);
      audio.se(n === 0 ? 'mcCutin' : n === def.panels.length - 1 ? 'mcThunder' : 'mcSelect');
      if (n === def.panels.length - 1) this.cameras.main.shake(220, 0.004);
    };
    const step = ms / def.panels.length;
    def.panels.forEach((_, i) => (i === 0 ? panel(0) : this.time.delayedCall(step * i, () => panel(i))));
  }

  /**
   * 漫画の 書き文字(ゴゴゴ・ドドド)。液晶の 左右に たて書きで 1文字ずつ 出て、ずっと ふるえる。
   * big: さいごの 1枚(左右 両方・大きく)
   */
  private mangaSfx(word: string, big: boolean, side1 = 1, box?: { cx: number; cy: number; w: number; h: number }): Phaser.GameObjects.GameObject[] {
    const { w, h } = box ?? this.lcdBox;
    const ox = box?.cx ?? 0;
    const oy = box?.cy ?? 0;
    const out: Phaser.GameObjects.GameObject[] = [];
    const size = Math.round(h * (big ? 0.15 : 0.13));
    const sides = big ? [-1, 1] : [side1];
    sides.forEach((side, si) => {
      [...word].forEach((ch, i) => {
        const x = ox + side * (w / 2 - size * 0.75) + (i % 2 ? -side * size * 0.18 : 0);
        const y = oy - h * 0.3 + i * size * 0.92 + (side < 0 ? size * 0.4 : 0);
        const t = this.add
          .text(x, y, ch, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color: big ? '#ffe14a' : '#f2e6ff', stroke: '#2a0638', strokeThickness: Math.max(5, size * 0.16) })
          .setOrigin(0.5)
          .setAngle(side * -12 + (i % 2 ? 6 : -4))
          .setScale(0);
        t.setShadow(3, 3, '#000000', 0, true, true);
        const delay = (si * word.length + i) * 110;
        this.tweens.add({ targets: t, scale: 1, duration: 180, delay, ease: 'Back.easeOut' });
        // ふるえる
        this.tweens.add({ targets: t, x: x + (big ? 3 : 2), y: y - (big ? 2 : 1), duration: 45, delay: delay + 180, yoyo: true, repeat: -1 });
        out.push(t);
      });
    });
    return out;
  }

  /** ステップアップに 使う 白黒の 1枚目(段の 数だけ)。順番は キョンK・パンダY・カンガルーH・ヒヨコJ・チーターS(企画者 2026-11-12) */
  private stepFaces(): string[] | undefined {
    const all = STEP_ORDER.map((id) => this.grayFirst(id));
    // 段の 数の 目もりは 全部の キャラぶん(6つ)。出すのは 今の 段まで
    return all.every((k): k is string => !!k) ? (all as string[]) : undefined;
  }

  /** キャラの リーチの 1枚目を 白黒に した 絵(なければ 作る)。1枚目の 絵が なければ undefined */
  private grayFirst(id: string): string | undefined {
    const src = `slot:reach:${id}:1`;
    const key = `${src}:gray`;
    if (this.textures.exists(key)) return key;
    if (!this.textures.exists(src)) return undefined;
    const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
    const t = this.textures.createCanvas(key, img.width, img.height);
    const ctx = t?.getContext();
    if (!t || !ctx) return undefined;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const g = Math.min(255, (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) * 1.05);
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
    t.refresh();
    return key;
  }

  /** リーチの 1枚絵(上と 下は 少しだけ 切って 大きく。あまった 左右は 同じ 絵を 暗く。fitArt) */
  private reachArt(key: string, box = this.artBox()): Phaser.GameObjects.GameObject[] {
    return fitArt(this, key, box.cx, box.cy, box.w, box.h, 0x3a3048);
  }

  /**
   * リーチの 1枚絵を 出す 場所(液晶の まん中から 見た 位置)。
   * 2026-11-12 企画者「もう少し 大きく」→ 画面 いっぱいに したが「液晶内には 収めて 欲しい」→ 液晶 いっぱい(ふちの 内がわ)
   */
  private artBox(): { cx: number; cy: number; w: number; h: number } {
    const { w, h } = this.lcdBox;
    return { cx: 0, cy: 0, w: w - 6, h: h - 6 };
  }


  /** 企画者の キャラの リーチの 結果(当たりの 絵・ハズレの 絵)【仮の 見た目】 */
  private storyResult(def: StoryReach, ok: boolean): void {
    const { w, h } = this.lcdBox;
    const r = ok ? def.win : def.lose;
    const items: Phaser.GameObjects.GameObject[] = [];
    if (ok) this.setLcdBg('gold', 0.1);
    const artKey = `slot:reach:${def.id}:${ok ? 'win' : 'lose'}`;
    const ab = this.artBox();
    if (this.textures.exists(artKey)) items.push(...this.reachArt(artKey, ab));
    else {
      items.push(this.add.rectangle(0, 0, w - 8, h - 8, ok ? 0xffd0ec : 0x3a2a2a, ok ? 0.35 : 0.6));
      const icon = this.text(0, -h * 0.06, r.icon, Math.min(110, h * 0.32), '#ffffff', 0);
      items.push(icon);
      icon.setScale(0.3);
      this.tweens.add({ targets: icon, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }
    const art = this.textures.exists(artKey);
    const bandH = Math.min(h * 0.15, 52);
    const by = r.top ? ab.cy - ab.h / 2 + bandH / 2 : ab.cy + ab.h / 2 - bandH / 2;
    // プレミアの 当たりの 絵は 絵の 中に「大当たり」の 文字が ある(企画者 2026-11-12)ので 帯と 文字は 出さない
    const artHasText = art && def.id === 'premium' && ok;
    if (art && !artHasText) items.push(this.add.rectangle(ab.cx, by, ab.w, bandH, 0x000000, 0.55));
    if (!artHasText) items.push(this.text(r.top ? 0 : BAND_SHIFT, art ? by : h * 0.33, r.text, Math.min(ok ? 42 : 36, art ? bandH * 0.62 : h * 0.1, ((art ? ab.w : w) * BAND_ROOM) / r.text.length), ok ? '#ffd23a' : '#d8c8e8', 8));
    this.lcdShow(items);
    if (ok) {
      this.cameras.main.flash(260, 255, 230, 200);
      audio.se('koBlast');
      // プレミアは さらに ハデに(虹の 光・コイン・大きな ゆれ)
      if (def.id === 'premium') {
        this.lcd.addAt(lcdRays(this, this.lcdBox, 0xffd23a, 0.35, 18, 0, 0, 3000), 1);
        coinFountain(this, W / 2, this.lcdBox.y + this.lcdBox.h / 2, 60);
        this.cameras.main.shake(500, 0.01);
        audio.se('cheer');
      }
    } else if (r.show) {
      audio.se('back');
      this.time.delayedCall(STORY_RESULT_MS - 200, () => this.lcdIdle());
    } else this.lcdIdle();
  }

  private bigReach(show: SpinShow, ms: number): void {
    const story = STORY_REACHES.find((d) => d.id === show.big?.id);
    if (story) return this.storyReach(story, show, ms);
    // 液晶の 背景: 赤は 赤い 稲妻・金と 虹は 金の 光・青と 緑は ふだんの 背景を 暗く
    if (show.bigTier === 'red') this.setLcdBg('red', 0.15);
    else if (show.bigTier === 'gold' || show.bigTier === 'rainbow') this.setLcdBg('gold', 0.1);
    else this.setLcdBg('normal', 0.45);
    const type = show.big!;
    const { w, h } = this.lcdBox;
    const col = type.id === 'strong' ? 0xb46aff : type.id === 'mid' ? 0x3a9dff : 0x3ec46a;
    const items: Phaser.GameObjects.GameObject[] = [];
    const bg = this.add.rectangle(0, 0, w - 20, h - 20, 0x000000, this.lcdBgImg ? 0.12 : 0.5);
    const rays = lcdRays(this, this.lcdBox, col, 0.28, 16);
    // 仮の キャラ(シルエット)
    const sil = this.add.graphics();
    sil.fillStyle(0x16101c, 0.95).fillCircle(0, -40, 46).fillRoundedRect(-60, 4, 120, 110, 30);
    sil.setPosition(-w * 0.6, h * 0.12);
    this.tweens.add({ targets: sil, x: -w * 0.26, duration: 380, ease: 'Back.easeOut' });
    // ② 文字の 色で 期待度(青 → 緑 → 赤 → 金 → 虹)
    const t = tierText(this, w * 0.1, -h * 0.2, 'リーチ!!', Math.min(100, h * 0.27), show.bigTier);
    const name = this.text(w * 0.1, h * 0.05, type.name, Math.min(28, h * 0.075), '#ffffff', 6);
    const note = this.text(0, h * 0.4, '（企画者の リーチ演出が 入る ところ）', 16, '#c8bcd8');
    // ドキドキの ゲージ
    const barW = w * 0.7;
    const bar = this.add.rectangle(-barW / 2, h * 0.28, 4, 16, 0xffd23a).setOrigin(0, 0.5);
    const frame = this.add.rectangle(0, h * 0.28, barW + 8, 24).setStrokeStyle(3, 0xffffff, 0.8);
    this.tweens.add({ targets: bar, width: barW, duration: ms - 200 });
    items.push(bg, rays, sil, t, name, frame, bar, note);
    this.lcdShow(items);
    this.tweens.add({ targets: t, scale: { from: 2.2, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    this.cameras.main.shake(200, 0.005);
    audio.se('mcSpecial');
    this.time.delayedCall(ms * 0.6, () => audio.se('mcThunder'));
    // ⑦ カットイン(とちゅうで キャラが 入る)
    this.time.delayedCall(ms * 0.35, () => cutIn(this, this.lcd, this.lcdBox, type.name.replace('【仮】', ''), show.bigTier));
  }

  private stopReel(r: number, res: SpinResult, last: boolean): void {
    const v = this.reels[r];
    v.spinning = false;
    v.offset = 0;
    // 上に 1つ 余分(見えない)+ 結果の 3つ。少し 上から 落として ぽんと 止める
    const col = [this.randSym(), ...res.grid[r]];
    v.imgs.forEach((img, k) => {
      // 止まったら 見える 段は 全部 出す(いちばん 上の 予備は フリーゲームの 時 かくす)
      img.setVisible(!(this.rows === FREE_ROWS && k === 0));
      // 2026-11-11 企画者「ワイルドの あと マークが デカく なる」→ 絵を かえたら 大きさも 合わせる
      this.tweens.killTweensOf(img);
      img.setTexture(symKey(col[k])).setDisplaySize(this.cell - 10, this.cell - 10).setAngle(0);
      const y = this.cellPos(r, k - 1).y;
      img.setY(y - 46);
      this.tweens.add({ targets: img, y, duration: 200, ease: 'Back.easeOut' });
    });
    audio.se('knock', { pitch: 1 + r * 0.05 });
    if (last && this.crownStory && !this.free) {
      // 王冠の キャラの リーチの 結果(王冠 3つ 以上 = 当たり)を 見せてから
      const def = this.crownStory;
      this.time.delayedCall(260, () => {
        this.storyResult(def, res.bonus || res.free > 0);
        this.time.delayedCall(STORY_RESULT_MS * (this.autoNow ? 0.6 : 1), () => this.reveal(res));
      });
    } else if (last) this.time.delayedCall(260, () => (this.free ? this.revealFree() : this.reveal(res)));
    // 大きい リーチの 結果(4リール目が 止まった 時に わかる)
    if (r === 2 && this.bigPlayed && this.lastShow?.big) this.reachResult(this.lastShow.bigSuccess);
  }

  private reveal(res: SpinResult): void {
    const big = res.win >= this.bet;
    const show = this.lastShow;
    // ⑧ 告知ランプ(止まった あとに 光る 時)
    if (show?.lamp === 'post') this.lamp.light();
    // ⑤ 大きい 当たり: リールが 光って コインが あふれる
    if (show?.fountain) {
      this.reelFlash();
      coinFountain(this, W / 2, this.reelY + 200, Math.min(90, 20 + Math.round((res.win / this.bet) * 2)));
    }
    this.shown += res.win;
    if (res.win > 0) {
      // 当たった マス(同じ マスが 2つの 当たりに 入る ことも ある)
      const cells = new Map<string, [number, number]>();
      for (const w of res.wins) for (const c of w.cells) cells.set(c.join(), c);
      for (const [r, i] of cells.values()) this.cellGlow(r, i, big);
      this.countUp(res.win, big);
    }
    if (res.win >= this.bet * 5) this.setLcdBg('gold', 0.2);
    if (big) {
      audio.se('cheer');
      const h = this.lcdBox.h;
      const t = this.text(0, -h * 0.08, 'WIN!', Math.min(120, h * 0.34), '#ffd23a', 12);
      t.setShadow(0, 8, '#ff4ad8', 0, true, true);
      const n = this.text(0, h * 0.26, `+${res.win.toLocaleString()}`, Math.min(54, h * 0.16), '#ffffff', 8);
      const names = res.wins.map((w) => `${SYMBOL_NAME[w.symbol]} ${w.length}連 ${w.ways}WAYS`).join('・');
      const sub = this.text(0, h * 0.42, names, 18, '#e8dcf4');
      this.lcdShow([t, n, sub]);
      t.setScale(2.4);
      this.tweens.add({ targets: t, scale: 1, duration: 320, ease: 'Back.easeOut' });
      this.cameras.main.shake(180, 0.004);
    } else if (res.win > 0) audio.se('tap', { pitch: 1.3 });
    this.credit.setText(this.shown.toLocaleString());
    const feature = res.bonus || res.free > 0;
    if (feature && this.crownOn) {
      // BONUS リーチ 成功: 1枚絵の 3枚目 → BONUS!!
      this.crownOn = false;
      this.autoLeft = 0;
      this.paintAuto();
      const shown = !!this.crownStory;
      if (!shown) this.crownPanel(3, res);
      this.cameras.main.flash(300, 255, 230, 120);
      this.time.delayedCall(shown ? 400 : 2000, () => (res.free ? this.freeIntro(res) : this.bonusIntro(res, big)));
      return;
    }
    if (!feature && this.crownOn) {
      // 失敗の 時は 何も 出さずに もとへ(企画者「ざんねんは いらない」)
      this.crownOn = false;
      if (!big) this.lcdIdle();
    }
    if (res.free) {
      this.freeIntro(res);
      return;
    }
    if (res.bonus) {
      this.bonusIntro(res, big);
      return;
    }
    this.time.delayedCall(big ? 500 : 150, () => {
      this.busy = false;
      this.afterSpin();
    });
  }

  /** BONUS!! の 文字 → 宝箱ボーナスへ */
  private bonusIntro(res: SpinResult, big: boolean): void {
    // 宝箱ボーナス(オートは 止まる。企画者 2026-11-10)
    this.autoLeft = 0;
    this.paintAuto();
    for (const [r, i] of res.crownCells) this.cellGlow(r, i, true, 0xffd23a);
    const h = this.lcdBox.h;
    const t = this.text(0, -h * 0.14, 'BONUS!!', Math.min(120, h * 0.32), '#ffd23a', 12);
    t.setShadow(0, 8, '#ff4ad8', 0, true, true);
    const s = this.text(0, h * 0.2, 'TREASURE CHALLENGE', Math.min(40, h * 0.11), '#ffffff', 8);
    this.lcdShow([t, s]);
    t.setScale(2.6);
    this.tweens.add({ targets: t, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.cameras.main.flash(300, 255, 220, 80);
    audio.se('koBlast');
    this.time.delayedCall(big ? 2200 : 1700, () => this.startBonus());
  }

  // ---------------- 特別フリーゲーム(2026-11-11 企画者) ----------------

  /** 段の 数を かえて リールを 作りなおす(ふつう 3段・特別フリーゲーム 5段)。窓の 中に おさまる 大きさに */
  private setRows(n: number): void {
    this.clearGlow();
    for (const v of this.reels) v.imgs.forEach((i) => i.destroy());
    this.reels = [];
    this.reelBg?.destroy();
    for (const col of this.stickyImgs)
      for (const i of col) {
        (i?.getData('frame') as Phaser.GameObjects.Rectangle | undefined)?.destroy();
        i?.destroy();
      }
    this.stickyImgs = [];
    this.rows = n;
    // 2026-11-11 企画者「フリーゲームの 左上に 王冠 出っぱなし」→ 告知ランプ(王冠の 形)は フリーゲームの 間 かくす
    this.lamp?.show(n === ROWS);
    this.freePanel?.destroy();
    this.freePanel = undefined;
    this.freeTop?.destroy();
    this.freeTop = undefined;
    const win = this.reelWin;
    if (n === ROWS) {
      this.cell = this.baseCell;
      const h = n * this.cell + (n - 1) * GAP;
      this.reelX = win.x + (win.w - this.reelW) / 2;
      this.reelY = win.y + (win.h - h) / 2;
    } else {
      // 液晶の 上から リールの 窓の 下までを 大きな パネルに(5段でも 図柄を 大きく)
      const top = this.lcdBox.y - 4;
      const bottom = win.y + win.h + 4;
      const x = Math.min(win.x, this.lcdBox.x) - 4;
      const w = Math.max(win.x + win.w, this.lcdBox.x + this.lcdBox.w) + 4 - x;
      const hud = 84;
      this.cell = Math.min(this.baseCell, Math.floor((bottom - top - hud - 20 - (n - 1) * GAP) / n), Math.floor((w - 20 - (REELS - 1) * GAP) / REELS));
      const h = n * this.cell + (n - 1) * GAP;
      this.reelX = x + (w - this.reelW) / 2;
      this.reelY = top + hud + (bottom - top - hud - h) / 2;
      const g = this.add.graphics().setDepth(6.2);
      g.fillStyle(0x16101c, 1).fillRoundedRect(x, top, w, bottom - top, 18);
      g.fillGradientStyle(0x3a1466, 0x3a1466, 0x120818, 0x120818, 1).fillRoundedRect(x + 6, top + 6, w - 12, hud - 10, 12);
      g.lineStyle(6, 0xffd23a, 1).strokeRoundedRect(x, top, w, bottom - top, 18);
      this.freePanel = g;
      this.freeTop = this.add.container(x + w / 2, top + hud / 2).setDepth(6.8);
      this.reelClip = { top: this.reelY, bottom: this.reelY + h };
    }
    this.drawReels();
  }

  /** のこって いる ワイルドを 絵で 出す(リールが 回っても 動かない) */
  private drawSticky(): void {
    const f = this.free;
    if (!f) return;
    for (let r = 0; r < REELS; r++) {
      this.stickyImgs[r] ??= [];
      for (let i = 0; i < this.rows; i++) {
        if (!f.sticky[r][i] || this.stickyImgs[r][i]) continue;
        const p = this.cellPos(r, i);
        const img = this.add.image(p.x, p.y, symKey('wild')).setDisplaySize(this.cell - 6, this.cell - 6).setDepth(this.zReel + 0.3);
        const frame = this.add.rectangle(p.x, p.y, this.cell - 2, this.cell - 2).setStrokeStyle(4, 0xffd23a).setDepth(this.zReel + 0.4);
        img.setData('frame', frame);
        this.stickyImgs[r][i] = img;
      }
    }
  }

  /** フリーゲームの 上の 帯: のこりの 回数と 合計・ひとこと */
  /** 回して いる 間に 出す のこり回数(リールが 止まるまで 前の 数の まま) */
  private freeShownLeft?: number;
  /** 回して いる 間に 出す 合計(2026-11-11 企画者「合計が 先に 出て 当たりが 分かる」→ 止まるまで 前の 合計)*/
  private freeShownTotal?: number;

  private freeHud(msg = ''): void {
    const f = this.free;
    const c = this.freeTop;
    if (!f || !c) return;
    const left = this.freeShownLeft ?? f.left;
    const total = this.freeShownTotal ?? f.total;
    c.removeAll(true);
    const t = this.text(-this.reelW / 2 + 70, -14, 'FREE GAME', 24, '#ffd23a', 6);
    t.setShadow(0, 3, '#ff4ad8', 0, true, true);
    c.add(t);
    c.add(this.text(-this.reelW / 2 + 70, 16, `のこり ${left}回`, 24, '#ffffff', 5));
    c.add(this.text(this.reelW / 2 - 100, -14, '合計', 18, '#c8bcd8'));
    c.add(this.text(this.reelW / 2 - 100, 14, `+${total.toLocaleString()}`, 30, '#ffd23a', 6));
    if (msg) {
      const m = this.text(10, 0, msg, 22, '#ff8a1f', 6);
      c.add(m);
      this.tweens.add({ targets: m, scale: { from: 1.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    }
  }

  /** 王冠 4個・5個 → FREE GAME!! */
  private freeIntro(res: SpinResult): void {
    this.autoLeft = 0;
    this.paintAuto();
    for (const [r, i] of res.crownCells) this.cellGlow(r, i, true, 0xffd23a);
    const h = this.lcdBox.h;
    this.setLcdBg('gold', 0.1);
    const t = this.text(0, -h * 0.14, 'FREE GAME!!', Math.min(100, h * 0.26, this.lcdBox.w * 0.13), '#ffd23a', 12);
    t.setShadow(0, 8, '#ff4ad8', 0, true, true);
    const s = this.text(0, h * 0.2, `王冠 ${res.crowns}個！ ${res.free}回`, Math.min(44, h * 0.12), '#ffffff', 8);
    this.lcdShow([lcdRays(this, this.lcdBox, 0xffd23a, 0.3, 16), t, s]);
    t.setScale(2.6);
    this.tweens.add({ targets: t, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.cameras.main.flash(350, 255, 230, 120);
    this.cameras.main.shake(400, 0.01);
    audio.se('koBlast');
    this.time.delayedCall(300, () => audio.se('cheer'));
    this.time.delayedCall(3400, () => this.startFree(res.free));
  }

  private startFree(games: number): void {
    this.free = newFree(this.bet, games);
    saveFree(this.free);
    this.winText.setText('0').setColor('#ffd23a');
    this.setRows(FREE_ROWS);
    this.freeHud(`${games}回 スタート！`);
    audio.playBgm('slotBonus');
    // 2026-11-12 企画者「始まる 前に 説明」
    this.guide('free', () => {
      this.startFreeFx();
      this.freeBanner(`FREE GAME\n${games}回 スタート！`, '#ffd23a');
      this.freeLoop(2200);
    });
  }

  /** 次の 1回(のこりが 0 なら おわり) */
  private freeLoop(wait: number): void {
    this.time.delayedCall(wait, () => {
      const f = this.free;
      if (!f) return;
      if (f.left <= 0) return this.endFree();
      this.freeOne();
    });
  }

  private freeOne(): void {
    const f = this.free!;
    // 2026-11-12 企画者「回り 始める 時 残り 回数 減って 良い。ワイルド 出たら +1」→ 回り 始めに −1 を 見せる(ふえる 分は 止まって から)
    this.freeShownLeft = f.left - 1;
    this.freeShownTotal = f.total;
    // 結果を 先に 決めて すぐ 保存(とちゅうで 閉じても コインは もらえる・やり直せない)
    const fr = freeSpin(f, this.rng);
    if (fr.res.win) this.record.add(fr.res.win);
    saveFree(f.left > 0 ? f : undefined);
    this.lastFree = fr;
    this.lastShow = undefined;
    this.clearGlow();
    this.freeHud();
    audio.se('whoosh');
    for (let r = 0; r < REELS; r++) {
      this.reels[r].spinning = true;
      this.reels[r].speed = 1;
    }
    // ふつうの 速さで 止める(フリーゲームは オートの 速さより ゆっくり)
    for (let r = 0; r < REELS; r++) this.time.delayedCall(FREE_STOP_FIRST + r * FREE_STOP_STEP, () => this.stopReel(r, fr.res, r === REELS - 1));
  }

  private revealFree(): void {
    const fr = this.lastFree;
    const f = this.free;
    if (!fr || !f) return;
    const res = fr.res;
    const big = res.win >= this.bet;
    // 止まって から 合計と コインを ふやす
    this.freeShownTotal = undefined;
    // 当たったら キャラが 下から とび出して よろこぶ(大きい ほど 多く)
    if (res.win > 0) this.freeCheer(res.win >= this.bet * 5 ? 3 : 1);
    this.shown = this.record.coins;
    this.credit.setText(this.shown.toLocaleString());
    if (res.win > 0) {
      const cells = new Map<string, [number, number]>();
      for (const w of res.wins) for (const c of w.cells) cells.set(c.join(), c);
      for (const [r, i] of cells.values()) if (!f.sticky[r][i] || fr.newWilds.some(([a, b]) => a === r && b === i)) this.cellGlow(r, i, big);
      if (big) audio.se('cheer');
      else audio.se('tap', { pitch: 1.3 });
    }
    if (res.win >= this.bet * 5) {
      this.reelFlash();
      coinFountain(this, W / 2, this.reelY + 200, Math.min(70, 15 + Math.round((res.win / this.bet) * 2)));
    }
    this.winText.setText(f.total.toLocaleString()).setColor('#ffd23a');
    // 新しい ワイルド: ぽんっと 出て のこる
    this.drawSticky();
    for (const [r, i] of fr.newWilds) {
      const img = this.stickyImgs[r]?.[i];
      if (!img) continue;
      const base = img.scale;
      img.setScale(base * 1.8);
      this.tweens.add({ targets: img, scale: base, duration: 300, ease: 'Back.easeOut' });
    }
    if (fr.newWilds.length) {
      audio.se('mcMagic', { pitch: 1.4 });
      this.cameras.main.shake(160, 0.004);
    }
    if (fr.added) for (const [r, i] of res.crownCells) this.cellGlow(r, i, true, 0xffd23a);
    // まず 当たりを 見せる → つぎに ふえた 回数(ワイルド +1・王冠 +5)を 大きく 出す
    this.freeHud(res.win ? `+${res.win.toLocaleString()}` : '');
    const step2 = res.win || fr.newWilds.length ? 1600 : 800;
    this.time.delayedCall(step2, () => {
      this.freeShownLeft = undefined;
      // 2026-11-12 企画者「ワイルド へらない は やめよう。+1スピン」
      const msg = fr.wildAdded ? `WILD ${fr.newWilds.length}こ！ +${fr.wildAdded} SPIN` : '';
      this.freeHud(msg);
      if (fr.wildAdded) this.freeBanner(`WILD！\n+${fr.wildAdded} SPIN`, '#ffd23a');
      if (fr.added) {
        audio.se('koBlast');
        this.time.delayedCall(fr.newWilds.length ? 1800 : 0, () => {
          this.freeHud(`王冠！ +${fr.added}回`);
          this.freeBanner(`王冠 3つ！\n+${fr.added}回`, '#ff8a1f');
        });
      }
      const extra = (fr.newWilds.length ? 1900 : 0) + (fr.added ? 1900 : 0);
      this.freeLoop(extra + (big ? 2000 : 1400));
    });
  }

  // ---------------- フリーゲーム中の 台の まわりの 演出(2026-11-12 企画者「台の まわり 演出・キャラが 出て 来たり」) ----------------
  private freeFx?: Phaser.GameObjects.Container;
  private freeFxTimers: Phaser.Time.TimerEvent[] = [];

  private charaKeys(): string[] {
    return STORY_REACHES.map((d) => d.chara).filter((k) => this.textures.exists(k));
  }

  /** 台の まわりの 光と、キャラが 左右から ときどき 顔を 出す(フリーゲームの 間 ずっと) */
  private startFreeFx(): void {
    this.stopFreeFx();
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(7);
    this.freeFx = c;
    // 左右の はしの 虹色の 光の 柱(ゆっくり 色が かわる)
    const cols = [0xff4ad8, 0xffd23a, 0x7de8ff, 0x9dff6a, 0xff8a1f];
    for (const side of [0, 1]) {
      const bar = this.add.rectangle(side ? W - 6 : 6, H / 2, 12, H, cols[0], 0.55).setBlendMode(Phaser.BlendModes.ADD);
      c.add(bar);
      let i = side;
      this.freeFxTimers.push(this.time.addEvent({ delay: 260, loop: true, callback: () => bar.active && bar.setFillStyle(cols[++i % cols.length], 0.55) }));
    }
    // 上から ふる キラキラ
    this.freeFxTimers.push(this.time.addEvent({
      delay: 180,
      loop: true,
      callback: () => {
        if (!c.active) return;
        const st = this.text(Math.random() * W, -20, Math.random() < 0.5 ? '★' : '✦', 18 + Math.random() * 18, Phaser.Utils.Array.GetRandom(['#ffd23a', '#ff8ae0', '#7de8ff', '#ffffff']));
        c.add(st);
        this.tweens.add({ targets: st, y: H * (0.3 + Math.random() * 0.5), x: st.x + (Math.random() - 0.5) * 80, angle: 360, alpha: 0, duration: 1800 + Math.random() * 900, onComplete: () => st.destroy() });
      },
    }));
    // キャラが 左右から 顔を 出す
    this.freeFxTimers.push(this.time.addEvent({ delay: 2600, loop: true, callback: () => this.charaPeek() }));
    this.charaPeek();
  }

  private stopFreeFx(): void {
    for (const t of this.freeFxTimers) t.remove();
    this.freeFxTimers = [];
    this.freeFx?.destroy();
    this.freeFx = undefined;
  }

  /** キャラ 1人が 台の 左か 右から ひょこっと 出て、ゆれて、もどる */
  private charaPeek(): void {
    const c = this.freeFx;
    const keys = this.charaKeys();
    if (!c?.active || !keys.length) return;
    const H = this.H;
    const side = Math.random() < 0.5 ? -1 : 1;
    const img = this.add.image(0, 0, Phaser.Utils.Array.GetRandom(keys));
    const hgt = H * (0.13 + Math.random() * 0.03);
    img.setScale(hgt / img.height).setFlipX(side > 0);
    // リールの 上には かぶらない: 台の 上の はし(液晶の 横)・下の はし(ボタンの 台の 横)から 顔を 出す
    const y = Math.random() < 0.5 ? this.lcdBox.y + hgt * 0.4 : this.tray.y - hgt * 0.15;
    const out = side < 0 ? -img.displayWidth / 2 : W + img.displayWidth / 2;
    const inn = side < 0 ? img.displayWidth * 0.2 : W - img.displayWidth * 0.2;
    img.setPosition(out, y).setAngle(side * -14);
    c.add(img);
    this.tweens.chain({
      targets: img,
      tweens: [
        { x: inn, angle: side * 8, duration: 380, ease: 'Back.easeOut' },
        { y: y - 18, duration: 180, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' },
        { x: out, angle: side * -14, duration: 320, ease: 'Quad.easeIn', onComplete: () => img.destroy() },
      ],
    });
  }

  /** 当たった 時: キャラが 下から とび出して ジャンプ */
  private freeCheer(n: number): void {
    const c = this.freeFx;
    const keys = Phaser.Utils.Array.Shuffle([...this.charaKeys()]);
    if (!c?.active || !keys.length) return;
    const H = this.H;
    for (let k = 0; k < Math.min(n, keys.length); k++) {
      const img = this.add.image(0, 0, keys[k]);
      img.setScale((H * 0.2) / img.height);
      const x = n === 1 ? W * (Math.random() < 0.5 ? 0.18 : 0.82) : W * (0.18 + k * 0.32);
      img.setPosition(x, H + img.displayHeight / 2);
      c.add(img);
      this.tweens.chain({
        targets: img,
        delay: k * 120,
        tweens: [
          { y: H - img.displayHeight * 0.45, duration: 300, ease: 'Back.easeOut' },
          { y: H - img.displayHeight * 0.62, angle: { from: -8, to: 8 }, duration: 160, yoyo: true, repeat: 2 },
          { y: H + img.displayHeight / 2, duration: 300, ease: 'Quad.easeIn', onComplete: () => img.destroy() },
        ],
      });
    }
  }

  /** フリーゲームの まん中に 大きな 文字(リールの 上) */
  private freeBanner(msg: string, color: string): void {
    const y = this.reelY + (this.rows * this.cell + (this.rows - 1) * GAP) / 2;
    const c = this.add.container(W / 2, y).setDepth(9);
    c.add(this.add.rectangle(0, 0, this.reelW + 10, 150, 0x0d0614, 0.85).setStrokeStyle(5, 0xffd23a));
    c.add(this.text(0, 0, msg, 46, color, 9));
    c.setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, duration: 260, delay: 1500, onComplete: () => c.destroy() });
  }

  private endFree(): void {
    const f = this.free;
    if (!f) return;
    saveFree(undefined);
    this.stopFreeFx();
    audio.playBgm('slot');
    // 3段に もどして から 液晶に 結果
    this.setRows(ROWS);
    const h = this.lcdBox.h;
    this.setLcdBg('gold', 0.1);
    const t = this.text(0, -h * 0.14, 'FREE GAME 終了', Math.min(56, h * 0.15), '#ffffff', 9);
    const n = this.text(0, h * 0.14, `+${f.total.toLocaleString()} GET!`, Math.min(76, h * 0.2), '#ffd23a', 12);
    n.setShadow(0, 6, '#ff4ad8', 0, true, true);
    this.lcdShow([t, n]);
    n.setScale(2);
    this.tweens.add({ targets: n, scale: 1, duration: 340, ease: 'Back.easeOut' });
    audio.se(f.total > 0 ? 'cheer' : 'back');
    if (f.total >= f.bet * 5) coinFountain(this, W / 2, this.reelY + 200, Math.min(90, 20 + Math.round((f.total / f.bet) * 2)));
    this.free = undefined;
    this.time.delayedCall(2600, () => {
      this.busy = false;
      this.lcdIdle();
    });
  }

  // ---------------- 宝箱ボーナス ----------------

  private startBonus(): void {
    this.bonus = newBonus(this.rng, this.bet);
    // 先に 保存(説明の 間に 閉じても 続きから)
    saveBonus(this.bonus);
    this.clearGlow();
    this.winText.setText('0').setColor('#ffd23a');
    // 2026-11-12 企画者「フリーゲームと 宝箱ボーナスの BGM は これ」
    audio.playBgm('slotBonus');
    // 2026-11-12 企画者「ボーナスと フリーゲームが 始まる 前に 説明」
    this.guide('bonus', () => this.bonusRound(false));
  }

  /**
   * 始まる 前の 説明(2026-11-12 企画者。絵は 企画者が 用意する → slot:guide:bonus / slot:guide:free。それまで 仮の 文字)。
   * 画面 いっぱい・タップで 始まる(オートの 時は 少し 待って 自動で)。遊び方の 説明に 報酬は 書かない【確定】
   */
  private guide(kind: 'bonus' | 'free', then: () => void): void {
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(60);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0d0614, 0.92).setInteractive();
    c.add(dim);
    const key = `slot:guide:${kind}`;
    const title = kind === 'bonus' ? 'TREASURE CHALLENGE' : 'FREE GAME';
    const lines =
      kind === 'bonus'
        ? ['宝箱を 1つ えらぼう', '', '大当たり・あたり → つぎの ラウンドへ', '終了の 宝箱が 出たら おしまい', '', 'どの 宝箱に 何が 入っているかは', '毎回 かわるよ']
        : ['5×5 の 大きな リールで 回るよ', '', 'WILD は ほかの 図柄の かわりに なる', 'WILD は おわりまで その場に のこる', 'WILD が 出たら +1 SPIN', '', '王冠 3つで 回数が ふえる'];
    let titleY = H * 0.28;
    let bodyY = H * 0.48;
    // 説明の 文字(大きさを 先に はかる)
    const art = this.textures.exists(key);
    const body = this.text(W / 2, 0, (art ? lines.filter((l) => l) : lines).join('\n'), 26, '#ffffff', 5).setLineSpacing(art ? 6 : 10);
    const bh = body.height;
    let box: Phaser.GameObjects.Rectangle | undefined;
    if (art) {
      // 企画者の 背景の 絵(2026-11-12〜)。横 いっぱい・上に そろえる。上の あいた 所に 題、下の 床に 説明
      c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x290f3a));
      const img = this.add.image(W / 2, 0, key).setOrigin(0.5, 0);
      // 説明は 絵の 下の 床に(フリーゲームの 絵は 5×5 の マスが 下まで ある ので さらに 下)。
      // 画面が 短い 時は 絵を 少し 小さく して、説明と「タップで スタート」が 画面に 入る ように
      const ratio = kind === 'free' ? 0.84 : 0.75;
      const below = bh + 100;
      img.setScale(Math.min(W / img.width, (H - below - 10) / (ratio * img.height)));
      c.add(img);
      titleY = img.displayHeight * 0.13;
      bodyY = img.displayHeight * ratio + bh / 2 + 6;
      box = this.add.rectangle(W / 2, bodyY, W - 60, bh + 24, 0x0d0614, 0.6);
      c.add(box);
    }
    body.setY(bodyY);
    const t = this.text(W / 2, titleY, title, 50, '#ffd23a', 10);
    t.setShadow(0, 6, '#ff4ad8', 0, true, true);
    c.add([t, body]);
    const tap = this.text(W / 2, Math.min(H - 30, bodyY + bh / 2 + 44), this.autoNow ? '' : 'タップで スタート', 34, '#ffd23a', 8);
    c.add(tap);
    // 2026-11-12 企画者「暗い 四角の 中に 説明が 入って ない」(iPhone)→ 文字の 形が あとから 変わっても 四角と「タップで スタート」を 合わせ直す
    const fit = () => {
      if (!body.active) return;
      body.updateText();
      const h2 = body.height;
      box?.setScale(1, (h2 + 24) / (bh + 24));
      tap.setY(Math.min(H - 30, bodyY + h2 / 2 + 44));
    };
    fit();
    this.time.delayedCall(200, fit);
    this.time.delayedCall(800, fit);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 520, yoyo: true, repeat: -1 });
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 220 });
    audio.se('select');
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      audio.se('next');
      this.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
      then();
    };
    // 0.6秒は おせない(まちがって とばさない)
    // 画面の どこを タップしても はじまる。0.6秒は おせない(まちがって とばさない)
    const shownAt = Date.now();
    const onTap = () => {
      if (Date.now() - shownAt < 600) return;
      this.input.off('pointerdown', onTap);
      go();
    };
    this.input.on('pointerdown', onTap);
    c.once(Phaser.GameObjects.Events.DESTROY, () => this.input.off('pointerdown', onTap));
    if (this.autoNow) this.time.delayedCall(4000, go);
  }

  /** 1ラウンド: 宝箱 3つを 出す(resume: 閉じた あとの 続き) */
  private bonusRound(resume: boolean): void {
    this.setLcdBg('gold', 0.3);
    this.lamp?.show(false);
    const b = this.bonus;
    if (!b) return;
    const { w, h } = this.lcdBox;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.text(0, -h * 0.4, resume ? 'ボーナスの つづき！' : 'TREASURE CHALLENGE', Math.min(30, h * 0.08), '#ffd23a', 6));
    items.push(this.text(0, -h * 0.29, `ROUND ${b.round}　合計 +${b.total.toLocaleString()}`, Math.min(28, h * 0.075), '#ffffff', 5));
    items.push(this.text(0, h * 0.4, '宝箱を 1つ えらんでね', Math.min(24, h * 0.065), '#e8dcf4'));
    const cw = Math.min(190, (w - 60) / 3);
    const chests = ['purple', 'red', 'blue'].map((col, i) => {
      const img = this.add.image((i - 1) * (cw + 16), h * 0.06, chestKey(col, false));
      img.setScale((cw / img.width) * 0.95);
      const base = img.scale;
      img.setInteractive({ useHandCursor: true }).once('pointerdown', () => this.openChest(i, chests));
      // ゆらゆら(えらんでね)
      this.tweens.add({ targets: img, y: img.y - 8, duration: 500 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      img.setData('base', base).setData('col', col);
      items.push(img);
      return img;
    });
    this.lcdShow(items);
    this.winText.setText(b.total.toLocaleString()).setColor('#ffd23a');
    if (!resume) audio.se('select');
  }

  private openChest(i: number, chests: Phaser.GameObjects.Image[]): void {
    const b = this.bonus;
    if (!b || b.over) return;
    for (const c of chests) c.disableInteractive();
    // 「えらんでね」は 消して、そこに 中身を 出す
    for (const o of [...this.lcd.list]) if (o instanceof Phaser.GameObjects.Text && o.text.startsWith('宝箱を')) o.destroy();
    const inside = [...b.chests] as ChestContent[];
    const got = pickChest(b, i, this.rng);
    const pay = b.bet * CHEST_PAY[got];
    // すぐ 保存(開けた あとで 閉じても コインは もらえる・やり直せない)
    if (pay) this.record.add(pay);
    if (b.over) saveBonus(undefined);
    else saveBonus(b);
    this.shown = this.record.coins;
    const h = this.lcdBox.h;
    const img = chests[i];
    this.tweens.killTweensOf(img);
    this.tweens.add({ targets: img, scale: img.getData('base') * 1.18, duration: 160, yoyo: true });
    img.setTexture(chestKey(img.getData('col'), true));
    const label = (k: ChestContent) => (k === 'big' ? `大当たり\n+${(b.bet * CHEST_PAY.big).toLocaleString()}` : k === 'normal' ? `あたり\n+${(b.bet * CHEST_PAY.normal).toLocaleString()}` : '終了');
    const color = (k: ChestContent) => (k === 'big' ? '#ffd23a' : k === 'normal' ? '#ffffff' : '#b8a8c8');
    if (got === 'big') this.bigChest(img.x, img.y);
    else audio.se(got === 'normal' ? 'happy' : 'back');
    // 2026-11-10 企画者「何が 当たったか 分かりにくい」→ 開けた あと、液晶の まん中に 大きな 帯で 結果を 出す
    const { w } = this.lcdBox;
    const banner = this.add.container(0, 0).setAlpha(0);
    const bandCol = got === 'big' ? 0xffd23a : got === 'normal' ? 0x9b5cff : 0x3a2a4a;
    // 2026-11-12 企画者「何が 当たったか もう少し わかりやすく」→ 液晶 いっぱいの 帯・宝箱から 中身が 飛び出す・コインを 数え上げ・つぎに どうなるか
    banner.add(this.add.rectangle(0, 0, w - 8, h - 8, 0x0d0614, 0.92).setStrokeStyle(8, bandCol));
    if (got !== 'end') banner.add(lcdRays(this, this.lcdBox, bandCol, got === 'big' ? 0.35 : 0.2, 14, 0, -h * 0.05, 5000));
    const head = got === 'big' ? '大当たり！！' : got === 'normal' ? 'あたり！' : '終了…';
    const t1 = this.text(0, -h * 0.3, head, Math.min(got === 'big' ? 80 : 66, h * 0.2), got === 'big' ? '#ffd23a' : got === 'normal' ? '#ffffff' : '#d8c8e8', 10);
    banner.add(t1);
    // 中身の 絵(コインの 山)
    const pile = got === 'big' ? 7 : got === 'normal' ? 3 : 0;
    for (let k = 0; k < pile; k++) {
      const cx = (k - (pile - 1) / 2) * Math.min(56, (w * 0.7) / Math.max(1, pile));
      const coin = this.textures.exists(COIN_ART_KEY) ? this.add.image(cx, -h * 0.02, COIN_ART_KEY).setDisplaySize(h * 0.17, h * 0.17) : this.text(cx, -h * 0.02, '●', h * 0.15, '#ffd23a');
      banner.add(coin);
      this.tweens.add({ targets: coin, y: { from: h * 0.15, to: -h * 0.02 - (k % 2) * 12 }, duration: 380, delay: 450 + k * 60, ease: 'Back.easeOut' });
    }
    if (got === 'end') banner.add(this.text(0, -h * 0.02, '✖', Math.min(110, h * 0.3), '#8a7a9a', 8));
    // もらえる 枚数(数え上げ)と つぎに どうなるか
    const t2 = this.text(0, h * 0.2, got === 'end' ? `合計 +${b.total.toLocaleString()}` : '+0', Math.min(56, h * 0.14), got === 'big' ? '#ffd23a' : '#ffffff', 8);
    banner.add(t2);
    if (pay) {
      const n = { v: 0 };
      this.tweens.add({ targets: n, v: pay, duration: 700, delay: 600, onUpdate: () => t2.setText(`+${Math.round(n.v).toLocaleString()}`) });
    }
    banner.add(this.text(0, h * 0.38, got === 'end' ? 'ボーナス おしまい' : `つぎの ラウンドへ！（合計 +${b.total.toLocaleString()}）`, Math.min(26, h * 0.07), '#e8dcf4', 5));
    if (got === 'big') t1.setShadow(0, 6, '#ff4ad8', 0, true, true);
    this.time.delayedCall(450, () => {
      this.lcd.add(banner);
      banner.setScale(1.6);
      this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });
    });
    const showFor = got === 'big' ? 2600 : got === 'normal' ? 2100 : 1800;
    // 帯を 消して、えらんだ 宝箱を 光らせ、ほかの 2つの 中身も 見せる
    this.time.delayedCall(450 + showFor, () => {
      this.tweens.add({ targets: banner, alpha: 0, duration: 200, onComplete: () => banner.destroy() });
      const ring = this.add.rectangle(img.x, img.y, img.displayWidth * 1.06, img.displayHeight * 1.06).setStrokeStyle(5, bandCol);
      this.lcd.add(ring);
      this.lcd.add(this.text(img.x, img.y + img.displayHeight * 0.85, label(got), Math.min(24, h * 0.065), color(got), 6));
      chests.forEach((c, k) => {
        if (k === i) return;
        this.tweens.killTweensOf(c);
        c.setTexture(chestKey(c.getData('col'), true)).setAlpha(0.5);
        this.lcd.add(this.text(c.x, c.y + c.displayHeight * 0.85, label(inside[k]), Math.min(20, h * 0.055), color(inside[k]), 5).setAlpha(0.75));
      });
    });
    this.credit.setText(this.shown.toLocaleString());
    this.winText.setText(b.total.toLocaleString());
    this.time.delayedCall(450 + showFor + 1000, () => (b.over ? this.endBonus() : this.bonusRound(false)));
  }

  /** 大当たりの 特別な 演出(光・ゆれ・キラキラ) */
  private bigChest(x: number, y: number): void {
    audio.se('cheer');
    this.time.delayedCall(120, () => audio.se('koBlast'));
    this.cameras.main.flash(260, 255, 230, 120);
    this.cameras.main.shake(320, 0.008);
    const rays = lcdRays(this, this.lcdBox, 0xffd23a, 0.3, 14, x, y, 6000);
    rays.setAlpha(0);
    this.lcd.addAt(rays, 0);
    this.tweens.add({ targets: rays, alpha: 1, duration: 250 });
    for (let k = 0; k < 26; k++) {
      const st = this.text(x, y, '★', 22 + Math.random() * 26, '#fff2a8');
      this.lcd.add(st);
      const a = Math.random() * Math.PI * 2;
      const d = 120 + Math.random() * 260;
      this.tweens.add({ targets: st, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, alpha: 0, angle: 200, duration: 900 + Math.random() * 500, ease: 'Quad.easeOut' });
    }
  }

  private endBonus(): void {
    const b = this.bonus;
    if (!b) return;
    const h = this.lcdBox.h;
    const t = this.text(0, -h * 0.12, 'BONUS 終了', Math.min(64, h * 0.17), '#ffffff', 10);
    const n = this.text(0, h * 0.14, `+${b.total.toLocaleString()} GET!`, Math.min(80, h * 0.21), '#ffd23a', 12);
    n.setShadow(0, 6, '#ff4ad8', 0, true, true);
    this.lcdShow([t, n]);
    n.setScale(2);
    this.tweens.add({ targets: n, scale: 1, duration: 340, ease: 'Back.easeOut' });
    audio.se(b.total > 0 ? 'cheer' : 'back');
    if (b.total >= b.bet * 5) coinFountain(this, W / 2, this.reelY + 200, Math.min(90, 20 + Math.round((b.total / b.bet) * 2)));
    this.winText.setText(b.total.toLocaleString()).setColor('#ffd23a');
    this.bonus = undefined;
    this.time.delayedCall(1800, () => {
      audio.playBgm('slot');
      this.busy = false;
      this.lcdIdle();
      this.lamp?.show(true);
    });
  }

  /** 当たりの マスを 光らせる(A: 大きい 当たりは 光って ゆれる・小さい 当たりは 細い 枠だけ) */
  private cellGlow(r: number, i: number, big: boolean, color = 0xff4ad8): void {
    const p = this.cellPos(r, i);
    if (big) {
      const glow = this.add.rectangle(p.x, p.y, this.cell + 6, this.cell + 6, color, 0.35).setStrokeStyle(6, 0xffd23a).setDepth(this.zReel + 1);
      this.tweens.add({ targets: glow, alpha: 0.35, duration: 380, yoyo: true, repeat: -1 });
      const img = this.reels[r].imgs[i + 1];
      this.tweens.add({ targets: img, scale: img.scale * 1.08, duration: 380, yoyo: true, repeat: -1 });
      this.glow.push(glow, img);
    } else {
      const frame = this.add.rectangle(p.x, p.y, this.cell - 4, this.cell - 4).setStrokeStyle(5, 0xff4ad8, 0.9).setDepth(this.zReel + 1);
      this.glow.push(frame);
    }
  }

  private clearGlow(): void {
    for (const o of this.glow) {
      this.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Image) o.setDisplaySize(this.cell - 10, this.cell - 10).setAngle(0);
      else o.destroy();
    }
    this.glow = [];
  }

  /** ⑤ リール全体が ピカピカ 光る */
  private reelFlash(): void {
    const h = this.rows * this.cell + (this.rows - 1) * GAP;
    const f = this.add.rectangle(W / 2, this.reelY + h / 2, this.reelW + 20, h + 20, 0xffffff, 0).setDepth(this.zReel + 1);
    this.tweens.add({ targets: f, fillAlpha: 0.5, duration: 110, yoyo: true, repeat: 4, onComplete: () => f.destroy() });
  }

  /** WIN の 数字を 数えあげる */
  private countUp(win: number, big: boolean): void {
    const o = { v: 0 };
    this.winText.setColor(big ? '#ffd23a' : '#ffffff');
    this.countTween?.stop();
    this.countTween = this.tweens.add({ targets: o, v: win, duration: big ? 700 : 250, onUpdate: () => this.winText.setText(Math.round(o.v).toLocaleString()) });
  }

  private toast(msg: string): void {
    const t = this.text(W / 2, this.reelY + 190, msg, 32, '#ffffff').setBackgroundColor('#16101cdd').setPadding(22, 12, 22, 14).setDepth(20);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  private leave(): void {
    if (this.busy) return;
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('SlotTitle'));
  }
}

/** スロットだけの 保存(えらんだ BET・ボーナスの とちゅう)。お世話の データとは 別 */
interface SlotSave {
  bet?: number;
  bonus?: { bet: number; round: number; total: number; history: ChestContent[] };
  /** 特別フリーゲームの とちゅう(2026-11-11) */
  free?: FreeState;
}

function loadSave(): SlotSave {
  try {
    const d = JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) ?? '{}') as SlotSave;
    const b = d.bonus;
    const ok = b && (BETS as readonly number[]).includes(Number(b.bet)) && Number.isFinite(Number(b.round)) && Number.isFinite(Number(b.total));
    const bet = Number(d.bet);
    const f = d.free;
    const fok = f && (BETS as readonly number[]).includes(Number(f.bet)) && Number(f.left) > 0 && Array.isArray(f.sticky) && f.sticky.length === REELS && f.sticky.every((c) => Array.isArray(c) && c.length === FREE_ROWS);
    const free: FreeState | undefined = fok ? { bet: Number(f.bet), left: Math.floor(Number(f.left)), games: Math.floor(Number(f.games) || 0), played: Math.floor(Number(f.played) || 0), total: Math.max(0, Math.floor(Number(f.total) || 0)), sticky: f.sticky.map((c) => c.map((x) => x === true)) } : undefined;
    return { free, bet: (BETS as readonly number[]).includes(bet) ? bet : undefined, bonus: ok ? { bet: Number(b.bet), round: Math.max(1, Math.floor(Number(b.round))), total: Math.max(0, Math.floor(Number(b.total))), history: Array.isArray(b.history) ? b.history : [] } : undefined };
  } catch {
    return {};
  }
}

function writeSave(d: SlotSave): void {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {
    /* 保存 できなくても 遊べる */
  }
}

function loadBet(): number {
  const b = Number(loadSave().bet);
  return (BETS as readonly number[]).includes(b) ? b : BETS[0];
}

function saveBet(bet: number): void {
  writeSave({ ...loadSave(), bet });
}

function saveFree(f: FreeState | undefined): void {
  writeSave({ ...loadSave(), free: f ? { ...f, sticky: f.sticky.map((c) => [...c]) } : undefined });
}

function saveBonus(b: BonusState | undefined): void {
  writeSave({ ...loadSave(), bonus: b ? { bet: b.bet, round: b.round, total: b.total, history: b.history } : undefined });
}

/** プログラムで 描いた 仮の 宝箱(企画者の 絵が 読めなかった 時) */
const drawnChestKey = (col: string, open: boolean) => `slot:chest:${col}:${open ? 'o' : 'c'}`;
/** 企画者の 宝箱の 絵(2026-11-10。元は design/slot/chest/。にせの とうめいの ます目は 消した → clean/) */
const chestArtKey = (col: string, open: boolean) => `slot:chestart:${col}:${open ? 'o' : 'c'}`;
const CHEST_COLORS = ['purple', 'red', 'blue'];
const chestKey = (col: string, open: boolean) => (symScene?.textures.exists(chestArtKey(col, open)) ? chestArtKey(col, open) : drawnChestKey(col, open));

/** 【仮】宝箱の 絵(紫・赤・青。企画者の 絵が 届くまで) */
function drawChestTexture(scene: Phaser.Scene, col: string, open: boolean): void {
  const S = 200;
  const t = scene.textures.createCanvas(drawnChestKey(col, open), S, S);
  const ctx = t?.getContext();
  if (!t || !ctx) return;
  const body = col === 'purple' ? '#8a3ae0' : col === 'red' ? '#e0402a' : '#2a7ae0';
  const dark = col === 'purple' ? '#5a1aa0' : col === 'red' ? '#a02010' : '#1a4aa0';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#16101c';
  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    // roundRect は 古い iPhone に ないので 自分で かく
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  if (open) {
    // 中が 光る
    const g = ctx.createRadialGradient(100, 96, 4, 100, 96, 90);
    g.addColorStop(0, '#fff8c0');
    g.addColorStop(1, 'rgba(255,210,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    rr(30, 30, 140, 54, 18, dark);
  } else {
    ctx.beginPath();
    ctx.moveTo(26, 100);
    ctx.quadraticCurveTo(26, 46, 100, 46);
    ctx.quadraticCurveTo(174, 46, 174, 100);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.stroke();
  }
  rr(26, 96, 148, 82, 12, body);
  ctx.fillStyle = '#ffc21a';
  ctx.fillRect(26, 120, 148, 14);
  ctx.strokeRect(26, 120, 148, 14);
  rr(84, 106, 32, 38, 8, '#ffd23a');
  t.refresh();
}

/** 【仮】図柄の 絵(企画者の 絵が 届くまで)。太い 黒い ふち・あざやかな 色 */
function drawSymbolTexture(scene: Phaser.Scene, s: SymbolId): void {
  const S = 160;
  const t = scene.textures.createCanvas(drawnKey(s), S, S);
  const ctx = t?.getContext();
  if (!t || !ctx) return;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#16101c';
  const c = S / 2;
  const seven = (fill: string | CanvasGradient) => {
    ctx.font = `900 132px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeText('7', c, c + 6);
    ctx.fillStyle = fill;
    ctx.fillText('7', c, c + 6);
  };
  const poly = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  const circle = (x: number, y: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  switch (s) {
    case 'rainbow7': {
      const gr = ctx.createLinearGradient(0, 20, 0, 140);
      ['#ff3a4a', '#ff9a1f', '#ffe23a', '#3ad070', '#2a9dff', '#9b5cff'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
      seven(gr);
      break;
    }
    case 'gold7': {
      const gr = ctx.createLinearGradient(0, 20, 0, 140);
      gr.addColorStop(0, '#fff2a8');
      gr.addColorStop(0.5, '#ffc21a');
      gr.addColorStop(1, '#c07a00');
      seven(gr);
      break;
    }
    case 'diamond':
      poly([[c, 18], [140, 62], [c, 146], [20, 62]], '#b46aff');
      ctx.lineWidth = 4;
      poly([[c, 18], [108, 62], [c, 146], [52, 62]], '#d9a8ff');
      break;
    case 'bell':
      ctx.beginPath();
      ctx.moveTo(c, 22);
      ctx.bezierCurveTo(118, 26, 112, 96, 134, 120);
      ctx.lineTo(26, 120);
      ctx.bezierCurveTo(48, 96, 42, 26, c, 22);
      ctx.closePath();
      ctx.fillStyle = '#ffc21a';
      ctx.fill();
      ctx.stroke();
      circle(c, 132, 14, '#ffe48a');
      break;
    case 'cherry':
      ctx.beginPath();
      ctx.moveTo(52, 104);
      ctx.quadraticCurveTo(70, 50, 104, 24);
      ctx.moveTo(110, 108);
      ctx.quadraticCurveTo(104, 60, 104, 24);
      ctx.strokeStyle = '#2a7a2a';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = '#16101c';
      ctx.lineWidth = 9;
      circle(50, 110, 30, '#ff2a4a');
      circle(110, 112, 30, '#ff2a4a');
      break;
    case 'clover':
      circle(c - 24, c - 20, 26, '#3ec46a');
      circle(c + 24, c - 20, 26, '#3ec46a');
      circle(c - 24, c + 24, 26, '#3ec46a');
      circle(c + 24, c + 24, 26, '#3ec46a');
      circle(c, c + 2, 14, '#7ae89a');
      break;
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 30 : 68;
        pts.push([c + Math.cos(a) * rr, c + 6 + Math.sin(a) * rr]);
      }
      poly(pts, '#ffe23a');
      break;
    }
    case 'wild': {
      // 【仮】ワイルド(企画者が 絵を 作る。2026-11-11)。紫の 板に 金の WILD
      ctx.fillStyle = '#7a2ad0';
      ctx.beginPath();
      ctx.moveTo(c, 10);
      ctx.lineTo(150, c);
      ctx.lineTo(c, 150);
      ctx.lineTo(10, c);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = `900 46px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeText('WILD', c, c + 2);
      ctx.fillStyle = '#ffd23a';
      ctx.fillText('WILD', c, c + 2);
      break;
    }
    case 'crown':
      poly([[24, 128], [24, 50], [56, 84], [c, 30], [104, 84], [136, 50], [136, 128]], '#ffc21a');
      circle(24, 48, 10, '#ff3a6a');
      circle(c, 28, 11, '#3ad0ff');
      circle(136, 48, 10, '#ff3a6a');
      ctx.lineWidth = 5;
      circle(c, 104, 12, '#b46aff');
      break;
  }
  t.refresh();
}
