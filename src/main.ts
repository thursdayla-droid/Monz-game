import * as Phaser from 'phaser';
import './debug';
import { BootScene } from './scenes/BootScene';
import { BunkPartsScene } from './scenes/BunkPartsScene';
import { CompareScene } from './scenes/CompareScene';
import { GalleryScene } from './scenes/GalleryScene';

new Phaser.Game({
  // ?canvas を付けるとCanvas描画で動かす(表示がおかしいときの確認用)
  type: new URLSearchParams(location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1024',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  // 1回の描画で使うテクスチャを1枚に限定する。複数枚にすると一部の環境でパーツが欠けて描かれたため。
  // 個体ごとにパーツを1枚にまとめているので、描画回数はほとんど増えない。
  render: { antialias: true, maxTextures: 1 },
  scene: [BootScene, CompareScene, BunkPartsScene, GalleryScene],
});
