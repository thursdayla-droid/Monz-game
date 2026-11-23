import { capReward, MINIGAME_REWARD_MULT } from './modes';
import { mulberry32, range, type Rng } from './rng';

/**
 * ミニゲーム「DASH MONZ」の動き(企画者仕様 2026-10-20)。Phaserに依存しない。
 * - 自動で右へ進む。画面タップでジャンプ(いつも同じ高さ・空中ではジャンプできない)
 * - 足場から落ちたら(画面の下へ)ゲームオーバー。危険な物に当たってもゲームオーバー
 * - さわっても大丈夫な物(参考ゲームのナルトの代わり。【未確定】見た目・役割は企画者が決める)は、当たっても何も起きない
 * - 進むほど少しずつ速くなる。走った距離がスコア
 * 足場は少し先まで自動で並べる。速さに合わせて、かならず跳べば届く幅・高さにする(運だけで終わらないように)。
 * 並び方は種(seed)から決まるので、同じ種なら同じコースになる(将来のランキングの確認用)。
 */

/** 画面の座標(縦画面 720x1280)。キャラクターは左寄りに固定で、コースが流れてくる */
export const DASH = {
  runnerX: 190,
  runnerW: 70,
  runnerH: 80,
  gravity: 2700,
  // 2026-10-20 企画者の指示でジャンプを小さく(高さ約150px)
  jumpVelocity: 900,
  /** 足場から離れたあと、少しの間はまだジャンプできる(押し遅れのゆるし) */
  coyote: 0.08,
  // 2026-10-20 企画者の指示: はじめはゆっくり、だんだん速く(最高速を 680 → 950 に)
  startSpeed: 300,
  maxSpeed: 950,
  /** 1秒ごとに速くなる量 */
  accel: 6,
  /** これより下に落ちたらゲームオーバー */
  fallY: 1380,
  /** 足場の高さの範囲 */
  // 上り下りを大きく(2026-10-20 企画者の指示)
  minY: 440,
  maxY: 1080,
  /** 100px = 1m */
  pxPerMeter: 100,
  /** 【仮】足場の続きがマグマになる割合(足場1つごと) */
  magmaChance: 0.12,
  /** マグマの床は、まわりの足場より少し低くする(分かりやすくするため 2026-10-20 企画者の指示) */
  magmaDrop: 40,
  /** 短い足場が出はじめる距離(px。150m)と、いちばん多くなるまでの距離(さらに450m) */
  shortFrom: 15000,
  shortRamp: 45000,
  /** 【仮】はねるトゲ: 出はじめる距離(200m)、1回はねる時間(秒)、はねる高さ、転がる速さ */
  bounceFrom: 20000,
  bouncePeriod: 1.5,
  bounceHeight: 200,
  bounceRoll: 90,
  /** 【仮】難しくなると、足場の端の近くで跳ばないと届かないすき間が出る(すき間の最大を少し広げる) */
  edgeGapExtra: 0.08,
  /**
   * 2026-10-21 企画者の指示(700mから先が簡単すぎる): 700m(ほかの難しさが最大になったあと)から、
   * さらに 1300m かけて(2000mで最大)、速さ・短い足場・トゲ・マグマ・すき間を強くしていく
   */
  hardFrom: 70000,
  hardRamp: 130000,
  /** さらに難しくなったときの最高速 */
  topSpeed: 1250,
  /**
   * 鳥(2026-11-22 企画者「700m 過ぎてから 画面 右から 鳥が 1匹〜2匹 飛んで くる」「平行に 飛んで いき、そのまま 走り 続けるか ジャンプするか 判断」)。
   * 低い 鳥は 跳んで よける・高い 鳥は 走り ぬける(跳ぶと 当たる)。2匹の 時は 高→低・低→低・低→高 の どれか。出る 割合・速さは【仮】
   */
  birdFrom: 70000,
  /** 次の 鳥までの 距離(px)【仮】 */
  // 2026-11-23 企画者「そんな 頻繁に 出なくて いい」→ 150〜300m ごと
  birdEveryMin: 15000,
  birdEveryMax: 30000,
  birdSpeed: 260,
  /** 2匹の 間(秒)。1匹目を 跳んで 着地してから 2匹目に 間に 合う */
  birdGap: 1.05,
} as const;

