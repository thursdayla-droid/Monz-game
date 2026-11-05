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
import { BEAST, type BeastHit, type BeastStep } from './beastScripts';
import { coverSpot, insideObstacle, lineOfSight, rayHit, resolveBody, steerAround, type ArenaMap } from './arena';
import { EFFECT_CHANCE, getTech, SELF_FIELD_TECHS, type Effect } from './techTable';

export type Side = 0 | 1;
export type Command = TechId | 'dodge' | 'guard';

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
  | { k: 'tech'; id: TechId; t: number; dir: number; fired: boolean; hit: boolean; tx: number; tz: number; windup: number; n: number; next: number; charge?: number; len?: number; zig?: number; sx?: number; sz?: number; sp?: 'charge' | 'dash' | 'air'; mv?: string; tf?: number; full?: boolean; counter?: boolean; step?: number; stepT?: number; hn?: number; hx?: number; hz?: number }
  | { k: 'dodge'; t: number; dx: number; dz: number; jump: boolean }
  /** ガード中(until: CPU が やめる時間。自分で動かす時は ボタンを はなすまで) */
  | { k: 'guard'; t: number; until: number }
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
  /** やけど・どく(続くダメージ)・ねむり。tick: 次にダメージが入る時刻 */
  burnUntil: number;
  burnTick: number;
  poisonUntil: number;
  poisonTick: number;
  sleepUntil: number;
  /** この時刻までは ねむらない */
  sleepSafeUntil: number;
  /** 回復した合計(1試合の上限があるので) */
  healed: number;
  /** 強化: 攻撃が上がる・受けるダメージが減る(割合と、いつまで) */
  atkUpUntil: number;
  atkUp: number;
  defUpUntil: number;
  defUp: number;
  /** 攻撃ダウン(ほえる)・遅くなる(重力の場) の終わり */
  atkDownUntil: number;
  /** 防御ダウンの終わり(受けるダメージが上がる) */
  defDownUntil: number;
  /** はさみトラップに もう かからない時刻 */
  trapSafeUntil: number;
  /** 通常攻撃の 何発目か(押すたびに1発。続けて押すと 次の1発)・続けて押せる時刻(2026-11-04 企画者「連続で押すと攻撃出る」) */
  jabChain: number;
  jabChainUntil: number;
  /** 受けている コンボの数・始まった時刻・さいごに当たった時刻(長いコンボは 弱くなる・ぬけられる) */
  comboN: number;
  comboStart: number;
  comboLast: number;
  /** ガードの量(0〜最大)・もどり始める時刻・ガードボタンを 押している(自分で動かす時) */
  guardGauge: number;
  guardRegenAt: number;
  guardHold?: boolean;
  /** 今の守りの技・受け止めた数(万象ぷにドーム) */
  barrierTech?: TechId;
  absorbN?: number;
  /** 残光ステップ(よけるのが速い)・ぐにゃりスリップ(すべる)・超弾性チャージ(ふっとばす力)の終わり */
  blinkUntil?: number;
  slipUntil?: number;
  knockUpUntil?: number;
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
  /** flank = 柱の横へ回りこむ / cover = 柱のうしろへ にげる(マップがある時。2026-11-03 ロストテンプル) */
  plan: 'approach' | 'retreat' | 'circleL' | 'circleR' | 'hold' | 'flank' | 'cover';
  /** 回りこむ向き(1 = 左 / -1 = 右)・かくれる所 */
  flankS: number;
  coverX: number;
  coverZ: number;
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
  jab: { parts: number[]; range: number; step: number; fire: number; whip?: boolean; dash?: number; water?: number; trap?: number; moves?: string[] };
  /** ZIPP の電撃ダッシュ: こうげきボタンを押している間 true(画面が入れる。AI は使わない) */
  hold?: boolean;
  /** 体を固めて ひるまない 終わり(GRIT の 頑固ガード・踏ん張り)(2026-11-05) */
  armorUntil?: number;
  /** 通常攻撃が 炎になる(獣性ブースト)・歩いたあとに 毒(黒鱗)の 終わり */
  fireJabUntil?: number;
  trailUntil?: number;
  trailNext?: number;
  /** 空中で 追い打ちを 受けた数(着地で 0)・ふわっと ゆっくり落ちる 終わり・たたきつけられた・浮いた相手に 攻撃が 当たった時刻 */
  juggleN: number;
  floatUntil: number;
  spiked?: boolean;
  airHitT?: number;
  /** カウンターが できる 終わりの時刻(よけた・ジャストガードした あと) */
  counterUntil: number;
  /** 通常攻撃ボタンを 押しつづけている時間(ためる強い1発) */
  holdT?: number;
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
  /** ZIPP の弾: 左右にジグザグにゆれる(1 = する) */
  zig?: number;
  /** 消えるまでの秒・威力の倍率(PUNI の水の玉) */
  life?: number;
  part?: number;
  /** とくべつな弾(2026-11-03): 上下の速さ(放物線)・はねる回数・相手を追う強さ・止まる距離と爆発の時刻・動き出すまでの秒 */
  vy?: number;
  bounce?: number;
  home?: number;
  stop?: number;
  fuse?: number;
  wait?: number;
  /** 見た目(残像)・いちばん上で 何個に分かれるか */
  look?: 'ghost' | 'wolf' | 'bubble' | 'ring' | 'slash';
  split?: number;
  /** 大きくなる 速さ(雷紋)・当てた相手を つかまえる 秒(泡のつぶて)(2026-11-05) */
  grow?: number;
  bind?: number;
}

/** ぷに触手ドレイン: 相手に つないだ触手(つながっている間 少しずつ吸う) */
export interface Tether {
  owner: Side;
  tech: TechId;
  until: number;
  next: number;
}

/** KLAK の はさみトラップ(ふんだ相手は動けない) */
export interface Trap {
  id: number;
  owner: Side;
  x: number;
  z: number;
  r: number;
  armAt: number;
  until: number;
  form: number;
  /** はさんだ時刻(はさんだら 少しして消える) */
  snapAt?: number;
  /** はさんだ相手 */
  caught?: Side;
  /** 連鎖トラップ: 同じ番号の罠は いっしょに作動 */
  chain?: number;
  /** 技の罠: 技の名前・威力・動けない時間 */
  tech?: TechId;
  power?: number;
  bind?: number;
}

export interface Beam {
  owner: Side;
  tech: TechId;
  x: number;
  z: number;
  dir: number;
  t: number;
  hit: boolean;
  /** 柱で止まった長さ(なければ技の長さ) */
  len?: number;
  /** 照準ライン: 撃っている間も 相手を追う速さ */
  track?: number;
}

export interface Quake {
  owner: Side;
  tech: TechId;
  x: number;
  z: number;
  r: number;
  hit: boolean;
  /** 広がり始める時刻・威力(とくべつな動き) */
  start?: number;
  power?: number;
}

export type AnimeEvent =
  | { kind: 'call'; side: Side; tech: TechId; byCommand: boolean }
  | { kind: 'fire'; side: Side; tech: TechId }
  /** ガードで受けた(just: ジャストガード)・ガードを始めた・ガードがこわれた */
  | { kind: 'guardHit'; side: Side; x: number; y: number; z: number; damage: number; just: boolean }
  | { kind: 'guard'; side: Side }
  /** コンボの数(受けた側ではなく 当てた側 side。2発目から) */
  | { kind: 'combo'; side: Side; n: number }
  /** 長いコンボから ぬけた(受けた側 side) */
  | { kind: 'comboBreak'; side: Side }
  /** ためた強い1発・ダッシュ攻撃を 出した(mv: 動き)・ためが いっぱい・通常攻撃から 技へ つないだ */
  | { kind: 'power'; side: Side; sp: 'charge' | 'dash' | 'air'; mv: string; c: number }
  /** しめの1発・地面へ たたきつけた(side: 当てた側) */
  | { kind: 'finish'; side: Side; x: number; y: number; z: number }
  | { kind: 'spike'; side: Side; x: number; y: number; z: number }
  | { kind: 'chargeFull'; side: Side }
  /** 新しい5体の 技の 1歩の光(fx: 光の名前・hit: 当たったか) */
  | { kind: 'beastFx'; side: Side; fx: string; mv: string; x: number; z: number; dir: number; hit: boolean; tech: TechId }
  /** カウンターが できる(よけた・ジャストガード)・カウンターを 出した */
  | { kind: 'counterReady'; side: Side; why: 'dodge' | 'just' }
  | { kind: 'counter'; side: Side; tech: TechId }
  | { kind: 'cancel'; side: Side; tech: TechId }
  | { kind: 'guardBreak'; side: Side }
  /** ZIPP の電撃ダッシュが出た(c = ためた割合 0〜1) */
  | { kind: 'zdash'; side: Side; x: number; z: number; dir: number; len: number; c: number }
  /** KLAK が はさみトラップを置いた・トラップが相手をはさんだ */
  | { kind: 'trapSet'; side: Side; id: number; x: number; z: number }
  | { kind: 'trapSnap'; side: Side; target: Side; id: number; x: number; z: number }
  /** ZIPP が 連続攻撃で 一瞬で回りこんだ(元の場所 → 新しい場所) */
  | { kind: 'blink'; side: Side; x0: number; z0: number; x: number; z: number }
  | { kind: 'hit'; side: Side; target: Side; tech: TechId; damage: number; x: number; y: number; z: number; big: boolean; crit?: boolean; counter?: boolean }
  | { kind: 'explode'; x: number; y: number; z: number; tech: TechId; big: boolean }
  /** 攻撃が柱・壁に当たった(石のかけら) */
  | { kind: 'wallHit'; x: number; y: number; z: number }
  | { kind: 'clash'; x: number; y: number; z: number }
  | { kind: 'dodge'; side: Side; jump: boolean }
  | { kind: 'evaded'; side: Side }
  | { kind: 'quake'; side: Side; x: number; z: number; tech: TechId }
  | { kind: 'land'; side: Side; hard: boolean }
  | { kind: 'command'; side: Side; cmd: Command; state: 'queued' | 'done' | 'expired' }
  | { kind: 'status'; side: Side; effect: Effect | 'つかまった' | 'くっついた' | 'すべる' }
  | { kind: 'roar'; side: Side; x: number; z: number }
  | { kind: 'ukemi'; side: Side }
  | { kind: 'domeBurst'; side: Side; x: number; z: number }
  | { kind: 'field'; side: Side; x: number; z: number; r: number; until: number }
  | { kind: 'pillar'; side: Side; x: number; z: number; look?: Pillar['look'] }
  /** 回復した(吸収・自分の場も) */
  | { kind: 'heal'; side: Side; amount: number; why: '回復' | '吸収' | '場' }
  | { kind: 'buff'; side: Side; what: 'atk' | 'def' | 'speed' }
  /** 少しのダメージ(よろけない): やけど・どく・重力プレスの場 */
  | { kind: 'chip'; side: Side; target: Side; damage: number; why: 'やけど' | 'どく' | '場'; x: number; z: number }
  | { kind: 'blocked'; side: Side; x: number; y: number; z: number }
  | { kind: 'mark'; side: Side; x: number; z: number; r: number; until: number }
  | { kind: 'impact'; side: Side; tech: TechId; x: number; z: number; r: number }
  | { kind: 'comboHit'; side: Side; n: number }
  | { kind: 'ko'; side: Side }
  | { kind: 'victory'; side: Side }
  | { kind: 'timeUp' };

/** 地面の場(円・十字・線) */
export interface Field {
  owner: Side;
  tech: TechId;
  x: number;
  z: number;
  r: number;
  until: number;
  tick?: number;
  self?: boolean;
  /** 形(ふつうは円)。十字は rot の向き、線は x,z → x2,z2 */
  shape?: 'cross' | 'line';
  rot?: number;
  x2?: number;
  z2?: number;
  /** 1秒ごとのダメージ・追加効果(技の表とちがう時) */
  power?: number;
  effect?: Effect;
  /** ぷにトラップ: はじめて ふんだ時に くっついて 少し動けない */
  stick?: boolean;
  stuck?: boolean;
  /** 電気の種: ふむと はじける・潮の渦: まん中へ 引きよせる・潮の壁: 弾を 止めて 相手を 押し返す(2026-11-05) */
  mine?: boolean;
  pull?: boolean;
  wall?: boolean;
  /** マグマの 見た目(炎環走り・爆走牙のあと)(2026-11-05) */
  magma?: boolean;
}

export interface Pillar {
  owner: Side;
  tech: TechId;
  g: number;
  x: number;
  z: number;
  r: number;
  /** 柱が出る時刻 */
  at: number;
  up: boolean;
  hitDone?: boolean;
  /** 見た目(火柱・落雷・光の杭・光の砲撃)・威力・この時刻まで相手を追う */
  look?: 'fire' | 'bolt' | 'stake' | 'beam' | 'rock' | 'water';
  power?: number;
  follow?: number;
}

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
  fields: Field[];
  /** 火柱(at に地面から出る。同じ g の柱は、どれか1本が当たったら ほかは当たらない) */
  pillars: Pillar[];
  traps: Trap[];
  tethers: Tether[];
  /** マップ(柱・壁)。null = 前の四角いコート(テストなど) */
  arena: ArenaMap | null;
  seq: number;
  events: AnimeEvent[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: readonly number[], p: number) => a[0] + (a[1] - a[0]) * p;
/** 遠くから撃つ技(柱で さえぎられる) */
const RANGED = new Set(['shot', 'barrage', 'beam', 'drain', 'debuff', 'quake']);
const lv = (f: AnimeMon, k: keyof Proficiency) => clamp((f.prof[k] - 1) / 4, 0, 1);
const other = (b: AnimeBattle, f: AnimeMon) => b.f[f.side === 0 ? 1 : 0];
const dist = (a: { x: number; z: number }, c: { x: number; z: number }) => Math.hypot(c.x - a.x, c.z - a.z);

/** 戦える場所の中におさめる(マップ = 丸い場所・なし = 四角いコート) */
function clampField(b: AnimeBattle, x: number, z: number): [number, number] {
  if (b.arena) {
    const R = b.arena.radius - 0.8;
    const d = Math.hypot(x, z);
    return d > R ? [(x * R) / d, (z * R) / d] : [x, z];
  }
  return [clamp(x, -C.field.halfX, C.field.halfX), clamp(z, -C.field.halfZ, C.field.halfZ)];
}
/** どれくらい はしか(0 = まん中・1 = はし) */
function edgeness(b: AnimeBattle, x: number, z: number): number {
  return b.arena ? Math.hypot(x, z) / b.arena.radius : Math.max(Math.abs(x) / C.field.halfX, Math.abs(z) / C.field.halfZ);
}
/** 見通せるか(マップがなければ いつも見通せる) */
const los = (b: AnimeBattle, p: { x: number; z: number }, q: { x: number; z: number }, y = 0.8, pad = 0) => !b.arena || lineOfSight(b.arena, p, q, y, pad);
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
    jab: jabFor(e),
    ukemi: false,
    dizzyUntil: 0,
    paraUntil: 0,
    burnUntil: 0,
    burnTick: 0,
    poisonUntil: 0,
    poisonTick: 0,
    sleepUntil: 0,
    sleepSafeUntil: 0,
    healed: 0,
    atkUpUntil: 0,
    atkUp: 0,
    defUpUntil: 0,
    defUp: 0,
    atkDownUntil: 0,
    defDownUntil: 0,
    trapSafeUntil: 0,
    jabChain: 0,
    counterUntil: 0,
    juggleN: 0,
    floatUntil: 0,
    jabChainUntil: 0,
    comboN: 0,
    comboStart: 0,
    comboLast: -99,
    guardGauge: C.guard.max,
    guardRegenAt: 0,
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
    cooldown: Object.fromEntries([...(e.techs ?? TECH_IDS), 'dodge', 'jump', 'punch', 'guard'].map((k) => [k, 0])),
    command: null,
    plan: 'hold',
    planT: 0,
    flankS: 1,
    coverX: 0,
    coverZ: 0,
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

export function newAnimeBattle(a: AnimeEntrant, c: AnimeEntrant, seed: number, partnerMode: 'auto' | 'manual' = 'auto', arena: ArenaMap | null = null): AnimeBattle {
  const rng = mulberry32(seed);
  const f: [AnimeMon, AnimeMon] = [newMon(a, 0), newMon(c, 1)];
  if (arena) f.forEach((m, i) => Object.assign(m, arena.start[i]));
  f[0].techMode = partnerMode;
  // はじめは少し様子を見る
  for (const m of f) m.thinkT = 0.8 + rng() * 0.6;
  return { f, t: 0, rng, winner: null, koAt: null, shots: [], beams: [], quakes: [], roars: [], fields: [], pillars: [], traps: [], tethers: [], arena, seq: 0, events: [] };
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
  if ((f.cooldown[cmd] ?? Infinity) > b.t && !(cmd === 'punch' && canChase(b, f))) return false;
  // 自分で動かしている時: やられている・ふっとんでいる・たおれている間は、ボタンを予約しない(よける = 受け身 だけは受けつける)
  // 2026-11-02 企画者「倒れている時の予約ボタンいらない」
  if (f.pad && (f.act.k === 'hurt' || f.act.k === 'air' || f.act.k === 'down') && cmd !== 'dodge') return false;
  // 通常攻撃(押すたびに1発)の 先押しは 短く(押しっぱなしで 勝手に つながらないように)
  const chainJab = cmd === 'punch' && !f.jab.dash && !f.jab.water && !f.jab.trap;
  f.command = { cmd, until: b.t + (chainJab ? C.chain.buffer : C.command.wait) };
  b.events.push({ kind: 'command', side, cmd, state: 'queued' });
  return true;
}

// ---------------- 行動 ----------------

/** ふっとんで 空中にいる相手の 近く: とび上がって 追い打ち(2026-11-05 コンボ5段め) */
function startAirChase(b: AnimeBattle, f: AnimeMon, id: TechId, byCommand: boolean): void {
  const o = other(b, f);
  if (f.act.k !== 'tech') return;
  const J = C.juggle;
  f.act.sp = 'air';
  f.act.mv = f.jab.moves?.[0] === 'bite' || f.species === 'riot' ? 'bite' : C.powerMoves[f.species]?.[1] ?? 'punch';
  f.act.windup = J.windup;
  f.jabChain = 0;
  // 相手の いる高さまで とぶ(相手の 少し先へ)
  const ty = Math.max(1, o.y + o.vy * 0.25);
  f.vy = Math.sqrt(2 * C.gravity * (ty + 0.2));
  f.y = 0.001;
  const tUp = f.vy / C.gravity;
  const gap = Math.max(0, dist(f, o) - C.body.minGap - 0.2);
  const ang = angleTo(f, o);
  f.vx = (Math.cos(ang) * gap) / tUp;
  f.vz = (Math.sin(ang) * gap) / tUp;
  f.face = ang;
  f.cooldown[id] = b.t;
  b.events.push({ kind: 'call', side: f.side, tech: id, byCommand });
}

