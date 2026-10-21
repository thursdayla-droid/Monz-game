import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { HOME_PLACE_LABELS, HOME_PLACES, savedHomePlace, type HomePlace } from '../core/home';
import { loadLife, saveLife } from '../core/lifeSave';
import { drawPanel } from '../ui/homeArt';
import { canvasTexture, drawButton, UI_FONT } from '../ui/paint';
import { preloadPacks } from '../render/packs';
import { homeImageKey } from './HomeScene';

const W = 720;
const H = 1280;
/** 下の小さい部屋の絵 */
const THUMB = { w: 150, h: 225, y: 880, gap: 36 };
const INK = '#16101c';

/**
 * 「どこで育てる？」(企画者決定 2026-10-21)。MONZが生まれた後、お世話画面の前に部屋を選ぶ。
 * 後ろには選んでいる部屋をそのまま大きく出す。下の小さい絵をタップで切りかえ、「ここで育てる」で決定。
 */
export class RoomSelectScene extends Phaser.Scene {
  private selected: HomePlace = 'street';
  private bg?: Phaser.GameObjects.Image;
  private frames: Phaser.GameObjects.Graphics[] = [];
  private label?: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('RoomSelect');
  }

  preload(): void {
    preloadPacks(this, ['rooms']);
  }

  create(): void {
    this.leaving = false;
    this.frames = [];
    const life = loadLife();
    this.selected = savedHomePlace(life.place) ?? 'street';
    this.bg = this.add.image(W / 2, H / 2, homeImageKey(this.selected));
    this.fitBg(this.bg);

    // 上: 「〇〇をどこで育てる？」
    canvasTexture(this, 'room:title', 640, 150, (ctx) => drawPanel(ctx, 640, 150, 71));
    this.add.image(W / 2, 110, 'room:title');
    const name = life.monz.find((m) => m.uid === life.activeMonz)?.name ?? life.monz[0]?.name;
    this.add.text(W / 2, 88, name ? `${name}を` : 'MONZを', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: INK }).setOrigin(0.5);
    this.add.text(W / 2, 134, 'どこで育てる？', { fontFamily: UI_FONT, fontSize: '44px', fontStyle: '900', color: INK }).setOrigin(0.5);

    // 下: 部屋の名前・小さい絵・決定ボタン
    const shade = this.add.graphics();
    shade.fillStyle(0x16101c, 0.82).fillRect(0, THUMB.y - 110, W, H - THUMB.y + 110);
    this.label = this.add.text(W / 2, THUMB.y - 58, '', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    const total = HOME_PLACES.length * THUMB.w + (HOME_PLACES.length - 1) * THUMB.gap;
    HOME_PLACES.forEach((place, i) => {
      const x = (W - total) / 2 + i * (THUMB.w + THUMB.gap) + THUMB.w / 2;
      const y = THUMB.y + THUMB.h / 2;
      this.add
        .image(x, y, homeImageKey(place, true))
        .setDisplaySize(THUMB.w, THUMB.h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.choose(place));
      this.frames.push(this.add.graphics({ x, y }));
    });
    canvasTexture(this, 'room:ok', 480, 112, (ctx) => drawButton(ctx, 480, 112, 'ここで育てる', 'next', 72));
    this.add
      .image(W / 2, H - 78, 'room:ok')
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.decide());
    this.showSelected();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    audio.playBgm('home');
  }

  private fitBg(img: Phaser.GameObjects.Image): void {
    img.setScale(Math.max(W / img.width, H / img.height)).setDepth(-10);
  }

  private choose(place: HomePlace): void {
    if (this.leaving || place === this.selected) return;
    audio.se('tap');
    this.selected = place;
    // 部屋の絵を、ふわっと切りかえる
    const old = this.bg;
    this.bg = this.add.image(W / 2, H / 2, homeImageKey(place)).setAlpha(0);
    this.fitBg(this.bg);
    this.bg.setDepth(-9);
    this.tweens.add({ targets: this.bg, alpha: 1, duration: 250, onComplete: () => { old?.destroy(); this.bg?.setDepth(-10); } });
    this.showSelected();
  }

  private showSelected(): void {
    this.label?.setText(HOME_PLACE_LABELS[this.selected]);
    HOME_PLACES.forEach((place, i) => {
      const g = this.frames[i];
      const on = place === this.selected;
      g.clear();
      g.lineStyle(on ? 10 : 4, on ? 0xffd23a : 0xffffff, on ? 1 : 0.5);
      g.strokeRoundedRect(-THUMB.w / 2 - 4, -THUMB.h / 2 - 4, THUMB.w + 8, THUMB.h + 8, 10);
    });
  }

  private decide(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se('select');
    saveLife({ ...loadLife(), place: this.selected });
    this.cameras.main.fadeOut(300, 0, 0, 0);
    // 選ばなかった部屋の絵は、お世話画面に入ったところでメモリから外す(HomeScene)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home'));
  }
}
