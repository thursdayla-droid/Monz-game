import type { Hsl } from './color';
import { PALETTES, type Palette } from './palettes';
import { mulberry32, pick, pickWeighted, range, type Rng } from './rng';

/**
 * 生成ルールのバージョン。見た目の決め方を変えたら上げる。
 * 既に生まれた個体は保存されたDNAの値で描くので、ルールを変えても姿は変わらない。
 */
export const GENERATOR_VERSION = 1;

/** 隠しパラメータ(0-100)。指示書6章の候補。数値の意味・上限は【未確定】。 */
export interface Personality {
  bravery: number; // 勇敢さ
  caution: number; // 慎重さ
  curiosity: number; // 好奇心
  sociability: number; // 社交性
  clinginess: number; // 甘えん坊度
  competitiveness: number; // 負けず嫌い度
  focus: number; // 集中力
}

export type Layout = 'faceOnBody' | 'headOnBody';
export type Topper = 'none' | 'spike' | 'horns' | 'both';

export interface Appearance {
  family: 'bunk';
  layout: Layout;
  legs: boolean;
  topper: Topper;
  bodyScaleX: number;
  bodyScaleY: number;
  headScale: number;
  armScale: number;
  /** 腕の開き具合(度)。大きいほど拳が外側に来る */
  armSpread: number;
  legScale: number;
  eyeScale: number;
  /** 目と目の間隔の倍率 */
  eyeGap: number;
  mouthScale: number;
  /** 顔の上下位置のずれ(元絵px) */
  faceOffsetY: number;
  palette: Palette;
}

export interface Dna {
  id: string;
  seed: number;
  generatorVersion: number;
  appearance: Appearance;
  personality: Personality;
  /** 鳴き声の高さ(倍率) */
  voicePitch: number;
}

function jitter(rng: Rng, c: Hsl, dh: number, ds: number, dl: number): Hsl {
  return {
    h: c.h + range(rng, -dh, dh),
    s: Math.min(1, Math.max(0, c.s + range(rng, -ds, ds))),
    l: Math.min(0.95, Math.max(0.15, c.l + range(rng, -dl, dl))),
  };
}

/** 平均50付近に集まりやすい0-100の値 */
function trait(rng: Rng): number {
  return Math.round(((rng() + rng() + rng()) / 3) * 100);
}

/**
 * 種からDNAを作る。同じ種なら必ず同じDNAになる。
 * 【未確定】質問の回答による傾き(影響度40%案)はPhase 2で追加する。
 */
export function generateDna(seed: number, id: string): Dna {
  const rng = mulberry32(seed);
  const base = pick(rng, PALETTES);
  const palette: Palette = {
    id: base.id,
    primary: jitter(rng, base.primary, 10, 0.06, 0.05),
    secondary: jitter(rng, base.secondary, 12, 0.08, 0.05),
    belly: jitter(rng, base.belly, 8, 0.05, 0.03),
  };
  const layout = pickWeighted<Layout>(rng, ['faceOnBody', 'headOnBody'], [6, 4]);
  const appearance: Appearance = {
    family: 'bunk',
    layout,
    legs: rng() < 0.35,
    topper: pickWeighted<Topper>(rng, ['none', 'spike', 'horns', 'both'], layout === 'headOnBody' ? [6, 3, 0, 0] : [2, 4, 3, 1]),
    bodyScaleX: range(rng, 0.82, 1.15),
    bodyScaleY: range(rng, 0.8, 1.15),
    headScale: range(rng, 0.8, 1.2),
    armScale: range(rng, 0.75, 1.25),
    armSpread: range(rng, 22, 48),
    legScale: range(rng, 0.8, 1.15),
    eyeScale: range(rng, 0.8, 1.3),
    eyeGap: range(rng, 0.8, 1.3),
    mouthScale: range(rng, 0.75, 1.25),
    faceOffsetY: range(rng, -25, 25),
    palette,
  };
  const personality: Personality = {
    bravery: trait(rng),
    caution: trait(rng),
    curiosity: trait(rng),
    sociability: trait(rng),
    clinginess: trait(rng),
    competitiveness: trait(rng),
    focus: trait(rng),
  };
  return {
    id,
    seed,
    generatorVersion: GENERATOR_VERSION,
    appearance,
    personality,
    voicePitch: range(rng, 0.7, 1.5) / appearance.bodyScaleX,
  };
}

/**
 * 見た目の距離(0以上)。外見の重複対策で使う。値が小さいほど似ている。
 * 【提案】しきい値や重みは見比べながら調整する。
 */
export function appearanceDistance(a: Appearance, b: Appearance): number {
  const hue = (x: number, y: number) => {
    const d = Math.abs((((x - y) % 360) + 540) % 360 - 180);
    return d / 180;
  };
  let d = 0;
  d += a.layout === b.layout ? 0 : 1;
  d += a.legs === b.legs ? 0 : 0.6;
  d += a.topper === b.topper ? 0 : 0.4;
  d += hue(a.palette.primary.h, b.palette.primary.h) * 2;
  d += hue(a.palette.secondary.h, b.palette.secondary.h);
  d += Math.abs(a.palette.primary.l - b.palette.primary.l) * 2;
  d += Math.abs(a.bodyScaleX - b.bodyScaleX) + Math.abs(a.bodyScaleY - b.bodyScaleY);
  d += Math.abs(a.armScale - b.armScale) + Math.abs(a.headScale - b.headScale) * 0.5;
  d += Math.abs(a.eyeScale - b.eyeScale) * 0.5 + Math.abs(a.mouthScale - b.mouthScale) * 0.5;
  return d;
}

/**
 * 既にいる個体と見た目が近すぎない個体を作る。
 * 端末内の個体同士でのみ判定する(全プレイヤー間の判定はサーバー導入後)。
 */
export function createDistinctDna(
  existing: readonly Appearance[],
  nextSeed: () => number,
  nextId: () => string,
  minDistance = 0.9,
  maxTries = 30,
): Dna {
  let best: Dna | null = null;
  let bestDist = -1;
  for (let i = 0; i < maxTries; i++) {
    const dna = generateDna(nextSeed(), nextId());
    const dist = existing.length ? Math.min(...existing.map((a) => appearanceDistance(a, dna.appearance))) : Infinity;
    if (dist >= minDistance) return dna;
    if (dist > bestDist) {
      best = dna;
      bestDist = dist;
    }
  }
  return best!;
}
