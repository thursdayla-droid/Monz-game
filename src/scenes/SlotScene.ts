import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { randomSeed, mulberry32, type Rng } from '../core/rng';
import { BETS, REELS, ROWS, SYMBOL_NAME, SYMBOLS, spin, type SpinResult, type SymbolId } from '../core/slot/slot';
import { UI_FONT } from '../ui/paint';
import { fillSize, safeInsets } from '../ui/viewport';

/**
 * MONZ SLOT(ミニゲーム⑤)の 画面(2026-11-10 企画者の 仕様書。docs/SLOT.md)。2段目: スロット画面。
 * - たての 全画面。上: 大きな 液晶(リーチ演出は 4段目)・まん中: 5リール×3段・下: コイン・WIN・BET・SPIN
 * - MONZ コインで 遊ぶ(企画者 2026-11-10)。回した 時に 結果を 決めて、BET と 当たりを 1回で 保存(LifeRecord.slotSpin)
 * - リールは 左から 順に 自動で 止まる【確定】。止まる 時間は【仮】
 * - 当たりの 見せ方(企画者 2026-11-10「A」): BET 以上 もどる 当たりは 大きく 光る・BET より 少ない 当たりは 細い 枠と WIN の 数字だけ
 * - 図柄の 絵は 企画者が 作る(届くまでは プログラムで 描いた【仮】の 絵)
 * - 宝箱ボーナスは 3段目(今は 液晶に 出すだけ)
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
/** オートスピンの 時の 止まる 時間(前の ふつうの 速さ)。オートスピンは まだ ない【未確定】 */
export const AUTO_STOP_FIRST = 750;
export const AUTO_STOP_STEP = 260;
const SPIN_SPEED = 2.6; // 1ms に すすむ 点

const symKey = (s: SymbolId) => `slot:sym:${s}`;

interface ReelView {
  imgs: Phaser.GameObjects.Image[];
  offset: number;
  spinning: boolean;
}

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
  private shown = 0;

  constructor() {
    super('Slot');
  }

  create(): void {
    this.reels = [];
    this.glow = [];
    this.betBtns = [];
    this.busy = false;
    this.H = Math.max(BASE_H, fillSize(this, { w: W, h: BASE_H }, { minRatio: 0.4, maxRatio: W / BASE_H }).h);
    this.scale.setGameSize(W, this.H);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(W, BASE_H));
    this.record = new LifeRecord(loadLife());
    this.bet = loadBet();
    this.shown = this.record.coins;
    for (const s of SYMBOLS) if (!this.textures.exists(symKey(s))) drawSymbolTexture(this, s);
    this.layout();
    audio.playBgm('main');
    this.cameras.main.fadeIn(250, 0, 0, 0);
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
      const dev = this.text(W - 120, 104, '+10,000 コイン（確認用）', 18, '#16101c').setBackgroundColor('#7de8ff').setPadding(10, 6, 10, 8).setDepth(30).setInteractive({ useHandCursor: true });
      dev.on('pointerdown', () => {
        if (this.busy) return;
        this.record.add(10000);
        this.shown = this.record.coins;
        this.credit.setText(this.shown.toLocaleString());
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
      this.reels.push({ imgs, offset: 0, spinning: false });
    }
  }

  private randSym(): SymbolId {
    return SYMBOLS[Math.floor(this.rng() * SYMBOLS.length)];
  }

  update(_t: number, dt: number): void {
    for (let r = 0; r < this.reels.length; r++) {
      const v = this.reels[r];
      if (!v.spinning) continue;
      v.offset += SPIN_SPEED * Math.min(dt, 50);
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

    // SPIN(大きな 丸い ボタン)
    const sx = W - 24 - 170;
    const c = this.add.container(sx, by).setDepth(7);
    const bgc = this.add.graphics();
    bgc.fillStyle(0x16101c, 1).fillRoundedRect(-170, -62, 340, 124, 62);
    bgc.fillGradientStyle(0xc070ff, 0xc070ff, 0x7a2ad0, 0x7a2ad0, 1).fillRoundedRect(-162, -54, 324, 108, 54);
    bgc.lineStyle(6, 0xffd23a, 1).strokeRoundedRect(-162, -54, 324, 108, 54);
    const label = this.text(0, 0, 'SPIN', 56, '#ffffff', 8);
    c.add([bgc, label]);
    c.setSize(340, 124).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.doSpin());
    this.spinBtn = c;
  }

  private paintBets(): void {
    this.betBtns.forEach((t, i) => {
      const on = BETS[i] === this.bet;
      t.setBackgroundColor(on ? '#ffd23a' : '#3a2a4a').setColor(on ? '#16101c' : '#c8bcd8');
    });
  }

  // ---------------- 回す ----------------

  private doSpin(): void {
    if (this.busy) return;
    this.tweens.add({ targets: this.spinBtn, scale: 0.94, duration: 70, yoyo: true });
    if (this.record.coins < this.bet) {
      audio.se('tap', { pitch: 0.7 });
      this.toast('コインが たりないよ');
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
    this.winText.setText('0').setColor('#ffffff');
    this.lcdIdle();
    for (const v of this.reels) v.spinning = true;
    for (let r = 0; r < REELS; r++) this.time.delayedCall(STOP_FIRST + r * STOP_STEP, () => this.stopReel(r, res, r === REELS - 1));
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
    if (res.bonus) {
      // 【3段目で 作る】宝箱ボーナス。今は 王冠を 光らせて 液晶に 出すだけ
      for (const [r, i] of res.crownCells) this.cellGlow(r, i, true, 0xffd23a);
      const h = this.lcdBox.h;
      const t = this.text(0, -h * 0.1, 'BONUS!!', Math.min(110, h * 0.3), '#ffd23a', 12);
      const s = this.text(0, h * 0.24, '宝箱ボーナス（3段目で 作ります）', 22, '#ffffff', 4);
      this.lcdShow([t, s]);
      audio.se('koBlast');
    }
    this.credit.setText(this.shown.toLocaleString());
    this.time.delayedCall(big || res.bonus ? 500 : 150, () => (this.busy = false));
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
    this.tweens.add({ targets: o, v: win, duration: big ? 700 : 250, onUpdate: () => this.winText.setText(Math.round(o.v).toLocaleString()) });
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

function loadBet(): number {
  try {
    const b = Number(JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) ?? '{}').bet);
    return (BETS as readonly number[]).includes(b) ? b : BETS[0];
  } catch {
    return BETS[0];
  }
}

function saveBet(bet: number): void {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify({ bet }));
  } catch {
    /* 保存 できなくても 遊べる */
  }
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
