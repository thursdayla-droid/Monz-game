import * as Phaser from 'phaser';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
export const TITLE_IMAGE = 'title:image';
export const TITLE_FILE = 'assets/title/title.png';

/**
 * タイトル画面。企画者が用意したタイトルの絵(design/title/title.png)をそのまま全面に出す。
 * タップすると次の画面へ。【仮】今は BUNK の動きのテスト画面へ進む(誕生・部屋ができたら差しかえる)。
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const { width, height } = this.scale;
    const img = this.add.image(width / 2, height / 2, TITLE_IMAGE);
    // 画面をすき間なくおおう大きさ(縦横比はほぼ同じなので、はみ出しはわずか)
    img.setScale(Math.max(width / img.width, height / img.height));

    const tap = this.add
      .text(width / 2, height - 96, 'タップしてはじめる', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1024',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0.25, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.input.once('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('BunkParts'));
    });
  }
}
