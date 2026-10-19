import { mulberry32, range, type Rng } from '../core/rng';

/**
 * 誕生シーンで使う、プログラムで描く部分(ヒビ・割れた殻・光)。
 * 空・ドラゴン・卵・籠は企画者の画像を使う(design/birth/)。ヒビと殻は、卵の画像をそのまま切り分けて作る。
 */

type Pt = [number, number];

/** 卵を横切るギザギザの割れ目(卵の幅 w・高さ h に対して)。毎回同じ形 */
export function crackLine(w: number, h: number): Pt[] {
  const rng = mulberry32(17);
  const pts: Pt[] = [];
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const x = w * (0.02 + (0.96 * i) / n);
    const y = h * 0.5 + (i % 2 ? -1 : 1) * h * 0.04 + range(rng, -h * 0.012, h * 0.012);
    pts.push([x, y]);
  }
  return pts;
}

/** 割れ目から上へのびる小さなヒビ */
const BRANCHES: [index: number, dx: number, dy: number][] = [
  [3, -0.04, -0.14],
  [7, 0.05, -0.12],
  [5, 0.02, 0.1],
  [9, -0.03, 0.12],
];

/**
 * ヒビ(stage 1〜3 で広がる)。卵の画像の形で切りぬくので、卵からはみ出さない。
 * stage 2 からは、すき間から金色の光がもれる。
 */
export function drawCracks(ctx: CanvasRenderingContext2D, egg: CanvasImageSource, w: number, h: number, stage: number): void {
  const line = crackLine(w, h);
  const span = stage === 1 ? [4, 7] : stage === 2 ? [2, 9] : [0, line.length - 1];
  const main = line.slice(span[0], span[1] + 1);
  const branches = BRANCHES.slice(0, stage === 1 ? 0 : stage === 2 ? 2 : 4).filter(([i]) => i >= span[0] && i <= span[1]);
  const path = () => {
    ctx.beginPath();
    main.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (const [i, dx, dy] of branches) {
      const [x, y] = line[i];
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * w * 0.5, y + dy * h * 0.5);
      ctx.lineTo(x + dx * w, y + dy * h);
    }
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (stage >= 2) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,214,90,1)';
    ctx.shadowBlur = stage === 3 ? 44 : 28;
    ctx.strokeStyle = 'rgba(255,236,150,0.95)';
    ctx.lineWidth = stage === 3 ? 28 : 18;
    path();
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = stage >= 2 ? '#fff6c8' : '#3a2a2a';
  ctx.lineWidth = stage >= 2 ? 10 : 9;
  path();
  ctx.stroke();
  if (stage >= 2) {
    ctx.strokeStyle = 'rgba(58,42,42,0.75)';
    ctx.lineWidth = 3;
    path();
    ctx.stroke();
  }
  // 卵の形で切りぬく
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(egg, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * 割れた殻。'bottomL'/'bottomR' は左右に開いて籠に残る下半分、'top0'〜'top2' は飛び散る上のかけら。
 * 卵の画像を割れ目にそって切り分けるだけ(色・模様は元のまま)。
 */
export type ShellPiece = 'bottomL' | 'bottomR' | 'top0' | 'top1' | 'top2';
export const SHELL_PIECES: ShellPiece[] = ['bottomL', 'bottomR', 'top0', 'top1', 'top2'];

export function drawShell(ctx: CanvasRenderingContext2D, egg: CanvasImageSource, w: number, h: number, piece: ShellPiece): void {
  const line = crackLine(w, h);
  ctx.save();
  ctx.beginPath();
  if (piece === 'bottomL' || piece === 'bottomR') {
    // 下半分を、まん中のギザギザの線で左右に分ける
    const mid = Math.floor(line.length / 2);
    const half = piece === 'bottomL' ? line.slice(0, mid + 1) : line.slice(mid);
    half.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    const zig: Pt[] = [
      [w * 0.47, h * 0.66],
      [w * 0.53, h * 0.76],
      [w * 0.48, h * 0.88],
      [w * 0.5, h],
    ];
    if (piece === 'bottomL') {
      zig.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(0, h);
    } else {
      ctx.lineTo(w, h);
      [...zig].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
    }
  } else {
    // 上半分を3つに分ける(割れ目の 0〜4, 4〜8, 8〜11 番目の点で区切る)
    const k = Number(piece.slice(3));
    const [a, b] = [[0, 4], [4, 8], [8, line.length - 1]][k];
    const seg = line.slice(a, b + 1);
    const top = (x: number) => (k === 1 ? x + (x - w / 2) * 0.1 : x);
    ctx.moveTo(seg[0][0], seg[0][1]);
    seg.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(top(seg[seg.length - 1][0]) + (k === 2 ? w : 0), k === 2 ? 0 : -h * 0.02);
    ctx.lineTo(top(seg[0][0]) - (k === 0 ? w : 0), k === 0 ? 0 : -h * 0.02);
  }
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(egg, 0, 0, w, h);
  // 割れ目のふちを少し明るく
  ctx.strokeStyle = 'rgba(255,246,210,0.9)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

/** 放射状の光(加算で重ねる) */
export function drawRays(ctx: CanvasRenderingContext2D, size: number, count: number, rng: Rng = mulberry32(3)): void {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,250,210,0.95)');
  g.addColorStop(0.5, 'rgba(255,220,120,0.35)');
  g.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = g;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + range(rng, -0.05, 0.05);
    const spread = range(rng, 0.05, 0.11);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a - spread) * c, c + Math.sin(a - spread) * c);
    ctx.lineTo(c + Math.cos(a + spread) * c, c + Math.sin(a + spread) * c);
    ctx.closePath();
    ctx.fill();
  }
}

/** ふんわりした光の玉 */
export function drawGlow(ctx: CanvasRenderingContext2D, size: number, color = '255,236,150'): void {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.4, `rgba(${color},0.5)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}
