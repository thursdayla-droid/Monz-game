import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { BunkBrain } from '../core/bunkBehavior';
import { HOME_ACTIONS, HOME_ACTION_LABELS, HOME_ACTION_READY, pickHomePlace, type HomeAction, type HomePlace, HOME_PLACES } from '../core/home';
import { mulberry32 } from '../core/rng';
import { clearSave, loadSave } from '../core/save';
import { BUNK_MOTION, BunkView, TEST_PERSONALITY } from '../render/bunkView';
import { drawActionButton, drawBowl, drawGarage, drawHeart, drawIcon, drawRoom } from '../ui/homeArt';
import { createNameplate } from '../ui/nameplate';
import { canvasTexture, drawPaper, drawStreet, UI_FONT } from '../ui/paint';
import { addSoundButton } from '../ui/soundButton';

const W = 720;
const H = 1280;
const SCALE = 0.38;
const FLOOR_Y = 1020;
/** 頭のてっぺんあたりの高さ(足元から) */
const HEAD = 860 * SCALE;
const BTN = { y: 1176, w: 162, h: 156, gap: 10 };
const NAMES: Record<string, string> = { bunk: 'BUNK' };
const LAST_PLACE_KEY = 'monz:home';

/**
 * 企画者の背景画像。用意できたら public/assets/home/ に置き、ここにファイル名を書く(BootScene で読み込む)。
 * 書いていない場所は、仮の絵(src/ui/homeArt.ts)を使う。
 */
export const HOME_IMAGES: Partial<Record<HomePlace, string>> = {};
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
 * ホーム(育てる画面)。場所は「なにもない部屋・路地裏・ガレージ」から開くたびにランダム。
 * 下のボタン: ごはん・なでる・ミニゲーム・きがえ。
 * 【仮】おなか・機嫌などの数値はまだない(決まったら足す)。ミニゲームと着替えは「じゅんび中」。
 */
export class HomeScene extends Phaser.Scene {
  private view?: BunkView;
  private brain?: BunkBrain;
  private t = 0;
  private busy = false;
  private zText?: Phaser.GameObjects.Text;
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

    // MONZ
    const view = new BunkView(this, W / 2, FLOOR_Y, SCALE);
    view.setDepth(2);
    view.still = false;
    const brain = new BunkBrain(BUNK_MOTION.behavior, Date.now() & 0xffff, TEST_PERSONALITY);
    brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    this.view = view;
    this.brain = brain;
    view.on('pointerdown', () => {
      if (this.busy) return;
      const kind = brain.pet();
      audio.se(kind);
      if (kind === 'happy') this.hearts(2);
    });
    this.zText = this.text(0, 0, 'z', 38, '#ffffff').setVisible(false);
    // 足元の影
    this.add.ellipse(W / 2, FLOOR_Y + 4, 330, 46, 0x000000, 0.25).setDepth(1).setName('shadow');

    createNameplate(this, NAMES[monz] ?? monz.toUpperCase(), W / 2, 250).dock(false);
    this.buildButtons();
    addSoundButton(this, 56, 56);

