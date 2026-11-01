/**
 * 3Dバトルの【仮】の人形(ひじ・ひざが曲がる体)と、その動き。企画者 2026-11-01「もっと格闘ゲームぽく動いてほしい(鉄拳・LastFight)」。
 * BUNKの3Dモデルが届いたら差しかえる(BUNKの見た目はまだ使わない)。キャラ・動きは既存のゲームからコピーしない。
 * 向き: 体の前 = +x、上 = +y、右 = +z。左手・左足が前の構え。
 */
import * as THREE from 'three';
import { B3, type MoveName } from '../core/battle3d/config';
import type { B3Fighter } from '../core/battle3d/engine';

type V3 = [number, number, number];
/** 関節の角度(ラジアン)。肩・股は [x, y, z]、ひじ・ひざは曲げる量 */
interface Pose {
  /** 腰の高さのずれ(ひざを曲げると下がる) */
  hy: number;
  /** 腰のひねり(マイナス = 左が前)・前後のかたむき(マイナス = 前のめり)・左右のかたむき */
  twist: number;
  lean: number;
  roll: number;
  /** 胸のひねり・頭のかたむき */
  chest: number;
  head: number;
  sL: V3;
  eL: number;
  sR: V3;
  eR: number;
  hL: V3;
  kL: number;
  hR: V3;
  kR: number;
}

const P = (o: Partial<Pose>, base: Pose = STANCE): Pose => ({ ...base, ...o });

/** 構え(ファイティングポーズ) */
const STANCE: Pose = {
  hy: -0.09,
  twist: -0.45,
  lean: -0.12,
  roll: 0,
  chest: 0.15,
  head: 0.05,
  sL: [-0.25, 0, 1.05],
  eL: 1.95,
  sR: [0.3, 0, 0.85],
  eR: 2.25,
  hL: [0.12, 0, 0.3],
  kL: -0.4,
  hR: [-0.12, 0, -0.12],
  kR: -0.45,
};

const GUARD = P({ hy: -0.14, lean: -0.2, twist: -0.25, sL: [-0.45, 0, 1.25], eL: 2.55, sR: [0.45, 0, 1.2], eR: 2.6 });

