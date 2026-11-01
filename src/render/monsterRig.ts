/**
 * 3Dバトル(アニメのモンスターバトル風・企画者 2026-11-01)の【仮】のモンスター。
 * 丸い体・大きな目・小さな角・短い手足・しっぽ。BUNKの3Dモデルが届いたら差しかえる(BUNKの見た目はまだ使わない)。
 * 既存の作品のキャラクターに似せない。向き: 体の前 = +x、上 = +y。
 */
import * as THREE from 'three';
import { TECHS } from '../core/battle3d/animeConfig';
import type { AnimeMon } from '../core/battle3d/anime';

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1a1020, side: THREE.BackSide });

export class MonsterRig {
  readonly root = new THREE.Group();
  /** 体全体(つぶれる・のびる・回る) */
  readonly body = new THREE.Group();
  readonly mats: THREE.MeshToonMaterial[] = [];
  /** 技を撃つ口の場所(光をためる所) */
  readonly mouth = new THREE.Object3D();
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private tail: THREE.Group;
  private eyes: THREE.Group;
  private xEyes: THREE.Group;
  private hop = 0;
  flash = 0;

  constructor(color: number, belly: number, horn: number, gradient: THREE.Texture) {
    const mat = (c: number) => {
      const m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradient });
      this.mats.push(m);
      return m;
    };
    const mBody = mat(color);
    const mBelly = mat(belly);
    const mHorn = mat(horn);
    const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, outline = true) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      if (outline) {
        const o = new THREE.Mesh(geo, OUTLINE);
        o.scale.setScalar(1.06);
        mesh.add(o);
      }
      return mesh;
    };
    this.root.add(this.body);
    // 丸い体(頭と体がひとつ)
    const torso = part(this.body, new THREE.SphereGeometry(0.62, 28, 20), mBody, 0, 0.78, 0);
    torso.scale.set(1, 0.92, 0.95);
    const bellyM = part(this.body, new THREE.SphereGeometry(0.44, 20, 14), mBelly, 0.26, 0.62, 0, false);
    bellyM.scale.set(0.5, 0.9, 0.9);
    // 目(大きい・アニメ風)
    this.eyes = new THREE.Group();
    this.body.add(this.eyes);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const black = new THREE.MeshBasicMaterial({ color: 0x14101c });
    for (const z of [-0.2, 0.2]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), white);
      e.position.set(0.5, 0.98, z);
      e.scale.set(0.5, 1.2, 0.9);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), black);
      p.position.set(0.06, 0.0, 0);
      e.add(p);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), white);
      shine.position.set(0.1, 0.05, 0.03);
      e.add(shine);
      this.eyes.add(e);
    }
    // たおれた時の × の目
    this.xEyes = new THREE.Group();
    this.xEyes.visible = false;
    this.body.add(this.xEyes);
    for (const z of [-0.2, 0.2])
      for (const r of [0.8, -0.8]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.05), black);
        bar.position.set(0.6, 0.98, z);
        bar.rotation.x = r;
        this.xEyes.add(bar);
      }
    // 口(技を撃つ所)
    this.mouth.position.set(0.66, 0.72, 0);
    this.body.add(this.mouth);
    // 角(小さい2本)
    for (const z of [-0.26, 0.26]) {
      const h = part(this.body, new THREE.ConeGeometry(0.09, 0.32, 10), mHorn, -0.05, 1.42, z);
      h.rotation.x = z > 0 ? 0.35 : -0.35;
    }
    // 手(短い)
    const arm = (z: number) => {
      const g = new THREE.Group();
      g.position.set(0.1, 0.7, z);
      this.body.add(g);
      part(g, new THREE.CapsuleGeometry(0.1, 0.16, 4, 8), mBody, 0.1, -0.08, 0).rotation.z = 1.0;
      return g;
    };
    this.armL = arm(-0.58);
    this.armR = arm(0.58);
    // 足(短い)
    const leg = (z: number) => {
      const g = new THREE.Group();
      g.position.set(0, 0.28, z);
      this.body.add(g);
      const foot = part(g, new THREE.SphereGeometry(0.17, 12, 10), mBody, 0.05, -0.16, 0);
      foot.scale.set(1.3, 0.7, 1);
      return g;
    };
    this.legL = leg(-0.28);
    this.legR = leg(0.28);
    // しっぽ
    this.tail = new THREE.Group();
    this.tail.position.set(-0.55, 0.45, 0);
    this.body.add(this.tail);
    const t1 = part(this.tail, new THREE.ConeGeometry(0.14, 0.55, 10), mBody, -0.2, 0.05, 0);
    t1.rotation.z = Math.PI / 2 + 0.5;
  }

  update(f: AnimeMon, dt: number): void {
    const now = performance.now() / 1000;
    const a = f.act;
    this.root.position.set(f.x, f.y, f.z);
    this.root.rotation.y = -f.face;
    const b = this.body;
    let sx = 1;
    let sy = 1;
    let rotZ = 0;
    let rotX = 0;
    let rotY = 0;
    let lift = 0;
    let arm = 0;
    let legSwing = 0;
    this.eyes.visible = a.k !== 'ko';
    this.xEyes.visible = a.k === 'ko';
    if (a.k === 'tech') {
      const tech = TECHS[a.id];
      const w = Math.min(1, a.t / tech.windup);
      if (!a.fired) {
        // ため: 体をちぢめて力をためる(ビームは長く・ふるえる)
        sy = 1 - w * 0.18;
        sx = 1 + w * 0.12;
        rotZ = w * 0.25;
        arm = w;
        if (tech.kind === 'beam') b.position.x = Math.sin(now * 60) * 0.02 * w;
      } else {
        const k = a.t - tech.windup;
        if (tech.kind === 'shot' || tech.kind === 'beam') {
          // 撃つ: 前へのびる
          const p = Math.max(0, 1 - k / 0.25);
          sx = 1 + 0.25 * p;
          sy = 1 - 0.1 * p;
          rotZ = -0.35 * p - (tech.kind === 'beam' && k < tech.duration ? 0.3 : 0);
          arm = -0.5;
        } else if (tech.kind === 'rush') {
          rotZ = -0.55;
          sx = 1.15;
          sy = 0.9;
          legSwing = Math.sin(now * 30) * 0.9;
        } else if (tech.kind === 'quake') {
          // 飛び上がって回る → 着地でつぶれる
          if (f.y > 0) rotX = k * 12;
          else {
            sy = 0.75;
            sx = 1.2;
          }
          arm = 1;
        }
      }
    } else if (a.k === 'dodge') {
      const p = Math.sin(Math.min(1, a.t / 0.4) * Math.PI);
      rotX = (a.dz > 0 ? 1 : -1) * p * (a.jump ? Math.PI * 2 * Math.min(1, a.t / 0.4) : 0.6);
      sy = 1 - p * 0.1;
    } else if (a.k === 'hurt') {
      const p = 1 - a.t / a.until;
      rotZ = 0.45 * p;
      sx = 1 + 0.15 * p;
      sy = 1 - 0.15 * p;
    } else if (a.k === 'air') {
      rotZ = 0.6 + a.t * 9;
    } else if (a.k === 'down' || a.k === 'ko') {
      rotZ = Math.PI / 2;
      lift = 0.05;
      if (a.k === 'down') rotY = Math.sin(now * 20) * 0.03;
    } else if (a.k === 'victory') {
      lift = Math.abs(Math.sin(a.t * 6)) * 0.45;
      arm = 1.2;
      rotY = Math.sin(a.t * 3) * 0.4;
    } else {
      // ふだん: ぷるぷる揺れる。歩くと、ぴょこぴょこ跳ねる
      const breathe = Math.sin(now * 4 + f.side * 2) * 0.03;
      sy = 1 + breathe;
      sx = 1 - breathe * 0.6;
      if (f.speed > 0) {
        this.hop += dt * 12;
        lift = Math.abs(Math.sin(this.hop)) * 0.18;
        legSwing = Math.sin(this.hop) * 0.6;
        rotZ = -0.1;
      }
      arm = 0.25 + breathe * 3;
    }
    b.scale.set(sx, sy, sx);
    b.rotation.set(rotX, rotY, rotZ);
    b.position.y = lift;
    if (a.k !== 'tech' || TECHS[a.id].kind !== 'beam') b.position.x = 0;
    this.armL.rotation.set(0, 0, arm * 0.9);
    this.armR.rotation.set(0, 0, arm * 0.9);
    this.legL.rotation.set(0, 0, legSwing);
    this.legR.rotation.set(0, 0, -legSwing);
    this.tail.rotation.set(0, Math.sin(now * 5) * 0.4, 0);
    // 当たった時の白い光・よけている時の半透明
    this.flash = Math.max(0, this.flash - dt);
    const ghost = a.k === 'dodge' && a.t < 0.3 ? 0.6 : 1;
    for (const m of this.mats) {
      m.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000);
      m.emissiveIntensity = this.flash > 0 ? 0.9 : 0;
      m.transparent = ghost < 1;
      m.opacity = ghost;
    }
  }
}
