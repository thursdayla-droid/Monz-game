import { mulberry32, range, type Rng } from '../core/rng';
import { COLORS, INK, splat } from './paint';

/**
 * 誕生シーンの絵(空・雲・地面・ドラゴンの影・卵・ヒビ・殻・籠・光)。
 * 【仮】企画者の依頼で、Claude Code がプログラムで描いた仮の絵。気に入らなければ企画者が用意した素材に差しかえる。
 * MONZのキャラクターは描かない。ドラゴンは正体を見せないシルエット。
 */

/** 空の世界の大きさ(上へ長い)。地面は下のほう */
export const WORLD_TOP = -2200;
export const WORLD_H = 3480;

/** 空(上から下へ、夜明け前の紺 → 青空 → 地平線の明るい色)と地面 */
export function drawSkyWorld(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = mulberry32(5);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a1550');
  sky.addColorStop(0.22, '#3b3fc4');
  sky.addColorStop(0.5, '#2f9bff');
  sky.addColorStop(0.78, '#8fd8ff');
  sky.addColorStop(0.9, '#ffd7a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 上のほうの星
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = range(rng, 0.3, 0.9);
    const s = range(rng, 1.5, 3.5);
    ctx.fillRect(rng() * w, rng() * h * 0.25, s, s);
  }
  ctx.globalAlpha = 1;
  // ポップアートの網点(うっすら)
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < h * 0.85; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < w; x += 18) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const groundTop = h - 300;
  // 遠くの丘
  ctx.fillStyle = '#6b4bd6';
  ctx.beginPath();
  ctx.moveTo(0, groundTop + 30);
  ctx.quadraticCurveTo(w * 0.2, groundTop - 70, w * 0.45, groundTop + 10);
  ctx.quadraticCurveTo(w * 0.75, groundTop - 90, w, groundTop + 20);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 手前の草地
  ctx.fillStyle = '#3fbf4a';
  ctx.beginPath();
  ctx.moveTo(0, groundTop + 110);
  ctx.quadraticCurveTo(w * 0.5, groundTop + 50, w, groundTop + 110);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#2e9a3a';
  for (let i = 0; i < 160; i++) {
    const x = rng() * w;
    const y = groundTop + 80 + rng() * 300;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4, y - range(rng, 10, 22));
    ctx.lineTo(x + 8, y);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) splat(ctx, range(rng, 30, w - 30), range(rng, groundTop + 150, h - 20), range(rng, 16, 34), [COLORS.orange, COLORS.purple, COLORS.pink, COLORS.yellow][i % 4], rng, false);
  ctx.restore();
}

/** 漫画風の雲(太い黒の輪郭) */
export function drawCloud(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rng = mulberry32(seed);
  const bumps = 5;
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i < bumps; i++) {
      const cx = w * (0.18 + (i / (bumps - 1)) * 0.64);
      const r = h * range(rng, 0.26, 0.38) * (i === 0 || i === bumps - 1 ? 0.8 : 1.1);
      ctx.moveTo(cx + r, h * 0.55);
      ctx.arc(cx, h * 0.55 - (i % 2 ? r * 0.3 : 0), r, 0, Math.PI * 2);
    }
    ctx.rect(w * 0.15, h * 0.55, w * 0.7, h * 0.25);
  };
  ctx.save();
  path();
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#d6e9ff';
  ctx.fillRect(w * 0.15, h * 0.72, w * 0.7, h * 0.08);
}

/** ドラゴンの絵の大きさ(元の座標)。卵をつかむ位置は DRAGON_EGG */
export const DRAGON_W = 600;
export const DRAGON_H = 480;
export const DRAGON_EGG = { x: 338, y: 392 };

/**
 * ドラゴンのシルエット(左向き)。wing: -1 = 翼を下ろす, 0 = 中間, 1 = 翼を上げる。
 * 正体は見せないので、ほぼ黒い影。ふちに紫とオレンジの光、目だけ光る。
 */
