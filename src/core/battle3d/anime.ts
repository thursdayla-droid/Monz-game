/**
 * 3Dバトル「アニメのモンスターバトル風」(企画者 2026-11-01)の計算。Phaser・Three.js に依存しない。
 * - 広い野外のコートで、2体のモンスターが 間合いをとって動き回り、技を撃ち合う
 * - 技: 企画者の技の表(techTable.ts)の「型」で動く。突進・回転・弾・連射・ビーム・衝撃波・落下・連続攻撃・守り
 * - 装備した技(最大4つ。Ver.44)だけを使う。追加効果は ふらつき・まひ(ほかは【未実装】)
 * - プレイヤーは「技の名前」で指示する(企画者 2026-11-01)。指示がないときも、MONZ は自分で動き・よけ・ときどき技を出す【仮】
 * - 弾どうしがぶつかると爆発して消える。ビームは弾を消す
 * 数字は animeConfig.ts。乱数は種から決まる(同じ種・同じ指示なら同じ試合)。
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import type { Instinct } from '../autobattle/config';
import type { Proficiency } from './config';
import { ANIME as C, TECH_IDS, type TechId } from './animeConfig';
import { EFFECT_CHANCE, getTech, type Effect } from './techTable';

export type Side = 0 | 1;
export type Command = TechId | 'dodge';

export interface AnimeEntrant {
  name: string;
  species: string;
  stats: StatBlock;
  instinct: Instinct;
  proficiency: Proficiency;
  /** 装備している技(最大4つ。Ver.44)。ないときは前の試作の4つ */
  techs?: TechId[];
  /** 形態(1 = 初期・2 = 第1進化・3 = 第2進化)。通常攻撃が変わる */
  form?: number;
}

export type AnimeAct =
  | { k: 'free' }
  | { k: 'tech'; id: TechId; t: number; dir: number; fired: boolean; hit: boolean; tx: number; tz: number; windup: number; n: number; next: number }
  | { k: 'dodge'; t: number; dx: number; dz: number; jump: boolean }
  | { k: 'hurt'; t: number; until: number }
  | { k: 'air'; t: number }
  | { k: 'down'; t: number; until: number }
  | { k: 'ko'; t: number }
  | { k: 'victory'; t: number };

export interface AnimeMon {
  side: Side;
  name: string;
  species: string;
  stats: StatBlock;
  instinct: Instinct;
  prof: Proficiency;
  /** 装備している技 */
  techs: TechId[];
  /** ふらつき・まひ の終わり */
  dizzyUntil: number;
  paraUntil: number;
  /** 攻撃ダウン(ほえる)・遅くなる(重力の場) の終わり */
  atkDownUntil: number;
  slowUntil: number;
  /** 守りのドームの終わりと大きさ */
  barrierUntil: number;
  barrierR: number;
  x: number;
  z: number;
  y: number;
  vy: number;
  face: number;
  hp: number;
  maxHp: number;
  act: AnimeAct;
  cooldown: Record<string, number>;
  command: { cmd: Command; until: number } | null;
  plan: 'approach' | 'retreat' | 'circleL' | 'circleR' | 'hold';
  planT: number;
  thinkT: number;
  kvx: number;
  kvz: number;
  /** ダウンから起きたあとの無敵の終わり */
  safeUntil: number;
  speed: number;
  /** 歩く速さ(勢いがある: 急に止まらない・急に速くならない) */
  vx: number;
  vz: number;
  /** 急に走る(横へダッシュなど)の終わり */
  burstUntil: number;
  /**
   * 技の出し方(企画者 2026-11-02「オートで技出すモードと、自分で全部技を選んで動きだけ勝手に動く感じで切り替え」)。
   * 'auto' = 自分で技をえらんで出す(指示もできる) / 'manual' = 技は指示だけ。動く・よける は自分で
   */
  techMode: 'auto' | 'manual';
  /**
   * プレイヤーが動かす(2026-11-02 企画者「左に移動スティックで自分で動かす」)。
   * 動く向き(世界の X・Z。長さ0〜1)。null なら AI が動かす
   */
  pad: { x: number; z: number } | null;
  /** 通常攻撃(形態で変わる) */
  jab: { parts: number[]; range: number };
  /** 受け身の予約(空中で よける を押した) */
  ukemi: boolean;
}

export interface Shot {
  id: number;
  owner: Side;
  tech: TechId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  t: number;
  alive: boolean;
}

export interface Beam {
  owner: Side;
  tech: TechId;
  x: number;
  z: number;
  dir: number;
  t: number;
  hit: boolean;
}

export interface Quake {
  owner: Side;
  tech: TechId;
  x: number;
  z: number;
  r: number;
  hit: boolean;
}

export type AnimeEvent =
  | { kind: 'call'; side: Side; tech: TechId; byCommand: boolean }
  | { kind: 'fire'; side: Side; tech: TechId }
  | { kind: 'hit'; side: Side; target: Side; tech: TechId; damage: number; x: number; y: number; z: number; big: boolean; crit?: boolean }
  | { kind: 'explode'; x: number; y: number; z: number; tech: TechId; big: boolean }
  | { kind: 'clash'; x: number; y: number; z: number }
  | { kind: 'dodge'; side: Side; jump: boolean }
  | { kind: 'evaded'; side: Side }
  | { kind: 'quake'; side: Side; x: number; z: number }
  | { kind: 'land'; side: Side; hard: boolean }
  | { kind: 'command'; side: Side; cmd: Command; state: 'queued' | 'done' | 'expired' }
  | { kind: 'status'; side: Side; effect: Effect }
  | { kind: 'roar'; side: Side; x: number; z: number }
  | { kind: 'ukemi'; side: Side }
  | { kind: 'field'; side: Side; x: number; z: number; r: number; until: number }
  | { kind: 'blocked'; side: Side; x: number; y: number; z: number }
  | { kind: 'mark'; side: Side; x: number; z: number; r: number; until: number }
  | { kind: 'impact'; side: Side; tech: TechId; x: number; z: number; r: number }
  | { kind: 'comboHit'; side: Side; n: number }
  | { kind: 'ko'; side: Side }
  | { kind: 'victory'; side: Side }
  | { kind: 'timeUp' };