/** 700mから先の、さらに難しくなる度合い(0〜1) */
const extraAt = (x: number) => Math.min(1, Math.max(0, (x - DASH.hardFrom) / DASH.hardRamp));
/** その場所での最高速 */
const speedCap = (x: number) => DASH.maxSpeed + (DASH.topSpeed - DASH.maxSpeed) * extraAt(x);

export interface Platform {
  x: number;
  w: number;
  y: number;
  /** マグマの足場(乗るとゲームオーバー。跳び越える)。2026-10-20 企画者の指示 */
  magma?: boolean;
}
export interface Thing {
  x: number;
  y: number;
  w: number;
  h: number;
  /** danger: 当たるとゲームオーバー / safe: 当たっても大丈夫 */
  kind: 'danger' | 'safe';
  /** はねるトゲ(2026-10-20 企画者の指示)。はねながら手前へ転がってくる。下をくぐるか、跳び越えてかわす */
  bounce?: { baseY: number; x0: number; minX: number; t0: number; phase: number };
  /** 飛んで くる 鳥(2026-11-22 企画者)。右から まっすぐ 飛んで くる。low = 跳んで よける・high = 走り ぬける(跳ぶと 当たる) */
  fly?: { x0: number; t0: number; low: boolean };
}

export interface DashState {
  seed: number;
  /** 進んだ距離(px) */
  dist: number;
  speed: number;
  /** キャラクターの足もとの高さと、縦の速さ(下が+) */
  y: number;
  vy: number;
  grounded: boolean;
  airTime: number;
  platforms: Platform[];
  things: Thing[];
  /** 次に足場を置く場所(コースの座標) */
  nextX: number;
  lastY: number;
  over: false | 'fall' | 'hit' | 'magma';
  rngState: number;
  /** ゲームが始まってからの時間(秒)。はねるトゲの動きに使う */
  time: number;
  /** 拾える コイン(2026-11-21 企画者「300m から コイン」) */
  coins: DashCoin[];
  /** 拾った コインの 数 */
  picked: number;
  /** 次に 鳥を 出す 場所(コースの x) */
  nextBirdX?: number;
  /** 次に コインを 置く 距離(m) */
  nextCoinM: number;
  /** その 100m で まだ 置く 枚数 */
  coinLeft?: number;
  /** さいごに 置いた コインの x */
  lastCoinX?: number;
}

/**
 * コイン(2026-11-21 企画者「300m から 100m ごとに 5枚」「ジャンプ したり 走って いると 取れる」「デカすぎない」)。
 * 走って 取る 列(足場の 上)か、トゲの 上の ジャンプの 弧。1枚 = MONZ コイン DASH_COIN_VALUE 枚【仮】
 */
export interface DashCoin {
  x: number;
  y: number;
  taken: boolean;
}
// 2026-11-21 企画者「もっと 大きく」「5枚 連続 じゃ なくて 連続は 3枚 ぐらい・バランス よく 散りばめて」→ 100m に 5枚を 1〜3枚の 小さな 組に 分けて 置く
export const DASH_COINS = { fromM: 300, everyM: 100, perGroup: 5, maxRun: 3, size: 64, gap: 76 } as const;

/** その 100m で まだ 置く 枚数(1〜3枚の 組に する) */
function coinBatch(s: DashState, x: number): number {
  if (x < s.nextCoinM * DASH.pxPerMeter) return 0;
  // コースの 乱数は 使わない(コースが かわらない ように)。場所から 決まる 乱数
  const rng = mulberry32((Math.imul(s.seed, 2654435761) ^ Math.floor(x)) >>> 0);
  // 前の 組から 少し はなす(続けて 並ばない ように)
  if (x < (s.lastCoinX ?? -1e9) + 360) return 0;
  // 100m の 区切りを こえたら、のこりを 新しい 5枚に
  const seg = Math.floor(x / DASH.pxPerMeter / DASH_COINS.everyM) * DASH_COINS.everyM;
  if (seg >= s.nextCoinM + DASH_COINS.everyM || s.coinLeft === undefined) {
    s.nextCoinM = Math.max(s.nextCoinM, seg);
    s.coinLeft = DASH_COINS.perGroup;
  }
  if (s.coinLeft <= 0) return 0;
  // 1〜3枚(のこりが 少ない 時は のこり ぜんぶ)。足場 2つに 1つ くらいに 置く(散らばる ように)
  if (rng() < 0.35) return 0;
  return Math.min(s.coinLeft, 1 + Math.floor(rng() * DASH_COINS.maxRun));
}
function coinTaken(s: DashState, n: number): void {
  s.lastCoinX = Math.max(...s.coins.slice(-n).map((c) => c.x));
  s.coinLeft = (s.coinLeft ?? DASH_COINS.perGroup) - n;
  if (s.coinLeft <= 0) {
    s.nextCoinM += DASH_COINS.everyM;
    s.coinLeft = DASH_COINS.perGroup;
  }
}
/** ジャンプの 弧(cx の まわり)に n 枚 */
function coinArc(s: DashState, cx: number, baseY: number, n: number, reach: number): void {
  for (let k = 0; k < n; k++) {
    const u = (k - (n - 1) / 2) * 0.18;
    const hh = jumpHeight() * (1 - (2 * u) ** 2) * 0.8;
    s.coins.push({ x: cx + u * reach, y: baseY - DASH.runnerH / 2 - hh, taken: false });
  }
  coinTaken(s, n);
}
export const DASH_COIN_VALUE = 1;

