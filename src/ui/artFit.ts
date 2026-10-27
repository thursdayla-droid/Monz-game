import type * as Phaser from 'phaser';
import { canvasTextureOnce } from './paint';

/**
 * 縦長の絵を、画面の中に全部入れる(はしを切らない)ための置き方。
 * 企画者 2026-10-27「タワーの絵と進行画面、画面内に収まってない」→ 画面より大きくしない。
 * 絵の入らない すき間には、同じ絵をぼかして暗くしたものをしく
 */
export function fitArt(scene: Phaser.Scene, key: string, art: { w: number; h: number }, size: { w: number; h: number }): { k: number; ox: number; oy: number } {
  const k = Math.min(size.w / art.w, size.h / art.h);
  const ox = (size.w - art.w * k) / 2;
  const oy = (size.h - art.h * k) / 2;
  if (ox > 0.5 || oy > 0.5) {
    const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
    const bg = canvasTextureOnce(scene, `${key}:backdrop:${size.w}x${size.h}`, size.w, size.h, (ctx) => {
      // 小さくしてから大きくすると、ぼける(ctx.filter が使えない古い Safari でも同じに見える)
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(size.w / 24));
      small.height = Math.max(1, Math.round(size.h / 24));
      const s = small.getContext('2d')!;
      const c = Math.max(small.width / art.w, small.height / art.h);
      s.drawImage(src, (small.width - art.w * c) / 2, (small.height - art.h * c) / 2, art.w * c, art.h * c);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, size.w, size.h);
      ctx.fillStyle = 'rgba(8,2,4,0.55)';
      ctx.fillRect(0, 0, size.w, size.h);
    });
    scene.add.image(0, 0, bg).setOrigin(0, 0);
  }
  scene.add.image(ox, oy, key).setOrigin(0, 0).setScale(k);
  return { k, ox, oy };
}