export interface AnimeBattle {
  f: [AnimeMon, AnimeMon];
  t: number;
  rng: Rng;
  winner: Side | 'draw' | null;
  koAt: number | null;
  shots: Shot[];
  beams: Beam[];
  quakes: Quake[];
  /** ほえる声の輪(ダメージなし。当たると攻撃ダウン) */
  roars: Quake[];
  /** 重力の場(中にいると遅くなる) */
  fields: { owner: Side; tech: TechId; x: number; z: number; r: number; until: number }[];
  seq: number;
  events: AnimeEvent[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: readonly number[], p: number) => a[0] + (a[1] - a[0]) * p;
const lv = (f: AnimeMon, k: keyof Proficiency) => clamp((f.prof[k] - 1) / 4, 0, 1);
const other = (b: AnimeBattle, f: AnimeMon) => b.f[f.side === 0 ? 1 : 0];
const dist = (a: { x: number; z: number }, c: { x: number; z: number }) => Math.hypot(c.x - a.x, c.z - a.z);
const angleTo = (a: { x: number; z: number }, c: { x: number; z: number }) => Math.atan2(c.z - a.z, c.x - a.x);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const wobble = (rng: Rng) => (rng() + rng() + rng() - 1.5) / 1.5;

function newMon(e: AnimeEntrant, side: Side): AnimeMon {
  const maxHp = Math.round(C.stat.hpBase + e.stats.hp * C.stat.perHp);
  return {
    side,
    name: e.name,
    species: e.species,
    stats: e.stats,
    instinct: e.instinct,
    prof: e.proficiency,
    techs: e.techs ?? [...TECH_IDS],
    jab: C.jabByForm[Math.max(1, Math.min(3, e.form ?? 1)) - 1],
    ukemi: false,
    dizzyUntil: 0,
    paraUntil: 0,
    atkDownUntil: 0,
    slowUntil: 0,
    barrierUntil: 0,
    barrierR: 0,
    x: side === 0 ? -6 : 6,
    z: side === 0 ? 2 : -2,
    y: 0,
    vy: 0,
    face: side === 0 ? -0.3 : Math.PI - 0.3,
    hp: maxHp,
    maxHp,
    act: { k: 'free' },
    cooldown: Object.fromEntries([...(e.techs ?? TECH_IDS), 'dodge', 'jump', 'punch'].map((k) => [k, 0])),
    command: null,
    plan: 'hold',
    planT: 0,
    thinkT: 0.8,
    kvx: 0,
    kvz: 0,
    safeUntil: 0,
    speed: 0,
    vx: 0,
    vz: 0,
    burstUntil: 0,
    techMode: 'auto',
    pad: null,
  };
}

export function newAnimeBattle(a: AnimeEntrant, c: AnimeEntrant, seed: number, partnerMode: 'auto' | 'manual' = 'auto'): AnimeBattle {
  const rng = mulberry32(seed);
  const f: [AnimeMon, AnimeMon] = [newMon(a, 0), newMon(c, 1)];
  f[0].techMode = partnerMode;
  // はじめは少し様子を見る
  for (const m of f) m.thinkT = 0.8 + rng() * 0.6;
  return { f, t: 0, rng, winner: null, koAt: null, shots: [], beams: [], quakes: [], roars: [], fields: [], seq: 0, events: [] };
}

// ---------------- 指示 ----------------

export function commandState(b: AnimeBattle, side: Side, cmd: Command): 'ready' | 'queued' | 'cooldown' {
  const f = b.f[side];
  if (f.command?.cmd === cmd) return 'queued';
  return (f.cooldown[cmd] ?? 0) > b.t ? 'cooldown' : 'ready';
}

/** 技の名前(または「よけろ」)で指示する。動けないときは待つ(1.5秒で消える)。1件だけ(新しい指示で置きかえ) */
export function giveCommand(b: AnimeBattle, side: Side, cmd: Command): boolean {
  const f = b.f[side];
  if (b.winner !== null || f.act.k === 'ko') return false;
  if ((f.cooldown[cmd] ?? Infinity) > b.t) return false;
  f.command = { cmd, until: b.t + C.command.wait };
  b.events.push({ kind: 'command', side, cmd, state: 'queued' });
  return true;
}

// ---------------- 行動 ----------------

function startTech(b: AnimeBattle, f: AnimeMon, id: TechId, byCommand: boolean): void {
  const o = other(b, f);
  const tech = getTech(id);
  // ねらい(習熟度が低いと少しずれる)
  const dir = angleTo(f, o) + wobble(b.rng) * lerp(C.skill.aim, lv(f, 'attack')) * (1 - Math.min(0.6, f.stats.tech / C.stat.techAim));
  // まひ中は ためが長い
  // スピードが高いと、ためが短い。まひ中は長い
  const windup = tech.windup * (1 - Math.min(C.stat.speedWindupMax, f.stats.speed / C.stat.speedWindupDiv)) * (b.t < f.paraUntil ? C.status.paraWindup : 1);
  f.act = { k: 'tech', id, t: 0, dir, fired: false, hit: false, tx: o.x, tz: o.z, windup, n: 0, next: 0 };
  f.face = dir;
  // テクニックが高いと、技の待ち時間が少し短い(最大2割。2026-11-02 バランス)
  f.cooldown[id] = tech.kind === 'jab'
    ? b.t + tech.windup + tech.duration * f.jab.parts.length + tech.recovery + tech.cooldown // 通常攻撃: 連打が終わってから0.5秒
    : b.t + tech.cooldown * (1 - Math.min(C.stat.techCdMax, f.stats.tech / C.stat.techCdDiv));
  b.events.push({ kind: 'call', side: f.side, tech: id, byCommand });
}

function startDodge(b: AnimeBattle, f: AnimeMon, jump: boolean): void {
  const o = other(b, f);
  const a = angleTo(f, o);
  let s = b.rng() < 0.5 ? 1 : -1;
  const out = (k: number) => {
    const x = f.x + Math.cos(a + (k * Math.PI) / 2) * C.dodge.distance;
    const z = f.z + Math.sin(a + (k * Math.PI) / 2) * C.dodge.distance;
    return Math.max(Math.abs(x) / C.field.halfX, Math.abs(z) / C.field.halfZ);
  };
  if (out(s) > 0.9 && out(-s) < out(s)) s = -s;
  let dir = a + (s * Math.PI) / 2;
  // プレイヤーが動かしているときは、スティックの向きへよける(倒していなければ横へ)
  if (f.pad && Math.hypot(f.pad.x, f.pad.z) > 0.2) dir = Math.atan2(f.pad.z, f.pad.x);
  f.act = { k: 'dodge', t: 0, dx: Math.cos(dir), dz: Math.sin(dir), jump };
  if (jump) f.vy = 9;
  f.cooldown.dodge = b.t + C.dodge.cooldown * 0.5;
  b.events.push({ kind: 'dodge', side: f.side, jump });
}

/** 技のため・発射 */
function updateTech(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, dt: number): void {
  const tech = getTech(a.id);
  const o = other(b, f);
  a.t += dt;
  const run = a.t - a.windup;
  const shoot = (dir: number) => {
    b.seq++;
    b.shots.push({ id: b.seq, owner: f.side, tech: a.id, x: f.x + Math.cos(dir) * 0.9, y: 0.8, z: f.z + Math.sin(dir) * 0.9, vx: Math.cos(dir) * tech.speed, vz: Math.sin(dir) * tech.speed, r: tech.size, t: 0, alive: true });
  };
  if (!a.fired && a.t >= a.windup) {
    a.fired = true;
    b.events.push({ kind: 'fire', side: f.side, tech: a.id });
    if (tech.kind === 'shot') shoot(a.dir);
    else if (tech.kind === 'barrage') {
      shoot(a.dir);
      a.n = 1;
      a.next = a.t + C.barrage.gap;
    } else if (tech.kind === 'beam') b.beams.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, dir: a.dir, t: 0, hit: false });
    else if (tech.kind === 'quake') {
      // その場で踏みつける(小さく跳ねて、着地で衝撃波)
      f.vy = C.quake.hop;
      f.y = 0.001;
    } else if (tech.kind === 'drop') {
      // 高く跳んで、相手のいた所へ落ちる(落ちる所に印)
      const air = (2 * C.drop.jump) / C.gravity;
      const tx = clamp(o.x, -C.field.halfX, C.field.halfX);
      const tz = clamp(o.z, -C.field.halfZ, C.field.halfZ);
      a.tx = tx;
      a.tz = tz;
      f.vy = C.drop.jump;
      f.y = 0.001;
      f.vx = (tx - f.x) / air;
      f.vz = (tz - f.z) / air;
      b.events.push({ kind: 'mark', side: f.side, x: tx, z: tz, r: tech.size, until: b.t + air });
    } else if (tech.kind === 'debuff') {
      // ほえる: 口もとから声の輪が広がる
      b.roars.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.5, hit: false });
      b.events.push({ kind: 'roar', side: f.side, x: f.x, z: f.z });
    } else if (tech.kind === 'field') {
      // 拳を地面にたたきつけ、相手のいる所に重力の場【案: 場所は相手の足もと】
      const fx = clamp(o.x, -C.field.halfX, C.field.halfX);
      const fz = clamp(o.z, -C.field.halfZ, C.field.halfZ);
      b.fields.push({ owner: f.side, tech: a.id, x: fx, z: fz, r: tech.size, until: b.t + C.gfield.time });
      b.events.push({ kind: 'field', side: f.side, x: fx, z: fz, r: tech.size, until: b.t + C.gfield.time });
    } else if (tech.kind === 'barrier') {
      f.barrierUntil = b.t + tech.duration;
      f.barrierR = tech.size;
    }
  }
  if (!a.fired) return;
  switch (tech.kind) {
    case 'rush': {
      // 突進: まっすぐ走る(とちゅうで曲がらない)
      if (run * tech.speed < tech.range && !a.hit) {
        f.x += Math.cos(a.dir) * tech.speed * dt;
        f.z += Math.sin(a.dir) * tech.speed * dt;
        if (dist(f, o) < C.body.minGap + 0.2 && Math.abs(o.y - f.y) < 1.2) {
          a.hit = true;
          hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, a.dir);
        }
        return;
      }
      a.hit = true;
      break;
    }
    case 'spin': {
      // 回転: 転がって、少しずつ相手のほうへ曲がる
      if (run < tech.duration && !a.hit) {
        a.dir += clamp(angDiff(angleTo(f, o), a.dir), -C.spin.turn * dt, C.spin.turn * dt);
        f.face = a.dir;
        f.x += Math.cos(a.dir) * tech.speed * dt;
        f.z += Math.sin(a.dir) * tech.speed * dt;
        if (dist(f, o) < C.body.minGap + 0.3 && Math.abs(o.y - f.y) < 1.2) {
          a.hit = true;
          hit(b, f, o, a.id, (f.x + o.x) / 2, 0.6, (f.z + o.z) / 2, a.dir);
        }
        return;
      }
      a.hit = true;
      break;
    }
    case 'combo': {
      // 連続攻撃: 近づいて、何回も打つ
      if (a.n === 0) {
        const near = dist(f, o) < C.combo.reach;
        if (!near && run * tech.speed < tech.range) {
          a.dir = angleTo(f, o);
          f.face = a.dir;
          f.x += Math.cos(a.dir) * tech.speed * dt;
          f.z += Math.sin(a.dir) * tech.speed * dt;
          return;
        }
        if (!near) {
          a.hit = true;
          a.n = tech.hits;
          break;
        }
        a.next = a.t;
      }
      if (a.n < tech.hits) {
        if (a.t >= a.next) {
          a.n++;
          a.next = a.t + tech.duration;
          f.face = angleTo(f, o);
          if (dist(f, o) < C.combo.reach + 0.6 && Math.abs(o.y - f.y) < 1.2) {
            b.events.push({ kind: 'comboHit', side: f.side, n: a.n });
            hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, f.face, { last: a.n >= tech.hits, part: tech.hits === 4 ? C.combo4[a.n - 1] : 1 / tech.hits });
          } else a.n = tech.hits; // 相手がはなれたら終わり
        }
        return;
      }
      a.hit = true;
      break;
    }
    case 'jab': {
      // 通常攻撃: その場で前へパンチ。当たったら続けて3連まで(外れたら そこで終わり)。空中でも出せる
      if (!a.hit && a.t >= a.next) {
        const reach = f.jab.range + C.body.radius;
        const ok = dist(f, o) < reach && Math.abs(angDiff(angleTo(f, o), f.face)) < 0.9 && Math.abs(o.y - f.y) < 1.3;
        a.n++;
        a.next = a.t + tech.duration;
        b.events.push({ kind: 'comboHit', side: f.side, n: a.n });
        const parts = f.jab.parts;
        const landed = ok && hit(b, f, o, a.id, (f.x + o.x) / 2, f.y + 0.8, (f.z + o.z) / 2, f.face, { last: a.n >= parts.length, part: parts[a.n - 1] });
        if (!landed || a.n >= parts.length) a.hit = true;
      }
      if (a.hit && a.t >= a.next + tech.recovery) f.act = { k: 'free' };
      return;
    }
    case 'barrage':
      if (a.n < C.barrage.count && a.t >= a.next) {
        a.n++;
        a.next = a.t + C.barrage.gap;
        shoot(angleTo(f, o) + wobble(b.rng) * 0.08);
      }
      break;
    case 'quake':
    case 'drop':
      if (f.y > 0) return;
      if (!a.hit) {
        a.hit = true;
        if (tech.kind === 'quake') {
          b.quakes.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.3, hit: false });
          b.events.push({ kind: 'quake', side: f.side, x: f.x, z: f.z });
        } else {
          f.vx = f.vz = 0;
          b.events.push({ kind: 'impact', side: f.side, tech: a.id, x: f.x, z: f.z, r: tech.size });
          if (dist(f, o) < tech.size + C.body.radius && o.y < 0.6) hit(b, f, o, a.id, o.x, 0.5, o.z, angleTo(f, o));
          else b.events.push({ kind: 'evaded', side: o.side });
        }
      }
      break;
    default:
      break;
  }
  const extra = tech.kind === 'beam' || tech.kind === 'barrier' ? tech.duration : tech.kind === 'barrage' ? C.barrage.gap * C.barrage.count : 0;
  const move = tech.kind === 'rush' ? tech.range / tech.speed : 0;
  if (a.hit || tech.kind === 'shot' || tech.kind === 'barrage' || tech.kind === 'beam' || tech.kind === 'barrier' || tech.kind === 'debuff' || tech.kind === 'field') {
    if (a.t >= a.windup + extra + tech.recovery + (a.hit ? 0 : move) && f.y <= 0) f.act = { k: 'free' };
    else if (tech.kind === 'rush' && a.hit && run >= tech.recovery && f.y <= 0 && a.t >= a.windup + tech.recovery) f.act = { k: 'free' };
  }
}

