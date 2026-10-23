import { describe, expect, it } from 'vitest';
import { STAGE } from '../src/core/battle';
import { CAMERA, cameraBounds, cameraTarget, smoothCamera, stageZoom } from '../src/core/battleCamera';

const W = 1280;
const H = 720;

describe('battle camera (auto zoom)', () => {
  it('zooms in when close and out when far, and shows everyone', () => {
    const near = cameraTarget([{ x: 800, y: 720 }, { x: 900, y: 720 }], STAGE, W, H);
    const far = cameraTarget([{ x: 250, y: 720 }, { x: 1500, y: 720 }], STAGE, W, H);
    expect(near.zoom).toBeGreaterThan(far.zoom);
    expect(near.zoom).toBeLessThanOrEqual(CAMERA.maxZoom);
    // 遠いときも2人とも画面に入る
    const hw = W / far.zoom / 2;
    expect(far.x - hw).toBeLessThan(250);
    expect(far.x + hw).toBeGreaterThan(1500);
  });

  it('follows up and down (jumps, launches)', () => {
    const ground = cameraTarget([{ x: 800, y: 720 }, { x: 900, y: 720 }], STAGE, W, H);
    const high = cameraTarget([{ x: 800, y: 720 }, { x: 900, y: 150 }], STAGE, W, H);
    expect(high.y).toBeLessThan(ground.y);
    const hh = H / high.zoom / 2;
    expect(high.y - hh).toBeLessThan(150 - 120);
  });

  it('keeps within the allowed area, even when someone flies off stage', () => {
    const b = cameraBounds(STAGE);
    const v = cameraTarget([{ x: 900, y: 720 }, { x: STAGE.blast.x1 - 10, y: 300 }], STAGE, W, H);
    expect(v.zoom).toBeGreaterThanOrEqual(CAMERA.minZoom);
    // 映してよい範囲より広く映すときは、範囲のまん中。そうでなければ範囲の中
    if (W / v.zoom > b.x1 - b.x0) expect(v.x).toBeCloseTo((b.x0 + b.x1) / 2);
    else expect(v.x + W / v.zoom / 2).toBeLessThanOrEqual(b.x1 + 0.01);
    // だれもいないときは、ステージ全体
    expect(cameraTarget([], STAGE, W, H).zoom).toBeCloseTo(Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, stageZoom(STAGE, W, H))), 1);
  });

  it('moves smoothly toward the target (zooming out faster than in)', () => {
    const a = { x: 0, y: 0, zoom: 1 };
    const s1 = smoothCamera(a, { x: 100, y: 0, zoom: 0.6 }, 1 / 60);
    expect(s1.x).toBeGreaterThan(0);
    expect(s1.x).toBeLessThan(100);
    const out = 1 - s1.zoom;
    const s2 = smoothCamera({ x: 0, y: 0, zoom: 0.6 }, { x: 0, y: 0, zoom: 1 }, 1 / 60);
    expect(s2.zoom - 0.6).toBeLessThan(out);
    expect(s2.zoom).toBeGreaterThan(0.6);
  });
});
