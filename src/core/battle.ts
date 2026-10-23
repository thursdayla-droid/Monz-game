/**
 * アクションバトル(企画者の仕様 2026-10-22、docs/BATTLE.md)の動きの計算。Phaserに依存しない。
 * 2D横から見たバトル。1対1・HP100・ストック2・HPが減るほど吹っ飛びやすい。育成ステータスは反映しない。
 * 今は1段目(企画者決定 2026-10-22): 練習場で BUNK を動かす(移動・2段ジャンプ・シールド・A攻撃4つ)。
 * 相手は動かない的(色違いのBUNK)。CPU・勝ち負けは、操作が気持ちよくなってから。
 * 数字はすべて【仮】(操作してみて調整する)。座標は画面のpx(下が +y)。
 */

export interface Platform {
  x0: number;
  x1: number;
  /** 乗る面の高さ */
  y: number;
  /** true: 下からすり抜けられて、下を入れると降りられる(浮いた足場) */
  thin: boolean;
}

export interface Stage {
  platforms: Platform[];
  /** ここから外に出たらアウト(1ストック失う) */
  blast: { x0: number; x1: number; y0: number; y1: number };
  /** 復活する場所 */
  spawn: [number, number][];
}

/**
 * 【仮】ステージ: 大きな足場1つ＋浮いた小さな足場2つ(企画者決定 2026-10-22)。
 * 横画面で遊ぶ(企画者の指示 2026-10-22)。
 * 企画者の指示(2026-10-23): ステージが狭すぎる。少し引いて、もっと動き回りたい →
 * 画面を少し引いて(BATTLE_VIEW の広さを画面に縮めて見せる)、ステージを広くした
 */
export const BATTLE_VIEW = { w: 1760, h: 990 };
export const STAGE: Stage = {
  platforms: [
    { x0: 150, x1: 1610, y: 720, thin: false },
    { x0: 300, x1: 640, y: 500, thin: true },
    { x0: 1120, x1: 1460, y: 500, thin: true },
  ],
  blast: { x0: -380, x1: 2140, y0: -560, y1: 1340 },
  spawn: [
    [620, 720],
    [1140, 720],
  ],
};

/** 【仮】動きの数字 */
export const MOVE = {
  // 企画者の指示(2026-10-23): 動きが遅すぎる・ジャンプが低すぎる → 速く・高く
  gravity: 3200,
  maxFall: 1500,
  walk: 620,
  /** 地上で速さが変わる速さ(px/s²) */
  groundAccel: 7000,
  airSpeed: 540,
  airAccel: 3600,
  jump: 1560,
  /**
   * 空中ジャンプ(2段目)。企画者の指示(2026-10-23): 2段ジャンプがはっきりわかるように、
   * のぼっている途中でも、1段目と同じくらい新しく高くとぶ
   */
  airJump: 1450,
  airJumps: 1,
  /** 体の大きさ(当たり判定) */
  halfW: 40,
  height: 120,
  /** 吹っ飛んでいるときに速さが落ちる割合(1秒あたり) */
  launchDrag: 1.6,
};

/**
 * 【仮】ガード(企画者の指示 2026-10-23):
 * - ずっとは使えない。押している間すこしずつ小さくなる。攻撃を受けても削れて小さくなる
 * - ガードの丸から体が出ている所に攻撃が当たると、くらう
 * - はなしたら 0.5秒は使えない。空中でも使える
 * - ガード中に左右を入れると、無敵のローリングを1回。ローリングするとガードは切れる
 */
export const SHIELD = {
  /** 丸の大きさ(半径)。いちばん大きいとき・なくなる直前 */
  maxR: 86,
  minR: 34,
  /** 押している間に減る速さ(1秒あたり。1で満タン) */
  drain: 0.16,
  /** 使っていない間にもどる速さ */
  regen: 0.22,
  /** 攻撃を受けたとき、ダメージ1あたりに減る量 */
  perDamage: 0.07,
  /** はなしたあと使えない時間(秒) */
  cooldown: 0.5,
  /** なくなる(割れる)と、しばらく使えない */
  breakCooldown: 1.5,
  /** 割れたあと、ふらふらして動けない時間(企画者の指示 2026-10-23: ガードが割れたらふらふら)【仮】 */
  dizzy: 2.2,
};
export const ROLL = {
  time: 0.34,
  /** 転がる距離(px) */
  distance: 340,
};

export const HP_MAX = 100;
export const STOCKS = 2;

/** air_down: 空中で下A(真下へのパンチ) */
export type AttackName = 'jab' | 'side' | 'up' | 'down' | 'air_down';

