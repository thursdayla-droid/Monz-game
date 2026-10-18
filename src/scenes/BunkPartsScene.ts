import * as Phaser from 'phaser';
import { BUNK_PARTS_MANIFEST, BunkPartsView, type BunkPartsManifest } from '../render/bunkParts';
import { REFERENCE_CUTOUT } from './CompareScene';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
const SCALE = 0.5;

/**
 * 【仮・テスト実装】元画像のパーツで組み立てたBUNKを表示し、呼吸・まばたき・拳の小さな揺れを確かめる画面。
 * URL: ?parts  /  &move で動かした状態から始める  /  &fill で補った場所を表示  /  &original で元画像を表示
 *      &t=秒 でその瞬間の姿で止める(&blink で目を閉じた瞬間)
 */
export class BunkPartsScene extends Phaser.Scene {
  private view!: BunkPartsView;
  private original!: Phaser.GameObjects.Image;
  private status!: Phaser.GameObjects.Text;
  private showFill = false;
  private showOriginal = false;

  constructor() {
    super('BunkParts');
  }

  create(): void {
    const { width } = this.scale;
    const q = new URLSearchParams(location.search);
    const manifest = this.cache.json.get(BUNK_PARTS_MANIFEST) as BunkPartsManifest;
    this.add.text(width / 2, 56, 'BUNK パーツ組み立てテスト', { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(width / 2, 104, '【テスト】完成ではありません。確認後に調整します', { fontFamily: FONT, fontSize: '22px', color: '#d9c8ff' }).setOrigin(0.5);

    const w = manifest.width * SCALE;
    const h = manifest.height * SCALE;
    const left = (width - w) / 2;
    const top = 150;
    this.add.graphics().fillStyle(0x2c1a3d, 1).fillRoundedRect(left - 20, top - 20, w + 40, h + 40, 22);
    this.view = new BunkPartsView(this, left, top, SCALE);
    this.original = this.add.image(left, top, REFERENCE_CUTOUT).setOrigin(0, 0).setScale(SCALE).setVisible(false);

    this.status = this.add.text(width / 2, top + h + 50, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff', align: 'center' }).setOrigin(0.5);

    const by = top + h + 140;
    this.button(width / 2 - 170, by, '動かす／止める', () => {
      this.view.setMoving(this.view.mode !== 'moving');
      this.refresh();
    });
    this.button(width / 2 + 170, by, '補った場所を表示', () => {
      this.showFill = !this.showFill;
      this.view.setShowFill(this.showFill);
      this.refresh();
    });
    this.button(width / 2 - 170, by + 100, '元画像に切りかえ', () => {
      this.showOriginal = !this.showOriginal;
      this.refresh();
    });
    this.button(width / 2 + 170, by + 100, '← 比較画面', () => this.scene.start('Compare'));

    if (q.has('move')) this.view.setMoving(true);
    if (q.has('original')) this.showOriginal = true;
    if (q.has('fill')) {
      this.showFill = true;
      this.view.setShowFill(true);
    }
    const t = q.get('t');
    if (t !== null) this.view.setTime(Number(t), q.has('blink'));
    this.refresh();
  }

  private button(x: number, y: number, label: string, onTap: () => void): void {
    this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#1b1024', backgroundColor: '#ffe14d', padding: { x: 16, y: 12 }, fixedWidth: 300, align: 'center' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onTap);
  }

  private refresh(): void {
    this.original.setVisible(this.showOriginal);
    this.view.setVisible(!this.showOriginal);
    const what = this.showOriginal ? '元画像（背景を消したもの）' : this.view.mode === 'moving' ? 'パーツ：動作中' : this.view.mode === 'frozen' ? `パーツ：${this.view.t}秒目の姿で停止` : 'パーツ：静止中（元画像と同じ姿）';
    this.status.setText(what + (this.showFill && !this.showOriginal ? '\n補った場所をピンクで表示' : ''));
  }

  update(_time: number, delta: number): void {
    this.view.tick(delta / 1000);
  }
}
