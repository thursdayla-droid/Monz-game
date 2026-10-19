import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { VOLUME_STEPS } from '../audio/settings';
import { UI_FONT } from './paint';

const DEPTH = 50;

/**
 * 画面の隅に置く「音」ボタン。押すと音の設定(BGM・効果音の音量)を開く。
 * iPhone では、このボタンを押したときにも音を出せる状態にする。
 */
export function addSoundButton(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const btn = scene.add.container(x, y).setDepth(DEPTH);
  const g = scene.add.graphics();
  const draw = () => {
    g.clear();
    const on = audio.settings.bgm > 0 || audio.settings.se > 0;
    g.fillStyle(0x16101c, 0.8).fillCircle(0, 0, 38);
    g.lineStyle(5, 0xffd23a, 1).strokeCircle(0, 0, 38);
    // スピーカー
    g.fillStyle(0xffffff, 1);
    g.fillRect(-18, -9, 10, 18);
    g.fillTriangle(-8, -9, 6, -20, 6, 20);
    g.fillTriangle(-8, -9, -8, 9, 6, 20);
    if (on) {
      g.lineStyle(4, 0xffffff, 1);
      g.beginPath();
      g.arc(8, 0, 10, -0.9, 0.9);
      g.strokePath();
      g.beginPath();
      g.arc(8, 0, 18, -0.9, 0.9);
      g.strokePath();
    } else {
      g.lineStyle(5, 0xff4fa3, 1).lineBetween(12, -10, 28, 10).lineBetween(28, -10, 12, 10);
    }
  };
  draw();
  btn.add(g);
  btn.setSize(84, 84).setInteractive({ useHandCursor: true });
  btn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    audio.unlock();
    audio.se('tap');
    openSoundSettings(scene, draw);
  });
  return btn;
}

/** 音の設定(BGM・効果音の音量)を開く。お世話画面の「設定」ボタンからも使う */
export function openSoundSettings(scene: Phaser.Scene, onChange: () => void = () => {}): void {
  const { width, height } = scene.scale;
  const layer = scene.add.container(0, 0).setDepth(DEPTH + 1);
  const shade = scene.add.rectangle(0, 0, width, height, 0x0d0614, 0.7).setOrigin(0, 0).setInteractive();
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
  layer.add(shade);
  const pw = 600;
  const ph = 470;
  const px = (width - pw) / 2;
  const py = (height - ph) / 2;
  const panel = scene.add.graphics();
  panel.fillStyle(0xfbf1dc, 1).fillRoundedRect(px, py, pw, ph, 28);
  panel.lineStyle(9, 0x16101c, 1).strokeRoundedRect(px, py, pw, ph, 28);
  layer.add(panel);
  const label = (tx: number, ty: number, s: string, size: number, color = '#16101c') =>
    scene.add.text(tx, ty, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color }).setOrigin(0.5);
  layer.add(label(width / 2, py + 56, '音の設定', 44));

  const row = (kind: 'bgm' | 'se', name: string, ry: number) => {
    layer.add(label(px + 100, ry, name, 34));
    const bars = scene.add.graphics();
    const redraw = () => {
      bars.clear();
      const v = audio.settings[kind];
      for (let i = 0; i < VOLUME_STEPS; i++) {
        bars.fillStyle(i < v ? 0xff8a1f : 0xd9c7a0, 1).fillRoundedRect(px + 250 + i * 22, ry - 8 - i * 2.4, 16, 16 + i * 4.8, 4);
      }
    };
    redraw();
    layer.add(bars);
    const step = (sx: number, s: string, d: number) => {
      const b = label(sx, ry, s, 48, '#ffffff').setPadding(18, 0, 18, 4).setBackgroundColor('#8a35e0').setInteractive({ useHandCursor: true });
      b.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        audio.setVolume(kind, Math.max(0, Math.min(VOLUME_STEPS, audio.settings[kind] + d)));
        redraw();
        onChange();
        audio.se(kind === 'se' ? 'select' : 'tap');
      });
      layer.add(b);
    };
    step(px + 210, '−', -1);
    step(px + pw - 50, '+', 1);
  };
  row('bgm', 'BGM', py + 160);
  row('se', '効果音', py + 270);

  const close = label(width / 2, py + ph - 70, '  とじる  ', 38).setBackgroundColor('#ffd23a').setPadding(20, 10, 20, 12).setInteractive({ useHandCursor: true });
  close.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    audio.se('tap');
    layer.destroy();
  });
  layer.add(close);
}
