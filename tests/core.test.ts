import { describe, expect, it } from 'vitest';
import { hslToRgb, rgbToHsl } from '../src/core/color';
import { appearanceDistance, createDistinctDna, generateDna, GENERATOR_VERSION } from '../src/core/dna';
import { PALETTES } from '../src/core/palettes';
import { chooseIdleAction, reactToPet } from '../src/core/reaction';
import { classify, recolorPixels } from '../src/core/recolor';
import { mulberry32 } from '../src/core/rng';

describe('rng', () => {
  it('同じ種なら同じ乱数列になる', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('dna', () => {
  it('同じ種なら同じDNAになる', () => {
    expect(generateDna(123, 'x')).toEqual(generateDna(123, 'x'));
  });

  it('違う種なら見た目が違う', () => {
    const a = generateDna(1, 'a').appearance;
    const b = generateDna(2, 'b').appearance;
    expect(appearanceDistance(a, b)).toBeGreaterThan(0);
    expect(appearanceDistance(a, a)).toBe(0);
  });

  it('値が決められた範囲に収まる', () => {
    for (let seed = 0; seed < 300; seed++) {
      const d = generateDna(seed, String(seed));
      expect(d.generatorVersion).toBe(GENERATOR_VERSION);
      for (const v of Object.values(d.personality)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(d.appearance.bodyScaleX).toBeGreaterThan(0.5);
      if (d.appearance.layout === 'headOnBody') expect(['none', 'spike']).toContain(d.appearance.topper);
    }
  });

  it('既存の個体と近すぎない個体を選ぶ', () => {
    let seed = 0;
    const born = [generateDna(999, 'first').appearance];
    const dna = createDistinctDna(born, () => seed++, () => 'id');
    expect(appearanceDistance(born[0], dna.appearance)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('recolor', () => {
  it('HSLとRGBを往復できる', () => {
    const [r, g, b] = hslToRgb(rgbToHsl(254, 115, 15));
    expect(Math.abs(r - 254) + Math.abs(g - 115) + Math.abs(b - 15)).toBeLessThanOrEqual(3);
  });

  it('元絵の色を正しく分類する', () => {
    expect(classify(rgbToHsl(254, 115, 15))).toBe('primary');
    expect(classify(rgbToHsl(254, 224, 188))).toBe('belly');
    expect(classify(rgbToHsl(150, 60, 170))).toBe('secondary');
    expect(classify(rgbToHsl(5, 3, 8))).toBe('outline');
  });

  it('主色は配色セットの色相になり、輪郭線は変わらない', () => {
    const palette = PALETTES.find((p) => p.id === 'cobalt')!;
    const px = new Uint8ClampedArray([254, 115, 15, 255, 5, 3, 8, 255]);
    recolorPixels(px, palette, { belly: true });
    expect(Math.abs(rgbToHsl(px[0], px[1], px[2]).h - palette.primary.h)).toBeLessThan(3);
    expect([px[4], px[5], px[6]]).toEqual([5, 3, 8]);
  });
});

describe('reaction', () => {
  const base = { bravery: 50, caution: 50, curiosity: 50, sociability: 50, clinginess: 50, competitiveness: 50, focus: 50 };
  const count = (p: typeof base) => {
    const rng = mulberry32(7);
    let happy = 0;
    for (let i = 0; i < 1000; i++) if (reactToPet(p, rng) === 'happy') happy++;
    return happy;
  };

  it('人懐っこい子はなでると喜びやすく、そうでない子は嫌がりやすい', () => {
    const friendly = count({ ...base, sociability: 95, clinginess: 95, competitiveness: 10 });
    const grumpy = count({ ...base, sociability: 5, clinginess: 5, competitiveness: 95 });
    expect(friendly).toBeGreaterThan(700);
    expect(grumpy).toBeLessThan(300);
  });

  it('元気がないと眠りやすい', () => {
    const rng = mulberry32(3);
    let sleeps = 0;
    for (let i = 0; i < 500; i++) if (chooseIdleAction(base, 5, rng) === 'sleep') sleeps++;
    expect(sleeps).toBeGreaterThan(150);
  });
});