export function drawDragon(ctx: CanvasRenderingContext2D, w: number, h: number, wing: number): void {
  ctx.save();
  ctx.scale(w / DRAGON_W, h / DRAGON_H);
  const body = '#120a1f';
  const glow = (color: string, blur: number, width: number) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
  };
  const shoulder = { x: 330, y: 215 };
  const lift = wing * 105;
  const wingGeom = (far: boolean) => {
    const l = far ? lift * 0.8 : lift;
    const wx = shoulder.x + (far ? 45 : 15);
    const wy = shoulder.y - 35 - l;
    const tip = { x: wx + 165, y: Math.max(8, wy - 40 - l * 0.3) };
    const fingers = [
      { x: tip.x + 25, y: tip.y + 105 + l * 0.35 },
      { x: tip.x - 15, y: tip.y + 185 + l * 0.55 },
      { x: tip.x - 90, y: tip.y + 225 + l * 0.7 },
    ].map((f) => ({ x: f.x, y: Math.min(DRAGON_H - 10, f.y) }));
    return { wx, wy, tip, fingers };
  };
  const wingPath = (far: boolean) => {
    const { wx, wy, tip, fingers } = wingGeom(far);
    ctx.beginPath();
    ctx.moveTo(shoulder.x - 15, shoulder.y + 5);
    ctx.quadraticCurveTo(shoulder.x + 5, wy + 25, wx, wy);
    ctx.lineTo(tip.x, tip.y);
    let prev = tip;
    for (const f of fingers) {
      ctx.quadraticCurveTo((prev.x + f.x) / 2 - 28, (prev.y + f.y) / 2 - 12, f.x, f.y);
      prev = f;
    }
    ctx.quadraticCurveTo(shoulder.x + 45, shoulder.y + 70, shoulder.x + 70, shoulder.y + 50);
    ctx.closePath();
  };
  // 奥の翼
  wingPath(true);
  ctx.fillStyle = '#1f1436';
  ctx.fill();
  // 体・首・頭・しっぽ
  ctx.beginPath();
  ctx.moveTo(96, 178); // 鼻先
  ctx.quadraticCurveTo(84, 196, 112, 204);
  ctx.quadraticCurveTo(150, 214, 180, 208); // あご
  ctx.quadraticCurveTo(215, 238, 245, 262); // のど
  ctx.quadraticCurveTo(280, 300, 340, 304); // 胸
  ctx.quadraticCurveTo(420, 312, 470, 290); // おなか
  ctx.quadraticCurveTo(540, 300, 568, 345); // しっぽ
  ctx.quadraticCurveTo(582, 380, 556, 398);
  ctx.quadraticCurveTo(570, 360, 522, 318);
  ctx.quadraticCurveTo(480, 280, 440, 240); // 背中の後ろ
  ctx.quadraticCurveTo(380, 196, 318, 196); // 肩
  ctx.quadraticCurveTo(268, 196, 240, 180); // 首の上
  ctx.quadraticCurveTo(215, 160, 196, 140);
  // 角(2本、うしろへ反る)
  ctx.lineTo(226, 92);
  ctx.lineTo(184, 132);
  ctx.lineTo(190, 78);
  ctx.lineTo(160, 140);
  ctx.quadraticCurveTo(122, 150, 96, 178);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  glow(COLORS.purple, 20, 5);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // 背中とくびのトゲ
  ctx.fillStyle = body;
  const spines: [number, number][] = [[230, 176], [262, 190], [300, 194], [342, 198], [384, 210], [424, 232], [462, 262], [500, 292]];
  for (const [x, y] of spines) {
    ctx.beginPath();
    ctx.moveTo(x - 13, y + 8);
    ctx.lineTo(x + 3, y - 24);
    ctx.lineTo(x + 15, y + 10);
    ctx.fill();
  }
  // しっぽの先(やじり)
  ctx.beginPath();
  ctx.moveTo(556, 398);
  ctx.lineTo(592, 420);
  ctx.lineTo(560, 432);
  ctx.lineTo(540, 410);
  ctx.closePath();
  ctx.fill();
  // 足(卵をつかむ)
  ctx.lineCap = 'round';
  ctx.strokeStyle = body;
  ctx.lineWidth = 22;
  for (const [x0, y0, x1, y1] of [[318, 290, 305, 352], [372, 296, 372, 356]]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + 14, (y0 + y1) / 2, x1, y1);
    ctx.stroke();
  }
  ctx.lineWidth = 8;
  for (const [x, y] of [[305, 352], [372, 356]]) {
    for (const d of [-16, 0, 16]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + d, y + 20, x + d * 1.3, y + 30);
      ctx.stroke();
    }
  }
  // 手前の翼
  wingPath(false);
  ctx.fillStyle = body;
  ctx.fill();
  glow(COLORS.orange, 16, 4);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // 翼の骨
  const g = wingGeom(false);
  ctx.strokeStyle = '#33214f';
  ctx.lineWidth = 5;
  for (const f of g.fingers) {
    ctx.beginPath();
    ctx.moveTo(g.wx, g.wy);
    ctx.lineTo(f.x, f.y);
    ctx.stroke();
  }
  // 光る目
  ctx.shadowColor = COLORS.yellow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffe680';
  ctx.beginPath();
  ctx.ellipse(134, 176, 10, 4.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 卵の形 */
function eggPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rw: number, rh: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - rh);
  ctx.bezierCurveTo(cx + rw * 0.95, cy - rh, cx + rw * 1.05, cy + rh * 0.35, cx + rw, cy + rh * 0.45);
  ctx.bezierCurveTo(cx + rw * 0.9, cy + rh * 1.05, cx - rw * 0.9, cy + rh * 1.05, cx - rw, cy + rh * 0.45);
  ctx.bezierCurveTo(cx - rw * 1.05, cy + rh * 0.35, cx - rw * 0.95, cy - rh, cx, cy - rh);
  ctx.closePath();
}