/** 当たり → ダメージ・吹っ飛び */
function hit(b: AnimeBattle, f: AnimeMon, o: AnimeMon, id: TechId, x: number, y: number, z: number, dir: number, opt: { last?: boolean; part?: number } = {}): boolean {
  if (o.act.k === 'ko' || o.act.k === 'victory') return false;
  if (b.t < o.safeUntil || o.act.k === 'down') return false;
  // 守りのドームの中 → 止める
  if (b.t < o.barrierUntil) {
    b.events.push({ kind: 'blocked', side: o.side, x, y, z });
    return false;
  }
  if (o.act.k === 'dodge' && o.act.t < C.dodge.invincible) {
    b.events.push({ kind: 'evaded', side: o.side });
    return false;
  }
  const tech = getTech(id);
  const part = opt.part ?? 1;
  // テクニックが高いと、クリティカル(1.4倍)が出やすい
  const crit = b.rng() < Math.min(0.3, f.stats.tech / C.stat.techCritDiv);
  // 攻撃ダウン中は、与えるダメージが下がる
  const down = b.t < f.atkDownUntil ? C.debuff.atkDown : 1;
  const dmg = Math.max(1, Math.round(down * (crit ? C.stat.critMul : 1) * tech.power * part * (part < 1 ? C.combo.bonus : 1) * (1 + f.stats.power / C.stat.powerDiv) * (C.stat.toughDiv / (C.stat.toughDiv + o.stats.tough)) * (0.9 + b.rng() * 0.2)));
  o.hp = Math.max(0, o.hp - dmg);
  const finish = opt.last ?? true;
  // 通常攻撃(パンチの連打)は、さいごの1発だけ押す(とちゅうで とどかなくならないように)
  const knock = tech.knock * (finish ? 1 : tech.kind === 'jab' ? 0 : 0.25);
  o.kvx += Math.cos(dir) * knock * C.hurt.friction * 0.35;
  o.kvz += Math.sin(dir) * knock * C.hurt.friction * 0.35;
  o.command = null;
  o.face = angleTo(o, f);
  const big = tech.launch > 0 && finish;
  b.events.push({ kind: 'hit', side: f.side, target: o.side, tech: id, damage: dmg, x, y, z, big, crit });
  if (o.hp <= 0) {
    o.act = { k: 'ko', t: 0 };
    o.vy = Math.max(o.vy, 6);
    o.y = Math.max(o.y, 0.001);
    if (b.winner === null) {
      b.winner = f.side;
      b.koAt = b.t;
      b.events.push({ kind: 'ko', side: o.side });
    }
    return true;
  }
  // 追加効果(ふらつき・まひ。ほかは【未実装】)
  if (finish && tech.effect !== 'なし' && b.rng() < EFFECT_CHANCE[tech.strength] + Math.min(0.25, f.stats.tech / C.stat.techEffectDiv)) {
    if (tech.effect === 'ふらつき') o.dizzyUntil = b.t + C.status.dizzy;
    if (tech.effect === 'まひ') o.paraUntil = b.t + C.status.para;
    b.events.push({ kind: 'status', side: o.side, effect: tech.effect });
  }
  if (big) {
    o.vy = tech.launch;
    o.y = Math.max(o.y, 0.001);
    o.act = { k: 'air', t: 0 };
  } else o.act = { k: 'hurt', t: 0, until: finish ? C.hurt.stun : C.combo.stun };
  return true;
}

