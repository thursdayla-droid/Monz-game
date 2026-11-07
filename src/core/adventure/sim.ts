/**
 * 冒険の 1階ぶんの 動き(2026-11-07 試作)。Phaser・Three に 依存しない(あとで オンラインに しやすいように)。
 * 自分の MONZ を スティックで 動かし、通常攻撃で モブを 倒す。全部 倒すと 出口が ひらき、出口に 入ると クリア。
 * ステータスは そのまま 反映(企画者)。数字は【仮】
 */
import { mulberry32, type Rng } from '../rng';
import type { StatBlock } from '../stats';
import { fits, generateFloor, lineOfSight, cellToWorld, type Floor } from './dungeon';

export const ADV = {
  player: { r: 0.55, hp: 60, hpPer: 4, atk: 6, atkPer: 0.5, speed: 4.2, speedPer: 0.03, range: 2.0, arc: 1.25, windup: 0.08, recover: 0.22, cool: 0.34, knock: 3 },
  /** 受ける ダメージ = 攻撃 × K / (K + タフネス) */
  defK: 40,
  critDiv: 400,
  mob: { r: 0.6, hp: 28, atk: 7, speed: 3.0, aggro: 9, range: 1.5, windup: 0.55, cool: 1.3, knock: 2.5 },
  /** 【仮】ごほうび: モブ1体・クリア */
  reward: { mobExp: 5, mobCoins: 3, clearExp: 30, clearCoins: 20 },
  hurtTime: 0.25,
  /** 技: 打つ 技は 前の まわりを まとめて(はんい・威力の 倍)・回復の 技は 最大HP の 割合 */
  tech: { range: 2.8, arc: 1.8, windup: 0.16, recover: 0.3, powDiv: 7, minMul: 1.6, heal: 0.25 },
  /** 回復の実: 最大HP の 割合 */
  herbHeal: 0.4,
  /** モブが 落とす: 回復の実 25%・装備 12%【仮】。装備の ランクの 出やすさ D50 C30 B14 A5 S1 */
  drop: { herb: 0.25, gear: 0.12, rank: [50, 30, 14, 5, 1] },
  /** 装備の 強さ(ランクごとの 倍)と 1倍の ときの 上がり方 */
  gear: { mul: { D: 1, C: 2, B: 3, A: 5, S: 8 } as Record<Rank, number>, claw: 2, armor: 3, charm: 8 },
  pickR: 1.1,
} as const;

export type ActKind = 'free' | 'attack' | 'tech' | 'hurt' | 'dead';

/** 冒険で 使う 技(MONZ RUMBLE で セットした 4つ。名前は そのまま。2026-11-07 企画者)。効き目は【仮】(次の 段階で 型ごとに) */
export interface AdvTech {
  id: string;
  /** 回復・守りの 技(タフネス型 など)= 自分を 回復。ほかは 前の 敵を まとめて 強く 打つ */
  support: boolean;
  /** 技の 強さ(MONZ RUMBLE の 威力) */
  power: number;
  /** 待ち時間(秒) */
  cooldown: number;
}

/** 装備の 場所(企画者 2026-11-07 案【仮】): ツメ = 攻撃・ヨロイ = 守り・オマモリ = HP */
export type GearSlot = 'claw' | 'armor' | 'charm';
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S';
export const RANKS: Rank[] = ['D', 'C', 'B', 'A', 'S'];
export const SLOT_NAMES: Record<GearSlot, string> = { claw: 'ツメ', armor: 'ヨロイ', charm: 'オマモリ' };

/** 持ち物(1つ)。herb = 回復の実(冒険の 中で 使う)・gear = 装備 */
export type AdvItem = { kind: 'herb' } | { kind: 'gear'; slot: GearSlot; rank: Rank };

/** 持ち物は 20個まで(企画者 2026-11-07) */
export const BAG_MAX = 20;

export interface Drop {
  id: number;
  x: number;
  z: number;
  item: AdvItem;
  /** 持ち物が いっぱいで 拾えなかった(知らせは 1回だけ) */
  warned?: boolean;
}