/** 技ごとの [ため, 当てる] のかっこう */
const MOVES: Record<MoveName, [Pose, Pose]> = {
  jab: [P({ sL: [-0.2, 0, 0.95], eL: 2.3, twist: -0.4 }), P({ sL: [-0.05, 0, 1.6], eL: 0.05, twist: -0.75, chest: -0.1, lean: -0.18 })],
  straight: [
    P({ twist: -0.7, sR: [0.3, 0, 0.75], eR: 2.4, hy: -0.12 }),
    P({ twist: 0.45, chest: 0.2, lean: -0.25, sR: [0.1, 0, 1.62], eR: 0.05, sL: [-0.3, 0, 0.8], eL: 2.4, hR: [-0.1, 0, -0.45], kR: -0.2 }),
  ],
  kick: [
    P({ twist: -0.1, lean: 0.05, hR: [0, 0, 1.0], kR: -2.0, hL: [0, 0, 0.1], kL: -0.25 }),
    P({ twist: 0.1, lean: 0.3, hR: [0, 0, 1.55], kR: -0.05, hL: [0, 0, -0.05], kL: -0.15, sL: [-0.4, 0, 0.6], eL: 2.2, sR: [0.4, 0, 0.3], eR: 1.8 }),
  ],
  upper: [
    P({ hy: -0.3, lean: -0.35, twist: -0.6, sR: [0.2, 0, 0.3], eR: 2.5, kL: -0.9, kR: -0.9, hL: [0.1, 0, 0.6], hR: [-0.1, 0, 0.3] }),
    P({ hy: 0.06, lean: 0.2, twist: 0.35, chest: 0.3, head: -0.2, sR: [0.15, 0, 2.7], eR: 0.6, sL: [-0.3, 0, 0.6], eL: 2.2, kL: -0.1, kR: -0.15 }),
  ],
  smash: [
    P({ twist: -0.95, lean: 0.12, chest: -0.3, sR: [0.4, 0, -0.7], eR: 1.0, sL: [-0.3, 0, 1.3], eL: 1.2, hy: -0.06 }),
    P({ twist: 0.75, lean: -0.4, chest: 0.35, hy: -0.18, sR: [0.35, 0, 1.75], eR: 0.15, sL: [-0.4, 0, 0.4], eL: 1.6, hL: [0.1, 0, 0.6], kL: -0.7, hR: [-0.1, 0, -0.6], kR: -0.15 }),
  ],
  rush: [
    P({ hy: -0.2, lean: -0.2, twist: -0.6, sL: [-0.3, 0, 1.2], eL: 2.2, kL: -0.8, kR: -0.8 }),
    P({ hy: -0.16, lean: -0.6, twist: -0.95, sL: [0, 0, 1.55], eL: 1.6, sR: [0.4, 0, 1.0], eR: 2.3, hL: [0.1, 0, 0.8], kL: -0.9, hR: [-0.1, 0, -0.8], kR: -0.1 }),
  ],
  // 回し蹴り(体ごと回る)
  spin: [
    P({ twist: 0.5, hy: -0.12, lean: 0.1, sL: [-0.6, 0, 0.6], eL: 1.6, sR: [0.6, 0, 0.6], eR: 1.6 }),
    P({ twist: 0, roll: -0.45, lean: 0.1, hR: [-1.35, 0, 0.35], kR: -0.08, hL: [0.15, 0, 0], kL: -0.2, sL: [-0.9, 0, 0.3], eL: 0.8, sR: [0.9, 0, 0.3], eR: 0.8 }),
  ],
  aerial: [
    P({ hL: [0, 0, 1.4], kL: -2.2, hR: [0, 0, 0.6], kR: -1.8, sL: [-0.5, 0, 1.6], eL: 1.6, sR: [0.5, 0, 1.6], eR: 1.6, lean: -0.1 }),
    P({ hR: [0, 0, 1.35], kR: -0.05, hL: [0, 0, 0.9], kL: -2.0, lean: 0.35, sL: [-0.6, 0, 0.8], eL: 1.4, sR: [0.6, 0, 0.5], eR: 1.0 }),
  ],
  counter: [
    P({ twist: -0.6, sR: [0.3, 0, 0.9], eR: 2.5, hy: -0.15 }),
    P({ twist: 0.6, lean: -0.3, chest: 0.25, sR: [0.2, 0, 1.45], eR: 1.0, sL: [-0.35, 0, 0.8], eL: 2.3, hR: [-0.1, 0, -0.5], kR: -0.2 }),
  ],
};

const STUN_HIGH = P({ lean: 0.45, head: 0.5, chest: -0.2, hy: -0.08, sL: [-0.6, 0, 0.35], eL: 0.7, sR: [0.6, 0, 0.25], eR: 0.6 });
const STUN_BODY = P({ lean: -0.55, head: -0.2, hy: -0.18, sL: [-0.1, 0, 0.6], eL: 1.6, sR: [0.1, 0, 0.6], eR: 1.6, kL: -0.7, kR: -0.7 });
const AIR = P({ lean: 0.5, head: 0.4, sL: [-1.0, 0, 0.5], eL: 0.4, sR: [1.0, 0, 0.6], eR: 0.5, hL: [0.2, 0, 0.6], kL: -0.6, hR: [-0.2, 0, 0.2], kR: -0.3 });
const DOWN = P({ hy: 0, twist: 0, lean: 0, chest: 0, head: 0.1, sL: [-1.2, 0, 0.2], eL: 0.4, sR: [1.3, 0, 0.4], eR: 0.3, hL: [0.15, 0, 0.3], kL: -0.6, hR: [-0.15, 0, 0.05], kR: -0.15 });
const VICTORY = P({ hy: -0.02, twist: -0.2, lean: 0.05, sR: [0.2, 0, 2.95], eR: 0.25, sL: [-0.2, 0, 0.2], eL: 2.0 });
const JUMP = P({ hL: [0.1, 0, 0.9], kL: -1.6, hR: [-0.1, 0, 0.5], kR: -1.4, sL: [-0.4, 0, 1.3], eL: 1.9, sR: [0.4, 0, 1.1], eR: 2.1 });
const KEYS: (keyof Pose)[] = ['hy', 'twist', 'lean', 'roll', 'chest', 'head', 'sL', 'eL', 'sR', 'eR', 'hL', 'kL', 'hR', 'kR'];