function startTech(b: AnimeBattle, f: AnimeMon, id: TechId, byCommand: boolean, cancel = false): void {
  const o = other(b, f);
  const tech = getTech(id);
  // ねらい(習熟度が低いと少しずれる)
  const dir = angleTo(f, o) + wobble(b.rng) * lerp(C.skill.aim, lv(f, 'attack')) * (1 - Math.min(0.6, f.stats.tech / C.stat.techAim));
  // まひ中は ためが長い
  // スピードが高いと、ためが短い。まひ中は長い
  const windup = tech.windup * (1 - Math.min(C.stat.speedWindupMax, f.stats.speed / C.stat.speedWindupDiv)) * (b.t < f.paraUntil ? C.status.paraWindup : 1);
  // ねらう技は ためが長い(ピンポイント弾・狙撃ライン)。超膨張インパクトは ふくらむぶん長い
  const st = styleOf(id);
  // ジップタックルは 消えかける ためが長い(よける時間)
  const wmul = st === 'pinpoint' ? 1.6 : st === 'snipe' ? 1.5 : st === 'inflate' ? 1.4 : st === 'vanishTackle' ? 1.8 : 1;
  f.act = { k: 'tech', id, t: 0, dir, fired: false, hit: false, tx: o.x, tz: o.z, windup: windup * wmul * (cancel ? C.cancel.windup : 1), n: 0, next: 0, sx: f.x, sz: f.z, zig: st === 'sidestep' || st === 'flankClamp' || st === 'spiral' ? (b.rng() < 0.5 ? 1 : -1) : 1 };
  f.face = dir;
  // テクニックが高いと、技の待ち時間が少し短い(最大2割。2026-11-02 バランス)
  f.cooldown[id] = tech.kind === 'jab' && f.jab.dash
    ? b.t + C.zdash.cool // 電撃ダッシュ: 走り終わったら また決める(とちゅうで やられても 使えなくならないように)
    : tech.kind === 'jab' && f.jab.trap
    ? b.t + C.klakTrap.cool[f.jab.trap - 1] // はさみトラップ: 待ち時間 長め(企画者)
    : tech.kind === 'jab'
    ? b.t + (f.jab.water ? tech.windup + tech.duration + tech.recovery + tech.cooldown : 0) // PUNI の水の玉は 今までどおり待つ。ほかは 押すたびに1発(さいごの1発のあとだけ 待つ。下)
    : b.t + tech.cooldown * (1 - Math.min(C.stat.techCdMax, f.stats.tech / C.stat.techCdDiv));
  // ZIPP の 電撃ダッシュ: 続けて 押すと コンボ(回数は 形ごと)
  if (tech.kind === 'jab' && f.jab.dash && f.act.k === 'tech') {
    // 浮いている相手の 近く: 電撃ダッシュの かわりに とび上がって 追い打ち
    if (f.y <= 0 && canChase(b, f)) return startAirChase(b, f, id, byCommand);
    if (b.t >= f.jabChainUntil) f.jabChain = 0;
    f.jabChain++;
    f.act.n = f.jabChain - 1;
  }
  // 通常攻撃(BUNK・MOFU など): 1回押すと1発。すぐ また押すと 次の1発(さいごまで 行ったら 少し待つ)
  if (tech.kind === 'jab' && !f.jab.dash && !f.jab.water && !f.jab.trap && f.act.k === 'tech') {
    const ci = b.t < f.jabChainUntil && f.jabChain < f.jab.parts.length ? f.jabChain : 0;
    f.act.n = ci;
    const pm = C.powerMoves[f.species];
    if (pm && f.y <= 0 && canChase(b, f)) return startAirChase(b, f, id, byCommand);
    // 走りながら 押した(続きの1発ではない時): ダッシュ攻撃
    if (pm && ci === 0 && f.pad && f.y <= 0 && Math.hypot(f.pad.x, f.pad.z) > 0.6 && Math.hypot(f.vx, f.vz) > walkSpeed(f) * C.pad.speed * C.dashAtk.minSpeed) {
      f.act.sp = 'dash';
      f.act.mv = pm[1];
      f.act.windup = C.dashAtk.windup;
      f.jabChain = 0;
      f.cooldown[id] = b.t + C.dashAtk.windup + C.dashAtk.strike + C.dashAtk.follow + tech.recovery + tech.cooldown;
      b.events.push({ kind: 'call', side: f.side, tech: id, byCommand });
      return;
    }
    // 新しい5体: 動きごとの ため。当たるのは とびこんだ あと(打つ時間の 45%)
    const mv = f.jab.moves && C.monMove[f.jab.moves[ci]];
    if (mv) {
      f.act.windup = windup * (mv.w / tech.windup);
      f.act.next = f.act.windup + mv.d * 0.45;
    }
    f.jabChain = ci + 1;
    const last = f.jabChain >= f.jab.parts.length;
    if (last) f.jabChain = 0;
    // MOFU の ツルのムチは 待ち時間なし(2026-11-05 企画者「モフの攻撃はクールタイムいらない」)
    f.cooldown[id] = last && !f.jab.whip ? b.t + windup + tech.duration + tech.recovery + tech.cooldown : b.t;
  }
  // 浮いている相手に 体で行く技(突進・回転・連続攻撃): 相手の高さへ とび上がる
  if ((tech.kind === 'rush' || tech.kind === 'spin' || tech.kind === 'combo') && !BEAST[id] && floating(o) && f.y <= 0) {
    f.vy = Math.sqrt(2 * C.gravity * Math.max(0.6, Math.min(3.5, o.y)));
    f.y = 0.001;
  }
  // カウンター: よけた・ジャストガードした すぐあと(2026-11-05 コンボ4段め)
  if (b.t < f.counterUntil && f.act.k === 'tech') {
    f.act.counter = true;
    f.act.windup *= C.counter.windup;
    if (f.act.next > 0) f.act.next = f.act.windup + (f.act.next - f.act.windup / C.counter.windup);
    f.counterUntil = 0;
    b.events.push({ kind: 'counter', side: f.side, tech: id });
  }
  b.events.push({ kind: 'call', side: f.side, tech: id, byCommand });
}

/** 攻撃を かわした(よけた・ジャンプで こえた): すぐ攻撃すると カウンター */
function evaded(b: AnimeBattle, o: AnimeMon): void {
  b.events.push({ kind: 'evaded', side: o.side });
  // ふっとばされて 浮いている時に 下を 通っただけ は よけたことに しない
  if (o.act.k === 'ko' || o.act.k === 'air' || o.act.k === 'hurt') return;
  if (b.t >= o.counterUntil) b.events.push({ kind: 'counterReady', side: o.side, why: 'dodge' });
  o.counterUntil = b.t + C.counter.dodge;
}

function startDodge(b: AnimeBattle, f: AnimeMon, jump: boolean): void {
  const o = other(b, f);
  const a = angleTo(f, o);
  let s = b.rng() < 0.5 ? 1 : -1;
  const out = (k: number) => {
    const x = f.x + Math.cos(a + (k * Math.PI) / 2) * C.dodge.distance;
    const z = f.z + Math.sin(a + (k * Math.PI) / 2) * C.dodge.distance;
    return edgeness(b, x, z);
  };
  if (out(s) > 0.9 && out(-s) < out(s)) s = -s;
  let dir = a + (s * Math.PI) / 2;
  // プレイヤーが動かしているときは、スティックの向きへよける(倒していなければ横へ)
  if (f.pad && Math.hypot(f.pad.x, f.pad.z) > 0.2) dir = Math.atan2(f.pad.z, f.pad.x);
  f.act = { k: 'dodge', t: 0, dx: Math.cos(dir), dz: Math.sin(dir), jump };
  if (jump) f.vy = 9;
  f.cooldown.dodge = b.t + C.dodge.cooldown * 0.5 * (b.t < (f.blinkUntil ?? 0) ? 0.4 : 1);
  b.events.push({ kind: 'dodge', side: f.side, jump });
}

/**
 * ためた強い1発・ダッシュ攻撃(2026-11-05 コンボ3段め)。ため(ボタンを はなすまで)→ 相手へ とびこんで 1発 → すき
 */
function updatePower(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, dt: number): void {
  const P = C.power;
  const D = C.dashAtk;
  const o = other(b, f);
  const tech = getTech(a.id);
  const charge = a.sp === 'charge';
  if (a.sp === 'air') return updateAirChase(b, f, a);
  if (!a.fired) {
    if (charge) {
      a.charge = Math.min(P.max, (a.charge ?? 0) + dt);
      f.face += angDiff(angleTo(f, o), f.face) * (1 - Math.exp(-dt * 10));
      if (a.charge >= P.max && !a.full) {
        a.full = true;
        b.events.push({ kind: 'chargeFull', side: f.side });
      }
      if (f.hold && f.pad && a.t < P.auto) return;
    } else if (a.t < a.windup) return;
    a.fired = true;
    a.tf = a.t;
    const c = charge ? (a.charge ?? 0) / P.max : 1;
    b.events.push({ kind: 'power', side: f.side, sp: a.sp!, mv: a.mv ?? 'punch', c });
    f.cooldown[a.id] = b.t + (charge ? P.strike + P.follow : D.strike + D.follow) + tech.recovery + tech.cooldown;
    return;
  }
  const c = charge ? clamp((a.charge ?? 0) / P.max, 0, 1) : 1;
  const strike = charge ? P.strike : D.strike;
  const run = a.t - (a.tf ?? 0);
  if (!a.hit) {
    const step = charge ? lerp([P.stepMin, P.stepMax], c) : D.step;
    if (f.y <= 0 && dist(f, o) > C.body.minGap + 0.1) {
      const v = (step / strike) * dt;
      f.x += Math.cos(f.face) * v;
      f.z += Math.sin(f.face) * v;
    }
    const reach = f.jab.range + C.body.radius + 0.2;
    const ok = dist(f, o) < reach && los(b, f, o, f.y + 0.8) && Math.abs(angDiff(angleTo(f, o), f.face)) < 0.9 && Math.abs(o.y - f.y) < 1.3;
    if (ok || run >= strike) {
      a.hit = true;
      a.next = a.t;
      if (ok)
        hit(b, f, o, a.id, (f.x + o.x) / 2, f.y + 0.8, (f.z + o.z) / 2, f.face, {
          last: true,
          part: charge ? lerp([P.partMin, P.partMax], c) : D.part,
          launch: charge ? lerp([P.launchMin, P.launchMax], c) : 0,
          knock: charge ? P.knock : D.knock,
        });
    }
    return;
  }
  if (a.t >= a.next + (charge ? P.follow : D.follow) + tech.recovery) f.act = { k: 'free' };
}

/** 新しい5体の 技: 1歩ずつ 動いて 当てる(beastScripts.ts) */
function updateBeast(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, dt: number, steps: BeastStep[]): void {
  const o = other(b, f);
  const tech = getTech(a.id);
  if (!a.fired) {
    f.face += angDiff(angleTo(f, o), f.face) * (1 - Math.exp(-dt * 12));
    if (a.t < a.windup) return;
    a.fired = true;
    a.step = 0;
    a.stepT = 0;
    a.hn = 0;
    a.hx = f.x;
    a.hz = f.z;
    b.events.push({ kind: 'fire', side: f.side, tech: a.id });
    beginBeastStep(b, f, a, steps[0]);
    return;
  }
  const i = a.step ?? 0;
  if (i >= steps.length) {
    if (f.y <= 0 && a.t >= a.next + tech.recovery) f.act = { k: 'free' };
    return;
  }
  const s = steps[i];
  a.stepT = (a.stepT ?? 0) + dt;
  // 動く
  if (s.pounce && f.y > 0) {
    f.x += (a.sx ?? 0) * dt;
    f.z += (a.sz ?? 0) * dt;
  } else if (s.go) {
    const close = s.go > 0 && dist(f, o) < C.body.minGap + 0.1;
    if (!close) {
      const v = (s.go / s.t) * dt;
      f.x += Math.cos(f.face) * v;
      f.z += Math.sin(f.face) * v;
    }
  }
  if (s.home && a.hx !== undefined && a.hz !== undefined) {
    // はじめた 場所へ もどる(のこりの 時間で)
    const left = Math.max(dt, s.t - (a.stepT ?? 0) + dt);
    const k = Math.min(1, dt / left);
    f.x += (a.hx - f.x) * k;
    f.z += (a.hz - (f.z)) * k;
  }
  if (s.side) {
    const v = (s.side / s.t) * dt;
    f.x += Math.cos(f.face + Math.PI / 2) * v;
    f.z += Math.sin(f.face + Math.PI / 2) * v;
  }
  if (s.orbit) {
    // 相手の まわりを 回りながら 近づく
    const d0 = dist(f, o);
    const r = s.orbitR ? d0 + (s.orbitR - d0) * Math.min(1, dt * 6) : Math.max(C.body.minGap + 0.3, d0 - (1.2 / s.t) * dt);
    const ang = angleTo(o, f) + (s.orbit / s.t) * dt;
    f.x = o.x + Math.cos(ang) * r;
    f.z = o.z + Math.sin(ang) * r;
    f.face = angleTo(f, o);
  }
  if (s.ghost) f.safeUntil = Math.max(f.safeUntil, b.t + 0.05);
  // 爆走牙: 走ったあとに 炎(ふむと やける)
  if (s.fx === 'fireTrail' && f.y <= 0 && b.t >= (f.trailNext ?? 0)) {
    f.trailNext = b.t + 0.1;
    b.fields.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.85, until: b.t + 3, tick: b.t + 0.2, power: 2.5, effect: 'やけど', magma: true });
  }
  // 当てる
  const h = s.hit;
  if (h) {
    const last = i === steps.length - 1;
    if (h.contact) {
      if ((a.hn ?? 0) === 0 && beastTryHit(b, f, a, s, h, last, false)) a.hn = 1;
    } else {
      const n = h.n ?? 1;
      while ((a.hn ?? 0) < n && a.stepT >= (h.at ?? 0.5) * s.t + (a.hn ?? 0) * (h.every ?? 0)) {
        beastTryHit(b, f, a, s, h, last && (a.hn ?? 0) === n - 1, true);
        a.hn = (a.hn ?? 0) + 1;
      }
    }
  }
  // 次の 1歩へ(とんでいる時は 着地まで)
  if (a.stepT >= s.t && !(s.pounce && f.y > 0.05)) {
    // さわったら 当たる 歩きで 当たらなかった: 光だけ
    if (h?.contact && !a.hn) b.events.push({ kind: 'beastFx', side: f.side, fx: s.fx ?? s.mv, mv: s.mv, x: f.x + Math.cos(f.face) * 1.2, z: f.z + Math.sin(f.face) * 1.2, dir: f.face, hit: false, tech: a.id });
    a.step = i + 1;
    a.stepT = 0;
    a.hn = 0;
    if (a.step < steps.length) beginBeastStep(b, f, a, steps[a.step]);
    else {
      a.hit = true;
      a.next = a.t;
    }
  }
}

function beginBeastStep(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, s: BeastStep): void {
  const o = other(b, f);
  if (s.behind) {
    // 影に もぐって 相手の うしろへ(影すべり)
    const g = angleTo(f, o);
    [f.x, f.z] = clampField(b, o.x + Math.cos(g) * (C.body.minGap + 0.4), o.z + Math.sin(g) * (C.body.minGap + 0.4));
    f.safeUntil = Math.max(f.safeUntil, b.t + s.t);
  }
  if (!s.orbit && !s.side) f.face = angleTo(f, o);
  a.sx = a.sz = 0;
  if (s.jump) {
    f.vy = s.jump;
    f.y = Math.max(f.y, 0.001);
    if (s.pounce) {
      // 相手の いる所へ 着地する 速さ
      const air = (2 * s.jump) / C.gravity;
      const gap = Math.max(0, dist(f, o) - C.body.minGap - 0.1);
      const ang = angleTo(f, o);
      a.sx = (Math.cos(ang) * gap) / air;
      a.sz = (Math.sin(ang) * gap) / air;
    }
  }
  if (s.dive && f.y > 0) f.vy = Math.min(f.vy, -s.dive);
  if (s.fx && !s.hit) b.events.push({ kind: 'beastFx', side: f.side, fx: s.fx, mv: s.mv, x: f.x, z: f.z, dir: f.face, hit: false, tech: a.id });
}

function beastTryHit(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, s: BeastStep, h: BeastHit, final: boolean, showMiss: boolean): boolean {
  const o = other(b, f);
  const cx = h.cx ?? 0;
  const px = f.x + Math.cos(f.face) * cx;
  const pz = f.z + Math.sin(f.face) * cx;
  const d = Math.hypot(o.x - px, o.z - pz);
  const arc = h.arc ?? 1;
  const inArc = arc >= 3 || cx > 0 || Math.abs(angDiff(angleTo(f, o), f.face)) < arc;
  const yok = h.ground ? o.y < 0.5 && !floating(o) : yOk(b, f, o, 1.4);
  const ok = o.act.k !== 'ko' && d < h.r + C.body.radius * 0.5 && inArc && yok && los(b, f, o, f.y + 0.8);
  if (ok || showMiss) {
    const fx = cx > 0 ? { x: px, z: pz } : ok ? { x: (f.x + o.x) / 2, z: (f.z + o.z) / 2 } : { x: f.x + Math.cos(f.face) * Math.min(h.r, 1.4), z: f.z + Math.sin(f.face) * Math.min(h.r, 1.4) };
    b.events.push({ kind: 'beastFx', side: f.side, fx: s.fx ?? s.mv, mv: s.mv, x: fx.x, z: fx.z, dir: f.face, hit: ok, tech: a.id });
  }
  // 轟炎牙王: 着地の まわりに 炎の柱・雷撃ダイブ: まわりに 落雷
  if ((s.fx === 'nova' || s.fx === 'thunderDive') && final) {
    const pw = C.style.strike[getTech(a.id).strength] ?? 16;
    for (let k = 0; k < 6; k++) {
      const g = (k * Math.PI) / 3;
      addStrike(b, f, a.id, f.x + Math.cos(g) * 3, f.z + Math.sin(g) * 3, 1, b.t + 0.2 + k * 0.05, s.fx === 'nova' ? 'fire' : 'bolt', pw * 0.2);
    }
  }
  if (!ok) return false;
  if (h.throwBack) {
    // うしろへ 投げる: 相手を 自分の うしろへ 回して ふっとばす
    o.x = f.x - Math.cos(f.face) * (C.body.minGap + 0.2);
    o.z = f.z - Math.sin(f.face) * (C.body.minGap + 0.2);
  }
  const dir = h.throwBack ? f.face + Math.PI : h.pull ? angleTo(o, f) : f.face;
  const strong = final || !!h.launch || !!h.throwBack;
  const landed = hit(b, f, o, a.id, (f.x + o.x) / 2, Math.max(f.y, o.y) + 0.8, (f.z + o.z) / 2, dir, {
    last: strong,
    part: h.part,
    launch: h.launch ?? (strong ? undefined : 0),
    knock: h.knock ?? (strong ? 1 : 0.4),
    stun: C.monStun + 0.1,
  });
  if (landed && o.act.k === 'hurt') {
    if (h.bind) {
      // つかまえる: 目の前に 引きよせて、しばらく 動けない
      o.act.until = Math.max(o.act.until, h.bind);
      o.x = f.x + Math.cos(f.face) * (C.body.minGap + 0.15);
      o.z = f.z + Math.sin(f.face) * (C.body.minGap + 0.15);
      o.kvx = o.kvz = 0;
    }
    if (h.pull) {
      const g = angleTo(o, f);
      o.kvx = Math.cos(g) * 3 * C.hurt.friction * 0.35;
      o.kvz = Math.sin(g) * 3 * C.hurt.friction * 0.35;
    }
  }
  return landed;
}

/** 空中の 追い打ち: とび上がって 当たる所まで 来たら 1発。3回目は 地面へ たたきつける */
function updateAirChase(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>): void {
  const J = C.juggle;
  const o = other(b, f);
  const tech = getTech(a.id);
  if (!a.fired) {
    if (a.t < a.windup) return;
    a.fired = true;
    a.tf = a.t;
    b.events.push({ kind: 'power', side: f.side, sp: 'air', mv: a.mv ?? 'punch', c: 1 });
    return;
  }
  if (!a.hit) {
    f.face += angDiff(angleTo(f, o), f.face) * 0.3;
    const d3 = Math.hypot(o.x - f.x, o.z - f.z, (o.y - f.y) * 0.8);
    // とどく長さ(ZIPP の 電撃ダッシュは 短いので 少し のばす)
    const reach = Math.max(1.6, f.jab.range) + C.body.radius;
    if (d3 < reach && los(b, f, o, f.y + 0.8)) {
      a.hit = true;
      a.next = a.t;
      const spike = o.juggleN + 1 >= J.max;
      if (hit(b, f, o, a.id, (f.x + o.x) / 2, (f.y + o.y) / 2 + 0.6, (f.z + o.z) / 2, f.face, { last: true, part: J.part * (spike ? 1.3 : 1), juggle: true }) && o.act.k === 'air') {
        o.juggleN++;
        if (spike) {
          o.vy = J.spike;
          o.spiked = true;
          o.floatUntil = 0;
          b.events.push({ kind: 'spike', side: f.side, x: o.x, y: o.y, z: o.z });
        }
      }
      // 当てたら その場に ふわっと(のぼりすぎない・落ちるのを 少し おそく)
      f.vy = clamp(f.vy, 1.5, 2.5);
      f.vx *= 0.2;
      f.vz *= 0.2;
    } else if (a.t - (a.tf ?? 0) > J.strike * 2 || (f.y <= 0 && a.t - (a.tf ?? 0) > 0.1)) {
      a.hit = true;
      a.next = a.t;
    }
    return;
  }
  // 空中で もう一度 押した: 続けて 追い打ち(3回目は たたきつけ)
  if (f.command?.cmd === 'punch' && f.y > 0 && o.act.k === 'air' && o.juggleN < J.max && dist(f, o) < J.range && a.t >= a.next + 0.08) {
    f.command = null;
    a.hit = false;
    a.tf = a.t;
    const ang = angleTo(f, o);
    // 相手の 少し先の 高さまで とどく 速さ
    const dy = o.y + Math.max(0, o.vy) * 0.15 - f.y;
    f.vy = Math.max(f.vy, clamp(dy > 0 ? Math.sqrt(2 * C.gravity * dy) + 1 : 2, 2, 12));
    const gap = Math.max(0, dist(f, o) - C.body.minGap - 0.2);
    f.vx = Math.cos(ang) * gap * 4;
    f.vz = Math.sin(ang) * gap * 4;
    b.events.push({ kind: 'power', side: f.side, sp: 'air', mv: a.mv ?? 'punch', c: 1 });
    b.events.push({ kind: 'command', side: f.side, cmd: 'punch', state: 'done' });
    return;
  }
  // 着地したら おわり
  if (f.y <= 0 && a.t >= a.next + 0.05) {
    f.act = { k: 'free' };
    f.cooldown[a.id] = b.t + tech.recovery;
  }
}

