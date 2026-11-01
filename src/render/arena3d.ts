/**
 * 3Dオートバトルの見た目(Three.js。企画者 2026-11-01「Three.js を足してよい」)。計算は src/core/battle3d。
 * - 【仮】アリーナ: 平らな床と低い壁(ステージのテーマは未決定)
 * - 【仮】キャラクター: 灰色の「仮の人形」。BUNKの3Dモデルができたら差しかえる(企画者 2026-11-01「3Dモデルができるまで待つ」)。
 *   BUNKの絵は使わない(デザインを勝手に変えないため)
 * - カメラ: 斜め上から、2体を追いかける(B)【仮】(企画者 2026-11-01。あとで A固定・C アクション に変えられるように、ここだけで決める)
 */
import * as THREE from 'three';
import { B3 } from '../core/battle3d/config';
import type { B3Battle, B3Fighter, GuardGrade } from '../core/battle3d/engine';

const SIDE_COLOR = [0x4aa8ff, 0xff5a5a];
const BODY_COLOR = [0x9aa0aa, 0x8a8590];

interface Doll {
  root: THREE.Group;
  body: THREE.Group;
  fistL: THREE.Mesh;
  fistR: THREE.Mesh;
  mats: THREE.MeshToonMaterial[];
  ring: THREE.Mesh;
  flash: number;
}