    // 【テスト用】回答を消して質問からやり直す / 誕生の演出だけをもう一度見る(保存データはそのまま)
    const testButton = (y: number, label: string, onTap: () => void) =>
      this.add
        .text(W - 20, y, label, { fontFamily: UI_FONT, fontSize: '22px', color: '#ffffff', backgroundColor: '#16101caa', padding: { x: 10, y: 6 } })
        .setOrigin(1, 0)
        .setDepth(6)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);
    testButton(24, '最初から', () => {
      clearSave();
      this.scene.start('Title');
    });
    testButton(72, '誕生をもう一度', () => this.scene.start('Birth', { intro: true }));

    this.cameras.main.fadeIn(400, 0, 0, 0);
    // 誕生の曲が流れていれば、最後まで聴かせる(終わるとホームの曲へ自然に移る)
    if (audio.playing !== 'hatch') audio.playBgm('home');
  }

  private drawBackground(): void {
    const key = homeImageKey(this.place);
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, H / 2, key).setDepth(-10);
      img.setScale(Math.max(W / img.width, H / img.height));
      return;
    }
    const draw = { room: drawRoom, alley: drawStreet, garage: drawGarage }[this.place];
    canvasTexture(this, `home:draw:${this.place}`, W, H, (ctx) => draw(ctx, W, H));
    this.add.image(0, 0, `home:draw:${this.place}`).setOrigin(0, 0).setDepth(-10);
  }

  private buildButtons(): void {
    const total = HOME_ACTIONS.length * BTN.w + (HOME_ACTIONS.length - 1) * BTN.gap;
    HOME_ACTIONS.forEach((action, i) => {
      const key = `home:btn:${action}`;
      canvasTexture(this, key, BTN.w, BTN.h, (ctx) => drawActionButton(ctx, BTN.w, BTN.h, action, HOME_ACTION_LABELS[action], HOME_ACTION_READY[action], 70 + i));
      const x = (W - total) / 2 + BTN.w / 2 + i * (BTN.w + BTN.gap);
      const btn = this.add.image(x, BTN.y, key).setDepth(10).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scale: 0.9, duration: 70, yoyo: true });
        this.act(action);
      });
    });
  }

  private act(action: HomeAction): void {
    if (this.busy) return;
    if (action === 'food') this.feed();
    else if (action === 'pet') this.petWithHand();
    else this.comingSoon(action);
  }

  /** 歩く・眠るをやめて、その場で止まる */
  private calm(): void {
    const brain = this.brain!;
    if (brain.activity !== 'idle') brain.start('idle');
    brain.jab = null;
  }

  /** ごはん【仮】: どんぶりが落ちてきて、3口で食べる */
  private feed(): void {
    const view = this.view!;
    const brain = this.brain!;
    this.busy = true;
    brain.hold = true;
    this.calm();
    audio.se('select');
    canvasTexture(this, 'home:bowl', 230, 190, (ctx) => drawBowl(ctx, 115, 104, 205));
    const bx = view.x < W / 2 ? view.x + 250 : view.x - 250;
    const bowl = this.add.image(bx, FLOOR_Y - 220, 'home:bowl').setOrigin(0.5, 0.85).setDepth(3).setAlpha(0);
    this.tweens.add({ targets: bowl, alpha: 1, duration: 120 });
    this.tweens.add({
      targets: bowl,
      y: FLOOR_Y + 10,
      duration: 420,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        audio.se('plop');
        brain.reaction = { face: 'happy', kind: 'surprised', left: 0.6, age: 0 };
        for (let i = 0; i < 3; i++) {
          this.time.delayedCall(700 + i * 650, () => {
            audio.se('knock', { pitch: 1.6 + i * 0.15 });
            brain.reaction = { face: i % 2 ? 'closed' : 'happy', kind: 'surprised', left: 0.4, age: 0 };
            bowl.setScale(1 - (i + 1) * 0.18);
            this.tweens.add({ targets: bowl, scaleY: bowl.scaleY * 0.85, duration: 80, yoyo: true });
            const word = this.text(view.x + (bx > view.x ? 130 : -130), FLOOR_Y - HEAD + 40, 'もぐ', 48, '#ffffff');
            this.tweens.add({ targets: word, y: word.y - 60, alpha: 0, duration: 600, onComplete: () => word.destroy() });
          });
        }
        this.time.delayedCall(700 + 3 * 650, () => {
          this.tweens.add({ targets: bowl, alpha: 0, scale: 0.2, duration: 260, onComplete: () => bowl.destroy() });
          audio.se('happy');
          brain.reaction = { face: 'happy', kind: 'happy', left: 1.6, age: 0 };
          this.hearts(3);
          this.time.delayedCall(1600, () => {
            brain.hold = false;
            this.busy = false;
          });
        });
      },
    });
  }

  /** なでる: 手が出てきて頭をなでる(反応はタップでなでたときと同じ) */
  private petWithHand(): void {
    const view = this.view!;
    const brain = this.brain!;
    this.busy = true;
    brain.hold = true;
    this.calm();
    canvasTexture(this, 'home:hand', 220, 220, (ctx) => drawIcon(ctx, 'pet', 110, 116, 82));
    const headY = FLOOR_Y - HEAD - 20;
    const hand = this.add.image(view.x, headY - 160, 'home:hand').setDepth(4).setAlpha(0).setAngle(180);
    this.tweens.add({ targets: hand, alpha: 1, y: headY, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: hand,
      x: { from: view.x - 70, to: view.x + 70 },
      duration: 260,
      delay: 260,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onStart: () => audio.se('spray', { pitch: 0.5 }),
      onComplete: () => {
        const kind = brain.pet();
        audio.se(kind);
        if (kind === 'happy') this.hearts(3);
        this.tweens.add({ targets: hand, alpha: 0, y: headY - 120, duration: 240, onComplete: () => hand.destroy() });
        this.time.delayedCall(900, () => {
          brain.hold = false;
          this.busy = false;
        });
      },
    });
  }

  /** ミニゲーム・きがえ: 中身ができるまで「じゅんび中」を出す */
  private comingSoon(action: HomeAction): void {
    this.busy = true;
    audio.se('tap', { pitch: 0.8 });
    const msg =
      action === 'minigame' ? 'ミニゲームは\nじゅんび中！' : 'きがえは\nじゅんび中！';
    const key = `home:soon:${action}`;
    canvasTexture(this, key, 520, 300, (ctx) => {
      const p = drawPaper(ctx, 520, 300, action === 'minigame' ? 81 : 82);
      ctx.fillStyle = '#16101c';
      ctx.font = `900 46px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      msg.split('\n').forEach((l, i) => ctx.fillText(l, 260, p.y + p.h / 2 + (i - 0.5) * 60));
      ctx.textAlign = 'left';
    });
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0, 0).setDepth(20).setInteractive();
    const card = this.add.image(W / 2, H * 0.45, key).setDepth(21).setScale(0.6).setAlpha(0);
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
    const view = this.view!;
    canvasTexture(this, 'home:heart', 72, 66, (ctx) => drawHeart(ctx, 72, 66));
    for (let i = 0; i < n; i++) {
      const h = this.add.image(view.x + (i - (n - 1) / 2) * 70, FLOOR_Y - HEAD - 40, 'home:heart').setDepth(4).setScale(0.3);
      this.tweens.add({ targets: h, scale: 0.9 + (i % 2) * 0.2, duration: 260, delay: i * 120, ease: 'Back.easeOut' });
      this.tweens.add({ targets: h, y: h.y - 160 - i * 20, alpha: 0, duration: 1200, delay: i * 120 + 200, onComplete: () => h.destroy() });
    }
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: Math.round(size * 0.2), align: 'center' })
      .setOrigin(0.5)
      .setDepth(5);
  }

  update(_time: number, delta: number): void {
    if (!this.view || !this.brain) return;
    const dt = Math.min(delta / 1000, 0.1);
    const view = this.view;
    const brain = this.brain;
    this.t += dt;
    brain.update(dt);
    if (brain.activity === 'walk' && !brain.switching && !brain.reaction) {
      const minX = 220;
      const maxX = W - 220;
      view.x += brain.dir * BUNK_MOTION.behavior.walkSpeed * SCALE * dt;
      if (view.x > maxX) {
        view.x = maxX;
        brain.bounce(-1);
      } else if (view.x < minX) {
        view.x = minX;
        brain.bounce(1);
      }
    }
    view.render(brain, this.t);
    (this.children.getByName('shadow') as Phaser.GameObjects.Ellipse | null)?.setX(view.x);
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    this.zText?.setVisible(sleeping);
    if (sleeping && this.zText) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(view.x + 120 + k * 40, view.y - HEAD - k * 60).setAlpha(1 - k).setScale(0.7 + k * 0.6);
    }
  }
}
