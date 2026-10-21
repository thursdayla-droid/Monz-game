import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { newSeed, type Rng } from '../core/rng';
import { applyResult, ballAt, canSwing, isHit, judge, markerLead, newSlugger, nextPitch, passed, rngOf, SLUG, SLUG_REWARD, sluggerReward, type Pitch, type SluggerState, type SwingResult } from '../core/slugger';
import { preloadPacks } from '../render/packs';
import { drawPanel } from '../ui/homeArt';
import { canvasTextureOnce, INK, UI_FONT } from '../ui/paint';
import { BATTER_SIZE, drawBall, drawBatter, drawCursor, drawGlow, drawPitcher, drawStadium, GROUND_Y, PITCHER_SIZE, project, VIEW, type BatterPose, type PitcherPose } from '../ui/sluggerArt';

/** バッターロボットの絵(企画者の絵 5ポーズ)。ox/oy: 足元の位置(絵の幅・高さに対する割合)。数字は design/minigame/make_slugger_assets.py の出力 */
export const SLUG_BATTER_ART: Record<BatterPose, { ox: number; oy: number }> = {
  idle: { ox: 0.502, oy: 0.997 },
  swing: { ox: 0.28, oy: 0.998 },
  hit: { ox: 0.519, oy: 0.998 },
  homer: { ox: 0.579, oy: 0.997 },
  whiff: { ox: 0.325, oy: 0.998 },
};
export const slugBatterKey = (p: BatterPose) => `slug:bat:${p}`;
/** 絵の大きさ(画面での倍率)。打つ範囲(ストライクゾーン)にかからない大きさ */
const BATTER_ART_SCALE = 0.67;

/** ピッチャーロボットの絵(企画者の絵 3ポーズ)。数字は design/minigame/make_slugger_assets.py の出力 */
export const SLUG_PITCHER_ART: Record<PitcherPose, { ox: number; oy: number }> = {
  ready: { ox: 0.55, oy: 0.997 },
  windup: { ox: 0.67, oy: 0.998 },
  throw: { ox: 0.521, oy: 0.998 },
};
export const slugPitcherKey = (p: PitcherPose) => `slug:pit:${p}`;
const PITCHER_ART_SCALE = 0.5;

/** 球場の背景(企画者の絵) */
export const SLUGGER_BG_KEY = 'slug:bg';
export const SLUGGER_BG_FILE = 'assets/minigame/slugger_bg.webp';

const W = 720;
const H = 1280;
const ARIAL = '"Arial Black", Impact, sans-serif';

/** 【仮】操作の調整 */
const CTRL = {
  /** 指の動きの感度(指の動き × これ = カーソルの動き) */
  sensitivity: 1.15,
};
/** バッターの立つ所(足元)と大きさ */
/** バッターの立つ所(足元)。背景の絵(引きの絵)の左のバッターボックス(y843〜993、内側の線 x270〜290)の中。打つ範囲にかからないように */
const BATTER = { x: 128, y: 985, scale: 0.9, alpha: 1 };
/** ボールの半径(ゾーンの半分を 1 とした長さ) */
const BALL_R = 0.2;
/** ボールの絵の大きさ(px) */
const BALL_PX = 128;

type Phase = 'title' | 'play' | 'paused' | 'over';
type PitchPhase = 'windup' | 'flight' | 'result';

/**
 * ミニゲーム「MONZ SLUGGER」(企画者の指示 2026-10-20)。エンドレスのバッティング。
 * 操作(企画者の指示 2026-10-20): 指で画面をなぞってミートカーソルを動かし、指を離したらスイング。
 * ボールの着く所に目印が出る(最初の5球は投げる前から。だんだん出るのが遅くなる)。目印のまわりの輪が縮みきった時がタイミング。
 * ルール・判定・難しさは src/core/slugger.ts。【仮】絵はすべてプログラムで描いた仮の絵。
 */
export class SluggerScene extends Phaser.Scene {
  private phase: Phase = 'title';
  private s!: SluggerState;
  private rng!: Rng;
  private record!: LifeRecord;
  private runId = '';
  private pitch: Pitch | null = null;
  private pitchNo = 0;
  private pitchPhase: PitchPhase = 'windup';
  /** いまの段階に入ってからの秒数 */
  private timer = 0;
  /** update の時刻(タップの時間を細かく出すため) */
  private lastFrameWall = 0;
  private swung = false;
  /** ボールが手を離れてからの秒数(空振りのあとも、ボールが通りすぎるまで進める) */
  private ballTime = 0;
  private result: SwingResult | null = null;
  /** PERFECT のときに一瞬止める残り時間(秒) */
  private freeze = 0;
  private cursor = { x: 0, y: 0 };
  /** カーソルを動かしている指(離したらスイング) */
  private aim: { id: number; x: number; y: number } | null = null;
  private trail: { x: number; y: number; r: number }[] = [];
  private onHide?: () => void;

