import * as Phaser from 'phaser';
import { BunkBrain } from '../core/bunkBehavior';
import { clearSave, loadSave } from '../core/save';
import { BUNK_MOTION, BunkView, TEST_PERSONALITY } from '../render/bunkView';
import { canvasTexture, drawStreet, COLORS, UI_FONT } from '../ui/paint';

const W = 720;
const H = 1280;
const SCALE = 0.5;
const FLOOR_Y = 1100;
const ORB_COLORS = [COLORS.orange, COLORS.purple, COLORS.pink, COLORS.blue, COLORS.yellow];
const NAMES: Record<string, string> = { bunk: 'BUNK' };

/**
 * 誕生の演出と、最初のMONZとの出会い。
 * intro=true: 質問のあと(光が集まってはじけ、MONZが現れる)。intro=false: 2回目からの起動(すぐ表示)。
 * 【仮】出会ったあとは、この画面が仮のホーム(部屋ができたら差しかえる)。
 */
export class BirthScene extends Phaser.Scene {
  private view?: BunkView;
  private brain?: BunkBrain;
  private t = 0;
  private alive = false;
  private zText?: Phaser.GameObjects.Text;

  constructor() {
    super('Birth');
  }

  create(data: { intro?: boolean }): void {
    this.alive = false;
    this.t = 0;
    canvasTexture(this, 'ui:street', W, H, (ctx) => drawStreet(ctx, W, H));
    this.add.image(0, 0, 'ui:street').setOrigin(0, 0);
    const monz = loadSave()?.firstMonz ?? 'bunk';
    if (data.intro) this.playIntro(monz);
    else {
      this.spawn(monz, false);
      this.cameras.main.fadeIn(300, 0, 0, 0);
    }
  }

  /** 光が集まってはじける演出 */
  private playIntro(monz: string): void {
    canvasTexture(this, 'ui:orb', 160, 160, (ctx) => {
      const g = ctx.createRadialGradient(80, 80, 0, 80, 80, 80);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 160);
    });
    const dark = this.add.rectangle(0, 0, W, H, 0x0d0614).setOrigin(0, 0).setAlpha(1);
    const cx = W / 2;
    const cy = 640;
    const caption = this.text(cx, 330, 'キミの答えから…', 44, '#ffffff').setAlpha(0);
    this.tweens.add({ targets: caption, alpha: 1, duration: 500 });

    // 5つの答えの光
    const orbs = ORB_COLORS.map((c, i) => {
      const a = (i / ORB_COLORS.length) * Math.PI * 2 - Math.PI / 2;
      return this.add
        .image(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250, 'ui:orb')
        .setTint(Phaser.Display.Color.HexStringToColor(c).color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0)
        .setData('a', a);
    });
    orbs.forEach((o, i) => this.tweens.add({ targets: o, scale: 0.9, duration: 260, delay: 300 + i * 220, ease: 'Back.easeOut' }));

    const spin = { r: 250, a: 0 };
    this.time.delayedCall(1600, () => {
      this.tweens.add({
        targets: spin,
        r: 0,
        a: Math.PI * 3,
        duration: 1300,
        ease: 'Cubic.easeIn',
        onUpdate: () => orbs.forEach((o) => o.setPosition(cx + Math.cos(o.getData('a') + spin.a) * spin.r, cy + Math.sin(o.getData('a') + spin.a) * spin.r)),
        onComplete: () => {
          orbs.forEach((o) => o.destroy());
          this.tweens.add({ targets: caption, alpha: 0, duration: 200 });
          core();
        },
      });
    });

    // 1つになった光がふくらんで、はじける
    const core = () => {
      const ball = this.add.image(cx, cy, 'ui:orb').setBlendMode(Phaser.BlendModes.ADD).setScale(0.6);
      this.tweens.add({ targets: ball, scale: 1.4, duration: 280, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
      this.cameras.main.shake(1500, 0.006);
      this.time.delayedCall(1500, () => {
        const flash = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0, 0).setAlpha(0).setDepth(10);
        this.tweens.add({
          targets: flash,
          alpha: 1,
          duration: 160,
          onComplete: () => {
            ball.destroy();
            dark.destroy();
            this.spawn(monz, true);
            this.tweens.add({ targets: flash, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
          },
        });
      });
    };
  }

  /** MONZを出す。born=true なら誕生直後(喜んで跳ねる、文字を出す) */
  private spawn(monz: string, born: boolean): void {
    const view = new BunkView(this, W / 2, FLOOR_Y, SCALE);
    view.still = false;
    const brain = new BunkBrain(BUNK_MOTION.behavior, Date.now() & 0xffff, TEST_PERSONALITY);
    brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    brain.hold = born;
    this.view = view;
    this.brain = brain;
    this.alive = true;
    view.on('pointerdown', () => brain.pet());
    this.zText = this.text(0, 0, 'z', 38, '#ffffff').setVisible(false);

    // 【テスト用】回答を消して質問からやり直す(URL に ?reset を付けられない環境のため)
    this.add
      .text(W - 20, 24, '最初から', { fontFamily: UI_FONT, fontSize: '22px', color: '#ffffff', backgroundColor: '#16101caa', padding: { x: 10, y: 6 } })
      .setOrigin(1, 0)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        clearSave();
        this.scene.start('Title');
      });

    const name = NAMES[monz] ?? monz.toUpperCase();
    if (born) {
      brain.reaction = { face: 'happy', kind: 'happy', left: 2.2, age: 0 };
      view.setScale(SCALE * 0.2);
      this.tweens.add({ targets: view, scale: SCALE, duration: 520, ease: 'Back.easeOut' });
      const t1 = this.text(W / 2, 170, 'MONZが生まれた！', 64, '#ffd23a').setScale(0);
      this.tweens.add({ targets: t1, scale: 1, duration: 420, delay: 300, ease: 'Back.easeOut' });
      const t2 = this.text(W / 2, 270, `「${name}」`, 76, '#ffffff').setAlpha(0);
      this.tweens.add({ targets: t2, alpha: 1, duration: 400, delay: 900 });
      this.time.delayedCall(3200, () => {
        brain.hold = false;
        const hint = this.text(W / 2, H - 70, 'タップするとなでられるよ', 30, '#ffffff').setAlpha(0);
        this.tweens.add({ targets: hint, alpha: 1, duration: 400 });
      });
    } else {
      this.text(W / 2, 170, name, 76, '#ffffff');
      this.text(W / 2, H - 70, 'タップするとなでられるよ', 30, '#ffffff');
    }
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: Math.round(size * 0.2), align: 'center' })
      .setOrigin(0.5)
      .setDepth(5);
  }

  update(_time: number, delta: number): void {
    if (!this.alive || !this.view || !this.brain) return;
    const dt = Math.min(delta / 1000, 0.1);
    const view = this.view;
    const brain = this.brain;
    this.t += dt;
    brain.update(dt);
    if (brain.activity === 'walk' && !brain.switching && !brain.reaction) {
      const minX = 300;
      const maxX = W - 300;
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
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    this.zText?.setVisible(sleeping);
    if (sleeping && this.zText) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(view.x + 150 + k * 40, view.y - 900 * SCALE - k * 60).setAlpha(1 - k).setScale(0.7 + k * 0.6);
    }
  }
}
