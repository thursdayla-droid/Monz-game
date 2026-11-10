import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { BIG_REACHES, planShow, reachOf } from './reach';
import { spin, type Grid } from './slot';

const fill = ['bell', 'cherry', 'clover', 'star'] as const;
const grid = (cols: string[][]): Grid => Array.from({ length: 5 }, (_, r) => [0, 1, 2].map((i) => (cols[r]?.[i] ?? fill[(r + i) % 4]) as never));

describe('MONZ SLOT リーチ', () => {
  it('リーチに なる 図柄は レインボー7・ゴールド7・ダイヤ だけ・2リール から', () => {
    expect(reachOf(grid([['gold7'], ['bell', 'gold7']]))).toEqual({ symbol: 'gold7', chain: 2 });
    expect(reachOf(grid([['bell'], ['bell']]))).toBeNull();
    expect(reachOf(grid([['diamond'], ['star']]))).toBeNull();
    expect(reachOf(grid([['diamond', 'rainbow7'], ['rainbow7'], ['rainbow7'], ['diamond']]))?.chain).toBe(3);
  });

  it('見せ方を 決めても 結果は 変わらない', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 2000; i++) {
      const r = spin(rng, 50);
      const before = JSON.stringify(r);
      planShow(r, 50, rng);
      expect(JSON.stringify(r)).toBe(before);
    }
  });

  it('回数と 期待度(20万回転): 小さい リーチ 約7回に1回・大きい リーチ 約30回に1回・強 > 中 > 弱', () => {
    const rng = mulberry32(77);
    const N = 200_000;
    let small = 0;
    let big = 0;
    let notice = 0;
    let noticeMiss = 0;
    let miss = 0;
    const byType: Record<string, { n: number; win: number }> = {};
    for (let i = 0; i < N; i++) {
      const r = spin(rng, 10);
      const s = planShow(r, 10, rng);
      if (s.small) small++;
      if (s.big) {
        big++;
        const t = (byType[s.big.id] ??= { n: 0, win: 0 });
        t.n++;
        if (s.bigSuccess) t.win++;
      }
      if (s.notice) notice++;
      if (!r.win && !r.bonus) {
        miss++;
        if (s.notice) noticeMiss++;
      }
    }
    expect(N / small).toBeGreaterThan(6);
    expect(N / small).toBeLessThan(9);
    expect(N / big).toBeGreaterThan(25);
    expect(N / big).toBeLessThan(36);
    const rate = (id: string) => byType[id].win / byType[id].n;
    expect(rate('strong')).toBeGreaterThan(rate('mid'));
    expect(rate('mid')).toBeGreaterThan(rate('weak'));
    expect(BIG_REACHES).toHaveLength(3);
    // 予告は ときどき(ハズレでも 少し)
    expect(notice / N).toBeGreaterThan(0.02);
    expect(notice / N).toBeLessThan(0.15);
    expect(noticeMiss / miss).toBeGreaterThan(0.01);
    // 結果を 出す(記録 用)
    console.log('slot reach', { small: (N / small).toFixed(1), big: (N / big).toFixed(1), weak: rate('weak').toFixed(2), mid: rate('mid').toFixed(2), strong: rate('strong').toFixed(2), notice: ((notice / N) * 100).toFixed(1) + '%' });
  });
});

describe('MONZ SLOT 演出(色・ステップアップ・告知ランプ・PUSH・連続・コイン)', () => {
  it('告知ランプは 当たりの 時だけ・虹は 当たりの 時だけ・アツい 色ほど 当たる', () => {
    const rng = mulberry32(2026);
    const N = 200_000;
    const tier: Record<string, { n: number; hit: number }> = {};
    const step: Record<number, { n: number; hit: number }> = {};
    let lamp = 0;
    let push = 0;
    let chain = 0;
    for (let i = 0; i < N; i++) {
      const r = spin(rng, 10);
      const s = planShow(r, 10, rng);
      const hot = r.bonus || r.win >= 100 || s.bigSuccess;
      if (s.lamp !== 'none') {
        lamp++;
        expect(hot).toBe(true);
      }
      if (s.big) {
        const t = (tier[s.bigTier] ??= { n: 0, hit: 0 });
        t.n++;
        if (s.bigSuccess) t.hit++;
        if (s.bigTier === 'rainbow') expect(s.bigSuccess).toBe(true);
        if (s.push) push++;
        if (s.chain) chain++;
      }
      if (s.notice) {
        const t = (step[s.notice] ??= { n: 0, hit: 0 });
        t.n++;
        if (hot) t.hit++;
      }
      if (s.fountain) expect(r.win).toBeGreaterThanOrEqual(50);
    }
    const rate = (o: { n: number; hit: number } | undefined) => (o && o.n ? o.hit / o.n : 0);
    expect(rate(tier.red)).toBeGreaterThan(rate(tier.blue));
    expect(rate(tier.gold)).toBeGreaterThan(rate(tier.red));
    expect(rate(step[5])).toBeGreaterThan(rate(step[1]));
    expect(lamp).toBeGreaterThan(0);
    expect(push).toBeGreaterThan(0);
    expect(chain).toBeGreaterThan(0);
    console.log('slot show', {
      tier: Object.fromEntries(Object.entries(tier).map(([k, v]) => [k, `${(rate(v) * 100).toFixed(0)}% (${v.n})`])),
      step: Object.fromEntries(Object.entries(step).map(([k, v]) => [k, `${(rate(v) * 100).toFixed(0)}% (${v.n})`])),
      lamp: `${(N / lamp).toFixed(0)}回に1回`,
    });
  });
});
