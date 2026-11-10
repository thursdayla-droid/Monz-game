import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { randomSeed, mulberry32, type Rng } from '../core/rng';
import { BETS, CHEST_PAY, dealChests, newBonus, pickChest, REELS, ROWS, SYMBOL_NAME, SYMBOLS, spin, type BonusState, type ChestContent, type SpinResult, type SymbolId } from '../core/slot/slot';
import { UI_FONT } from '../ui/paint';
import { fillSize, safeInsets } from '../ui/viewport';
import { planShow, type BigReachType, type NoticeLevel, type SpinShow } from '../core/slot/reach';

/**
 * MONZ SLOT(ミニゲーム⑤)の 画面(2026-11-10 企画者の 仕様書。docs/SLOT.md)。2段目: スロット画面。
 * - たての 全画面。上: 大きな 液晶(リーチ演出は 4段目)・まん中: 5リール×3段・下: コイン・WIN・BET・SPIN
 * - MONZ コインで 遊ぶ(企画者 2026-11-10)。回した 時に 結果を 決めて、BET と 当たりを 1回で 保存(LifeRecord.slotSpin)
 * - リールは 左から 順に 自動で 止まる【確定】。止まる 時間は【仮】
 * - 当たりの 見せ方(企画者 2026-11-10「A」): BET 以上 もどる 当たりは 大きく 光る・BET より 少ない 当たりは 細い 枠と WIN の 数字だけ
 * - 図柄の 絵は 企画者が 作る(届くまでは プログラムで 描いた【仮】の 絵)
 * - オートスピン(企画者 2026-11-10): 回数を えらぶ(最大 100回)。ボーナス・コイン不足・もう一度 押すと 止まる。速さは 前の ふつうの 速さ
 * - 宝箱ボーナス【確定】: 液晶に 宝箱 3つ。えらぶ たびに コインを もらって 保存(とちゅうで 閉じても 続きから)
 */
const W = 720;
const BASE_H = 1280;
const CELL = 124;
const GAP = 8;
const REEL_W = REELS * CELL + (REELS - 1) * GAP;
const SAVE_KEY = 'monz:slot';
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

const symKey = (s: SymbolId) => `slot:sym:${s}`;

interface ReelView {
  imgs: Phaser.GameObjects.Image[];
  offset: number;
  spinning: boolean;
  /** 回る 速さの 倍率(リーチの 時は ゆっくり) */
  speed: number;
}
/** リーチの 時の 時間(ms)【仮】。オートの 時は 0.6倍 */
const SMALL_REACH_MS = 1300;
const BIG_REACH_MS = 2800;
const LAST_REEL_MS = 1000;

export class SlotScene extends Phaser.Scene {
  private H = BASE_H;
  private rng: Rng = mulberry32(randomSeed());
  private bet: number = BETS[0];
  private record!: LifeRecord;
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
  private shown = 0;

  constructor() {
    super('Slot');
  }

