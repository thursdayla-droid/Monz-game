import { mulberry32, range } from '../core/rng';
import { COLORS, INK, roundRectPath, speckle, splat } from './paint';

/**
 * MONZ SLUGGER の絵。【仮】すべてプログラムで描いた仮の絵(企画者の正式な絵が来たら差しかえる)。
 * 近未来のストリート野球場と、オリジナルのロボット(バッター・ピッチャー)。既存の作品には似せない。
 */

/**
 * 見え方(3D風)。バッターの斜め後ろから見る(キャッチャー目線は試したが、企画者の判断でこちらに戻した 2026-10-20)。ホームベースの面の点 (x, y) と奥行き z(0 ホーム 〜 1 ピッチャー)を画面の位置にする。
 * vx, vy: 奥の消える点 / px, py: ストライクゾーンのまん中(ホームベースの上) / zs: ゾーンの半分の大きさ(画面のpx)
 */
// 企画者の球場の絵(引きの絵 2026-10-20)に合わせた数字: ピッチャーマウンド(366,580)・ホームベース(360,905)が絵の位置にくる。
// ゾーンの半分の大きさ zs=110、地面は ゾーンのまん中から 1.3×zs 下(ホームベースの所)
export const VIEW = { vx: 368, vy: 499, px: 360, py: 762, zs: 110, depth: 4 } as const;

/** 奥へ行くほど小さく見える割合(z=0 で 1、z=1 で 0.2) */
export const persp = (z: number): number => 1 / (1 + VIEW.depth * z);

export function project(x: number, y: number, z: number): { x: number; y: number; k: number } {
  const k = persp(z);
  const bx = VIEW.px + x * VIEW.zs;
  const by = VIEW.py - y * VIEW.zs;
  return { x: VIEW.vx + (bx - VIEW.vx) * k, y: VIEW.vy + (by - VIEW.vy) * k, k };
}

/** 地面の高さ(ボールの影を落とす所)。ゾーンの y=-1.3 が地面(ホームベース) */
export const GROUND_Y = -1.3;

