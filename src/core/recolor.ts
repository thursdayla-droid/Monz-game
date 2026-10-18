import { clamp01, hslToRgb, rgbToHsl, type Hsl } from './color';
import type { Palette } from './palettes';

// 元絵(BUNK)の各色の代表値。パーツ表から計測した中央値。
const SRC_PRIMARY: Hsl = { h: 25, s: 0.98, l: 0.527 };
const SRC_SECONDARY: Hsl = { h: 299, s: 0.46, l: 0.44 };
const SRC_BELLY: Hsl = { h: 33, s: 0.94, l: 0.867 };

export type ColorClass = 'outline' | 'primary' | 'secondary' | 'belly' | 'other';

export function classify(c: Hsl): ColorClass {
  if (c.l < 0.2) return 'outline';
  if (c.h >= 250 && c.h < 335) return 'secondary';
  if (c.h >= 5 && c.h < 60) return c.l >= 0.72 ? 'belly' : 'primary';
  return 'other';
}

function shift(c: Hsl, src: Hsl, dst: Hsl): Hsl {
  return {
    h: dst.h + (c.h - src.h),
    s: clamp01(c.s * (dst.s / src.s)),
    l: clamp01(dst.l + (c.l - src.l)),
  };
}

/**
 * RGBAの画素列を配色セットに合わせて塗り替える(その場で書き換え)。
 * 陰影(明るさの差)は元絵のまま残す。輪郭線・口の中などは変えない。
 */
export function recolorPixels(data: Uint8ClampedArray, palette: Palette, opts: { belly: boolean }): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const c = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const cls = classify(c);
    let out: Hsl;
    if (cls === 'primary') out = shift(c, SRC_PRIMARY, palette.primary);
    else if (cls === 'secondary') out = shift(c, SRC_SECONDARY, palette.secondary);
    else if (cls === 'belly' && opts.belly) out = shift(c, SRC_BELLY, palette.belly);
    else continue;
    const [r, g, b] = hslToRgb(out);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
