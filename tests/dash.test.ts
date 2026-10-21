import { describe, expect, it } from 'vitest';
import { airtime, DASH, dashReward, jump, jumpHeight, meters, newDash, step } from '../src/core/dash';

type State = ReturnType<typeof newDash>;

/** かんたんな判断: 足場の終わりが近い、または止まっているトゲが近いならジャンプ */
function simpleWants(s: State): boolean {
  const fx = s.dist + DASH.runnerX;
  const cur = s.platforms.find((p) => fx >= p.x && fx <= p.x + p.w);
  const danger = s.things.find((th) => th.kind === 'danger' && !th.bounce && th.x > fx && th.x - fx < s.speed * 0.22);
  // 足場の端から落ちはじめた直後(少しのあいだはまだ跳べる)
  const justLeft = !s.grounded && s.vy >= 0 && s.airTime < DASH.coyote * 0.8;
  return justLeft || (s.grounded && ((!!cur && cur.x + cur.w - fx < s.speed * 0.06) || !!danger));
}

/** 少し先まで試しに進めて、生きのこれるか。jumpAt: 何フレーム後にジャンプするか(-1 ならしない) */
function survives(s0: State, jumpAt: number, frames: number): boolean {
  const s = structuredClone(s0);
  for (let i = 0; i < frames && !s.over; i++) {
    if (i === jumpAt) jump(s);
    else if (simpleWants(s)) jump(s);
    step(s, 1 / 60);
  }
  return !s.over;
}

/**
 * 自動で遊ぶ: 足場の終わりが近づいたらジャンプ。
 * はねるトゲが近いときは「何もしない」と「今ジャンプ」を少し先まで試して、生きのこれる方を選ぶ(人が見てよけるのと同じ)
 */
function autoplay(seed: number, seconds: number, onStep?: (s: State) => void) {
  const s = newDash(seed);
  const dt = 1 / 60;
  for (let t = 0; t < seconds && !s.over; t += dt) {
    const fx = s.dist + DASH.runnerX;
    if (simpleWants(s)) jump(s);
    else if (s.grounded && s.things.some((th) => th.bounce && th.x + th.w > fx - 40 && th.x - fx < s.speed)) {
      // 何もしなくて大丈夫なら何もしない。だめなら、いちばん早く跳べばよけられるタイミングを探す
      if (!survives(s, -1, 90)) {
        for (let k = 0; k < 40; k++) {
          if (!survives(s, k, 90)) continue;
          if (k === 0) jump(s);
          break;
        }
      }
    }
    step(s, dt);
    onStep?.(s);
  }
  return s;
}

