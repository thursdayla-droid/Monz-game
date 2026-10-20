import { cardRank, cardSuit, isRed, RANK_LABELS, SUIT_MARKS, type CardId } from '../core/monzCard';
import { mulberry32, range } from '../core/rng';
import { COLORS, INK, roundRectPath, speckle, splat, UI_FONT } from './paint';

/**
 * MONZ CARD の絵(プログラムで描く)。【仮】企画者の画像が届いたら、背景・ロゴ・カードの裏・キャラクターは差しかえる。
 * カードの表(数字とマーク)は、このままプログラムで描く。
 */
/** 企画者の絵(design/minigame/ → make_card_assets.py で切り抜き) */
export const CARD_IMAGES = {
  'cardimg:title': 'card_title.webp',
  'cardimg:logo': 'card_logo.webp',
  'cardimg:back': 'card_back.webp',
  'cardimg:deck': 'card_deck.webp',
  'cardimg:bg': 'card_bg.webp',
  'cardimg:clearMonz': 'card_clear_monz.webp',
  'cardimg:overMonz': 'card_over_monz.webp',
} as const;

export const CARD_W = 220;
export const CARD_H = 310;
const RED = '#e8243c';

/** カードの表(古い紙のような白に、太い黒の輪郭) */
export function drawCardFace(ctx: CanvasRenderingContext2D, c: CardId): void {
  const w = CARD_W;
  const h = CARD_H;
  const rng = mulberry32(c + 3);
  roundRectPath(ctx, 6, 6, w - 12, h - 12, 22);
  ctx.fillStyle = '#fbf3e2';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 紙のしみ
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(150,110,60,${range(rng, 0.03, 0.07)})`;
    ctx.beginPath();
    ctx.ellipse(range(rng, 0, w), range(rng, 0, h), range(rng, 20, 60), range(rng, 10, 40), range(rng, 0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  roundRectPath(ctx, 6, 6, w - 12, h - 12, 22);
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const color = isRed(c) ? RED : INK;
  const label = RANK_LABELS[cardRank(c) - 1];
  const mark = SUIT_MARKS[cardSuit(c)];
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `900 ${label.length > 1 ? 64 : 74}px "Arial Black", Impact, sans-serif`;
  ctx.fillText(label, 22, 16);
  // まん中の大きなマーク
  ctx.font = `900 150px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, w / 2 + 6, h * 0.6);
  // 右下の小さなマーク
  ctx.font = `900 54px ${UI_FONT}`;
  ctx.fillText(mark, w - 44, h - 46);
}

/** カードの裏。企画者の絵(img)があれば、それをカードの大きさに収めて描く。なければ仮の絵(青に王冠) */
export function drawCardBack(ctx: CanvasRenderingContext2D, img?: CanvasImageSource & { width: number; height: number }): void {
  const w = CARD_W;
  const h = CARD_H;
  if (img) {
    const k = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
    return;
  }
  roundRectPath(ctx, 6, 6, w - 12, h - 12, 22);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2f6fff');
  g.addColorStop(1, '#173aa8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  for (let i = -h; i < w + h; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - h, h);
    ctx.stroke();
  }
  ctx.restore();
  roundRectPath(ctx, 22, 22, w - 44, h - 44, 14);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#9cc4ff';
  ctx.stroke();
  roundRectPath(ctx, 6, 6, w - 12, h - 12, 22);
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 王冠
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-50, 30);
  ctx.lineTo(-56, -26);
  ctx.lineTo(-24, 0);
  ctx.lineTo(0, -38);
  ctx.lineTo(24, 0);
  ctx.lineTo(56, -26);
  ctx.lineTo(50, 30);
  ctx.closePath();
  ctx.fillStyle = COLORS.yellow;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** テーブル(路地裏のレンガの壁と石の床、少し暗め) */
export function drawCardTable(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = mulberry32(77);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#20263a');
  g.addColorStop(0.5, '#2c2a3d');
  g.addColorStop(1, '#3a2f2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  for (let y = 0; y < h * 0.62; y += 56) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    for (let x = (y / 56) % 2 ? 0 : 70; x < w; x += 140) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 56);
      ctx.stroke();
    }
  }
  // 床
  ctx.fillStyle = 'rgba(120,90,60,0.25)';
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  for (let i = 0; i < 9; i++) splat(ctx, range(rng, 0, w), range(rng, 0, h), range(rng, 16, 40), [COLORS.blue, COLORS.orange, COLORS.yellow][i % 3], rng);
  // 王冠の落書き
  ctx.strokeStyle = 'rgba(255,210,58,0.5)';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.5);
  ctx.lineTo(w * 0.1, h * 0.44);
  ctx.lineTo(w * 0.14, h * 0.48);
  ctx.lineTo(w * 0.18, h * 0.43);
  ctx.lineTo(w * 0.2, h * 0.5);
  ctx.stroke();
  speckle(ctx, 0, 0, w, h, 500, rng);
}

/** グラフィティ風の文字(太い黒ふち + 色) */
export function drawGraffitiText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, fill: string, size: number, tilt = -0.06): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(tilt);
  ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let i = 8; i > 0; i--) {
    ctx.fillStyle = INK;
    ctx.fillText(text, i * 0.8, i);
  }
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