interface Burst {
  obj: THREE.Object3D;
  t: number;
  life: number;
  grow: number;
}

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 床の模様(コンクリートと線)【仮】 */
function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a4552';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo((i * 512) / 8, 0);
    g.lineTo((i * 512) / 8, 512);
    g.moveTo(0, (i * 512) / 8);
    g.lineTo(512, (i * 512) / 8);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,210,58,0.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(256, 256, 90, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,210,58,0.35)';
  g.strokeRect(14, 14, 484, 484);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sparkTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 64 : 22;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Arena3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private dolls: Doll[] = [];
  private bursts: Burst[] = [];
  private sparks: Record<string, THREE.SpriteMaterial> = {};
  private camPos = new THREE.Vector3(0, 9, 11);
  private camLook = new THREE.Vector3();
  /** カメラの回りこみの角度(0 = 手前から) */
  private yaw = 0;
  private camDist = 10;
  private probe = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  /** 演出のズーム(1 = ふつう) */
  zoom = 1;
  private gradient = toonGradient();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x1b1024);
    this.scene.fog = new THREE.Fog(0x1b1024, 18, 34);

    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a2a40, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-5, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -10;
    sc.right = sc.top = 10;
    this.scene.add(sun);

    const H = B3.arena.half;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshLambertMaterial({ map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // 外の床(暗い)
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x22182a }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    this.scene.add(outer);
    // 壁(低い)と光る線
    const wallMat = new THREE.MeshToonMaterial({ color: 0x3a2f48, gradientMap: this.gradient });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    for (let i = 0; i < 4; i++) {
      const horiz = i < 2;
      const s = i % 2 === 0 ? 1 : -1;
      const w = new THREE.Mesh(new THREE.BoxGeometry(horiz ? H * 2 + 0.6 : 0.3, 0.7, horiz ? 0.3 : H * 2 + 0.6), wallMat);
      w.position.set(horiz ? 0 : s * (H + 0.15), 0.35, horiz ? s * (H + 0.15) : 0);
      w.castShadow = w.receiveShadow = true;
      this.scene.add(w);
      const l = new THREE.Mesh(new THREE.BoxGeometry(horiz ? H * 2 + 0.6 : 0.32, 0.06, horiz ? 0.32 : H * 2 + 0.6), lineMat);
      l.position.set(w.position.x, 0.72, w.position.z);
      this.scene.add(l);
    }
    for (const side of [0, 1]) this.dolls.push(this.makeDoll(side));
    this.sparks.hit = new THREE.SpriteMaterial({ map: sparkTexture('rgba(255,190,60,0.95)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparks.big = new THREE.SpriteMaterial({ map: sparkTexture('rgba(255,80,40,0.95)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparks.guard = new THREE.SpriteMaterial({ map: sparkTexture('rgba(90,170,255,0.95)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparks.perfect = new THREE.SpriteMaterial({ map: sparkTexture('rgba(120,255,240,0.95)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  /** 【仮】仮の人形(丸い体・頭・目・こぶし)。BUNKのモデルが届いたら差しかえる */
  private makeDoll(side: number): Doll {
    const mat = (c: number) => new THREE.MeshToonMaterial({ color: c, gradientMap: this.gradient });
    const bodyMat = mat(BODY_COLOR[side]);
    const accent = mat(SIDE_COLOR[side]);
    const dark = new THREE.MeshBasicMaterial({ color: 0x16101c });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.42, 6, 14), bodyMat);
    torso.position.y = 0.72;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.05, 6, 20), accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.62;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), bodyMat);
    head.position.y = 1.36;
    const eyeG = new THREE.SphereGeometry(0.05, 8, 6);
    const eyeL = new THREE.Mesh(eyeG, dark);
    eyeL.position.set(0.26, 1.4, 0.1);
    const eyeR = eyeL.clone();
    eyeR.position.z = -0.1;
    const fistG = new THREE.SphereGeometry(0.14, 12, 10);
    const fistL = new THREE.Mesh(fistG, accent);
    const fistR = new THREE.Mesh(fistG, accent);
    const footG = new THREE.SphereGeometry(0.13, 10, 8);
    const footL = new THREE.Mesh(footG, bodyMat);
    footL.position.set(0.05, 0.1, 0.18);
    const footR = footL.clone();
    footR.position.z = -0.18;
    for (const m of [torso, head, fistL, fistR, footL, footR, belt]) m.castShadow = true;
    body.add(torso, belt, head, eyeL, eyeR, fistL, fistR, footL, footR);
    // 足もとの輪(どちらか分かるように。青 = 自分・赤 = 相手)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 32), new THREE.MeshBasicMaterial({ color: SIDE_COLOR[side], transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    root.add(ring);
    this.scene.add(root);
    return { root, body, fistL, fistR, mats: [bodyMat], ring, flash: 0 };
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 当たった・ガードした所に光 */
  spark(x: number, y: number, z: number, kind: 'hit' | 'big' | 'guard' | 'perfect', size = 1): void {
    const s = new THREE.Sprite(this.sparks[kind]);
    s.position.set(x, y, z);
    s.scale.setScalar(0.6 * size);
    this.scene.add(s);
    this.bursts.push({ obj: s, t: 0, life: kind === 'big' ? B3.fx.fifth.vfx : 0.22, grow: 2.2 * size });
  }

  /** 地面に広がる輪(ジャストガード・5ヒット目) */
  ring(x: number, z: number, color: number, life = 0.35): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    this.scene.add(m);
    this.bursts.push({ obj: m, t: 0, life, grow: 6 });
  }

  flash(side: number): void {
    this.dolls[side].flash = 0.12;
  }

  /** 1フレーム描く */
  render(b: B3Battle, dt: number): void {
    b.f.forEach((f, i) => this.pose(this.dolls[i], f, dt));
    // 光の演出
    for (const p of this.bursts) {
      p.t += dt;
      const k = p.t / p.life;
      const s = 1 + p.grow * k;
      if (p.obj instanceof THREE.Sprite) {
        p.obj.scale.setScalar(0.6 * s);
        p.obj.material.opacity = 1 - k;
      } else {
        p.obj.scale.setScalar(s);
        ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      }
    }
    this.bursts = this.bursts.filter((p) => {
      if (p.t < p.life) return true;
      this.scene.remove(p.obj);
      if (!(p.obj instanceof THREE.Sprite)) ((p.obj as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
      return false;
    });
    this.follow(b, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * カメラ: 斜め上から、2体が両方入るように追いかける(B)【仮】。
   * スマホの縦長の画面では横がせまいので、2体を結ぶ線が画面のななめ(奥行き)に入るよう、ゆっくり回りこむ。
   * 2体が画面に入る いちばん近い距離をさがして、なめらかに近づく
   */
  private follow(b: B3Battle, dt: number): void {
    const [p, q] = b.f;
    const cx = (p.x + q.x) / 2;
    const cz = (p.z + q.z) / 2;
    // 2体を結ぶ線と、カメラの見る向きの角度を 約40度に(縦長ほど奥行きを使う)
    const line = Math.atan2(q.z - p.z, q.x - p.x);
    const off = this.camera.aspect < 0.8 ? 0.7 : 1.2;
    const cands = [line + Math.PI / 2 - (Math.PI / 2 - off), line + Math.PI / 2 + (Math.PI / 2 - off), line - Math.PI / 2 - (Math.PI / 2 - off), line - Math.PI / 2 + (Math.PI / 2 - off)];
    let want = this.yaw;
    let best = Infinity;
    for (const c of cands) {
      const dd = Math.abs(Math.atan2(Math.sin(c - this.yaw), Math.cos(c - this.yaw)));
      if (dd < best) {
        best = dd;
        want = c;
      }
    }
    const turn = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += turn * (1 - Math.exp(-dt * 0.8));
    // 2体が入る距離
    const look = new THREE.Vector3(cx, 0.8, cz);
    let dist = 8;
    const probe = this.probe;
    probe.aspect = this.camera.aspect;
    probe.fov = this.camera.fov;
    probe.updateProjectionMatrix();
    const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (; dist < 18; dist += 0.5) {
      probe.position.set(cx + Math.sin(this.yaw) * dist * 0.82, dist * 0.78, cz + Math.cos(this.yaw) * dist * 0.82);
      probe.lookAt(look);
      probe.updateMatrixWorld();
      pts[0].set(p.x, p.y + 1.7, p.z);
      pts[1].set(p.x, p.y, p.z);
      pts[2].set(q.x, q.y + 1.7, q.z);
      pts[3].set(q.x, q.y, q.z);
      if (pts.every((v) => {
        v.project(probe);
        return Math.abs(v.x) < 0.78 && v.y > -0.55 && v.y < 0.62;
      })) break;
    }
    // 離れるときは早く、近づくときはゆっくり(2体が画面から出ないように)
    this.camDist += (dist - this.camDist) * (1 - Math.exp(-dt * (dist > this.camDist ? 7 : 1.5)));
    this.camLook.lerp(look, 1 - Math.exp(-dt * 4));
    const cd = this.camDist;
    this.camPos.set(this.camLook.x + Math.sin(this.yaw) * cd * 0.82, cd * 0.78, this.camLook.z + Math.cos(this.yaw) * cd * 0.82);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.zoom - this.zoom) > 1e-4) {
      this.camera.zoom = this.zoom;
      this.camera.updateProjectionMatrix();
    }
  }

  /** 計算の状態 → 人形のかっこう */
  private pose(d: Doll, f: B3Fighter, dt: number): void {
    const t = performance.now() / 1000;
    d.root.position.set(f.x, f.y, f.z);
    d.root.rotation.y = -f.face;
    d.body.rotation.set(0, 0, 0);
    d.body.position.set(0, 0, 0);
    // こぶしの基本の位置(体の前・左右)
    const fl = new THREE.Vector3(0.3, 0.85, 0.32);
    const fr = new THREE.Vector3(0.3, 0.85, -0.32);
    const a = f.act;
    const bob = f.speed > 0 ? Math.abs(Math.sin(t * 12)) * 0.08 : Math.sin(t * 3) * 0.02;
    d.body.position.y = bob;
    let alpha = 1;
    if (a.k === 'attack') {
      const mv = B3.moves[a.move];
      const w = Math.min(1, a.t / mv.windup);
      const hitEnd = mv.windup + mv.active;
      const out = a.t < mv.windup ? 0 : a.t < hitEnd ? 1 : Math.max(0, 1 - (a.t - hitEnd) / Math.max(0.05, mv.recovery));
      const reach = Math.min(1.1, mv.reach * 0.65);
      if (a.move === 'spin') {
        d.body.rotation.y = out > 0 ? -((a.t - mv.windup) / mv.active) * Math.PI * 2 : w * 0.6;
        fl.set(0.1, 0.9, 0.75);
        fr.set(0.1, 0.9, -0.75);
      } else if (a.move === 'upper') {
        fr.set(0.25 - w * 0.2 + out * 0.35, 0.55 + out * 1.1, -0.25);
        d.body.position.y += out * 0.25;
      } else if (a.move === 'smash') {
        d.body.rotation.z = -w * 0.35 + out * 0.6;
        fr.set(-0.15 * w + out * (reach + 0.3), 1.2 - out * 0.3, -0.2);
        fl.set(-0.1 * w + out * (reach + 0.2), 1.1 - out * 0.3, 0.2);
      } else {
        // パンチ(ためで少し引いて、前へのばす)
        const fist = a.move === 'jab' ? fl : fr;
        fist.x = 0.3 - w * 0.2 * (1 - out) + out * reach;
        fist.y = 0.95;
        fist.z *= 1 - out * 0.7;
        d.body.rotation.z = -out * 0.18;
      }
    } else if (a.k === 'guard') {
      fl.set(0.38, 1.25, 0.14);
      fr.set(0.38, 1.25, -0.14);
      d.body.rotation.z = 0.12;
    } else if (a.k === 'evade') {
      d.body.rotation.x = Math.sin((a.t / B3.evade.time) * Math.PI) * 0.6 * (a.dz > 0 ? 1 : -1);
      alpha = a.t < B3.evade.invincible ? 0.55 : 1;
    } else if (a.k === 'stun') {
      d.body.rotation.z = 0.35;
      fl.set(0, 0.9, 0.45);
      fr.set(0, 0.9, -0.45);
    } else if (a.k === 'air' || a.k === 'down' || a.k === 'ko') {
      d.body.rotation.z = Math.PI / 2 - (a.k === 'air' ? 0.4 : 0);
      // 横にたおれる(輪の上に体がくるように、ずらす)
      d.body.position.x = 0.8;
      d.body.position.y = 0.36;
      alpha = a.k === 'down' && a.t < B3.down.invincible ? 0.7 + Math.sin(t * 40) * 0.2 : 1;
    } else if (a.k === 'victory') {
      // 【仮】勝利モーション(性格ごとの動きは未決定)。こぶしを上げて跳ねる
      d.body.position.y = Math.abs(Math.sin(a.t * 6)) * 0.35;
      fl.set(0.1, 1.9, 0.3);
      fr.set(0.1, 1.9, -0.3);
      d.root.rotation.y = -f.face + Math.sin(a.t * 2) * 0.3;
    }
    if (f.exhausted && a.k === 'free') d.body.rotation.z = -0.25 + Math.sin(t * 6) * 0.05;
    d.fistL.position.lerp(fl, 1 - Math.exp(-dt * 30));
    d.fistR.position.lerp(fr, 1 - Math.exp(-dt * 30));
    // 当たったときの白い光
    d.flash = Math.max(0, d.flash - dt);
    for (const m of d.mats) {
      m.emissive.setHex(d.flash > 0 ? 0xffffff : 0x000000);
      m.emissiveIntensity = d.flash > 0 ? 0.8 : 0;
      m.transparent = alpha < 1;
      m.opacity = alpha;
    }
    (d.ring.material as THREE.MeshBasicMaterial).opacity = a.k === 'ko' ? 0.2 : 0.8;
    d.ring.position.y = 0.02 - f.y;
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
  }
}

export const guardLabel: Record<GuardGrade, string> = { perfect: 'PERFECT!', good: 'GOOD!', pre: 'GUARD', guard: 'GUARD' };
