import * as Phaser from 'phaser';
import { mulberry32, range, type Rng } from '../core/rng';

/**
 * 質問・誕生画面の絵(背景・パネル・カード・ボタン)を、Canvas 2D でテクスチャに描く部品。
 * 参考: 企画者の質問画面デザイン(アメリカンカートゥーン×UKポップパンク、太い黒の輪郭、スプレーアート)。
 */
export const UI_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif';
export const INK = '#16101c';
export const CREAM = '#fbf1dc';
export const COLORS = {
  orange: '#ff8a1f',
  purple: '#8a35e0',
  pink: '#ff4fa3',
  blue: '#2fa8ff',
  yellow: '#ffd23a',
  teal: '#2ed3c2',
  green: '#4fd65a',
};
const SPLAT_COLORS = [COLORS.orange, COLORS.purple, COLORS.pink, COLORS.blue, COLORS.yellow];

/** draw で描いた内容をテクスチャとして登録する(同じ key があれば作り直す) */
export function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  if (!tex) throw new Error(`テクスチャを作れません: ${key}`);
  draw(tex.getContext());
  tex.refresh();
  return key;
}

/**
 * canvasTexture と同じだが、同じ key がもうあれば作り直さない。
 * 画面に出ている途中の絵(ハートなど)が使っているテクスチャを作り直すと、iPhone では描画がこわれることがあるため、
 * 何度も出す小さな絵はこちらで作る。
 */
export function canvasTextureOnce(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  return scene.textures.exists(key) ? key : canvasTexture(scene, key, w, h, draw);
}

