import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { MINIGAME_SLOTS, MINIGAMES } from '../core/modes';
import { drawArcadeWall, drawGameCard, drawTitleSign } from '../ui/minigameArt';
import { canvasTexture, canvasTextureOnce, UI_FONT } from '../ui/paint';
import { drawPanel } from '../ui/homeArt';
import { homeIconKey } from './HomeScene';
import { preloadPacks } from '../render/packs';

const W = 720;
const H = 1280;
const CARD = { w: 660, h: 176, gap: 22, top: 300 };

/** 企画者のセレクト画面の絵(design/minigame/select.png・941x1671)。押せる場所は、この絵の座標で決める */
export const SELECT_IMAGE = 'mg:select';
const ART = { w: 941, h: 1671 };
const ART_BACK = [30, 38, 255, 110];
/** 上から MONZ CARD・ダッシュモンズ・？？？×3 の看板 */
const ART_CARDS = [
  [38, 420, 910, 640],
  [38, 668, 910, 890],
  [38, 925, 910, 1132],
  [38, 1160, 910, 1367],
  [38, 1393, 910, 1602],
];
/** 企画者の絵に名前まで描いてあるゲームの数(これより後のゲームは、？？？の上に名前を重ねて出す) */
const ART_PAINTED = 2;
/** 看板の中の「？？？・説明」と「SOON」の場所(看板の左上からの位置) */
const ART_SLOT_TEXT = [332, 36, 712, 176];
const ART_SLOT_SOON = [712, 12, 858, 176];

/**
 * あとから届いた看板の絵(ゲームの id ごと)。frame: 絵の中の黄色い枠の位置(元の絵の大きさ srcW での座標)。
 * セレクト画面の枠に、この枠がぴったり重なるように置く
 */
export const SELECT_CARD_ART: Record<string, { key: string; file: string; srcW: number; frame: [number, number, number, number] }> = {
  slugger: { key: 'mg:card:slugger', file: 'assets/minigame/select_slugger.webp', srcW: 2172, frame: [29, 141, 2139, 672] },
};

/** 絵に描いてある「0」を隠して、本当のコインの数を出す場所 */
const ART_COIN_NUMBER = [715, 52, 846, 104];

/**
 * ミニゲームのセレクト画面(お世話画面の「ミニゲーム」から開く)。
 * 遊ぶゲームを選ぶ専用の画面。ゲームの一覧(src/core/modes.ts)から看板を並べる。目標5種類なので、決まっていない枠は「？？？」。
 * 絵は企画者のデザイン(2026-10-20)。読み込めなかったときだけ、プログラムで描いた仮の絵を出す。
 */
export class MinigameSelectScene extends Phaser.Scene {
  constructor() {
    super('MinigameSelect');
  }

  preload(): void {
    preloadPacks(this, ['minigame', 'home']);
  }

  create(): void {
    if (this.textures.exists(SELECT_IMAGE)) this.buildFromArt();
    else this.buildDrawn();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('home');
  }

  /** 企画者の絵で作る */
  private buildFromArt(): void {
    const sx = W / ART.w;
    const sy = H / ART.h;
    this.add.image(0, 0, SELECT_IMAGE).setOrigin(0, 0).setDisplaySize(W, H);
    const zone = ([x0, y0, x1, y1]: number[], onTap: (z: Phaser.GameObjects.Rectangle) => void) => {
      const z = this.add.rectangle(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => onTap(z));
      return z;
    };
    // 押したところが一瞬光る
    const flash = (z: Phaser.GameObjects.Rectangle) => {
      z.setFillStyle(0xffffff, 0.25);
      this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
    };
    zone(ART_BACK, (z) => {
      flash(z);
      this.leave();
    });
    ART_CARDS.forEach((box, i) => {
      const g = MINIGAMES[i];
      zone(box, (z) => {
        flash(z);
        if (g?.ready && g.scene) {
          audio.se('next');
          this.scene.start(g.scene);
        } else {
          audio.se('tap', { pitch: 0.8 });
          this.cameras.main.shake(120, 0.003);
          if (g) this.toast(`${g.title}は じゅんび中！`);
        }
      });
    });
    // 企画者の絵に描いてないゲーム: 看板の絵があればそれ、なければ ？？？と SOON を隠して名前を出す(【仮】)
    ART_CARDS.forEach(([bx0, by0], i) => {
      const g = MINIGAMES[i];
      if (i < ART_PAINTED || !g) return;
      const art = SELECT_CARD_ART[g.id];
      if (art && this.textures.exists(art.key)) {
        // 企画者の看板の絵: 下の「？？？」の看板を隠して、黄色い枠が同じ所にくるように置く
        const [ax0, ay0, ax1, ay1] = ART_CARDS[i];
        this.add.rectangle((ax0 - 6) * sx, (ay0 - 6) * sy, (ax1 - ax0 + 12) * sx, (ay1 - ay0 + 12) * sy, 0x0b0a12, 1).setOrigin(0, 0);
        const [fx0, fy0, fx1, fy1] = art.frame;
        // 横と縦を別々に合わせて、ほかの看板と同じ幅・高さにする(縦横の比が少しちがうので、少しだけ縦を縮める)
        const kx = ((ax1 - ax0) * sx) / (fx1 - fx0);
        const ky = ((ay1 - ay0) * sy) / (fy1 - fy0);
        const img = this.add.image(0, 0, art.key).setOrigin(0, 0);
        img.setScale((kx * art.srcW) / img.width, (ky * art.srcW) / img.width);
        img.setPosition(ax0 * sx - fx0 * kx, ay0 * sy - fy0 * ky);
        // 枠の外に飛び出した所(バットなど)は切る。枠の光のぶんだけ少し残す(2026-10-21 企画者の指示)
        const r = img.width / art.srcW;
        const glow = 14;
        img.setCrop((fx0 - glow) * r, (fy0 - glow) * r, (fx1 - fx0 + glow * 2) * r, (fy1 - fy0 + glow * 2) * r);
        return;
      }
      const cover = ([x0, y0, x1, y1]: number[]) => this.add.rectangle((bx0 + x0) * sx, (by0 + y0) * sy, (x1 - x0) * sx, (y1 - y0) * sy, 0x0b0a12, 0.96).setOrigin(0, 0);
      cover(ART_SLOT_TEXT);
      if (g.ready) cover(ART_SLOT_SOON);
      const tx = (bx0 + ART_SLOT_TEXT[0] + 10) * sx;
      this.add.text(tx, (by0 + 92) * sy, g.title, { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '44px', color: '#ffffff', stroke: g.color, strokeThickness: 4 }).setOrigin(0, 0.5);
      this.add.text(tx, (by0 + 146) * sy, `スコア：${g.score}`, { fontFamily: UI_FONT, fontSize: '22px', fontStyle: '800', color: '#d8d0e8' }).setOrigin(0, 0.5);
    });
    // コインの数
    const [cx0, cy0, cx1, cy1] = ART_COIN_NUMBER;
    this.add.rectangle(cx0 * sx, cy0 * sy, (cx1 - cx0) * sx, (cy1 - cy0) * sy, 0x050308, 1).setOrigin(0, 0);
    this.add
      .text(cx1 * sx - 4, ((cy0 + cy1) / 2) * sy, loadLife().coins.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(1, 0.5);
  }

  private toast(msg: string): void {
    const t = this.add
      .text(W / 2, H * 0.5, msg, { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101cdd', padding: { x: 22, y: 12 } })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  /** 【仮】絵が読めなかったときの、プログラムで描いた画面 */
  private buildDrawn(): void {
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
  }

  private leave(): void {
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home'));
  }
}