/** 【仮】球場(企画者の絵が読めなかったときだけ使う): 夕方の空、街のビル、グラフィティの壁、金網、ネオン、グラウンド */
export function drawStadium(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = mulberry32(77);
  const horizon = VIEW.vy + 10;
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2a1650');
  sky.addColorStop(0.55, '#a8379a');
  sky.addColorStop(1, '#ff9a4a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  // 遠くのビル
  for (let layer = 0; layer < 2; layer++) {
    let x = -20;
    ctx.fillStyle = layer === 0 ? 'rgba(70,30,110,0.85)' : 'rgba(35,16,60,0.95)';
    while (x < w) {
      const bw = range(rng, 40, 90);
      const bh = range(rng, 60, layer === 0 ? 260 : 170);
      ctx.fillRect(x, horizon - 70 - bh, bw - 6, bh + 70);
      // 窓の光
      for (let wy = horizon - 60 - bh; wy < horizon - 80; wy += 18) {
        for (let wx = x + 6; wx < x + bw - 14; wx += 14) {
          if (rng() < 0.35) {
            ctx.fillStyle = rng() < 0.5 ? 'rgba(255,210,58,0.7)' : 'rgba(47,220,255,0.6)';
            ctx.fillRect(wx, wy, 6, 8);
          }
        }
      }
      ctx.fillStyle = layer === 0 ? 'rgba(70,30,110,0.85)' : 'rgba(35,16,60,0.95)';
      x += bw;
    }
  }
  // 外野の壁(グラフィティ)
  const wallTop = horizon - 70;
  ctx.fillStyle = '#1e1430';
  ctx.fillRect(0, wallTop, w, 80);
  for (let i = 0; i < 9; i++) splat(ctx, range(rng, 0, w), range(rng, wallTop + 10, wallTop + 70), range(rng, 14, 30), [COLORS.pink, COLORS.blue, COLORS.yellow, COLORS.teal][i % 4], rng);
  ctx.save();
  ctx.font = '900 42px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.fillStyle = COLORS.yellow;
  ctx.translate(w * 0.24, wallTop + 40);
  ctx.rotate(-0.05);
  ctx.strokeText('MONZ', 0, 0);
  ctx.fillText('MONZ', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.font = '900 30px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = COLORS.teal;
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#b8fff6';
  ctx.fillText('HOME RUN ZONE', w * 0.74, wallTop + 40);
  ctx.restore();
  // 照明の塔
  for (const lx of [40, w - 40]) {
    ctx.fillStyle = '#120a1a';
    ctx.fillRect(lx - 6, 30, 12, wallTop - 30);
    ctx.fillStyle = '#fff6c8';
    ctx.shadowColor = '#fff6c8';
    ctx.shadowBlur = 30;
    roundRectPath(ctx, lx - 34, 20, 68, 34, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // グラウンド(奥へ向かう線で奥行きを出す)
  const field = ctx.createLinearGradient(0, horizon, 0, h);
  field.addColorStop(0, '#3a2a55');
  field.addColorStop(1, '#1a1226');
  ctx.fillStyle = field;
  ctx.fillRect(0, horizon - 10, w, h - horizon + 10);
  // 人工芝のしま
  for (let i = -8; i <= 8; i++) {
    const a = project(i * 1.2, GROUND_Y, 0);
    ctx.strokeStyle = i % 2 ? 'rgba(47,220,255,0.10)' : 'rgba(255,79,163,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(VIEW.vx, VIEW.vy);
    ctx.lineTo(VIEW.vx + (a.x - VIEW.vx) * 3, VIEW.vy + (a.y - VIEW.vy) * 3);
    ctx.stroke();
  }
  // ピッチャーの丘と、ホームまでの道
  const mound = project(0, GROUND_Y, 1);
  ctx.fillStyle = '#6a4a3a';
  ctx.beginPath();
  ctx.ellipse(mound.x, mound.y + 6, 70, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  const plate = project(0, GROUND_Y, 0);
  ctx.fillStyle = '#5a3e33';
  ctx.beginPath();
  ctx.ellipse(plate.x, plate.y + 10, 230, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  // ホームベース
  ctx.fillStyle = '#f4f0ff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(plate.x - 40, plate.y - 4);
  ctx.lineTo(plate.x + 40, plate.y - 4);
  ctx.lineTo(plate.x + 40, plate.y + 8);
  ctx.lineTo(plate.x, plate.y + 22);
  ctx.lineTo(plate.x - 40, plate.y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  speckle(ctx, 0, horizon, w, h - horizon, 260, rng);
}

/** バッターのポーズ */
export type BatterPose = 'idle' | 'swing' | 'hit' | 'homer' | 'whiff';
/** 絵の大きさ(足元が下のまん中) */
export const BATTER_SIZE = { w: 380, h: 440 };

/**
 * バッターロボット: 大きな頭・太い腕・短い足・LEDの目。黒・黄・シアン。ストリートっぽいメカバット。
 * 斜め後ろから見たところ(顔は右のピッチャーの方を向く)。
 */
export function drawBatter(ctx: CanvasRenderingContext2D, pose: BatterPose): void {
  const { w, h } = BATTER_SIZE;
  const P = {
    idle: { lean: -0.05, bat: -2.2, twist: 0, eyes: 'normal' },
    swing: { lean: 0.12, bat: -0.1, twist: 1, eyes: 'focus' },
    hit: { lean: 0.15, bat: 0.9, twist: 1, eyes: 'happy' },
    homer: { lean: -0.12, bat: -1.4, twist: 0.4, eyes: 'happy' },
    whiff: { lean: 0.2, bat: 1.9, twist: 1.2, eyes: 'dizzy' },
  }[pose];
  const line = (lw = 7) => {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
  };
  ctx.save();
  ctx.translate(w / 2, h - 14);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 120, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  // 短い足
  for (const lx of [-52, 46]) {
    roundRectPath(ctx, lx - 26, -96, 52, 92, 14);
    ctx.fillStyle = '#23202c';
    ctx.fill();
    line();
    ctx.stroke();
    roundRectPath(ctx, lx - 36, -26, 72, 30, 10);
    ctx.fillStyle = COLORS.yellow;
    ctx.fill();
    line(6);
    ctx.stroke();
  }
  ctx.rotate(P.lean);
  // 体
  roundRectPath(ctx, -82, -230, 164, 150, 30);
  ctx.fillStyle = '#16131d';
  ctx.fill();
  line();
  ctx.stroke();
  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(-80, -168, 160, 18);
  ctx.fillStyle = '#2fe0ff';
  ctx.fillRect(-80, -150, 160, 6);
  // 背番号(オリジナル)
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 40px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('00', -6, -200 + P.twist * 4);
  const hx = 20 + P.twist * 40;
  const hy = -190 + P.twist * 20;
  // 太い腕(体からバットのにぎりへ)
  for (const [sx, sy] of [[-60, -200], [60, -205]]) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.lineCap = 'round';
    ctx.lineWidth = 44;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 32;
    ctx.strokeStyle = '#2a2633';
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.arc(hx, hy, 24, 0, Math.PI * 2);
  ctx.fill();
  line(6);
  ctx.stroke();
  // 大きな頭(右を向く)
  ctx.save();
  ctx.translate(10 + P.twist * 10, -300);
  roundRectPath(ctx, -100, -82, 200, 160, 50);
  ctx.fillStyle = '#1b1822';
  ctx.fill();
  line(8);
  ctx.stroke();
  // ヘルメットのつば(シアン)
  ctx.fillStyle = '#2fe0ff';
  roundRectPath(ctx, 40, -20, 92, 26, 12);
  ctx.fill();
  line(6);
  ctx.stroke();
  // 耳のアンテナ
  ctx.fillStyle = COLORS.yellow;
  roundRectPath(ctx, -116, -20, 26, 50, 8);
  ctx.fill();
  line(5);
  ctx.stroke();
  // LEDの目(画面の帯)
  roundRectPath(ctx, -10, 10, 104, 46, 18);
  ctx.fillStyle = '#05060a';
  ctx.fill();
  line(5);
  ctx.stroke();
  ctx.strokeStyle = '#2fe0ff';
  ctx.fillStyle = '#2fe0ff';
  ctx.shadowColor = '#2fe0ff';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const ex of [22, 66]) {
    ctx.beginPath();
    if (P.eyes === 'happy') ctx.arc(ex, 38, 10, Math.PI * 1.1, Math.PI * 1.9);
    else if (P.eyes === 'dizzy') {
      ctx.moveTo(ex - 9, 24);
      ctx.lineTo(ex + 9, 42);
      ctx.moveTo(ex + 9, 24);
      ctx.lineTo(ex - 9, 42);
    } else if (P.eyes === 'focus') {
      ctx.moveTo(ex - 10, 33);
      ctx.lineTo(ex + 10, 33);
    } else {
      ctx.arc(ex, 33, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
  // バット(頭の上に重ねて、よく見えるように)
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(P.bat);
  roundRectPath(ctx, -10, -14, 230, 28, 12);
  const bg = ctx.createLinearGradient(0, 0, 230, 0);
  bg.addColorStop(0, '#2a2a33');
  bg.addColorStop(0.6, '#3a3a48');
  bg.addColorStop(1, '#14141c');
  ctx.fillStyle = bg;
  ctx.fill();
  line(6);
  ctx.stroke();
  for (const sx of [70, 120, 170]) {
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(sx, -12, 12, 24);
  }
  ctx.fillStyle = '#2fe0ff';
  ctx.shadowColor = '#2fe0ff';
  ctx.shadowBlur = 16;
  roundRectPath(ctx, 200, -10, 20, 20, 6);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  // にぎり(手)
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.arc(hx, hy, 24, 0, Math.PI * 2);
  ctx.fill();
  line(6);
  ctx.stroke();
  ctx.restore();
}

export type PitcherPose = 'ready' | 'windup' | 'throw';
export const PITCHER_SIZE = { w: 220, h: 300 };

/** ピッチャーロボット: 細め・赤と黒・メカの投げる腕。こちら(バッター)を向いている */
export function drawPitcher(ctx: CanvasRenderingContext2D, pose: PitcherPose): void {
  const { w, h } = PITCHER_SIZE;
  const arm = { ready: 2.4, windup: -2.4, throw: 0.9 }[pose];
  const knee = pose === 'windup' ? 1 : 0;
  ctx.save();
  ctx.translate(w / 2, h - 10);
  ctx.lineJoin = 'round';
  const out = (lw = 6) => {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.stroke();
  };
  // 足(振りかぶると片足を上げる)
  ctx.fillStyle = '#1a1620';
  roundRectPath(ctx, -34, -90, 26, 90, 10);
  ctx.fill();
  out();
  roundRectPath(ctx, 8, -90 - knee * 40, 26, 90 - knee * 30, 10);
  ctx.fill();
  out();
  // 細い体
  roundRectPath(ctx, -40, -190, 80, 110, 22);
  ctx.fillStyle = '#d8283c';
  ctx.fill();
  out();
  ctx.fillStyle = '#1a1620';
  ctx.fillRect(-38, -140, 76, 14);
  // 反対の腕
  ctx.beginPath();
  ctx.moveTo(-36, -170);
  ctx.lineTo(-70, -120);
  ctx.lineCap = 'round';
  ctx.lineWidth = 22;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#3a3440';
  ctx.stroke();
  // メカの投げる腕(関節つき)
  ctx.save();
  ctx.translate(36, -172);
  ctx.rotate(arm);
  ctx.fillStyle = '#3a3440';
  roundRectPath(ctx, -10, -12, 86, 24, 10);
  ctx.fill();
  out();
  ctx.fillStyle = '#d8283c';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  out(5);
  ctx.fillStyle = '#ffd23a';
  ctx.beginPath();
  ctx.arc(80, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  out(5);
  ctx.restore();
  // 頭: 小さめ、赤いバイザー
  roundRectPath(ctx, -44, -262, 88, 74, 24);
  ctx.fillStyle = '#1a1620';
  ctx.fill();
  out(6);
  roundRectPath(ctx, -34, -238, 68, 24, 10);
  ctx.fillStyle = '#ff3b4f';
  ctx.shadowColor = '#ff3b4f';
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
  // 角(ちょっと悪そう)
  ctx.fillStyle = '#d8283c';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 30, -258);
    ctx.lineTo(s * 46, -292);
    ctx.lineTo(s * 14, -262);
    ctx.closePath();
    ctx.fill();
    out(4);
  }
  ctx.restore();
}

/** ボール: 白く光るボールに、赤とシアンのぬい目。size の正方形のまん中に描く */
export function drawBall(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size / 2 - 4;
  ctx.translate(size / 2, size / 2);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.7, '#f1f4ff');
  g.addColorStop(1, '#b9c4e0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // ぬい目(左右のカーブ + 小さな縫い目)
  for (const [s, color] of [[-1, '#ff3b4f'], [1, '#18c8ff']] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.045;
    ctx.beginPath();
    ctx.arc(s * r * 1.3, 0, r * 0.9, s < 0 ? -0.95 : Math.PI - 0.95, s < 0 ? 0.95 : Math.PI + 0.95);
    ctx.stroke();
    ctx.lineWidth = size * 0.025;
    for (let i = -3; i <= 3; i++) {
      const a = (s < 0 ? 0 : Math.PI) + i * 0.27;
      const cx = s * r * 1.3 + Math.cos(a) * r * 0.9;
      const cy = Math.sin(a) * r * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - s * size * 0.05, cy - size * 0.03);
      ctx.lineTo(cx + s * size * 0.05, cy + size * 0.03);
      ctx.stroke();
    }
  }
  // つや
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** やわらかい光(ボールのまわり・打った瞬間の光に使う。色は tint で変える) */
export function drawGlow(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** ミートカーソル(黄色い輪と十字。まん中ほど芯) */
export function drawCursor(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  ctx.translate(c, c);
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(22,16,28,0.8)';
  ctx.beginPath();
  ctx.ellipse(0, 0, c - 8, (c - 8) * 0.87, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = COLORS.yellow;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,210,58,0.16)';
  ctx.fill();
  ctx.strokeStyle = '#2fe0ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-c * 0.35, 0);
  ctx.lineTo(c * 0.35, 0);
  ctx.moveTo(0, -c * 0.3);
  ctx.lineTo(0, c * 0.3);
  ctx.stroke();
}