// ---------------- 弾・ビーム・衝撃波 ----------------

function updateProjectiles(b: AnimeBattle, dt: number): void {
  const H = C.field;
  for (const s of b.shots) {
    if (!s.alive) continue;
    s.t += dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const tgt = b.f[s.owner === 0 ? 1 : 0];
    if (b.t < tgt.barrierUntil && dist(s, tgt) < tgt.barrierR + s.r) {
      s.alive = false;
      b.events.push({ kind: 'blocked', side: tgt.side, x: s.x, y: s.y, z: s.z });
      continue;
    }
    if (dist(s, tgt) < s.r + C.body.radius && Math.abs(tgt.y + 0.7 - s.y) < 1.2) {
      const did = hit(b, b.f[s.owner], tgt, s.tech, s.x, s.y, s.z, Math.atan2(s.vz, s.vx));
      if (did) {
        s.alive = false;
        b.events.push({ kind: 'explode', x: s.x, y: s.y, z: s.z, tech: s.tech, big: false });
      }
    }
    if (Math.abs(s.x) > H.halfX + 3 || Math.abs(s.z) > H.halfZ + 3 || s.t > 4) s.alive = false;
  }
  // 弾どうしがぶつかる → 両方爆発
  for (const s of b.shots)
    for (const u of b.shots) {
      if (s.alive && u.alive && s.owner !== u.owner && dist(s, u) < s.r + u.r) {
        s.alive = u.alive = false;
        b.events.push({ kind: 'clash', x: (s.x + u.x) / 2, y: (s.y + u.y) / 2, z: (s.z + u.z) / 2 });
      }
    }
  // ビーム
  for (const beam of b.beams) {
    beam.t += dt;
    const tech = getTech(beam.tech);
    const owner = b.f[beam.owner];
    beam.x = owner.x;
    beam.z = owner.z;
    const cos = Math.cos(beam.dir);
    const sin = Math.sin(beam.dir);
    const onBeam = (p: { x: number; z: number }, r: number) => {
      const dx = p.x - beam.x;
      const dz = p.z - beam.z;
      const along = dx * cos + dz * sin;
      const side = Math.abs(-dx * sin + dz * cos);
      return along > 0 && along < tech.range && side < tech.size + r;
    };
    // 弾を消す
    for (const s of b.shots)
      if (s.alive && s.owner !== beam.owner && onBeam(s, s.r)) {
        s.alive = false;
        b.events.push({ kind: 'explode', x: s.x, y: s.y, z: s.z, tech: s.tech, big: false });
      }
    const tgt = b.f[beam.owner === 0 ? 1 : 0];
    if (!beam.hit && onBeam(tgt, C.body.radius) && tgt.y < 1.5) {
      if (hit(b, owner, tgt, beam.tech, tgt.x, 0.8, tgt.z, beam.dir)) {
        beam.hit = true;
        b.events.push({ kind: 'explode', x: tgt.x, y: 0.9, z: tgt.z, tech: beam.tech, big: true });
      }
    }
  }
  b.beams = b.beams.filter((x) => x.t < getTech(x.tech).duration);
  // 衝撃波(輪が広がる。ジャンプ中ならよけられる)
  for (const q of b.quakes) {
    const tech = getTech(q.tech);
    const prev = q.r;
    q.r += tech.speed * dt;
    const tgt = b.f[q.owner === 0 ? 1 : 0];
    const d = dist(q, tgt);
    if (!q.hit && d >= prev - C.body.radius && d <= q.r + C.body.radius) {
      if (tgt.y > 0.5) b.events.push({ kind: 'evaded', side: tgt.side });
      else if (hit(b, b.f[q.owner], tgt, q.tech, tgt.x, 0.4, tgt.z, angleTo(q, tgt))) b.events.push({ kind: 'explode', x: tgt.x, y: 0.4, z: tgt.z, tech: q.tech, big: true });
      q.hit = true;
    }
  }
  b.quakes = b.quakes.filter((q) => q.r < getTech(q.tech).range);
  // ほえる声の輪: とどいたら攻撃ダウン(よけている間は効かない。輪の外へ出れば当たらない)
  for (const q of b.roars) {
    const prev = q.r;
    q.r += getTech(q.tech).speed * dt;
    const tgt = b.f[q.owner === 0 ? 1 : 0];
    const d = dist(q, tgt);
    if (!q.hit && d >= prev - C.body.radius && d <= q.r + C.body.radius) {
      q.hit = true;
      if (tgt.act.k === 'dodge' && tgt.act.t < C.dodge.invincible) b.events.push({ kind: 'evaded', side: tgt.side });
      else if (tgt.act.k !== 'ko') {
        tgt.atkDownUntil = b.t + C.debuff.time;
        b.events.push({ kind: 'status', side: tgt.side, effect: '攻撃ダウン' });
      }
    }
  }
  b.roars = b.roars.filter((q) => q.r < getTech(q.tech).range);
  // 重力の場: 中にいる相手は遅くなる(出ても少しのあいだ遅いまま)
  for (const fl of b.fields) {
    const tgt = b.f[fl.owner === 0 ? 1 : 0];
    if (dist(fl, tgt) < fl.r && tgt.y < 0.5) {
      if (b.t >= tgt.slowUntil) b.events.push({ kind: 'status', side: tgt.side, effect: '遅くする' });
      tgt.slowUntil = b.t + C.gfield.linger;
    }
  }
  b.fields = b.fields.filter((fl) => b.t < fl.until);
  b.shots = b.shots.filter((s) => s.alive);
}

