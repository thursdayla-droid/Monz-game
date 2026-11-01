/**
 * 3Dバトル「アニメのモンスターバトル風」(企画者 2026-11-01)の計算。Phaser・Three.js に依存しない。
 * - 広い野外のコートで、2体のモンスターが 間合いをとって動き回り、技を撃ち合う
 * - 技: 突進(rush)・弾を撃つ(shot)・ためて撃つビーム(beam)・飛び上がって地面をたたく衝撃波(quake)
 * - プレイヤーは「技の名前」で指示する(企画者 2026-11-01)。指示がないときも、MONZ は自分で動き・よけ・ときどき技を出す【仮】
 * - 弾どうしがぶつかると爆発して消える。ビームは弾を消す
 * 数字は animeConfig.ts。乱数は種から決まる(同じ種・同じ指示なら同じ試合)。
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import type { Instinct } from '../autobattle/config';
import type { Proficiency } from './config';
import { ANIME as C, TECHS, TECH_IDS, type TechId } from './animeConfig';

export type Side = 0 | 1;
export type Command = TechId | 'dodge';

export interface AnimeEntrant {
  name: string;
  species: string;
  stats: StatBlock;
  instinct: Instinct;
  proficiency: Proficiency;
}

export type AnimeAct =
  | { k: 'free' }
  | { k: 'tech'; id: TechId; t: number; dir: number; fired: boolean; hit: boolean; tx: number; tz: number }
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
  x: number;
  z: number;
  y: number;
  vy: number;
  face: number;
  hp: number;
  maxHp: number;
  act: AnimeAct;
  cooldown: Record<Command, number>;
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
  | { kind: 'hit'; side: Side; target: Side; tech: TechId; damage: number; x: number; y: number; z: number; big: boolean }
  | { kind: 'explode'; x: number; y: number; z: number; tech: TechId; big: boolean }
  | { kind: 'clash'; x: number; y: number; z: number }
  | { kind: 'dodge'; side: Side; jump: boolean }
  | { kind: 'evaded'; side: Side }
  | { kind: 'quake'; side: Side; x: number; z: number }
  | { kind: 'land'; side: Side; hard: boolean }
  | { kind: 'command'; side: Side; cmd: Command; state: 'queued' | 'done' | 'expired' }
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
    x: side === 0 ? -6 : 6,
    z: side === 0 ? 2 : -2,
    y: 0,
    vy: 0,
    face: side === 0 ? -0.3 : Math.PI - 0.3,
    hp: maxHp,
    maxHp,
    act: { k: 'free' },
    cooldown: { dash: 0, fire: 0, beam: 0, quake: 0, dodge: 0 },
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
  };
}

export function newAnimeBattle(a: AnimeEntrant, c: AnimeEntrant, seed: number): AnimeBattle {
  const rng = mulberry32(seed);
  const f: [AnimeMon, AnimeMon] = [newMon(a, 0), newMon(c, 1)];
  // はじめは少し様子を見る
  for (const m of f) m.thinkT = 0.8 + rng() * 0.6;
  return { f, t: 0, rng, winner: null, koAt: null, shots: [], beams: [], quakes: [], seq: 0, events: [] };
}

// ---------------- 指示 ----------------

export function commandState(b: AnimeBattle, side: Side, cmd: Command): 'ready' | 'queued' | 'cooldown' {
  const f = b.f[side];
  if (f.command?.cmd === cmd) return 'queued';
  return f.cooldown[cmd] > b.t ? 'cooldown' : 'ready';
}

/** 技の名前(または「よけろ」)で指示する。動けないときは待つ(1.5秒で消える)。1件だけ(新しい指示で置きかえ) */
export function giveCommand(b: AnimeBattle, side: Side, cmd: Command): boolean {
  const f = b.f[side];
  if (b.winner !== null || f.act.k === 'ko') return false;
  if (f.cooldown[cmd] > b.t) return false;
  f.command = { cmd, until: b.t + C.command.wait };
  b.events.push({ kind: 'command', side, cmd, state: 'queued' });
  return true;
}

// ---------------- 行動 ----------------