function mix(a: Pose, b: Pose, k: number): Pose {
  const o = {} as Record<string, number | V3>;
  for (const key of KEYS) {
    const x = a[key];
    const y = b[key];
    o[key] = Array.isArray(x) ? (x.map((v, i) => v + ((y as V3)[i] - v) * k) as V3) : (x as number) + ((y as number) - (x as number)) * k;
  }
  return o as unknown as Pose;
}

const ease = (k: number) => 1 - (1 - k) * (1 - k);

/** 技の時間 → かっこう(ため → 当てる → もどる) */
function attackPose(move: MoveName, t: number): { pose: Pose; striking: boolean; spin: number } {
  const mv = B3.moves[move];
  const [wind, hit] = MOVES[move];
  const end = mv.windup + mv.active;
  let spin = 0;
  if (move === 'spin') spin = t < mv.windup ? 0 : -Math.min(1, (t - mv.windup) / (mv.active + mv.recovery * 0.5)) * Math.PI * 2;
  if (t < mv.windup) return { pose: mix(STANCE, wind, ease(t / mv.windup)), striking: false, spin };
  if (t < end) return { pose: mix(wind, hit, Math.min(1, ((t - mv.windup) / Math.max(0.03, mv.active)) * 2.5)), striking: true, spin };
  return { pose: mix(hit, STANCE, ease(Math.min(1, (t - end) / Math.max(0.05, mv.recovery)))), striking: false, spin };
}

interface Joints {
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  sL: THREE.Group;
  eL: THREE.Group;
  sR: THREE.Group;
  eR: THREE.Group;
  hL: THREE.Group;
  kL: THREE.Group;
  hR: THREE.Group;
  kR: THREE.Group;
  fistL: THREE.Object3D;
  fistR: THREE.Object3D;
  footL: THREE.Object3D;
  footR: THREE.Object3D;
}

/** 輪郭線(格闘ゲームのトゥーン調)。裏側だけ描く少し大きい黒い形 */
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0d0814, side: THREE.BackSide });

export class FighterRig {
  readonly root = new THREE.Group();
  /** 体全体(倒れる・回る) */
  readonly body = new THREE.Group();
  readonly mats: THREE.MeshToonMaterial[] = [];
  private j: Joints;
  private cur: Pose = { ...STANCE };
  private walkPhase = 0;
  flash = 0;
  /** 当てている最中の、こぶし・足の場所(光の軌跡用) */
  readonly strikePoint = new THREE.Vector3();
  striking = false;

