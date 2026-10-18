import * as Phaser from 'phaser';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
/** 元画像(高画質版)の大きさ(px)。両方この倍率で同じ大きさに表示する */
const SOURCE_W = 1278;
const SOURCE_H = 1230;
const PANEL_W = 340;
const SCALE = (PANEL_W - 20) / SOURCE_W;

export const REFERENCE_ORIGINAL = 'bunk:reference:original';
export const REFERENCE_CUTOUT = 'bunk:reference:cutout';
export const REFERENCE_FILES = {
  original: 'assets/bunk/reference/bunk_original_hires.png',
  cutout: 'assets/bunk/reference/bunk_hires_cutout.png',
};

/**
 * BUNKの元画像と、背景だけを消したゲーム表示を同じ大きさで並べる確認画面。
 * パーツ分け・アニメーション・色変更はしない(企画者の確認待ち)。
 */
export class CompareScene extends Phaser.Scene {
  constructor() {
    super('Compare');
  }

  create(): void {
    const { width } = this.scale;
    this.add.text(width / 2, 60, 'BUNK 元画像との比較', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(width / 2, 112, '背景だけを消して、そのまま表示しています', { fontFamily: FONT, fontSize: '22px', color: '#d9c8ff' }).setOrigin(0.5);

    const top = 180;
    const h = SOURCE_H * SCALE + 20;
    const left = (width - PANEL_W * 2 - 20) / 2;
    const panels: [string, string, number][] = [
      ['元画像', REFERENCE_ORIGINAL, left],
      ['ゲーム表示', REFERENCE_CUTOUT, left + PANEL_W + 20],
    ];
    for (const [label, key, x] of panels) {
      this.add.graphics().fillStyle(0x2c1a3d, 1).fillRoundedRect(x, top, PANEL_W, h, 18);
      this.add.image(x + PANEL_W / 2, top + h / 2, key).setScale(SCALE);
      this.add.text(x + PANEL_W / 2, top + h + 30, label, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    }

    // 同じ大きさで重ねて見る(下: 元画像 / 上: ゲーム表示を少し透かす)
    const y2 = top + h + 90;
    this.add.text(width / 2, y2, '重ねた表示（ずれがなければ一致）', { fontFamily: FONT, fontSize: '22px', color: '#d9c8ff' }).setOrigin(0.5);
    const cx = width / 2;
    const cy = y2 + 30 + h / 2;
    this.add.graphics().fillStyle(0x2c1a3d, 1).fillRoundedRect(cx - PANEL_W / 2, cy - h / 2, PANEL_W, h, 18);
    this.add.image(cx, cy, REFERENCE_ORIGINAL).setScale(SCALE);
    const over = this.add.image(cx, cy, REFERENCE_CUTOUT).setScale(SCALE);
    this.tweens.add({ targets: over, alpha: 0, duration: 900, yoyo: true, repeat: -1, hold: 600, repeatDelay: 600 });
  }
}