function startTech(b: AnimeBattle, f: AnimeMon, id: TechId, byCommand: boolean): void {
  const o = other(b, f);
  const tech = TECHS[id];
  // ねらい(習熟度が低いと少しずれる)
  const dir = angleTo(f, o) + wobble(b.rng) * lerp(C.skill.aim, lv(f, 'attack'));
  f.act = { k: 'tech', id, t: 0, dir, fired: false, hit: false, tx: o.x, tz: o.z };
  f.face = dir;
  f.cooldown[id] = b.t + tech.cooldown;
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
  const dir = a + (s * Math.PI) / 2;
  f.act = { k: 'dodge', t: 0, dx: Math.cos(dir), dz: Math.sin(dir), jump };
  if (jump) f.vy = 9;
  f.cooldown.dodge = b.t + C.dodge.cooldown * 0.5;
  b.events.push({ kind: 'dodge', side: f.side, jump });
}

/** 技のため・発射 */
function updateTech(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, dt: number): void {
  const tech = TECHS[a.id];
  const o = other(b, f);
  a.t += dt;
  if (!a.fired && a.t >= tech.windup) {
    a.fired = true;
    b.events.push({ kind: 'fire', side: f.side, tech: a.id });
    if (tech.kind === 'shot') {
      b.seq++;
      b.shots.push({ id: b.seq, owner: f.side, tech: a.id, x: f.x + Math.cos(a.dir) * 0.9, y: 0.8, z: f.z + Math.sin(a.dir) * 0.9, vx: Math.cos(a.dir) * tech.speed, vz: Math.sin(a.dir) * tech.speed, r: tech.size, t: 0, alive: true });
    } else if (tech.kind === 'beam') {
      b.beams.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, dir: a.dir, t: 0, hit: false });
    } else if (tech.kind === 'quake') {
      // 飛び上がって、相手のいた所の近くへ落ちる
      f.vy = 10;
      f.y = 0.001;
    }
  }
  if (a.fired && tech.kind === 'rush') {
    // 突進: まっすぐ走る(とちゅうで曲がらない)
    const run = a.t - tech.windup;
    if (run * tech.speed < tech.range && !a.hit) {
      f.x += Math.cos(a.dir) * tech.speed * dt;
      f.z += Math.sin(a.dir) * tech.speed * dt;
      if (dist(f, o) < C.body.minGap + 0.2 && Math.abs(o.y - f.y) < 1.2) {
        a.hit = true;
        hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, a.dir);
      }
      return;
    }
    if (!a.hit) a.hit = true; // 走り終わり
  }
  if (a.fired && tech.kind === 'quake') {
    // 空中で前へ。着地したら衝撃波
    if (f.y > 0) {
      const d = Math.min(1, dist(f, { x: a.tx, z: a.tz }) / 4);
      f.x += Math.cos(a.dir) * 5 * d * dt;
      f.z += Math.sin(a.dir) * 5 * d * dt;
      return;
    }
    if (!a.hit) {
      a.hit = true;
      b.quakes.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.3, hit: false });
      b.events.push({ kind: 'quake', side: f.side, x: f.x, z: f.z });
    }
  }
  const total = tech.windup + (tech.kind === 'beam' ? tech.duration : 0) + tech.recovery + (tech.kind === 'rush' ? tech.range / tech.speed : 0);
  if (a.t >= total && f.y <= 0) f.act = { k: 'free' };
}