  create(): void {
    this.reels = [];
    this.glow = [];
    this.betBtns = [];
    this.busy = false;
    this.autoLeft = 0;
    this.autoNow = false;
    this.picker = undefined;
    this.bonus = undefined;
    this.H = Math.max(BASE_H, fillSize(this, { w: W, h: BASE_H }, { minRatio: 0.4, maxRatio: W / BASE_H }).h);
    this.scale.setGameSize(W, this.H);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(W, BASE_H));
    this.record = new LifeRecord(loadLife());
    this.bet = loadBet();
    this.shown = this.record.coins;
    for (const s of SYMBOLS) if (!this.textures.exists(symKey(s))) drawSymbolTexture(this, s);
    for (const c of ['purple', 'red', 'blue']) for (const o of [false, true]) if (!this.textures.exists(chestKey(c, o))) drawChestTexture(this, c, o);
    this.layout();
    audio.playBgm('main');
    this.cameras.main.fadeIn(250, 0, 0, 0);
    // ボーナスの とちゅうで 閉じていたら 続きから
    const saved = loadSave().bonus;
    if (saved) {
      this.busy = true;
      this.bonus = { ...saved, chests: dealChests(this.rng), over: false };
      this.time.delayedCall(400, () => this.bonusRound(true));
    }
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 0): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center' }).setOrigin(0.5);
  }

  private layout(): void {
    const H = this.H;
    const bottom = H - safeInsets(this).bottom - 24;
    // 背景(紫の ネオン)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a0f4a, 0x2a0f4a, 0x0d0614, 0x0d0614, 1).fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) bg.fillStyle(i % 2 ? 0xff8a1f : 0x9b5cff, 0.06).fillCircle(Math.random() * W, Math.random() * H, 120 + Math.random() * 160);

    // 下: コイン・WIN(上の 段)と BET・SPIN(下の 段)
    const uiH = 250;
    const uiTop = bottom - uiH;
    this.reelY = uiTop - 26 - (ROWS * CELL + (ROWS - 1) * GAP);
    this.reelX = (W - REEL_W) / 2;
    // 上: 液晶
    const top = 96;
    this.lcdBox = { x: 24, y: top, w: W - 48, h: this.reelY - 40 - top };

    // もどる・題
    const back = this.text(86, 46, '◀ もどる', 26).setBackgroundColor('#16101ccc').setPadding(16, 8, 16, 10).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    const title = this.text(W / 2 + 70, 46, 'MONZ SLOT', 44, '#ffd23a', 8);
    title.setShadow(0, 4, '#9b5cff', 0, true, true);
    // 確認用ページだけ: コインを 足す(確認用ページは コインが 0 から なので)
    if ((window as { __MONZ_START?: string }).__MONZ_START === 'Slot') {
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
    }

    this.drawLcd();
    this.drawCabinet();
    this.drawReels();
    this.drawUi(uiTop);
  }

  // ---------------- 液晶(上) ----------------

  private drawLcd(): void {
    const { x, y, w, h } = this.lcdBox;
    // 液晶は リールの 図柄より 前(上から 入って くる 図柄を かくす)
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0xffd23a, 1).fillRoundedRect(x - 8, y - 8, w + 16, h + 16, 26);
    g.fillStyle(0x16101c, 1).fillRoundedRect(x, y, w, h, 20);
    g.fillGradientStyle(0x3a1466, 0x5a1a7a, 0x120818, 0x1a0a2a, 1).fillRect(x + 10, y + 10, w - 20, h - 20);
    this.lcd = this.add.container(x + w / 2, y + h / 2).setDepth(5);
    this.lcdIdle();
  }

  /** 液晶を 入れかえる */
  private lcdShow(items: Phaser.GameObjects.GameObject[]): void {
    this.lcd.removeAll(true);
    this.lcd.add(items);
  }

  private lcdIdle(): void {
    const h = this.lcdBox.h;
    const logo = this.text(0, -h * 0.12, 'MONZ SLOT', Math.min(96, h * 0.26), '#ffd23a', 10);
    logo.setShadow(0, 6, '#ff4ad8', 0, true, true);
    const sub = this.text(0, h * 0.18, 'SPIN を 押してね', Math.min(30, h * 0.09), '#e8dcf4');
    this.tweens.add({ targets: logo, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.lcdShow([logo, sub]);
  }

  // ---------------- リール(まん中) ----------------

  private drawCabinet(): void {
    const g = this.add.graphics().setDepth(5);
    const x = this.reelX;
    const y = this.reelY;
    const h = ROWS * CELL + (ROWS - 1) * GAP;
    // 枠(金)
    g.lineStyle(10, 0xffd23a, 1).strokeRoundedRect(x - 14, y - 14, REEL_W + 28, h + 28, 18);
    g.lineStyle(4, 0x16101c, 1).strokeRoundedRect(x - 20, y - 20, REEL_W + 40, h + 40, 22);
    // リールの 上と 下を かくす 板(回っている 図柄が はみ出ない ように)。上の 板は 液晶の 下の はしまで
    const cover = this.add.graphics().setDepth(4);
    const lcdBottom = this.lcdBox.y + this.lcdBox.h + 8;
    cover.fillStyle(0x16101c, 1).fillRect(0, lcdBottom, W, y - 14 - lcdBottom);
    cover.fillStyle(0x16101c, 1).fillRect(0, y + h + 14, W, 40 + CELL);
  }

  private cellPos(r: number, i: number): { x: number; y: number } {
    return { x: this.reelX + r * (CELL + GAP) + CELL / 2, y: this.reelY + i * (CELL + GAP) + CELL / 2 };
  }

  private drawReels(): void {
    const h = ROWS * CELL + (ROWS - 1) * GAP;
    const g = this.add.graphics();
    for (let r = 0; r < REELS; r++) {
      const x = this.reelX + r * (CELL + GAP);
      g.fillGradientStyle(0xfdf6ff, 0xfdf6ff, 0xd8c8ec, 0xd8c8ec, 1).fillRoundedRect(x, this.reelY, CELL, h, 12);
    }
    for (let r = 0; r < REELS; r++) {
      const imgs: Phaser.GameObjects.Image[] = [];
      // 見える 3つ + 上に 1つ(回る 時に 上から 入って くる)
      for (let i = -1; i < ROWS; i++) {
        const p = this.cellPos(r, i);
        imgs.push(this.add.image(p.x, p.y, symKey(this.randSym())).setDisplaySize(CELL - 10, CELL - 10).setDepth(2));
      }
      this.reels.push({ imgs, offset: 0, spinning: false, speed: 1 });
    }
  }

  private randSym(): SymbolId {
    return SYMBOLS[Math.floor(this.rng() * SYMBOLS.length)];
  }

  update(_t: number, dt: number): void {
    for (let r = 0; r < this.reels.length; r++) {
      const v = this.reels[r];
      if (!v.spinning) continue;
      v.offset += SPIN_SPEED * v.speed * Math.min(dt, 50);
      const step = CELL + GAP;
      while (v.offset >= step) {
        v.offset -= step;
        // いちばん 下の 絵を 上へ 回して、新しい 図柄に
        const last = v.imgs.pop()!;
        last.setTexture(symKey(this.randSym()));
        v.imgs.unshift(last);
      }
      v.imgs.forEach((img, k) => img.setY(this.cellPos(r, k - 1).y + v.offset));
    }
  }

  // ---------------- 下の ボタン ----------------

  private drawUi(top: number): void {
    const g = this.add.graphics().setDepth(6);
    // コインと WIN の 箱
    const box = (x: number, w: number, label: string, color: number) => {
      g.fillStyle(0x16101c, 1).fillRoundedRect(x, top, w, 86, 16);
      g.lineStyle(4, color, 1).strokeRoundedRect(x, top, w, 86, 16);
      this.text(x + w / 2, top + 18, label, 18, '#c8bcd8').setDepth(7);
    };
    box(24, 330, 'MONZ コイン', 0xffd23a);
    box(W - 24 - 330, 330, 'WIN', 0xff8a1f);
    this.credit = this.text(24 + 165, top + 56, this.shown.toLocaleString(), 36, '#ffd23a').setDepth(7);
    this.winText = this.text(W - 24 - 165, top + 56, '0', 36, '#ffffff').setDepth(7);

    // BET(10・50・100)
    const by = top + 180;
    this.text(110, by - 52, 'BET', 20, '#c8bcd8').setDepth(7);
    BETS.forEach((b, i) => {
      const t = this.text(52 + i * 96, by, String(b), 30, '#16101c').setDepth(7).setPadding(14, 14, 14, 16).setFixedSize(88, 0);
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.busy) return;
        audio.se('tap');
        this.bet = b;
        saveBet(b);
        this.paintBets();
      });
      this.betBtns.push(t);
    });
    this.paintBets();

    // AUTO(回数を えらぶ・回っている 間は STOP)
    const ac = this.add.container(352, by).setDepth(7);
    const abg = this.add.graphics();
    abg.fillStyle(0x16101c, 1).fillRoundedRect(-56, -54, 112, 108, 20);
    abg.fillGradientStyle(0xffd23a, 0xffd23a, 0xff8a1f, 0xff8a1f, 1).fillRoundedRect(-50, -48, 100, 96, 16);
    this.autoLabel = this.text(0, 0, 'AUTO', 26, '#16101c');
    ac.add([abg, this.autoLabel]);
    ac.setSize(112, 108).setInteractive({ useHandCursor: true });
    ac.on('pointerdown', () => this.tapAuto());
    this.autoBtn = ac;

    // SPIN(大きな 丸い ボタン)
    const sx = W - 24 - 130;
    const c = this.add.container(sx, by).setDepth(7);
    const bgc = this.add.graphics();
    bgc.fillStyle(0x16101c, 1).fillRoundedRect(-130, -62, 260, 124, 62);
    bgc.fillGradientStyle(0xc070ff, 0xc070ff, 0x7a2ad0, 0x7a2ad0, 1).fillRoundedRect(-122, -54, 244, 108, 54);
    bgc.lineStyle(6, 0xffd23a, 1).strokeRoundedRect(-122, -54, 244, 108, 54);
    this.spinLabel = this.text(0, 0, 'SPIN', 52, '#ffffff', 8);
    c.add([bgc, this.spinLabel]);
    c.setSize(260, 124).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => (this.autoLeft > 0 ? this.stopAuto() : this.doSpin()));
    this.spinBtn = c;
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
    const first = this.autoNow ? AUTO_STOP_FIRST : STOP_FIRST;
    for (const v of this.reels) {
      v.spinning = true;
      v.speed = 1;
    }
    if (show.notice) this.notice(show.notice);
    this.time.delayedCall(first + (show.notice ? 500 : 0), () => this.stopNext(0, res, show));
  }

  /** リールを 1つずつ 止める。2リール目・3リール目の あとで リーチ */
  private stopNext(r: number, res: SpinResult, show: SpinShow): void {
    this.stopReel(r, res, r === REELS - 1);
    if (r === REELS - 1) return;
    const k = this.autoNow ? 0.6 : 1;
    const step = this.autoNow ? AUTO_STOP_STEP : STOP_STEP;
    const next = (ms: number) => this.time.delayedCall(ms, () => this.stopNext(r + 1, res, show));
    if (r === 1 && show.small) {
      // 小さい リーチ: 3リール目が ゆっくり
      this.smallReach(res, show);
      for (let i = 2; i < REELS; i++) this.reels[i].speed = 0.45;
      return void next(SMALL_REACH_MS * k);
    }
    if (r === 2 && show.big) {
      // 大きい リーチ: 企画者の リーチ演出が 入る ところ(今は 仮)。4・5リール目が ゆっくり
      for (let i = 3; i < REELS; i++) this.reels[i].speed = 0.35;
      this.markReach(res, show, 3);
      this.bigReach(show.big, BIG_REACH_MS * k);
      return void next(BIG_REACH_MS * k);
    }
    if (r === 2 && show.small && !show.big) {
      // 小さい リーチ 失敗
      this.lcdIdle();
    }
    if (r === 3 && show.big) return void next(LAST_REEL_MS * k);
    next(step);
  }

  /** そろって いる リーチ図柄を 光らせる(reels: 何リール目まで) */
  private markReach(res: SpinResult, show: SpinShow, reels: number): void {
    if (!show.reach) return;
    for (let r = 0; r < reels; r++)
      res.grid[r].forEach((x, i) => {
        if (x !== show.reach!.symbol) return;
        const p = this.cellPos(r, i);
        const f = this.add.rectangle(p.x, p.y, CELL - 2, CELL - 2).setStrokeStyle(6, 0xffd23a).setDepth(3);
        this.tweens.add({ targets: f, alpha: 0.3, duration: 260, yoyo: true, repeat: -1 });
        this.glow.push(f);
      });
  }

  /** 予告(回しはじめ)【仮の 見た目】: 1 青・2 赤・3 虹 */
  private notice(level: NoticeLevel): void {
    const { w, h } = this.lcdBox;
    const color = level === 3 ? 0xffffff : level === 2 ? 0xff3a5a : 0x3a9dff;
    const flash = this.add.rectangle(0, 0, w - 20, h - 20, color, 0.6);
    const word = level === 3 ? '！！！' : level === 2 ? '激アツ！？' : 'チャンス！？';
    const t = this.text(0, 0, word, Math.min(90, h * 0.24), level === 2 ? '#ffd23a' : '#ffffff', 12);
    this.lcdShow([flash, t]);
    t.setScale(2.5);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: flash, alpha: 0.12, duration: 500 });
    if (level === 3) {
      let hue = 0;
      const ev = this.time.addEvent({ delay: 60, repeat: 20, callback: () => t.setColor(`hsl(${(hue += 40) % 360},90%,65%)`) });
      t.once(Phaser.GameObjects.Events.DESTROY, () => ev.remove());
      this.cameras.main.shake(250, 0.006);
    }
    audio.se(level >= 2 ? 'mcCutin' : 'mcSelect');
  }

  /** 大きい リーチの 成功・失敗【仮の 見た目】 */
  private reachResult(ok: boolean): void {
    const h = this.lcdBox.h;
    if (ok) {
      const t = this.text(0, 0, '成功!!', Math.min(110, h * 0.3), '#ffd23a', 12);
      this.lcdShow([this.add.rectangle(0, 0, this.lcdBox.w - 20, h - 20, 0xffffff, 0.35), t]);
      t.setScale(2.4);
      this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.cameras.main.flash(260, 255, 255, 200);
      audio.se('koBlast');
    } else {
      const t = this.text(0, 0, 'ざんねん…', Math.min(70, h * 0.19), '#9a8aa8', 8);
      this.lcdShow([t]);
      audio.se('back');
    }
  }

  /** 小さい リーチ【仮の 見た目】 */
  private smallReach(res: SpinResult, show: SpinShow): void {
    const h = this.lcdBox.h;
    this.markReach(res, show, 2);
    const t = this.text(0, -h * 0.05, 'リーチ！', Math.min(96, h * 0.26), '#ffd23a', 12);
    t.setShadow(0, 6, '#ff4ad8', 0, true, true);
    const sub = this.text(0, h * 0.22, `${SYMBOL_NAME[show.reach!.symbol]} が そろうか…？`, Math.min(26, h * 0.07), '#ffffff', 5);
    this.lcdShow([t, sub]);
    this.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, scale: 1.06, duration: 300, yoyo: true, repeat: -1, delay: 260 });
    audio.se('mcCutin');
  }

  /** 大きい リーチ【仮の 見た目】。企画者の リーチ演出(7種類くらい)が 入る ところ */
  private bigReach(type: BigReachType, ms: number): void {
    const { w, h } = this.lcdBox;
    const col = type.id === 'strong' ? 0xb46aff : type.id === 'mid' ? 0x3a9dff : 0x3ec46a;
    const items: Phaser.GameObjects.GameObject[] = [];
    const bg = this.add.rectangle(0, 0, w - 20, h - 20, 0x000000, 0.5);
    const rays = this.add.graphics();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      rays.fillStyle(col, 0.28).fillTriangle(0, 0, Math.cos(a) * 700, Math.sin(a) * 700, Math.cos(a + 0.16) * 700, Math.sin(a + 0.16) * 700);
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 4000, repeat: -1 });
    // 仮の キャラ(シルエット)
    const sil = this.add.graphics();
    sil.fillStyle(0x16101c, 0.95).fillCircle(0, -40, 46).fillRoundedRect(-60, 4, 120, 110, 30);
    sil.setPosition(-w * 0.6, h * 0.12);
    this.tweens.add({ targets: sil, x: -w * 0.26, duration: 380, ease: 'Back.easeOut' });
    const t = this.text(w * 0.1, -h * 0.2, 'リーチ!!', Math.min(100, h * 0.27), '#ffd23a', 12);
    t.setShadow(0, 8, '#ff4ad8', 0, true, true);
    const name = this.text(w * 0.1, h * 0.05, type.name, Math.min(30, h * 0.08), '#ffffff', 6);
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
  }

  private stopReel(r: number, res: SpinResult, last: boolean): void {
    const v = this.reels[r];
    v.spinning = false;
    v.offset = 0;
    // 上に 1つ 余分(見えない)+ 結果の 3つ。少し 上から 落として ぽんと 止める
    const col = [this.randSym(), ...res.grid[r]];
    v.imgs.forEach((img, k) => {
      img.setTexture(symKey(col[k]));
      const y = this.cellPos(r, k - 1).y;
      img.setY(y - 46);
      this.tweens.add({ targets: img, y, duration: 200, ease: 'Back.easeOut' });
    });
    audio.se('knock', { pitch: 1 + r * 0.05 });
    if (last) this.time.delayedCall(260, () => this.reveal(res));
    // 大きい リーチの 結果(4リール目が 止まった 時に わかる)
    if (r === 3 && this.lastShow?.big) this.reachResult(this.lastShow.bigSuccess);
  }

  private reveal(res: SpinResult): void {
    const big = res.win >= this.bet;
    this.shown += res.win;
    if (res.win > 0) {
      // 当たった マス(同じ マスが 2つの 当たりに 入る ことも ある)
      const cells = new Map<string, [number, number]>();
      for (const w of res.wins) for (const c of w.cells) cells.set(c.join(), c);
      for (const [r, i] of cells.values()) this.cellGlow(r, i, big);
      this.countUp(res.win, big);
    }
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
    if (res.bonus) {
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
      return;
    }
    this.time.delayedCall(big ? 500 : 150, () => {
      this.busy = false;
      this.afterSpin();
    });
  }

  // ---------------- 宝箱ボーナス ----------------

  private startBonus(): void {
    this.bonus = newBonus(this.rng, this.bet);
    saveBonus(this.bonus);
    this.clearGlow();
    this.winText.setText('0').setColor('#ffd23a');
    this.bonusRound(false);
  }

  /** 1ラウンド: 宝箱 3つを 出す(resume: 閉じた あとの 続き) */
  private bonusRound(resume: boolean): void {
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
    const label = (k: ChestContent) => (k === 'big' ? `大当たり！\n+${(b.bet * 5).toLocaleString()}` : k === 'normal' ? `+${b.bet.toLocaleString()}` : 'ボーナス\n終了');
    const color = (k: ChestContent) => (k === 'big' ? '#ffd23a' : k === 'normal' ? '#ffffff' : '#9a8aa8');
    const t = this.text(img.x, img.y - h * 0.2, label(got), Math.min(34, h * 0.09), color(got), 7);
    this.lcd.add(t);
    this.tweens.add({ targets: t, y: t.y - 16, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    if (got === 'big') this.bigChest(img.x, img.y);
    else audio.se(got === 'normal' ? 'happy' : 'back');
    // ほかの 2つも 中身を 見せる(うすく)
    this.time.delayedCall(550, () => {
      chests.forEach((c, k) => {
        if (k === i) return;
        this.tweens.killTweensOf(c);
        c.setTexture(chestKey(c.getData('col'), true)).setAlpha(0.55);
        this.lcd.add(this.text(c.x, c.y - h * 0.2, label(inside[k]), Math.min(22, h * 0.06), color(inside[k]), 5).setAlpha(0.7));
      });
    });
    this.credit.setText(this.shown.toLocaleString());
    this.winText.setText(b.total.toLocaleString());
    this.time.delayedCall(got === 'big' ? 2100 : 1500, () => (b.over ? this.endBonus() : this.bonusRound(false)));
  }

  /** 大当たりの 特別な 演出(光・ゆれ・キラキラ) */
  private bigChest(x: number, y: number): void {
    audio.se('cheer');
    this.time.delayedCall(120, () => audio.se('koBlast'));
    this.cameras.main.flash(260, 255, 230, 120);
    this.cameras.main.shake(320, 0.008);
    const rays = this.add.graphics();
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const a2 = a + 0.13;
      rays.fillStyle(0xffd23a, 0.3).fillTriangle(0, 0, Math.cos(a) * 600, Math.sin(a) * 600, Math.cos(a2) * 600, Math.sin(a2) * 600);
    }
    rays.setPosition(x, y).setScale(0.2);
    this.lcd.addAt(rays, 0);
    this.tweens.add({ targets: rays, scale: 1, duration: 300 });
    this.tweens.add({ targets: rays, angle: 120, duration: 2000 });
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
    this.winText.setText(b.total.toLocaleString()).setColor('#ffd23a');
    this.bonus = undefined;
    this.time.delayedCall(1800, () => {
      this.busy = false;
      this.lcdIdle();
    });
  }

  /** 当たりの マスを 光らせる(A: 大きい 当たりは 光って ゆれる・小さい 当たりは 細い 枠だけ) */
  private cellGlow(r: number, i: number, big: boolean, color = 0xff4ad8): void {
    const p = this.cellPos(r, i);
    if (big) {
      const glow = this.add.rectangle(p.x, p.y, CELL + 6, CELL + 6, color, 0.35).setStrokeStyle(6, 0xffd23a).setDepth(3);
      this.tweens.add({ targets: glow, alpha: 0.35, duration: 380, yoyo: true, repeat: -1 });
      const img = this.reels[r].imgs[i + 1];
      this.tweens.add({ targets: img, scale: img.scale * 1.08, duration: 380, yoyo: true, repeat: -1 });
      this.glow.push(glow, img);
    } else {
      const frame = this.add.rectangle(p.x, p.y, CELL - 4, CELL - 4).setStrokeStyle(5, 0xff4ad8, 0.9).setDepth(3);
      this.glow.push(frame);
    }
  }

  private clearGlow(): void {
    for (const o of this.glow) {
      this.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Image) o.setDisplaySize(CELL - 10, CELL - 10);
      else o.destroy();
    }
    this.glow = [];
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
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MinigameSelect'));
  }
}