export interface Actor {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  face: number;
  hp: number;
  maxHp: number;
  atk: number;
  tough: number;
  speed: number;
  act: ActKind;
  actT: number;
  /** 攻撃が 当たったか(1回の 攻撃で 1度だけ) */
  struck: boolean;
  coolUntil: number;
  /** モブが 気づいたか */
  awake: boolean;
}

export type AdvEvent =
  | { kind: 'attack'; id: number }
  | { kind: 'hit'; target: number; x: number; z: number; dmg: number; crit: boolean }
  | { kind: 'die'; id: number; x: number; z: number }
  | { kind: 'open'; x: number; z: number }
  | { kind: 'tech'; slot: number; x: number; z: number; support: boolean }
  | { kind: 'heal'; amount: number; x: number; z: number }
  | { kind: 'drop'; drop: Drop }
  | { kind: 'pick'; drop: Drop }
  | { kind: 'full' }
  | { kind: 'clear' }
  | { kind: 'lose' };

export interface AdvState {
  floor: Floor;
  rng: Rng;
  t: number;
  player: Actor;
  /** 0 = 自分。モブは 1 から */
  mobs: Actor[];
  tech: number;
  exitOpen: boolean;
  result: 'play' | 'clear' | 'lose';
  kills: number;
  events: AdvEvent[];
  techs: (AdvTech | null)[];
  techCd: number[];
  /** 今 使っている 技の 場所 */
  techSlot: number;
  bag: AdvItem[];
  gear: Partial<Record<GearSlot, AdvItem & { kind: 'gear' }>>;
  drops: Drop[];
  seq: number;
  /** 装備の 前の 数字(装備で 足す 元) */
  base: { atk: number; tough: number; maxHp: number };
}

export interface AdvInput {
  /** スティック(画面の 向きで 回した あと。長さ 0〜1) */
  mx: number;
  mz: number;
  attack: boolean;
  /** 押した 技(0〜3)。null = なし */
  tech?: number | null;
}

function actor(id: number, x: number, z: number): Actor {
  return { id, x, z, vx: 0, vz: 0, face: 0, hp: 1, maxHp: 1, atk: 1, tough: 0, speed: 1, act: 'free', actT: 0, struck: false, coolUntil: 0, awake: false };
}