export interface AttackDef {
  /** 画面に出す名前【仮】 */
  label: string;
  damage: number;
  /** 出るまで・当たる時間・終わったあとのすき(秒) */
  startup: number;
  active: number;
  recovery: number;
  /** 当たり判定(向いている方を +x、足元が原点。上が -y) */
  box: { x: number; y: number; w: number; h: number };
  /** 吹っ飛ばす向き(度。0=前、90=真上) */
  angle: number;
  /** 吹っ飛ばす強さ: 基本 + HPが減っているほど足される分 */
  base: number;
  growth: number;
  /** 当たった相手を くるくる回さない(少し浮くだけの技) */
  noSpin?: boolean;
}

/**
 * 【仮】BUNKのA攻撃(企画者決定 2026-10-22: 通常A ジャブ・横A ストレート・上A アッパー)。
 * 2026-10-23 企画者の指示: 下Aは足払いをやめてパンチ(下パンチ)に。攻撃の届く範囲を広く、ダメージは少なめに
 */
export const BUNK_ATTACKS: Record<AttackName, AttackDef> = {
  jab: { label: 'ジャブ', damage: 2, startup: 0.05, active: 0.09, recovery: 0.12, box: { x: 15, y: -110, w: 110, h: 70 }, angle: 30, base: 220, growth: 450 },
  side: { label: 'ストレート', damage: 6, startup: 0.14, active: 0.1, recovery: 0.26, box: { x: 15, y: -118, w: 150, h: 80 }, angle: 35, base: 380, growth: 1300 },
  // 企画者の指示(2026-10-23): 上に攻撃して当たったら、くるくる回らずに少し上に上がる感じ
  up: { label: 'アッパー', damage: 5, startup: 0.1, active: 0.12, recovery: 0.22, box: { x: -45, y: -230, w: 135, h: 150 }, angle: 88, base: 760, growth: 420, noSpin: true },
  down: { label: '下パンチ', damage: 4, startup: 0.09, active: 0.1, recovery: 0.22, box: { x: 10, y: -80, w: 140, h: 75 }, angle: 25, base: 320, growth: 900 },
  // 企画者の指示(2026-10-23): ジャンプ中の下Aは、真下にパンチ。当たると下へたたきつける
  air_down: { label: '真下パンチ', damage: 5, startup: 0.1, active: 0.12, recovery: 0.24, box: { x: -60, y: -40, w: 120, h: 130 }, angle: -80, base: 380, growth: 900 },
};

/** 当たった瞬間に、少しだけ時間を止める(手ごたえ)。ダメージが大きいほど長い【仮】 */
export const hitstopFor = (damage: number) => 0.045 + damage * 0.014;

export interface Input {
  /** スティック(-1〜1)。上が -1 */
  x: number;
  y: number;
  /** このフレームで押した */
  a: boolean;
  jump: boolean;
  /** 押している間 */
  shield: boolean;
}

export const NO_INPUT: Input = { x: 0, y: 0, a: false, jump: false, shield: false };

export interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1=右向き, -1=左向き */
  face: 1 | -1;
  ground: Platform | null;
  airJumps: number;
  hp: number;
  stocks: number;
  attack: { name: AttackName; t: number; hit: boolean } | null;
  /** 吹っ飛んで操作できない残りの時間 */
  stun: number;
  /** ガードが割れて、ふらふらしている残りの時間(動けない。攻撃を受けると終わる) */
  dizzy: number;
  /** さいごに受けた技(見た目用: くるくる回るかどうか) */
  hitBy: AttackName | null;
  /** 復活したあと、攻撃が当たらない残りの時間 */
  safe: number;
  shield: boolean;
  /** ガードの残り(0〜1。丸の大きさ) */
  shieldHp: number;
  /** ガードがまた使えるまでの時間 */
  shieldCd: number;
  /** ローリング中(t: 経過、dir: 向き)。この間は攻撃が当たらない */
  roll: { t: number; dir: 1 | -1 } | null;
  /** 前の入力のスティックの横(左右を「入れた瞬間」を知るため) */
  prevX: number;
  /** 下を入れて浮いた足場から降りている途中(この足場には乗らない) */
  dropFrom: Platform | null;
  /** 歩いているか(見た目用) */
  walking: boolean;
  /** アウトになってから復活するまでの残りの時間(0 なら場にいる) */
  out: number;
  /** 動かない的(練習用の相手) */
  dummy: boolean;
}

export function newFighter(x: number, y: number, face: 1 | -1, dummy = false): Fighter {
  return { x, y, vx: 0, vy: 0, face, ground: null, airJumps: MOVE.airJumps, hp: HP_MAX, stocks: STOCKS, attack: null, stun: 0, dizzy: 0, hitBy: null, safe: 0, shield: false, shieldHp: 1, shieldCd: 0, roll: null, prevX: 0, dropFrom: null, walking: false, out: 0, dummy };
}

