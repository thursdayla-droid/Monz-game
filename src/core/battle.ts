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
 * 横画面(1280×720)で遊ぶ(企画者の指示 2026-10-22)
 */
export const STAGE: Stage = {
  platforms: [
    { x0: 300, x1: 980, y: 540, thin: false },
    { x0: 360, x1: 560, y: 380, thin: true },
    { x0: 720, x1: 920, y: 380, thin: true },
  ],
  blast: { x0: -260, x1: 1540, y0: -460, y1: 1000 },
  spawn: [
    [480, 540],
    [800, 540],
  ],
};

/** 【仮】動きの数字 */
export const MOVE = {
  gravity: 2600,
  maxFall: 1150,
  walk: 360,
  /** 地上で速さが変わる速さ(px/s²) */
  groundAccel: 4200,
  airSpeed: 330,
  airAccel: 2200,
  jump: 1020,
  /** 空中ジャンプ(2段目) */
  airJump: 900,
  airJumps: 1,
  /** 体の大きさ(当たり判定) */
  halfW: 40,
  height: 120,
  /** 吹っ飛んでいるときに速さが落ちる割合(1秒あたり) */
  launchDrag: 1.6,
};

export const HP_MAX = 100;
export const STOCKS = 2;

export type AttackName = 'jab' | 'side' | 'up' | 'down';

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
}

/** 【仮】BUNKのA攻撃(企画者決定 2026-10-22: 通常A ジャブ・横A ストレート・上A アッパー・下A 足払い) */
export const BUNK_ATTACKS: Record<AttackName, AttackDef> = {
  jab: { label: 'ジャブ', damage: 3, startup: 0.05, active: 0.08, recovery: 0.12, box: { x: 30, y: -95, w: 70, h: 50 }, angle: 30, base: 220, growth: 380 },
  side: { label: 'ストレート', damage: 9, startup: 0.13, active: 0.09, recovery: 0.26, box: { x: 30, y: -100, w: 100, h: 56 }, angle: 35, base: 380, growth: 1000 },
  up: { label: 'アッパー', damage: 7, startup: 0.09, active: 0.11, recovery: 0.22, box: { x: -20, y: -190, w: 90, h: 100 }, angle: 85, base: 400, growth: 900 },
  down: { label: '足払い', damage: 6, startup: 0.08, active: 0.09, recovery: 0.22, box: { x: 10, y: -40, w: 100, h: 40 }, angle: 20, base: 320, growth: 700 },
};

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
  /** 復活したあと、攻撃が当たらない残りの時間 */
  safe: number;
  shield: boolean;
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
  return { x, y, vx: 0, vy: 0, face, ground: null, airJumps: MOVE.airJumps, hp: HP_MAX, stocks: STOCKS, attack: null, stun: 0, safe: 0, shield: false, dropFrom: null, walking: false, out: 0, dummy };
}

/** スティックの向きから、出すA攻撃を決める */
export function attackFor(inp: Input): AttackName {
  if (inp.y < -0.5 && Math.abs(inp.y) >= Math.abs(inp.x)) return 'up';
  if (inp.y > 0.5 && Math.abs(inp.y) >= Math.abs(inp.x)) return 'down';
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

export const hurtbox = (f: Fighter) => ({ x0: f.x - MOVE.halfW, x1: f.x + MOVE.halfW, y0: f.y - MOVE.height, y1: f.y });

const overlap = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export type BattleEvent = { kind: 'hit'; target: Fighter; damage: number; x: number; y: number } | { kind: 'block'; target: Fighter; x: number; y: number } | { kind: 'ko'; target: Fighter; fell: boolean } | { kind: 'jump'; who: Fighter } | { kind: 'swing'; who: Fighter; name: AttackName };

/** 1人ぶん、入力で動かす */
function control(f: Fighter, inp: Input, dt: number, events: BattleEvent[]): void {
  const canAct = f.stun <= 0 && !f.attack;
  f.shield = canAct && !!f.ground && inp.shield;
  f.walking = false;
  if (f.stun > 0) f.stun -= dt;
  if (f.attack) {
    f.attack.t += dt;
    const d = BUNK_ATTACKS[f.attack.name];
    if (f.attack.t >= d.startup + d.active + d.recovery) f.attack = null;
  }
  if (canAct && inp.a && !f.shield) {
    const name = attackFor(inp);
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
      events.push({ kind: 'jump', who: f });
    } else if (moving && inp.y > 0.7 && f.ground.thin) {
      // 浮いた足場から降りる
      f.dropFrom = f.ground;
      f.ground = null;
    }
  } else {
    if (f.stun > 0) f.vx *= Math.max(0, 1 - MOVE.launchDrag * dt);
    // 空中では、攻撃中も少しだけ動ける
    else f.vx = approach(f.vx, inp.x * MOVE.airSpeed, MOVE.airAccel * dt);
    if (canAct && inp.jump && f.airJumps > 0) {
      f.airJumps--;
      f.vy = -MOVE.airJump;
      if (Math.abs(inp.x) > 0.2) f.face = inp.x > 0 ? 1 : -1;
      events.push({ kind: 'jump', who: f });
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
  if (!box || att.attack!.hit || def.out > 0 || def.safe > 0) return;
  if (!overlap(box, hurtbox(def))) return;
  att.attack!.hit = true;
  const d = BUNK_ATTACKS[att.attack!.name];
  const cx = (Math.max(box.x0, def.x - MOVE.halfW) + Math.min(box.x1, def.x + MOVE.halfW)) / 2;
  const cy = (Math.max(box.y0, def.y - MOVE.height) + Math.min(box.y1, def.y)) / 2;
  if (def.shield) {
    // シールド: ダメージなし、少し押される【仮】
    def.vx = att.face * 160;
    events.push({ kind: 'block', target: def, x: cx, y: cy });
    return;
  }
  def.hp = Math.max(0, def.hp - d.damage);
  const k = knockback(d, def.hp);
  const rad = (d.angle * Math.PI) / 180;
  def.vx = Math.cos(rad) * k * att.face;
  def.vy = -Math.sin(rad) * k;
  def.ground = null;
  def.attack = null;
  def.stun = 0.12 + k / 3000;
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
  Object.assign(f, { x: at[0], y: at[1] - 260, vx: 0, vy: 0, ground: null, airJumps: MOVE.airJumps, hp: HP_MAX, attack: null, stun: 0, safe: 1.5, shield: false, dropFrom: null, out: 0 });
}

export interface Battle {
  stage: Stage;
  fighters: Fighter[];
  time: number;
  /** 練習: 的はストックが0になっても、また出てくる */
  practice: boolean;
}

export function newPractice(stage = STAGE): Battle {
  return { stage, fighters: [newFighter(stage.spawn[0][0], stage.spawn[0][1], 1), newFighter(stage.spawn[1][0], stage.spawn[1][1], -1, true)], time: 0, practice: true };
}

/** 1回ぶん進める。inputs[i] は fighters[i] の入力(的は使わない) */
export function stepBattle(b: Battle, inputs: Input[], dt: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  b.time += dt;
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
  for (const f of b.fighters) {
    if (f.out > 0) continue;
    const bl = b.stage.blast;
    if (f.x < bl.x0 || f.x > bl.x1 || f.y < bl.y0 || f.y > bl.y1) ko(f, true, events);
    else if (f.hp <= 0 && f.stun <= 0.05) ko(f, false, events);
  }
  return events;
}
