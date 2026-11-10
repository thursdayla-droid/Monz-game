import type * as Phaser from 'phaser';

/**
 * MONZ SLOT の 台の 背景(2026-11-10 企画者の 絵。元は design/slot/cabinet_bg.png・934×1684)。
 * 絵の 窓(液晶・リール・ボタンの 台)に、液晶・リール・ボタンを 合わせる。
 * 絵の 形は 9:16 なので、スマホの 形(たて長)に 合わせて、窓の まん中の まっすぐな 所だけ たてに のばす
 * (王冠・角・かざりは そのままの 形。横は 切らない)。
 */
export const CAB_KEY = 'slot:cabinet';
export const CAB_FILE = 'assets/slot/cabinet_bg.webp';
const ART_W = 934;
const ART_H = 1684;

/** 絵の 中の 窓(絵の 点)。2026-11-10 に 絵の 暗い 所を はかった */
const ART = {
  lcd: { x0: 131, x1: 802, y0: 264, y1: 687 },
  reel: { x0: 92, x1: 850, y0: 848, y1: 1174 },
  tray: { x0: 43, x1: 890, y0: 1341, y1: 1518 },
};
/** のばして いい 所(窓の まん中の、横の ふちが まっすぐな 所) */
const STRETCH = { lcd: [350, 600], reel: [900, 1120], tray: [1380, 1480] } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CabinetLayout {
  /** 絵の たての 切れ目(絵の 点 → 画面の 点) */
  slices: { sy: number; sh: number; dy: number; dh: number }[];
  lcd: Rect;
  reel: Rect;
  tray: Rect;
  cell: number;
}

/**
 * 画面の 大きさ(W×H)から 台の 形を 決める。gap: 図柄の すき間
 * ボタンの 台は 250 くらい・図柄は 横に 5つ 入る いちばん 大きい 大きさ・のこりを 液晶に
 */
export function cabinetLayout(W: number, H: number, gap: number, cellMax: number): CabinetLayout {
  const k = W / ART_W;
  const fixedArt = STRETCH.lcd[0] + (STRETCH.reel[0] - STRETCH.lcd[1]) + (STRETCH.tray[0] - STRETCH.reel[1]) + (ART_H - STRETCH.tray[1]);
  const fixed = fixedArt * k;
  const trayEdges = (STRETCH.tray[0] - ART.tray.y0 + ART.tray.y1 - STRETCH.tray[1]) * k;
  const reelEdges = (STRETCH.reel[0] - ART.reel.y0 + ART.reel.y1 - STRETCH.reel[1]) * k;
  const reelW = (ART.reel.x1 - ART.reel.x0) * k;
  // 図柄の 大きさ: 横に 5つ 入る いちばん 大きい もの
  let cell = Math.min(cellMax, Math.floor((reelW - 16 - 4 * gap) / 5));
  let tray = Math.max(0, 250 - trayEdges);
  const reelNeed = (c: number) => Math.max(0, 3 * c + 2 * gap + 16 - reelEdges);
  let reel = reelNeed(cell);
  let lcd = H - fixed - tray - reel;
  // 画面が 短い 時: 液晶を 少なくとも 110 は 残す(図柄と ボタンの 台を 少し 小さく)
  const lcdMin = 110;
  if (lcd < lcdMin) {
    tray = Math.max(170 - trayEdges, tray - (lcdMin - lcd));
    lcd = H - fixed - tray - reel;
    if (lcd < lcdMin) {
      reel = Math.max(0, H - fixed - tray - lcdMin);
      cell = Math.max(56, Math.floor((reel + reelEdges - 16 - 2 * gap) / 3));
      lcd = H - fixed - tray - reel;
    }
  }
  const seg: [number, number, number][] = [
    [0, STRETCH.lcd[0], STRETCH.lcd[0] * k],
    [STRETCH.lcd[0], STRETCH.lcd[1], Math.max(0, lcd)],
    [STRETCH.lcd[1], STRETCH.reel[0], (STRETCH.reel[0] - STRETCH.lcd[1]) * k],
    [STRETCH.reel[0], STRETCH.reel[1], reel],
    [STRETCH.reel[1], STRETCH.tray[0], (STRETCH.tray[0] - STRETCH.reel[1]) * k],
    [STRETCH.tray[0], STRETCH.tray[1], tray],
    [STRETCH.tray[1], ART_H, (ART_H - STRETCH.tray[1]) * k],
  ];
  const slices: CabinetLayout['slices'] = [];
  let dy = 0;
  for (const [a, b, dh] of seg) {
    slices.push({ sy: a, sh: b - a, dy, dh });
    dy += dh;
  }
  /** 絵の たての 位置 → 画面の たての 位置 */
  const mapY = (y: number) => {
    for (const s of slices) if (y <= s.sy + s.sh) return s.dy + ((y - s.sy) / s.sh) * s.dh;
    return dy;
  };
  const rect = (r: { x0: number; x1: number; y0: number; y1: number }): Rect => ({ x: r.x0 * k, y: mapY(r.y0), w: (r.x1 - r.x0) * k, h: mapY(r.y1) - mapY(r.y0) });
  return { slices, lcd: rect(ART.lcd), reel: rect(ART.reel), tray: rect(ART.tray), cell };
}

/** 台の 絵を 画面の 形に 組み立てた 絵を 作る(すでに あれば それ) */
export function cabinetTexture(scene: Phaser.Scene, W: number, H: number, L: CabinetLayout): string | null {
  if (!scene.textures.exists(CAB_KEY)) return null;
  const key = `${CAB_KEY}:${W}x${Math.round(H)}`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(CAB_KEY).getSourceImage() as HTMLImageElement;
  const t = scene.textures.createCanvas(key, W, Math.round(H));
  const ctx = t?.getContext();
  if (!t || !ctx) return null;
  const sy = src.height / ART_H;
  ctx.fillStyle = '#0d0614';
  ctx.fillRect(0, 0, W, H);
  for (const s of L.slices) if (s.dh > 0.5) ctx.drawImage(src, 0, s.sy * sy, src.width, s.sh * sy, 0, Math.floor(s.dy), W, Math.ceil(s.dh) + 1);
  t.refresh();
  return key;
}