/** スプレーの飛び散り */
export function splat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rng: Rng, drips = true): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * range(rng, 0.65, 1.15);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * range(rng, 1.15, 2.1);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * range(rng, 0.05, 0.16), 0, Math.PI * 2);
    ctx.fill();
  }
  if (drips) {
    for (let i = 0; i < 3; i++) {
      const dx = x + range(rng, -0.6, 0.6) * r;
      const len = r * range(rng, 0.6, 1.8);
      const wdt = r * range(rng, 0.08, 0.16);
      ctx.fillRect(dx - wdt / 2, y, wdt, len);
      ctx.beginPath();
      ctx.arc(dx, y + len, wdt * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 細かいスプレーの粒 */
export function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number, rng: Rng, colors = SPLAT_COLORS): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = range(rng, 0.35, 0.9);
    ctx.beginPath();
    ctx.arc(x + rng() * w, y + rng() * h, range(rng, 0.8, 3.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 路地裏の落書きの壁(画面全体の背景)。キャラクターは描かない */
export function drawStreet(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7): void {
  const rng = mulberry32(seed);
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#1f8fff');
  sky.addColorStop(0.55, '#7fd0ff');
  sky.addColorStop(1, '#c9b6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 雲
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, s] of [[w * 0.3, h * 0.13, 1], [w * 0.75, h * 0.08, 0.8], [w * 0.55, h * 0.3, 0.7]] as const) {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(cx + (i - 2.5) * 34 * s, cy + Math.sin(i * 1.7) * 10 * s, 38 * s * range(rng, 0.7, 1.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 左右の壁(遠近感のある台形)とレンガ
  const wall = (side: -1 | 1) => {
    const x0 = side < 0 ? 0 : w;
    const inner = side < 0 ? w * 0.24 : w * 0.76;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(inner, h * 0.1);
    ctx.lineTo(inner, h * 0.86);
    ctx.lineTo(x0, h);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(x0, 0, inner, 0);
    g.addColorStop(0, '#3b2a6b');
    g.addColorStop(1, '#5e7bd6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(20,10,40,0.35)';
    ctx.lineWidth = 3;
    for (let y = 0; y < h; y += 46) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (side < 0 ? 10 : -10));
      ctx.stroke();
      for (let x = (y / 46) % 2 ? 0 : 40; x < w; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 46);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 9; i++) splat(ctx, side < 0 ? range(rng, 0, inner) : range(rng, inner, w), range(rng, 60, h * 0.85), range(rng, 26, 70), SPLAT_COLORS[i % SPLAT_COLORS.length], rng);
    speckle(ctx, side < 0 ? 0 : inner, 0, Math.abs(inner - x0), h, 900, rng);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(inner, h * 0.1);
    ctx.lineTo(inner, h * 0.86);
    ctx.stroke();
  };
  wall(-1);
  wall(1);
  // 地面
  const ground = ctx.createLinearGradient(0, h * 0.84, 0, h);
  ground.addColorStop(0, '#6b6f86');
  ground.addColorStop(1, '#2b2638');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(w * 0.24, h * 0.86);
  ctx.lineTo(w * 0.76, h * 0.86);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 7; i++) splat(ctx, range(rng, w * 0.1, w * 0.9), range(rng, h * 0.88, h * 0.98), range(rng, 22, 48), SPLAT_COLORS[i % SPLAT_COLORS.length], rng, false);
  // 落書きのマーク(王冠・Xの目)
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(30, 210);
  ctx.lineTo(50, 150);
  ctx.lineTo(80, 190);
  ctx.lineTo(105, 140);
  ctx.lineTo(125, 205);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  for (const [cx, cy] of [[w - 70, 330], [w - 110, 330]]) {
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.moveTo(cx + 12, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.stroke();
  }
  speckle(ctx, 0, 0, w, h, 600, rng);
}

/** 文字の長さに合わせて大きさを決める(はみ出さないように小さくする) */
function fitFont(ctx: CanvasRenderingContext2D, lines: string[], size: number, maxWidth: number, weight = 900): number {
  let s = size;
  for (; s > 12; s -= 1) {
    ctx.font = `${weight} ${s}px ${UI_FONT}`;
    if (lines.every((l) => ctx.measureText(l.replace(/[{}]/g, '')).width <= maxWidth)) break;
  }
  return s;
}

/** richText で描いたときの高さ(描かずに測る) */
export function richTextHeight(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number): number {
  const lines = text.split('\n');
  return lines.length * fitFont(ctx, lines, size, maxWidth) * 1.22;
}

/** {…} を強調色で描く。中央ぞろえ。描いた高さを返す */
export function richText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  top: number,
  size: number,
  maxWidth: number,
  emphasis = [COLORS.purple, COLORS.orange],
): number {
  const lines = text.split('\n');
  const s = fitFont(ctx, lines, size, maxWidth);
  const lh = s * 1.22;
  let emIndex = 0;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  lines.forEach((line, li) => {
    const parts = line.split(/(\{[^}]*\})/).filter(Boolean);
    ctx.font = `900 ${s}px ${UI_FONT}`;
    const total = parts.reduce((sum, p) => sum + ctx.measureText(p.replace(/[{}]/g, '')).width, 0);
    let x = cx - total / 2;
    const y = top + li * lh;
    for (const p of parts) {
      const em = p.startsWith('{');
      const t = p.replace(/[{}]/g, '');
      if (em) {
        const color = emphasis[emIndex++ % emphasis.length];
        ctx.lineWidth = s * 0.16;
        ctx.strokeStyle = INK;
        ctx.strokeText(t, x, y);
        ctx.fillStyle = color;
        ctx.fillText(t, x, y);
      } else {
        ctx.fillStyle = INK;
        ctx.fillText(t, x, y);
      }
      x += ctx.measureText(t).width;
    }
  });
  return lines.length * lh;
}

/** 質問を書く紙(ぎざぎざのふち、太い黒の輪郭、まわりにスプレー) */
export function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): { x: number; y: number; w: number; h: number } {
  const rng = mulberry32(seed);
  const pad = 30;
  const x = pad;
  const y = pad;
  const pw = w - pad * 2;
  const ph = h - pad * 2;
  splat(ctx, x + 20, y + 20, 46, COLORS.orange, rng, false);
  splat(ctx, x + pw - 10, y + ph - 20, 52, COLORS.purple, rng);
  splat(ctx, x + pw - 30, y + 10, 34, COLORS.pink, rng, false);
  ctx.beginPath();
  const step = 18;
  const jag = () => range(rng, -5, 5);
  ctx.moveTo(x, y);
  for (let px = x; px <= x + pw; px += step) ctx.lineTo(px, y + jag());
  for (let py = y; py <= y + ph; py += step) ctx.lineTo(x + pw + jag(), py);
  for (let px = x + pw; px >= x; px -= step) ctx.lineTo(px, y + ph + jag());
  for (let py = y + ph; py >= y; py -= step) ctx.lineTo(x + jag(), py);
  ctx.closePath();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  speckle(ctx, x, y, pw, ph, 140, rng, ['#e8d9b8', '#d9c7a0']);
  ctx.restore();
  return { x, y, w: pw, h: ph };
}

const CARD_COLORS: [string, string][] = [
  [COLORS.orange, '#ff5d8f'],
  ['#ff6fc0', '#c94bff'],
  [COLORS.blue, '#2fd6ff'],
  [COLORS.purple, '#5b4bff'],
];

/** 選択カード(2×2用)。絵(絵文字)と文字の帯 */
export function drawCard(ctx: CanvasRenderingContext2D, w: number, h: number, index: number, icon: string, label: string, seed: number): void {
  const rng = mulberry32(seed);
  const [c1, c2] = CARD_COLORS[index % CARD_COLORS.length];
  const m = 8;
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 26);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 4; i++) splat(ctx, range(rng, 0, w), range(rng, 0, h * 0.6), range(rng, 18, 40), SPLAT_COLORS[(index + i + 1) % SPLAT_COLORS.length], rng);
  speckle(ctx, 0, 0, w, h, 160, rng, [INK, '#ffffff']);
  ctx.restore();
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 26);
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 絵
  const iconSize = Math.min(w, h) * 0.36;
  ctx.font = `${iconSize}px "Apple Color Emoji", "Noto Color Emoji", ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, w / 2, h * 0.34);
  ctx.textAlign = 'left';
  // 文字の帯
  const bh = h * 0.34;
  const by = h - m - bh - 14;
  ctx.beginPath();
  ctx.moveTo(m + 10, by);
  for (let px = m + 10; px <= w - m - 10; px += 14) ctx.lineTo(px, by + range(rng, -3, 3));
  ctx.lineTo(w - m - 10, by + bh);
  for (let px = w - m - 10; px >= m + 10; px -= 14) ctx.lineTo(px, by + bh + range(rng, -3, 3));
  ctx.closePath();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const lines = splitLabel(label);
  const s = fitFont(ctx, lines, 32, w - m * 2 - 44);
  ctx.font = `900 ${s}px ${UI_FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = s * 1.2;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, by + bh / 2 + (i - (lines.length - 1) / 2) * lh));
  ctx.textAlign = 'left';
}

