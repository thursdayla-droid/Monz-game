import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { cardZoomTexture } from './mythCardArt';
import { UI_FONT } from './paint';

/**
 * MYTHCLASH のカードを大きく見る(さわると閉じる)。パックの結果・バトル画面で使う(企画者 2026-10-26)。
 * texture: カードの絵(相手のカードは、魔法をかくした絵を渡す)。lines: カードの下に出す文(HP・状態など)
 */
export function showCardZoom(scene: Phaser.Scene, texture: string, lines: string[] = [], onClose?: () => void): void {
  const { width: W, height: H } = scene.scale;
  audio.se('tap');
  const box = scene.add.container(0, 0).setDepth(500);
  const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0, 0).setInteractive();
  const textH = lines.length ? 70 + lines.length * 40 : 40;
  // 企画者のカードの絵があれば、くっきりした大きい絵で見せる(2026-10-27)
  const key = cardZoomTexture(scene, texture);
  const frame = scene.textures.getFrame(key);
  const cw = frame.width;
  const ch = frame.height;
  const s = Math.min((W * 0.86) / cw, (H - textH - 40) / ch);
  const cy = (H - textH) / 2 + 10;
  const img = scene.add.image(W / 2, cy, key).setScale(s * 0.6);
  box.add([dim, img]);
  lines.forEach((l, i) => {
    box.add(scene.add.text(W / 2, cy + (ch * s) / 2 + 40 + i * 40, l, { fontFamily: UI_FONT, fontSize: `${Math.round(30 * Math.max(1, H / 1280))}px`, fontStyle: '900', color: '#ffffff', align: 'center' }).setOrigin(0.5));
  });
  scene.tweens.add({ targets: img, scale: s, duration: 200, ease: 'Back.easeOut' });
  scene.time.delayedCall(200, () =>
    dim.once('pointerdown', () => {
      audio.se('back');
      box.destroy();
      onClose?.();
    }),
  );
}
