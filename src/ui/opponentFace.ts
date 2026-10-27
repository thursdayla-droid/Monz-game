import type * as Phaser from 'phaser';
import type { Opponent } from '../core/mythclash/opponents';
import { canvasTextureOnce } from './paint';

/**
 * 対戦相手の顔(丸い枠)。企画者 2026-10-27: 戦う前と、戦っている時に 相手の顔を出す。
 * 顔の絵は企画者が用意する(public/assets/mythclash/opponents/<id>.webp)。届いた絵の id を OPPONENT_ART に足す。
 * 絵がまだ無い相手は、影の絵(プログラムで描いたもの)【仮】
 */
export const OPPONENT_ART: readonly string[] = ['t1-1', 't1-2', 't1-3', 't2-1', 't2-2', 't2-3', 't3-1', 't3-2', 't3-3', 't4-1', 't4-2', 't4-3'];
export const opponentArtKey = (id: string) => `myth:opp:${id}`;
export const opponentArtFile = (id: string) => `assets/mythclash/opponents/${id}.webp`;

/** 丸い顔の絵(半径 r)を作って、その名前を返す */
export function opponentFaceTexture(scene: Phaser.Scene, op: Opponent, r: number, boss = false): string {
  const size = Math.ceil(r * 2);
  const art = scene.textures.exists(opponentArtKey(op.id)) ? (scene.textures.get(opponentArtKey(op.id)).getSourceImage() as HTMLImageElement) : null;
  return canvasTextureOnce(scene, `myth:face:${op.id}:${size}:${art ? 1 : 0}`, size, size, (ctx) => {
    const c = size / 2;
    const ring = Math.max(3, size * 0.05);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - ring / 2, 0, Math.PI * 2);
    ctx.clip();
    if (art) {
      // 絵の上の方(顔)を中心に、丸をおおうように
      const s = Math.max(size / art.width, size / art.height);
      ctx.drawImage(art, (size - art.width * s) / 2, 0, art.width * s, art.height * s);
    } else {
      // 影の絵: 暗い赤の背景に、黒い人の形
      const g = ctx.createRadialGradient(c, c * 0.8, 0, c, c, c);
      g.addColorStop(0, boss ? '#a8202a' : '#6a2030');
      g.addColorStop(1, '#16060a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#050204';
      ctx.beginPath();
      ctx.arc(c, c * 0.78, c * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c, c * 1.75, c * 0.8, c * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      // 目が光る
      ctx.fillStyle = boss ? '#ff4a3a' : '#ff9a5a';
      ctx.beginPath();
      ctx.arc(c - c * 0.13, c * 0.78, c * 0.045, 0, Math.PI * 2);
      ctx.arc(c + c * 0.13, c * 0.78, c * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = boss ? '#ff6a3a' : '#d8a64a';
    ctx.lineWidth = ring;
    ctx.beginPath();
    ctx.arc(c, c, c - ring / 2, 0, Math.PI * 2);
    ctx.stroke();
  });
}