/**
 * PUNI の「水の玉」(遠くへ1発。進化するほど遠くまで)・KLAK の「はさみトラップ」(自分の前に罠を置く)(2026-11-03 企画者)
 */
function updateRangedJab(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>): void {
  const o = other(b, f);
  if (!a.fired && a.t >= a.windup) {
    a.fired = true;
    a.next = a.t;
    const dir = f.pad && Math.hypot(f.pad.x, f.pad.z) > 0.3 && f.jab.trap ? Math.atan2(f.pad.z, f.pad.x) : angleTo(f, o);
    f.face = dir;
    if (f.jab.water) {
      const P = C.puniShot.byForm[f.jab.water - 1];
      const t = getTech('puniWater');
      b.seq++;
      b.shots.push({ id: b.seq, owner: f.side, tech: 'puniWater', x: f.x + Math.cos(dir) * 0.9, y: 0.8, z: f.z + Math.sin(dir) * 0.9, vx: Math.cos(dir) * t.speed, vz: Math.sin(dir) * t.speed, r: t.size, t: 0, alive: true, life: P.range / t.speed, part: P.power });
      b.events.push({ kind: 'fire', side: f.side, tech: 'puniWater' });
    } else if (f.jab.trap) {
      const T = C.klakTrap;
      const form = f.jab.trap;
      const [x, z] = clampField(b, f.x + Math.cos(dir) * T.ahead, f.z + Math.sin(dir) * T.ahead);
      // 置ける数をこえたら、いちばん古い罠から消える
      const mine = b.traps.filter((tp) => tp.owner === f.side && tp.snapAt === undefined);
      if (mine.length >= T.max[form - 1]) b.traps = b.traps.filter((tp) => tp !== mine[0]);
      b.seq++;
      b.traps.push({ id: b.seq, owner: f.side, x, z, r: T.r * (1 + (form - 1) * 0.12), armAt: b.t + T.arm, until: b.t + T.life, form });
      b.events.push({ kind: 'trapSet', side: f.side, id: b.seq, x, z });
    }
  }
  if (a.fired && a.t >= a.next + (f.jab.water ? C.puniShot.recover : 0.3)) f.act = { k: 'free' };
}

/** KLAK の はさみトラップ: ふんだ相手を はさんで 動けなくする */
function updateTraps(b: AnimeBattle): void {
  const T = C.klakTrap;
  // ぷに触手ドレイン: つないでいる間 0.4秒ごとに 吸う(はなれる・柱で かくれると 切れる)
  for (const th of b.tethers) {
    const ow = b.f[th.owner];
    const tg = b.f[th.owner === 0 ? 1 : 0];
    const tech = getTech(th.tech);
    if (dist(ow, tg) > tech.range * 1.6 || !los(b, ow, tg, 0.8) || ow.act.k === 'ko' || ow.act.k === 'hurt' || ow.act.k === 'air') {
      th.until = b.t;
      continue;
    }
    if (b.t >= th.next) {
      th.next = b.t + 0.4;
      const hp0 = tg.hp;
      if (hit(b, ow, tg, th.tech, tg.x, 0.8, tg.z, angleTo(ow, tg), { last: false, part: 0.35 })) healMon(b, ow, (hp0 - tg.hp) * C.drain.ratio, '吸収');
    }
  }
  b.tethers = b.tethers.filter((th) => b.t < th.until);
  // ぷに分裂弾: いちばん上で 3つに分かれる
  for (const s of [...b.shots])
    if (s.alive && s.split && s.vy !== undefined && s.vy <= 0) {
      s.alive = false;
      const tg = b.f[s.owner === 0 ? 1 : 0];
      const base = Math.atan2(tg.z - s.z, tg.x - s.x);
      for (const off of [-0.6, 0, 0.6]) {
        b.seq++;
        b.shots.push({ id: b.seq, owner: s.owner, tech: s.tech, x: s.x, y: s.y, z: s.z, vx: Math.cos(base + off) * 11, vz: Math.sin(base + off) * 11, vy: 1, bounce: 1, r: s.r / 1.6, t: 0, alive: true, home: C.style.homeRate * 0.7, part: 0.55, life: 3 });
      }
      b.events.push({ kind: 'explode', x: s.x, y: s.y, z: s.z, tech: s.tech, big: false });
    }
  // 万象ぷにドーム: ドームが消える時、受け止めた数だけ 強い はじける反撃
  for (const f of b.f)
    if (f.absorbN && f.barrierTech && styleOf(f.barrierTech) === 'absorbCounter' && b.t >= f.barrierUntil) {
      const n = Math.min(5, f.absorbN);
      f.absorbN = 0;
      b.quakes.push({ owner: f.side, tech: 'domeBurst', x: f.x, z: f.z, r: 0.3, hit: false, power: getTech('domeBurst').power * (1 + 0.6 * n) });
      b.events.push({ kind: 'domeBurst', side: f.side, x: f.x, z: f.z });
    }
  for (const tp of b.traps) {
    if (tp.snapAt !== undefined || b.t < tp.armAt) continue;
    const tgt = b.f[tp.owner === 0 ? 1 : 0];
    if (tgt.act.k === 'ko' || tgt.y > 0.35 || dist(tp, tgt) > tp.r + C.body.radius * 0.6) continue;
    // よけている瞬間・起きた直後・もう かからない間は ふんでも作動しない
    if (b.t < tgt.trapSafeUntil || isInvincible(b, tgt)) continue;
    tp.snapAt = b.t;
    tp.caught = tgt.side;
    const bind = tp.bind ?? T.bind[tp.form - 1];
    hit(b, b.f[tp.owner], tgt, tp.tech ?? 'klakTrap', tp.x, 0.4, tp.z, angleTo(b.f[tp.owner], tgt), tp.power ? { last: true, power: tp.power, unblockable: true } : { last: true, part: T.power[tp.form - 1], unblockable: true });
    // 連鎖トラップ: つながった ほかの罠も いっせいに作動(光の杭)
    if (tp.chain !== undefined)
      for (const q of b.traps)
        if (q !== tp && q.chain === tp.chain && q.snapAt === undefined) {
          q.snapAt = b.t;
          addStrike(b, b.f[tp.owner], q.tech ?? 'klakTrap', q.x, q.z, 0.9, b.t + 0.15, 'stake', (q.power ?? 6) * 0.8);
        }
    if ((tgt.act as AnimeAct).k !== 'ko') {
      tgt.act = { k: 'hurt', t: 0, until: bind };
      tgt.kvx = tgt.kvz = 0;
      tgt.vx = tgt.vz = 0;
      tgt.x = tp.x;
      tgt.z = tp.z;
    }
    tgt.trapSafeUntil = b.t + bind + T.immune;
    b.events.push({ kind: 'trapSnap', side: tp.owner, target: tgt.side, id: tp.id, x: tp.x, z: tp.z });
    b.events.push({ kind: 'status', side: tgt.side, effect: 'つかまった' });
  }
  b.traps = b.traps.filter((tp) => (tp.snapAt === undefined ? b.t < tp.until : b.t < tp.snapAt + (tp.bind ?? T.bind[tp.form - 1])));
}

/**
 * ZIPP の通常攻撃「電撃ダッシュ」(2026-11-03 企画者)。ためる → はなすと前へ走る(ためた分 遠くへ・強く)。
 * 自分で動かしている時は ボタンを はなすまで ためる(f.hold)。オートの時は 相手までの距離に合わせて ためる
 */
function updateDash(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, dt: number): void {
  const Z = C.zdash;
  const P = Z.byForm[(f.jab.dash ?? 1) - 1];
  const o = other(b, f);
  const tech = getTech(a.id);
  if (!a.fired) {
    a.charge = a.charge ?? 0;
    if (a.t < a.windup) return;
    a.charge = Math.min(Z.charge, a.charge + dt);
    f.face = angleTo(f, o);
    const want = f.pad ? (f.hold ? Z.charge + 1 : 0) : clamp((dist(f, o) - C.body.minGap - P.min + 0.6) / (P.max - P.min), 0, 1) * Z.charge;
    if (a.charge < want && a.t < a.windup + Z.hold) return;
    // 出す
    const c = a.charge / Z.charge;
    a.fired = true;
    a.len = P.min + (P.max - P.min) * c;
    a.dir = f.pad && Math.hypot(f.pad.x, f.pad.z) > 0.3 ? Math.atan2(f.pad.z, f.pad.x) : angleTo(f, o);
    a.tx = 0; // 走った長さ
    a.n = c; // ためた割合(威力に使う)
    f.face = a.dir;
    b.events.push({ kind: 'zdash', side: f.side, x: f.x, z: f.z, dir: a.dir, len: a.len, c });
    return;
  }
  if (!a.hit && a.tx < (a.len ?? 0)) {
    const step = Math.min(Z.speed * dt, (a.len ?? 0) - a.tx);
    f.x += Math.cos(a.dir) * step;
    f.z += Math.sin(a.dir) * step;
    a.tx += step;
    a.next = a.t;
    if (dist(f, o) < C.body.minGap + 0.35 && yOk(b, f, o, 1.3)) {
      a.hit = true;
      hit(b, f, o, a.id, (f.x + o.x) / 2, f.y + 0.7, (f.z + o.z) / 2, a.dir, { last: true, part: P.p0 + (P.p1 - P.p0) * a.n });
    }
    if (a.tx >= (a.len ?? 0)) a.hit = true;
    return;
  }
  if (a.t >= a.next + Z.recover) {
    f.act = { k: 'free' };
    // コンボの さいごの ダッシュの あとだけ 待つ(ハメに ならないように)
    const max = Z.chain[(f.jab.dash ?? 1) - 1];
    if (f.jabChain >= max) {
      f.cooldown[a.id] = b.t + Z.chainCool + tech.windup * 0;
      f.jabChain = 0;
    } else {
      f.cooldown[a.id] = b.t + Z.cool;
      f.jabChainUntil = b.t + C.chain.press;
    }
  }
}

/** 雷走ブレイカー: 走ったあとの地面に 焦げた電気の線(上にいると しびれる・少しダメージ) */
function boltTrail(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>): void {
  b.fields.push({ owner: f.side, tech: a.id, x: a.sx ?? f.x, z: a.sz ?? f.z, x2: f.x, z2: f.z, r: 0.75, until: b.t + 2.5, tick: b.t + 0.3, shape: 'line', power: 3, effect: 'まひ' });
  b.events.push({ kind: 'field', side: f.side, x: f.x, z: f.z, r: 0.75, until: b.t + 2.5 });
}

/**
 * とくべつな出し方の技(2026-11-03 企画者「そのキャラにあった技を」)。出したら true
 */
function fireSpecial(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, st: string): boolean {
  const o = other(b, f);
  const tech = getTech(a.id);
  const S = C.style;
  const pw = S.strike[tech.strength] ?? 16;
  const warn = S.strikeWarn;
  const mk = (x: number, z: number, dir: number, sp: number, extra: Partial<Shot> = {}) => {
    b.seq++;
    b.shots.push({ id: b.seq, owner: f.side, tech: a.id, x, y: 0.8, z, vx: Math.cos(dir) * sp, vz: Math.sin(dir) * sp, r: tech.size, t: 0, alive: true, ...extra });
  };
  switch (st) {
    case 'fireLob': {
      // 火花: 上を向いて、相手へ 炎の玉を 山なりに(相手の 所に 落ちる)
      const d = Math.max(1.5, dist(f, o));
      const sp = tech.speed * 0.6;
      const tt = d / sp;
      const g = C.gravity * 0.8;
      const vy = (o.y + 0.7 - 1.3 + 0.5 * g * tt * tt) / tt;
      mk(f.x + Math.cos(a.dir) * 0.8, f.z + Math.sin(a.dir) * 0.8, a.dir, sp, { vy, y: 1.3, bounce: 0, r: tech.size * 1.3 });
      return true;
    }
    case 'slash3':
      // 王者の爪: 炎の 横の斬撃を 相手の方と ななめ 2つ、いっしょに 3発
      for (let k = -1; k <= 1; k++) mk(f.x + Math.cos(a.dir + k * 0.45) * 0.9, f.z + Math.sin(a.dir + k * 0.45) * 0.9, a.dir + k * 0.45, tech.speed * 1.15, { r: tech.size * 1.7, look: 'slash', life: 1.3, part: k === 0 ? 0.6 : 0.45 });
      return true;
    case 'burst3':
      // 水玉ショット: すばやく 3連射
      for (let k = 0; k < 3; k++) mk(f.x + Math.cos(a.dir) * 0.9, f.z + Math.sin(a.dir) * 0.9, a.dir + (k - 1) * 0.04, tech.speed * 1.1, { wait: k * 0.12, part: 0.45 });
      return true;
    case 'growlPush': {
      // ドスグロウル: 低く うなって、まわりの 相手を 押しとばす(攻撃ダウン)。浮いている相手には とどかない
      b.events.push({ kind: 'beastFx', side: f.side, fx: 'growl', mv: 'zap', x: f.x, z: f.z, dir: f.face, hit: false, tech: a.id });
      if (dist(f, o) < 4.8 && !floating(o) && hit(b, f, o, a.id, o.x, 0.8, o.z, angleTo(f, o), { power: 7, launch: 0 })) {
        const g = angleTo(f, o);
        o.kvx = Math.cos(g) * 5 * C.hurt.friction * 0.35;
        o.kvz = Math.sin(g) * 5 * C.hurt.friction * 0.35;
        setEffect(b, o, '攻撃ダウン');
      }
      return true;
    }
    case 'glare': {
      // 凄みの眼: 前の 相手を にらんで 少し 動けなくする(防御ダウン)
      b.events.push({ kind: 'beastFx', side: f.side, fx: 'glare', mv: 'zap', x: o.x, z: o.z, dir: f.face, hit: false, tech: a.id });
      if (dist(f, o) < 7 && Math.abs(angDiff(angleTo(f, o), f.face)) < 0.8 && !isInvincible(b, o) && o.act.k !== 'ko') {
        if (hit(b, f, o, a.id, o.x, 0.8, o.z, f.face, { power: 3, knock: 0.1, launch: 0, stun: 1 }) && o.act.k === 'hurt') o.act.until = Math.max(o.act.until, 1);
        setEffect(b, o, '防御ダウン');
      }
      return true;
    }
    case 'lob3':
      // 火岩けり: 燃える岩を 3つ 山なりに
      for (let k = -1; k <= 1; k++) {
        const d = a.dir + k * 0.3;
        mk(f.x + Math.cos(d) * 0.9, f.z + Math.sin(d) * 0.9, d, tech.speed * 0.55, { vy: C.style.arcVy, bounce: 0, y: 1.0, r: tech.size * 1.3 });
      }
      return true;
    case 'spread8':
      // ヴァイガルドライブ: まわり 8方向と 相手へ 3つ
      for (let k = 0; k < 8; k++) mk(f.x, f.z, a.dir + (k * Math.PI) / 4, tech.speed * 0.8);
      for (let k = -1; k <= 1; k++) mk(f.x, f.z, a.dir + k * 0.12, tech.speed, { wait: 0.15 });
      return true;
    case 'chain': {
      // 連鎖いなずま: 相手の 足もとと まわりに 次々 いなずま(すぐ 落ちる)
      const g0 = addStrike(b, f, a.id, o.x, o.z, 1.1, b.t + 0.3, 'bolt', pw * 0.55);
      void g0;
      for (let i = 0; i < 3; i++) {
        const ang = b.rng() * Math.PI * 2;
        addStrike(b, f, a.id, o.x + Math.cos(ang) * 1.8, o.z + Math.sin(ang) * 1.8, 1, b.t + 0.45 + i * 0.12, 'bolt', pw * 0.25);
      }
      return true;
    }
    case 'onePillar':
      // 大岩おこし・間欠泉: 相手の 足もとから 1本(よけられる)
      addStrike(b, f, a.id, o.x, o.z, 1.3, b.t + 0.55, tech.element === '水' ? 'water' : 'rock', pw * 1.1);
      return true;
    case 'strike1':
      // 稲妻マーキング: 相手の足もとに印 → 少しあとに落雷
      addStrike(b, f, a.id, o.x, o.z, 1.15, b.t + warn, 'bolt', pw);
      return true;
    case 'strikeNet': {
      // 天網雷獄: 相手の足もと → まわり5か所へ 順番に落雷(1つずつ当たる・少し弱い)
      addStrike(b, f, a.id, o.x, o.z, 1.2, b.t + warn, 'bolt', pw * 0.3);
      const a0 = b.rng() * Math.PI * 2;
      for (let i = 0; i < 5; i++) {
        const ang = a0 + (i * Math.PI * 2) / 5;
        addStrike(b, f, a.id, o.x + Math.cos(ang) * S.netRing, o.z + Math.sin(ang) * S.netRing, 1.2, b.t + warn + 0.18 * (i + 1), 'bolt', pw * 0.25);
      }
      return true;
    }
    case 'stakes': {
      // 精密包囲陣: 相手のまわり4か所と まん中に 照準 → いっせいに光の杭(まとめて1回)
      b.seq++;
      const g = b.seq;
      addStrike(b, f, a.id, o.x, o.z, 0.9, b.t + warn + 0.2, 'stake', pw * 0.55, g);
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2 + Math.PI / 4;
        addStrike(b, f, a.id, o.x + Math.cos(ang) * 1.5, o.z + Math.sin(ang) * 1.5, 0.9, b.t + warn + 0.2, 'stake', pw * 0.55, g);
      }
      return true;
    }
    case 'snipeArray':
      // 終端狙撃陣: 照準が相手を追いかけ、さいごに 止まって 集中砲撃
      addStrike(b, f, a.id, o.x, o.z, 1.5, b.t + 1.2, 'beam', pw * 0.8, undefined, b.t + 0.85);
      return true;
    case 'trapChain':
    case 'miniTraps': {
      // 連鎖トラップ: 相手までの線の上に 3つの罠(どれかを ふむと 全部作動)
      // カチカチトラップ: 相手のまわりに 小さい罠を3つ
      b.seq++;
      const chain = st === 'trapChain' ? b.seq : undefined;
      for (let i = 0; i < 3; i++) {
        let x: number;
        let z: number;
        if (st === 'trapChain') {
          const k = 0.35 + i * 0.25;
          x = f.x + (o.x - f.x) * k;
          z = f.z + (o.z - f.z) * k;
        } else {
          const ang = b.rng() * 0.6 + (i * Math.PI * 2) / 3;
          x = o.x + Math.cos(ang) * 1.7;
          z = o.z + Math.sin(ang) * 1.7;
        }
        const [cx, cz] = clampField(b, x, z);
        b.seq++;
        b.traps.push({ id: b.seq, owner: f.side, x: cx, z: cz, r: 0.75, armAt: b.t + 0.35, until: b.t + (st === 'trapChain' ? 10 : 6), form: 1, chain, tech: a.id, power: pw * (st === 'trapChain' ? 0.55 : 0.5), bind: S.bindShort + (st === 'trapChain' ? 0.3 : 0.2) });
        b.events.push({ kind: 'trapSet', side: f.side, id: b.seq, x: cx, z: cz });
      }
      return true;
    }
    case 'homing3':
      // 閃電三連: 体の3方向に電光の矢 → 曲がって相手へ
      // 着く時間を ずらす(1回よけても 次が来る)
      [-0.95, 0.95, 0].forEach((off, k) => mk(f.x + Math.cos(a.dir + off) * 0.9, f.z + Math.sin(a.dir + off) * 0.9, a.dir + off, tech.speed * (1.25 - k * 0.2), { home: S.homeRate * 1.15 }));
      a.n = C.barrage.count;
      return true;
    case 'fan':
      // 雷針スパーク: 細い雷の針を いっせいに3本(扇の形)
      for (const off of [-0.22, 0, 0.22]) mk(f.x + Math.cos(a.dir + off) * 0.9, f.z + Math.sin(a.dir + off) * 0.9, a.dir + off, tech.speed * 1.3);
      a.n = C.barrage.count;
      return true;
    case 'turrets': {
      // 千機包囲網: 相手のまわりに 小さな砲台が5つ → 順番に 内がわへ撃つ
      const a0 = b.rng() * Math.PI * 2;
      for (let i = 0; i < 5; i++) {
        const ang = a0 + (i * Math.PI * 2) / 5;
        let [x, z] = clampField(b, o.x + Math.cos(ang) * S.turretR, o.z + Math.sin(ang) * S.turretR);
        if (b.arena && insideObstacle(b.arena, x, z, 0.6)) [x, z] = clampField(b, o.x + Math.cos(ang) * 3.2, o.z + Math.sin(ang) * 3.2);
        mk(x, z, ang + Math.PI, tech.speed, { wait: 0.6 + i * 0.15, part: 0.25, life: 0.6 + i * 0.15 + 1.2 });
      }
      a.n = C.barrage.count;
      return true;
    }
    case 'ghostRush': {
      // 迅雷乱舞: ZIPP の残像が 4方向から 順番に 相手へ つっこむ
      const a0 = angleTo(o, f);
      for (let i = 0; i < 4; i++) {
        const ang = a0 + (i * Math.PI) / 2 + Math.PI / 4;
        let [x, z] = clampField(b, o.x + Math.cos(ang) * 4.2, o.z + Math.sin(ang) * 4.2);
        if (b.arena && insideObstacle(b.arena, x, z, 0.6)) [x, z] = clampField(b, o.x + Math.cos(ang) * 2.4, o.z + Math.sin(ang) * 2.4);
        mk(x, z, ang + Math.PI, 26, { wait: 0.1 + i * 0.16, part: 0.24, life: 0.1 + i * 0.16 + 0.5, look: 'ghost', r: 0.7 });
      }
      a.n = tech.hits;
      a.hit = true;
      return true;
    }
    case 'split':
      // ぷに分裂弾: 大きな ぷにが 山なりに飛んで、いちばん上で 3つに分かれて 相手を追う
      mk(f.x + Math.cos(a.dir) * 0.9, f.z + Math.sin(a.dir) * 0.9, a.dir, tech.speed * 0.6, { vy: 6.5, y: 1.0, split: 3, r: tech.size * 1.6, part: 0.5, life: 3 });
      a.n = C.barrage.count;
      return true;
    case 'tether':
      // ぷに触手ドレイン: とどけば 細い触手で つないで、しばらく 少しずつ吸う
      if (dist(f, o) < tech.range * 1.3 && los(b, f, o, 0.8)) {
        b.tethers.push({ owner: f.side, tech: a.id, until: b.t + 1.7, next: b.t + 0.2 });
        return true;
      }
      return false;
    default:
      return false;
  }
}