/** スティックの向きから、出すA攻撃を決める */
export function attackFor(inp: Input, air = false): AttackName {
  if (inp.y < -0.5 && Math.abs(inp.y) >= Math.abs(inp.x)) return 'up';
  if (inp.y > 0.5 && Math.abs(inp.y) >= Math.abs(inp.x)) return air ? 'air_down' : 'down';
  if (Math.abs(inp.x) > 0.5) return 'side';
  return 'jab';
}

const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

/** HPが減っているほど強く吹っ飛ぶ(HP100で 0、HP0で 1) */
export const lostShare = (hp: number) => Math.max(0, Math.min(1, (HP_MAX - hp) / HP_MAX));

export function knockback(def: AttackDef, hpAfter: number): number {
  return def.base + def.growth * lostShare(hpAfter);
}

/** 攻撃の当たり判定(画面の座標)。当たる時間でなければ null */
export function hitbox(f: Fighter, defs: Record<AttackName, AttackDef>): { x0: number; x1: number; y0: number; y1: number } | null {
  const a = f.attack;
  if (!a) return null;
  const d = defs[a.name];
  if (a.t < d.startup || a.t > d.startup + d.active) return null;
  const bx = f.face === 1 ? f.x + d.box.x : f.x - d.box.x - d.box.w;
  return { x0: bx, x1: bx + d.box.w, y0: f.y + d.box.y, y1: f.y + d.box.y + d.box.h };
}

/** ガードの丸の中心と半径 */
export function shieldCircle(f: Fighter): { x: number; y: number; r: number } {
  return { x: f.x, y: f.y - MOVE.height / 2, r: SHIELD.minR + (SHIELD.maxR - SHIELD.minR) * Math.max(0, f.shieldHp) };
}

/** 当たった所(四角)が、ぜんぶガードの丸の中か */
function insideShield(f: Fighter, r: { x0: number; x1: number; y0: number; y1: number }): boolean {
  const c = shieldCircle(f);
  return [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].every(([x, y]) => Math.hypot(x - c.x, y - c.y) <= c.r);
}

export const hurtbox = (f: Fighter) => ({ x0: f.x - MOVE.halfW, x1: f.x + MOVE.halfW, y0: f.y - MOVE.height, y1: f.y });

const overlap = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export type BattleEvent = { kind: 'hit'; target: Fighter; damage: number; x: number; y: number } | { kind: 'block'; target: Fighter; x: number; y: number } | { kind: 'ko'; target: Fighter; fell: boolean } | { kind: 'jump'; who: Fighter; air: boolean } | { kind: 'shieldBreak'; who: Fighter } | { kind: 'roll'; who: Fighter } | { kind: 'swing'; who: Fighter; name: AttackName };

