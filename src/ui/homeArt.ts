import { mulberry32, range } from '../core/rng';
import type { HomeAction } from '../core/home';
import { COLORS, INK, roundRectPath, splat } from './paint';

/**
 * ホーム(育てる画面)の絵を Canvas 2D で描く。
 */

/** 下のメニューのボタン(参考画像のような、クリーム色のカードに太い輪郭)。ready=false なら「SOON」のシールを貼る */
export function drawMenuButton(ctx: CanvasRenderingContext2D, w: number, h: number, action: HomeAction, label: string, ready: boolean, seed: number, icon?: CanvasImageSource): void {
  const rng = mulberry32(seed);
  const m = 5;
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 18);
  ctx.fillStyle = '#fbf1dc';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // ふちの絵の具の飛び散り
  for (let i = 0; i < 3; i++) splat(ctx, range(rng, 0, w), range(rng, 0, h) < h / 2 ? range(rng, -6, 10) : range(rng, h - 10, h + 6), range(rng, 8, 16), [COLORS.orange, COLORS.purple, COLORS.pink, COLORS.blue][i % 4], rng, false);
  ctx.restore();
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 18);
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 企画者のアイコン画像があればそれを、なければ仮の絵を描く
  if (icon) {
    const s = Math.min(w - 18, h * 0.6);
    ctx.drawImage(icon, (w - s) / 2, h * 0.37 - s / 2, s, s);
  } else drawIcon(ctx, action, w / 2, h * 0.4, Math.min(w, h) * 0.26);
  const size = label.length > 4 ? 19 : 23;
  ctx.font = `900 ${size}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(label, w / 2, h * 0.81);
  if (!ready) {
    ctx.save();
    ctx.translate(w - 26, 20);
    ctx.rotate(0.25);
    ctx.fillStyle = COLORS.yellow;
    roundRectPath(ctx, -26, -11, 52, 22, 5);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `900 13px "Arial Black", Impact, sans-serif`;
    ctx.fillText('SOON', 0, 1);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

/** 【仮】メニューのアイコン(企画者のアイコン画像を読み込めなかったときの代わり。なでる手の動きにも使う) */
export function drawIcon(ctx: CanvasRenderingContext2D, action: HomeAction | 'pet', x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(3, s * 0.12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffffff';
  if (action === 'food') {
    drawBowl(ctx, 0, s * 0.15, s * 1.7);
  } else if (action === 'pet') {
    // 手のひらとハート
    ctx.fillStyle = '#ffd9b8';
    ctx.beginPath();
    ctx.ellipse(-s * 0.1, s * 0.3, s * 0.55, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const fx = -s * 0.1 + (i - 1.5) * s * 0.3;
      roundRectPath(ctx, fx - s * 0.13, -s * 0.65 + Math.abs(i - 1.5) * s * 0.15, s * 0.26, s * 0.8, s * 0.13);
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(s * 0.75, -s * 0.6);
    ctx.scale(s * 0.012, s * 0.012);
    heartPath(ctx, 26);
    ctx.fillStyle = COLORS.pink;
    ctx.fill();
    ctx.restore();
  } else if (action === 'status') {
    // 【仮】ステータス: 棒グラフと星
    const bars = [0.5, 0.85, 0.65];
    bars.forEach((h, i) => {
      ctx.fillStyle = [COLORS.orange, COLORS.purple, COLORS.blue][i];
      const bx = -s * 0.8 + i * s * 0.55;
      roundRectPath(ctx, bx, s * 0.8 - h * s * 1.4, s * 0.42, h * s * 1.4, s * 0.08);
      ctx.fill();
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? s * 0.18 : s * 0.4;
      ctx.lineTo(s * 0.62 + Math.cos(a) * r, -s * 0.62 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (action === 'minigame') {
    // コントローラー
    ctx.fillStyle = COLORS.purple;
    roundRectPath(ctx, -s, -s * 0.5, s * 2, s, s * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.65, -s * 0.08, s * 0.5, s * 0.16);
    ctx.fillRect(-s * 0.48, -s * 0.25, s * 0.16, s * 0.5);
    ctx.fillStyle = COLORS.pink;
    ctx.beginPath();
    ctx.arc(s * 0.45, -s * 0.1, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.arc(s * 0.7, s * 0.12, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  } else if (action === 'battle') {
    // 交差した2本の剣
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.rotate(dir * 0.75);
      ctx.fillStyle = '#d7dbe8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, s * 0.35);
      ctx.lineTo(-s * 0.12, -s * 0.75);
      ctx.lineTo(0, -s * 0.95);
      ctx.lineTo(s * 0.12, -s * 0.75);
      ctx.lineTo(s * 0.12, s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.orange;
      roundRectPath(ctx, -s * 0.35, s * 0.33, s * 0.7, s * 0.16, s * 0.06);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.purple;
      roundRectPath(ctx, -s * 0.09, s * 0.49, s * 0.18, s * 0.42, s * 0.06);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else if (action === 'shop') {
    // お店(屋根のしま模様)
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(-s * 0.8, -s * 0.2, s * 1.6, s * 1.0);
    ctx.strokeRect(-s * 0.8, -s * 0.2, s * 1.6, s * 1.0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.55, s * 0.05, s * 0.5, s * 0.75);
    ctx.strokeRect(-s * 0.55, s * 0.05, s * 0.5, s * 0.75);
    ctx.fillRect(s * 0.1, s * 0.05, s * 0.45, s * 0.4);
    ctx.strokeRect(s * 0.1, s * 0.05, s * 0.45, s * 0.4);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4f5e';
      ctx.beginPath();
      const x0 = -s + (i * s) / 2;
      ctx.moveTo(x0 + s * 0.2, -s * 0.8);
      ctx.lineTo(x0 + s * 0.7, -s * 0.8);
      ctx.lineTo(x0 + s * 0.5, -s * 0.15);
      ctx.lineTo(x0, -s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // 歯車
    ctx.fillStyle = '#9aa0b4';
    ctx.beginPath();
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? s * 0.68 : s * 0.9;
      const a2 = a + Math.PI / (teeth * 2);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbf1dc';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.85);
  ctx.bezierCurveTo(-s * 1.2, 0, -s * 0.8, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.8, -s * 1.05, s * 1.2, 0, 0, s * 0.85);
  ctx.closePath();
}

/** 【仮】コインのアイコン(半径 r) */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#f5b521';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd95a';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98a0e';
  ctx.font = `900 ${r * 1.1}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', x, y + r * 0.05);
  ctx.textAlign = 'left';
  ctx.restore();
}

