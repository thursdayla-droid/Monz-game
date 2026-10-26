import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { preloadPacks } from '../render/packs';
import { drawGraffitiText } from '../ui/cardArt';
import { drawArcadeWall } from '../ui/minigameArt';
import { canvasTexture, canvasTextureOnce, roundRectPath, UI_FONT } from '../ui/paint';
import { DASH_BG_KEY } from './DashScene';
import { MYTH_TITLE_IMAGE } from './MythTitleScene';

const W = 720;
const H = 1280;
const CARD = { w: 640, h: 400 };

/** 看板2枚: 操作するバトル と MYTHCLASH。pic: 看板に使う絵とその切り抜き範囲(元の絵の座標) */
const ENTRIES = [
  { id: 'action', scene: 'Battle', title: 'アクションバトル', sub: 'MONZを動かして たたかう', color: '#ff8a1f', pic: { key: DASH_BG_KEY, crop: [900, 250, 2150, 1020] } },
  { id: 'mythclash', scene: 'MythTitle', title: 'MYTHCLASH', sub: 'カードを集めて 3対3でたたかう', color: '#c0182a', pic: { key: MYTH_TITLE_IMAGE, crop: [20, 470, 832, 965] } },
] as const;

/**
 * バトルメニュー(お世話画面の「バトル」から開く)。アクションバトルと MYTHCLASH を選ぶ(企画者決定 2026-10-26)。
 * 【仮】画面の絵は企画者の絵が届くまでのプログラムで描いたもの。アクションバトルの名前も【仮】
 */
export class BattleMenuScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super('BattleMenu');
  }

  preload(): void {
    preloadPacks(this, ['dash', 'mythclash']);
  }

  create(): void {
    this.leaving = false;
    canvasTextureOnce(this, 'bm:wall', W, H, (ctx) => drawArcadeWall(ctx, W, H));
    this.add.image(0, 0, 'bm:wall').setOrigin(0, 0);
    canvasTextureOnce(this, 'bm:logo', 680, 200, (ctx) => drawGraffitiText(ctx, 680, 200, 'BATTLE', '#ff3a4a', 150, -0.06));
    const logo = this.add.image(W / 2, 210, 'bm:logo').setScale(0.3);
    this.tweens.add({ targets: logo, scale: 1, duration: 420, ease: 'Back.easeOut' });

    const back = this.add
      .text(24, 28, '◀ もどる', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 8 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.go('Home', true));

    ENTRIES.forEach((e, i) => {
      const key = `bm:card:${e.id}`;
      canvasTexture(this, key, CARD.w, CARD.h, (ctx) => this.drawEntry(ctx, e));
      const y = 400 + CARD.h / 2 + i * (CARD.h + 50);
      const card = this.add.image(W / 2 + 900, y, key).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: card, x: W / 2, duration: 420, delay: 100 + i * 90, ease: 'Back.easeOut' });
      card.on('pointerdown', () => {
        this.tweens.add({ targets: card, scale: 0.95, duration: 70, yoyo: true });
        this.go(e.scene, false);
      });
    });
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('home');
  }

  private drawEntry(ctx: CanvasRenderingContext2D, e: (typeof ENTRIES)[number]): void {
    const { w, h } = CARD;
    const m = 8;
    roundRectPath(ctx, m + 8, m + 10, w - m * 2 - 8, h - m * 2 - 8, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, m, m, w - m * 2 - 8, h - m * 2 - 8, 26);
    ctx.clip();
    const img = this.textures.exists(e.pic.key) ? (this.textures.get(e.pic.key).getSourceImage() as CanvasImageSource) : null;
    if (img) {
      const [x0, y0, x1, y1] = e.pic.crop;
      ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, m, m, w - m * 2 - 8, h - m * 2 - 8);
    } else {
      ctx.fillStyle = e.color;
      ctx.fillRect(0, 0, w, h);
    }
    // 下の帯(名前と説明)
    const band = 118;
    const g = ctx.createLinearGradient(0, h - band - 60, 0, h);
    g.addColorStop(0, 'rgba(10,6,16,0)');
    g.addColorStop(0.35, 'rgba(10,6,16,0.85)');
    g.addColorStop(1, 'rgba(10,6,16,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h - band - 60, w, band + 60);
    ctx.restore();
    roundRectPath(ctx, m, m, w - m * 2 - 8, h - m * 2 - 8, 26);
    ctx.lineWidth = 8;
    ctx.strokeStyle = e.color;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 50px ${UI_FONT}`;
    ctx.fillText(e.title, 36, h - 74);
    ctx.font = `800 26px ${UI_FONT}`;
    ctx.fillStyle = '#ffd23a';
    ctx.fillText(e.sub, 38, h - 34);
    ctx.font = `900 54px ${UI_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('▶', w - 40, h - 52);
  }

  private go(scene: string, backSe: boolean): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se(backSe ? 'back' : 'next');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene));
  }
}
