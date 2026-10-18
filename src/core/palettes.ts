import type { Hsl } from './color';

/**
 * 配色セット。primary=体の主色(元絵のオレンジ)、secondary=差し色(元絵の紫)、belly=おなか(元絵のクリーム)。
 * 【仮】試作用。正式な配色は企画者・ChatGPTと決める。
 */
export interface Palette {
  id: string;
  primary: Hsl;
  secondary: Hsl;
  belly: Hsl;
}

export const PALETTES: readonly Palette[] = [
  { id: 'classic', primary: { h: 25, s: 0.98, l: 0.53 }, secondary: { h: 299, s: 0.46, l: 0.44 }, belly: { h: 33, s: 0.94, l: 0.87 } },
  { id: 'acid', primary: { h: 88, s: 0.75, l: 0.5 }, secondary: { h: 322, s: 0.8, l: 0.52 }, belly: { h: 58, s: 0.8, l: 0.88 } },
  { id: 'riot', primary: { h: 356, s: 0.78, l: 0.52 }, secondary: { h: 184, s: 0.7, l: 0.38 }, belly: { h: 38, s: 0.6, l: 0.88 } },
  { id: 'mint', primary: { h: 160, s: 0.55, l: 0.58 }, secondary: { h: 232, s: 0.5, l: 0.32 }, belly: { h: 150, s: 0.4, l: 0.9 } },
  { id: 'cobalt', primary: { h: 220, s: 0.75, l: 0.55 }, secondary: { h: 28, s: 0.95, l: 0.55 }, belly: { h: 210, s: 0.45, l: 0.9 } },
  { id: 'bubblegum', primary: { h: 330, s: 0.85, l: 0.68 }, secondary: { h: 52, s: 0.95, l: 0.5 }, belly: { h: 340, s: 0.6, l: 0.92 } },
  { id: 'tar', primary: { h: 265, s: 0.14, l: 0.36 }, secondary: { h: 72, s: 0.9, l: 0.5 }, belly: { h: 60, s: 0.25, l: 0.85 } },
  { id: 'lemon', primary: { h: 50, s: 0.95, l: 0.55 }, secondary: { h: 260, s: 0.15, l: 0.22 }, belly: { h: 45, s: 0.5, l: 0.92 } },
];