/** 技のため・発射 */
function updateTech(b: AnimeBattle, f: AnimeMon, a: Extract<AnimeAct, { k: 'tech' }>, dt: number): void {
  const tech = getTech(a.id);
  const o = other(b, f);
  a.t += dt;
  if (a.sp) return updatePower(b, f, a, dt);
  const bs = BEAST[a.id];
  if (bs) return updateBeast(b, f, a, dt, bs);
  if (tech.kind === 'jab' && f.jab.dash) return updateDash(b, f, a, dt);
  if (tech.kind === 'jab' && (f.jab.water || f.jab.trap)) return updateRangedJab(b, f, a);
  const run = a.t - a.windup;
  const shoot = (dir: number) => {
    b.seq++;
    const st0 = styleOf(a.id);
    const sp = tech.speed * (st0 === 'pinpoint' ? 2.2 : st0 === 'bomb' ? 0.6 : 1);
    const shot: Shot = { id: b.seq, owner: f.side, tech: a.id, x: f.x + Math.cos(dir) * 0.9, y: 0.8, z: f.z + Math.sin(dir) * 0.9, vx: Math.cos(dir) * sp, vz: Math.sin(dir) * sp, r: tech.size, t: 0, alive: true, zig: f.species === 'zipp' && tech.kind !== 'drain' && !st0 ? 1 : 0 };
    // ぽよん玉・ぽよぽよ連弾・ぷに分裂弾: ぽーんと山なりに飛んで、地面で1回はねる
    if (st0 === 'arc') {
      shot.vy = C.style.arcVy;
      shot.bounce = 1;
      shot.y = 1.0;
    }
    // ぽよぽよ連弾: 水切りのように 低く ぴょんぴょん 何回も はねる
    if (st0 === 'skip') {
      shot.vy = 2.6;
      shot.bounce = 4;
      shot.y = 0.6;
    }
    // 黒蛇玉: へびのように くねくね 進む・黒い息: 遅くて 大きい
    if (st0 === 'weave') shot.zig = 1;
    // 光狼のキバ: 狼が 相手を 追いかける・雷紋: 大きくなる 輪・泡のつぶて: ゆっくりの 泡(当たると つかまる)
    if (st0 === 'homingWolf') {
      shot.home = 3.2;
      shot.vx *= 0.75;
      shot.vz *= 0.75;
      shot.life = 3;
      shot.look = 'wolf';
    }
    if (st0 === 'ringShot') {
      shot.grow = 1.4;
      shot.vx *= 0.5;
      shot.vz *= 0.5;
      shot.life = 3;
      shot.look = 'ring';
    }
    if (st0 === 'bubble') {
      shot.vx *= 0.45;
      shot.vz *= 0.45;
      shot.r *= 1.4;
      shot.bind = 0.8;
      shot.life = 3;
      shot.look = 'bubble';
    }
    if (st0 === 'slowOrb' || st0 === 'smogOrb') {
      shot.vx *= 0.45;
      shot.vz *= 0.45;
      shot.r *= 1.9;
      shot.life = 3.5;
    }
    // 時限ボム: 相手の近くまで ころがって止まり、少しして爆発
    if (st0 === 'bomb') {
      shot.stop = Math.min(tech.range, Math.max(2, dist(f, o) - 0.5));
      shot.y = 0.35;
      shot.life = 8;
    }
    b.shots.push(shot);
  };
  // ZIPP: 左右にジグザグ(はじめの半分は片側へ)。ZZ = 今の向き(+1/-1)
  const zz = (seg: number) => (Math.floor(run / seg + 0.5) % 2 ? -1 : 1);
  const zippy = f.species === 'zipp';
  const st = styleOf(a.id);
  // 照準ライン・狙撃ライン・ピンポイント弾: ためている間、相手を ねらい続ける
  if (!a.fired && (st === 'sweep' || st === 'snipe' || st === 'pinpoint')) {
    a.dir += clamp(angDiff(angleTo(f, o), a.dir), -4 * dt, 4 * dt);
    f.face = a.dir;
  }
  if (!a.fired && a.t >= a.windup) {
    a.fired = true;
    a.sx = f.x;
    a.sz = f.z;
    b.events.push({ kind: 'fire', side: f.side, tech: a.id });
    if (st && fireSpecial(b, f, a, st)) {
      // とくべつな出し方(下の ふつうの出し方は しない)
    } else if (tech.kind === 'shot') shoot(a.dir);
    else if (tech.kind === 'barrage') {
      shoot(a.dir);
      a.n = 1;
      a.next = a.t + C.barrage.gap;
    } else if (tech.kind === 'beam') b.beams.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, dir: a.dir, t: 0, hit: false, track: st === 'sweep' ? 1.3 : undefined });
    else if (tech.kind === 'quake') {
      // その場で踏みつける(小さく跳ねて、着地で衝撃波)
      f.vy = C.quake.hop;
      f.y = 0.001;
    } else if (tech.kind === 'drop') {
      // 高く跳んで、相手のいた所へ落ちる(落ちる所に印)。跳雷リープは 低く速く・ぷにバウンドは 小さく何回も
      const jump = C.drop.jump * (st === 'lowLeap' ? 0.5 : st === 'multiBounce' ? 0.6 : 1);
      const air = (2 * jump) / C.gravity;
      const [tx, tz] = clampField(b, o.x, o.z);
      a.tx = tx;
      a.tz = tz;
      f.vy = jump;
      f.y = 0.001;
      f.vx = (tx - f.x) / air;
      f.vz = (tz - f.z) / air;
      b.events.push({ kind: 'mark', side: f.side, x: tx, z: tz, r: tech.size * (st === 'bigPress' ? 1.3 : 1), until: b.t + air });
    } else if (tech.kind === 'debuff') {
      // ほえる: 口もとから声の輪が広がる
      b.roars.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.5, hit: false });
      b.events.push({ kind: 'roar', side: f.side, x: f.x, z: f.z });
    } else if (tech.kind === 'field' && (st === 'fireRing' || st === 'clawLines' || st === 'mines' || st === 'puddles')) {
      // いくつも 置く 場(2026-11-05)
      const until = b.t + (st === 'mines' ? 9 : 5);
      const add = (x: number, z: number, extra: Partial<Field> = {}) => {
        const [fx, fz] = clampField(b, x, z);
        b.fields.push({ owner: f.side, tech: a.id, x: fx, z: fz, r: 0.75, until, tick: b.t + C.fieldTick * 0.5, ...extra });
        b.events.push({ kind: 'field', side: f.side, x: fx, z: fz, r: extra.r ?? 0.75, until });
      };
      if (st === 'fireRing') {
        // 炎環走り: 相手の まわりに 炎の輪(8つの 小さな 炎)
        for (let k = 0; k < 8; k++) add(o.x + Math.cos((k * Math.PI) / 4) * 2.4, o.z + Math.sin((k * Math.PI) / 4) * 2.4, { r: 1.1, power: 3, magma: true });
      } else if (st === 'clawLines') {
        // 炎の爪痕: 前へ 3本の 炎の 爪あと(線)
        for (const off of [-0.9, 0, 0.9]) {
          const sx = f.x + Math.cos(a.dir) * 0.8 - Math.sin(a.dir) * off;
          const sz = f.z + Math.sin(a.dir) * 0.8 + Math.cos(a.dir) * off;
          const [x2, z2] = clampField(b, sx + Math.cos(a.dir) * 5, sz + Math.sin(a.dir) * 5);
          add(sx, sz, { r: 0.45, shape: 'line', x2, z2, power: 3 });
        }
      } else if (st === 'puddles') {
        // 潮だまり: 相手の まわりに 水たまり 3つ(遅くなる)
        for (let k = 0; k < 3; k++) {
          const g = (k * Math.PI * 2) / 3 + b.rng();
          add(o.x + Math.cos(g) * 1.4, o.z + Math.sin(g) * 1.4, { r: 1.3, effect: '遅くする', power: 1 });
        }
      } else {
        // 電気の種: 相手の ほうへ 3つ まく(ふむと はじける)
        for (let k = 0; k < 3; k++) {
          const d = a.dir + (k - 1) * 0.35;
          const L = Math.min(dist(f, o), 2.5 + k * 1);
          add(f.x + Math.cos(d) * L, f.z + Math.sin(d) * L, { r: 1, mine: true, power: 0 });
        }
      }
    } else if (tech.kind === 'field') {
      // 拳を地面にたたきつけ、相手のいる所に重力の場【案: 場所は相手の足もと】
      // 自分の場(千花天幕)は自分の足もと・ほかは相手の足もと
      const self = SELF_FIELD.has(a.id) || st === 'selfRing' || st === 'decoy' || st === 'whirlpool';
      // 影の抜け殻: 自分の いた所に 影を残して、うしろへ さっと にげる
      if (st === 'decoy') {
        const g = angleTo(o, f);
        f.kvx = Math.cos(g) * 4.5 * C.hurt.friction * 0.35;
        f.kvz = Math.sin(g) * 4.5 * C.hurt.friction * 0.35;
        f.safeUntil = Math.max(f.safeUntil, b.t + 0.35);
      }
      const [fx, fz] = clampField(b, self ? f.x : o.x, self ? f.z : o.z);
      const ownField = SELF_FIELD.has(a.id);
      // 十字ワイヤー: 相手の足もとに 十字の光るワイヤー(線の上だけ効く・長い)
      b.fields.push({ owner: f.side, tech: a.id, x: fx, z: fz, r: tech.size * (st === 'cross' ? 1.5 : st === 'selfRing' ? 1.7 : 1), power: st === 'selfRing' ? 4 : undefined, until: b.t + C.gfield.time, tick: b.t + C.fieldTick * 0.5, self: ownField, shape: st === 'cross' ? 'cross' : undefined, rot: a.dir, stick: st === 'stickyGoo', pull: st === 'whirlpool' });
      b.events.push({ kind: 'field', side: f.side, x: fx, z: fz, r: tech.size, until: b.t + C.gfield.time });
    } else if (tech.kind === 'pillar') {
      // 自分の前の地面を なぐる → 使った時の相手の足もと と、そのまわり3か所から 炎の柱(地面が光ってから出る。よけられる)
      const P = C.pillar;
      const [cx, cz] = clampField(b, o.x, o.z);
      b.seq++;
      const g = b.seq;
      b.pillars.push({ owner: f.side, tech: a.id, g, x: cx, z: cz, r: tech.size, at: b.t + P.warn, up: false });
      const a0 = b.rng() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const ang = a0 + (i * Math.PI * 2) / 3;
        const [px, pz] = clampField(b, cx + Math.cos(ang) * P.ring, cz + Math.sin(ang) * P.ring);
        b.pillars.push({ owner: f.side, tech: a.id, g, x: px, z: pz, r: tech.size, at: b.t + P.warn + P.gap * (i + 1), up: false });
      }
      // なぐった所(自分の足もとの すぐ前)にヒビと火
      b.events.push({ kind: 'impact', side: f.side, tech: a.id, x: f.x + Math.cos(a.dir) * 0.55, z: f.z + Math.sin(a.dir) * 0.55, r: 0.9 });
    } else if (tech.kind === 'heal') {
      healMon(b, f, (f.maxHp * tech.power) / 100, '回復');
    } else if (tech.kind === 'buff') {
      const what = BUFF_WHAT[a.id] ?? 'atk';
      if (what === 'def' || what === 'both') {
        f.defUp = tech.power / 100 * (what === 'both' ? 0.7 : 1);
        f.defUpUntil = b.t + tech.duration;
      }
      if (what === 'both') {
        f.atkUp = (tech.power / 100) * 0.7;
        f.atkUpUntil = b.t + tech.duration;
      } else if (what !== 'def') {
        f.atkUp = tech.power / 100;
        f.atkUpUntil = b.t + tech.duration;
        if (what === 'speed') f.burstUntil = b.t + tech.duration;
      }
      // 残光ステップ: しばらく よけるのが 速く 遠く。超弾性チャージ: しばらく ふっとばす力が強い
      if (st === 'afterimage') f.blinkUntil = b.t + tech.duration;
      if (st === 'elastic') f.knockUpUntil = b.t + tech.duration;
      if (st === 'armorBuff') f.armorUntil = b.t + tech.duration;
      // 獣性ブースト: 通常攻撃が 炎に・黒鱗: 歩いたあとに 毒・踏ん張り: ガードの量が もどる・甲羅こもり: しばらく 当たらない・少し 回復
      if (st === 'fireJab') f.fireJabUntil = b.t + tech.duration;
      if (st === 'poisonTrail') f.trailUntil = b.t + tech.duration;
      if (st === 'refill') {
        f.guardGauge = C.guard.max;
        f.armorUntil = b.t + 2;
        b.events.push({ kind: 'beastFx', side: f.side, fx: 'stomp', mv: 'clawR', x: f.x, z: f.z, dir: f.face, hit: false, tech: a.id });
      }
      if (st === 'shellHide') {
        f.safeUntil = Math.max(f.safeUntil, b.t + 1.6);
        healMon(b, f, f.maxHp * 0.08, '回復');
      }
      b.events.push({ kind: 'buff', side: f.side, what: what === 'both' ? 'atk' : what });
      if (what === 'both') b.events.push({ kind: 'buff', side: f.side, what: 'def' });
    } else if (tech.kind === 'drain') shoot(a.dir);
    else if (tech.kind === 'barrier' && st === 'waterWall') {
      // 潮の壁: 前に 水の壁(相手の 弾を 止める・さわると 押し返される)
      const cx = f.x + Math.cos(a.dir) * 1.8;
      const cz = f.z + Math.sin(a.dir) * 1.8;
      const px = -Math.sin(a.dir) * 1.8;
      const pz = Math.cos(a.dir) * 1.8;
      b.fields.push({ owner: f.side, tech: a.id, x: cx - px, z: cz - pz, x2: cx + px, z2: cz + pz, r: 0.45, shape: 'line', until: b.t + 3.5, wall: true, power: 0 });
    } else if (tech.kind === 'barrier' && st === 'armor') {
      // 頑固ガード: ドームは 出さず、体を 固める(当たっても ひるまない・ダメージ 少し へる)
      f.armorUntil = b.t + tech.duration * 1.6;
      b.events.push({ kind: 'buff', side: f.side, what: 'def' });
    } else if (tech.kind === 'barrier') {
      f.barrierUntil = b.t + tech.duration;
      f.barrierR = tech.size;
      f.barrierTech = a.id;
      f.absorbN = 0;
    }
  }
  if (!a.fired) return;
  switch (tech.kind) {
    case 'rush': {
      if (st === 'multiPass') {
        // 千閃雷走: 相手を何度も つきぬけて 走りぬける(4回。さいごが強い)
        const passes = 4;
        if (a.len === undefined) {
          a.len = dist(f, o) + 3;
          a.charge = 0;
          a.dir = angleTo(f, o);
          a.next = 0;
        }
        const sp = tech.speed * 1.5;
        f.x += Math.cos(a.dir) * sp * dt;
        f.z += Math.sin(a.dir) * sp * dt;
        a.charge = (a.charge ?? 0) + sp * dt;
        f.face = a.dir;
        if (a.next === 0 && dist(f, o) < C.body.minGap + 0.3 && yOk(b, f, o, 1.2)) {
          a.next = 1;
          hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, a.dir, { last: a.n === passes - 1, part: a.n === passes - 1 ? 0.3 : 0.17 });
        }
        if (a.charge >= a.len || edgeness(b, f.x, f.z) > 0.97) {
          a.n++;
          if (a.n >= passes) {
            a.hit = true;
            break;
          }
          a.dir = angleTo(f, o);
          a.len = dist(f, o) + 3;
          a.charge = 0;
          a.next = 0;
        }
        return;
      }
      if (st === 'stretch') {
        // ぷにタッチ: 体を にゅっと のばして つつく(その場から。とどく長さ 3.4m)
        // 遠い時は のびる前に ぴょんと前へ(2.5mまで)。のびる向きは 相手のほうへ合わせる
        if (!a.hit && run < 0.08) {
          a.dir = angleTo(f, o);
          f.face = a.dir;
          const gap = dist(f, o) - C.style.stretchReach + 0.6;
          if (gap > 0) {
            const mv = Math.min(gap, 2.5) * (dt / 0.08);
            f.x += Math.cos(a.dir) * mv;
            f.z += Math.sin(a.dir) * mv;
          }
        }
        if (!a.hit && run >= 0.08) {
          a.hit = true;
          const reach = C.style.stretchReach + C.body.radius;
          if (dist(f, o) < reach && Math.abs(angDiff(angleTo(f, o), a.dir)) < 0.8 && los(b, f, o, 0.8) && yOk(b, f, o, 1.2)) hit(b, f, o, a.id, o.x, 0.8, o.z, a.dir);
        }
        // のびたあと: もどったら 動ける(下の「技のおわり」へ)
        if (a.hit) break;
        return;
      }
      if (st === 'flankClamp') {
        // 背面クランプ: 相手のまわりを すべるように回って うしろへ → はさんで 少し動けなくする
        // はさんだあとは 技のおわりへ(2026-11-04 企画者「背面クランプ使ったら動かなくなる」→ 直した)
        if (a.hit) break;
        if (a.len === undefined) a.len = angleTo(o, f);
        const k = Math.min(1, run / 0.35);
        const ang = a.len + (a.zig ?? 1) * Math.PI * k;
        [f.x, f.z] = clampField(b, o.x + Math.cos(ang) * 1.6, o.z + Math.sin(ang) * 1.6);
        f.face = angleTo(f, o);
        if (k >= 1 && !a.hit) {
          a.hit = true;
          if (dist(f, o) < 2.4 && yOk(b, f, o, 1.2)) {
            const ok = hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, angleTo(f, o));
            if (ok && o.act.k === 'hurt') o.act.until = Math.max(o.act.until, C.style.bindShort + 0.2);
          }
          break;
        }
        return;
      }
      if (st === 'vanishTackle' && a.n === 0) {
        // ジップタックル: 一瞬 消えて、相手の目の前に あらわれて 体当たり
        a.n = 1;
        const d = dist(f, o);
        if (d > 2) {
          const ang = angleTo(o, f);
          const [nx, nz] = clampField(b, o.x + Math.cos(ang) * 1.9, o.z + Math.sin(ang) * 1.9);
          if (!b.arena || !insideObstacle(b.arena, nx, nz, C.body.radius)) {
            b.events.push({ kind: 'blink', side: f.side, x0: f.x, z0: f.z, x: nx, z: nz });
            f.x = nx;
            f.z = nz;
          }
        }
        a.dir = angleTo(f, o);
      }
      // 横這いタックル: はじめに 横へ すっと動いてから、相手へ
      const side = st === 'sidestep';
      if (side && run < 0.24) {
        const sd = a.dir + ((a.zig ?? 1) * Math.PI) / 2;
        f.x += Math.cos(sd) * 11 * dt;
        f.z += Math.sin(sd) * 11 * dt;
        if (run + dt >= 0.24) a.dir = angleTo(f, o);
        return;
      }
      const rr = side ? run - 0.24 : run;
      // 突進: まっすぐ走る(とちゅうで曲がらない)
      if (rr * tech.speed < tech.range && !a.hit) {
        // ZIPP: ぎざぎざに曲がりながら 相手へ(雷走ブレイカーだけは 一直線)【仮】
        const zr = zippy && a.id !== '雷走ブレイカー' && st !== 'vanishTackle';
        if (zr) a.dir += clamp(angDiff(angleTo(f, o), a.dir), -2.5 * dt, 2.5 * dt);
        const md = zr ? a.dir + zz(C.zipp.zig) * C.zipp.zigAng : a.dir;
        const ms = zr ? tech.speed / Math.cos(C.zipp.zigAng) : tech.speed;
        if (zr) f.face = md;
        f.x += Math.cos(md) * ms * dt;
        f.z += Math.sin(md) * ms * dt;
        if (dist(f, o) < C.body.minGap + 0.2 && yOk(b, f, o, 1.2)) {
          a.hit = true;
          hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, a.dir, st === 'vanishTackle' ? { power: getTech(a.id).power * 0.8 } : {});
          if (st === 'boltTrail') boltTrail(b, f, a);
        }
        return;
      }
      if (!a.hit && st === 'boltTrail') boltTrail(b, f, a);
      a.hit = true;
      break;
    }
    case 'spin': {
      // 回転: 転がって、少しずつ相手のほうへ曲がる
      if (run < tech.duration && !a.hit) {
        a.dir += clamp(angDiff(angleTo(f, o), a.dir), -C.spin.turn * dt, C.spin.turn * dt);
        // ZIPP: 回りながら、ぎざぎざに曲がる。電光スパイラル: 相手のまわりを うずまきのように回りながら近づく
        const md = st === 'spiral' ? angleTo(f, o) + (1.3 * (1 - run / tech.duration) + 0.2) * (a.zig ?? 1) : zippy ? a.dir + zz(C.zipp.spinZig) * C.zipp.zigAng : a.dir;
        const ms = st === 'spiral' ? tech.speed * 1.35 : zippy ? tech.speed / Math.cos(C.zipp.zigAng) : tech.speed;
        // ぽよんスパイラル: 回りながら まわりに しずくを飛ばす
        if (st === 'droplets' && run >= a.next) {
          a.next = run + 0.22;
          for (let k = 0; k < 4; k++) {
            const ang = run * 7 + (k * Math.PI) / 2;
            b.seq++;
            b.shots.push({ id: b.seq, owner: f.side, tech: a.id, x: f.x + Math.cos(ang) * 0.8, y: 0.6, z: f.z + Math.sin(ang) * 0.8, vx: Math.cos(ang) * 9, vz: Math.sin(ang) * 9, r: 0.3, t: 0, alive: true, part: 0.3, life: 0.5 });
          }
        }
        f.face = md;
        f.x += Math.cos(md) * ms * dt;
        f.z += Math.sin(md) * ms * dt;
        if (dist(f, o) < C.body.minGap + 0.3 && yOk(b, f, o, 1.2)) {
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
          const md = zippy ? a.dir + zz(C.zipp.zig) * C.zipp.zigAng : a.dir;
          const ms = zippy ? tech.speed / Math.cos(C.zipp.zigAng) : tech.speed;
          f.face = md;
          f.x += Math.cos(md) * ms * dt;
          f.z += Math.sin(md) * ms * dt;
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
          a.next = a.t + tech.duration * (zippy ? 1.6 : 1);
          // ZIPP: 1発ごとに 相手のまわりへ 一瞬で回りこむ(右・左・正面・うしろ)【仮】
          if (zippy && o.act.k !== 'ko' && dist(f, o) < C.combo.reach + 0.6) {
            const side = [1.25, -1.25, 0, Math.PI][(a.n - 1) % 4];
            const ang = angleTo(o, f) + side;
            const [nx, nz] = clampField(b, o.x + Math.cos(ang) * C.zipp.blink, o.z + Math.sin(ang) * C.zipp.blink);
            if (!b.arena || !insideObstacle(b.arena, nx, nz, C.body.radius)) {
              b.events.push({ kind: 'blink', side: f.side, x0: f.x, z0: f.z, x: nx, z: nz });
              f.x = nx;
              f.z = nz;
            }
          }
          f.face = angleTo(f, o);
          if (dist(f, o) < C.combo.reach + 0.6 && yOk(b, f, o, 1.2)) {
            b.events.push({ kind: 'comboHit', side: f.side, n: a.n });
            const ok = hit(b, f, o, a.id, (f.x + o.x) / 2, 0.8, (f.z + o.z) / 2, f.face, { last: a.n >= tech.hits, part: tech.hits === 4 ? C.combo4[a.n - 1] : 1 / tech.hits });
            // 挟撃スナップ: さいごに はさんだまま 自分のうしろへ 投げ飛ばす
            if (ok && st === 'snapThrow' && a.n >= tech.hits && o.act.k !== 'ko') {
              const back = f.face + Math.PI;
              const [tx, tz] = clampField(b, f.x + Math.cos(back) * 2.2, f.z + Math.sin(back) * 2.2);
              if (!b.arena || !insideObstacle(b.arena, tx, tz, C.body.radius)) {
                o.x = tx;
                o.z = tz;
              }
              o.vy = Math.max(o.vy, 6);
              o.y = Math.max(o.y, 0.001);
              o.kvx = Math.cos(back) * 2 * C.hurt.friction;
              o.kvz = Math.sin(back) * 2 * C.hurt.friction;
              o.act = { k: 'air', t: 0 };
              b.events.push({ kind: 'impact', side: f.side, tech: a.id, x: tx, z: tz, r: 1 });
            }
          } else a.n = tech.hits; // 相手がはなれたら終わり
        }
        return;
      }
      a.hit = true;
      break;
    }
    case 'jab': {
      // 通常攻撃: その場で前へパンチ。当たったら続けて3連まで(外れたら そこで終わり)。空中でも出せる
      // 進化した通常攻撃: 打ちながら少し前へ出る(近すぎるときは出ない)
      const mv = f.jab.moves && C.monMove[f.jab.moves[a.hit ? a.n - 1 : a.n]];
      if (mv) {
        // 新しい5体: 当たるまで 相手へ とびこむ
        if (!a.hit && (mv.step < 0 || dist(f, o) > C.body.minGap + 0.1)) {
          const v = (mv.step / (mv.d * 0.45)) * dt;
          f.x += Math.cos(f.face) * v;
          f.z += Math.sin(f.face) * v;
          // 横へ とぶ(爪は 右・左へ)
          if (mv.side) {
            const sv = (mv.side / (mv.d * 0.45)) * dt;
            f.x += Math.cos(f.face + Math.PI / 2) * sv;
            f.z += Math.sin(f.face + Math.PI / 2) * sv;
            f.face = angleTo(f, o);
          }
          // とび上がる(頭突き)
          if (mv.hop && f.species === 'vybe' && a.len === undefined && f.y <= 0) {
            a.len = 1;
            f.vy = mv.hop;
            f.y = 0.001;
          }
        }
      } else if ((!a.hit || a.t < a.next) && f.jab.step > 0 && f.y <= 0 && dist(f, o) > C.body.minGap + 0.1) {
        const v = (f.jab.step / tech.duration) * dt;
        f.x += Math.cos(f.face) * v;
        f.z += Math.sin(f.face) * v;
      }
      if (!a.hit && a.t >= a.next) {
        const reach = f.jab.range + C.body.radius;
        const ok = dist(f, o) < reach && los(b, f, o, f.y + 0.8) && Math.abs(angDiff(angleTo(f, o), f.face)) < (f.jab.whip ? 0.6 : 0.9) && Math.abs(o.y - f.y) < 1.3;
        a.n++;
        a.next = a.t + (mv ? mv.d * 0.55 : tech.duration);
        b.events.push({ kind: 'comboHit', side: f.side, n: a.n });
        const parts = f.jab.parts;
        // しめ: コンボの さいごの1発(BUNK・MOFU・新しい5体)は 大きく ふっとばす
        const fin = ok && a.n >= parts.length && !!C.powerMoves[f.species] && (o.act.k === 'hurt' || o.act.k === 'air') && o.comboN + 1 >= C.finish.minCombo;
        const jabHit = ok && hit(b, f, o, a.id, (f.x + o.x) / 2, f.y + 0.8, (f.z + o.z) / 2, f.face, { last: a.n >= parts.length, part: parts[a.n - 1] * (fin ? C.finish.part : 1), stun: mv ? C.monStun : undefined, launch: fin ? C.finish.launch : undefined, knock: fin ? C.finish.knock : undefined });
        if (jabHit && fin) b.events.push({ kind: 'finish', side: f.side, x: o.x, y: o.y + 0.8, z: o.z });
        // 獣性ブースト中: 通常攻撃が 炎(やけど)
        if (jabHit && b.t < (f.fireJabUntil ?? 0)) {
          b.events.push({ kind: 'beastFx', side: f.side, fx: 'flameBurst', mv: 'bite', x: (f.x + o.x) / 2, z: (f.z + o.z) / 2, dir: f.face, hit: true, tech: a.id });
          if (b.rng() < 0.35) setEffect(b, o, 'やけど');
        }
        // 1回押すと1発だけ(つづきは もう一度 押す。2026-11-04 企画者)
        f.jabChainUntil = b.t + tech.duration + C.chain.press;
        {
          a.hit = true;
          // 最終進化: さいごの1発で、グローブから小さい火の玉が飛ぶ
          if (f.jab.fire >= 2 && a.n >= parts.length) {
            const ft = getTech('punchFire');
            b.seq++;
            b.shots.push({ id: b.seq, owner: f.side, tech: 'punchFire', x: f.x + Math.cos(f.face) * 1.0, y: f.y + 0.8, z: f.z + Math.sin(f.face) * 1.0, vx: Math.cos(f.face) * ft.speed, vz: Math.sin(f.face) * ft.speed, r: ft.size, t: 0, alive: true });
          }
        }
      }
      if (a.hit && a.t >= a.next + (a.n >= f.jab.parts.length ? tech.recovery : C.chain.gap)) {
        f.act = { k: 'free' };
        // ボタンを 押しつづけている: ためる(はなすと 強い1発)
        const pm = C.powerMoves[f.species];
        if (pm && f.pad && f.hold && (f.holdT ?? 0) >= C.power.hold && f.y <= 0) {
          f.act = { k: 'tech', id: a.id, t: 0, dir: f.face, fired: false, hit: false, tx: o.x, tz: o.z, windup: C.power.max, n: 0, next: 0, sp: 'charge', mv: pm[0], charge: 0 };
          f.jabChain = 0;
        }
      }
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
          if (st === 'tripleWave') {
            // ぽよん三重波: ばいん ばいん と 3回はねて、波の輪が3つ(1つずつは 弱め)
            for (let k = 0; k < 3; k++) b.quakes.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.3, hit: false, start: b.t + k * 0.35, power: tech.power * 0.45 });
          } else b.quakes.push({ owner: f.side, tech: a.id, x: f.x, z: f.z, r: 0.3, hit: false });
          b.events.push({ kind: 'quake', side: f.side, x: f.x, z: f.z, tech: a.id });
        } else {
          f.vx = f.vz = 0;
          const dr = tech.size * (st === 'bigPress' ? 1.3 : 1);
          b.events.push({ kind: 'impact', side: f.side, tech: a.id, x: f.x, z: f.z, r: dr });
          if (st === 'multiBounce' && a.n < 2) {
            // ぷにバウンド: 小さく はねながら 相手へ(3回。着地のたびに当たる)
            if (dist(f, o) < dr + C.body.radius && (o.y < 0.6 || floating(o))) hit(b, f, o, a.id, o.x, 0.5, o.z, angleTo(f, o), { last: false, part: 0.4 });
            a.n++;
            a.hit = false;
            const jump = C.drop.jump * 0.6;
            const air = (2 * jump) / C.gravity;
            const [tx, tz] = clampField(b, o.x, o.z);
            f.vy = jump;
            f.y = 0.001;
            f.vx = (tx - f.x) / air;
            f.vz = (tz - f.z) / air;
            b.events.push({ kind: 'mark', side: f.side, x: tx, z: tz, r: dr, until: b.t + air });
            return;
          }
          if (dist(f, o) < dr + C.body.radius && (o.y < 0.6 || floating(o))) hit(b, f, o, a.id, o.x, 0.5, o.z, angleTo(f, o), st === 'multiBounce' ? { part: 0.6 } : {});
          else b.events.push({ kind: 'evaded', side: o.side });
          // 重甲クラッシュ: 着地すると 前へ 地割れが走る(3か所 順番に 岩が つき出る)
          if (st === 'crackLine') {
            const dir = angleTo(f, o);
            const pw = C.style.strike[tech.strength] ?? 16;
            for (let k = 0; k < 3; k++) addStrike(b, f, a.id, f.x + Math.cos(dir) * (1.8 + k * 1.5), f.z + Math.sin(dir) * (1.8 + k * 1.5), 0.85, b.t + 0.12 + k * 0.12, 'rock', pw * 0.22);
          }
        }
      }
      break;
    default:
      break;
  }
  const extra = tech.kind === 'beam' || tech.kind === 'barrier' || tech.kind === 'heal' ? tech.duration : tech.kind === 'barrage' ? C.barrage.gap * C.barrage.count : 0;
  const move = tech.kind === 'rush' ? tech.range / tech.speed : 0;
  if (a.hit || tech.kind === 'shot' || tech.kind === 'barrage' || tech.kind === 'beam' || tech.kind === 'barrier' || tech.kind === 'debuff' || tech.kind === 'field' || tech.kind === 'pillar' || tech.kind === 'heal' || tech.kind === 'buff' || tech.kind === 'drain') {
    if (a.t >= a.windup + extra + tech.recovery + (a.hit ? 0 : move) && f.y <= 0) f.act = { k: 'free' };
    else if (tech.kind === 'rush' && a.hit && run >= tech.recovery && f.y <= 0 && a.t >= a.windup + tech.recovery) f.act = { k: 'free' };
  }
}