export const EGG_W = 170;
export const EGG_H = 210;

/** 卵(クリーム色にオレンジと紫の模様、太い黒の輪郭) */
export function drawEgg(ctx: CanvasRenderingContext2D, w = EGG_W, h = EGG_H): void {
  const rng = mulberry32(9);
  const cx = w / 2;
  const cy = h * 0.52;
  const rw = w * 0.4;
  const rh = h * 0.44;
  eggPath(ctx, cx, cy, rw, rh);
  ctx.fillStyle = '#fbf1dc';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 模様
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? COLORS.orange : COLORS.purple;
    ctx.beginPath();
    ctx.ellipse(cx + range(rng, -rw, rw), cy + range(rng, -rh * 0.8, rh * 0.9), range(rng, 8, 20), range(rng, 6, 15), rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // 影と光
  const shade = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.65, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(60,20,80,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx - rw * 0.45, cy - rh * 0.45, rw * 0.13, rh * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  eggPath(ctx, cx, cy, rw, rh);
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** ヒビ(1〜3段階)。卵と同じ大きさ。段階が進むほど広がり、すき間から光がもれる */
export function drawCracks(ctx: CanvasRenderingContext2D, stage: number, w = EGG_W, h = EGG_H): void {
  const cx = w / 2;
  const top = h * 0.3;
  const lines: [number, number][][] = [
    [[cx + 10, top], [cx + 22, top + 14], [cx + 12, top + 26], [cx + 26, top + 38]],
  ];
  if (stage >= 2) {
    lines[0].push([cx + 14, top + 52], [cx + 30, top + 64]);
    lines.push([[cx + 12, top + 26], [cx - 4, top + 34], [cx - 14, top + 24], [cx - 30, top + 34], [cx - 40, top + 26]]);
  }
  if (stage >= 3) {
    lines.push([[cx - 40, top + 26], [cx - 55, top + 40], [cx - 64, top + 30]]);
    lines.push([[cx + 30, top + 64], [cx + 48, top + 56], [cx + 60, top + 68]]);
    lines.push([[cx - 14, top + 24], [cx - 10, top + 6], [cx - 22, top - 6]]);
  }
  const stroke = (color: string, width: number, blur: number) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';
    for (const l of lines) {
      ctx.beginPath();
      l.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  };
  if (stage >= 2) stroke(stage >= 3 ? '#fff3a0' : 'rgba(255,240,160,0.8)', stage >= 3 ? 12 : 8, stage >= 3 ? 26 : 14);
  ctx.shadowBlur = 0;
  stroke(INK, stage >= 3 ? 5 : 4, 0);
  if (stage >= 3) stroke('#fffbe0', 2, 0);
}

/** 割れた殻(上半分 / 下半分)。ぎざぎざの割れ目 */
export function drawShell(ctx: CanvasRenderingContext2D, half: 'top' | 'bottom', w = EGG_W, h = EGG_H): void {
  const cut = h * 0.46;
  const zigY = (x: number) => cut + (Math.round(x / 17) % 2 ? -12 : 12);
  ctx.save();
  ctx.beginPath();
  if (half === 'top') {
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 17) ctx.lineTo(x, zigY(x));
  } else {
    for (let x = 0; x <= w; x += 17) ctx.lineTo(x, zigY(x));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
  }
  ctx.closePath();
  ctx.clip();
  drawEgg(ctx, w, h);
  // 割れ目のふち(卵の形の中だけ)
  eggPath(ctx, w / 2, h * 0.52, w * 0.4, h * 0.44);
  ctx.clip();
  ctx.beginPath();
  for (let x = 0; x <= w; x += 17) (x ? ctx.lineTo(x, zigY(x)) : ctx.moveTo(x, zigY(x)));
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

export const BASKET_W = 340;
export const BASKET_H = 210;

/** 籠の奥側(中の暗いところとわら)。卵はこの上、籠の手前側の下に置く */
export function drawBasketBack(ctx: CanvasRenderingContext2D, w = BASKET_W, h = BASKET_H): void {
  const rng = mulberry32(17);
  const rimY = h * 0.32;
  ctx.fillStyle = '#5a3415';
  ctx.beginPath();
  ctx.ellipse(w / 2, rimY, w * 0.46, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // わら
  ctx.strokeStyle = '#ffd36b';
  ctx.lineWidth = 4;
  for (let i = 0; i < 40; i++) {
    const x = w / 2 + range(rng, -w * 0.4, w * 0.4);
    const y = rimY + range(rng, -h * 0.06, h * 0.08);
    const a = range(rng, -0.8, 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 26, y - Math.abs(Math.sin(a)) * 18);
    ctx.stroke();
  }
}

/** 籠の手前側(編み目、ふち) */
export function drawBasketFront(ctx: CanvasRenderingContext2D, w = BASKET_W, h = BASKET_H): void {
  const rimY = h * 0.32;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(w * 0.04, rimY);
    ctx.quadraticCurveTo(w * 0.5, rimY + h * 0.16, w * 0.96, rimY);
    ctx.lineTo(w * 0.86, h * 0.88);
    ctx.quadraticCurveTo(w * 0.5, h * 1.02, w * 0.14, h * 0.88);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = '#c47a35';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 編み目
  for (let row = 0; row < 6; row++) {
    const y = rimY + 14 + row * 24;
    for (let x = row % 2 ? 0 : 22; x < w; x += 44) {
      ctx.fillStyle = row % 2 ? '#9b5a22' : '#e0974a';
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,20,5,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
  body();
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 手前のふち(太い縄)
  ctx.beginPath();
  ctx.moveTo(w * 0.04, rimY);
  ctx.quadraticCurveTo(w * 0.5, rimY + h * 0.16, w * 0.96, rimY);
  ctx.lineWidth = 22;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 13;
  ctx.strokeStyle = '#e8a050';
  ctx.stroke();
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
