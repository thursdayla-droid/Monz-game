import * as Phaser from 'phaser';
import { PART_NAMES } from '../render/bunkRig';
import { sourceKey } from '../render/monzTextures';
import { loadBunkParts } from '../render/bunkParts';
import { REFERENCE_CUTOUT, REFERENCE_FILES, REFERENCE_ORIGINAL } from './CompareScene';

/** ?gallery を付けると、前の試作0(色違い6体)の画面を開く。今は確認対象外 */
const SHOW_GALLERY = new URLSearchParams(location.search).has('gallery');
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
    this.load.image(REFERENCE_ORIGINAL, REFERENCE_FILES.original);
    this.load.image(REFERENCE_CUTOUT, REFERENCE_FILES.cutout);
    loadBunkParts(this.load);
    if (!SHOW_GALLERY) return;
    // 【仮】パーツ分けの画像は元画像と形が違うため、正式素材として使わない(design/bunk/README.md)
    for (const part of PART_NAMES) this.load.image(sourceKey(part), `assets/bunk/${part}.png`);
  }

  create(): void {
    this.scene.start(SHOW_GALLERY ? 'Gallery' : SHOW_PARTS ? 'BunkParts' : 'Compare');
  }
}
