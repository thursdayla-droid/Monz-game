import * as Phaser from 'phaser';
import { PART_NAMES } from '../render/bunkRig';
import { sourceKey } from '../render/monzTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'よみこみ中…', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`よみこみ中… ${Math.round(v * 100)}%`));
    for (const part of PART_NAMES) this.load.image(sourceKey(part), `assets/bunk/${part}.png`);
  }

  create(): void {
    this.scene.start('Gallery');
  }
}