  constructor(skin: number, accent: number, gradient: THREE.Texture) {
    const mSkin = new THREE.MeshToonMaterial({ color: skin, gradientMap: gradient });
    const mAcc = new THREE.MeshToonMaterial({ color: accent, gradientMap: gradient });
    const mDark = new THREE.MeshToonMaterial({ color: 0x2a2433, gradientMap: gradient });
    this.mats.push(mSkin, mAcc, mDark);
    const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, y = 0, outline = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      parent.add(m);
      if (outline) {
        const o = new THREE.Mesh(geo, OUTLINE);
        o.scale.setScalar(1.08);
        m.add(o);
      }
      return m;
    };
    const g = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const n = new THREE.Group();
      n.position.set(x, y, z);
      parent.add(n);
      return n;
    };
    this.root.add(this.body);
    const hips = g(this.body, 0, 0.95, 0);
    part(hips, new THREE.SphereGeometry(0.17, 14, 10), mDark, 0.02);
    const chest = g(hips, 0, 0.1, 0);
    part(chest, new THREE.CapsuleGeometry(0.17, 0.26, 6, 12), mSkin, 0.2);
    // 胸の板(どちらか分かる色)
    const plate = part(chest, new THREE.BoxGeometry(0.2, 0.18, 0.34), mAcc, 0.32, false);
    plate.position.x = 0.04;
    const head = g(chest, 0, 0.56, 0);
    part(head, new THREE.SphereGeometry(0.15, 16, 12), mSkin, 0.08);
    const band = part(head, new THREE.TorusGeometry(0.15, 0.025, 6, 18), mAcc, 0.12, false);
    band.rotation.x = Math.PI / 2;
    // 目(前が分かるように)
    const eyeG = new THREE.SphereGeometry(0.025, 6, 5);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const z of [-0.055, 0.055]) {
      const e = new THREE.Mesh(eyeG, eyeM);
      e.position.set(0.135, 0.09, z);
      head.add(e);
    }
    const arm = (side: number) => {
      const sh = g(chest, 0, 0.42, side * 0.23);
      part(sh, new THREE.SphereGeometry(0.075, 10, 8), mSkin);
      part(sh, new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), mSkin, -0.15);
      const el = g(sh, 0, -0.3, 0);
      part(el, new THREE.CapsuleGeometry(0.055, 0.18, 4, 8), mSkin, -0.13);
      const fist = part(el, new THREE.SphereGeometry(0.09, 12, 10), mAcc, -0.3);
      return { sh, el, fist };
    };
    const leg = (side: number) => {
      const hp = g(hips, 0, -0.02, side * 0.11);
      part(hp, new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), mDark, -0.22);
      const kn = g(hp, 0, -0.44, 0);
      part(kn, new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), mSkin, -0.21);
      const foot = part(kn, new THREE.BoxGeometry(0.22, 0.08, 0.1), mAcc, -0.45);
      foot.position.x = 0.05;
      return { hp, kn, foot };
    };
    const L = arm(-1);
    const R = arm(1);
    const LL = leg(-1);
    const RL = leg(1);
    this.j = { hips, chest, head, sL: L.sh, eL: L.el, sR: R.sh, eR: R.el, hL: LL.hp, kL: LL.kn, hR: RL.hp, kR: RL.kn, fistL: L.fist, fistR: R.fist, footL: LL.foot, footR: RL.foot };
  }

  /** 計算の状態 → かっこう */
  update(f: B3Fighter, dt: number): void {
    const now = performance.now() / 1000;
    const a = f.act;
    let target: Pose = STANCE;
    let rate = 14;
    let spin = 0;
    let bodyLie = 0;
    let tumble = 0;
    let lift = 0;
    this.striking = false;
    let strikeLimb: THREE.Object3D | null = null;
    if (a.k === 'attack') {
      const r = attackPose(a.move, a.t);
      target = r.pose;
      spin = r.spin;
      rate = r.striking ? 45 : 24;
      this.striking = r.striking;
      strikeLimb = a.move === 'jab' || a.move === 'rush' ? this.j.fistL : a.move === 'kick' || a.move === 'spin' || a.move === 'aerial' ? this.j.footR : this.j.fistR;
    } else if (a.k === 'guard') {
      target = GUARD;
      rate = 30;
    } else if (a.k === 'evade') {
      const k = Math.sin((a.t / B3.evade.time) * Math.PI);
      target = P({ hy: -0.25 * k, roll: 0.45 * k, lean: -0.1 });
      rate = 30;
    } else if (a.k === 'step') {
      target = P({ lean: a.back ? 0.25 : -0.35, hy: -0.16, hL: [0.1, 0, a.back ? -0.2 : 0.7], hR: [-0.1, 0, a.back ? 0.3 : -0.5] });
      rate = 25;
    } else if (a.k === 'stun') {
      target = f.lastHit === 'kick' || f.lastHit === 'rush' || f.lastHit === 'smash' ? STUN_BODY : STUN_HIGH;
      rate = 40;
    } else if (a.k === 'air') {
      target = AIR;
      tumble = a.t * 7;
      rate = 20;
    } else if (a.k === 'down' || a.k === 'ko') {
      target = DOWN;
      bodyLie = 1;
      rate = 16;
    } else if (a.k === 'victory') {
      target = VICTORY;
      lift = Math.abs(Math.sin(a.t * 5)) * 0.12;
      rate = 10;
    } else if (f.y > 0) {
      target = JUMP;
      rate = 18;
    } else {
      // 構え: 小きざみに揺れる(格闘ゲームのファイティングポーズ)。歩くと足を運ぶ
      const bounce = Math.sin(now * 7 + f.side) * 0.025;
      target = P({ hy: STANCE.hy + bounce, eL: STANCE.eL + bounce, eR: STANCE.eR - bounce });
      if (f.speed > 0) {
        this.walkPhase += dt * 11;
        const s = Math.sin(this.walkPhase);
        target = P({ hy: target.hy - Math.abs(s) * 0.03, hL: [0.12, 0, STANCE.hL[2] + s * 0.35], kL: STANCE.kL - Math.max(0, s) * 0.5, hR: [-0.12, 0, STANCE.hR[2] - s * 0.35], kR: STANCE.kR - Math.max(0, -s) * 0.5 }, target);
      }
      if (f.exhausted) target = P({ lean: -0.45, hy: -0.2, head: -0.3, sL: [-0.2, 0, 0.4], eL: 0.6, sR: [0.2, 0, 0.4], eR: 0.6 }, target);
    }
    this.cur = mix(this.cur, target, 1 - Math.exp(-dt * rate));
    this.apply(this.cur);
    // 体全体: 回し蹴りの回転・空中できりもみ・たおれる
    this.body.rotation.set(0, spin, 0);
    this.body.position.set(0, lift, 0);
    if (tumble) this.body.rotation.z = 0.9 + Math.sin(tumble) * 0.3;
    if (bodyLie) {
      // あお向けにたおれる
      this.body.rotation.z = Math.PI / 2 - 0.05;
      this.body.position.set(0.85, 0.12, 0);
    }
    this.root.position.set(f.x, f.y, f.z);
    this.root.rotation.y = -f.face;
    if (strikeLimb && this.striking) strikeLimb.getWorldPosition(this.strikePoint);
    // 当たったときの白い光・回避中の半透明
    this.flash = Math.max(0, this.flash - dt);
    const ghost = a.k === 'evade' && a.t < B3.evade.invincible ? 0.55 : a.k === 'down' && a.t < B3.down.invincible ? 0.75 : 1;
    for (const m of this.mats) {
      m.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000);
      m.emissiveIntensity = this.flash > 0 ? 0.9 : 0;
      m.transparent = ghost < 1;
      m.opacity = ghost;
    }
  }

  private apply(p: Pose): void {
    const j = this.j;
    j.hips.position.y = 0.95 + p.hy;
    j.hips.rotation.set(p.roll, p.twist, p.lean);
    j.chest.rotation.set(0, p.chest, 0);
    j.head.rotation.set(0, -p.twist * 0.6, p.head);
    j.sL.rotation.set(p.sL[0], p.sL[1], p.sL[2]);
    j.eL.rotation.set(0, 0, p.eL);
    j.sR.rotation.set(p.sR[0], p.sR[1], p.sR[2]);
    j.eR.rotation.set(0, 0, p.eR);
    // 腰をひねっても足は地面のまま見えるように、股はひねりの逆を少し入れる
    j.hL.rotation.set(p.hL[0], -p.twist * 0.8, p.hL[2]);
    j.kL.rotation.set(0, 0, p.kL);
    j.hR.rotation.set(p.hR[0], -p.twist * 0.8, p.hR[2]);
    j.kR.rotation.set(0, 0, p.kR);
  }
}
