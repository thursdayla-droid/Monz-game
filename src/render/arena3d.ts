/**
 * 3Dオートバトルの見た目(Three.js。企画者 2026-11-01「Three.js を足してよい」)。計算は src/core/battle3d。
 * 企画者 2026-11-01「もっと格闘ゲームぽく(鉄拳・LastFight)」→ ひじ・ひざが曲がる人形(fighterRig.ts)・横からのカメラ・
 * 当たった時の止まり/ゆれ/火花/軌跡・夜のアリーナ にした。
 * - 【仮】アリーナ: 平らな床・低い壁・柱のライト・観客の影(ステージのテーマは未決定)
 * - 【仮】キャラクター: 仮の人形。BUNKの3Dモデルができたら差しかえる(企画者 2026-11-01「3Dモデルができるまで待つ」)
 * - カメラ: 2体を追いかける(B)【仮】。2体を結ぶ線を横から見る(格闘ゲームの見せ方)。2体が離れると引く
 */
import * as THREE from 'three';
import { B3 } from '../core/battle3d/config';
import type { B3Battle, GuardGrade } from '../core/battle3d/engine';
import { FighterRig } from './fighterRig';

const SIDE_COLOR = [0x3a9cff, 0xff4a4a];
const SKIN_COLOR = [0xc9ccd6, 0xbfb4c4];