// ---------------- AI ----------------

/** 飛んでくる技を見て、よける(習熟度 Evasion) */
function watchDanger(b: AnimeBattle, f: AnimeMon): void {
  if (f.act.k !== 'free' || f.y > 0 || f.cooldown.dodge > b.t) return;
  const o = other(b, f);
  let danger: 'side' | 'jump' | null = null;
  for (const s of b.shots) {
    if (s.owner === f.side) continue;
    const dx = f.x - s.x;
    const dz = f.z - s.z;
    const sp = Math.hypot(s.vx, s.vz);
    const along = (dx * s.vx + dz * s.vz) / sp;
    const sideOff = Math.abs((-dx * s.vz + dz * s.vx) / sp);
    if (along > 0 && along / sp < 0.45 && sideOff < s.r + C.body.radius + 0.3) danger = 'side';
  }
  // ビームのため(相手がこちらを向いてためている)
  if (o.act.k === 'tech') {
    const k = getTech(o.act.id).kind;
    if (k === 'beam' && !o.act.fired && o.act.t > o.act.windup - 0.4) danger = 'side';
    if ((k === 'rush' || k === 'spin' || k === 'combo') && o.act.fired && !o.act.hit && dist(f, o) < 3.5) danger = 'side';
    // 落ちてくる所の中にいる
    if (k === 'drop' && o.act.fired && !o.act.hit && dist(f, { x: o.act.tx, z: o.act.tz }) < getTech(o.act.id).size + C.body.radius) danger = 'side';
  }
  for (const q of b.quakes) if (q.owner !== f.side && !q.hit && dist(q, f) - q.r < 1.4 && dist(q, f) - q.r > 0.3) danger = 'jump';
  if (!danger) return;
  // 守りの技があれば、ドームで止める(習熟度 Defense・防衛本能)
  // 守りの技は技なので、しゅどうのときは自分では出さない
  const guard = f.techMode === 'auto' ? f.techs.find((id) => getTech(id).kind === 'barrier' && (f.cooldown[id] ?? 0) <= b.t) : undefined;
  if (guard && b.t >= f.dizzyUntil && danger === 'side' && b.rng() < lerp(C.skill.dodge, lv(f, 'defense')) * (0.4 + f.instinct.defense * 0.8)) {
    startTech(b, f, guard, false);
    return;
  }
  // 1回の危険につき1回だけ判断(よけないと決めたら、少しのあいだ判断しない)
  if (b.rng() < lerp(C.skill.dodge, lv(f, 'evasion')) * (0.6 + f.instinct.survival * 0.6) + Math.min(0.2, f.stats.speed / C.stat.speedDodgeDiv)) startDodge(b, f, danger === 'jump');
  else f.cooldown.dodge = b.t + 0.5;
}

