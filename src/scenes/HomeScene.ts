import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { BunkBrain } from '../core/bunkBehavior';
import { HOME_ACTIONS, HOME_ACTION_LABELS, HOME_ACTION_READY, HOME_LAYOUTS, HOME_PLACES, clipPolygonX, insidePolygon, pickHomePlace, type HomeAction, type HomePlace, type Pt } from '../core/home';
import { MonzLife } from '../core/life';
import { loadLife, saveLife, Wallet } from '../core/lifeSave';
import { mulberry32 } from '../core/rng';
import { clearSave, loadSave } from '../core/save';
import { BUNK_MOTION, BunkView, cutoutKey, TEST_PERSONALITY } from '../render/bunkView';
import { drawBowl, drawCoin, drawGarage, drawHeart, drawIcon, drawMenuButton, drawPanel, drawRoom } from '../ui/homeArt';
import { canvasTexture, drawPaper, drawStreet, UI_FONT } from '../ui/paint';
import { openSoundSettings } from '../ui/soundButton';

const W = 720;
const H = 1280;
const NAMES: Record<string, string> = { bunk: 'BUNK' };
const LAST_PLACE_KEY = 'monz:home';
/** MONZの大きさ(部屋の奥 → 手前)。部屋全体が見渡せるよう小さめ */
const SCALE_BACK = 0.12;
const SCALE_FRONT = 0.165;
/** MONZの絵の高さ(大きさ1のとき)。ハートや吹き出しの位置に使う */
const MONZ_H = 1150;
/** 下のメニュー */
const MENU = { y: 1198, w: 111, h: 134, gap: 6 };
/** 画面の左右のはしから、MONZの足元までの最小の距離 */
const EDGE = 80;
const DEPTH = { monz: 10, effect: 30, ui: 40, popup: 60 };

/**
 * 企画者の背景画像(public/assets/home/)。届いていない場所は仮の絵(src/ui/homeArt.ts)を使う。
 */
export const HOME_IMAGES: Partial<Record<HomePlace, string>> = { alley: 'alley.webp' };
export const homeImageKey = (p: HomePlace) => `home:bg:${p}`;

function loadLastPlace(): HomePlace | null {
  try {
    const v = localStorage.getItem(LAST_PLACE_KEY);
    return (HOME_PLACES as readonly string[]).includes(v ?? '') ? (v as HomePlace) : null;
  } catch {
    return null;
  }
}

function saveLastPlace(p: HomePlace): void {
  try {
    localStorage.setItem(LAST_PLACE_KEY, p);
  } catch {
    /* 保存できなくても続ける */
  }
}

/**
 * お世話画面(第1段階)。場所は「部屋・路地裏・ガレージ」から開くたびにランダム。
 * MONZは床の上を自分で歩き回り、立ち止まったり、休んだり、眠ったりする(src/core/life.ts)。
 * 上: 名前・レベル【仮】・コイン。下: ごはん・ミニゲーム・なでる・バトル・ショップ・設定。
 */
export class HomeScene extends Phaser.Scene {
  private view?: BunkView;
  private life?: MonzLife;
  private shadow?: Phaser.GameObjects.Ellipse;
  private zText?: Phaser.GameObjects.Text;
  private floor: Pt[] = [];
  private yBack = 0;
  private yFront = 1;
  private t = 0;
  private busy = false;
  private wallet?: Wallet;
  place: HomePlace = 'room';

  constructor() {
    super('Home');
  }