/**
 * 頑丈ドームの反撃(2026-11-02 企画者「相手の技や攻撃受けたら爆発が起きて反撃できるように」)。
 * 守りのドームが攻撃を受けると、ドームが はじけて衝撃波が広がる(ドームはそこで終わり)。近くの相手に当たる(ジャンプでよけられる)
 */
/**
 * 通常攻撃(種族・形態で変わる)。火の粉・火の玉は BUNK だけ。
 * MOFU は ツルのムチ(中くらいの距離までとどく。2026-11-03 企画者「ツルの鞭みたいな中距離射程の攻撃」。
 * その前の「ちょっこりタックル」から変えた)。遠くまでとどくぶん、ダメージは BUNK のパンチより少し低い【仮】
 */
function jabFor(e: AnimeEntrant): AnimeMon['jab'] {
  const form = Math.max(1, Math.min(3, e.form ?? 1));
  if (e.species === 'mofu') return { ...C.whipByForm[form - 1], step: 0, fire: 0, whip: true };
  // ZIPP は ためる電撃ダッシュ(2026-11-03 企画者)
  if (e.species === 'zipp') return { parts: [1], range: 1.2, step: 0, fire: 0, dash: form };
  // PUNI は 水の玉(遠くから1発)・KLAK は はさみトラップ(前に罠を置く)(2026-11-03 企画者)
  if (e.species === 'puni') return { parts: [1], range: C.puniShot.byForm[form - 1].range, step: 0, fire: 0, water: form };
  if (e.species === 'klak') return { parts: [1], range: C.klakTrap.ahead, step: 0, fire: 0, trap: form };
  // 新しい5体: 種族ごとの 爪・かみつき・頭突き など(2026-11-05)
  const mj = C.monJab[e.species]?.[form - 1];
  if (mj) return { parts: mj.parts, range: mj.range, step: 0, fire: 0, moves: mj.moves };
  const j = { ...C.jabByForm[form - 1] };
  if (e.species !== 'bunk') j.fire = 0;
  return j;
}

/** 強化の技が何を上げるか(技の名前で決める。ない技は攻撃)【案】 */
const BUFF_WHAT: Record<string, 'atk' | 'def' | 'speed' | 'both'> = {
  // 2026-11-05 新しい5体(攻撃の速さアップ は 速さ に。攻撃と守り は 両方)【仮】
  獣性ブースト: 'atk', 踏ん張り: 'def', 甲羅こもり: 'def', 黒鱗: 'speed', 電気のリズム: 'speed', 親分の意地: 'both',
  もりの息吹: 'def', アイアンボディ: 'def', グランドアンカー: 'def', 残光ステップ: 'speed', 超弾性チャージ: 'atk', ヒートロア: 'atk', レイジブースト: 'atk', 帯電チャージ: 'atk' };
/** 自分の まわりに置く場(中にいると自分が回復・守られる)の技 */
const SELF_FIELD = SELF_FIELD_TECHS;

/** 回復(1試合の上限まで) */
function healMon(b: AnimeBattle, f: AnimeMon, amount: number, why: '回復' | '吸収' | '場'): void {
  const room = Math.max(0, Math.round(f.maxHp * C.heal.cap) - f.healed);
  const n = Math.min(Math.round(amount), room, f.maxHp - f.hp);
  if (n <= 0 || f.act.k === 'ko') return;
  f.hp += n;
  f.healed += n;
  b.events.push({ kind: 'heal', side: f.side, amount: n, why });
}

/** 今、攻撃が当たらないか(たおれている・起きた直後・受け身のあと・よけている瞬間)。hit() と同じ決まり。見た目で分かるように使う(2026-11-02 企画者) */
export function isInvincible(b: AnimeBattle, f: AnimeMon): boolean {
  return b.t < f.safeUntil || f.act.k === 'down' || (f.act.k === 'dodge' && f.act.t < C.dodge.invincible);
}

/** とくべつな動きの名前(技の名前から) */
const styleOf = (id: TechId): string | undefined => C.techStyle[id];

