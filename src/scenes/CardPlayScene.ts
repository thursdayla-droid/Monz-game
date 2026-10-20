import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { LifeRecord, loadLife } from '../core/lifeSave';
import {
  CARD_REWARD,
  cardReward,
  DECK_SIZE,
  isCleared,
  newRound,
  placeOf,
  play,
  playableSlots,
  RANK_LABELS,
  remainingCount,
  SUIT_MARKS,
  SUITS,
  TURN_SECONDS,
  type CardId,
  type Round,
} from '../core/monzCard';
import { newSeed } from '../core/rng';
import { CARD_H, CARD_W, drawCardBack, drawCardFace, drawCardTable, drawGraffitiText } from '../ui/cardArt';
import { drawPanel } from '../ui/homeArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { homeIconKey } from './HomeScene';
import { preloadPacks } from '../render/packs';

const W = 720;
const H = 1280;
const INK = '#16101c';
/** CARD TRACKER(小): 画面の上の帯 */
const TRACKER = { x: 20, y: 150, w: 680, h: 236 };
/** 場札・山札 */
const FIELD = { x: 430, y: 610, scale: 0.92 };
const DECK = { x: 165, y: 600, scale: 0.6 };
/** 手札5枚 */
const HAND = { y: 1050, scale: 0.6, gap: 136 };
const cardKey = (c: CardId) => `card:${c}`;

type Phase = 'dealing' | 'play' | 'moving' | 'paused' | 'over' | 'clear';

/**
 * MONZ CARD のプレイ画面(企画者仕様 2026-10-20)。
 * 手札をタップして場札に出す。同じ数字か同じマーク。1手10秒(正しく出すと10秒に戻る)。
 * 配っている間・カードが動いている間・一時停止中は時間が減らない。CARD TRACKER の拡大中は止めない(企画者決定)。
 * 出せないカードはいつも暗くする。アプリを閉じたら一時停止して手札を隠す。
 */
export class CardPlayScene extends Phaser.Scene {
  private r!: Round;
  private phase: Phase = 'dealing';
  private timeLeft = TURN_SECONDS;
  /** 今回のプレイ(何ラウンドも続けて遊ぶ1回)の番号・出した枚数・クリアしたラウンド数 */
  private playId = '';
  private cardsPlayed = 0;
  private clears = 0;
  private record!: LifeRecord;
  private hand: (Phaser.GameObjects.Image | null)[] = [];
  private field?: Phaser.GameObjects.Image;
  private deckImg?: Phaser.GameObjects.Image;
  private deckLabel?: Phaser.GameObjects.Text;
  private roundLabel?: Phaser.GameObjects.Image;
  private timerText?: Phaser.GameObjects.Text;
  private timerBar?: Phaser.GameObjects.Graphics;
  private tracker?: Phaser.GameObjects.Container;
  private big?: Phaser.GameObjects.Container;
  private scoreText?: Phaser.GameObjects.Text;
  private lastTick = 0;
  private bigBar?: Phaser.GameObjects.Graphics;
  private onHide?: () => void;
  private backKey = 'card:back';

  constructor() {
    super('CardPlay');
  }

  preload(): void {
    preloadPacks(this, ['card', 'home']);
  }