/** 空中にいられる時間(秒) */
export const airtime = (): number => (2 * DASH.jumpVelocity) / DASH.gravity;
/** ジャンプの高さ(px) */
export const jumpHeight = (): number => (DASH.jumpVelocity * DASH.jumpVelocity) / (2 * DASH.gravity);

function rngOf(s: DashState): Rng {
  const r = mulberry32(s.rngState);
  return () => {
    const v = r();
    s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
    return v;
  };
}

/** 新しいゲーム。最初は長い足場から始まる */
export function newDash(seed: number): DashState {
  const s: DashState = {
    seed,
    dist: 0,
    speed: DASH.startSpeed,
    y: 900,
    vy: 0,
    grounded: true,
    airTime: 0,
    platforms: [{ x: -400, w: 1500, y: 900 }],
    things: [],
    nextX: 1100,
    lastY: 900,
    over: false,
    rngState: seed >>> 0,
    time: 0,
    coins: [],
    picked: 0,
    nextCoinM: DASH_COINS.fromM,
  };
  fill(s);
  return s;
}

/** コースを、画面の右の先まで作る */
function fill(s: DashState): void {
  const rng = rngOf(s);
  while (s.nextX < s.dist + 2400) {
    // この先を走るときの速さで、届くすき間を決める(余裕を持たせて最大の6割まで)
    const speed = Math.min(speedCap(s.nextX), s.speed + DASH.accel * ((s.nextX - s.dist) / s.speed));
    const extra = extraAt(s.nextX);
    const reach = speed * airtime();
    const level = Math.min(1, s.dist / 60000);
    // 【仮】ときどき、足場の続きの1つがマグマになる(すき間なし・少し低い。跳べば越えられる幅)。前の足場がマグマなら続けない
    const prev = s.platforms[s.platforms.length - 1];
    if (s.nextX > 3000 && !prev?.magma && prev && prev.w > reach * 0.8 && rng() < DASH.magmaChance + 0.08 * extra) {
      const mw = range(rng, 0.4, 0.6) * reach;
      s.platforms.push({ x: s.nextX, w: mw, y: s.lastY + DASH.magmaDrop, magma: true });
      s.nextX += mw;
      // マグマの次の足場: すき間なし・同じ高さ。トゲは置かない
      const nw = range(rng, 1.2, 2.0) * reach;
      s.platforms.push({ x: s.nextX, w: nw, y: s.lastY });
      s.nextX += nw;
      continue;
    }
    // 短い足場(2026-10-20 企画者の指示): 一定の距離を越えたら出はじめ、進むほど増える。
    // 着地できる幅がせまいので、ジャンプのタイミングが大事になる。高さはほとんど変えない
    const hard = Math.min(1, Math.max(0, (s.nextX - DASH.shortFrom) / DASH.shortRamp));
    if (hard > 0 && prev && prev.w > reach * 0.8 && rng() < 0.15 + 0.35 * hard + 0.2 * extra) {
      // 進むほど、短い足場が続く(最初は1つ、600mで最大4つ、2000mで最大6つ)
      const count = 1 + Math.floor(rng() * (1 + 3 * hard + 2 * extra));
      for (let i = 0; i < count; i++) {
        const w = range(rng, 0.55 - 0.15 * hard - 0.08 * extra, 0.65 - 0.1 * hard - 0.08 * extra) * reach;
        // 短い足場から短い足場へ: 端の近くで跳んでも、跳びこしてしまわない近さにする(すき間+幅 が跳べる距離より少し長い)
        const g = i === 0 ? range(rng, 0.6, 0.8) * reach : Math.max(range(rng, 0.5, 0.65) * reach, reach * 1.05 - w);
        const x = s.nextX + g;
        const y = Math.max(DASH.minY, Math.min(DASH.maxY, s.lastY + (i === 0 ? range(rng, -40, 40) : range(rng, -25, 25))));
        s.platforms.push({ x, w, y });
        // コイン: 短い 足場の 間の すき間の 上に ジャンプの 弧(2つめの 足場へ 跳ぶ 時)
        const nc = i >= 1 ? coinBatch(s, x) : 0;
        if (nc) coinArc(s, x - g / 2, Math.min(s.lastY, y), nc, reach);
        s.nextX = x + w;
        s.lastY = y;
      }
      continue;
    }
    // 短い足場の次は、すき間と上りを少しひかえめにする(短い足場では、跳ぶ場所を選べないため)
    const afterShort = !!prev && prev.w < reach * 0.8;
    let gap = range(rng, 0.35, afterShort ? 0.5 : 0.55 + 0.2 * level + DASH.edgeGapExtra * hard + 0.05 * extra) * reach;
    // 高さの差: 上は跳べる高さの7割まで、下は大きく降りることもある。上と下へ交互に行きやすくする
    const up = jumpHeight() * (afterShort ? 0.5 : 0.7);
    const goUp = s.lastY > (DASH.minY + DASH.maxY) / 2 ? rng() < 0.7 : rng() < 0.35;
    let y = s.lastY + (goUp ? -range(rng, up * 0.4, up) : range(rng, 40, 300));
    y = Math.max(DASH.minY, Math.min(DASH.maxY, y));
    // 上る足場は、高いほどすき間をせまくする(遠くて高い足場は、端ぎりぎりで跳ばないと届かないため)。
    // ただし近すぎると、上りきる前に足場の横にぶつかるので、いちばん近くても 0.35 は空ける
    gap = Math.max(0.35 * reach, gap * (1 - 0.35 * (Math.max(0, s.lastY - y) / jumpHeight())));
    const x = s.nextX + gap;
    // 足場の上の危険な物。ジャンプで着地しそうな所(足場の始めのほう)と、終わりの近くには置かない。跳べば越えられる大きさ
    const drop = Math.max(0, y - s.lastY);
    const landing = reach * (1.15 + (drop / jumpHeight()) * 0.5);
    // トゲを置く足場は、跳び越えたあと同じ足場に着地できる長さにする(2026-10-20 トゲが出ないことがあったため)
    // 鳥(700m から)。2026-11-23 企画者「鳥 出て こなかった」→ 700m を こえたら すぐ 1回・あとは 約 80〜150m ごとに 必ず 出す(その 足場は トゲなし)
    const birdDue = x >= DASH.birdFrom && x >= (s.nextBirdX ?? DASH.birdFrom);
    const spike = !birdDue && rng() < 0.45 + 0.3 * level + 0.15 * extra;
    // 足場は 鳥を よけて 着地できる 長さに する
    const birds: boolean[] = birdDue
      ? // 2026-11-23 企画者「ジャンプしたら 当たる 位置にも」「連続で 2匹」→ 2匹が 7割。高い 鳥(跳ぶと 当たる)を 多めに
        rng() < 0.3
        ? [rng() < 0.4]
        : [[false, true], [true, true], [true, false], [false, false]][Math.floor(rng() * 4)]
      : [];
    // 進むと、トゲの一部がはねるトゲになる。転がってきても、着地する所から少し先までは来ない(着地してから見てよけられるように)
    const bouncy = Math.min(1, Math.max(0, (x - DASH.bounceFrom) / DASH.shortRamp));
    const bounce = spike && bouncy > 0 && rng() < 0.25 + 0.35 * bouncy + 0.2 * extra;
    const start = landing + (bounce ? reach * 0.6 : 0);
    let w = range(rng, 0.9, 2.4 - 1.0 * level - 0.4 * extra) * reach;
    if (spike) w = Math.max(w, start + reach * range(rng, 1.4, 1.9));
    const birdGapPx = speed * DASH.birdGap;
    if (birds.length) w = Math.max(w, landing + reach * 0.3 + birdGapPx * (birds.length - 1) + reach * 1.6);
    s.platforms.push({ x, w, y });
    if (birds.length) s.nextBirdX = x + w + range(rng, DASH.birdEveryMin, DASH.birdEveryMax);
    birds.forEach((low, i) => {
      const meetX = x + landing + reach * 0.3 + birdGapPx * i;
      const arrive = arriveTime(s, meetX);
      const bw = 60;
      const bh = 40;
      // 低い 鳥: 体の 高さ(跳ばないと 当たる)。高い 鳥: 立って いる 頭より 少し 上(跳ぶと 当たる)
      const by = low ? y - 62 : y - 160;
      s.things.push({ x: meetX + DASH.birdSpeed * (arrive - s.time), y: by, w: bw, h: bh, kind: 'danger', fly: { x0: meetX + DASH.birdSpeed * (arrive - s.time), t0: s.time, low } });
    });
    if (spike) {
      const hx = x + range(rng, start, w - reach * 1.15);
      let b: Thing['bounce'];
      if (bounce) {
        // キャラクターの走る速さは、ジャンプしても変わらないので、トゲの所に来る時間は前もって分かる。
        // その時にトゲが「高い所にいる(下をくぐる)」か「低い所にいる(跳び越える)」になるように、はねる時間をずらす
        b = { baseY: y - 56, x0: hx, minX: x + start, t0: s.time, phase: 0 };
        const meet = meetTime(s, b);
        const target = rng() < 0.5 ? 0.5 : 0;
        b.phase = target * DASH.bouncePeriod - (meet - s.time);
      }
      s.things.push({ x: hx, y: y - 56, w: 54, h: 56, kind: 'danger', bounce: b });
      // コイン: 動かない トゲの 上に ジャンプの 弧(跳び越えると 取れる)
      const nc = !bounce ? coinBatch(s, x) : 0;
      if (nc) coinArc(s, hx + 27, y, nc, reach);
    } else {
      // コイン: トゲの ない 足場の 上に 1〜3枚(走って いると 取れる)。足場の 後ろの ほうに
      const nc = coinBatch(s, x);
      if (nc && w > reach * 0.5 + DASH_COINS.gap * nc) {
        const x0 = x + w - DASH_COINS.gap * nc - 30;
        for (let i = 0; i < nc; i++) s.coins.push({ x: x0 + i * DASH_COINS.gap, y: y - DASH.runnerH / 2, taken: false });
        coinTaken(s, nc);
      }
    }
    // さわっても大丈夫な物(星)は 2026-10-20 企画者の指示で廃止(まぎらわしいため)
    s.nextX = x + w;
    s.lastY = y;
  }
  // 通りすぎたものは片付ける
  s.platforms = s.platforms.filter((p) => p.x + p.w > s.dist - 400);
  s.things = s.things.filter((t) => t.x + t.w > s.dist - 400);
  s.coins = s.coins.filter((c) => c.x > s.dist - 400);
}