/** 長い文字は2行に分ける(「を」「に」「ら」などの後ろで区切る) */
function splitLabel(label: string): string[] {
  if (label.length <= 9) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 2; i < label.length - 2; i++) {
    if ('をにがはでらずのとう'.includes(label[i]) && (best < 0 || Math.abs(i + 1 - mid) < Math.abs(best - mid))) best = i + 1;
  }
  if (best < 0) best = Math.round(mid);
  return [label.slice(0, best), label.slice(best)];
}

/** 横長の選択カード(2問目の場所の絵つき)。絵はプログラムで描く簡単な風景 */
export function drawPlaceCard(ctx: CanvasRenderingContext2D, w: number, h: number, kind: string, label: string, seed: number): void {
  const rng = mulberry32(seed);
  const m = 8;
  const frame: Record<string, string> = { city: COLORS.orange, forest: COLORS.yellow, ruins: COLORS.blue };
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 24);
  ctx.save();
  ctx.clip();
  if (kind === 'city') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffb35c');
    g.addColorStop(1, '#ff5fa2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let x = w * 0.3; x < w; x += range(rng, 40, 70)) {
      const bh = range(rng, h * 0.35, h * 0.85);
      ctx.fillStyle = ['#6b2fb8', '#4a2a8c', '#8a35e0', '#3a2370'][Math.floor(rng() * 4)];
      ctx.fillRect(x, h - bh, range(rng, 34, 60), bh);
      ctx.fillStyle = COLORS.yellow;
      for (let wy = h - bh + 12; wy < h - 14; wy += 22) for (let wx = x + 8; wx < x + 30; wx += 14) if (rng() < 0.55) ctx.fillRect(wx, wy, 7, 9);
    }
    ctx.fillStyle = '#5a4a6a';
    ctx.fillRect(0, h * 0.86, w, h);
  } else if (kind === 'forest') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8fe3ff');
    g.addColorStop(1, '#bff5a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let x = w * 0.28; x < w + 40; x += range(rng, 34, 56)) {
      const th = range(rng, h * 0.45, h * 0.9);
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(x - 5, h - th * 0.35, 10, th * 0.35);
      ctx.fillStyle = ['#2f9e44', '#40c057', '#2b8a3e'][Math.floor(rng() * 3)];
      ctx.beginPath();
      ctx.moveTo(x, h - th);
      ctx.lineTo(x + th * 0.32, h - th * 0.3);
      ctx.lineTo(x - th * 0.32, h - th * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#3f8f2f';
    ctx.fillRect(0, h * 0.88, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1a4a');
    g.addColorStop(1, '#3a3f8f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) ctx.fillRect(rng() * w, rng() * h * 0.6, 2, 2);
    ctx.fillStyle = '#fff7c2';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.3, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1a4a';
    ctx.beginPath();
    ctx.arc(w * 0.8 + 9, h * 0.27, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4f7a';
    for (const [x, pw, ph] of [[w * 0.36, 40, h * 0.6], [w * 0.5, 90, h * 0.45], [w * 0.68, 36, h * 0.7], [w * 0.9, 50, h * 0.5]]) {
      ctx.fillRect(x, h - ph, pw, ph);
    }
    ctx.fillStyle = '#0b1a4a';
    ctx.beginPath();
    ctx.arc(w * 0.5 + 45, h - h * 0.12, 22, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(w * 0.5 + 23, h - h * 0.12, 44, h * 0.12);
  }
  speckle(ctx, 0, 0, w, h, 120, rng, [INK, '#ffffff']);
  ctx.restore();
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 24);
  ctx.lineWidth = 9;
  ctx.strokeStyle = frame[kind] ?? COLORS.orange;
  ctx.stroke();
  roundRectPath(ctx, m + 6, m + 6, w - m * 2 - 12, h - m * 2 - 12, 20);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 文字の帯(左)
  const s = fitFont(ctx, [label], 38, w * 0.42);
  ctx.font = `900 ${s}px ${UI_FONT}`;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(m + 20, h / 2 - s * 0.9);
  ctx.lineTo(m + 50 + tw + 30, h / 2 - s * 0.95);
  ctx.lineTo(m + 50 + tw + 14, h / 2 + s * 0.9);
  ctx.lineTo(m + 20, h / 2 + s * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, m + 44, h / 2 + 2);
  // ▶
  const ax = w - m - 70;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ax, h / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(ax - 10, h / 2 - 16);
  ctx.lineTo(ax + 16, h / 2);
  ctx.lineTo(ax - 10, h / 2 + 16);
  ctx.closePath();
  ctx.fill();
}

/** ボタン(つぎへ・もどる) */
export function drawButton(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, kind: 'next' | 'back', seed: number): void {
  const rng = mulberry32(seed);
  const m = 8;
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 22);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  if (kind === 'next') {
    g.addColorStop(0, '#ffb12b');
    g.addColorStop(1, COLORS.orange);
  } else {
    g.addColorStop(0, '#3a1f5c');
    g.addColorStop(1, '#2a1640');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 3; i++) splat(ctx, range(rng, 0, w), range(rng, 0, h), range(rng, 12, 26), kind === 'next' ? [COLORS.purple, COLORS.pink, COLORS.yellow][i] : [COLORS.purple, COLORS.pink, COLORS.blue][i], rng, false);
  ctx.restore();
  roundRectPath(ctx, m, m, w - m * 2, h - m * 2, 22);
  ctx.lineWidth = 7;
  ctx.strokeStyle = kind === 'next' ? INK : COLORS.purple;
  ctx.stroke();
  const s = kind === 'next' ? 48 : 34;
  ctx.font = `900 ${s}px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'next' ? INK : '#ffffff';
  const tri = (x: number, dir: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(x - dir * 10, h / 2 - 15);
    ctx.lineTo(x + dir * 14, h / 2);
    ctx.lineTo(x - dir * 10, h / 2 + 15);
    ctx.closePath();
    ctx.fill();
  };
  if (kind === 'next') {
    ctx.fillText(label, w / 2 - 20, h / 2 + 2);
    tri(w - 60, 1);
  } else {
    ctx.fillStyle = COLORS.pink;
    tri(46, -1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, w / 2 + 14, h / 2 + 2);
  }
  ctx.textAlign = 'left';
}

/** 進行表示(「1/5」と丸) */
export function drawProgress(ctx: CanvasRenderingContext2D, w: number, h: number, step: number, total: number, seed: number): void {
  const rng = mulberry32(seed);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(100, h / 2 - 30);
  ctx.lineTo(w - 10, h / 2 - 22);
  ctx.lineTo(w - 30, h / 2 + 26);
  ctx.lineTo(110, h / 2 + 30);
  ctx.closePath();
  ctx.fill();
  splat(ctx, 70, h / 2, 50, COLORS.yellow, rng);
  ctx.font = `900 46px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(String(step), 42, h / 2 + 2);
  ctx.font = `900 26px ${UI_FONT}`;
  ctx.fillText(`/${total}`, 70, h / 2 + 10);
  const x0 = 160;
  const gap = (w - 70 - x0) / (total - 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x0, h / 2);
  ctx.lineTo(x0 + gap * (total - 1), h / 2);
  ctx.stroke();
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(x0 + gap * i, h / 2, 15, 0, Math.PI * 2);
    ctx.fillStyle = i < step ? COLORS.orange : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = i < step ? COLORS.yellow : COLORS.pink;
    ctx.stroke();
  }
}
