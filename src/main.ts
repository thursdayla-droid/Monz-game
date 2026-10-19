import * as Phaser from 'phaser';
import { audio } from './audio/engine';
import './debug';
import { BootScene } from './scenes/BootScene';
import { BunkPartsScene } from './scenes/BunkPartsScene';
import { CompareScene } from './scenes/CompareScene';
import { BirthScene } from './scenes/BirthScene';
import { HomeScene } from './scenes/HomeScene';
import { QuestionScene } from './scenes/QuestionScene';
import { SplashScene } from './scenes/SplashScene';
import { TitleScene } from './scenes/TitleScene';

const game = new Phaser.Game({
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
  render: { antialias: true, maxTextures: 1 },
  scene: [BootScene, SplashScene, TitleScene, QuestionScene, BirthScene, HomeScene, CompareScene, BunkPartsScene],
});

// 開発中だけ、確認用にゲームを外から触れるようにする
if (import.meta.env.DEV) Object.assign(window, { __monzGame: game, __monzAudio: audio });