/** タップ: 足場の上(か、離れた直後)ならジャンプ */
export function jump(s: DashState): boolean {
  if (s.over || !(s.grounded || s.airTime < DASH.coyote) || s.vy < 0) return false;
  s.vy = -DASH.jumpVelocity;
  s.grounded = false;
  s.airTime = DASH.coyote;
  return true;
}

/** キャラクターの足もとのコース上の x */
const footX = (s: DashState) => s.dist + DASH.runnerX;

/** キャラクターが、はねるトゲの所に来る時間(ゲームの時間)。走る速さはジャンプに関係なく決まっているので計算できる */
function meetTime(s: DashState, b: NonNullable<Thing['bounce']>): number {
  let { time, speed, dist } = s;
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 30; i++) {
    const tx = Math.max(b.minX, b.x0 - DASH.bounceRoll * (time - b.t0));
    if (dist + DASH.runnerX >= tx + 27) return time;
    speed = Math.min(speedCap(dist), speed + DASH.accel * dt);
    dist += speed * dt;
    time += dt;
  }
  return time;
}

/** キャラクターの 足もとが コースの x に 来る 時間(ゲームの 時間) */
function arriveTime(s: DashState, x: number): number {
  let { time, speed, dist } = s;
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 30; i++) {
    if (dist + DASH.runnerX >= x) return time;
    speed = Math.min(speedCap(dist), speed + DASH.accel * dt);
    dist += speed * dt;
    time += dt;
  }
  return time;
}

