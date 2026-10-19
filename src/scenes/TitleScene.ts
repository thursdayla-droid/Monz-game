import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadSave } from '../core/save';
import { addSoundButton } from '../ui/soundButton';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
export const TITLE_IMAGE = 'title:image';
export const TITLE_FILE = 'assets/title/title.png';

/**
 * タイトル画面。企画者が用意したタイトルの絵(design/title/title.png)をそのまま全面に出す。
 * Tap (after the music turns on) to go to the questions the first time、2回目からは出会ったMONZの画面(【仮】ホーム)へ進む。
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
      .text(width / 2, height - 96, '', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1024',
        strokeThickness: 10,
        align: 'center',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0.25, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Title song. An iPhone can't play sound until the first tap, so
    // the first tap only starts the music, and the next tap begins the game (skipped if sound is already on)
    audio.playBgm('title');
    addSoundButton(this, width - 60, 60);
    const label = () => tap.setText(audio.unlocked ? 'タップしてはじめる' : '♪ タップして音楽をON');
    label();

    let leaving = false;
    img.setInteractive();
    img.on('pointerdown', () => {
      if (leaving) return;
      if (!audio.unlocked) {
        audio.unlock();
        audio.se('select');
        this.tweens.add({ targets: img, scale: img.scale * 1.02, duration: 120, yoyo: true });
        label();
        return;
      }
      leaving = true;
      audio.se('next');
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(loadSave() ? 'Birth' : 'Question', { intro: false }));
    });
  }
}
