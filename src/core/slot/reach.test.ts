import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { BIG_REACHES, planShow, reachOf } from './reach';
import { spin, type Grid } from './slot';

const fill = ['bell', 'cherry', 'clover', 'star'] as const;
const grid = (cols: string[][]): Grid => Array.from({ length: 5 }, (_, r) => [0, 1, 2].map((i) => (cols[r]?.[i] ?? fill[(r + i) % 4]) as never));

describe('MONZ SLOT リーチ', () => {
  it('リーチに なる 図柄は レインボー7・ゴールド7 だけ・2リール から(2026-11-12 ダイヤを 外した)', () => {
    expect(reachOf(grid([['gold7'], ['bell', 'gold7']]))).toEqual({ symbol: 'gold7', chain: 2 });
    expect(reachOf(grid([['bell'], ['bell']]))).toBeNull();
    expect(reachOf(grid([['diamond'], ['star']]))).toBeNull();
    expect(reachOf(grid([['diamond'], ['diamond'], ['diamond']]))).toBeNull();
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

  it('回数(20万回転): 小さい リーチ 約110回に1回・キャラの リーチ(7) 約55回に1回(企画者 2026-11-12: 7が 2個で キャラの リーチ・ダイヤは リーチ なし)', () => {
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
    expect(N / small).toBeGreaterThan(80);
    expect(N / small).toBeLessThan(150);
    expect(N / big).toBeGreaterThan(35);
    expect(N / big).toBeLessThan(62);
    const rate = (id: string) => byType[id].win / byType[id].n;
    expect(BIG_REACHES.map((t) => t.id)).toEqual(['kyon', 'panda', 'usagi', 'ramen', 'golf', 'kanojo', 'premium']);
    // 予告は ときどき(ハズレでも 少し)
    expect(notice / N).toBeGreaterThan(0.02);
    expect(notice / N).toBeLessThan(0.15);
    expect(noticeMiss / miss).toBeGreaterThan(0.01);
    // 結果を 出す(記録 用)
    console.log('slot reach', { small: (N / small).toFixed(1), big: (N / big).toFixed(1), kyon: rate('kyon').toFixed(2), notice: ((notice / N) * 100).toFixed(1) + '%' });
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
      const hot = r.bonus || r.free > 0 || r.win >= 100 || s.bigSuccess;
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
    // 連続演出は なくした(企画者 2026-11-12)
    expect(chain).toBe(0);
    console.log('slot show', {
      tier: Object.fromEntries(Object.entries(tier).map(([k, v]) => [k, `${(rate(v) * 100).toFixed(0)}% (${v.n})`])),
      step: Object.fromEntries(Object.entries(step).map(([k, v]) => [k, `${(rate(v) * 100).toFixed(0)}% (${v.n})`])),
      lamp: `${(N / lamp).toFixed(0)}回に1回`,
    });
  });
});

describe('種類が ある リーチ(企画者 2026-11-11: ラーメン 3種類・ゴルフの 芝生 3種類で 当たりやすさが ちがう)', () => {
  it('種類は 種類が ある リーチの 時だけ・3番目 > 2番目 > 1番目 の 順に 当たりやすい', () => {
    expect(BIG_REACHES.filter((t) => t.variants).map((t) => t.id)).toEqual(['ramen', 'golf', 'kanojo']);
    const ids = ['ramen', 'golf'];
    const n: Record<string, number[]> = { kanojo: [0, 0, 0, 0, 0] };
    const win: Record<string, number[]> = { kanojo: [0, 0, 0, 0, 0] };
    for (const id of ids) {
      n[id] = [0, 0, 0];
      win[id] = [0, 0, 0];
    }
    for (let i = 1; i < 1_000_000; i++) {
      const rng = mulberry32(i);
      const s = planShow(spin(rng, 10), 10, rng);
      if (!s.big?.variants) {
        expect(s.bigVariant).toBe(-1);
        continue;
      }
      expect(s.bigVariant).toBeGreaterThanOrEqual(0);
      n[s.big.id][s.bigVariant]++;
      if (s.bigSuccess) win[s.big.id][s.bigVariant]++;
    }
    for (const id of ids) {
      const rate = n[id].map((x, i) => win[id][i] / x);
      expect(n[id].every((x) => x > 30)).toBe(true);
      expect(rate[0]).toBeLessThan(rate[1]);
      expect(rate[1]).toBeLessThan(rate[2]);
    }
    // 彼女の 質問は 5つ どれも 出る(当たりやすさは 同じ。2026-11-12 仕事と 私を やめた)
    expect(n.kanojo.every((x) => x > 15)).toBe(true);
  }, 60_000);
});

describe('キャラの リーチの 当たる 確率(企画者 2026-11-11)', () => {
  it('キョンK 10%・うさぎK 30%・パンダY 20%・チーターS 80%(±4%)・パンダY は キョンK と 同じくらい 出る', () => {
    const n: Record<string, number> = {};
    const w: Record<string, number> = {};
    for (let i = 1; i < 1_000_000; i++) {
      const rng = mulberry32(i);
      const s = planShow(spin(rng, 10), 10, rng);
      if (!s.big) continue;
      n[s.big.id] = (n[s.big.id] ?? 0) + 1;
      if (s.bigSuccess) w[s.big.id] = (w[s.big.id] ?? 0) + 1;
    }
    const rate = (id: string) => w[id] / n[id];
    expect(Math.abs(rate('kyon') - 0.1)).toBeLessThan(0.04);
    expect(Math.abs(rate('usagi') - 0.3)).toBeLessThan(0.04);
    expect(Math.abs(rate('panda') - 0.2)).toBeLessThan(0.04);
    // チーターS は めったに 出ない(100万回転で 約200回)ので ぶれが 大きい
    expect(Math.abs(rate('kanojo') - 0.8)).toBeLessThan(0.07);
    // カンガルーH・ヒヨコJ は 今の 数字(約40%)で 決定
    expect(Math.abs(rate('ramen') - 0.4)).toBeLessThan(0.05);
    expect(Math.abs(rate('golf') - 0.4)).toBeLessThan(0.05);
    expect(n.panda / n.kyon).toBeGreaterThan(0.85);
    expect(n.panda / n.kyon).toBeLessThan(1.15);
  }, 60_000);
});

describe('キャラの リーチは 7が 2個から(企画者 2026-11-12「3個 そろってから ハズレは 微妙」)', () => {
  it('キャラの リーチは 7が 左から 2リール 以上・当たり = 3リール目にも 7・ダイヤでは 出ない', () => {
    for (let i = 1; i < 200_000; i++) {
      const rng = mulberry32(i);
      const r = spin(rng, 10);
      const s = planShow(r, 10, rng);
      if (!s.big) continue;
      expect(['gold7', 'rainbow7']).toContain(s.reach!.symbol);
      expect(s.reach!.chain).toBeGreaterThanOrEqual(2);
      expect(s.bigSuccess).toBe(s.reach!.chain >= 3);
      expect(s.small).toBe(false);
    }
  }, 60_000);
});

describe('王冠 2個の キャラの リーチ(企画者 2026-11-12「2」)', () => {
  it('王冠の リーチの 時だけ・約30%・キャラごとの 当たる 確率は 7の 時と ほぼ 同じ', async () => {
    const { crownReachReel, CROWN_STORY_RATE } = await import('./reach');
    let reachN = 0;
    let storyN = 0;
    const n: Record<string, number> = {};
    const w: Record<string, number> = {};
    for (let i = 1; i < 1_000_000; i++) {
      const rng = mulberry32(i);
      const r = spin(rng, 10);
      const s = planShow(r, 10, rng);
      const reach = crownReachReel(r.grid) >= 0;
      if (reach) reachN++;
      if (!s.crownBig) continue;
      expect(reach).toBe(true);
      storyN++;
      n[s.crownBig.id] = (n[s.crownBig.id] ?? 0) + 1;
      if (r.bonus || r.free > 0) w[s.crownBig.id] = (w[s.crownBig.id] ?? 0) + 1;
    }
    expect(Math.abs(storyN / reachN - CROWN_STORY_RATE)).toBeLessThan(0.02);
    const rate = (id: string) => w[id] / n[id];
    expect(Math.abs(rate('kyon') - 0.1)).toBeLessThan(0.04);
    expect(Math.abs(rate('panda') - 0.2)).toBeLessThan(0.05);
    expect(Math.abs(rate('usagi') - 0.3)).toBeLessThan(0.06);
  }, 120_000);
});

describe('ステップアップの 順番(企画者 2026-11-12)', () => {
  it('キャラの リーチが ある 時は その キャラの 段まで(半分は ステップアップなし)・ない 時は 6段目(チーター)まで 進まない', async () => {
    const { STEP_ORDER } = await import('./reach');
    expect(STEP_ORDER).toEqual(['kyon', 'panda', 'usagi', 'ramen', 'golf', 'kanojo']);
    const cnt = { win: { n: 0, step: 0 }, lose: { n: 0, step: 0 } };
    for (let i = 1; i < 300_000; i++) {
      const rng = mulberry32(i);
      const s = planShow(spin(rng, 10), 10, rng);
      const story = s.big ?? s.crownBig;
      if (story?.id === 'premium') expect(s.notice).toBe(0);
      else if (story) {
        // 2026-11-13: 半分は ステップアップなし(いきなり リーチ)
        expect([0, STEP_ORDER.indexOf(story.id) + 1]).toContain(s.notice);
        const k = s.bigSuccess || (s.crownBig && !s.big) ? 'win' : 'lose';
        cnt[k].n++;
        if (s.notice) cnt[k].step++;
      } else expect(s.notice).toBeLessThan(6);
    }
    // 当たり・ハズレに 関係なく だいたい 半分
    for (const k of ['win', 'lose'] as const) {
      expect(cnt[k].step / cnt[k].n).toBeGreaterThan(0.4);
      expect(cnt[k].step / cnt[k].n).toBeLessThan(0.6);
    }
  }, 60_000);
});

describe('プレミア(企画者 2026-11-12「100% 当たる」)', () => {
  it('アライグマR の プレミアは 当たりの 時だけ', () => {
    let n = 0;
    for (let i = 1; i < 1_000_000; i++) {
      const rng = mulberry32(i);
      const r = spin(rng, 10);
      const s = planShow(r, 10, rng);
      if (s.big?.id === 'premium') {
        n++;
        expect(s.bigSuccess).toBe(true);
      }
      if (s.crownBig?.id === 'premium') {
        n++;
        expect(r.bonus || r.free > 0).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(50);
  }, 120_000);
});