/** はねるトゲの位置: 手前へ転がりながら、放物線ではねる */
function moveBounce(t: Thing, time: number): void {
  const b = t.bounce!;
  const age = time - b.t0;
  t.x = Math.max(b.minX, b.x0 - DASH.bounceRoll * age);
  const u = (((age + b.phase) / DASH.bouncePeriod) % 1 + 1) % 1;
  t.y = b.baseY - DASH.bounceHeight * 4 * u * (1 - u);
}

/** dt 秒すすめる */
export function step(s: DashState, dt: number): void {
  if (s.over) return;
  s.speed = Math.min(speedCap(s.dist), s.speed + DASH.accel * dt);
  s.dist += s.speed * dt;
  s.time += dt;
  for (const t of s.things) if (t.bounce) moveBounce(t, s.time);
  for (const t of s.things) if (t.fly) t.x = t.fly.x0 - DASH.birdSpeed * (s.time - t.fly.t0);
  const prevY = s.y;
  s.vy += DASH.gravity * dt;
  s.y += s.vy * dt;
  // 着地(上から足場の面を通りすぎたとき)
  const fx = footX(s);
  const half = DASH.runnerW / 2;
  const under = s.platforms.find((p) => fx + half > p.x && fx - half < p.x + p.w && prevY <= p.y + 1 && s.y >= p.y);
  if (under && s.vy >= 0) {
    // マグマ: 足もとのまん中がマグマの上に来たらゲームオーバー
    const onMagma = s.platforms.find((p) => p.magma && fx > p.x + 8 && fx < p.x + p.w - 8 && Math.abs(p.y - under.y) < 1);
    if (onMagma) {
      s.over = 'magma';
      return;
    }
    s.y = under.y;
    s.vy = 0;
    s.grounded = true;
    s.airTime = 0;
  } else {
    s.grounded = false;
    s.airTime += dt;
  }
  // 足場の横の壁にぶつかったら落ちる(足場の面より下にいて、足場に入りこんだとき)
  const wall = s.platforms.find((p) => fx + half > p.x && fx - half < p.x && s.y > p.y + 4);
  if (wall && !s.grounded) s.vy = Math.max(s.vy, 0);
  // 危険な物
  const top = s.y - DASH.runnerH;
  for (const t of s.things) {
    if (t.kind !== 'danger') continue;
    // はねるトゲは丸い形なので、当たる所を少し小さくする
    const inset = t.bounce ? 10 : 6;
    const vin = t.bounce ? 8 : 0;
    const tl = t.x + inset;
    const tr = t.x + t.w - inset;
    if (fx + half - 8 > tl && fx - half + 8 < tr && s.y - 4 > t.y + vin && top < t.y + t.h - vin) {
      s.over = 'hit';
      return;
    }
  }
  // コインを 拾う(体の 四角と コインの 丸)
  const r = DASH_COINS.size / 2;
  for (const c of s.coins) {
    if (c.taken) continue;
    if (c.x + r > fx - half && c.x - r < fx + half && c.y + r > top && c.y - r < s.y) {
      c.taken = true;
      s.picked++;
    }
  }
  if (s.y > DASH.fallY) {
    s.over = 'fall';
    return;
  }
  fill(s);
}

/** 走った距離(m) */
export const meters = (s: DashState): number => Math.floor(s.dist / DASH.pxPerMeter);

/** 報酬(企画者決定 2026-10-20: 簡単なので 100m → 500mで1コインに変更) */
// 2026-10-21 企画者決定: 経験値は1回のプレイで20まで
export const DASH_REWARD = { metersPerCoin: 500, expFrom: 500, metersPerExp: 100, maxExp: 20 } as const;
/** 経験値(企画者決定 2026-10-21): 500mで1、そこから100mごとに1(499mまでは0) */
const dashExp = (m: number) => (m < DASH_REWARD.expFrom ? 0 : Math.min(DASH_REWARD.maxExp, 1 + Math.floor((m - DASH_REWARD.expFrom) / DASH_REWARD.metersPerExp)));
// 2026-11-09 企画者「5倍に」(1回で 最大 1,000)
export const dashReward = (m: number) => capReward({ coins: Math.floor(m / DASH_REWARD.metersPerCoin) * MINIGAME_REWARD_MULT, exp: dashExp(m) * MINIGAME_REWARD_MULT });