/** 1人ぶん、入力で動かす */
function control(f: Fighter, inp: Input, dt: number, events: BattleEvent[]): void {
  f.walking = false;
  if (f.stun > 0) f.stun -= dt;
  const justSide = Math.abs(inp.x) > 0.6 && Math.abs(f.prevX) <= 0.6;
  f.prevX = inp.x;
  // ローリング中: 決まった向きに転がる(操作できない・攻撃が当たらない)
  if (f.roll) {
    f.roll.t += dt;
    const k = f.roll.t / ROLL.time;
    // はじめ速く、終わりはゆっくり
    f.vx = f.roll.dir * (ROLL.distance / ROLL.time) * 2 * Math.max(0, 1 - k);
    if (k >= 1) {
      f.roll = null;
      f.vx = 0;
    }
    return;
  }
  if (f.dizzy > 0) f.dizzy = Math.max(0, f.dizzy - dt);
  const canAct = f.stun <= 0 && f.dizzy <= 0 && !f.attack;
  // ガード
  const was = f.shield;
  f.shield = canAct && inp.shield && f.shieldCd <= 0 && f.shieldHp > 0;
  if (f.shield) {
    f.shieldHp -= SHIELD.drain * dt;
    if (f.shieldHp <= 0) {
      f.shieldHp = 0;
      f.shield = false;
      f.shieldCd = SHIELD.breakCooldown;
      f.dizzy = SHIELD.dizzy;
      events.push({ kind: 'shieldBreak', who: f });
    } else if (justSide && f.ground) {
      // ガード中に左右: ローリング(ガードは切れる)。企画者の指示(2026-10-23): ジャンプ中はローリングできない(ガードだけ)
      const dir = inp.x > 0 ? 1 : -1;
      f.shield = false;
      f.shieldCd = SHIELD.cooldown;
      f.roll = { t: 0, dir };
      f.face = dir === 1 ? -1 : 1;
      events.push({ kind: 'roll', who: f });
      return;
    }
  } else {
    if (was && f.shieldCd <= 0) f.shieldCd = SHIELD.cooldown;
    f.shieldCd = Math.max(0, f.shieldCd - dt);
    f.shieldHp = Math.min(1, f.shieldHp + SHIELD.regen * dt);
  }
  if (f.attack) {
    f.attack.t += dt;
    const d = BUNK_ATTACKS[f.attack.name];
    if (f.attack.t >= d.startup + d.active + d.recovery) f.attack = null;
  }
  if (canAct && inp.a && !f.shield) {
    const name = attackFor(inp, !f.ground);
    if (name === 'side') f.face = inp.x > 0 ? 1 : -1;
    f.attack = { name, t: 0, hit: false };
    events.push({ kind: 'swing', who: f, name });
  }
  const moving = canAct && !f.shield && !f.attack;
  if (f.ground) {
    const target = moving ? inp.x * MOVE.walk : 0;
    // 吹っ飛んでいるときは、地上でも少しすべる
    f.vx = approach(f.vx, target, MOVE.groundAccel * dt * (f.stun > 0 ? 0.4 : 1));
    if (moving && Math.abs(inp.x) > 0.2) {
      f.face = inp.x > 0 ? 1 : -1;
      f.walking = true;
    }
    if (moving && inp.jump) {
      f.vy = -MOVE.jump;
      f.ground = null;
      events.push({ kind: 'jump', who: f, air: false });
    } else if (moving && inp.y > 0.7 && f.ground.thin) {
      // 浮いた足場から降りる
      f.dropFrom = f.ground;
      f.ground = null;
    }
  } else {
    if (f.stun > 0) f.vx *= Math.max(0, 1 - MOVE.launchDrag * dt);
    // 空中では、攻撃中も少しだけ動ける(ガード中は少しだけ)
    else if (f.dizzy > 0) f.vx = approach(f.vx, 0, MOVE.airAccel * 0.3 * dt);
    else f.vx = approach(f.vx, inp.x * MOVE.airSpeed * (f.shield ? 0.35 : 1), MOVE.airAccel * dt);
    if (canAct && !f.shield && inp.jump && f.airJumps > 0) {
      f.airJumps--;
      f.vy = -MOVE.airJump;
      if (Math.abs(inp.x) > 0.2) {
        f.face = inp.x > 0 ? 1 : -1;
        f.vx = inp.x * MOVE.airSpeed;
      }
      events.push({ kind: 'jump', who: f, air: true });
    }
  }
}

/** 重力・足場 */
function physics(f: Fighter, stage: Stage, dt: number): void {
  if (f.ground) {
    f.x += f.vx * dt;
    if (f.x < f.ground.x0 || f.x > f.ground.x1) {
      f.dropFrom = null;
      f.ground = null;
    } else {
      f.y = f.ground.y;
      f.vy = 0;
      return;
    }
  }
  const prevY = f.y;
  f.vy = Math.min(MOVE.maxFall * (f.stun > 0 ? 1.6 : 1), f.vy + MOVE.gravity * dt);
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  if (f.vy < 0) return;
  for (const p of stage.platforms) {
    if (p === f.dropFrom) continue;
    if (prevY <= p.y + 0.5 && f.y >= p.y && f.x >= p.x0 && f.x <= p.x1) {
      f.y = p.y;
      // 強く吹っ飛んでいるときは、床で少しはねる
      if (f.stun > 0 && f.vy > 700) {
        f.vy = -f.vy * 0.35;
        f.y = p.y - 1;
        return;
      }
      f.vy = 0;
      f.ground = p;
      f.airJumps = MOVE.airJumps;
      f.dropFrom = null;
      return;
    }
  }
  if (f.dropFrom && f.y > f.dropFrom.y + 10) f.dropFrom = null;
}