/** ガードを始める(量が少なすぎる時は できない) */
function startGuard(b: AnimeBattle, f: AnimeMon, until: number, ai = false): boolean {
  if (f.guardGauge < C.guard.max * 0.1) return false;
  // CPU は ぎりぎりで ガードするので、そのままだと いつも ジャストガードになる → ジャストは うまさ「守り」の確率だけ
  const just = !ai || b.rng() < lerp(C.skill.just, lv(f, 'defense'));
  f.act = { k: 'guard', t: just ? 0 : C.guard.just, until };
  f.vx *= 0.3;
  f.vz *= 0.3;
  b.events.push({ kind: 'guard', side: f.side });
  return true;
}

/** ガードが こわれる(量が0): しばらく動けない */
function guardBreak(b: AnimeBattle, f: AnimeMon): void {
  f.guardGauge = 0;
  f.guardRegenAt = b.t + C.guard.regenDelay * 2;
  f.act = { k: 'hurt', t: 0, until: C.guard.breakStun };
  b.events.push({ kind: 'guardBreak', side: f.side });
}

/** 投げ・はさむ技は ガードできない(企画者に出した案「ガードは投げや罠でくずれる」) */
const UNBLOCKABLE = new Set(['snapThrow', 'flankClamp']);

/**
 * 守りが攻撃を受け止めた時(2026-11-03): ふつうは ドームが はじけて反撃(頑丈ドーム)。
 * 帯電シールド: 近くの相手が しびれる。ぷにぷに防壁(弾は はね返す)・万象ぷにドーム(ためて あとで反撃): はじけない
 */
function guardReact(b: AnimeBattle, o: AnimeMon, from: AnimeMon | null): void {
  const st = o.barrierTech ? styleOf(o.barrierTech) : undefined;
  if (st === 'absorbCounter') {
    // 受け止めて ためる → 少しあとに はじけて 反撃(受け止めた数だけ強い)
    o.absorbN = (o.absorbN ?? 0) + 1;
    o.barrierUntil = Math.min(o.barrierUntil, b.t + 0.6);
    return;
  }
  if (st === 'reflect') return;
  if (st === 'rockBurst') {
    // 岩鉄ボディ: 受けた力を 地面へ → 自分の まわりに 衝撃波(1回)
    b.quakes.push({ owner: o.side, tech: 'domeBurst', x: o.x, z: o.z, r: 0.3, hit: false, power: 12 });
    b.events.push({ kind: 'beastFx', side: o.side, fx: 'stomp', mv: 'clawR', x: o.x, z: o.z, dir: o.face, hit: false, tech: o.barrierTech ?? 'punch' });
    o.barrierUntil = b.t;
    return;
  }
  if (st === 'thorns') {
    // 鉄甲羅: トゲの甲羅。近くで 攻撃した相手が いたい(ドームは そのまま)
    if (from && dist(from, o) < 3 && from.act.k !== 'ko' && b.t >= (o.absorbN ?? 0)) {
      o.absorbN = b.t + 0.4;
      hit(b, o, from, o.barrierTech ?? 'klakTrap', (o.x + from.x) / 2, 0.8, (o.z + from.z) / 2, angleTo(o, from), { power: 8, knock: 2.5, launch: 0 });
    }
    return;
  }
  if (st === 'shed' && from) {
    // 鱗の膜: 脱皮して うしろへ にげる(抜け殻が のこる)
    const g = angleTo(from, o);
    b.events.push({ kind: 'beastFx', side: o.side, fx: 'shadow', mv: 'tail', x: o.x, z: o.z, dir: g, hit: false, tech: o.barrierTech ?? 'punch' });
    [o.x, o.z] = clampField(b, o.x + Math.cos(g) * 3.2, o.z + Math.sin(g) * 3.2);
    o.barrierUntil = b.t;
    o.safeUntil = Math.max(o.safeUntil, b.t + 0.4);
    return;
  }
  if (st === 'evadeCounter' && from) {
    // 見切りの影: 影になって 相手の うしろへ 回りこみ、かみつく
    const g = angleTo(from, o);
    [o.x, o.z] = clampField(b, from.x - Math.cos(g) * (C.body.minGap + 0.3), from.z - Math.sin(g) * (C.body.minGap + 0.3));
    o.face = angleTo(o, from);
    o.barrierUntil = b.t;
    o.safeUntil = Math.max(o.safeUntil, b.t + 0.3);
    b.events.push({ kind: 'beastFx', side: o.side, fx: 'darkBite', mv: 'bite', x: (o.x + from.x) / 2, z: (o.z + from.z) / 2, dir: o.face, hit: true, tech: o.barrierTech ?? 'punch' });
    hit(b, o, from, o.barrierTech ?? 'klakTrap', (o.x + from.x) / 2, 0.8, (o.z + from.z) / 2, o.face, { power: 14, unblockable: true });
    return;
  }
  if (st === 'shockCoat') {
    // 放電コート: 近くで 攻撃した相手が まひ(ドームは そのまま)
    if (from && dist(from, o) < 3.5 && from.act.k !== 'ko' && b.rng() < 0.6) setEffect(b, from, 'まひ');
    return;
  }
  if (st === 'burnShield') {
    // 炎たてがみガード: 近くで 攻撃した相手が やけど(ドームは そのまま)
    if (from && dist(from, o) < 3.5 && from.act.k !== 'ko' && b.rng() < 0.6) setEffect(b, from, 'やけど');
    return;
  }
  if (st === 'jellyBounce') {
    // ぷるんガード: ぷるんと ゆれて、近くで攻撃した相手を はね飛ばす(膜は そのまま)
    if (from && dist(from, o) < 3.5 && from.act.k !== 'ko') {
      const d = angleTo(o, from);
      from.kvx = Math.cos(d) * 3 * C.hurt.friction;
      from.kvz = Math.sin(d) * 3 * C.hurt.friction;
      from.act = { k: 'hurt', t: 0, until: 0.35 };
    }
    return;
  }
  if (st === 'clampCounter') {
    // 鋏盾クランプ: はさみの盾で受けて、近くの相手を その場で はさみ返す
    if (from && dist(from, o) < 2.8 && from.act.k !== 'ko' && b.t >= (o.absorbN ?? 0)) {
      o.absorbN = b.t + 0.5;
      hit(b, o, from, o.barrierTech ?? 'klakTrap', (o.x + from.x) / 2, 0.8, (o.z + from.z) / 2, angleTo(o, from), { power: 9 });
    }
    return;
  }
  if (st === 'zapShield') {
    if (from && dist(from, o) < 3.5 && from.act.k !== 'ko' && b.rng() < 0.5) setEffect(b, from, 'まひ');
    b.events.push({ kind: 'domeBurst', side: o.side, x: o.x, z: o.z });
    o.barrierUntil = b.t;
    return;
  }
  domeBurst(b, o);
}

/** 予告のあと その場所に 落ちる・立つ攻撃(落雷・光の杭・光の砲撃)を足す。g が同じものは まとめて1回だけ当たる */
function addStrike(b: AnimeBattle, f: AnimeMon, id: TechId, x: number, z: number, r: number, at: number, look: Pillar['look'], power: number, g?: number, follow?: number): number {
  b.seq++;
  const gg = g ?? b.seq;
  const [cx, cz] = clampField(b, x, z);
  b.pillars.push({ owner: f.side, tech: id, g: gg, x: cx, z: cz, r, at, up: false, look, power, follow });
  return gg;
}

/** 場の中にいるか(円・十字・線) */
function inField(fl: Field, p: { x: number; z: number }): boolean {
  if (fl.shape === 'line' && fl.x2 !== undefined && fl.z2 !== undefined) {
    const dx = fl.x2 - fl.x;
    const dz = fl.z2 - fl.z;
    const L = Math.hypot(dx, dz) || 1;
    const t = clamp(((p.x - fl.x) * dx + (p.z - fl.z) * dz) / (L * L), 0, 1);
    return Math.hypot(p.x - (fl.x + dx * t), p.z - (fl.z + dz * t)) < fl.r;
  }
  if (fl.shape === 'cross') {
    const c = Math.cos(-(fl.rot ?? 0));
    const sn = Math.sin(-(fl.rot ?? 0));
    const lx = (p.x - fl.x) * c - (p.z - fl.z) * sn;
    const lz = (p.x - fl.x) * sn + (p.z - fl.z) * c;
    const w = 0.55;
    return (Math.abs(lx) < fl.r && Math.abs(lz) < w) || (Math.abs(lz) < fl.r && Math.abs(lx) < w);
  }
  return dist(fl, p) < fl.r;
}

function domeBurst(b: AnimeBattle, f: AnimeMon): void {
  if (b.t >= f.barrierUntil) return;
  f.barrierUntil = b.t;
  b.quakes.push({ owner: f.side, tech: 'domeBurst', x: f.x, z: f.z, r: f.barrierR, hit: false });
  b.events.push({ kind: 'domeBurst', side: f.side, x: f.x, z: f.z });
}

/** 追加効果をかける(当たり・場・弱体から)。ねむりになったら true */
function setEffect(b: AnimeBattle, o: AnimeMon, effect: Effect, big = false): boolean {
  let ok = true;
  let sleep = false;
  if (effect === 'ふらつき') o.dizzyUntil = b.t + C.status.dizzy;
  else if (effect === 'まひ') o.paraUntil = b.t + C.status.para;
  else if (effect === '遅くする') o.slowUntil = b.t + C.gfield.time;
  else if (effect === '攻撃ダウン') o.atkDownUntil = b.t + C.debuff.time;
  else if (effect === '防御ダウン') o.defDownUntil = b.t + C.defDown.time;
  else if (effect === 'やけど') {
    if (b.t >= o.burnUntil) o.burnTick = b.t + C.burn.every;
    o.burnUntil = b.t + C.burn.time;
  } else if (effect === 'どく') {
    if (b.t >= o.poisonUntil) o.poisonTick = b.t + C.poison.every;
    o.poisonUntil = b.t + C.poison.time;
  } else if (effect === 'ねむり') {
    ok = !big && b.t >= o.sleepSafeUntil && o.act.k !== 'down' && o.act.k !== 'air';
    if (ok) {
      sleep = true;
      o.sleepUntil = b.t + C.sleep.time;
      o.sleepSafeUntil = b.t + C.sleep.time + C.sleep.immune;
    }
  } else ok = false;
  if (ok) b.events.push({ kind: 'status', side: o.side, effect });
  return sleep;
}

/** 場・弱体から追加効果(かかる確率 = 技の強さの確率 × k)。ねむりは その場で動けなくする */
function applyEffect(b: AnimeBattle, o: AnimeMon, tech: ReturnType<typeof getTech>, k: number): void {
  if (o.act.k === 'ko' || b.t < o.safeUntil || o.act.k === 'down') return;
  if (b.rng() >= EFFECT_CHANCE[tech.strength] * k) return;
  if (setEffect(b, o, tech.effect)) o.act = { k: 'hurt', t: 0, until: C.sleep.time };
}

/** 当たり → ダメージ・吹っ飛び */
function hit(b: AnimeBattle, f: AnimeMon, o: AnimeMon, id: TechId, x: number, y: number, z: number, dir: number, opt: { last?: boolean; part?: number; power?: number; unblockable?: boolean; stun?: number; launch?: number; knock?: number; juggle?: boolean } = {}): boolean {
  if (o.act.k === 'ko' || o.act.k === 'victory') return false;
  if (b.t < o.safeUntil || o.act.k === 'down') return false;
  // 守りのドームの中 → 止める
  if (b.t < o.barrierUntil) {
    b.events.push({ kind: 'blocked', side: o.side, x, y, z });
    guardReact(b, o, f);
    return false;
  }
  if (o.act.k === 'dodge' && o.act.t < C.dodge.invincible) {
    evaded(b, o);
    return false;
  }
  // カウンター(よけた・ジャストガードの あとの 攻撃)は ガードできない
  const counter = f.act.k === 'tech' && !!f.act.counter && f.act.id === id;
  if (counter && f.act.k === 'tech') f.act.counter = false;
  // ガード: ジャストガード(始めてすぐ)は ダメージなしで すぐ動ける。ふつうは 少しだけ ダメージ・量がへる
  const guarded = o.act.k === 'guard' && !opt.unblockable && !counter && !UNBLOCKABLE.has(styleOf(id) ?? '');
  if (guarded && o.act.k === 'guard' && o.act.t < C.guard.just) {
    o.act = { k: 'free' };
    o.safeUntil = b.t + 0.15;
    b.events.push({ kind: 'guardHit', side: o.side, x, y, z, damage: 0, just: true });
    b.events.push({ kind: 'counterReady', side: o.side, why: 'just' });
    o.counterUntil = b.t + C.counter.just;
    return false;
  }
  const tech = getTech(id);
  const launch = opt.launch ?? tech.launch;
  const part = opt.part ?? 1;
  // ねむっている時に攻撃を受けると起きる。起こした攻撃では ふっとばない(ねむり＋ふっとびで長く動けなくならないように 2026-11-03)
  const wasAsleep = o.sleepUntil > 0 && b.t < o.sleepUntil + 0.3;
  const wasFloating = floating(o);
  if (b.t < o.sleepUntil) o.sleepUntil = b.t;
  // テクニックが高いと、クリティカル(1.4倍)が出やすい
  const crit = b.rng() < Math.min(0.3, f.stats.tech / C.stat.techCritDiv);
  // 攻撃ダウン中は、与えるダメージが下がる
  const down = (b.t < f.atkDownUntil ? C.debuff.atkDown : 1) * (b.t < o.defDownUntil ? C.defDown.mul : 1);
  // 強化(攻撃アップ・守りアップ)と、自分の場(千花天幕)の中
  const up = (b.t < f.atkUpUntil ? 1 + f.atkUp : 1) * (b.t < o.defUpUntil ? 1 - o.defUp : 1) * (b.fields.some((fl) => fl.self && fl.owner === o.side && dist(fl, o) < fl.r) ? C.selfField.guard : 1);
  let dmg = Math.max(1, Math.round(up * down * (crit ? C.stat.critMul : 1) * (opt.power ?? tech.power) * part * (part < 1 ? C.combo.bonus : 1) * (1 + f.stats.power / C.stat.powerDiv) * (C.stat.toughDiv / (C.stat.toughDiv + o.stats.tough)) * (0.9 + b.rng() * 0.2)));
  if (counter) dmg = Math.round(dmg * C.counter.mul);
  // 種族の 強さ(GRIT は 1発が 重い)
  if (C.speciesPower[f.species]) dmg = Math.round(dmg * C.speciesPower[f.species]);
  // コンボの数: やられている間(ふっとび中も)に 続けて当たると 数える。長いほど 1発が弱くなる(2026-11-04 企画者)
  const inCombo = (o.act.k === 'hurt' || o.act.k === 'air') && b.t - o.comboLast < C.chain.reset;
  const comboN = guarded ? 0 : inCombo ? o.comboN + 1 : 1;
  if (!guarded) {
    dmg = Math.max(1, Math.round(dmg * Math.max(C.chain.scaleMin, 1 - C.chain.scaleStep * (comboN - 1))));
    if (comboN === 1) o.comboStart = b.t;
    o.comboN = comboN;
    o.comboLast = b.t;
  }
  if (guarded) {
    // ふっとばす重い技は ガードの上からでも 強い(ガードの量が大きく へる・押される)
    const heavy = launch > 0 ? 1 + launch / 6 : 1;
    const chipDmg = Math.max(1, Math.round(dmg * C.guard.chip));
    if (o.hp - chipDmg > 0) {
      o.hp -= chipDmg;
      o.guardGauge -= dmg * C.guard.drainMul * heavy;
      if (heavy > 1) {
        o.kvx += Math.cos(dir) * tech.knock * (opt.knock ?? 1) * C.hurt.friction * 0.25;
        o.kvz += Math.sin(dir) * tech.knock * (opt.knock ?? 1) * C.hurt.friction * 0.25;
      }
      o.guardRegenAt = b.t + C.guard.regenDelay;
      o.kvx += Math.cos(dir) * 0.6 * C.hurt.friction * 0.35;
      o.kvz += Math.sin(dir) * 0.6 * C.hurt.friction * 0.35;
      b.events.push({ kind: 'guardHit', side: o.side, x, y, z, damage: chipDmg, just: false });
      if (o.guardGauge <= 0) guardBreak(b, o);
      return true;
    }
    dmg = chipDmg;
  }
  // 体を固めている(GRIT の 頑固ガード など): ダメージ 少なめ・ひるまない・押されない
  const armored = b.t < (o.armorUntil ?? 0) && o.act.k !== 'air';
  if (armored) dmg = Math.max(1, Math.round(dmg * 0.6));
  o.hp = Math.max(0, o.hp - dmg);
  const finish = opt.last ?? true;
  // 通常攻撃(パンチの連打)は、さいごの1発だけ押す(とちゅうで とどかなくならないように)
  const knock = (armored ? 0 : 1) * tech.knock * (opt.knock ?? 1) * (finish ? 1 : tech.kind === 'jab' ? 0 : 0.25) * (b.t < (f.knockUpUntil ?? 0) ? 1.7 : 1);
  o.kvx += Math.cos(dir) * knock * C.hurt.friction * 0.35;
  o.kvz += Math.sin(dir) * knock * C.hurt.friction * 0.35;
  o.command = null;
  o.face = angleTo(o, f);
  const big = launch > 0 && finish && !wasAsleep && !armored;
  b.events.push({ kind: 'hit', side: f.side, target: o.side, tech: id, damage: dmg, x, y, z, big, crit, counter });
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
  if (armored) {
    b.events.push({ kind: 'guardHit', side: o.side, x, y, z, damage: dmg, just: false });
    return true;
  }
  // 追加効果(ふらつき・まひ・やけど・どく・ねむり。こおりは【未実装】)
  let sleep = false;
  if (finish && tech.effect !== 'なし' && b.rng() < EFFECT_CHANCE[tech.strength] + Math.min(0.25, f.stats.tech / C.stat.techEffectDiv)) sleep = setEffect(b, o, tech.effect, big);
  // ふっとばした・追い打ち・浮いている相手に 当てた: しばらく ふわっと ゆっくり落ちる(追い打ち・技から技へ つなぎやすく 2026-11-05)
  if (big || opt.juggle || wasFloating) o.floatUntil = b.t + C.juggle.floatTime;
  if (wasFloating || opt.juggle) f.airHitT = b.t;
  if (!opt.juggle && !big && wasFloating && o.act.k === 'air') {
    // 浮いている相手に 技が 当たった: 浮いたまま 少し 上へ
    o.vy = Math.max(o.vy, C.juggle.techPop);
    o.act = { k: 'air', t: 0 };
  } else if (opt.juggle && (o.act.k === 'air' || o.y > 0.3)) {
    // 空中の 追い打ち: 少し 浮く(ふっとんだ まま)
    o.vy = Math.max(o.vy, C.juggle.pop);
    o.y = Math.max(o.y, 0.001);
    o.act = { k: 'air', t: 0 };
  } else if (big) {
    o.vy = launch;
    o.y = Math.max(o.y, 0.001);
    o.act = { k: 'air', t: 0 };
  } else {
    // 長いコンボほど ひるむ時間が短い(ぬけやすい)
    const decay = Math.max(C.chain.stunMin, 1 - C.chain.stunStep * Math.max(0, comboN - 7));
    o.act = { k: 'hurt', t: 0, until: sleep ? C.sleep.time : (finish ? C.hurt.stun : opt.stun ?? C.combo.stun) * decay * (counter ? C.counter.stun : 1) };
  }
  if (comboN >= 2) b.events.push({ kind: 'combo', side: f.side, n: comboN });
  // 長すぎるコンボは 必ず ぬけられる(少しのあいだ 当たらない)
  if (comboN >= C.chain.breakHits) breakCombo(b, o);
  return true;
}

// ---------------- 弾・ビーム・衝撃波 ----------------

