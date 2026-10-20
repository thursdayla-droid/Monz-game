import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { MINIGAME_SLOTS, MINIGAMES } from '../core/modes';
import { drawArcadeWall, drawGameCard, drawTitleSign } from '../ui/minigameArt';
import { canvasTexture, canvasTextureOnce, UI_FONT } from '../ui/paint';
import { drawPanel } from '../ui/homeArt';
import { homeIconKey } from './HomeScene';

const W = 720;
const H = 1280;
const CARD = { w: 660, h: 176, gap: 22, top: 300 };

/**
 * ミニゲームのセレクト画面(お世話画面の「ミニゲーム」から開く)。
 * 遊ぶゲームを選ぶ専用の画面。ゲームの一覧(src/core/modes.ts)から看板を並べる。目標5種類なので、決まっていない枠は「？？？」。
 * 【仮】絵はプログラムで描いた仮の絵。企画者のデザインが届いたら差しかえる。
 */
export class MinigameSelectScene extends Phaser.Scene {
  constructor() {
    super('MinigameSelect');
  }

  create(): void {
    canvasTextureOnce(this, 'mg:wall', W, H, (ctx) => drawArcadeWall(ctx, W, H));
    this.add.image(0, 0, 'mg:wall').setOrigin(0, 0);
    canvasTextureOnce(this, 'mg:title', 640, 140, (ctx) => drawTitleSign(ctx, 640, 140));
    const title = this.add.image(W / 2, 200, 'mg:title');
    this.tweens.add({ targets: title, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // もどる・コイン
    const back = this.add
      .text(24, 28, '◀ もどる', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', backgroundColor: '#8a35e0', padding: { x: 16, y: 8 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    canvasTextureOnce(this, 'mg:coin', 220, 76, (ctx) => drawPanel(ctx, 220, 76, 93));
    this.add.image(W - 24 - 110, 28 + 34, 'mg:coin');
    if (this.textures.exists(homeIconKey('coin'))) this.add.image(W - 24 - 182, 62, homeIconKey('coin')).setDisplaySize(62, 62);
    this.add.text(W - 44, 62, loadLife().coins.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '32px', color: '#16101c' }).setOrigin(1, 0.5);

    // ゲームの看板
    for (let i = 0; i < MINIGAME_SLOTS; i++) {
      const g = MINIGAMES[i];
      const key = `mg:card:${i}:${g?.id ?? 'none'}`;
      canvasTexture(this, key, CARD.w, CARD.h, (ctx) =>
        drawGameCard(ctx, CARD.w, CARD.h, g?.title ?? '', g ? `スコア：${g.score}` : 'これから追加！', g?.color ?? '#6b6f86', g?.id ?? null, g?.ready ?? false, 61 + i),
      );
      const y = CARD.top + CARD.h / 2 + i * (CARD.h + CARD.gap);
      const card = this.add.image(W / 2 + 900, y, key).setInteractive({ useHandCursor: true });
      // 右から順にすべりこむ
      this.tweens.add({ targets: card, x: W / 2, duration: 420, delay: 80 + i * 70, ease: 'Back.easeOut' });
      card.on('pointerdown', () => {
        this.tweens.add({ targets: card, scale: 0.95, duration: 70, yoyo: true });
        if (g?.ready && g.scene) {
          audio.se('next');
          this.scene.start(g.scene);
        } else {
          audio.se('tap', { pitch: 0.8 });
          this.cameras.main.shake(120, 0.003);
        }
      });
    }
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('home');
  }

  private leave(): void {
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home'));
  }
}