function chooseTech(b: AnimeBattle, f: AnimeMon): TechId | null {
  const o = other(b, f);
  const d = dist(f, o);
  // 装備した技のうち、使えるもの(守りは危ない時だけ)
  const ready = f.techs.filter((id) => (f.cooldown[id] ?? 0) <= b.t && getTech(id).kind !== 'barrier');
  if (!ready.length) return null;
  const w = ready.map((id) => {
    const t = getTech(id);
    let x = 1;
    if (t.kind === 'rush' || t.kind === 'spin' || t.kind === 'combo') x = d < 9 ? 1 + f.instinct.attack : 0.2;
    else if (t.kind === 'quake') x = d < t.range * 0.9 ? 1.2 + f.instinct.fight : 0.05;
    else if (t.kind === 'drop') x = d < t.range ? 1 + f.instinct.fight : 0.1;
    else if (t.kind === 'beam') x = 0.8 + f.instinct.fight;
    else if (t.kind === 'debuff') x = b.t < o.atkDownUntil ? 0.05 : d < t.range ? 0.9 : 0.1;
    else if (t.kind === 'field') x = b.fields.some((fl) => fl.owner === f.side) ? 0.05 : 0.8;
    return x * (t.strength === '大技' ? 1.6 : 1);
  });
  let r = b.rng() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < ready.length; i++) {
    r -= w[i];
    if (r < 0) return ready[i];
  }
  return ready[0];
}

function think(b: AnimeBattle, f: AnimeMon): void {
  const o = other(b, f);
  const d = dist(f, o);
  // 自分で技を出す(相手はよく出す。自分の MONZ は指示が中心で、ときどき)【仮】
  // オート: 自分で技を出す(相手と同じくらい) / しゅどう: 自分では出さない
  const p = f.techMode === 'manual' ? 0 : f.side === 0 ? C.selfUse.partnerAuto : C.selfUse.rival;
  if (b.t < f.dizzyUntil) {
    // ふらつき: 技を出せず、ふらふら歩く
    f.plan = (['circleL', 'circleR', 'retreat', 'hold'] as const)[Math.floor(b.rng() * 4)];
    f.planT = 0;
    return;
  }
  if (b.rng() < p * (0.6 + f.instinct.attack * 0.8) * (o.act.k === 'hurt' || o.act.k === 'down' ? 2 : 1)) {
    const id = chooseTech(b, f);
    if (id) return startTech(b, f, id, false);
  }
  // 生き物らしく: ときどき急に横へダッシュ・小さく跳ねる
  if (b.rng() < C.move.burstChance) {
    f.burstUntil = b.t + C.move.burstTime;
    f.plan = b.rng() < 0.5 ? 'circleL' : 'circleR';
    f.planT = 0;
    return;
  }
  if (b.rng() < C.move.hopChance) {
    f.vy = C.move.hop;
    f.y = 0.001;
    return;
  }
  if (f.planT < C.moveHold) return;
  const r = b.rng();
  let plan: AnimeMon['plan'];
  if (d > C.spacing.far) plan = 'approach';
  else if (d < C.spacing.near) plan = r < 0.5 ? 'retreat' : r < 0.75 ? 'circleL' : 'circleR';
  else plan = r < 0.35 ? 'circleL' : r < 0.7 ? 'circleR' : r < 0.85 ? 'hold' : 'approach';
  if (plan !== f.plan) f.planT = 0;
  f.plan = plan;
}

