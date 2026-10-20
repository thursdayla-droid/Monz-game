import { mulberry32, range } from '../core/rng';
import { COLORS, INK, roundRectPath, speckle, splat, UI_FONT } from './paint';

/**
 * ミニゲームのセレクト画面の絵。【仮】企画者のデザイン画像が届いたら差しかえる。
 * MONZ CARD などのゲーム画面の絵は使わない(画面を分ける・企画者決定)。
 */

/** 背景: 夜のゲームセンター風の壁(ネオンの光とグラフィティ) */
export function drawArcadeWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = mulberry32(41);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b1024');
  g.addColorStop(0.6, '#2a1640');
  g.addColorStop(1, '#120a1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // レンガ
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 3;
  for (let y = 0; y < h; y += 52) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    for (let x = (y / 52) % 2 ? 0 : 60; x < w; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 52);
      ctx.stroke();
    }
  }
  // ネオンのにじみ
  for (const [x, y, c] of [[w * 0.15, h * 0.2, '255,79,163'], [w * 0.85, h * 0.45, '47,168,255'], [w * 0.3, h * 0.85, '255,138,31']] as const) {
    const r = ctx.createRadialGradient(x, y, 0, x, y, w * 0.6);
    r.addColorStop(0, `rgba(${c},0.28)`);
    r.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 12; i++) splat(ctx, range(rng, 0, w), range(rng, 0, h), range(rng, 18, 46), [COLORS.pink, COLORS.purple, COLORS.blue, COLORS.orange, COLORS.yellow][i % 5], rng);
  speckle(ctx, 0, 0, w, h, 700, rng);
}

/** 上の看板「MINI GAMES」 */
export function drawTitleSign(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.04);
  ctx.font = `900 ${h * 0.62}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = COLORS.pink;
  ctx.shadowBlur = 24;
  ctx.lineWidth = 18;
  ctx.strokeStyle = INK;
  ctx.strokeText('MINI GAMES', 0, 0);
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, -h / 3, 0, h / 3);
  g.addColorStop(0, '#fff27a');
  g.addColorStop(1, COLORS.orange);
  ctx.fillStyle = g;
  ctx.fillText('MINI GAMES', 0, 0);
  ctx.restore();
}

/**
 * ゲームの看板(カード)。ready=false なら「SOON」。title が空なら「？？？」(まだ決まっていない枠)。
 * icon: 'card' | 'dash' | 'slugger' | null(？マーク)
 */
export function drawGameCard(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, sub: string, color: string, icon: string | null, ready: boolean, seed: number): void {
  const rng = mulberry32(seed);
  const m = 8;
  // 影
  roundRectPath(ctx, m + 8, m + 10, w - m * 2 - 8, h - m * 2 - 8, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  roundRectPath(ctx, m, m, w - m * 2 - 8, h - m * 2 - 8, 26);
  ctx.fillStyle = '#fbf1dc';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 左の色の帯と、飛び散り
  ctx.fillStyle = color;
  ctx.fillRect(m, m, h * 0.95, h);
  for (let i = 0; i < 4; i++) splat(ctx, range(rng, m, m + h), range(rng, 0, h), range(rng, 10, 22), [COLORS.yellow, '#ffffff', COLORS.pink, COLORS.blue][i], rng, false);
  ctx.restore();
  roundRectPath(ctx, m, m, w - m * 2 - 8, h - m * 2 - 8, 26);
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // アイコン
  const cx = m + h * 0.47;
  const cy = h / 2 - 4;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  if (icon === 'card') {
    // 2枚のトランプ
    for (const [dx, a, mark, mc] of [[-14, -0.25, '♠', INK], [14, 0.2, '♥', '#e8364a']] as const) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.rotate(a);
      roundRectPath(ctx, -30, -42, 60, 84, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mc;
      ctx.font = `900 40px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark, 0, 2);
      ctx.restore();
    }
  } else if (icon === 'dash') {
    // 跳ねる矢印と地面
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-40, 30);
    ctx.quadraticCurveTo(0, -70, 40, 30);
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-40, 30);
    ctx.quadraticCurveTo(0, -70, 40, 30);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(-50, 36, 100, 10);
  } else if (icon === 'slugger') {
    // バットとボール
    ctx.save();
    ctx.rotate(-0.7);
    roundRectPath(ctx, -50, -9, 100, 18, 9);
    ctx.fillStyle = '#2a2a33';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(10, -7, 8, 14);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(26, 26, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.font = `900 84px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeText('?', 0, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 0, 4);
  }
  ctx.restore();
  // 文字
  const tx = m + h * 1.0 + 6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.font = title === 'MONZ CARD' ? `900 46px "Arial Black", Impact, sans-serif` : `900 40px ${UI_FONT}`;
  ctx.fillText(title || '？？？', tx, h * 0.4);
  ctx.fillStyle = '#5a4a66';
  ctx.font = `800 22px ${UI_FONT}`;
  ctx.fillText(sub, tx, h * 0.68);
  if (!ready) {
    ctx.save();
    ctx.translate(w - 70, 34);
    ctx.rotate(0.22);
    ctx.fillStyle = COLORS.yellow;
    roundRectPath(ctx, -46, -18, 92, 36, 8);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `900 22px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SOON', 0, 1);
    ctx.restore();
  }
}