  create(): void {
    this.record = new LifeRecord(loadLife());
    this.playId = `card-${Date.now().toString(36)}-${newSeed().toString(36)}`;
    this.cardsPlayed = 0;
    this.clears = 0;
    this.hand = [];
    this.big = undefined;
    for (let c = 0; c < DECK_SIZE; c++) canvasTextureOnce(this, cardKey(c), CARD_W, CARD_H, (ctx) => drawCardFace(ctx, c));
    const backImg = this.textures.exists('cardimg:back') ? (this.textures.get('cardimg:back').getSourceImage() as HTMLImageElement) : undefined;
    canvasTextureOnce(this, backImg ? 'card:backimg' : 'card:back', CARD_W, CARD_H, (ctx) => drawCardBack(ctx, backImg));
    this.backKey = backImg ? 'card:backimg' : 'card:back';
    // 背景(企画者の絵。なければ仮の壁)
    if (this.textures.exists('cardimg:bg')) this.add.image(0, 0, 'cardimg:bg').setOrigin(0, 0).setDisplaySize(W, H);
    else {
      canvasTextureOnce(this, 'card:table', W, H, (ctx) => drawCardTable(ctx, W, H));
      this.add.image(0, 0, 'card:table').setOrigin(0, 0);
    }

    this.buildTop();
    // 山札(企画者の山札の絵。なければカードの裏を重ねる)
    if (this.textures.exists('cardimg:deck')) {
      this.deckImg = this.add.image(DECK.x + 10, DECK.y + 6, 'cardimg:deck').setDisplaySize(CARD_W * DECK.scale * 1.18, CARD_W * DECK.scale * 1.18 * (380 / 300));
    } else {
      for (let i = 3; i > 0; i--) this.add.image(DECK.x + i * 4, DECK.y + i * 5, this.backKey).setScale(DECK.scale);
      this.deckImg = this.add.image(DECK.x, DECK.y, this.backKey).setScale(DECK.scale);
    }
    this.deckLabel = this.add.text(DECK.x, DECK.y + 120, '', { fontFamily: UI_FONT, fontSize: '28px', fontStyle: '900', color: '#ffffff', stroke: INK, strokeThickness: 7 }).setOrigin(0.5, 0);
    // 大きなタイマーのゲージ(手札のすぐ上)。緑 → 黄 → 赤
    this.bigBar = this.add.graphics().setDepth(2);
    this.scoreText = this.add.text(W / 2, 838, '', { fontFamily: UI_FONT, fontSize: '26px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);

    this.startRound(1);
    audio.playBgm('card');

    // アプリを閉じたら一時停止(手札を隠す)
    this.onHide = () => {
      if (document.hidden && (this.phase === 'play' || this.phase === 'moving')) this.pause();
    };
    document.addEventListener('visibilitychange', this.onHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.onHide) document.removeEventListener('visibilitychange', this.onHide);
    });
  }

  // ---------------- 上の表示 ----------------