/** 攻撃が当たったか */
function resolveHits(att: Fighter, def: Fighter, events: BattleEvent[]): void {
  const box = hitbox(att, BUNK_ATTACKS);
  if (!box || att.attack!.hit || def.out > 0 || def.safe > 0 || def.roll) return;
  if (!overlap(box, hurtbox(def))) return;
  att.attack!.hit = true;
  const d = BUNK_ATTACKS[att.attack!.name];
  const cx = (Math.max(box.x0, def.x - MOVE.halfW) + Math.min(box.x1, def.x + MOVE.halfW)) / 2;
  const cy = (Math.max(box.y0, def.y - MOVE.height) + Math.min(box.y1, def.y)) / 2;
  const hit = { x0: Math.max(box.x0, def.x - MOVE.halfW), x1: Math.min(box.x1, def.x + MOVE.halfW), y0: Math.max(box.y0, def.y - MOVE.height), y1: Math.min(box.y1, def.y) };
  if (def.shield && insideShield(def, hit)) {
    // ガード: ダメージなし。ガードが削れて小さくなる、少し押される【仮】
    def.vx = att.face * 160;
    def.shieldHp -= d.damage * SHIELD.perDamage;
    events.push({ kind: 'block', target: def, x: cx, y: cy });
    if (def.shieldHp <= 0) {
      def.shieldHp = 0;
      def.shield = false;
      def.shieldCd = SHIELD.breakCooldown;
      def.dizzy = SHIELD.dizzy;
      events.push({ kind: 'shieldBreak', who: def });
    }
    return;
  }
  // ガードの丸から出ている所に当たった: くらう(ガードは切れる)
  if (def.shield) {
    def.shield = false;
    def.shieldCd = SHIELD.cooldown;
  }
  def.hp = Math.max(0, def.hp - d.damage);
  const k = knockback(d, def.hp);
  const rad = (d.angle * Math.PI) / 180;
  def.vx = Math.cos(rad) * k * att.face;
  def.vy = -Math.sin(rad) * k;
  def.ground = null;
  def.attack = null;
  def.stun = 0.12 + k / 3000;
  def.dizzy = 0;
  def.hitBy = att.attack!.name;
  def.face = att.face === 1 ? -1 : 1;
  events.push({ kind: 'hit', target: def, damage: d.damage, x: cx, y: cy });
}

/** アウトになった(HP0・場外)。ストックを1つ減らす */
function ko(f: Fighter, fell: boolean, events: BattleEvent[]): void {
  f.stocks = Math.max(0, f.stocks - 1);
  f.out = 1.2;
  f.attack = null;
  events.push({ kind: 'ko', target: f, fell });
}

function respawn(f: Fighter, at: [number, number]): void {
  Object.assign(f, { x: at[0], y: at[1] - 260, vx: 0, vy: 0, ground: null, airJumps: MOVE.airJumps, hp: HP_MAX, attack: null, stun: 0, dizzy: 0, hitBy: null, safe: 1.5, shield: false, shieldHp: 1, shieldCd: 0, roll: null, dropFrom: null, out: 0 });
}

export interface Battle {
  stage: Stage;
  fighters: Fighter[];
  time: number;
  /** 当たった瞬間に止まっている残りの時間 */
  hitstop: number;
  /** 練習: 的はストックが0になっても、また出てくる */
  practice: boolean;
}

export function newPractice(stage = STAGE): Battle {
  return { stage, fighters: [newFighter(stage.spawn[0][0], stage.spawn[0][1], 1), newFighter(stage.spawn[1][0], stage.spawn[1][1], -1, true)], time: 0, hitstop: 0, practice: true };
}

/** 1回ぶん進める。inputs[i] は fighters[i] の入力(的は使わない) */
export function stepBattle(b: Battle, inputs: Input[], dt: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  b.time += dt;
  if (b.hitstop > 0) {
    b.hitstop -= dt;
    return events;
  }
  b.fighters.forEach((f, i) => {
    if (f.out > 0) {
      f.out -= dt;
      if (f.out <= 0) {
        if (b.practice && f.stocks <= 0) f.stocks = STOCKS;
        if (f.stocks > 0) respawn(f, b.stage.spawn[i % b.stage.spawn.length]);
        else f.out = 0.0001;
      }
      return;
    }
    if (f.safe > 0) f.safe -= dt;
    control(f, f.dummy ? NO_INPUT : inputs[i] ?? NO_INPUT, dt, events);
    physics(f, b.stage, dt);
  });
  for (const a of b.fighters) for (const d of b.fighters) if (a !== d && a.out <= 0) resolveHits(a, d, events);
  for (const e of events) if (e.kind === 'hit') b.hitstop = Math.max(b.hitstop, hitstopFor(e.damage));
  for (const e of events) if (e.kind === 'block') b.hitstop = Math.max(b.hitstop, 0.04);
  for (const f of b.fighters) {
    if (f.out > 0) continue;
    const bl = b.stage.blast;
    if (f.x < bl.x0 || f.x > bl.x1 || f.y < bl.y0 || f.y > bl.y1) ko(f, true, events);
    else if (f.hp <= 0 && f.stun <= 0.05) ko(f, false, events);
  }
  return events;
}
