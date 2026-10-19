import { mulberry32, range } from '../core/rng';
import type { HomeAction } from '../core/home';
import { COLORS, INK, roundRectPath, speckle, splat } from './paint';

/**
 * ホーム(育てる画面)の絵を Canvas 2D で描く。
 * 【仮】部屋・ガレージの背景は仮の絵。企画者の画像ができたら差しかえる(HomeScene の HOME_IMAGES)。
 */

/** 床と壁の境目(画面の高さに対する割合) */
const FLOOR = 0.66;

/** なにもない部屋: コンクリートの壁、窓、裸電球、木の床 */
export function drawRoom(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 11): void {
  const rng = mulberry32(seed);
  const fy = h * FLOOR;
  // 奥の壁
  const wall = ctx.createLinearGradient(0, 0, 0, fy);
  wall.addColorStop(0, '#8d8aa0');
  wall.addColorStop(1, '#bdb6c4');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, fy);
  // コンクリートのしみ
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(60,50,80,${range(rng, 0.04, 0.1)})`;
    ctx.beginPath();
    ctx.ellipse(range(rng, 0, w), range(rng, 0, fy), range(rng, 30, 110), range(rng, 20, 70), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 窓(夕方の空)
  const wx = w * 0.56;
  const wy = h * 0.2;
  const ww = w * 0.32;
  const wh = h * 0.2;
  const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#ff8a6b');
  sky.addColorStop(1, '#ffd27a');
  ctx.fillStyle = sky;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = '#4a2f66';
  for (let i = 0; i < 6; i++) {
    const bw = range(rng, 22, 44);
    const bh = range(rng, 30, wh * 0.6);
    ctx.fillRect(wx + (i * ww) / 6, wy + wh - bh, bw, bh);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
  // 壁のひび
  ctx.strokeStyle = 'rgba(22,16,28,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  let cx = w * 0.18;
  let cy = h * 0.08;
  ctx.moveTo(cx, cy);
  for (let i = 0; i < 6; i++) {
    cx += range(rng, -18, 18);
    cy += range(rng, 24, 40);
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  // 小さな落書き
  splat(ctx, w * 0.2, h * 0.42, 34, COLORS.pink, rng);
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.36);
  ctx.lineTo(w * 0.15, h * 0.32);
  ctx.lineTo(w * 0.19, h * 0.35);
  ctx.lineTo(w * 0.23, h * 0.31);
  ctx.lineTo(w * 0.26, h * 0.36);
  ctx.stroke();
  // 裸電球
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.36, 0);
  ctx.lineTo(w * 0.36, h * 0.13);
  ctx.stroke();
  const glow = ctx.createRadialGradient(w * 0.36, h * 0.15, 4, w * 0.36, h * 0.15, 160);
  glow.addColorStop(0, 'rgba(255,240,170,0.75)');
  glow.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h * 0.4);
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath();
  ctx.arc(w * 0.36, h * 0.15, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 床(木の板、奥に向かってすぼまる)
  const floor = ctx.createLinearGradient(0, fy, 0, h);
  floor.addColorStop(0, '#8a5a3c');
  floor.addColorStop(1, '#4e2f22');
  ctx.fillStyle = floor;
  ctx.fillRect(0, fy, w, h - fy);
  ctx.strokeStyle = 'rgba(22,16,28,0.4)';
  ctx.lineWidth = 3;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 70, fy);
    ctx.lineTo(w / 2 + i * 210, h);
    ctx.stroke();
  }
  // 壁と床の境目
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, fy);
  ctx.lineTo(w, fy);
  ctx.stroke();
  speckle(ctx, 0, 0, w, h, 300, rng);
}

/** ガレージ: シャッター、工具の板、タイヤ、蛍光灯、コンクリートの床 */
export function drawGarage(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 13): void {
  const rng = mulberry32(seed);
  const fy = h * FLOOR;
  // 壁
  ctx.fillStyle = '#3d4157';
  ctx.fillRect(0, 0, w, fy);
  // シャッター
  const sx = w * 0.1;
  const sw = w * 0.8;
  const sy = h * 0.12;
  const sh = fy - sy;
  const sg = ctx.createLinearGradient(0, sy, 0, fy);
  sg.addColorStop(0, '#a3a9bb');
  sg.addColorStop(1, '#6f7487');
  ctx.fillStyle = sg;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = 'rgba(22,16,28,0.35)';
  ctx.lineWidth = 3;
  for (let y = sy + 18; y < fy; y += 22) {
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + sw, y);
    ctx.stroke();
  }
  // シャッターの落書き
  for (let i = 0; i < 5; i++) splat(ctx, range(rng, sx + 40, sx + sw - 40), range(rng, sy + 60, fy - 40), range(rng, 26, 54), [COLORS.purple, COLORS.orange, COLORS.pink, COLORS.blue, COLORS.yellow][i], rng);
  ctx.save();
  ctx.translate(w / 2, sy + sh * 0.42);
  ctx.rotate(-0.08);
  ctx.font = `900 110px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.strokeText('MONZ', 0, 0);
  ctx.fillStyle = COLORS.orange;
  ctx.fillText('MONZ', 0, 0);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(sx, sy, sw, sh);
  // 蛍光灯
  ctx.fillStyle = '#eafcff';
  roundRectPath(ctx, w * 0.3, h * 0.04, w * 0.4, 22, 11);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.stroke();
  const light = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.35);
  light.addColorStop(0, 'rgba(220,250,255,0.35)');
  light.addColorStop(1, 'rgba(220,250,255,0)');
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.06);
  ctx.lineTo(w * 0.7, h * 0.06);
  ctx.lineTo(w * 0.95, h * 0.35);
  ctx.lineTo(w * 0.05, h * 0.35);
  ctx.closePath();
  ctx.fill();
  // 床
  const floor = ctx.createLinearGradient(0, fy, 0, h);
  floor.addColorStop(0, '#77788a');
  floor.addColorStop(1, '#34323f');
  ctx.fillStyle = floor;
  ctx.fillRect(0, fy, w, h - fy);
  // 油じみ
  ctx.fillStyle = 'rgba(20,14,30,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.72, h * 0.9, 90, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  // 床の線(駐車の線)
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, fy);
  ctx.lineTo(w * 0.12, fy);
  ctx.lineTo(w * -0.02, h);
  ctx.lineTo(w * -0.1, h);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.88, fy);
  ctx.lineTo(w * 0.92, fy);
  ctx.lineTo(w * 1.1, h);
  ctx.lineTo(w * 1.02, h);
  ctx.closePath();
  ctx.fill();
  // タイヤの山(左)
  for (let i = 0; i < 3; i++) {
    const ty = fy + 30 - i * 44;
    ctx.fillStyle = '#1d1a24';
    ctx.beginPath();
    ctx.ellipse(w * 0.1, ty, 70, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.1 - 70, ty - 22, 140, 22);
    ctx.beginPath();
    ctx.ellipse(w * 0.1, ty - 22, 70, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a4656';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(w * 0.1, ty - 22, 34, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // スプレー缶(右)
  for (let i = 0; i < 3; i++) {
    const x = w * 0.84 + i * 30;
    const y = fy + 8 + (i % 2) * 10;
    ctx.fillStyle = [COLORS.pink, COLORS.blue, COLORS.yellow][i];
    roundRectPath(ctx, x, y - 70, 26, 70, 6);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 7, y - 82, 12, 12);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, fy);
  ctx.lineTo(w, fy);
  ctx.stroke();
  speckle(ctx, 0, 0, w, h, 400, rng);
}

