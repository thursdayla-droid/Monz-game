import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { mulberry32 } from '../core/rng';
import { canvasTexture, COLORS, INK, splat, UI_FONT } from './paint';

/**
 * 誕生したMONZの名前の表示(ストリートの落書き風)。
 * スプレーの飛び散り、ななめの太い名前(立体的な影と、したたり)、「NEW MONZ」のテープ、「キミの相棒」のステッカー。
 */
const NAME_W = 680;
const NAME_H = 260;

function drawSpray(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = mulberry32(77);
  splat(ctx, w * 0.3, h * 0.5, 120, COLORS.purple, rng, false);
  splat(ctx, w * 0.68, h * 0.45, 105, COLORS.orange, rng, false);
  splat(ctx, w * 0.5, h * 0.62, 70, COLORS.pink, rng, false);
}

function drawName(ctx: CanvasRenderingContext2D, w: number, h: number, name: string): void {
  const rng = mulberry32(88);
  let size = 190;
  ctx.font = `900 ${size}px ${UI_FONT}`;
  while (ctx.measureText(name).width > w - 120 && size > 60) {
    size -= 4;
    ctx.font = `900 ${size}px ${UI_FONT}`;
  }
  const tw = ctx.measureText(name).width;
  ctx.save();
  // ななめに傾ける
  ctx.translate(w / 2, h / 2 + size * 0.05);
  ctx.transform(1, -0.06, -0.18, 1, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  // 立体的な影(右下へ重ねる)
  for (let i = 14; i > 0; i--) {
    ctx.fillStyle = i > 10 ? INK : '#3a1466';
    ctx.fillText(name, i * 0.9, i);
  }
  // したたり
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, '#fff27a');
  g.addColorStop(0.45, COLORS.orange);
  g.addColorStop(1, COLORS.pink);
  for (let i = 0; i < 7; i++) {
    const x = -tw / 2 + 20 + rng() * (tw - 40);
    const len = 20 + rng() * 50;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 8, size * 0.32, 16, len + 4);
    ctx.beginPath();
    ctx.arc(x, size * 0.32 + len + 4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pink;
    ctx.fillRect(x - 4, size * 0.3, 8, len);
    ctx.beginPath();
    ctx.arc(x, size * 0.3 + len, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // 太い黒の輪郭 → 色 → 光のすじ
  ctx.lineWidth = size * 0.17;
  ctx.strokeStyle = INK;
  ctx.strokeText(name, 0, 0);
  ctx.fillStyle = g;
  ctx.fillText(name, 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(name, -2, -3);
  // きらっ
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [[tw / 2 + 14, -size * 0.42, 16], [-tw / 2 - 6, size * 0.2, 10]] as const) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? r * 0.3 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTape(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(6, 8);
  for (let x = 6; x <= w - 6; x += 12) ctx.lineTo(x, 6 + ((x / 12) % 2 ? 3 : 0));
  ctx.lineTo(w - 2, h / 2);
  ctx.lineTo(w - 6, h - 6);
  for (let x = w - 6; x >= 6; x -= 12) ctx.lineTo(x, h - 6 - ((x / 12) % 2 ? 3 : 0));
  ctx.lineTo(2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.font = `900 ${h * 0.5}px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText('★ NEW MONZ ★', w / 2, h / 2 + 2);
}

/** 角の丸い四角(古いiPhoneでも使えるように自前で描く) */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSticker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  const r = 18;
  rr(ctx, 8, 8, w - 16, h - 16, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.pink;
  rr(ctx, 16, 16, w - 32, h - 32, r - 6);
  ctx.fill();
  ctx.font = `900 ${h * 0.4}px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeText('キミの相棒！', w / 2, h / 2 + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('キミの相棒！', w / 2, h / 2 + 2);
}

export interface Nameplate {
  root: Phaser.GameObjects.Container;
  /** 誕生の瞬間の出し方(スプレー → 名前がドン → テープ → ステッカー) */
  reveal(): void;
  /** 画面の上に小さく移す(ホームの名前表示) */
  dock(animate: boolean): void;
}

export function createNameplate(scene: Phaser.Scene, name: string, x: number, y: number): Nameplate {
  const key = (k: string) => `nameplate:${name}:${k}`;
  canvasTexture(scene, key('spray'), NAME_W, NAME_H + 60, (ctx) => drawSpray(ctx, NAME_W, NAME_H + 60));
  canvasTexture(scene, key('name'), NAME_W, NAME_H, (ctx) => drawName(ctx, NAME_W, NAME_H, name));
  canvasTexture(scene, key('tape'), 330, 62, (ctx) => drawTape(ctx, 330, 62));
  canvasTexture(scene, key('sticker'), 260, 84, (ctx) => drawSticker(ctx, 260, 84));
  const root = scene.add.container(x, y).setDepth(8);
  const spray = scene.add.image(0, 10, key('spray'));
  const nameImg = scene.add.image(0, 0, key('name'));
  const tape = scene.add.image(-150, -118, key('tape')).setAngle(-7);
  const sticker = scene.add.image(170, 112, key('sticker')).setAngle(6);
  root.add([spray, nameImg, tape, sticker]);

  const reveal = () => {
    spray.setScale(0);
    nameImg.setScale(3).setAlpha(0);
    tape.setX(-700).setAlpha(1);
    sticker.setScale(0);
    scene.tweens.add({ targets: spray, scale: 1, duration: 260, delay: 150, ease: 'Back.easeOut', onStart: () => audio.se('spray') });
    scene.tweens.add({
      targets: nameImg,
      scale: 1,
      alpha: 1,
      duration: 200,
      delay: 380,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        audio.se('slam');
        scene.cameras.main.shake(220, 0.01);
        scene.tweens.add({ targets: nameImg, scaleX: 1.08, scaleY: 0.92, duration: 70, yoyo: true });
      },
    });
    scene.tweens.add({ targets: tape, x: -150, duration: 280, delay: 760, ease: 'Back.easeOut', onStart: () => audio.se('next') });
    scene.tweens.add({ targets: sticker, scale: 1, duration: 300, delay: 1050, ease: 'Back.easeOut', onStart: () => audio.se('select') });
    scene.tweens.add({ targets: nameImg, y: -6, duration: 900, delay: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  };

  const dock = (animate: boolean) => {
    const to = { x: scene.scale.width / 2, y: 128, scale: 0.6 };
    if (animate) {
      scene.tweens.add({ targets: root, ...to, duration: 600, ease: 'Cubic.easeInOut' });
      scene.tweens.add({ targets: sticker, alpha: 0, duration: 300 });
    } else {
      root.setPosition(to.x, to.y).setScale(to.scale);
      sticker.setAlpha(0);
    }
  };

  return { root, reveal, dock };
}
