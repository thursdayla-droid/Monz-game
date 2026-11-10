import { describe, expect, it } from 'vitest';
import { cabinetLayout } from '../src/scenes/slotCabinet';

describe('MONZ SLOT の 台の 背景の 形', () => {
  for (const H of [1280, 1400, 1558, 1600]) {
    it(`画面の 高さ ${H}: 窓が 画面に おさまり、図柄が 横に 5つ 入る`, () => {
      const L = cabinetLayout(720, H, 8, 124);
      const total = L.slices.reduce((a, s) => a + s.dh, 0);
      expect(total).toBeCloseTo(H, 0);
      expect(L.lcd.h).toBeGreaterThanOrEqual(110);
      expect(L.cell).toBeGreaterThanOrEqual(56);
      expect(5 * L.cell + 4 * 8).toBeLessThanOrEqual(L.reel.w);
      expect(3 * L.cell + 2 * 8).toBeLessThanOrEqual(L.reel.h);
      expect(L.tray.y + L.tray.h).toBeLessThanOrEqual(H);
      expect(L.lcd.y + L.lcd.h).toBeLessThan(L.reel.y);
      expect(L.reel.y + L.reel.h).toBeLessThan(L.tray.y);
      console.log('cab', H, { cell: L.cell, lcd: [Math.round(L.lcd.w), Math.round(L.lcd.h)], reel: [Math.round(L.reel.w), Math.round(L.reel.h)], tray: [Math.round(L.tray.w), Math.round(L.tray.h)] });
    });
  }
});