function updateProjectiles(b: AnimeBattle, dt: number): void {
  const H = C.field;
  for (const s of b.shots) {
    if (!s.alive) continue;
    s.t += dt;
    const foe = b.f[s.owner === 0 ? 1 : 0];
    // 千機包囲網の砲台: 動き出すまで、相手を ねらって待つ
    if (s.wait !== undefined && s.t < s.wait) {
      const d = Math.atan2(foe.z - s.z, foe.x - s.x);
      const sp = Math.hypot(s.vx, s.vz);
      s.vx = Math.cos(d) * sp;
      s.vz = Math.sin(d) * sp;
      continue;
    }
    // 追いかける弾(閃電三連・ぷに分裂弾): 少しずつ 相手のほうへ曲がる
    if (s.home && s.t < 1.4) {
      const sp = Math.hypot(s.vx, s.vz);
      const cur = Math.atan2(s.vz, s.vx);
      const nd = cur + clamp(angDiff(Math.atan2(foe.z - s.z, foe.x - s.x), cur), -s.home * dt, s.home * dt);
      s.vx = Math.cos(nd) * sp;
      s.vz = Math.sin(nd) * sp;
    }
    // 時限ボム: 止まる所まで ころがる → 止まって 少しあとに 爆発
    if (s.stop !== undefined && s.fuse === undefined) {
      s.stop -= Math.hypot(s.vx, s.vz) * dt;
      if (s.stop <= 0) {
        s.vx = s.vz = 0;
        s.fuse = b.t + C.style.bombFuse;
      }
    }
    if (s.fuse !== undefined && b.t >= s.fuse) {
      s.alive = false;
      b.events.push({ kind: 'explode', x: s.x, y: 0.5, z: s.z, tech: s.tech, big: true });
      b.events.push({ kind: 'impact', side: s.owner, tech: s.tech, x: s.x, z: s.z, r: C.style.bombR });
      if (dist(s, foe) < C.style.bombR + C.body.radius && (foe.y < 1 || floating(foe)) && los(b, s, foe, 0.4)) hit(b, b.f[s.owner], foe, s.tech, foe.x, 0.5, foe.z, angleTo(s, foe));
      continue;
    }
    const px = s.x;
    const pz = s.z;
    s.x += s.vx * dt;
    if (s.grow) s.r += s.grow * dt;
    if (b.fields.some((fl) => fl.wall && fl.owner !== s.owner && inField(fl, s))) {
      s.alive = false;
      b.events.push({ kind: 'explode', x: s.x, y: s.y, z: s.z, tech: s.tech, big: false });
    }
    s.z += s.vz * dt;
    // 浮いている相手へ 向かう弾は 上へも ねらう(2026-11-05 企画者「浮き上がってる時 技もコンボに繋がるよね？」)
    if (s.vy === undefined && floating(foe) && dist(s, foe) < 8) s.y += clamp(foe.y + 0.7 - s.y, -22 * dt, 22 * dt);
    // 山なりの弾: 落ちて、地面で はねる(はねたら 次は はじける)
    if (s.vy !== undefined) {
      s.vy -= C.gravity * 0.8 * dt;
      s.y += s.vy * dt;
      if (s.y < 0.3) {
        if ((s.bounce ?? 0) > 0) {
          s.bounce = (s.bounce ?? 0) - 1;
          s.y = 0.3;
          s.vy = Math.abs(s.vy) * 0.6;
          b.events.push({ kind: 'explode', x: s.x, y: 0.2, z: s.z, tech: s.tech, big: false });
        } else {
          s.alive = false;
          b.events.push({ kind: 'explode', x: s.x, y: 0.2, z: s.z, tech: s.tech, big: false });
          continue;
        }
      }
    }
    if (s.zig) {
      // ZIPP の弾: 進む向きの横へ、ぎざぎざに ゆれる(はじめの半分は片側へ)
      const sg = Math.floor(s.t / C.zipp.shotZigT + 0.5) % 2 ? -1 : 1;
      const n = Math.hypot(s.vx, s.vz) || 1;
      s.x += (-s.vz / n) * sg * C.zipp.shotZig * dt;
      s.z += (s.vx / n) * sg * C.zipp.shotZig * dt;
    }
    // 柱・壁に当たったら、そこで はじける(2026-11-03 ロストテンプル)
    const wh = b.arena ? rayHit(b.arena, px, pz, s.x, s.z, s.y, s.r * 0.6) : null;
    if (wh) {
      s.alive = false;
      b.events.push({ kind: 'explode', x: wh.x, y: s.y, z: wh.z, tech: s.tech, big: false });
      b.events.push({ kind: 'wallHit', x: wh.x, y: s.y, z: wh.z });
      continue;
    }
    const tgt = b.f[s.owner === 0 ? 1 : 0];
    if (b.t < tgt.barrierUntil && dist(s, tgt) < tgt.barrierR + s.r) {
      b.events.push({ kind: 'blocked', side: tgt.side, x: s.x, y: s.y, z: s.z });
      // ぷにぷに防壁: 弾を はね返す(はね返った弾は 相手のもの)
      if (tgt.barrierTech && styleOf(tgt.barrierTech) === 'reflect') {
        s.owner = tgt.side;
        s.vx = -s.vx;
        s.vz = -s.vz;
        s.home = undefined;
        s.t = 0;
        s.x += s.vx * dt * 2;
        s.z += s.vz * dt * 2;
        continue;
      }
      s.alive = false;
      guardReact(b, tgt, b.f[s.owner]);
      continue;
    }
    // 山なりの弾は 上下の当たりを 広めに(頭の上を こえやすいので)
    if (dist(s, tgt) < s.r + C.body.radius && Math.abs(tgt.y + 0.7 - s.y) < (s.vy !== undefined ? 1.8 : 1.2)) {
      const hp0 = tgt.hp;
      const did = hit(b, b.f[s.owner], tgt, s.tech, s.x, s.y, s.z, Math.atan2(s.vz, s.vx), s.part ? { part: s.part } : {});
      // 吸収: 当てたダメージの半分を回復
      // 泡のつぶて: 泡に つつまれて 少し 動けない
      if (did && s.bind && tgt.act.k === 'hurt') {
        tgt.act.until = Math.max(tgt.act.until, s.bind);
        tgt.kvx = tgt.kvz = 0;
      }
      if (did && getTech(s.tech).kind === 'drain') healMon(b, b.f[s.owner], (hp0 - tgt.hp) * C.drain.ratio, '吸収');
      // ぷにっと吸引: 当たった相手を 自分のほうへ 吸いよせる
      if (did && styleOf(s.tech) === 'pull') {
        const ow = b.f[s.owner];
        const d = angleTo(tgt, ow);
        const D = Math.max(0, Math.min(C.style.pullDist, dist(tgt, ow) - C.body.minGap - 0.2));
        tgt.kvx = Math.cos(d) * D * C.hurt.friction;
        tgt.kvz = Math.sin(d) * D * C.hurt.friction;
      }
      if (did) {
        s.alive = false;
        b.events.push({ kind: 'explode', x: s.x, y: s.y, z: s.z, tech: s.tech, big: false });
      }
    }
    const out = b.arena ? Math.hypot(s.x, s.z) > b.arena.radius + 2 : Math.abs(s.x) > H.halfX + 3 || Math.abs(s.z) > H.halfZ + 3;
    if (out || s.t > (s.life ?? (s.tech === 'punchFire' ? C.punchFire.life : 4))) s.alive = false;
  }
  updateTraps(b);
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
    if (beam.track) {
      const tg = b.f[beam.owner === 0 ? 1 : 0];
      beam.dir += clamp(angDiff(angleTo(owner, tg), beam.dir), -beam.track * dt, beam.track * dt);
      owner.face = beam.dir;
    }
    const cos = Math.cos(beam.dir);
    const sin = Math.sin(beam.dir);
    // 柱・壁に当たった所で止まる(2026-11-03 ロストテンプル)
    const bh = b.arena ? rayHit(b.arena, beam.x, beam.z, beam.x + cos * tech.range, beam.z + sin * tech.range, 0.8, 0) : null;
    const prevLen = beam.len;
    beam.len = bh ? bh.t * tech.range : tech.range;
    if (bh && (prevLen === undefined || prevLen > beam.len + 0.3 || beam.t < 0.05)) b.events.push({ kind: 'wallHit', x: bh.x, y: 0.8, z: bh.z });
    const onBeam = (p: { x: number; z: number }, r: number) => {
      const dx = p.x - beam.x;
      const dz = p.z - beam.z;
      const along = dx * cos + dz * sin;
      const side = Math.abs(-dx * sin + dz * cos);
      return along > 0 && along < (beam.len ?? tech.range) && side < tech.size + r;
    };
    // 弾を消す
    for (const s of b.shots)
      if (s.alive && s.owner !== beam.owner && onBeam(s, s.r)) {
        s.alive = false;
        b.events.push({ kind: 'explode', x: s.x, y: s.y, z: s.z, tech: s.tech, big: false });
      }
    const tgt = b.f[beam.owner === 0 ? 1 : 0];
    if (!beam.hit && onBeam(tgt, C.body.radius) && (tgt.y < 1.5 || floating(tgt))) {
      if (hit(b, owner, tgt, beam.tech, tgt.x, 0.8, tgt.z, beam.dir, styleOf(beam.tech) === 'torrent' ? { knock: 3.2, launch: 2 } : {})) {
        beam.hit = true;
        b.events.push({ kind: 'explode', x: tgt.x, y: 0.9, z: tgt.z, tech: beam.tech, big: true });
      }
    }
  }
  b.beams = b.beams.filter((x) => x.t < getTech(x.tech).duration);
  // 衝撃波(輪が広がる。ジャンプ中ならよけられる)
  for (const q of b.quakes) {
    if (q.start !== undefined && b.t < q.start) continue;
    const tech = getTech(q.tech);
    const prev = q.r;
    q.r += tech.speed * dt;
    const tgt = b.f[q.owner === 0 ? 1 : 0];
    const d = dist(q, tgt);
    if (!q.hit && d >= prev - C.body.radius && d <= q.r + C.body.radius) {
      // 柱のうしろにいれば、衝撃波は当たらない
      if (!los(b, q, tgt, 0.3)) q.hit = true;
      else if (tgt.y > 0.5) evaded(b, tgt);
      else if (hit(b, b.f[q.owner], tgt, q.tech, tgt.x, 0.4, tgt.z, angleTo(q, tgt), q.power ? { power: q.power } : {})) b.events.push({ kind: 'explode', x: tgt.x, y: 0.4, z: tgt.z, tech: q.tech, big: true });
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
      if (!los(b, q, tgt, 0.9)) {
        // 柱のうしろ: 声はとどかない
      } else if (floating(tgt)) {
        // 浮いている相手には とどかない(地面の近くを 広がる 声。2026-11-05 企画者「空中の相手にはあたらない」)
      } else if (tgt.act.k === 'dodge' && tgt.act.t < C.dodge.invincible) evaded(b, tgt);
      else if (tgt.act.k !== 'ko') {
        // 弱体の効果は技の表の追加効果(攻撃ダウン・ねむり・遅くする)
        const eff = getTech(q.tech).effect;
        const rst = styleOf(q.tech);
        // 装甲砕き音波: 守りの膜も こわす
        if (rst === 'shatter' && tgt.act.k === 'guard') guardBreak(b, tgt);
        if (rst === 'shatter' && b.t < tgt.barrierUntil) {
          tgt.barrierUntil = b.t;
          b.events.push({ kind: 'domeBurst', side: tgt.side, x: tgt.x, z: tgt.z });
        }
        // ぐにゃりスリップ: つるつるで すべる(止まれない・曲がれない)
        if (rst === 'slip') {
          tgt.slipUntil = b.t + 4;
          b.events.push({ kind: 'status', side: tgt.side, effect: 'すべる' });
        }
        if (eff === 'ねむり' || eff === '遅くする') applyEffect(b, tgt, getTech(q.tech), 1);
        else if (eff === '防御ダウン') {
          tgt.defDownUntil = b.t + C.defDown.time;
          b.events.push({ kind: 'status', side: tgt.side, effect: '防御ダウン' });
        }
        else {
          tgt.atkDownUntil = b.t + C.debuff.time;
          b.events.push({ kind: 'status', side: tgt.side, effect: '攻撃ダウン' });
        }
      }
    }
  }
  b.roars = b.roars.filter((q) => q.r < getTech(q.tech).range);
  // 重力の場: 中にいる相手は遅くなる(出ても少しのあいだ遅いまま)
  for (const fl of b.fields) {
    const tgt = b.f[fl.owner === 0 ? 1 : 0];
    // ぷにトラップ: はじめて ふむと べたっと くっついて 少し動けない
    if (fl.stick && !fl.stuck && inField(fl, tgt) && tgt.y < 0.5 && b.t >= tgt.trapSafeUntil && !isInvincible(b, tgt) && tgt.act.k !== 'ko') {
      fl.stuck = true;
      tgt.act = { k: 'hurt', t: 0, until: 0.8 };
      tgt.vx = tgt.vz = tgt.kvx = tgt.kvz = 0;
      tgt.trapSafeUntil = b.t + 3;
      b.events.push({ kind: 'status', side: tgt.side, effect: 'くっついた' });
    }
    // 電気の種: 上に 雷雲。下に 入ると 雲から 雷が 落ちる(1回)(2026-11-05 企画者「電気の種は雲発生させて」)
    if (fl.mine && inField(fl, tgt) && !isInvincible(b, tgt) && tgt.act.k !== 'ko' && b.t >= fl.until - 8.6) {
      fl.until = b.t + 0.3;
      fl.mine = false;
      addStrike(b, b.f[fl.owner], fl.tech, tgt.x, tgt.z, 1.1, b.t + 0.12, 'bolt', 10);
    }
    // 潮の壁: さわった相手を 押し返す
    if (fl.wall && inField(fl, tgt) && tgt.act.k !== 'ko') {
      const g = angleTo(b.f[fl.owner], tgt);
      tgt.kvx = Math.cos(g) * 2.2 * C.hurt.friction * 0.35;
      tgt.kvz = Math.sin(g) * 2.2 * C.hurt.friction * 0.35;
    }
    // 潮の渦: まん中へ 引きよせる
    if (fl.pull && inField(fl, tgt) && tgt.y < 0.5 && tgt.act.k !== 'ko') {
      const g = Math.atan2(fl.z - tgt.z, fl.x - tgt.x);
      tgt.x += Math.cos(g) * 2.2 * dt;
      tgt.z += Math.sin(g) * 2.2 * dt;
    }
    if (!fl.self && (fl.effect ?? getTech(fl.tech).effect) === '遅くする' && inField(fl, tgt) && tgt.y < 0.5) {
      if (b.t >= tgt.slowUntil) b.events.push({ kind: 'status', side: tgt.side, effect: '遅くする' });
      tgt.slowUntil = b.t + C.gfield.linger;
    }
  }
  // 場の中にいる間、1秒ごとに少しダメージ(よろけない)
  for (const fl of b.fields) {
    const tgt = b.f[fl.owner === 0 ? 1 : 0];
    if (fl.self) {
      // 自分の場: 中にいる間、自分が回復
      if (fl.tick !== undefined && b.t >= fl.tick) {
        fl.tick = b.t + C.fieldTick;
        const me = b.f[fl.owner];
        if (dist(fl, me) < fl.r) healMon(b, me, me.maxHp * C.selfField.healPct, '場');
      }
      continue;
    }
    if (fl.tick !== undefined && b.t >= fl.tick) {
      fl.tick = b.t + C.fieldTick;
      if (inField(fl, tgt) && tgt.y < 0.5) {
        // 場の追加効果(ねむり・どく など。遅くするは下で)
        const ft = getTech(fl.tech);
        const eff = fl.effect ?? ft.effect;
        if (eff !== 'なし' && eff !== '遅くする') applyEffect(b, tgt, { ...ft, effect: eff }, 0.5);
        const f = b.f[fl.owner];
        const fp = fl.power ?? getTech(fl.tech).power;
        if (fp > 0) chip(b, tgt, Math.max(1, Math.round(fp * (1 + f.stats.power / C.stat.powerDiv) * (C.stat.toughDiv / (C.stat.toughDiv + tgt.stats.tough)))), '場');
      }
    }
  }
  b.fields = b.fields.filter((fl) => b.t < fl.until);
  // 火柱: 出た瞬間から少しのあいだ、柱の中にいる相手に当たる(1回の技で1回だけ)
  for (const p of b.pillars) {
    const tgt = b.f[p.owner === 0 ? 1 : 0];
    // 終端狙撃陣: 照準が 相手を追いかける(さいごの少しは 止まる → よけられる)
    if (p.follow !== undefined && b.t < p.follow) [p.x, p.z] = clampField(b, tgt.x, tgt.z);
    if (b.t < p.at) continue;
    if (!p.up) {
      p.up = true;
      b.events.push({ kind: 'pillar', side: p.owner, x: p.x, z: p.z, look: p.look });
    }
    if (b.t < p.at + C.pillar.burst && dist(p, tgt) < p.r + C.body.radius * 0.6 && (tgt.y < 2.5 || floating(tgt)) && !b.pillars.some((q) => q.g === p.g && q.hitDone)) {
      if (hit(b, b.f[p.owner], tgt, p.tech, tgt.x, tgt.y + 0.6, tgt.z, angleTo(p, tgt), p.power ? { power: p.power } : {})) for (const q of b.pillars) if (q.g === p.g) q.hitDone = true;
    }
  }
  b.pillars = b.pillars.filter((p) => b.t < p.at + C.pillar.life);
  // 黒い息: 消えた所に 黒い けむり(中は 遅くなる)
  for (const s of b.shots)
    if (!s.alive && styleOf(s.tech) === 'smogOrb') {
      const [cx, cz] = clampField(b, s.x, s.z);
      b.fields.push({ owner: s.owner, tech: s.tech, x: cx, z: cz, r: 1.8, until: b.t + 4, tick: b.t + 0.4, effect: '遅くする', power: 1.5 });
      b.events.push({ kind: 'field', side: s.owner, x: cx, z: cz, r: 1.8, until: b.t + 4 });
    }
  b.shots = b.shots.filter((s) => s.alive);
}

// ---------------- AI ----------------

/** すぐ近くに 危ないものがあるか(ガードするか決める時) */
function dangerNear(b: AnimeBattle, f: AnimeMon): boolean {
  const o = other(b, f);
  for (const s of b.shots) if (s.owner !== f.side && dist(s, f) < 3) return true;
  if (o.act.k === 'tech' && o.act.fired && !o.act.hit && dist(f, o) < 3.5) return true;
  return false;
}