/** スロットだけの 保存(えらんだ BET・ボーナスの とちゅう)。お世話の データとは 別 */
interface SlotSave {
  bet?: number;
  bonus?: { bet: number; round: number; total: number; history: ChestContent[] };
}

function loadSave(): SlotSave {
  try {
    const d = JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) ?? '{}') as SlotSave;
    const b = d.bonus;
    const ok = b && (BETS as readonly number[]).includes(Number(b.bet)) && Number.isFinite(Number(b.round)) && Number.isFinite(Number(b.total));
    const bet = Number(d.bet);
    return { bet: (BETS as readonly number[]).includes(bet) ? bet : undefined, bonus: ok ? { bet: Number(b.bet), round: Math.max(1, Math.floor(Number(b.round))), total: Math.max(0, Math.floor(Number(b.total))), history: Array.isArray(b.history) ? b.history : [] } : undefined };
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

function saveBonus(b: BonusState | undefined): void {
  writeSave({ ...loadSave(), bonus: b ? { bet: b.bet, round: b.round, total: b.total, history: b.history } : undefined });
}

const chestKey = (col: string, open: boolean) => `slot:chest:${col}:${open ? 'o' : 'c'}`;

/** 【仮】宝箱の 絵(紫・赤・青。企画者の 絵が 届くまで) */
function drawChestTexture(scene: Phaser.Scene, col: string, open: boolean): void {
  const S = 200;
  const t = scene.textures.createCanvas(chestKey(col, open), S, S);
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
  const t = scene.textures.createCanvas(symKey(s), S, S);
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