interface Burst {
  obj: THREE.Object3D;
  t: number;
  life: number;
  grow: number;
  base: number;
}

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 床の模様(つやのある黒い床と、光る線)【仮】 */
function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(512, 512, 60, 512, 512, 720);
  bg.addColorStop(0, '#3a3046');
  bg.addColorStop(1, '#191320');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.04})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 4, 4);
  }
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 3;
  for (let i = 0; i <= 14; i++) {
    const p = (i * 1024) / 14;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 1024);
    g.moveTo(0, p);
    g.lineTo(1024, p);
    g.stroke();
  }
  // まん中の円と、ふちの線
  g.shadowColor = '#ff8a2a';
  g.shadowBlur = 24;
  g.strokeStyle = 'rgba(255,170,60,0.75)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(512, 512, 150, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(512, 512, 175, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,90,60,0.8)';
  g.lineWidth = 10;
  g.strokeRect(22, 22, 980, 980);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 空(上が紫・下が赤い夜) */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0a0614');
  gr.addColorStop(0.55, '#2a1036');
  gr.addColorStop(0.8, '#5a1a30');
  gr.addColorStop(1, '#1a0a14');
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sparkTexture(color: string, rays = 16): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const r = i % 2 === 0 ? 64 : 16;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Arena3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 120);
  private rigs: FighterRig[] = [];
  private bursts: Burst[] = [];
  private sparks: Record<string, THREE.SpriteMaterial> = {};
  private trailMat: THREE.SpriteMaterial[] = [];
  private camLook = new THREE.Vector3(0, 1, 0);
  private yaw = 0;
  private camDist = 6;
  private shakeAmp = 0;
  /** 演出のズーム(1 = ふつう) */
  zoom = 1;
  private gradient = toonGradient();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x0a0614);
    this.scene.fog = new THREE.Fog(0x14081c, 16, 40);

    // 空
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    this.scene.add(sky);

    // 光: 全体・上からの強い光(影)・左右の青と赤の光(格闘ゲームらしい色)
    this.scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x2a1a30, 1.2));
    const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
    sun.position.set(-3, 14, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    this.scene.add(sun);
    const rimB = new THREE.PointLight(0x3a8aff, 30, 20);
    rimB.position.set(-6, 4, -6);
    const rimR = new THREE.PointLight(0xff3a5a, 30, 20);
    rimR.position.set(6, 4, 6);
    this.scene.add(rimB, rimR);

    const H = B3.arena.half;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.35, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const outer = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x120c18, roughness: 0.9 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.3;
    this.scene.add(outer);
    // 台(少し高いステージ)
    const base = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.6, 0.3, H * 2 + 0.6), new THREE.MeshToonMaterial({ color: 0x241a2e, gradientMap: this.gradient }));
    base.position.y = -0.16;
    this.scene.add(base);
    // 低い壁と光る線
    const wallMat = new THREE.MeshToonMaterial({ color: 0x302640, gradientMap: this.gradient });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
    for (let i = 0; i < 4; i++) {
      const horiz = i < 2;
      const s = i % 2 === 0 ? 1 : -1;
      const w = new THREE.Mesh(new THREE.BoxGeometry(horiz ? H * 2 + 0.6 : 0.3, 0.5, horiz ? 0.3 : H * 2 + 0.6), wallMat);
      w.position.set(horiz ? 0 : s * (H + 0.15), 0.25, horiz ? s * (H + 0.15) : 0);
      w.castShadow = w.receiveShadow = true;
      this.scene.add(w);
      const l = new THREE.Mesh(new THREE.BoxGeometry(horiz ? H * 2 + 0.62 : 0.32, 0.05, horiz ? 0.32 : H * 2 + 0.62), lineMat);
      l.position.set(w.position.x, 0.52, w.position.z);
      this.scene.add(l);
    }
    // 四すみの柱とライト
    const glow = glowTexture();
    for (const [x, z] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.2, 10), wallMat);
      pillar.position.set(x * (H + 0.3), 1.6, z * (H + 0.3));
      pillar.castShadow = true;
      this.scene.add(pillar);
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: x * z > 0 ? 0xff5a3a : 0x3a9aff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      lamp.position.set(x * (H + 0.3), 3.35, z * (H + 0.3));
      lamp.scale.setScalar(1.6);
      this.scene.add(lamp);
    }
    // 観客の影(遠くに並ぶ)【仮】
    const crowdMat = new THREE.MeshBasicMaterial({ color: 0x0c0612 });
    const crowdGeo = new THREE.CapsuleGeometry(0.28, 0.5, 3, 6);
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 220);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * Math.PI * 2 + Math.random() * 0.02;
      const r = 13 + (i % 3) * 1.4 + Math.random() * 0.5;
      m.makeTranslation(Math.cos(a) * r, 0.2 + (i % 3) * 0.7 + Math.random() * 0.2, Math.sin(a) * r);
      crowd.setMatrixAt(i, m);
    }
    this.scene.add(crowd);

    for (const side of [0, 1]) {
      const rig = new FighterRig(SKIN_COLOR[side], SIDE_COLOR[side], this.gradient);
      this.scene.add(rig.root);
      // 足もとの輪(青 = 自分・赤 = 相手)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: SIDE_COLOR[side], transparent: true, opacity: 0.7 }));
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'ring';
      this.scene.add(ring);
      this.rigs.push(rig);
      this.rings.push(ring);
    }
    const add = (color: string, rays = 16) => new THREE.SpriteMaterial({ map: sparkTexture(color, rays), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparks.hit = add('rgba(255,190,60,0.95)');
    this.sparks.big = add('rgba(255,70,30,0.95)', 22);
    this.sparks.guard = add('rgba(90,170,255,0.95)', 10);
    this.sparks.perfect = add('rgba(120,255,240,0.95)', 24);
    this.sparks.dust = new THREE.SpriteMaterial({ map: glow, color: 0x9a8aa8, transparent: true, depthWrite: false, opacity: 0.6 });
    for (const side of [0, 1]) this.trailMat.push(new THREE.SpriteMaterial({ map: glow, color: SIDE_COLOR[side], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  private rings: THREE.Mesh[] = [];

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private addBurst(obj: THREE.Object3D, life: number, grow: number, base: number): void {
    this.scene.add(obj);
    this.bursts.push({ obj, t: 0, life, grow, base });
  }

  /** 当たった・ガードした所に光 */
  spark(x: number, y: number, z: number, kind: 'hit' | 'big' | 'guard' | 'perfect', size = 1): void {
    const s = new THREE.Sprite(this.sparks[kind]);
    s.position.set(x, y, z);
    s.material.rotation = Math.random() * Math.PI;
    this.addBurst(s, kind === 'big' ? B3.fx.fifth.vfx : 0.2, 2.4 * size, 0.7 * size);
    // 飛び散る小さい光
    for (let i = 0; i < (kind === 'big' ? 10 : 5); i++) {
      const p = new THREE.Sprite(this.sparks[kind === 'guard' || kind === 'perfect' ? kind : 'hit']);
      p.position.set(x + (Math.random() - 0.5) * 0.6 * size, y + (Math.random() - 0.3) * 0.6 * size, z + (Math.random() - 0.5) * 0.6 * size);
      this.addBurst(p, 0.18 + Math.random() * 0.12, -0.8, 0.22 * size);
    }
  }

  /** 地面に広がる輪(ジャストガード・5ヒット目) */
  ring(x: number, z: number, color: number, life = 0.35): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    this.addBurst(m, life, 6, 1);
  }

  /** 着地・ダウンの土けむり */
  dust(x: number, z: number, big: boolean): void {
    for (let i = 0; i < (big ? 8 : 4); i++) {
      const s = new THREE.Sprite(this.sparks.dust);
      s.position.set(x + (Math.random() - 0.5) * 0.8, 0.15, z + (Math.random() - 0.5) * 0.8);
      this.addBurst(s, 0.45, 2, big ? 0.6 : 0.4);
    }
  }

  flash(side: number): void {
    this.rigs[side].flash = 0.1;
  }

  /** 画面のゆれ(強さ) */
  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  /** 1フレーム描く */
  render(b: B3Battle, dt: number): void {
    b.f.forEach((f, i) => {
      const rig = this.rigs[i];
      rig.update(f, dt);
      const ring = this.rings[i];
      ring.position.set(f.x, 0.02, f.z);
      (ring.material as THREE.MeshBasicMaterial).opacity = f.act.k === 'ko' ? 0.15 : 0.7;
      // 技の軌跡(当てている間、こぶし・足のあとに光を残す)
      if (rig.striking && dt > 0) {
        const s = new THREE.Sprite(this.trailMat[i]);
        s.position.copy(rig.strikePoint);
        this.addBurst(s, 0.14, -0.6, 0.38);
      }
    });
    for (const p of this.bursts) {
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      const s = p.base * Math.max(0.05, 1 + p.grow * k);
      p.obj.scale.setScalar(s);
      const mat = (p.obj as THREE.Mesh | THREE.Sprite).material as THREE.Material & { opacity: number };
      if (p.obj instanceof THREE.Sprite) p.obj.material.opacity = 1 - k;
      else mat.opacity = 0.9 * (1 - k);
    }
    this.bursts = this.bursts.filter((p) => {
      if (p.t < p.life) return true;
      this.scene.remove(p.obj);
      if (!(p.obj instanceof THREE.Sprite)) {
        const mesh = p.obj as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      return false;
    });
    this.follow(b, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * カメラ: 2体を結ぶ線を横から見る(格闘ゲームの見せ方)。2体が回り込むと、カメラもゆっくり回る。
   * 2体が離れると引き、近いと寄る。【仮】(カメラの種類は未決定。企画者 2026-11-01 試作では B 追いかける)
   */
  private follow(b: B3Battle, dt: number): void {
    const [p, q] = b.f;
    const cx = (p.x + q.x) / 2;
    const cz = (p.z + q.z) / 2;
    const line = Math.atan2(q.z - p.z, q.x - p.x);
    // 線に直角の2つの向きのうち、今のカメラに近いほう(急に反対側へ回らない)
    let want = line + Math.PI / 2;
    const diff = (a: number) => Math.atan2(Math.sin(a - this.yaw), Math.cos(a - this.yaw));
    if (Math.abs(diff(want)) > Math.PI / 2) want += Math.PI;
    this.yaw += diff(want) * (1 - Math.exp(-dt * 2.2));
    const sep = Math.hypot(q.x - p.x, q.z - p.z);
    const air = Math.max(p.y, q.y);
    const wide = this.camera.aspect;
    const target = Math.max(3.9, (sep * 0.5 + 1.3) / Math.tan((this.camera.fov * Math.PI) / 360) / Math.max(0.9, wide) + air * 0.6);
    this.camDist += (target - this.camDist) * (1 - Math.exp(-dt * (target > this.camDist ? 6 : 2)));
    this.camLook.lerp(new THREE.Vector3(cx, 1.2 + air * 0.4, cz), 1 - Math.exp(-dt * 6));
    const d = this.camDist;
    const pos = new THREE.Vector3(this.camLook.x + Math.cos(this.yaw) * d, 1.35 + d * 0.16, this.camLook.z + Math.sin(this.yaw) * d);
    // ゆれ
    if (this.shakeAmp > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shakeAmp;
      pos.y += (Math.random() - 0.5) * this.shakeAmp;
      pos.z += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-dt * 14);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.zoom - this.zoom) > 1e-4) {
      this.camera.zoom = this.zoom;
      this.camera.updateProjectionMatrix();
    }
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
