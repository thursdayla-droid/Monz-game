import * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';
import { loadBunk } from '../render/bunkView';
import { REFERENCE_CUTOUT, REFERENCE_FILES, REFERENCE_ORIGINAL } from './CompareScene';

/** ?parts を付けると、元画像のパーツで組み立てたBUNKの確認画面を開く */
const SHOW_PARTS = new URLSearchParams(location.search).has('parts');

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'よみこみ中…', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`よみこみ中… ${Math.round(v * 100)}%`));
    this.load.image(REFERENCE_ORIGINAL, assetUrl(REFERENCE_FILES.original));
    this.load.image(REFERENCE_CUTOUT, assetUrl(REFERENCE_FILES.cutout));
    loadBunk(this.load);
  }

  create(): void {
    this.scene.start(SHOW_PARTS ? 'BunkParts' : 'Compare');
  }
}