/** 当たり → ダメージ・吹っ飛び */
function hit(b: AnimeBattle, f: AnimeMon, o: AnimeMon, id: TechId, x: number, y: number, z: number, dir: number): boolean {
  if (o.act.k === 'ko' || o.act.k === 'victory') return false;
  if (b.t < o.safeUntil || o.act.k === 'down') return false;
  if (o.act.k === 'dodge' && o.act.t < C.dodge.invincible) {
    b.events.push({ kind: 'evaded', side: o.side });
    return false;
  }
  const tech = TECHS[id];
  const dmg = Math.max(1, Math.round(tech.power * (1 + f.stats.power / C.stat.powerDiv) * (C.stat.toughDiv / (C.stat.toughDiv + o.stats.tough)) * (0.9 + b.rng() * 0.2)));
  o.hp = Math.max(0, o.hp - dmg);
  o.kvx += Math.cos(dir) * tech.knock * C.hurt.friction * 0.35;
  o.kvz += Math.sin(dir) * tech.knock * C.hurt.friction * 0.35;
  o.command = null;
  o.face = angleTo(o, f);
  const big = tech.launch > 0;
  b.events.push({ kind: 'hit', side: f.side, target: o.side, tech: id, damage: dmg, x, y, z, big });
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
  if (big) {
    o.vy = tech.launch;
    o.y = Math.max(o.y, 0.001);
    o.act = { k: 'air', t: 0 };
  } else o.act = { k: 'hurt', t: 0, until: C.hurt.stun };
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
    const tech = TECHS[beam.tech];
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
  b.beams = b.beams.filter((x) => x.t < TECHS[x.tech].duration);
  // 衝撃波(輪が広がる。ジャンプ中ならよけられる)
  for (const q of b.quakes) {
    const tech = TECHS[q.tech];
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
  b.quakes = b.quakes.filter((q) => q.r < TECHS[q.tech].range);
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
  if (o.act.k === 'tech' && TECHS[o.act.id].kind === 'beam' && !o.act.fired && o.act.t > TECHS.beam.windup - 0.4) danger = 'side';
  if (o.act.k === 'tech' && TECHS[o.act.id].kind === 'rush' && o.act.fired && !o.act.hit && dist(f, o) < 3.5) danger = 'side';
  for (const q of b.quakes) if (q.owner !== f.side && !q.hit && dist(q, f) - q.r < 1.4 && dist(q, f) - q.r > 0.3) danger = 'jump';
  if (!danger) return;
  // 1回の危険につき1回だけ判断(よけないと決めたら、少しのあいだ判断しない)
  if (b.rng() < lerp(C.skill.dodge, lv(f, 'evasion')) * (0.6 + f.instinct.survival * 0.6)) startDodge(b, f, danger === 'jump');
  else f.cooldown.dodge = b.t + 0.5;
}

function chooseTech(b: AnimeBattle, f: AnimeMon): TechId | null {
  const o = other(b, f);
  const d = dist(f, o);
  const ready = TECH_IDS.filter((id) => f.cooldown[id] <= b.t);
  if (!ready.length) return null;
  const w = ready.map((id) => {
    const k = TECHS[id].kind;
    if (k === 'rush') return d < 9 ? 1 + f.instinct.attack : 0.2;
    if (k === 'quake') return d < 5.5 ? 1.2 + f.instinct.fight : 0.1;
    if (k === 'beam') return 0.8 + f.instinct.fight;
    return 1;
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
  const p = f.side === 0 ? C.selfUse.partner : C.selfUse.rival;
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
  const sp = (C.stat.walkBase + f.stats.speed * C.stat.walkPerSpeed) * sway * (b.t < f.burstUntil ? C.move.burst : 1);
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
      const hard = a.k === 'air' || a.k === 'ko' || (a.k === 'tech' && TECHS[a.id].kind === 'quake');
      b.events.push({ kind: 'land', side: f.side, hard });
      if (a.k === 'air') f.act = { k: 'down', t: 0, until: C.hurt.down };
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
  if (f.act.k !== 'free' || f.y > 0) {
    // 動けないあいだは、歩く勢いが少しのこって止まる
    const k = Math.exp(-dt * C.move.stop);
    f.vx *= k;
    f.vz *= k;
    if (f.act.k !== 'tech' || TECHS[f.act.id].kind !== 'rush') {
      f.x += f.vx * dt;
      f.z += f.vz * dt;
    }
    f.speed = f.y > 0 ? Math.hypot(f.vx, f.vz) : 0;
    return;
  }
  // 指示(技の名前)を実行
  if (f.command) {
    const c = f.command.cmd;
    f.command = null;
    if (c === 'dodge') {
      startDodge(b, f, false);
      f.cooldown.dodge = b.t + C.dodge.cooldown;
    } else startTech(b, f, c, true);
    b.events.push({ kind: 'command', side: f.side, cmd: c, state: 'done' });
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