  create(): void {
    this.t = 0;
    this.busy = false;
    const monz = loadSave()?.firstMonz ?? 'bunk';
    this.place = pickHomePlace(mulberry32(Date.now() & 0xffffffff), loadLastPlace());
    saveLastPlace(this.place);
    this.drawBackground();

    // MONZ(床の上を自分で動き回る)
    const brain = new BunkBrain(BUNK_MOTION.behavior, Date.now() & 0xffff, TEST_PERSONALITY);
    brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    const life = new MonzLife(brain, this.floor, mulberry32((Date.now() >>> 3) & 0xffffffff), (y) => this.depthOf(y));
    this.life = life;
    this.shadow = this.add.ellipse(life.x, life.y, 300, 46, 0x000000, 0.28);
    const view = new BunkView(this, life.x, life.y, SCALE_BACK);
    view.still = false;
    this.view = view;
    view.on('pointerdown', () => this.tapMonz());
    this.zText = this.text(0, 0, 'z', 34, '#ffffff').setVisible(false);

    this.buildTop(NAMES[monz] ?? monz.toUpperCase());
    this.buildMenu();
    this.buildTestButtons();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    audio.playBgm('home');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.saveSeen());
  }

  /** 背景と、歩ける床の範囲(画面の座標にする) */
  private drawBackground(): void {
    const layout = HOME_LAYOUTS[this.place];
    const key = homeImageKey(this.place);
    let w = layout.w;
    let h = layout.h;
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, H / 2, key).setDepth(-10);
      w = img.width;
      h = img.height;
      img.setScale(Math.max(W / w, H / h));
    } else {
      const draw = { room: drawRoom, alley: drawStreet, garage: drawGarage }[this.place];
      canvasTexture(this, `home:draw:${this.place}`, W, H, (ctx) => draw(ctx, W, H));
      this.add.image(0, 0, `home:draw:${this.place}`).setOrigin(0, 0).setDepth(-10);
      w = W;
      h = H;
    }
    const k = Math.max(W / w, H / h);
    const ox = (W - w * k) / 2;
    const oy = (H - h * k) / 2;
    const sx = w / layout.w;
    const sy = h / layout.h;
    // 絵が画面より横に広いときは、はみ出した所を歩かないようにする(体の半分ぶん内側まで)
    this.floor = clipPolygonX(layout.floor.map(([x, y]) => [ox + x * sx * k, oy + y * sy * k] as Pt), EDGE, W - EDGE);
    this.yBack = Math.min(...this.floor.map((p) => p[1]));
    this.yFront = Math.max(...this.floor.map((p) => p[1]));
  }

  /** 奥(0)〜手前(1) */
  private depthOf(y: number): number {
    return Phaser.Math.Clamp((y - this.yBack) / (this.yFront - this.yBack), 0, 1);
  }

  private scaleAt(y: number): number {
    return Phaser.Math.Linear(SCALE_BACK, SCALE_FRONT, this.depthOf(y));
  }

  // ---------------- 上の表示 ----------------

  private buildTop(name: string): void {
    const data = loadLife();
    const wallet = new Wallet(data);
    this.wallet = wallet;

    // 名前・レベルのカード
    canvasTexture(this, 'home:card', 430, 138, (ctx) => drawPanel(ctx, 430, 138, 91));
    const card = this.add.container(16, 14).setDepth(DEPTH.ui);
    card.add(this.add.image(0, 0, 'home:card').setOrigin(0, 0));
    // 顔(正式なBUNKの絵から切り抜く)
    canvasTexture(this, 'home:portrait', 116, 116, (ctx) => {
      const src = this.textures.get(cutoutKey('guard')).getSourceImage() as HTMLImageElement;
      const r = 54;
      ctx.save();
      ctx.beginPath();
      ctx.arc(58, 58, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23a';
      ctx.fill();
      ctx.clip();
      // 顔のあたり(元の絵の 1278x1230 のうち)
      const fx = 300;
      const fy = 210;
      const fs = 680;
      ctx.drawImage(src, (fx * src.width) / 1278, (fy * src.height) / 1230, (fs * src.width) / 1278, (fs * src.height) / 1230, 2, 6, 112, 112);
      ctx.restore();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#16101c';
      ctx.beginPath();
      ctx.arc(58, 58, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    card.add(this.add.image(14, 11, 'home:portrait').setOrigin(0, 0));
    const ink = '#16101c';
    card.add(this.add.text(140, 18, name, { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: ink }));
    // 【仮】レベルは見た目だけ(上がり方は未確定)
    card.add(this.add.text(140, 62, `Lv. ${data.level}`, { fontFamily: UI_FONT, fontSize: '24px', fontStyle: '900', color: ink }));
    const bar = this.add.graphics();
    bar.fillStyle(0x16101c, 1).fillRoundedRect(232, 66, 176, 22, 11);
    bar.fillStyle(0xd9c7a0, 1).fillRoundedRect(236, 70, 168, 14, 7);
    bar.fillStyle(0x2fa8ff, 1).fillRoundedRect(236, 70, Math.max(14, 168 * Math.min(1, data.exp / 100)), 14, 7);
    card.add(bar);
    // 【仮】ひとこと
    card.add(this.add.text(140, 98, '今日もよろしく！', { fontFamily: UI_FONT, fontSize: '20px', fontStyle: 'bold', color: ink }));

    // コインのカード
    canvasTexture(this, 'home:coinCard', 252, 84, (ctx) => {
      drawPanel(ctx, 252, 84, 93);
      drawCoin(ctx, 44, 42, 27);
    });
    const coinCard = this.add.container(W - 16 - 126, 14 + 42).setDepth(DEPTH.ui);
    coinCard.add(this.add.image(0, 0, 'home:coinCard'));
    const shown = { v: wallet.coins };
    const label = this.add.text(104, 2, shown.v.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: ink }).setOrigin(1, 0.5);
    coinCard.add(label);
    // 増えたり減ったりしたときは、数字が動いて、札が少しはねる
    wallet.onChange((coins, delta) => {
      this.tweens.add({
        targets: shown,
        v: coins,
        duration: 500,
        ease: 'Cubic.easeOut',
        onUpdate: () => label.setText(Math.round(shown.v).toLocaleString()),
      });
      this.tweens.add({ targets: coinCard, scale: 1.12, duration: 110, yoyo: true, ease: 'Sine.easeOut' });
      const pop = this.text(coinCard.x + 20, coinCard.y + 50, `${delta > 0 ? '+' : ''}${delta}`, 30, delta > 0 ? '#ffd23a' : '#ff4fa3').setDepth(DEPTH.ui + 1);
      this.tweens.add({ targets: pop, y: pop.y + 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => pop.destroy() });
      audio.se(delta > 0 ? 'select' : 'back');
    });
  }

  private saveSeen(): void {
    const data = loadLife();
    saveLife({ ...data, lastSeen: Date.now() });
  }

  // ---------------- 下のメニュー ----------------

  private buildMenu(): void {
    // ボタンの下の暗い帯(背景とボタンを分ける)
    this.add.rectangle(0, MENU.y - MENU.h / 2 - 14, W, H, 0x16101c, 0.55).setOrigin(0, 0).setDepth(DEPTH.ui - 1);
    const total = HOME_ACTIONS.length * MENU.w + (HOME_ACTIONS.length - 1) * MENU.gap;
    HOME_ACTIONS.forEach((action, i) => {
      const key = `home:menu:${action}`;
      canvasTexture(this, key, MENU.w, MENU.h, (ctx) => drawMenuButton(ctx, MENU.w, MENU.h, action, HOME_ACTION_LABELS[action], HOME_ACTION_READY[action], 70 + i));
      const x = (W - total) / 2 + MENU.w / 2 + i * (MENU.w + MENU.gap);
      const btn = this.add.image(x, MENU.y, key).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scale: 0.9, duration: 70, yoyo: true });
        this.act(action);
      });
    });
  }

  /** 【テスト用】回答を消して質問からやり直す / 誕生の演出だけをもう一度 / コインを増やす */
  private buildTestButtons(): void {
    const button = (y: number, label: string, onTap: () => void) =>
      this.add
        .text(W - 16, y, label, { fontFamily: UI_FONT, fontSize: '20px', color: '#ffffff', backgroundColor: '#16101caa', padding: { x: 10, y: 6 } })
        .setOrigin(1, 0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);
    button(110, '最初から', () => {
      clearSave();
      this.scene.start('Title');
    });
    button(152, '誕生をもう一度', () => this.scene.start('Birth', { intro: true }));
    button(194, '+10コイン', () => this.wallet?.add(10));
  }

  private act(action: HomeAction): void {
    if (action === 'settings') {
      audio.se('tap');
      openSoundSettings(this);
      return;
    }
    if (this.busy) return;
    if (action === 'food') this.feed();
    else if (action === 'pet') this.petWithHand();
    else this.comingSoon(HOME_ACTION_LABELS[action]);
  }

  // ---------------- MONZとのふれあい ----------------

  /** MONZをタップ: 足を止めて反応する(第2段階でなでる動きを足す) */
  private tapMonz(): void {
    if (this.busy || !this.life) return;
    const life = this.life;
    life.pause(1.8);
    const kind = life.body.pet();
    audio.se(kind);
    if (kind === 'happy' && Math.random() < 0.7) this.hearts(2);
  }

  /** ごはん【仮】: どんぶりが落ちてきて、3口で食べる */
  private feed(): void {
    const view = this.view!;
    const life = this.life!;
    const brain = life.body;
    this.busy = true;
    life.pause(6);
    audio.se('select');
    const s = this.scaleAt(life.y) / SCALE_FRONT;
    canvasTexture(this, 'home:bowl', 230, 190, (ctx) => drawBowl(ctx, 115, 104, 205));
    const side: 1 | -1 = insidePolygon([life.x + 150 * s * life.facing, life.y], this.floor) ? life.facing : life.facing === 1 ? -1 : 1;
    life.facing = side;
    const bx = life.x + 150 * s * side;
    const bowl = this.add.image(bx, life.y - 220, 'home:bowl').setOrigin(0.5, 0.85).setScale(0.55 * s).setDepth(DEPTH.monz + (side > 0 ? 1 : -1)).setAlpha(0);
    this.tweens.add({ targets: bowl, alpha: 1, duration: 120 });
    this.tweens.add({
      targets: bowl,
      y: life.y + 4,
      duration: 420,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        audio.se('plop');
        brain.reaction = { face: 'happy', kind: 'surprised', left: 0.6, age: 0 };
        for (let i = 0; i < 3; i++) {
          this.time.delayedCall(700 + i * 650, () => {
            audio.se('knock', { pitch: 1.6 + i * 0.15 });
            brain.reaction = { face: i % 2 ? 'closed' : 'happy', kind: 'calm', left: 0.4, age: 0 };
            bowl.setScale(0.55 * s * (1 - (i + 1) * 0.18));
            const word = this.text(view.x + side * 70 * s, life.y - MONZ_H * this.scaleAt(life.y) - 10, 'もぐ', 34, '#ffffff').setDepth(DEPTH.effect);
            this.tweens.add({ targets: word, y: word.y - 50, alpha: 0, duration: 600, onComplete: () => word.destroy() });
          });
        }
        this.time.delayedCall(700 + 3 * 650, () => {
          this.tweens.add({ targets: bowl, alpha: 0, scale: 0.1, duration: 260, onComplete: () => bowl.destroy() });
          audio.se('happy');
          brain.reaction = { face: 'happy', kind: 'happy', left: 1.6, age: 0 };
          this.hearts(3);
          this.time.delayedCall(1600, () => (this.busy = false));
        });
      },
    });
  }

  /** なでる: 手が出てきて頭をなでる(反応はタップのときと同じ) */
  private petWithHand(): void {
    const view = this.view!;
    const life = this.life!;
    this.busy = true;
    life.pause(3.5);
    const sc = this.scaleAt(life.y);
    canvasTexture(this, 'home:hand', 220, 220, (ctx) => drawIcon(ctx, 'pet', 110, 116, 82));
    const headY = life.y - MONZ_H * sc;
    const hand = this.add.image(view.x, headY - 120, 'home:hand').setDepth(DEPTH.effect).setAlpha(0).setAngle(180).setScale(sc / SCALE_FRONT * 0.7);
    this.tweens.add({ targets: hand, alpha: 1, y: headY, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: hand,
      x: { from: view.x - 50, to: view.x + 50 },
      duration: 260,
      delay: 260,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onStart: () => audio.se('spray', { pitch: 0.5 }),
      onComplete: () => {
        const kind = life.body.pet();
        audio.se(kind);
        if (kind === 'happy') this.hearts(3);
        this.tweens.add({ targets: hand, alpha: 0, y: headY - 100, duration: 240, onComplete: () => hand.destroy() });
        this.time.delayedCall(900, () => (this.busy = false));
      },
    });
  }

  /** 中身がまだないボタン: 「じゅんび中」を出す */
  private comingSoon(label: string): void {
    this.busy = true;
    audio.se('tap', { pitch: 0.8 });
    const key = `home:soon:${label}`;
    canvasTexture(this, key, 520, 300, (ctx) => {
      const p = drawPaper(ctx, 520, 300, label.length);
      ctx.fillStyle = '#16101c';
      ctx.font = `900 46px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [`${label}は`, 'じゅんび中！'].forEach((l, i) => ctx.fillText(l, 260, p.y + p.h / 2 + (i - 0.5) * 60));
      ctx.textAlign = 'left';
    });
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0, 0).setDepth(DEPTH.popup).setInteractive();
    const card = this.add.image(W / 2, H * 0.45, key).setDepth(DEPTH.popup + 1).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    const close = () => {
      shade.destroy();
      this.tweens.add({ targets: card, scale: 0.6, alpha: 0, duration: 160, onComplete: () => card.destroy() });
      audio.se('back');
      this.busy = false;
    };
    this.time.delayedCall(250, () => shade.once('pointerdown', close));
  }

  private hearts(n: number): void {
    const life = this.life!;
    const sc = this.scaleAt(life.y);
    canvasTexture(this, 'home:heart', 72, 66, (ctx) => drawHeart(ctx, 72, 66));
    for (let i = 0; i < n; i++) {
      const h = this.add.image(life.x + (i - (n - 1) / 2) * 50, life.y - MONZ_H * sc - 10, 'home:heart').setDepth(DEPTH.effect).setScale(0.25);
      this.tweens.add({ targets: h, scale: 0.6 + (i % 2) * 0.15, duration: 260, delay: i * 120, ease: 'Back.easeOut' });
      this.tweens.add({ targets: h, y: h.y - 120 - i * 16, alpha: 0, duration: 1200, delay: i * 120 + 200, onComplete: () => h.destroy() });
    }
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: Math.round(size * 0.2), align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH.effect);
  }

  update(_time: number, delta: number): void {
    const view = this.view;
    const life = this.life;
    if (!view || !life) return;
    const dt = Math.min(delta / 1000, 0.1);
    this.t += dt;
    life.update(dt);
    // 奥ほど小さく、向きに合わせて左右反転。手前にいるほど前に描く
    const sc = this.scaleAt(life.y);
    view.setPosition(life.x, life.y).setScale(sc * life.facing, sc).setDepth(DEPTH.monz + this.depthOf(life.y));
    view.render(life.body, this.t);
    this.shadow?.setPosition(life.x, life.y + 2).setScale(sc / SCALE_FRONT).setDepth(DEPTH.monz - 1);
    const brain = life.body;
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    this.zText?.setVisible(sleeping);
    if (sleeping && this.zText) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(life.x + 60 + k * 30, life.y - MONZ_H * sc - k * 50).setAlpha(1 - k).setScale(0.7 + k * 0.6);
    }
  }
}
