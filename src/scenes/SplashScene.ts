import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { canvasTexture, COLORS, UI_FONT } from '../ui/paint';

/**
 * 起動してすぐの「TAP TO START」画面。
 * iPhone はタップするまで音を出せないので、ここで1回タップしてもらい、
 * タイトル画面は最初から音楽つきで出す。
 */
export class SplashScene extends Phaser.Scene {
  constructor() {
    super('Splash');
  }

  create(): void {
    const { width: W, height: H } = this.scale;
    canvasTexture(this, 'ui:splash', W, H, (ctx) => {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, H * 0.75);
      g.addColorStop(0, '#3a1f4d');
      g.addColorStop(0.55, '#1b1024');
      g.addColorStop(1, '#07040a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    this.add.image(0, 0, 'ui:splash').setOrigin(0, 0);

    // ゆっくり浮かぶ光の粒
    const colors = [COLORS.yellow, COLORS.pink, COLORS.teal].map((c) => Phaser.Display.Color.HexStringToColor(c).color);
    for (let i = 0; i < 26; i++) {
      const dot = this.add.circle(Phaser.Math.Between(20, W - 20), Phaser.Math.Between(80, H - 80), Phaser.Math.Between(3, 8), colors[i % 3], 0.7);
      this.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(60, 160),
        alpha: 0.1,
        duration: Phaser.Math.Between(1800, 3600),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 1500),
        ease: 'Sine.easeInOut',
      });
    }

    const text = this.add
      .text(W / 2, H / 2, 'TAP TO START', {
        fontFamily: UI_FONT,
        fontSize: '76px',
        fontStyle: '900',
        color: COLORS.yellow,
        stroke: '#000000',
        strokeThickness: 12,
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(W / 2, H / 2 + 92, '♪ 音が出ます', { fontFamily: UI_FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setAlpha(0.8);
    this.tweens.add({ targets: text, scale: 1.08, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    let done = false;
    this.input.once('pointerdown', () => {
      if (done) return;
      done = true;
      audio.unlock();
      this.tweens.killTweensOf(text);
      this.tweens.add({ targets: [text, sub], scale: 1.5, alpha: 0, duration: 220, ease: 'Cubic.easeIn' });
      this.cameras.main.flash(200, 255, 255, 255);
      this.time.delayedCall(140, () => this.scene.start('Title', { fromSplash: true }));
    });
  }
}