function walk(b: AnimeBattle, f: AnimeMon, dt: number): void {
  const o = other(b, f);
  const a = angleTo(f, o);
  const d = dist(f, o);
  let vx = 0;
  let vz = 0;
  if (f.plan === 'approach') [vx, vz] = [Math.cos(a), Math.sin(a)];
  else if (f.plan === 'retreat') [vx, vz] = [-Math.cos(a), -Math.sin(a)];
  else if (f.plan === 'circleL' || f.plan === 'circleR') {
    const s = f.plan === 'circleL' ? 1 : -1;
    const keep = clamp((d - C.spacing.ideal) * 0.3, -0.6, 0.6);
    vx = Math.cos(a + (s * Math.PI) / 2) + Math.cos(a) * keep;
    vz = Math.sin(a + (s * Math.PI) / 2) + Math.sin(a) * keep;
  }
  // コートの端に近いと、中へもどる
  const H = C.field;
  if (Math.abs(f.x) > H.halfX - 2 && Math.sign(vx) === Math.sign(f.x)) vx = -Math.sign(f.x) * 0.6;
  if (Math.abs(f.z) > H.halfZ - 2 && Math.sign(vz) === Math.sign(f.z)) vz = -Math.sign(f.z) * 0.6;
  const len = Math.hypot(vx, vz);
  // 速さに強弱をつける(いつも同じ速さだと機械みたいなので)
  const sway = 0.75 + 0.35 * Math.sin(b.t * 2.3 + f.side * 1.7) + 0.15 * Math.sin(b.t * 5.1 + f.side);
  const sp = (C.stat.walkBase + f.stats.speed * C.stat.walkPerSpeed) * sway * (b.t < f.paraUntil ? C.status.paraSpeed : 1) * (b.t < f.slowUntil ? C.gfield.slow : 1) * (b.t < f.dizzyUntil ? 0.6 : 1) * (b.t < f.burstUntil ? C.move.burst : 1);
  const wx = len > 0.01 ? (vx / len) * sp : 0;
  const wz = len > 0.01 ? (vz / len) * sp : 0;
  // 勢い: 少しずつ速さを合わせる
  const k = 1 - Math.exp(-dt * C.move.accel);
  f.vx += (wx - f.vx) * k;
  f.vz += (wz - f.vz) * k;
  f.x += f.vx * dt;
  f.z += f.vz * dt;
  f.speed = Math.hypot(f.vx, f.vz);
  // 向き: すばやく相手のほうへ(近いほど速く回る)
  f.face += angDiff(a, f.face) * (1 - Math.exp(-dt * C.stat.turnRate));
}

/** スティックで歩く(勢いあり・相手のほうを向いたまま) */
function padWalk(b: AnimeBattle, f: AnimeMon, dt: number): void {
  const o = other(b, f);
  const len = Math.min(1, Math.hypot(f.pad!.x, f.pad!.z));
  const sp = (C.stat.walkBase + f.stats.speed * C.stat.walkPerSpeed) * C.pad.speed * len * (b.t < f.paraUntil ? C.status.paraSpeed : 1) * (b.t < f.slowUntil ? C.gfield.slow : 1) * (b.t < f.dizzyUntil ? 0.6 : 1);
  const n = Math.hypot(f.pad!.x, f.pad!.z) || 1;
  const wx = len > 0.05 ? (f.pad!.x / n) * sp : 0;
  const wz = len > 0.05 ? (f.pad!.z / n) * sp : 0;
  const k = 1 - Math.exp(-dt * C.move.accel * 1.6);
  f.vx += (wx - f.vx) * k;
  f.vz += (wz - f.vz) * k;
  f.x += f.vx * dt;
  f.z += f.vz * dt;
  f.speed = Math.hypot(f.vx, f.vz);
  f.face += angDiff(angleTo(f, o), f.face) * (1 - Math.exp(-dt * C.stat.turnRate));
}

// ---------------- 1回分すすめる ----------------

