import * as Phaser from 'phaser';
import { audio } from './audio/engine';
import './debug';
import { AutoBattleScene } from './scenes/AutoBattleScene';
import { BattleScene } from './scenes/BattleScene';
import { Battle3DScene } from './scenes/Battle3DScene';
import { RumbleModeScene, RumbleStoryScene } from './scenes/RumbleScenes';
import { BootScene } from './scenes/BootScene';
import { BunkPartsScene } from './scenes/BunkPartsScene';
import { CompareScene } from './scenes/CompareScene';
import { BirthScene } from './scenes/BirthScene';
import { HomeScene } from './scenes/HomeScene';
import { MinigameSelectScene } from './scenes/MinigameSelectScene';
import { CardTitleScene } from './scenes/CardTitleScene';
import { MythTitleScene } from './scenes/MythTitleScene';
import { BattleMenuScene } from './scenes/BattleMenuScene';
import { MythPackScene } from './scenes/MythPackScene';
import { BinderScene } from './scenes/BinderScene';
import { MythBattleScene } from './scenes/MythBattleScene';
import { MythGuideScene } from './scenes/MythGuideScene';
import { MythDeckScene } from './scenes/MythDeckScene';
import { MythModeScene } from './scenes/MythModeScene';
import { MythTowerScene } from './scenes/MythTowerScene';
import { MythFloorScene } from './scenes/MythFloorScene';
import { CardPlayScene } from './scenes/CardPlayScene';
import { DashScene } from './scenes/DashScene';
import { SluggerScene } from './scenes/SluggerScene';
import { QuestionScene } from './scenes/QuestionScene';
import { RoomSelectScene } from './scenes/RoomSelectScene';
import { ShopScene } from './scenes/ShopScene';
import { AdventureScene } from './scenes/AdventureScene';
import { SplashScene } from './scenes/SplashScene';
import { TitleScene } from './scenes/TitleScene';
import { fillTall } from './ui/viewport';

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
  scene: [BootScene, SplashScene, TitleScene, QuestionScene, BirthScene, RoomSelectScene, HomeScene, ShopScene, MinigameSelectScene, CardTitleScene, CardPlayScene, DashScene, SluggerScene, BattleMenuScene, AutoBattleScene, Battle3DScene, RumbleModeScene, RumbleStoryScene, AdventureScene, BattleScene, MythTitleScene, MythPackScene, BinderScene, MythBattleScene, MythDeckScene, MythModeScene, MythTowerScene, MythFloorScene, MythGuideScene, CompareScene, BunkPartsScene],
});

// 2026-11-08 ホーム画面から 開いた 時(iPhone): 画面の 高さが 時計・電池の ぶん 短く 計られ、下に すき間が できる → 画面 そのものの 大きさに する
function fitStandalone(): void {
  const el = document.getElementById('game');
  if (!el || !(navigator as { standalone?: boolean }).standalone) return;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const sw = Math.min(screen.width, screen.height);
  const sh = Math.max(screen.width, screen.height);
  el.style.width = `${portrait ? sw : sh}px`;
  el.style.height = `calc(${portrait ? sh : sw}px - env(safe-area-inset-top))`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  game.scale.refresh();
}
fitStandalone();
window.addEventListener('resize', () => setTimeout(fitStandalone, 50));
window.addEventListener('orientationchange', () => setTimeout(fitStandalone, 300));

// 2026-11-08 企画者「全画面がいい」: たての 画面を スマホの 形まで のばす(背景を 広げる)
game.events.once(Phaser.Core.Events.READY, () => {
  for (const s of game.scene.scenes) s.events.on(Phaser.Scenes.Events.CREATE, () => fillTall(s));
});

// 開発中だけ、確認用にゲームを外から触れるようにする
if (import.meta.env.DEV) Object.assign(window, { __monzGame: game, __monzAudio: audio });