/** 下のボタン。ready=false なら「SOON」のシールを貼る */
export function drawActionButton(ctx: CanvasRenderingContext2D, w: number, h: number, action: HomeAction, label: string, ready: boolean, seed: number): void {
  const rng = mulberry32(seed);
  const m = 6;
  const color = { food: COLORS.orange, pet: COLORS.pink, minigame: COLORS.blue, dressup: COLORS.purple }[action];
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 26);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 2; i++) splat(ctx, range(rng, 0, w), range(rng, 0, h), range(rng, 12, 22), i ? COLORS.yellow : '#ffffff', rng, false);
  ctx.restore();
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 26);
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawIcon(ctx, action, w / 2, h * 0.4, h * 0.26);
  ctx.font = `900 ${label.length > 4 ? 22 : 26}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.strokeText(label, w / 2, h * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, w / 2, h * 0.8);
  if (!ready) {
    ctx.save();
    ctx.translate(w - 34, 24);
    ctx.rotate(0.25);
    ctx.fillStyle = COLORS.yellow;
    roundRectPath(ctx, -32, -13, 64, 26, 6);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `900 16px "Arial Black", Impact, sans-serif`;
    ctx.fillText('SOON', 0, 1);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

export function drawIcon(ctx: CanvasRenderingContext2D, action: HomeAction, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffffff';
  if (action === 'food') {
    drawBowl(ctx, 0, s * 0.15, s * 1.6);
  } else if (action === 'pet') {
    // 手のひら
    ctx.beginPath();
    ctx.ellipse(0, s * 0.25, s * 0.55, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * s * 0.3;
      roundRectPath(ctx, fx - s * 0.13, -s * 0.75 + Math.abs(i - 1.5) * s * 0.15, s * 0.26, s * 0.8, s * 0.13);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(s * 0.62, s * 0.15, s * 0.14, s * 0.32, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (action === 'minigame') {
    // コントローラー
    roundRectPath(ctx, -s, -s * 0.5, s * 2, s, s * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
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
  } else {
    // Tシャツ
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, -s * 0.75);
    ctx.lineTo(-s, -s * 0.4);
    ctx.lineTo(-s * 0.72, s * 0.05);
    ctx.lineTo(-s * 0.5, -s * 0.1);
    ctx.lineTo(-s * 0.5, s * 0.8);
    ctx.lineTo(s * 0.5, s * 0.8);
    ctx.lineTo(s * 0.5, -s * 0.1);
    ctx.lineTo(s * 0.72, s * 0.05);
    ctx.lineTo(s, -s * 0.4);
    ctx.lineTo(s * 0.35, -s * 0.75);
    ctx.quadraticCurveTo(0, -s * 0.4, -s * 0.35, -s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.arc(0, s * 0.2, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
