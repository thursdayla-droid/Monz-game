import * as Phaser from 'phaser';
import { fillSize } from '../ui/viewport';
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

/** 企画者のバトルセレクト画面の絵(2026-11-01。design/battle_menu/battle_menu.png・941x1672)。文字・看板は絵に入っている */
export const BATTLE_MENU_IMAGE = 'battlemenu:bg';
/** 2026-11-07 企画者の 新しい 背景(上 = MONZ RUMBLE の 雰囲気・下 = MYTHCLASH の 雰囲気。design/battle_menu/battle_menu2_bg.png)。前の絵 battle_menu.webp は 残す */
export const BATTLE_MENU_FILE = 'assets/home/battle_menu2.webp';
/** 看板の絵: MONZ RUMBLE は 企画者の 絵(design/rumble_ui/bm_rumble_sign.png)。MYTHCLASH は 前の 絵から 切り出した 看板【仮：新しい 看板の 絵が できたら 入れかえる】 */
export const BATTLE_MENU_SIGNS = [
  { key: 'battlemenu:sign:action', url: 'assets/home/bm_rumble.webp' },
  { key: 'battlemenu:sign:mythclash', url: 'assets/home/bm_myth_old.webp' },
] as const;
// 2026-11-08 全画面用の 縦長の 背景(852x1846。前の 背景は unused/)
const ART = { w: 852, h: 1846 };

/** 看板2枚: 操作するバトル と MYTHCLASH。pic: 看板に使う絵とその切り抜き範囲(元の絵の座標) */
const ENTRIES = [
  // 企画者の指示書(2026-10-30): 旧アクションバトル(Battle)は使わない。MONZが自分で戦うオートバトルに置きかえ。旧バトルのコードは残してある
  // 企画者 2026-11-01「2Dバトルはいらない」→ 3Dバトル(アニメのモンスターバトル風)へ。2D のオートバトル(AutoBattle)のコードは残す(メニューからは外した)
  // 2026-11-03 企画者: MONZ RUMBLE はストーリーモードとバトルモードを選ぶ → モードえらびへ
  { id: 'action', scene: 'RumbleMode', title: 'バトル', sub: 'MONZが じぶんで たたかう', color: '#ff8a1f', pic: { key: DASH_BG_KEY, crop: [900, 250, 2150, 1020] } },
  { id: 'mythclash', scene: 'MythTitle', title: 'MYTHCLASH', sub: 'カードを集めて 3対3でたたかう', color: '#c0182a', pic: { key: MYTH_TITLE_IMAGE, crop: [20, 385, 832, 880] } },
] as const;

/**
 * バトルメニュー(お世話画面の「バトル」から開く)。アクションバトルと MYTHCLASH を選ぶ(企画者決定 2026-10-26)。
 * 画面は企画者の絵(2026-11-01)。絵が読めなかったときだけ、前のプログラムで描いた看板を出す
 */
export class BattleMenuScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super('BattleMenu');
  }

  preload(): void {
    preloadPacks(this, ['battlemenu', 'dash', 'mythclash']);
  }

  create(): void {
    this.leaving = false;
    if (this.textures.exists(BATTLE_MENU_IMAGE)) this.createArt();
    else this.createDrawn();
    const back = this.add
      .text(24, 28, '◀ もどる', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 8 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.go('Home', true));
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('home');
  }

  /** 企画者の背景を 画面いっぱいに出し、上半分に MONZ RUMBLE・下半分に MYTHCLASH の 看板を 置く(2026-11-07) */
  private createArt(): void {
    // 全画面: 絵を 横はばに 合わせて 上から(画面の 形まで のばす)
    const tall = Math.max(fillSize(this, { w: W, h: H }, { minRatio: 0.4, maxRatio: W / H }).h, H);
    this.scale.setGameSize(W, tall);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(W, H));
    this.cameras.main.setBackgroundColor('#1a0c24');
    const k = W / ART.w;
    this.add.image(0, 0, BATTLE_MENU_IMAGE).setOrigin(0, 0).setScale(k);
    canvasTextureOnce(this, 'bm:logo', 680, 200, (ctx) => drawGraffitiText(ctx, 680, 200, 'BATTLE', '#ffd23a', 150, -0.06));
    const logo = this.add.image(W / 2, 150, 'bm:logo').setScale(0.3);
    this.tweens.add({ targets: logo, scale: 0.85, duration: 420, ease: 'Back.easeOut' });
    // 上の ステージ・下の 魔法陣の 前の 空いた 所に 看板
    const ys: Record<(typeof ENTRIES)[number]['id'], number> = { action: 520, mythclash: 930 };
    ENTRIES.forEach((e, i) => {
      const key = `battlemenu:sign:${e.id}`;
      if (!this.textures.exists(key)) return;
      const img = this.add.image(W / 2 + 900, ys[e.id], key).setInteractive({ useHandCursor: true });
      img.setScale(620 / img.width);
      const base = img.scale;
      const moving: Phaser.GameObjects.GameObject[] = [img];
      // 2026-11-07 企画者「MYTHCLASH みたいに MONZ RUMBLE の下に『育てたモンズで戦う』」→ 黒い帯に 白い文字
      if (e.id === 'action') {
        canvasTextureOnce(this, 'bm:sub:action', 520, 64, (ctx) => {
          ctx.fillStyle = 'rgba(10,6,16,0.92)';
          ctx.beginPath();
          ctx.moveTo(18, 6);
          ctx.lineTo(520, 0);
          ctx.lineTo(502, 58);
          ctx.lineTo(0, 64);
          ctx.closePath();
          ctx.fill();
          ctx.font = `900 34px ${UI_FONT}`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('育てたモンズで戦う', 260, 33);
        });
        const sub = this.add.image(img.x, ys[e.id] + img.displayHeight * 0.33, 'bm:sub:action').setScale(0.98);
        moving.push(sub);
      }
      this.tweens.add({ targets: moving, x: W / 2, duration: 420, delay: 100 + i * 90, ease: 'Back.easeOut' });
      img.on('pointerdown', () => {
        this.tweens.add({ targets: img, scale: base * 0.95, duration: 70, yoyo: true });
        this.go(e.scene, false);
      });
    });
  }

  /** 前の画面(プログラムで描いた看板)。絵が読めなかったときだけ使う */
  private createDrawn(): void {
    canvasTextureOnce(this, 'bm:wall', W, H, (ctx) => drawArcadeWall(ctx, W, H));
    this.add.image(0, 0, 'bm:wall').setOrigin(0, 0);
    canvasTextureOnce(this, 'bm:logo', 680, 200, (ctx) => drawGraffitiText(ctx, 680, 200, 'BATTLE', '#ff3a4a', 150, -0.06));
    const logo = this.add.image(W / 2, 210, 'bm:logo').setScale(0.3);
    this.tweens.add({ targets: logo, scale: 1, duration: 420, ease: 'Back.easeOut' });

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