/** 新しい 階。stats: 自分の MONZ の ステータス・level: 階の 強さ(1 = 試作) */
export function newAdventure(seed: number, stats: StatBlock, level = 1, techs: (AdvTech | null)[] = []): AdvState {
  const floor = generateFloor(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const P = ADV.player;
  const p = actor(0, floor.start.x, floor.start.z);
  p.maxHp = p.hp = Math.round(P.hp + stats.hp * P.hpPer);
  p.atk = P.atk + stats.power * P.atkPer;
  p.tough = stats.tough;
  p.speed = P.speed + stats.speed * P.speedPer;
  const mobs: Actor[] = [];
  // はじまりの 部屋 いがいに 2〜3体ずつ
  floor.rooms.slice(1).forEach((r) => {
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const c = cellToWorld(r.x + 1 + Math.floor(rng() * (r.w - 2)), r.y + 1 + Math.floor(rng() * (r.h - 2)));
      const m = actor(mobs.length + 1, c.x, c.z);
      const M = ADV.mob;
      m.maxHp = m.hp = Math.round(M.hp * (1 + (level - 1) * 0.35));
      m.atk = M.atk * (1 + (level - 1) * 0.3);
      m.tough = 4 * level;
      m.speed = M.speed;
      m.face = rng() * Math.PI * 2;
      mobs.push(m);
    }
  });
  const ts = [0, 1, 2, 3].map((i) => techs[i] ?? null);
  return {
    floor, rng, t: 0, player: p, mobs, tech: stats.tech, exitOpen: false, result: 'play', kills: 0, events: [],
    techs: ts, techCd: [0, 0, 0, 0], techSlot: -1, bag: [], gear: {}, drops: [], seq: 0,
    base: { atk: p.atk, tough: p.tough, maxHp: p.maxHp },
  };
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** 壁に ぶつからないように 動かす(x と z を べつべつに) */
function moveBy(s: AdvState, a: Actor, dx: number, dz: number, r: number): void {
  if (fits(s.floor, a.x + dx, a.z, r)) a.x += dx;
  if (fits(s.floor, a.x, a.z + dz, r)) a.z += dz;
}

/** 倒した モブが 物を 落とす【仮】 */
function dropFrom(s: AdvState, m: Actor): void {
  const D = ADV.drop;
  const r = s.rng();
  let item: AdvItem | null = null;
  if (r < D.gear) {
    const slots: GearSlot[] = ['claw', 'armor', 'charm'];
    const slot = slots[Math.floor(s.rng() * 3)];
    let q = s.rng() * D.rank.reduce((a, b) => a + b, 0);
    let rank: Rank = 'D';
    for (let i = 0; i < RANKS.length; i++) if ((q -= D.rank[i]) < 0) {
      rank = RANKS[i];
      break;
    }
    item = { kind: 'gear', slot, rank };
  } else if (r < D.gear + D.herb) item = { kind: 'herb' };
  if (!item) return;
  const d: Drop = { id: ++s.seq, x: m.x, z: m.z, item };
  s.drops.push(d);
  s.events.push({ kind: 'drop', drop: d });
}

/** 装備で 数字を 足し直す(HP の 割合は そのまま) */
function applyGear(s: AdvState): void {
  const p = s.player;
  const G = ADV.gear;
  const m = (slot: GearSlot) => (s.gear[slot] ? G.mul[s.gear[slot]!.rank] : 0);
  const rate = p.hp / p.maxHp;
  p.atk = s.base.atk + G.claw * m('claw');
  p.tough = s.base.tough + G.armor * m('armor');
  p.maxHp = s.base.maxHp + G.charm * m('charm');
  p.hp = Math.max(1, Math.round(p.maxHp * rate));
}

/** 持ち物を 使う(回復の実)/装備する(つけていた 物は 持ち物へ)。できたら true */
export function useBagItem(s: AdvState, index: number): boolean {
  const it = s.bag[index];
  if (!it || s.result !== 'play' || s.player.act === 'dead') return false;
  if (it.kind === 'herb') {
    if (s.player.hp >= s.player.maxHp) return false;
    s.bag.splice(index, 1);
    heal(s, Math.round(s.player.maxHp * ADV.herbHeal));
    return true;
  }
  const old = s.gear[it.slot];
  s.gear[it.slot] = it;
  s.bag.splice(index, 1);
  if (old) s.bag.splice(index, 0, old);
  applyGear(s);
  return true;
}

/** 装備を はずして 持ち物へ(いっぱいなら できない) */
export function unequip(s: AdvState, slot: GearSlot): boolean {
  const g = s.gear[slot];
  if (!g || s.bag.length >= BAG_MAX) return false;
  delete s.gear[slot];
  s.bag.push(g);
  applyGear(s);
  return true;
}

/** アイテムの ボタン: 回復の実を 1つ 使う */
export function useHerb(s: AdvState): boolean {
  const i = s.bag.findIndex((b) => b.kind === 'herb');
  return i >= 0 && useBagItem(s, i);
}

function heal(s: AdvState, amount: number): void {
  const p = s.player;
  const got = Math.min(amount, p.maxHp - p.hp);
  p.hp += got;
  s.events.push({ kind: 'heal', amount: got, x: p.x, z: p.z });
}

/** 持ち物を 拾う(足もとに ある 物。いっぱいなら 拾えない) */
function pickUp(s: AdvState): void {
  const p = s.player;
  for (const d of [...s.drops]) {
    if (Math.hypot(d.x - p.x, d.z - p.z) > ADV.pickR) continue;
    if (s.bag.length >= BAG_MAX) {
      if (!d.warned) {
        d.warned = true;
        s.events.push({ kind: 'full' });
      }
      continue;
    }
    s.bag.push(d.item);
    s.drops.splice(s.drops.indexOf(d), 1);
    s.events.push({ kind: 'pick', drop: d });
  }
}

function damage(s: AdvState, from: Actor, to: Actor, mul = 1): void {
  const crit = from.id === 0 && s.rng() < s.tech / ADV.critDiv;
  const dmg = Math.max(1, Math.round(from.atk * mul * (ADV.defK / (ADV.defK + to.tough)) * (0.9 + s.rng() * 0.2) * (crit ? 1.5 : 1)));
  to.hp = Math.max(0, to.hp - dmg);
  s.events.push({ kind: 'hit', target: to.id, x: to.x, z: to.z, dmg, crit });
  // ふっとび
  const g = Math.atan2(to.z - from.z, to.x - from.x);
  const k = from.id === 0 ? ADV.player.knock : ADV.mob.knock;
  to.vx = Math.cos(g) * k;
  to.vz = Math.sin(g) * k;
  if (to.hp <= 0) {
    to.act = 'dead';
    to.actT = 0;
    if (to.id !== 0) {
      s.kills++;
      s.events.push({ kind: 'die', id: to.id, x: to.x, z: to.z });
      dropFrom(s, to);
    }
  } else if (to.act !== 'attack' || to.id === 0) {
    to.act = 'hurt';
    to.actT = 0;
  }
}

export function stepAdventure(s: AdvState, inp: AdvInput, dt: number): void {
  s.events = [];
  if (s.result !== 'play') return;
  s.t += dt;
  const p = s.player;
  const P = ADV.player;
  // ---- 自分 ----
  p.actT += dt;
  if (p.act === 'hurt' && p.actT > ADV.hurtTime) p.act = 'free';
  if (p.act === 'attack' && p.actT > P.windup + P.recover) p.act = 'free';
  const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
  if (p.act !== 'dead') {
    if (len > 0.1) p.face = Math.atan2(inp.mz, inp.mx);
    const sp = p.speed * len * (p.act === 'attack' || p.act === 'tech' ? 0.35 : p.act === 'hurt' ? 0.4 : 1);
    p.vx += (Math.cos(p.face) * sp * (len > 0.1 ? 1 : 0) - p.vx) * Math.min(1, dt * 12);
    p.vz += (Math.sin(p.face) * sp * (len > 0.1 ? 1 : 0) - p.vz) * Math.min(1, dt * 12);
    moveBy(s, p, p.vx * dt, p.vz * dt, P.r);
    // 攻撃: いちばん 近い モブの ほうを 向く(近ければ)
    if (inp.attack && p.act !== 'attack' && p.act !== 'tech' && s.t >= p.coolUntil) {
      const near = s.mobs.filter((m) => m.act !== 'dead').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near && Math.hypot(near.x - p.x, near.z - p.z) < P.range + 1.2) p.face = Math.atan2(near.z - p.z, near.x - p.x);
      p.act = 'attack';
      p.actT = 0;
      p.struck = false;
      p.coolUntil = s.t + P.cool * (1 - Math.min(0.3, s.tech / 500));
      s.events.push({ kind: 'attack', id: 0 });
    }
    // 技(A〜D)
    const ti = inp.tech;
    const T = ADV.tech;
    if (ti != null && s.techs[ti] && s.t >= s.techCd[ti] && p.act !== 'attack' && p.act !== 'tech') {
      const tc = s.techs[ti]!;
      const near = s.mobs.filter((m) => m.act !== 'dead').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!tc.support && near && Math.hypot(near.x - p.x, near.z - p.z) < T.range + 2) p.face = Math.atan2(near.z - p.z, near.x - p.x);
      p.act = 'tech';
      p.actT = 0;
      p.struck = false;
      s.techSlot = ti;
      s.techCd[ti] = s.t + tc.cooldown * (1 - Math.min(0.3, s.tech / 500));
    }
    if (p.act === 'tech') {
      const tc = s.techs[s.techSlot]!;
      if (!p.struck && p.actT >= T.windup) {
        p.struck = true;
        s.events.push({ kind: 'tech', slot: s.techSlot, x: p.x, z: p.z, support: tc.support });
        if (tc.support) heal(s, Math.round(p.maxHp * T.heal));
        else
          for (const m of s.mobs) {
            if (m.act === 'dead') continue;
            const d = Math.hypot(m.x - p.x, m.z - p.z);
            if (d < T.range + ADV.mob.r && Math.abs(angDiff(Math.atan2(m.z - p.z, m.x - p.x), p.face)) < T.arc) {
              m.awake = true;
              damage(s, p, m, Math.max(T.minMul, tc.power / T.powDiv));
            }
          }
      }
      if (p.actT > T.windup + T.recover) p.act = 'free';
    }
    if (p.act === 'attack' && !p.struck && p.actT >= P.windup) {
      p.struck = true;
      for (const m of s.mobs) {
        if (m.act === 'dead') continue;
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d < P.range + ADV.mob.r && Math.abs(angDiff(Math.atan2(m.z - p.z, m.x - p.x), p.face)) < P.arc) {
          m.awake = true;
          damage(s, p, m);
        }
      }
    }
  }
  // ---- モブ ----
  const M = ADV.mob;
  for (const m of s.mobs) {
    if (m.act === 'dead') continue;
    m.actT += dt;
    // ふっとびの 速さは だんだん 止まる
    moveBy(s, m, m.vx * dt, m.vz * dt, M.r);
    m.vx *= Math.exp(-dt * 8);
    m.vz *= Math.exp(-dt * 8);
    if (m.act === 'hurt') {
      if (m.actT > ADV.hurtTime) m.act = 'free';
      continue;
    }
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    if (!m.awake && d < M.aggro && lineOfSight(s.floor, m.x, m.z, p.x, p.z)) m.awake = true;
    if (!m.awake || p.act === 'dead') continue;
    const g = Math.atan2(p.z - m.z, p.x - m.x);
    if (m.act === 'attack') {
      if (!m.struck && m.actT >= M.windup) {
        m.struck = true;
        if (d < M.range + P.r + 0.3 && Math.abs(angDiff(g, m.face)) < 1.2) damage(s, m, p);
      }
      if (m.actT > M.windup + 0.35) m.act = 'free';
      continue;
    }
    m.face = g;
    if (d < M.range + P.r && s.t >= m.coolUntil) {
      m.act = 'attack';
      m.actT = 0;
      m.struck = false;
      m.coolUntil = s.t + M.cool;
      s.events.push({ kind: 'attack', id: m.id });
    } else if (d > M.range * 0.8) {
      moveBy(s, m, Math.cos(g) * m.speed * dt, Math.sin(g) * m.speed * dt, M.r);
    }
  }
  // モブどうし・自分と 重ならない
  const all = [p, ...s.mobs.filter((m) => m.act !== 'dead')];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const min = (a.id === 0 ? P.r : M.r) + M.r;
      if (d < min) {
        const push = (min - d) / 2;
        moveBy(s, a, (-dx / d) * push, (-dz / d) * push, a.id === 0 ? P.r : M.r);
        moveBy(s, b, (dx / d) * push, (dz / d) * push, M.r);
      }
    }
  if (p.act !== 'dead') pickUp(s);
  // 出口
  if (!s.exitOpen && s.mobs.every((m) => m.act === 'dead')) {
    s.exitOpen = true;
    s.events.push({ kind: 'open', x: s.floor.exit.x, z: s.floor.exit.z });
  }
  if (s.exitOpen && Math.hypot(p.x - s.floor.exit.x, p.z - s.floor.exit.z) < 1.4) {
    s.result = 'clear';
    s.events.push({ kind: 'clear' });
  }
  if (p.hp <= 0) {
    s.result = 'lose';
    s.events.push({ kind: 'lose' });
  }
}

/** この 冒険で もらえる ごほうび(勝っても 負けても 倒した ぶんは もらえる【仮】) */
export function adventureReward(s: AdvState): { exp: number; coins: number } {
  const R = ADV.reward;
  const clear = s.result === 'clear';
  return { exp: s.kills * R.mobExp + (clear ? R.clearExp : 0), coins: s.kills * R.mobCoins + (clear ? R.clearCoins : 0) };
}