/** 上の札(名前・レベルのカード、コインのカード)の下地 */
export function drawPanel(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rng = mulberry32(seed);
  roundRectPath(ctx, 4, 4, w - 8, h - 8, 20);
  ctx.fillStyle = '#fbf1dc';
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 3; i++) splat(ctx, range(rng, 0, w), range(rng, 0, 1) < 0.5 ? range(rng, -4, 8) : range(rng, h - 8, h + 4), range(rng, 8, 14), [COLORS.pink, COLORS.orange, COLORS.purple][i], rng, false);
  ctx.restore();
  roundRectPath(ctx, 4, 4, w - 8, h - 8, 20);
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** ごはん【仮】: 湯気の立つどんぶり。w はどんぶりの幅 */
export function drawBowl(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.save();
  ctx.lineWidth = Math.max(4, w * 0.05);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  // ごはん
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y - w * 0.12, w * 0.42, w * 0.22, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  // おかず
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.12, y - w * 0.22, w * 0.14, w * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.green;
  ctx.beginPath();
  ctx.ellipse(x - w * 0.14, y - w * 0.2, w * 0.1, w * 0.06, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // どんぶり
  ctx.fillStyle = COLORS.blue;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - w * 0.12);
  ctx.lineTo(x + w / 2, y - w * 0.12);
  ctx.quadraticCurveTo(x + w * 0.45, y + w * 0.32, x, y + w * 0.32);
  ctx.quadraticCurveTo(x - w * 0.45, y + w * 0.32, x - w / 2, y - w * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.yellow;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * w * 0.22, y + w * 0.07, w * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * ごはん【仮】: 骨付きの肉(マンガ肉)。bites=0〜3 でかじった跡が増え、3 で骨だけになる。
 * 大きさは 220x150 の中に描く。
 */
export function drawMeat(ctx: CanvasRenderingContext2D, bites: number): void {
  const ink = INK;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 骨(肉の左右につき出る)
  const bone = (x: number, y: number, dir: 1 | -1) => {
    ctx.fillStyle = '#fff6e0';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.rect(x - (dir > 0 ? 0 : 28), y - 9, 28, 18);
    ctx.fill();
    ctx.stroke();
    for (const dy of [-11, 11]) {
      ctx.beginPath();
      ctx.arc(x + dir * 30, y + dy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#fff6e0';
    ctx.fillRect(x + dir * 18 - 6, y - 7, 14, 14);
  };
  if (bites < 3) {
    // 肉のかたまり
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(110, 76, 74, 56, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#b5532c';
    ctx.fill();
    ctx.clip();
    // 焼き色とつや
    ctx.fillStyle = '#d9723c';
    ctx.beginPath();
    ctx.ellipse(100, 62, 58, 36, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.75)';
    ctx.beginPath();
    ctx.ellipse(82, 46, 22, 9, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,30,15,0.6)';
    ctx.lineWidth = 4;
    for (const [x0, y0] of [[120, 92], [140, 70], [96, 100]]) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + 10, y0 - 6, x0 + 20, y0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(110, 76, 74, 56, -0.08, 0, Math.PI * 2);
    ctx.stroke();
    // かじった跡(右上から順に)
    const marks: [number, number][] = [
      [168, 38],
      [176, 92],
      [62, 34],
    ];
    ctx.globalCompositeOperation = 'destination-out';
    for (const [x, y] of marks.slice(0, bites)) {
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.arc(x + k * 13, y + Math.abs(k) * 5, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 骨は肉の後ろに描く(かじった跡からも骨がのぞく)
    ctx.globalCompositeOperation = 'destination-over';
    bone(170, 76, 1);
    bone(50, 76, -1);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    bone(170, 76, 1);
    bone(50, 76, -1);
    // 骨だけ
    ctx.fillStyle = '#fff6e0';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.rect(50, 67, 120, 18);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * ごはん: 企画者の肉の絵(440x285)に、かじった跡(bites=0〜3)をあける。絵そのものは描き直さない。
 * かじる場所は、肉の切り口(左がわ)から順に。
 */
export function drawMeatImage(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, bites: number): void {
  ctx.drawImage(img, 0, 0, w, h);
  const marks: [number, number][] = [
    [0.12, 0.3],
    [0.05, 0.62],
    [0.22, 0.88],
  ];
  ctx.globalCompositeOperation = 'destination-out';
  for (const [mx, my] of marks.slice(0, bites)) {
    // 歯のあと(小さな丸を3つ並べる)
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.arc(mx * w + k * w * 0.07, my * h + Math.abs(k) * h * 0.06, w * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** ハート(なでたとき・食べたときに出す) */
export function drawHeart(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = Math.min(w, h) / 2 - 5;
  ctx.save();
  ctx.translate(w / 2, h / 2 + s * 0.1);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.85);
  ctx.bezierCurveTo(-s * 1.2, 0, -s * 0.8, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.8, -s * 1.05, s * 1.2, 0, 0, s * 0.85);
  ctx.closePath();
  ctx.fillStyle = COLORS.pink;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.4, -s * 0.35, s * 0.15, s * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