function updateMon(b: AnimeBattle, f: AnimeMon, dt: number): void {
  const a = f.act;
  f.speed = 0;
  if (f.y > 0 || f.vy > 0) {
    f.vy -= C.gravity * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      const hard = a.k === 'air' || a.k === 'ko' || (a.k === 'tech' && (getTech(a.id).kind === 'quake' || getTech(a.id).kind === 'drop'));
      b.events.push({ kind: 'land', side: f.side, hard });
      if (a.k === 'air') {
        // 受け身: 空中で よける を押していたら、たおれずに転がって起きる
        if (f.ukemi) {
          f.ukemi = false;
          f.act = { k: 'free' };
          startDodge(b, f, false);
          f.safeUntil = b.t + C.ukemi.safe;
          b.events.push({ kind: 'ukemi', side: f.side });
        } else f.act = { k: 'down', t: 0, until: C.hurt.down };
      }
    }
  }
  if (f.kvx || f.kvz) {
    f.x += f.kvx * dt;
    f.z += f.kvz * dt;
    const k = Math.exp(-C.hurt.friction * dt);
    f.kvx *= k;
    f.kvz *= k;
    if (Math.hypot(f.kvx, f.kvz) < 0.05) f.kvx = f.kvz = 0;
  }
  switch (a.k) {
    case 'tech':
      updateTech(b, f, a, dt);
      break;
    case 'dodge':
      a.t += dt;
      f.x += a.dx * (C.dodge.distance / C.dodge.time) * dt * (a.t < C.dodge.time ? 1 : 0);
      f.z += a.dz * (C.dodge.distance / C.dodge.time) * dt * (a.t < C.dodge.time ? 1 : 0);
      if (a.t >= C.dodge.time && f.y <= 0) f.act = { k: 'free' };
      break;
    case 'hurt':
      a.t += dt;
      if (a.t >= a.until) f.act = { k: 'free' };
      break;
    case 'air':
      a.t += dt;
      break;
    case 'down':
      a.t += dt;
      if (a.t >= a.until) {
        f.act = { k: 'free' };
        f.safeUntil = b.t + C.hurt.invincibleAfterDown;
      }
      break;
    case 'ko':
    case 'victory':
      a.t += dt;
      return;
    case 'free':
      break;
  }
  if (b.winner !== null) return;
  if (f.command && b.t > f.command.until) {
    b.events.push({ kind: 'command', side: f.side, cmd: f.command.cmd, state: 'expired' });
    f.command = null;
  }
  // 受け身(2026-11-02 企画者「倒れる時 よける押すと受け身とれるように」)。ふっとんでいる間・たおれている間に よける
  if (f.command?.cmd === 'dodge' && (f.act.k === 'air' || f.act.k === 'down') && (f.cooldown.dodge ?? 0) <= b.t) {
    f.command = null;
    f.cooldown.dodge = b.t + C.dodge.cooldown;
    if (f.act.k === 'down') {
      f.act = { k: 'free' };
      startDodge(b, f, false);
      f.safeUntil = b.t + C.ukemi.safe;
      b.events.push({ kind: 'ukemi', side: f.side });
    } else f.ukemi = true;
  }
  // 空中でも通常攻撃は出せる(2026-11-02 企画者「空中でも攻撃出せるように」)
  if (f.act.k === 'free' && f.y > 0 && f.command?.cmd === 'punch') {
    f.command = null;
    startTech(b, f, 'punch', true);
    b.events.push({ kind: 'command', side: f.side, cmd: 'punch', state: 'done' });
  }
  if (f.act.k !== 'free' || f.y > 0) {
    // 動けないあいだは、歩く勢いが少しのこって止まる(ジャンプ中は勢いのまま)
    const k = f.act.k === 'free' ? 1 : Math.exp(-dt * C.move.stop);
    f.vx *= k;
    f.vz *= k;
    const ka = f.act.k === 'tech' ? getTech(f.act.id).kind : null;
    if (ka === 'drop' && f.y > 0) {
      // 落下技: 決まった所へ飛んでいく(勢いを落とさない)
      f.vx /= k;
      f.vz /= k;
    }
    if (ka !== 'rush' && ka !== 'spin' && ka !== 'combo') {
      f.x += f.vx * dt;
      f.z += f.vz * dt;
    }
    f.speed = f.y > 0 ? Math.hypot(f.vx, f.vz) : 0;
    return;
  }
  // 指示(技の名前)を実行。ふらついている間は待つ(待ちすぎると消える)
  if (f.command && !(b.t < f.dizzyUntil && f.command.cmd !== 'dodge')) {
    const c = f.command.cmd;
    f.command = null;
    if (c === 'dodge') {
      startDodge(b, f, false);
      f.cooldown.dodge = b.t + C.dodge.cooldown;
    } else if (c === 'jump') {
      // ジャンプ(2026-11-02 企画者「よけるの近くにジャンプも」)。衝撃波・弾を跳んでよけられる。スティックの向きへ少し進む
      f.vy = C.jump.speed;
      f.y = 0.001;
      f.cooldown.jump = b.t + C.jump.cooldown;
      b.events.push({ kind: 'land', side: f.side, hard: false });
    } else startTech(b, f, c, true);
    b.events.push({ kind: 'command', side: f.side, cmd: c, state: 'done' });
    return;
  }
  // プレイヤーが動かしている: 自分では考えない(よけない・技を出さない)。スティックの向きへ歩く
  if (f.pad) {
    padWalk(b, f, dt);
    return;
  }
  watchDanger(b, f);
  if (f.act.k !== 'free') return;
  f.thinkT -= dt;
  f.planT += dt;
  if (f.thinkT <= 0) {
    f.thinkT = C.thinkEvery;
    think(b, f);
    if (f.act.k !== 'free') return;
  }
  walk(b, f, dt);
}

function separate(b: AnimeBattle): void {
  const [p, q] = b.f;
  const d = dist(p, q);
  if (d < C.body.minGap && Math.abs(p.y - q.y) < 1.2) {
    const nx = d > 1e-4 ? (q.x - p.x) / d : 1;
    const nz = d > 1e-4 ? (q.z - p.z) / d : 0;
    const push = (C.body.minGap - d) / 2;
    p.x -= nx * push;
    p.z -= nz * push;
    q.x += nx * push;
    q.z += nz * push;
  }
  for (const f of b.f) {
    f.x = clamp(f.x, -C.field.halfX, C.field.halfX);
    f.z = clamp(f.z, -C.field.halfZ, C.field.halfZ);
  }
}

function step(b: AnimeBattle): void {
  const dt = C.dt;
  b.t += dt;
  const order = Math.round(b.t / dt) % 2 === 0 ? b.f : [b.f[1], b.f[0]];
  for (const f of order) updateMon(b, f, dt);
  updateProjectiles(b, dt);
  separate(b);
  const [p, q] = b.f;
  if (b.winner === null && b.t >= C.timeLimit) {
    const rp = p.hp / p.maxHp;
    const rq = q.hp / q.maxHp;
    b.winner = rp > rq ? 0 : rq > rp ? 1 : 'draw';
    b.koAt = b.t;
    b.events.push({ kind: 'timeUp' });
  }
  if (b.winner !== null && b.winner !== 'draw' && b.koAt !== null && b.t - b.koAt >= C.victoryDelay) {
    const w = b.f[b.winner];
    if (w.act.k !== 'victory' && w.y <= 0) {
      w.act = { k: 'victory', t: 0 };
      b.events.push({ kind: 'victory', side: w.side });
    }
  }
}

/** dt 秒すすめる(中は 1/60 秒ずつ)。起きたことは b.events に入る(呼ぶ前に空にする) */
export function stepAnime(b: AnimeBattle, dt: number): void {
  const n = Math.max(1, Math.round(dt / C.dt));
  for (let i = 0; i < n; i++) step(b);
}

export const animeFinished = (b: AnimeBattle) => b.winner !== null && b.koAt !== null && b.t - b.koAt >= C.victoryDelay + 2.4;