  private batter!: Phaser.GameObjects.Image;
  private pitcher!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private ballGlow!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private cursorImg!: Phaser.GameObjects.Image;
  private fx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  /** 空振りできる残りの数のしるし(右上) */
  private whiffMarks: Phaser.GameObjects.Text[] = [];
  private hud!: Phaser.GameObjects.Container;
  private controls!: Phaser.GameObjects.Container;
  /** 着く所の目印(輪が縮んでタイミングも教える) */
  private marker!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Slugger');
  }

  preload(): void {
    preloadPacks(this, ['home', 'slugger']);
  }

  create(): void {
    this.record = new LifeRecord(loadLife());
    this.phase = 'title';
    this.aim = null;
    this.trail = [];
    this.makeTextures();

    // 球場: 企画者の絵(読めなかったときだけプログラムで描いた仮の絵)
    if (this.textures.exists(SLUGGER_BG_KEY)) this.add.image(0, 0, SLUGGER_BG_KEY).setOrigin(0, 0).setDisplaySize(W, H);
    else {
      canvasTextureOnce(this, 'slug:stadium', W, H, (ctx) => drawStadium(ctx, W, H));
      this.add.image(0, 0, 'slug:stadium').setOrigin(0, 0);
    }
    // ストライクゾーンの枠(うすく)
    const zone = this.add.graphics();
    const a = project(-1, 1, 0);
    const b = project(1, -1, 0);
    zone.lineStyle(4, 0xffffff, 0.35).strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    zone.lineStyle(2, 0xffffff, 0.15);
    for (const f of [1 / 3, 2 / 3]) {
      zone.lineBetween(a.x + (b.x - a.x) * f, a.y, a.x + (b.x - a.x) * f, b.y);
      zone.lineBetween(a.x, a.y + (b.y - a.y) * f, b.x, a.y + (b.y - a.y) * f);
    }

    const mound = project(0, GROUND_Y, 1);
    this.pitcher = this.add.image(mound.x, mound.y + 8, 'slug:pitcher:ready').setOrigin(0.5, 1).setScale(0.62);
    this.setPitcher('ready');
    this.shadow = this.add.ellipse(0, 0, 40, 12, 0x000000, 0.35).setVisible(false);
    this.fx = this.add.graphics().setDepth(4);
    this.marker = this.add.graphics().setDepth(6);
    this.batter = this.add.image(BATTER.x, BATTER.y, 'slug:batter:idle').setOrigin(0.5, 1).setScale(BATTER.scale).setAlpha(BATTER.alpha).setDepth(5);
    this.setBatter('idle');
    this.cursorImg = this.add.image(0, 0, 'slug:cursor').setDepth(6);
    const cs = SLUG.position.good * VIEW.zs * 2;
    this.cursorImg.setDisplaySize(cs, cs * 0.87);
    this.ballGlow = this.add.image(0, 0, 'slug:glow').setDepth(7).setVisible(false).setTint(0x8ff4ff).setBlendMode(Phaser.BlendModes.ADD);
    this.ball = this.add.image(0, 0, 'slug:ball2').setDepth(7).setVisible(false);
    this.placeCursor();

    this.buildHud();
    this.buildControls();
    this.setupInput();

    this.onHide = () => {
      if (document.hidden && this.phase === 'play') this.pause();
    };
    document.addEventListener('visibilitychange', this.onHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onHide && document.removeEventListener('visibilitychange', this.onHide));

    this.showTitle();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    // 【仮】専用の曲が決まるまでメインの曲
    audio.playBgm('main');
  }

  private makeTextures(): void {
    for (const p of ['idle', 'swing', 'hit', 'homer', 'whiff'] as BatterPose[]) canvasTextureOnce(this, `slug:batter:${p}`, BATTER_SIZE.w, BATTER_SIZE.h, (ctx) => drawBatter(ctx, p));
    for (const p of ['ready', 'windup', 'throw'] as PitcherPose[]) canvasTextureOnce(this, `slug:pitcher:${p}`, PITCHER_SIZE.w, PITCHER_SIZE.h, (ctx) => drawPitcher(ctx, p));
    canvasTextureOnce(this, 'slug:ball2', BALL_PX, BALL_PX, (ctx) => drawBall(ctx, BALL_PX));
    canvasTextureOnce(this, 'slug:glow', 128, 128, (ctx) => drawGlow(ctx, 128));
    canvasTextureOnce(this, 'slug:cursor', 160, 160, (ctx) => drawCursor(ctx, 160));
  }

  // ---------------- 画面の部品 ----------------

  private buildHud(): void {
    this.hud = this.add.container(0, 0).setDepth(10);
    const pause = this.add.text(24, 34, 'Ⅱ', { fontFamily: ARIAL, fontSize: '34px', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 6 } }).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.phase === 'play') this.pause();
    });
    this.scoreText = this.add.text(W / 2, 30, '0m', { fontFamily: ARIAL, fontSize: '56px', color: '#ffffff', stroke: INK, strokeThickness: 10 }).setOrigin(0.5, 0);
    this.comboText = this.add.text(W / 2, 108, '', { fontFamily: ARIAL, fontSize: '34px', color: '#ffd23a', stroke: INK, strokeThickness: 8 }).setOrigin(0.5, 0);
    // ミスの残り(右上): 黄色い ● 3つ。ヒットにならなかった球(空振り・見のがし・ファウル)で赤い ✕ になる
    const board = this.add.rectangle(W - 226, 26, 206, 118, 0x16101c, 0.82).setOrigin(0, 0).setStrokeStyle(4, 0xffffff, 0.25);
    const label = this.add.text(W - 123, 50, 'ミス あと', { fontFamily: UI_FONT, fontSize: '22px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    this.whiffMarks = [];
    for (let i = 0; i < SLUG.maxWhiffs; i++) {
      this.whiffMarks.push(this.add.text(W - 186 + i * 63, 104, '●', { fontFamily: ARIAL, fontSize: '40px', color: '#ffd23a', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
    }
    const parts: Phaser.GameObjects.GameObject[] = [board, label, ...this.whiffMarks];
    this.hud.add([pause, this.scoreText, this.comboText, ...parts]);
    this.hud.setVisible(false);
  }

  private buildControls(): void {
    this.controls = this.add.container(0, 0).setDepth(9);
    const hint = this.add
      .text(W / 2, 1222, '指でなぞってカーソルを動かす → はなすとスイング！', { fontFamily: UI_FONT, fontSize: '26px', fontStyle: '900', color: '#ffffff', stroke: INK, strokeThickness: 7 })
      .setOrigin(0.5);
    this.controls.add([hint]);
    this.controls.setVisible(false);
  }

  /** 画面のタッチ: 指を置いて動かすとカーソルが動き、指を離した瞬間にスイング(1本の指でぜんぶ) */
  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'play' || this.aim) return;
      this.aim = { id: p.id, x: p.x, y: p.y };
      this.cursorImg.setScale(this.cursorImg.scaleX * 1.08, this.cursorImg.scaleY * 1.08);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.aim;
      if (!a || a.id !== p.id || this.phase !== 'play') return;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      a.x = p.x;
      a.y = p.y;
      const L = SLUG.cursorLimit;
      this.cursor.x = Phaser.Math.Clamp(this.cursor.x + (dx / VIEW.zs) * CTRL.sensitivity, -L, L);
      this.cursor.y = Phaser.Math.Clamp(this.cursor.y - (dy / VIEW.zs) * CTRL.sensitivity, -L, L);
      this.placeCursor();
    });
    const up = (p: Phaser.Input.Pointer) => {
      const a = this.aim;
      if (!a || a.id !== p.id) return;
      this.aim = null;
      this.resetCursorSize();
      if (this.phase === 'play') this.swing(this.flightNow());
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  private resetCursorSize(): void {
    const cs = SLUG.position.good * VIEW.zs * 2;
    this.cursorImg.setDisplaySize(cs, cs * 0.87);
  }

  /** いま、ボールが手を離れてから何秒か(フレームの間も細かく) */
  private flightNow(): number {
    if (this.pitchPhase !== 'flight') return -1;
    return this.timer + (performance.now() - this.lastFrameWall) / 1000;
  }

  private placeCursor(): void {
    const c = project(this.cursor.x, this.cursor.y, 0);
    this.cursorImg.setPosition(c.x, c.y);
  }

  private button(x: number, y: number, label: string, bg: string, color: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, { fontFamily: size > 40 ? ARIAL : UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, backgroundColor: bg, padding: { x: 20, y: 10 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
  }

  // ---------------- タイトル ----------------

  private showTitle(): void {
    this.phase = 'title';
    this.hud.setVisible(false);
    this.controls.setVisible(false);
    const box = this.add.container(0, 0).setDepth(20);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0, 0).setInteractive();
    // 【仮】ロゴ(企画者の絵が来たら差しかえる)
    const logo1 = this.add.text(W / 2, 250, 'MONZ', { fontFamily: ARIAL, fontSize: '120px', color: '#2fe0ff', stroke: INK, strokeThickness: 18 }).setOrigin(0.5).setAngle(-6);
    const logo2 = this.add.text(W / 2, 370, 'SLUGGER', { fontFamily: ARIAL, fontSize: '104px', color: '#ffd23a', stroke: INK, strokeThickness: 18 }).setOrigin(0.5).setAngle(-6);
    const sub = this.add.text(W / 2, 480, 'モンズスラッガー', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
    const rec = loadLife().records.slugger;
    const best = this.add.text(W / 2, 550, rec ? `自己ベスト：${rec.bestScore.toLocaleString()}m` : '', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
    const play = this.button(W / 2, 1010, '  PLAY ▶  ', '#ffd23a', INK, 58);
    const how = this.button(W / 2, 1140, '  📖 遊び方  ', '#16101c', '#ffffff', 34);
    const back = this.button(70, 64, '◀', '#16101ccc', '#ffffff', 34);
    box.add([dim, logo1, logo2, sub, best, play, how, back]);
    play.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      audio.se('sting');
      box.destroy();
      this.startGame();
    });
    how.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.howTo();
    });
    back.on('pointerdown', () => {
      audio.se('back');
      this.scene.start('MinigameSelect');
    });
  }

  private howTo(): void {
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(30);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    canvasTextureOnce(this, 'slug:howpanel', 640, 820, (ctx) => drawPanel(ctx, 640, 820, 101));
    const panel = this.add.image(W / 2, H / 2, 'slug:howpanel');
    const text = [
      '遊び方',
      '',
      '・指でなぞってカーソルを動かし、はなすとスイング',
      '・赤い目印がボールの来る所（輪が縮んだ時が打ちどき）',
      '・カーソルがボールより上だとゴロ、',
      '  まん中だとライナー、下だとフライ',
      '・はやく振ると左へ、おそいと右へ飛ぶ',
      '・打った飛距離の合計がスコア！',
      '  （遠くへ飛ばすとホームラン）',
      '・ヒットにならなかったらミス',
      '  （空振り・見のがし・ファウル）。3回ミスでおしまい',
      '・ヒットを打つほど、球が速く・変化球も来て',
      '  目印が出るのもおそくなるよ',
      '',
      `報酬：${SLUG_REWARD.hitsPerCoin}ヒットごとに1コイン`,
      `経験値：${SLUG_REWARD.expFrom}本で1、そこから${SLUG_REWARD.hitsPerExp}本ごとに1`,
    ].join('\n');
    const t = this.add.text(W / 2, H / 2 - 40, text, { fontFamily: UI_FONT, fontSize: '27px', fontStyle: '800', color: INK, lineSpacing: 9 }).setOrigin(0.5);
    const close = this.button(W / 2, H / 2 + 340, '  とじる  ', '#ffd23a', INK, 36);
    close.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      audio.se('back');
      box.destroy();
    });
    box.add([dim, panel, t, close]);
  }

  // ---------------- プレイ ----------------

  private startGame(): void {
    this.s = newSlugger(newSeed());
    this.rng = rngOf(this.s);
    this.runId = `slugger-${Date.now().toString(36)}-${newSeed().toString(36)}`;
    this.phase = 'play';
    this.pitchNo = 0;
    this.cursor = { x: 0, y: 0 };
    this.placeCursor();
    this.aim = null;
    this.resetCursorSize();
    this.hud.setVisible(true);
    this.controls.setVisible(true);
    this.refreshHud();
    this.setBatter('idle');
    this.beginWindup();
  }

  private beginWindup(): void {
    this.pitch = nextPitch(this.s);
    this.pitchNo++;
    this.pitchPhase = 'windup';
    this.timer = 0;
    this.swung = false;
    this.result = null;
    this.trail = [];
    this.ballTime = 0;
    this.ball.setVisible(false);
    this.shadow.setVisible(false);
    this.setBatter('idle');
  }

  /** ピッチャーのポーズ。企画者の絵があればそれ(足元をそろえる)、なければプログラムで描いた仮の絵 */
  private setPitcher(p: PitcherPose): void {
    const key = slugPitcherKey(p);
    if (this.textures.exists(key)) {
      const a = SLUG_PITCHER_ART[p];
      this.pitcher.setTexture(key).setOrigin(a.ox, a.oy).setScale(PITCHER_ART_SCALE);
    } else this.pitcher.setTexture(`slug:pitcher:${p}`).setOrigin(0.5, 1).setScale(0.62);
  }

  /** バッターのポーズ。企画者の絵があればそれ(足元をそろえる)、なければプログラムで描いた仮の絵 */
  private setBatter(p: BatterPose): void {
    const key = slugBatterKey(p);
    if (this.textures.exists(key)) {
      const a = SLUG_BATTER_ART[p];
      this.batter.setTexture(key).setOrigin(a.ox, a.oy).setScale(BATTER_ART_SCALE);
    } else this.batter.setTexture(`slug:batter:${p}`).setOrigin(0.5, 1).setScale(BATTER.scale);
  }

  /** スイング。t: ボールが手を離れてからの秒数(投げる前は -1) */
  private swing(t: number): void {
    if (this.phase !== 'play' || this.swung || this.pitchPhase === 'result') return;
    audio.se('swing');
    if (this.pitchPhase === 'windup') {
      // 投げる前の素振りは数えない
      this.setBatter('swing');
      this.time.delayedCall(160, () => this.pitchPhase === 'windup' && this.setBatter('idle'));
      return;
    }
    const p = this.pitch!;
    this.swung = true;
    this.setBatter('swing');
    this.tweens.add({ targets: this.batter, angle: 5, duration: 60, yoyo: true });
    // 早すぎるスイングは空振り
    const r = canSwing(p, t) ? judge(p, t, this.cursor, this.rng) : judge(p, -999, this.cursor, this.rng);
    this.finishPitch(r);
  }

  private finishPitch(raw: SwingResult): void {
    const r = applyResult(this.s, raw);
    this.result = r;
    this.pitchPhase = 'result';
    this.timer = 0;
    this.refreshHud();
    if (r.contact) this.showContact(r);
    else this.showNoContact(r);
  }

  private refreshHud(): void {
    this.scoreText.setText(`${this.s.score.toLocaleString()}m`);
    this.comboText.setText(this.s.streak >= 2 ? `${this.s.streak}連続ヒット！` : '');
    // 左から使っていく: 残りは黄色い ●、空振りしたぶんは赤い ✕
    this.whiffMarks.forEach((t, i) => {
      const used = i >= SLUG.maxWhiffs - this.s.whiffs;
      t.setText(used ? '✕' : '●').setColor(used ? '#ff3b4f' : '#ffd23a');
    });
  }

  // ---------------- 演出 ----------------

  private popText(text: string, color: string, size: number, y = 640): Phaser.GameObjects.Text {
    const t = this.add.text(W / 2, y, text, { fontFamily: ARIAL, fontSize: `${size}px`, color, stroke: INK, strokeThickness: Math.round(size / 6) }).setOrigin(0.5).setDepth(15).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: y - 60, delay: 650, duration: 300, onComplete: () => t.destroy() });
    return t;
  }

  /** バットに当たらなかった球: 空振り・見のがし(どちらもミス) */
  private showNoContact(r: SwingResult): void {
    if (this.swung) this.time.delayedCall(120, () => this.setBatter('whiff'));
    const early = this.swung && r.timing < 0 && r.offset <= SLUG.position.good;
    this.showMiss(r.outcome === 'swingMiss' ? '空振り！' : '見のがし！', early ? 'ふるのが はやい' : '');
  }

  /** ミスの演出(赤く光る・ゆれる・残りの数) */
  private showMiss(title: string, hint: string): void {
    audio.se('slam', { pitch: 0.9 });
    this.cameras.main.shake(200, 0.007);
    const red = this.add.rectangle(0, 0, W, H, 0xff2040, 0.25).setOrigin(0, 0).setDepth(14);
    this.tweens.add({ targets: red, alpha: 0, duration: 400, onComplete: () => red.destroy() });
    this.popText(title, '#ff4f6a', 96);
    if (hint) this.popText(hint, '#ffffff', 34, 690);
    const left = SLUG.maxWhiffs - this.s.whiffs;
    this.popText(left > 0 ? `あと${left}回ミスでおしまい` : 'ゲームオーバー', left === 1 ? '#ffd23a' : '#ffffff', 40, 760);
    // しるしが ✕ に変わるのを目立たせる
    const mark = this.whiffMarks[SLUG.maxWhiffs - this.s.whiffs];
    if (mark) this.tweens.add({ targets: mark, scale: 1.8, duration: 120, yoyo: true });
  }

  /** バットに当たった球: ヒット・ホームラン・ファウル */
  private showContact(r: SwingResult): void {
    const p = this.pitch!;
    const at = project(p.tx, p.ty, 0);
    if (r.outcome === 'foul') {
      audio.se('bat', { pitch: 0.8 });
      this.impact(at.x, at.y, 0xffffff, 0.5);
      this.setBatter('hit');
      this.flyBall(r);
      this.showMiss('ファウル', r.timing < 0 ? 'ふるのが 少しはやい' : 'ふるのが 少しおそい');
      return;
    }
    const big = r.grade === 'perfect';
    const great = r.grade === 'great';
    const hit = isHit(r.outcome);
    audio.se('bat', { pitch: big ? 1.3 : great ? 1.12 : 0.92 });
    // ヒットストップ(一瞬止める)・画面のゆれ・光
    this.freeze = big ? 0.16 : great ? 0.07 : 0.03;
    this.cameras.main.shake(big ? 260 : 160, big ? 0.016 : great ? 0.009 : 0.005);
    if (big) {
      audio.se('crackBig');
      this.cameras.main.flash(160, 255, 255, 255);
      this.cameras.main.zoomTo(1.1, 60);
      this.time.delayedCall(220, () => this.cameras.main.zoomTo(1, 260, 'Cubic.easeOut'));
    }
    this.impact(at.x, at.y, big ? 0xffd23a : great ? 0x2fe0ff : 0xffffff, big ? 1.6 : great ? 1.15 : 0.8);
    this.time.delayedCall(big ? 150 : 60, () => this.setBatter(r.homerun ? 'homer' : 'hit'));
    this.popText(big ? 'PERFECT!!' : great ? 'GREAT!' : 'GOOD', big ? '#ffd23a' : great ? '#2fe0ff' : '#ffffff', big ? 96 : great ? 80 : 64, 560);
    // タイミングがずれていたら、どちらにずれたか小さく出す(練習しやすいように)
    if (!big && Math.abs(r.timing) > SLUG.timing.perfect) this.popText(r.timing < 0 ? '少しはやい' : '少しおそい', '#ffffff', 32, 620);
    this.flyBall(r);
    // 打球の結果は、ボールが落ちるころに出す(ホームランは flyBall が出す)
    if (!r.homerun)
      this.time.delayedCall(520, () => {
        audio.se('select');
        this.popText('ヒット！', '#ffffff', 92, 680);
      });
    if (hit) this.scorePop(at.x, at.y, r.points);
    if (hit && this.s.streak >= 2) this.tweens.add({ targets: this.comboText, scale: 1.4, duration: 90, yoyo: true });
  }

  /** 打った瞬間: 光・広がる輪・飛びちる火花 */
  private impact(x: number, y: number, color: number, power: number): void {
    const glow = this.add.image(x, y, 'slug:glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(12).setScale(0.6);
    this.tweens.add({ targets: glow, scale: 3.6 * power, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => glow.destroy() });
    const ring = this.add.circle(x, y, 24).setStrokeStyle(10, color, 1).setDepth(12);
    this.tweens.add({ targets: ring, scale: 6 * power, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const n = Math.round(10 + 8 * power);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const len = Phaser.Math.Between(26, 46) * power;
      const spark = this.add.rectangle(x, y, len, 7, i % 3 === 0 ? 0xffffff : color).setRotation(a).setDepth(12);
      const d = Phaser.Math.Between(110, 200) * power;
      this.tweens.add({ targets: spark, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, scaleX: 0.2, alpha: 0, duration: 330, ease: 'Cubic.easeOut', onComplete: () => spark.destroy() });
    }
  }

  /** 点数が飛んでいって、上の点数に入る */
  private scorePop(x: number, y: number, points: number): void {
    const t = this.add.text(x, y - 40, `+${points}m`, { fontFamily: ARIAL, fontSize: '46px', color: '#ffd23a', stroke: INK, strokeThickness: 9 }).setOrigin(0.5).setDepth(16);
    this.tweens.add({
      targets: t,
      x: W / 2,
      y: 60,
      scale: 0.6,
      delay: 380,
      duration: 420,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        t.destroy();
        this.tweens.add({ targets: this.scoreText, scale: 1.25, duration: 80, yoyo: true });
      },
    });
  }

  /**
   * 打球が飛んでいく(光りながら、オレンジの尾を引く)。
   * ゴロ: 低くはねながら / ライナー: 低くまっすぐ / フライ: 高い山なり。ファウルは横の上へ
   */
  private flyBall(r: SwingResult): void {
    const p = this.pitch!;
    const from = project(p.tx, p.ty, 0);
    const foul = r.outcome === 'foul';
    const c = r.contact ?? 'liner';
    // 着く所(画面の y)・山の高さ・時間・はねる回数
    const shape = foul
      ? { far: -120, arc: 120, dur: 520, bounce: 0 }
      : r.homerun
        ? { far: 210, arc: 300, dur: 1150, bounce: 0 }
        : c === 'grounder'
          ? { far: 470, arc: 0, dur: 700, bounce: 3 }
          : c === 'liner'
            ? { far: 400, arc: 50, dur: 720, bounce: 0 }
            : { far: 380, arc: 260, dur: 900, bounce: 0 };
    const far = shape.far;
    const toX = foul ? (r.timing < 0 ? -80 : W + 80) : VIEW.vx + r.dir * (r.homerun ? 180 : c === 'grounder' ? 200 : 260);
    const dur = shape.dur;
    const startScale = (BALL_R * VIEW.zs * 2) / BALL_PX;
    const fly = { u: 0 };
    this.trail = [];
    this.ball.setVisible(true).setPosition(from.x, from.y).setScale(startScale);
    this.ballGlow.setVisible(true).setTint(0xffb02a).setAlpha(0.9);
    this.shadow.setVisible(false);
    this.tweens.add({
      targets: fly,
      u: 1,
      duration: dur,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const u = fly.u;
        // 山なりに上がって、小さくなっていく
        const x = from.x + (toX - from.x) * u;
        const bounce = shape.bounce ? Math.abs(Math.sin(u * Math.PI * shape.bounce)) * 40 * (1 - u) : 0;
        const y = from.y + (far - from.y) * u - Math.sin(u * Math.PI) * shape.arc - bounce;
        const sc = startScale * (foul ? 1.1 - 0.5 * u : 1.15 - 0.95 * u);
        this.ball.setPosition(x, y).setScale(sc).setAngle(u * 1400);
        this.ballGlow.setPosition(x, y).setScale((sc * BALL_PX * 2.4) / 128);
        this.trail.push({ x, y, r: (sc * BALL_PX) / 2 });
        if (this.trail.length > 14) this.trail.shift();
      },
      onComplete: () => {
        this.ball.setVisible(false);
        this.ballGlow.setVisible(false).setTint(0x8ff4ff);
        if (foul) return;
        const label = this.add.text(toX, far - 20, `${r.distance}m`, { fontFamily: ARIAL, fontSize: r.homerun ? '56px' : '42px', color: '#ffffff', stroke: INK, strokeThickness: 9 }).setOrigin(0.5).setDepth(15).setScale(0.4);
        this.tweens.add({ targets: label, scale: 1, duration: 140, ease: 'Back.easeOut' });
        this.tweens.add({ targets: label, alpha: 0, y: label.y - 40, delay: 500, duration: 300, onComplete: () => label.destroy() });
        if (r.homerun) this.fireworks(toX, far);
      },
    });
    if (r.homerun) {
      this.time.delayedCall(260, () => {
        audio.se('cheer');
        const t = this.popText('HOME RUN!', '#ff4fa3', 92, 470);
        t.setAngle(-6);
        this.confetti();
      });
    }
  }

  /** ホームランの花火 */
  private fireworks(x: number, y: number): void {
    audio.se('burst');
    const colors = [0xffd23a, 0x2fe0ff, 0xff4fa3, 0x4fd65a, 0xffffff];
    for (const [cx, cy, n] of [[x, y, 30], [x - 160, y + 60, 18], [x + 170, y + 40, 18]] as const) {
      const g = this.add.image(cx, cy, 'slug:glow').setTint(colors[n % 5]).setBlendMode(Phaser.BlendModes.ADD).setDepth(12).setScale(0.5);
      this.tweens.add({ targets: g, scale: 3, alpha: 0, duration: 500, onComplete: () => g.destroy() });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const d = Phaser.Math.Between(90, 190) * (n > 20 ? 1 : 0.7);
        const dot = this.add.circle(cx, cy, Phaser.Math.Between(5, 10), colors[i % colors.length]).setDepth(13);
        this.tweens.add({ targets: dot, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d + 40, alpha: 0, scale: 0.4, duration: 750, ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
      }
    }
  }

  /** ホームランの紙ふぶき */
  private confetti(): void {
    const colors = [0xffd23a, 0x2fe0ff, 0xff4fa3, 0x4fd65a, 0xffffff, 0x8a35e0];
    for (let i = 0; i < 46; i++) {
      const x = Phaser.Math.Between(0, W);
      const c = this.add.rectangle(x, -20 - Phaser.Math.Between(0, 200), Phaser.Math.Between(10, 18), Phaser.Math.Between(16, 26), colors[i % colors.length]).setDepth(13);
      this.tweens.add({ targets: c, y: H * Phaser.Math.FloatBetween(0.55, 0.9), x: x + Phaser.Math.Between(-80, 80), angle: Phaser.Math.Between(-540, 540), alpha: 0, duration: Phaser.Math.Between(1100, 1700), ease: 'Sine.easeIn', onComplete: () => c.destroy() });
    }
  }

  // ---------------- 一時停止・おわり ----------------

  private pause(): void {
    this.phase = 'paused';
    this.aim = null;
    this.resetCursorSize();
    this.tweens.pauseAll();
    const box = this.add.container(0, 0).setDepth(30);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
    const t = this.add.text(W / 2, 440, 'PAUSE', { fontFamily: ARIAL, fontSize: '110px', color: '#ffd23a', stroke: INK, strokeThickness: 16 }).setOrigin(0.5);
    const go = this.button(W / 2, 660, '  つづける  ', '#ffd23a', INK, 40);
    const quit = this.button(W / 2, 800, '  やめる  ', '#8a35e0', '#ffffff', 34);
    box.add([dim, t, go, quit]);
    go.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      audio.se('select');
      box.destroy();
      this.tweens.resumeAll();
      // 投げている途中なら、その球はやり直し(止めた間にタイミングがずれるため)
      if (this.pitchPhase === 'flight') this.beginWindup();
      this.time.delayedCall(200, () => (this.phase = 'play'));
    });
    quit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      box.destroy();
      this.tweens.resumeAll();
      this.gameOver();
    });
  }

  private gameOver(): void {
    this.phase = 'over';
    this.aim = null;
    this.controls.setVisible(false);
    const s = this.s;
    const r = sluggerReward(s);
    this.record.grant({ runId: this.runId, source: 'slugger', coins: r.coins, exp: r.exp });
    const best = this.record.record('slugger', s.score, s.bestStreak);
    this.time.delayedCall(700, () => {
      audio.se('slam');
      const box = this.add.container(0, 0).setDepth(30);
      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0, 0).setInteractive();
      const title = this.add.text(W / 2, 170, 'GAME OVER', { fontFamily: ARIAL, fontSize: '96px', color: '#c9c4d6', stroke: INK, strokeThickness: 16 }).setOrigin(0.5);
      const score = this.add.text(W / 2, 300, `${s.score.toLocaleString()}m`, { fontFamily: ARIAL, fontSize: '80px', color: '#ffd23a', stroke: INK, strokeThickness: 14 }).setOrigin(0.5);
      canvasTextureOnce(this, 'slug:overpanel', 600, 520, (ctx) => drawPanel(ctx, 600, 520, 97));
      const panel = this.add.image(W / 2, 650, 'slug:overpanel');
      const lines = [
        '（飛距離の合計）',
        `ヒット   ${s.hits}`,
        `ホームラン   ${s.homeruns}`,
        `最長飛距離   ${s.longest}m`,
        `最高連続ヒット   ${s.bestStreak}`,
        `PERFECT   ${s.perfects}`,
        '',
        `獲得コイン   ${r.coins}   獲得EXP   ${r.exp}`,
      ];
      const txt = this.add.text(W / 2, 650, lines.join('\n'), { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: INK, align: 'center', lineSpacing: 10 }).setOrigin(0.5);
      const note = this.add.text(W / 2, 950, best ? '★ 自己ベスト！' : '', { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);
      const toSelect = this.button(W / 2 - 160, 1080, ' ミニゲーム選択へ ', '#16101c', '#ffffff', 30);
      const again = this.button(W / 2 + 170, 1080, ' もう一度 ', '#ffd23a', INK, 34);
      box.add([dim, title, score, panel, txt, note, toSelect, again]);
      toSelect.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        audio.se('back');
        this.scene.start('MinigameSelect');
      });
      again.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        audio.se('next');
        box.destroy();
        this.startGame();
      });
    });
  }

  // ---------------- 毎フレーム ----------------

  update(_t: number, delta: number): void {
    this.lastFrameWall = performance.now();
    let dt = Math.min(delta / 1000, 1 / 20);
    if (this.freeze > 0) {
      this.freeze -= dt;
      dt = 0;
    }
    // ヒットストップの間は、演出の動きもほぼ止める
    this.tweens.timeScale = this.freeze > 0 ? 0.05 : 1;
    if (this.phase === 'play') this.tick(dt);
    this.draw();
  }

  private tick(dt: number): void {
    this.timer += dt;
    if (this.pitchPhase === 'flight' || (this.pitchPhase === 'result' && this.result?.grade === 'miss')) this.ballTime += dt;
    const p = this.pitch!;
    if (this.pitchPhase === 'windup') {
      const pose: PitcherPose = this.timer < SLUG.windup * 0.45 ? 'ready' : this.timer < SLUG.windup * 0.85 ? 'windup' : 'throw';
      this.setPitcher(pose);
      if (this.timer >= SLUG.windup) {
        this.pitchPhase = 'flight';
        this.timer -= SLUG.windup;
        this.ballTime = this.timer;
        this.ball.setVisible(true);
        this.shadow.setVisible(true);
        audio.se('tap', { pitch: 0.6 });
      }
    } else if (this.pitchPhase === 'flight') {
      // 見のがし: ボールが通りすぎた
      if (passed(p, this.timer)) this.finishPitch(judge(p, null, this.cursor));
    } else if (this.pitchPhase === 'result') {
      if (this.timer > 0.25) this.setPitcher('ready');
      if (this.timer >= SLUG.afterPitch) {
        if (this.s.over) this.gameOver();
        else this.beginWindup();
      }
    }
  }

  private draw(): void {
    const g = this.fx;
    g.clear();
    this.marker.clear();
    const p = this.pitch;
    // 着く所の目印。出る時間は球数で短くなる。輪が縮みきった時がボールの着く時
    if (p && this.phase === 'play' && (this.pitchPhase === 'windup' || this.pitchPhase === 'flight') && !this.swung) {
      // 輪が縮みきるのは、いちばん良いタイミング(着くより少し前)
      const toArrive = (this.pitchPhase === 'windup' ? SLUG.windup - this.timer + p.flight : p.flight - this.timer) - SLUG.idealBefore;
      if (toArrive <= markerLead(this.s.pitches) && toArrive > -0.05) {
        const c = project(p.tx, p.ty, 0);
        const r = BALL_R * VIEW.zs;
        const m = this.marker;
        m.lineStyle(5, 0xff3b4f, 0.9).strokeCircle(c.x, c.y, r);
        m.lineStyle(3, 0xffffff, 0.9).lineBetween(c.x - r * 0.5, c.y, c.x + r * 0.5, c.y).lineBetween(c.x, c.y - r * 0.5, c.x, c.y + r * 0.5);
        // タイミングの輪(着く0.8秒前から縮みはじめる)
        const k = Math.min(1, Math.max(0, toArrive / 0.8));
        m.lineStyle(4, 0xffd23a, 0.4 + 0.6 * (1 - k)).strokeCircle(c.x, c.y, r * (1 + 2.2 * k));
      }
    }
    // 飛んでくるボール(打たれたボールは flyBall が動かす)
    const flying = p && (this.pitchPhase === 'flight' || (this.pitchPhase === 'result' && this.result?.grade === 'miss'));
    if (flying && this.phase !== 'title') {
      const t = this.ballTime / p.flight;
      if (t > 1.25) {
        this.ball.setVisible(false);
        this.ballGlow.setVisible(false);
        this.shadow.setVisible(false);
      } else {
        const b = ballAt(p, Math.min(t, 1));
        // ホームを過ぎたら手前へ抜けていく
        const z = t > 1 ? -(t - 1) * 0.9 : b.z;
        const sp = project(b.x, b.y, Math.max(z, -0.2));
        const r = BALL_R * VIEW.zs * sp.k;
        this.ball.setVisible(true).setPosition(sp.x, sp.y).setScale((r * 2) / BALL_PX).setAngle(this.ballTime * 900);
        this.ballGlow.setVisible(true).setPosition(sp.x, sp.y).setScale((r * 4.2) / 128).setAlpha(0.75);
        const sh = project(b.x, GROUND_Y, Math.max(z, -0.2));
        this.shadow.setVisible(true).setPosition(sh.x, sh.y).setSize(r * 2.2, r * 0.7);
        this.trail.push({ x: sp.x, y: sp.y, r: r * 0.9 });
        if (this.trail.length > 9) this.trail.shift();
      }
    }
    // ボールの軌跡(投球はシアン、打球はオレンジ)
    const hitTrail = this.pitchPhase === 'result' && this.result && this.result.grade !== 'miss';
    this.trail.forEach((d, i) => {
      g.fillStyle(hitTrail ? 0xffb02a : 0x2fe0ff, ((i + 1) / this.trail.length) * (hitTrail ? 0.55 : 0.4));
      g.fillCircle(d.x, d.y, d.r * (0.5 + (0.5 * (i + 1)) / this.trail.length));
    });
  }
}