/** 飛んでくる技を見て、よける(習熟度 Evasion) */
function watchDanger(b: AnimeBattle, f: AnimeMon): void {
  if (f.act.k !== 'free' || f.y > 0) return;
  // よけるの待ち時間中: ガードで守る(うまさ「守り」で決める。1回の危険に1回だけ判断)
  if (f.cooldown.dodge > b.t) {
    if ((f.cooldown.guard ?? 0) <= b.t && dangerNear(b, f)) {
      if (b.rng() < lerp(C.skill.guard, lv(f, 'defense')) * (0.6 + f.instinct.defense * 0.6)) startGuard(b, f, C.guard.aiTime, true);
      else f.cooldown.guard = b.t + 0.5;
    }
    return;
  }
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
  // ときどき よけずに ガード(守り本能が強いほど)
  if ((f.cooldown.guard ?? 0) <= b.t && danger === 'side' && b.rng() < lerp(C.skill.guard, lv(f, 'defense')) * f.instinct.defense * 0.5) {
    if (startGuard(b, f, C.guard.aiTime, true)) return;
  }
  // マップ: 弾やビームが来そうな時、近くの柱のうしろへ にげる(うまさ「よける」で決める)
  if (b.arena && danger === 'side' && f.plan !== 'cover' && b.rng() < lerp(C.arenaAi.cover, lv(f, 'evasion'))) {
    const spot = coverSpot(b.arena, f, o, C.arenaAi.coverDist, C.body.radius);
    if (spot) {
      f.plan = 'cover';
      f.planT = 0;
      f.coverX = spot.x;
      f.coverZ = spot.z;
      f.burstUntil = b.t + 0.6;
      f.cooldown.dodge = b.t + 0.5;
      return;
    }
  }
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
    // ぷにタッチ: とどく時は よく使う。遠い時も ときどき(使うと 近づく)
    if (styleOf(id) === 'stretch') x = d < C.style.stretchReach + 0.5 ? 1.6 + f.instinct.attack : d < 7 ? 0.6 + f.instinct.attack * 0.5 : 0.15;
    else if (t.kind === 'rush' || t.kind === 'spin' || t.kind === 'combo') x = d < 9 ? 1 + f.instinct.attack : 0.2;
    else if (t.kind === 'quake') x = d < t.range * 0.9 ? 1.2 + f.instinct.fight : 0.05;
    else if (t.kind === 'drop') x = d < t.range ? 1 + f.instinct.fight : 0.1;
    else if (t.kind === 'beam') x = 0.8 + f.instinct.fight;
    else if (t.kind === 'debuff') x = (t.effect === '防御ダウン' ? b.t < o.defDownUntil : b.t < o.atkDownUntil) ? 0.05 : d < t.range ? 0.9 : 0.1;
    else if (t.kind === 'pillar') x = d < t.range ? 1 + f.instinct.fight : 0.1;
    else if (t.kind === 'field') x = b.fields.some((fl) => fl.owner === f.side) ? 0.05 : 0.8;
    // 回復: HPがへってきたら(上限まで)。強化: かかっていない時。吸収: 近めの相手に
    else if (t.kind === 'heal') x = f.hp < f.maxHp * 0.6 && f.healed < f.maxHp * C.heal.cap ? 1.6 + f.instinct.survival : 0.02;
    else if (t.kind === 'buff') x = b.t < f.atkUpUntil || b.t < f.defUpUntil ? 0.03 : 0.7;
    else if (t.kind === 'drain') x = d < t.range * 1.3 ? 1 + f.instinct.attack * 0.5 : 0.3;
    // 柱で見通せない時は、遠くから撃つ技を むだに撃たない(うまさ「間合い」が高いほど よく分かる)
    if (b.arena && RANGED.has(t.kind) && !los(b, f, o)) x *= lerp(C.arenaAi.blockedShoot, lv(f, 'spacing'));
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
  // マップ: 柱で見通せない時は、柱の横へ回りこむ(うまさで決める)
  if (b.arena && f.plan !== 'cover' && !los(b, f, o) && b.rng() < lerp(C.arenaAi.flank, lv(f, 'spacing'))) {
    if (f.plan === 'flank') return;
    {
      // 左右のうち、早く見通せるほうへ
      const a0 = angleTo(f, o);
      const side = (k: number) => ({ x: f.x + Math.cos(a0 + (k * Math.PI) / 2) * 3, z: f.z + Math.sin(a0 + (k * Math.PI) / 2) * 3 });
      f.flankS = los(b, side(1), o) ? 1 : los(b, side(-1), o) ? -1 : b.rng() < 0.5 ? 1 : -1;
      f.planT = 0;
    }
    f.plan = 'flank';
    return;
  }
  if (f.plan === 'cover' && f.planT < C.arenaAi.coverHold) return;
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
  } else if (f.plan === 'flank') {
    // 柱の横へ回りこむ(見通せたら ふつうに もどる)
    if (los(b, f, o)) f.planT = C.moveHold;
    // 相手も同じ向きに回って、ずっと見通せない時は、反対へ回る
    if (f.planT > C.arenaAi.flankFlip) {
      f.flankS = -f.flankS;
      f.planT = 0;
    }
    vx = Math.cos(a + (f.flankS * Math.PI) / 2) + Math.cos(a) * 0.45;
    vz = Math.sin(a + (f.flankS * Math.PI) / 2) + Math.sin(a) * 0.45;
  } else if (f.plan === 'cover') {
    // 柱のうしろへ
    const cx = f.coverX - f.x;
    const cz = f.coverZ - f.z;
    if (Math.hypot(cx, cz) > 0.4) [vx, vz] = [cx, cz];
  }
  if (b.arena) {
    // 丸い場所の はしに近いと、中へもどる
    const R = b.arena.radius;
    const dd = Math.hypot(f.x, f.z);
    if (dd > R - 2.5 && vx * f.x + vz * f.z > 0) {
      vx = -f.x / dd * 0.6 + vx * 0.3;
      vz = -f.z / dd * 0.6 + vz * 0.3;
    }
    // 柱・壁を よけて歩く(引っかからないように)
    [vx, vz] = steerAround(b.arena, f, vx, vz, C.body.radius);
  } else {
    // コートの端に近いと、中へもどる
    const H = C.field;
    if (Math.abs(f.x) > H.halfX - 2 && Math.sign(vx) === Math.sign(f.x)) vx = -Math.sign(f.x) * 0.6;
    if (Math.abs(f.z) > H.halfZ - 2 && Math.sign(vz) === Math.sign(f.z)) vz = -Math.sign(f.z) * 0.6;
  }
  // ZIPP: 「さっと走って、ぴたっと止まる」をくり返す。走るたびに 少し左右へ ずれる(ジグザグ)【仮】
  let dart = 1;
  if (f.species === 'zipp') {
    const [go, stop] = C.zipp.dart;
    const tt = b.t + f.side * 0.37;
    const k = Math.floor(tt / (go + stop));
    dart = tt - k * (go + stop) < go ? C.zipp.dartSpeed[0] : C.zipp.dartSpeed[1];
    const off = (k % 2 ? 1 : -1) * 0.5;
    [vx, vz] = [vx * Math.cos(off) - vz * Math.sin(off), vx * Math.sin(off) + vz * Math.cos(off)];
  }
  // KLAK: カニのように 横向きに ちょこちょこ歩く(近づく時も ななめ横から)【仮】
  if (f.species === 'klak' && f.plan === 'approach') {
    const off = (Math.floor((b.t + f.side * 0.6) / 1.1) % 2 ? 1 : -1) * 1.1;
    [vx, vz] = [vx * Math.cos(off) - vz * Math.sin(off), vx * Math.sin(off) + vz * Math.cos(off)];
  }
  const len = Math.hypot(vx, vz);
  // 速さに強弱をつける(いつも同じ速さだと機械みたいなので)
  // PUNI: ぽよん ぽよん と はねるたびに進む。KLAK: 小きざみに ちょこちょこ
  const sway = f.species === 'puni' ? 0.35 + 1.05 * Math.abs(Math.sin(b.t * 4.2 + f.side)) : f.species === 'klak' ? 0.85 + 0.3 * Math.sin(b.t * 15 + f.side) : f.species === 'zipp' ? dart : 0.75 + 0.35 * Math.sin(b.t * 2.3 + f.side * 1.7) + 0.15 * Math.sin(b.t * 5.1 + f.side);
  const sp = walkSpeed(f) * sway * (b.t < f.paraUntil ? C.status.paraSpeed : 1) * (b.t < f.slowUntil ? C.gfield.slow : 1) * (b.t < f.dizzyUntil ? 0.6 : 1) * (b.t < f.burstUntil ? C.move.burst : 1);
  const wx = len > 0.01 ? (vx / len) * sp : 0;
  const wz = len > 0.01 ? (vz / len) * sp : 0;
  // 勢い: 少しずつ速さを合わせる(ZIPP は すぐ止まる・すぐ走る)
  const k = 1 - Math.exp(-dt * C.move.accel * (f.species === 'zipp' ? 3 : 1) * (b.t < (f.slipUntil ?? 0) ? 0.12 : 1));
  f.vx += (wx - f.vx) * k;
  f.vz += (wz - f.vz) * k;
  f.x += f.vx * dt;
  f.z += f.vz * dt;
  f.speed = Math.hypot(f.vx, f.vz);
  // 向き: すばやく相手のほうへ(近いほど速く回る)
  f.face += angDiff(a, f.face) * (1 - Math.exp(-dt * C.stat.turnRate));
}

/** スピードで決まる歩く速さ【仮】 */
export function walkSpeed(f: { stats: { speed: number } }): number {
  const t = Math.max(0, Math.min(1, f.stats.speed / C.stat.moveCap));
  return C.stat.walkBase * (C.stat.moveMin + (C.stat.moveMax - C.stat.moveMin) * t);
}

/** スティックで歩く(勢いあり・相手のほうを向いたまま) */
function padWalk(b: AnimeBattle, f: AnimeMon, dt: number): void {
  const o = other(b, f);
  const len = Math.min(1, Math.hypot(f.pad!.x, f.pad!.z));
  const sp = walkSpeed(f) * C.pad.speed * len * (b.t < f.paraUntil ? C.status.paraSpeed : 1) * (b.t < f.slowUntil ? C.gfield.slow : 1) * (b.t < f.dizzyUntil ? 0.6 : 1);
  const n = Math.hypot(f.pad!.x, f.pad!.z) || 1;
  const wx = len > 0.05 ? (f.pad!.x / n) * sp : 0;
  const wz = len > 0.05 ? (f.pad!.z / n) * sp : 0;
  const k = 1 - Math.exp(-dt * C.move.accel * 1.6 * (b.t < (f.slipUntil ?? 0) ? 0.12 : 1));
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
    f.vy -= C.gravity * dt * (a.k === 'air' && b.t < f.floatUntil && f.vy > C.juggle.spike * 0.5 ? C.juggle.float : 1);
    f.y += f.vy * dt;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      f.juggleN = 0;
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
        } else f.act = { k: 'down', t: 0, until: f.spiked ? C.juggle.spikeDown : C.hurt.down };
        f.spiked = false;
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
  // ガードの量: ガードしていない時、少しして もどる
  if (a.k !== 'guard' && b.t >= f.guardRegenAt) f.guardGauge = Math.min(C.guard.max, f.guardGauge + C.guard.regen * dt);
  switch (a.k) {
    case 'tech':
      updateTech(b, f, a, dt);
      break;
    case 'guard':
      a.t += dt;
      f.guardGauge -= C.guard.hold * dt;
      f.guardRegenAt = b.t + C.guard.regenDelay;
      f.face += angDiff(angleTo(f, other(b, f)), f.face) * Math.min(1, dt * 10);
      if (f.guardGauge <= 0) guardBreak(b, f);
      else if (a.t >= a.until || (f.pad && !f.guardHold && a.t >= C.guard.minTime)) {
        f.act = { k: 'free' };
        f.cooldown.guard = b.t + C.guard.cool;
      }
      break;
    case 'dodge':
      a.t += dt;
      // ZIPP は 速く遠くへ よける(しゅっと消えるように)
      const zd = (f.species === 'zipp' ? C.zipp.dodge : 1) * (b.t < (f.blinkUntil ?? 0) ? 1.35 : 1);
      f.x += a.dx * ((C.dodge.distance * zd) / C.dodge.time) * dt * (a.t < C.dodge.time ? 1 : 0);
      f.z += a.dz * ((C.dodge.distance * zd) / C.dodge.time) * dt * (a.t < C.dodge.time ? 1 : 0);
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
  f.holdT = f.hold ? (f.holdT ?? 0) + dt : 0;
  if (b.t < (f.trailUntil ?? 0) && f.y <= 0 && b.t >= (f.trailNext ?? 0) && Math.hypot(f.vx, f.vz) > 0.8) {
    f.trailNext = b.t + 0.3;
    b.fields.push({ owner: f.side, tech: '黒鱗', x: f.x, z: f.z, r: 0.6, until: b.t + 3, tick: b.t + 0.3, power: 1.5, effect: 'どく' });
  }
  // 長く続いた コンボ(時間)は 当たって いなくても ぬける
  if (f.comboN >= 2 && (f.act.k === 'hurt' || f.act.k === 'air') && b.t - f.comboStart > C.chain.breakTime && b.t - f.comboLast < C.chain.reset) breakCombo(b, f);
  // 空中の 追い打ち: ふっとばした あとの すき・待ち時間の間でも すぐ とび上がる
  if (f.command?.cmd === 'punch' && f.y <= 0 && canChase(b, f) && (f.act.k === 'free' || (f.act.k === 'tech' && f.act.id === 'punch' && f.act.hit && f.act.sp !== 'air'))) {
    f.command = null;
    f.act = { k: 'free' };
    f.cooldown.punch = 0;
    startTech(b, f, 'punch', true);
    b.events.push({ kind: 'command', side: f.side, cmd: 'punch', state: 'done' });
  }
  // 浮いている相手に 技が 当たった すぐあと: 次の 技を 押すと すぐ出る(技 → 技 の コンボ。2026-11-05 企画者)
  if (f.command && f.act.k === 'tech' && f.act.id !== f.command.cmd && !NOT_TECH.has(f.command.cmd) && b.t - (f.airHitT ?? -9) < C.juggle.cancel && floating(other(b, f)) && (f.cooldown[f.command.cmd] ?? 0) <= b.t) {
    const c = f.command.cmd as TechId;
    f.command = null;
    startTech(b, f, c, true, true);
    b.events.push({ kind: 'cancel', side: f.side, tech: c });
    b.events.push({ kind: 'command', side: f.side, cmd: c, state: 'done' });
  }
  // 浮いている時: しばらく 当てられないと コンボが切れて、落ちて 立つ(たおれない)
  if (f.act.k === 'air' && b.t < f.floatUntil && b.t - f.comboLast > C.juggle.drop) {
    f.floatUntil = 0;
    f.ukemi = true;
    f.vy = Math.min(f.vy, -3);
  }
  // 通常攻撃が 当たった あと(すきの間)に 技を押すと、すぐ 技が出る(ためも 短い。2026-11-05 コンボ3段め)
  if (f.command && f.act.k === 'tech' && f.act.id === 'punch' && f.act.hit && f.y <= 0 && !NOT_TECH.has(f.command.cmd) && (f.cooldown[f.command.cmd] ?? 0) <= b.t) {
    const c = f.command.cmd as TechId;
    f.command = null;
    startTech(b, f, c, true, true);
    b.events.push({ kind: 'cancel', side: f.side, tech: c });
    b.events.push({ kind: 'command', side: f.side, cmd: c, state: 'done' });
  }
  // 空中でも通常攻撃は出せる(2026-11-02 企画者「空中でも攻撃出せるように」)
  if (f.act.k === 'free' && f.y > 0 && f.command?.cmd === 'punch') {
    f.command = null;
    startTech(b, f, 'punch', true);
    b.events.push({ kind: 'command', side: f.side, cmd: 'punch', state: 'done' });
  }
  // 守り(ドームなど)の とちゅうでも、よける・ガードで やめられる(2026-11-05 企画者「防御のドーム系はよけるで途中キャンセルできるように」)
  if ((f.command?.cmd === 'dodge' || f.command?.cmd === 'guard') && f.act.k === 'tech' && f.act.fired && getTech(f.act.id).kind === 'barrier' && f.y <= 0) {
    f.barrierUntil = Math.min(f.barrierUntil, b.t);
    f.armorUntil = Math.min(f.armorUntil ?? 0, b.t);
    f.act = { k: 'free' };
  }
  if (f.act.k !== 'free' || f.y > 0) {
    // 動けないあいだは、歩く勢いが少しのこって止まる(ジャンプ中は勢いのまま)
    const k = f.act.k === 'free' ? 1 : Math.exp(-dt * C.move.stop);
    f.vx *= k;
    f.vz *= k;
    const ka = f.act.k === 'tech' ? getTech(f.act.id).kind : null;
    if ((ka === 'drop' || (f.act.k === 'tech' && f.act.sp === 'air')) && f.y > 0) {
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
      f.cooldown.dodge = b.t + C.dodge.cooldown * (b.t < (f.blinkUntil ?? 0) ? 0.4 : 1);
    } else if (c === 'guard') {
      startGuard(b, f, f.pad ? 1e9 : C.guard.aiTime);
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

/** 空中の 追い打ちが できるか(ふっとんで 空中にいる相手が 近い) */
export function canChase(b: AnimeBattle, f: AnimeMon): boolean {
  const o = other(b, f);
  // ZIPP(電撃ダッシュ)も 空中の 追い打ちが できる(2026-11-05 企画者「ジップの空中コンボが繋がらない」)
  if ((!C.powerMoves[f.species] && !f.jab.dash) || !f.jab.parts.length || f.jab.water || f.jab.trap) return false;
  if (f.act.k === 'hurt' || f.act.k === 'air' || f.act.k === 'down' || f.act.k === 'ko' || f.act.k === 'dodge' || f.act.k === 'guard') return false;
  // 上へ ふっとび始めた 瞬間(まだ 低い)でも できる
  return o.act.k === 'air' && (o.y > C.juggle.minY || o.vy > 1) && dist(f, o) < C.juggle.range && o.juggleN < C.juggle.max;
}

/** コンボから ぬける: 少しのあいだ 当たらない・空中なら すぐ 落ちて 受け身(2026-11-05 長い 追い打ちでも 3秒より 短く) */
function breakCombo(b: AnimeBattle, o: AnimeMon): void {
  o.safeUntil = Math.max(o.safeUntil, b.t + C.chain.breakSafe);
  if (o.act.k === 'hurt') o.act.until = Math.min(o.act.until, o.act.t + 0.2);
  o.floatUntil = 0;
  if (o.act.k === 'air') {
    o.ukemi = true;
    o.vy = Math.min(o.vy, -5);
  }
  o.comboN = 0;
  o.comboLast = -99;
  b.events.push({ kind: 'comboBreak', side: o.side });
}

/** ふっとんで 浮いている(技が とどく 相手) */
function floating(o: AnimeMon): boolean {
  return o.act.k === 'air' && o.y > 0.3;
}

/** 近くで 当てる技の 上下の とどき: ふつうは 同じくらいの高さ。浮いている相手には とび上がって とどく */
function yOk(_b: AnimeBattle, f: AnimeMon, o: AnimeMon, tol: number): boolean {
  return Math.abs(o.y - f.y) < tol || (floating(o) && o.y - f.y < 4.5);
}

/** 技ではない指示 */
const NOT_TECH = new Set<string>(['punch', 'dodge', 'guard', 'jump']);

function separate(b: AnimeBattle): void {
  const [p, q] = b.f;
  const d = dist(p, q);
  // 千閃雷走は 相手を つきぬける
  const through = b.f.some((f) => f.act.k === 'tech' && f.act.fired && !f.act.hit && styleOf(f.act.id) === 'multiPass');
  if (!through && d < C.body.minGap && Math.abs(p.y - q.y) < 1.2) {
    const nx = d > 1e-4 ? (q.x - p.x) / d : 1;
    const nz = d > 1e-4 ? (q.z - p.z) / d : 0;
    const push = (C.body.minGap - d) / 2;
    p.x -= nx * push;
    p.z -= nz * push;
    q.x += nx * push;
    q.z += nz * push;
  }
  for (const f of b.f) {
    if (b.arena) {
      // 柱・壁の中へは入れない(外へ押し出す → そって すべる)。外の壁の外へも出ない
      if (resolveBody(b.arena, f, C.body.radius)) {
        // ぶつかった向きの勢いは なくす(押しつけ続けない)
        f.kvx *= 0.5;
        f.kvz *= 0.5;
      }
    } else {
      f.x = clamp(f.x, -C.field.halfX, C.field.halfX);
      f.z = clamp(f.z, -C.field.halfZ, C.field.halfZ);
    }
  }
}

/**
 * 少しのダメージ(よろけない・当たらない間は入らない)。やけど・どく・場。HP が0になったら たおれる
 */
function chip(b: AnimeBattle, o: AnimeMon, dmg: number, why: 'やけど' | 'どく' | '場'): void {
  if (o.act.k === 'ko' || o.act.k === 'victory' || b.winner !== null) return;
  if (why === '場' && (b.t < o.safeUntil || o.act.k === 'down' || b.t < o.barrierUntil)) return;
  o.hp = Math.max(0, o.hp - dmg);
  const by = b.f[o.side === 0 ? 1 : 0];
  b.events.push({ kind: 'chip', side: by.side, target: o.side, damage: dmg, why, x: o.x, z: o.z });
  if (o.hp <= 0) {
    o.act = { k: 'ko', t: 0 };
    o.vy = Math.max(o.vy, 6);
    o.y = Math.max(o.y, 0.001);
    b.winner = by.side;
    b.koAt = b.t;
    b.events.push({ kind: 'ko', side: o.side });
  }
}

/** やけど・どく: 1秒ごとに最大HPの割合のダメージ */
function statusTick(b: AnimeBattle, f: AnimeMon): void {
  if (f.burnTick > 0 && f.burnTick <= f.burnUntil + 1e-6 && b.t >= f.burnTick) {
    f.burnTick += C.burn.every;
    chip(b, f, Math.max(1, Math.round(f.maxHp * C.burn.pct)), 'やけど');
  }
  if (f.poisonTick > 0 && f.poisonTick <= f.poisonUntil + 1e-6 && b.t >= f.poisonTick) {
    f.poisonTick += C.poison.every;
    chip(b, f, Math.max(1, Math.round(f.maxHp * C.poison.pct)), 'どく');
  }
}

function step(b: AnimeBattle): void {
  const dt = C.dt;
  b.t += dt;
  const order = Math.round(b.t / dt) % 2 === 0 ? b.f : [b.f[1], b.f[0]];
  for (const f of order) updateMon(b, f, dt);
  for (const f of b.f) statusTick(b, f);
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