describe('DASH MONZ', () => {
  it('jump height and airtime are fixed', () => {
    expect(jumpHeight()).toBeGreaterThan(130);
    expect(jumpHeight()).toBeLessThan(170);
    expect(airtime()).toBeGreaterThan(0.6);
  });

  it('runs right, speeds up, and falls off if you never jump', () => {
    const s = newDash(1);
    for (let i = 0; i < 60 * 20 && !s.over; i++) step(s, 1 / 60);
    expect(s.over).toBe('fall');
    expect(s.speed).toBeGreaterThan(DASH.startSpeed);
    expect(meters(s)).toBeGreaterThan(5);
  });

  it('cannot jump in the air', () => {
    const s = newDash(2);
    expect(jump(s)).toBe(true);
    step(s, 0.2);
    expect(jump(s)).toBe(false);
  });

  it('spikes appear from early on', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // 最初の30秒のうちに、トゲがいくつか出る
      const seen = new Set<object>();
      const s = autoplay(seed, 30, (st) => st.things.forEach((th) => th.kind === 'danger' && seen.add(th)));
      expect(s.over).toBe(false);
      expect(seen.size).toBeGreaterThan(3);
    }
  });

  it('magma platforms appear sometimes, and running onto one ends the game', () => {
    const seen = new Set<object>();
    for (let seed = 1; seed <= 10; seed++) autoplay(seed, 60, (st) => st.platforms.forEach((p) => p.magma && seen.add(p)));
    expect(seen.size).toBeGreaterThan(5);
    // 跳ばずに走ると、マグマか落下で終わる。マグマのコースを探して確かめる
    let magmaOver = false;
    for (let seed = 1; seed <= 200 && !magmaOver; seed++) {
      const s = newDash(seed);
      s.platforms = [{ x: -400, w: 1000, y: 900 }, { x: 600, w: 200, y: 900 + DASH.magmaDrop, magma: true }, { x: 800, w: 2000, y: 900 }];
      s.nextX = 2800;
      for (let i = 0; i < 600 && !s.over; i++) step(s, 1 / 60);
      magmaOver = s.over === 'magma';
    }
    expect(magmaOver).toBe(true);
  });

  it('courses are always passable by a simple bot for a long time', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = autoplay(seed, 90);
      expect(s.over, `seed ${seed} at ${meters(s)}m`).toBe(false);
    }
  });

  it('short platforms appear after 150m and the bot can still run far', () => {
    let shorts = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const seen = new Set<object>();
      const s = autoplay(seed, 240, (st) => st.platforms.forEach((p) => p.x > DASH.shortFrom && p.w < st.speed * airtime() * 0.66 && !p.magma && seen.add(p)));
      expect(s.over, `seed ${seed} at ${meters(s)}m`).toBe(false);
      expect(meters(s)).toBeGreaterThan(1000);
      shorts += seen.size;
    }
    expect(shorts).toBeGreaterThan(30);
  }, 30000);

  it('later on, short platforms come several in a row, and it gets faster', () => {
    let chains = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const all: { x: number; w: number }[] = [];
      const known = new Set<object>();
      const s = autoplay(seed, 240, (st) => st.platforms.forEach((p) => known.has(p) || (known.add(p), all.push(p))));
      expect(s.speed).toBeGreaterThan(900);
      let run = 0;
      for (const p of all) {
        run = p.w < 400 && p.x > DASH.shortFrom ? run + 1 : 0;
        if (run === 3) chains++;
      }
    }
    expect(chains).toBeGreaterThan(5);
  }, 30000);

  it('keeps getting harder after 700m (faster, up to 2000m) and is still passable', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = autoplay(seed, 330);
      expect(s.over, `seed ${seed} at ${meters(s)}m`).toBe(false);
      expect(meters(s)).toBeGreaterThan(2500);
      expect(s.speed).toBeGreaterThan(DASH.topSpeed - 1);
    }
  }, 60000);

  it('bouncing spikes appear later and can be dodged', () => {
    let bounces = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const seen = new Set<object>();
      const s = autoplay(seed, 240, (st) => st.things.forEach((th) => th.bounce && seen.add(th)));
      expect(s.over, `seed ${seed} at ${meters(s)}m`).toBe(false);
      bounces += seen.size;
    }
    expect(bounces).toBeGreaterThan(30);
  }, 30000);

  it('same seed gives the same course', () => {
    expect(autoplay(5, 20).dist).toBe(autoplay(5, 20).dist);
  });

  it('rewards 1 coin per 500m', () => {
    expect(dashReward(99)).toEqual({ coins: 0, exp: 0 });
    expect(dashReward(499)).toEqual({ coins: 0, exp: 0 });
    expect(dashReward(500)).toEqual({ coins: 1, exp: 1 });
    expect(dashReward(599)).toEqual({ coins: 1, exp: 1 });
    expect(dashReward(600)).toEqual({ coins: 1, exp: 2 });
    expect(dashReward(1250)).toEqual({ coins: 2, exp: 8 });
    expect(dashReward(1400)).toEqual({ coins: 2, exp: 10 });
    expect(dashReward(3000)).toEqual({ coins: 6, exp: 10 });
  });
});