  private buildTop(): void {
    // 一時停止ボタン
    const pause = this.add
      .text(24, 30, 'Ⅱ', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 6 } })
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    pause.on('pointerdown', () => {
      if (this.phase === 'play') this.pause();
    });
    // タイマー
    const box = this.add.graphics().setDepth(4);
    box.fillStyle(0x16101c, 0.9).fillRoundedRect(W / 2 - 120, 22, 240, 92, 18);
    box.lineStyle(5, 0x2fa8ff, 1).strokeRoundedRect(W / 2 - 120, 22, 240, 92, 18);
    this.timerText = this.add.text(W / 2, 54, '', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '42px', color: '#ffffff' }).setOrigin(0.5).setDepth(5);
    this.timerBar = this.add.graphics().setDepth(5);
    // コイン
    canvasTextureOnce(this, 'card:coinbox', 190, 70, (ctx) => drawPanel(ctx, 190, 70, 93));
    this.add.image(W - 20 - 95, 30 + 35, 'card:coinbox').setDepth(4);
    if (this.textures.exists(homeIconKey('coin'))) this.add.image(W - 20 - 158, 65, homeIconKey('coin')).setDisplaySize(56, 56).setDepth(5);
    this.add.text(W - 36, 65, this.record.coins.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '28px', color: INK }).setOrigin(1, 0.5).setDepth(5).setName('coins');
    // CARD TRACKER(小)
    this.tracker = this.add.container(0, 0).setDepth(3);
    const hit = this.add.rectangle(TRACKER.x, TRACKER.y, TRACKER.w, TRACKER.h, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(6);
    hit.on('pointerdown', () => this.openBigTracker());
  }

  /** 残り3秒・2秒・1秒の知らせ(音と大きな数字、画面のふちが赤く光る) */
  private countdown(sec: number): void {
    audio.se(sec === 1 ? 'beepLast' : 'beep');
    const n = this.add
      .text(FIELD.x, FIELD.y, String(sec), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '200px', color: '#ff4f5e', stroke: INK, strokeThickness: 18 })
      .setOrigin(0.5)
      .setDepth(30)
      .setScale(1.6)
      .setAlpha(0.95);
    this.tweens.add({ targets: n, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: n, alpha: 0, delay: 500, duration: 300, onComplete: () => n.destroy() });
    const edge = this.add.graphics().setDepth(29);
    edge.lineStyle(26, 0xff2a3a, 0.7).strokeRect(0, 0, W, H);
    this.tweens.add({ targets: edge, alpha: 0, duration: 600, onComplete: () => edge.destroy() });
  }

  private drawTimer(): void {
    const t = Math.max(0, this.timeLeft);
    // 大きなゲージ
    const bb = this.bigBar;
    if (bb) {
      const k = t / TURN_SECONDS;
      const color = k > 0.5 ? 0x4fd65a : k > 0.3 ? 0xffd23a : 0xff4f5e;
      const bx = 40;
      const by = 878;
      const bw = W - 80;
      bb.clear();
      bb.fillStyle(0x16101c, 0.95).fillRoundedRect(bx - 6, by - 6, bw + 12, 40, 20);
      bb.fillStyle(0x3a3546, 1).fillRoundedRect(bx, by, bw, 28, 14);
      if (k > 0) bb.fillStyle(color, 1).fillRoundedRect(bx, by, Math.max(28, bw * k), 28, 14);
    }
    const low = t <= 3;
    this.timerText?.setText(`00:${String(Math.ceil(t)).padStart(2, '0')}`).setColor(low ? '#ff4f5e' : '#ffffff');
    const g = this.timerBar!;
    g.clear();
    g.fillStyle(0x3a2f4a, 1).fillRoundedRect(W / 2 - 96, 88, 192, 14, 7);
    g.fillStyle(low ? 0xff4f5e : 0xff8a1f, 1).fillRoundedRect(W / 2 - 96, 88, Math.max(0, 192 * (t / TURN_SECONDS)), 14, 7);
  }

  /** CARD TRACKER(小): 4つのマーク × 13枚。使ったカードは暗く */
  private drawTracker(): void {
    const c = this.tracker!;
    c.removeAll(true);
    const g = this.add.graphics();
    g.fillStyle(0x0d0a14, 0.92).fillRoundedRect(TRACKER.x, TRACKER.y, TRACKER.w, TRACKER.h, 18);
    g.lineStyle(4, 0x2fa8ff, 1).strokeRoundedRect(TRACKER.x, TRACKER.y, TRACKER.w, TRACKER.h, 18);
    c.add(g);
    const rem = remainingCount(this.r);
    c.add(this.add.text(TRACKER.x + 18, TRACKER.y + 10, 'CARD TRACKER', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '22px', color: '#ffffff' }));
    c.add(this.add.text(TRACKER.x + TRACKER.w - 18, TRACKER.y + 8, `残り ${rem} / 52  🔍`, { fontFamily: UI_FONT, fontSize: '22px', fontStyle: '900', color: '#ffd23a' }).setOrigin(1, 0));
    const cell = { w: 40, h: 40, gap: 3 };
    const x0 = TRACKER.x + 92;
    SUITS.forEach((suit, si) => {
      const y = TRACKER.y + 48 + si * 46;
      const red = suit === 'heart' || suit === 'diamond';
      const left = Array.from({ length: 13 }, (_, i) => si * 13 + i).filter((id) => placeOf(this.r, id) !== 'used').length;
      c.add(this.add.text(TRACKER.x + 18, y + 4, SUIT_MARKS[suit], { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: red ? '#ff4f5e' : '#ffffff' }));
      c.add(this.add.text(TRACKER.x + 54, y + 8, String(left), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '22px', color: '#ffffff' }));
      const cg = this.add.graphics();
      c.add(cg);
      for (let i = 0; i < 13; i++) {
        const id = si * 13 + i;
        const used = placeOf(this.r, id) === 'used';
        const x = x0 + i * (cell.w + cell.gap);
        cg.fillStyle(used ? 0x3a3546 : 0xfbf3e2, 1).fillRoundedRect(x, y, cell.w, cell.h, 6);
        c.add(
          this.add
            .text(x + cell.w / 2, y + cell.h / 2, RANK_LABELS[i], { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: RANK_LABELS[i].length > 1 ? '15px' : '19px', color: used ? '#5d566b' : red ? '#e8243c' : INK })
            .setOrigin(0.5),
        );
      }
    });
  }

  /** CARD TRACKER(大): 画面いっぱいに大きく。タイマーは止めない(企画者決定) */
  private openBigTracker(): void {
    if (this.big || (this.phase !== 'play' && this.phase !== 'moving' && this.phase !== 'dealing')) return;
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(40);
    this.big = box;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x0d0a14, 1).fillRoundedRect(16, 240, W - 32, 860, 24);
    g.lineStyle(6, 0x2fa8ff, 1).strokeRoundedRect(16, 240, W - 32, 860, 24);
    box.add([dim, g]);
    const draw = () => {
      box.list.slice(2).forEach((o) => o.destroy());
      box.add(this.add.text(48, 268, '残りカード', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff' }));
      box.add(this.add.text(W - 48, 264, `${remainingCount(this.r)} / 52`, { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '44px', color: '#ffd23a' }).setOrigin(1, 0));
      SUITS.forEach((suit, si) => {
        const red = suit === 'heart' || suit === 'diamond';
        const y = 350 + si * 140;
        box.add(this.add.text(48, y + 26, SUIT_MARKS[suit], { fontFamily: UI_FONT, fontSize: '52px', fontStyle: '900', color: red ? '#ff4f5e' : '#ffffff' }));
        const cg = this.add.graphics();
        box.add(cg);
        for (let i = 0; i < 13; i++) {
          const id = si * 13 + i;
          const used = placeOf(this.r, id) === 'used';
          const col = i % 7;
          const row = Math.floor(i / 7);
          const x = 118 + col * 76;
          const yy = y + row * 64;
          cg.fillStyle(used ? 0x3a3546 : 0xfbf3e2, 1).fillRoundedRect(x, yy, 68, 58, 8);
          cg.lineStyle(3, 0x16101c, 1).strokeRoundedRect(x, yy, 68, 58, 8);
          box.add(this.add.text(x + 34, yy + 29, RANK_LABELS[i], { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '28px', color: used ? '#5d566b' : red ? '#e8243c' : INK }).setOrigin(0.5));
        }
      });
      const close = this.add.text(W / 2, 1040, '  とじる  ', { fontFamily: UI_FONT, fontSize: '36px', fontStyle: '900', color: INK, backgroundColor: '#ffd23a', padding: { x: 18, y: 8 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      close.on('pointerdown', () => this.closeBigTracker());
      box.add(close);
    };
    draw();
    box.setData('redraw', draw);
  }

  private closeBigTracker(): void {
    if (!this.big) return;
    audio.se('back');
    this.big.destroy();
    this.big = undefined;
  }

  // ---------------- ラウンド ----------------

  private startRound(n: number): void {
    this.r = newRound(n, newSeed());
    this.phase = 'dealing';
    this.timeLeft = TURN_SECONDS;
    this.roundLabel?.destroy();
    canvasTextureOnce(this, `card:round:${n}`, 300, 110, (ctx) => drawGraffitiText(ctx, 300, 110, `ROUND ${n}`, '#ffffff', 52));
    this.roundLabel = this.add.image(170, 88, `card:round:${n}`).setDepth(4).setScale(0.8);
    this.field?.destroy();
    this.hand.forEach((h) => h?.destroy());
    this.hand = [];
    this.drawTracker();
    this.drawTimer();
    this.updateCounts();
    // 手札を5枚配る(この間は時間が減らない)。場札はまだなく、1枚目は手札から好きなカードを出す
    this.field = undefined;
    this.showFirstHint(true);
    audio.se('next');
    this.r.hand.forEach((c, i) => {
      const img = this.add.image(DECK.x, DECK.y, cardKey(c!)).setScale(DECK.scale).setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.tapHand(i));
      this.hand[i] = img;
      this.tweens.add({ targets: img, x: this.handX(i), y: HAND.y, scale: HAND.scale, duration: 260, delay: 260 + i * 90, ease: 'Cubic.easeOut', onStart: () => audio.se('tap', { pitch: 1.3 }) });
    });
    this.time.delayedCall(260 + 5 * 90 + 300, () => {
      this.phase = 'play';
      this.timeLeft = TURN_SECONDS;
      this.refreshHand();
    });
  }

  /** 場札の場所の「好きなカードを出そう」 */
  private showFirstHint(on: boolean): void {
    let hint = this.children.getByName('firstHint') as Phaser.GameObjects.Container | null;
    if (!hint) {
      hint = this.add.container(FIELD.x, FIELD.y).setName('firstHint');
      const g = this.add.graphics();
      g.lineStyle(6, 0xffd23a, 0.9).strokeRoundedRect((-CARD_W * FIELD.scale) / 2, (-CARD_H * FIELD.scale) / 2, CARD_W * FIELD.scale, CARD_H * FIELD.scale, 20);
      const t = this.add.text(0, 0, '好きな\nカードを\n出そう！', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffd23a', align: 'center', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);
      hint.add([g, t]);
      this.tweens.add({ targets: hint, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 });
    }
    hint.setVisible(on);
  }

  private handX(i: number): number {
    return W / 2 + (i - 2) * HAND.gap;
  }

  private updateCounts(): void {
    this.deckLabel?.setText(`山札 ${this.r.deck.length}枚`);
    this.deckImg?.setVisible(this.r.deck.length > 0);
    this.scoreText?.setText(`出した枚数：${this.cardsPlayed}`);
  }

  /** 出せないカードは暗く(企画者決定: いつも) */
  private refreshHand(): void {
    const ok = new Set(playableSlots(this.r));
    this.hand.forEach((img, i) => {
      if (!img) return;
      if (ok.has(i)) img.clearTint().setAlpha(1);
      else img.setTint(0x6d6878).setAlpha(0.9);
    });
    if (isCleared(this.r)) this.roundClear();
    else if (ok.size === 0) this.gameOver('出せるカードがありません');
  }

  private tapHand(i: number): void {
    if (this.phase !== 'play') return;
    const img = this.hand[i];
    if (!img) return;
    const next = play(this.r, i);
    if (!next) {
      // 出せないカード
      audio.se('back');
      this.tweens.add({ targets: img, x: img.x + 10, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    const card = this.r.hand[i]!;
    this.r = next;
    this.cardsPlayed++;
    this.phase = 'moving';
    audio.se('select', { pitch: 0.9 + Math.random() * 0.2 });
    img.disableInteractive();
    this.hand[i] = null;
    const old = this.field;
    this.tweens.add({
      targets: img,
      x: FIELD.x,
      y: FIELD.y,
      scale: FIELD.scale,
      angle: Phaser.Math.Between(-6, 6),
      duration: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        old?.destroy();
        this.showFirstHint(false);
        this.field = img;
        img.setDepth(1);
        this.cameras.main.shake(60, 0.002);
        this.afterPlay(i, card);
      },
    });
    this.drawTracker();
    this.big?.getData('redraw')?.();
  }

  /** 出したあと: 山札から補充して、10秒に戻す */
  private afterPlay(slot: number, _played: CardId): void {
    const add = this.r.hand[slot];
    this.updateCounts();
    const resume = () => {
      if (this.phase !== 'moving') return;
      this.phase = 'play';
      this.timeLeft = TURN_SECONDS;
      this.drawTimer();
      this.refreshHand();
    };
    if (add === null || add === undefined) {
      resume();
      return;
    }
    const img = this.add.image(DECK.x, DECK.y, cardKey(add)).setScale(DECK.scale).setInteractive({ useHandCursor: true });
    img.on('pointerdown', () => this.tapHand(slot));
    this.hand[slot] = img;
    this.tweens.add({ targets: img, x: this.handX(slot), y: HAND.y, scale: HAND.scale, duration: 180, ease: 'Cubic.easeOut', onComplete: resume });
  }

  // ---------------- 一時停止 ----------------

  private pause(): void {
    if (this.phase === 'paused') return;
    const before = this.phase;
    this.phase = 'paused';
    this.closeBigTracker();
    // 手札を隠す(考える時間にできないように)
    this.hand.forEach((h) => h?.setVisible(false));
    const box = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0, 0).setInteractive();
    const title = this.add.image(W / 2, 420, this.graffiti('PAUSE', '#ffd23a', 110));
    const go = this.add.text(W / 2, 640, '  つづける  ', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: INK, backgroundColor: '#ffd23a', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const quit = this.add.text(W / 2, 780, '  やめる  ', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#8a35e0', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    box.add([dim, title, go, quit]);
    go.on('pointerdown', () => {
      audio.se('select');
      box.destroy();
      this.hand.forEach((h) => h?.setVisible(true));
      this.phase = before === 'moving' ? 'moving' : 'play';
    });
    quit.on('pointerdown', () => {
      box.destroy();
      this.hand.forEach((h) => h?.setVisible(true));
      this.phase = 'play';
      this.gameOver('やめました');
    });
  }

  private graffiti(text: string, color: string, size: number): string {
    const key = `card:g:${text}:${color}:${size}`;
    canvasTextureOnce(this, key, 680, size * 1.6, (ctx) => drawGraffitiText(ctx, 680, size * 1.6, text, color, size));
    return key;
  }

  // ---------------- クリア・ゲームオーバー ----------------

  /** 52枚すべて使ったらラウンドクリア。報酬(100コイン・EXP)はこの時点で1回だけ */
  private roundClear(): void {
    if (this.phase === 'clear' || this.phase === 'over') return;
    this.phase = 'clear';
    this.clears++;
    const n = this.r.round;
    this.record.grant({ runId: `${this.playId}:r${n}`, source: 'card', coins: CARD_REWARD.clearCoins, exp: CARD_REWARD.clearExp });
    audio.se('sting');
    const box = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0, 0).setInteractive();
    const t1 = this.add.image(W / 2, 170, this.graffiti(`ROUND ${n}`, '#ffffff', 90));
    const t2 = this.add.image(W / 2, 290, this.graffiti('CLEAR!', '#ffd23a', 120));
    canvasTextureOnce(this, 'card:clearpanel', 560, 330, (ctx) => drawPanel(ctx, 560, 330, 95));
    const panel = this.add.image(W / 2, 760, 'card:clearpanel');
    // 喜ぶキャラクター(企画者の絵)
    const monz = this.textures.exists('cardimg:clearMonz') ? this.add.image(W / 2, 475, 'cardimg:clearMonz').setScale(0.6) : null;
    if (monz) this.tweens.add({ targets: monz, y: monz.y - 18, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const txt = this.add
      .text(W / 2, 760, `52枚すべて出しました！\n\nコイン  +${CARD_REWARD.clearCoins}\nEXP  +${CARD_REWARD.clearExp}\n\n今回の累計コイン  ${this.clears * CARD_REWARD.clearCoins}`, { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: INK, align: 'center' })
      .setOrigin(0.5);
    const next = this.add.text(W / 2, 1000, '  次のラウンドへ ▶  ', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: INK, backgroundColor: '#ffd23a', padding: { x: 20, y: 12 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    box.add([dim, t1, t2, panel, txt, next]);
    if (monz) box.add(monz);
    [t1, t2].forEach((o, i) => {
      o.setScale(0.2);
      this.tweens.add({ targets: o, scale: 1, duration: 360, delay: i * 160, ease: 'Back.easeOut' });
    });
    this.updateCoins();
    next.on('pointerdown', () => {
      audio.se('next');
      box.destroy();
      this.startRound(n + 1);
    });
  }

  /** ゲームオーバー。10枚以上出していたら、出した枚数に応じた報酬(1回だけ) */
  private gameOver(reason: string): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.closeBigTracker();
    const part = cardReward(this.cardsPlayed, 0);
    this.record.grant({ runId: `${this.playId}:end`, source: 'card', coins: part.coins, exp: part.exp });
    const best = this.record.record('card', this.cardsPlayed, this.r.round);
    const total = cardReward(this.cardsPlayed, this.clears);
    audio.se('slam');
    this.scoreText?.setVisible(false);
    this.cameras.main.shake(200, 0.006);
    this.time.delayedCall(500, () => {
      const box = this.add.container(0, 0).setDepth(50);
      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
      const title = this.add.image(W / 2, 170, this.graffiti('GAME OVER', '#c9c4d6', 100));
      // 倒れたキャラクター(企画者の絵)
      const monz = this.textures.exists('cardimg:overMonz') ? this.add.image(W / 2, 395, 'cardimg:overMonz').setScale(0.62) : null;
      const why = this.add.text(W / 2, 555, reason, { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ff8a9a' }).setOrigin(0.5);
      canvasTextureOnce(this, 'card:overpanel', 560, 360, (ctx) => drawPanel(ctx, 560, 360, 96));
      const panel = this.add.image(W / 2, 780, 'card:overpanel');
      const lines = [`到達ラウンド   ${this.r.round}`, `出した枚数   ${this.cardsPlayed}`, `獲得コイン   ${total.coins}`, `獲得EXP   ${total.exp}`];
      const txt = this.add.text(W / 2, 780, lines.join('\n'), { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: INK, align: 'center', lineSpacing: 16 }).setOrigin(0.5);
      const note = this.add
        .text(W / 2, 985, best ? '★ 自己ベスト！' : this.cardsPlayed < CARD_REWARD.minCardsForReward && this.clears === 0 ? `${CARD_REWARD.minCardsForReward}枚以上出すと報酬がもらえます` : '', { fontFamily: UI_FONT, fontSize: '26px', fontStyle: '900', color: '#ffd23a' })
        .setOrigin(0.5);
      const toTitle = this.add.text(W / 2 - 150, 1090, ' タイトルへ ', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101c', padding: { x: 16, y: 12 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const again = this.add.text(W / 2 + 150, 1090, ' もう一度 ', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: INK, backgroundColor: '#ffd23a', padding: { x: 16, y: 12 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      box.add([dim, title, why, panel, txt, note, toTitle, again]);
      if (monz) box.add(monz);
      title.setScale(0.3);
      this.tweens.add({ targets: title, scale: 1, duration: 380, ease: 'Back.easeOut' });
      this.updateCoins();
      toTitle.on('pointerdown', () => {
        audio.se('back');
        this.scene.start('CardTitle');
      });
      again.on('pointerdown', () => {
        audio.se('next');
        this.scene.restart();
      });
    });
  }

  private updateCoins(): void {
    (this.children.getByName('coins') as Phaser.GameObjects.Text | null)?.setText(this.record.coins.toLocaleString());
  }

  update(_t: number, delta: number): void {
    // 時間が減るのは、操作できる間だけ(配る・動く・一時停止・結果の間は減らない)。拡大表示中も減る
    if (this.phase !== 'play') return;
    this.timeLeft -= delta / 1000;
    const sec = Math.ceil(this.timeLeft);
    // 残り3秒から「ピッ、ピッ、ピー」と、大きな数字
    if (sec !== this.lastTick && sec <= 3 && sec > 0) this.countdown(sec);
    this.lastTick = sec;
    this.drawTimer();
    if (this.timeLeft <= 0) this.gameOver('時間切れ');
  }
}
