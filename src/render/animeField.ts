/**
 * 3Dバトル(アニメのモンスターバトル風・企画者 2026-11-01)の見た目。計算は src/core/battle3d/anime.ts。
 * - 【仮】広い野外のバトル場: 青空・雲・草のコート(白い線)・まわりの木と岩・遠くの山
 * - 【仮】モンスター: monsterRig.ts(BUNKの3Dモデル待ち)
 * - 技の光: 弾(光る玉と尾)・ビーム(ためる光と太い光線)・衝撃波(広がる輪と岩)・突進(土けむり)・爆発
 * - カメラ: 自分のMONZのななめ後ろから、相手を見る(アニメ・ゲームのモンスターバトルの見せ方)【仮】
 */
import * as THREE from 'three';
import { ANIME, type Element, type TechId } from '../core/battle3d/animeConfig';
import type { AnimeBattle } from '../core/battle3d/anime';
import { getTech } from '../core/battle3d/techTable';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../assetUrl';
import { MonsterRig } from './monsterRig';

/** 企画者の BUNK の3Dモデル(軽くしたもの。design/battle3d/README.md) */
export const BUNK_MODEL_FILE = 'assets/battle3d/bunk.glb';
/** 【仮】ゲームの中の高さ・色違い(相手)の色相の回し方 */
const MODEL = { height: 1.55, rivalHue: 2.4 };

export const ELEMENT_HEX: Record<Element, number> = { 炎: 0xff6a2a, 水: 0x3aa8ff, 自然: 0x6ad04a, 雷: 0xffd23a, 光: 0xfff2a0, 闇: 0xa05aff, 無: 0xe0e0f0 };
/** 力の光の色(無属性は白だと見えにくいので、あたたかい色) */
const auraColor = (e: Element) => (e === '無' ? 0xffb04a : ELEMENT_HEX[e]);

interface Burst {
  obj: THREE.Object3D;
  t: number;
  life: number;
  grow: number;
  base: number;
  vy?: number;
  vx?: number;
  vz?: number;
  fade?: boolean;
}

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 草のコート(しま模様と白い線)【仮】 */
function courtTexture(): THREE.CanvasTexture {
  const W = 1200;
  const H = 800;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#5fb04a' : '#56a443';
    g.fillRect((i * W) / 12, 0, W / 12 + 1, H);
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,60,10' : '200,240,150'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 4);
  }
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 10;
  g.strokeRect(24, 24, W - 48, H - 48);
  g.beginPath();
  g.moveTo(W / 2, 24);
  g.lineTo(W / 2, H - 24);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 110, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 7;
  g.strokeRect(24, H / 2 - 170, 150, 340);
  g.strokeRect(W - 174, H / 2 - 170, 150, 340);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2a7ae0');
  gr.addColorStop(0.45, '#6ab8f5');
  gr.addColorStop(0.5, '#cfe9ff');
  gr.addColorStop(1, '#9ad07a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 256);
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
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = i % 2 === 0 ? 64 : 20;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

function cloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [x, y, r] of [
    [70, 80, 40],
    [120, 60, 52],
    [175, 78, 40],
    [100, 90, 34],
    [150, 92, 34],
  ])
    g.beginPath(), g.arc(x, y, r, 0, Math.PI * 2), g.fill();
  return new THREE.CanvasTexture(c);
}

export class AnimeField {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
  private rigs: MonsterRig[] = [];
  private bursts: Burst[] = [];
  private glow = glowTexture();
  private star = starTexture();
  private shotObjs = new Map<number, THREE.Group>();
  private beamObjs: THREE.Group[] = [];
  private quakeObjs: THREE.Mesh[] = [];
  private charge: THREE.Sprite[] = [];
  private domes: THREE.Group[] = [];
  private stars: THREE.Group[] = [];
  private markers: { obj: THREE.Group; r: number; until: number }[] = [];
  private camPos = new THREE.Vector3(-12, 5, 6);
  private camLook = new THREE.Vector3();
  private shakeAmp = 0;
  zoom = 1;
  /** モデルの読みこみが終わった(失敗したときも true。仮のモンスターのまま) */
  ready = false;
  private gradient = toonGradient();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x8ac8f5);
    this.scene.fog = new THREE.Fog(0xbfe0f5, 40, 110);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    this.scene.add(sky);
    // 光(晴れた昼)
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6a9a50, 1.5));
    const sun = new THREE.DirectionalLight(0xfff6e0, 2.6);
    sun.position.set(-8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 12;
    sc.bottom = -12;
    this.scene.add(sun);
    // 地面(コートの外は草原)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 48), new THREE.MeshLambertMaterial({ color: 0x6aa84a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const F = ANIME.field;
    const court = new THREE.Mesh(new THREE.PlaneGeometry(F.halfX * 2 + 2, F.halfZ * 2 + 2), new THREE.MeshLambertMaterial({ map: courtTexture() }));
    court.rotation.x = -Math.PI / 2;
    court.receiveShadow = true;
    this.scene.add(court);
    // まわりの木・岩・山【仮】
    const trunk = new THREE.MeshToonMaterial({ color: 0x7a5232, gradientMap: this.gradient });
    const leaf = new THREE.MeshToonMaterial({ color: 0x3a8a3a, gradientMap: this.gradient });
    const leaf2 = new THREE.MeshToonMaterial({ color: 0x4aa040, gradientMap: this.gradient });
    const rock = new THREE.MeshToonMaterial({ color: 0x9a96a0, gradientMap: this.gradient });
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2 + rnd(-0.05, 0.05);
      const r = rnd(20, 30);
      const x = Math.cos(ang) * r * 1.2;
      const z = Math.sin(ang) * r;
      const s = rnd(1.2, 2.2);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 1.6 * s, 7), trunk);
      t.position.set(x, 0.8 * s, z);
      t.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s, 0), i % 2 ? leaf : leaf2);
      crown.position.set(x, 2.3 * s, z);
      crown.castShadow = true;
      this.scene.add(t, crown);
    }
    for (let i = 0; i < 18; i++) {
      const ang = rnd(0, Math.PI * 2);
      const r = rnd(15.5, 19);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.4, 1.1), 0), rock);
      m.position.set(Math.cos(ang) * r, 0.2, Math.sin(ang) * r * 0.75);
      m.rotation.set(rnd(0, 3), rnd(0, 3), 0);
      m.castShadow = true;
      this.scene.add(m);
    }
    const mtn = new THREE.MeshLambertMaterial({ color: 0x7a9ab8 });
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(14, 22), rnd(14, 26), 6), mtn);
      m.position.set(Math.cos(ang) * 85, 5, Math.sin(ang) * 85);
      this.scene.add(m);
    }
    const cloud = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(cloud);
      const ang = rnd(0, Math.PI * 2);
      s.position.set(Math.cos(ang) * rnd(50, 90), rnd(22, 40), Math.sin(ang) * rnd(50, 90));
      s.scale.set(rnd(16, 26), rnd(8, 12), 1);
      this.scene.add(s);
    }
    // モンスター(青 = 自分・赤 = 相手)【仮】
    const looks = [
      [0x8fb4e8, 0xe8f0ff, 0xffd23a],
      [0xe88a8a, 0xffe8e0, 0x4a3a5a],
    ];
    for (const [c, b, h] of looks) {
      const r = new MonsterRig(c, b, h, this.gradient);
      this.scene.add(r.root);
      this.rigs.push(r);
    }
    // 企画者の BUNK のモデル(2体とも BUNK。相手は色違い)
    this.loadModel();
    for (let i = 0; i < 2; i++) {
      // 守りのドーム(半透明の球と、光る網)
      const dome = new THREE.Group();
      dome.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
      dome.add(new THREE.Mesh(new THREE.SphereGeometry(0.98, 24, 16), new THREE.MeshBasicMaterial({ color: 0x8ad0ff, transparent: true, opacity: 0.22, depthWrite: false })));
      dome.visible = false;
      this.scene.add(dome);
      this.domes.push(dome);
      // ふらつきの星
      const st = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: 0xffe040, transparent: true, depthWrite: false }));
        const a = (k / 3) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
        sp.scale.setScalar(0.35);
        st.add(sp);
      }
      st.visible = false;
      this.scene.add(st);
      this.stars.push(st);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.scene.add(s);
      this.charge.push(s);
    }
  }

  /** モデルを読めなかったときの理由(確認用ページに出す) */
  modelError = '';

  /**
   * 企画者の BUNK のモデルを読む(2体とも BUNK。相手は色違い)。
   * 確認用ページではページに埋めこんだもの(data:)を、ネットにつながず その場で読む
   * (2026-11-01 iPhone のアプリで BUNK が出なかった。別ファイル・blob の読みこみは iPhone のアプリで止められるため)
   */
  private loadModel(): void {
    const done = (g: { scene: THREE.Object3D }) => {
      try {
        this.rigs.forEach((r, i) => r.useModel(g.scene, MODEL.height, i === 1 ? MODEL.rivalHue : 0));
      } catch (e) {
        this.modelError = `使えない: ${String(e)}`;
      }
      this.ready = true;
    };
    const fail = (e: unknown) => {
      this.modelError = `読めない: ${e instanceof Error ? e.message : String(e)}`;
      this.ready = true;
    };
    const url = assetUrl(BUNK_MODEL_FILE);
    const loader = new GLTFLoader();
    try {
      if (url.startsWith('data:')) {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        loader.parse(buf.buffer, '', done, fail);
      } else loader.load(url, done, undefined, fail);
    } catch (e) {
      fail(e);
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private add(obj: THREE.Object3D, life: number, grow: number, base: number, extra: Partial<Burst> = {}): void {
    this.scene.add(obj);
    obj.scale.setScalar(base);
    this.bursts.push({ obj, t: 0, life, grow, base, fade: true, ...extra });
  }

  private sprite(color: number, additive = true, map: THREE.Texture = this.glow): THREE.Sprite {
    return new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  }

  /** 爆発(技の色) */
  explode(x: number, y: number, z: number, tech: TechId | null, big: boolean): void {
    const col = tech ? ELEMENT_HEX[getTech(tech).element] : 0xffffff;
    const s = this.sprite(0xffffff, true, this.star);
    s.position.set(x, y, z);
    this.add(s, big ? 0.35 : 0.22, big ? 4 : 2.5, big ? 1.4 : 0.9);
    const c = this.sprite(col);
    c.position.set(x, y, z);
    this.add(c, big ? 0.5 : 0.3, big ? 3 : 2, big ? 2.2 : 1.3);
    for (let i = 0; i < (big ? 14 : 7); i++) {
      const p = this.sprite(col);
      p.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * (big ? 6 : 3);
      this.add(p, 0.4 + Math.random() * 0.3, -0.7, 0.35, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 4 });
    }
    // けむり
    for (let i = 0; i < (big ? 6 : 3); i++) {
      const p = this.sprite(0xe8e0e8, false);
      p.material.opacity = 0.7;
      p.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
      this.add(p, 0.8, 1.5, big ? 1.4 : 0.9, { vy: 1 });
    }
    this.shake(big ? 0.35 : 0.15);
  }

  clash(x: number, y: number, z: number): void {
    this.explode(x, y, z, null, true);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.set(x, y, z);
    ring.lookAt(this.camera.position);
    this.add(ring, 0.35, 5, 1);
  }

  dust(x: number, z: number, big: boolean): void {
    for (let i = 0; i < (big ? 10 : 4); i++) {
      const s = this.sprite(0xd8c8a8, false);
      s.material.opacity = 0.75;
      s.position.set(x + (Math.random() - 0.5) * 1.2, 0.2, z + (Math.random() - 0.5) * 1.2);
      const a = Math.random() * Math.PI * 2;
      this.add(s, 0.6, 1.8, big ? 0.9 : 0.6, { vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 0.5 });
    }
  }

  /** 衝撃波の岩 */
  rocks(x: number, z: number): void {
    const m = new THREE.MeshToonMaterial({ color: 0x8a6a4a, gradientMap: this.gradient });
    for (let i = 0; i < 12; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.18, 0), m);
      r.position.set(x, 0.2, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      this.add(r, 0.9, 0, 1, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4 + Math.random() * 5, fade: false });
    }
    this.dust(x, z, true);
    this.shake(0.4);
  }

  /** 落下技: 落ちてくる所に赤い印 */
  mark(x: number, z: number, r: number, until: number): void {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.85, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.18, depthWrite: false }));
    for (const m of [ring, fill]) {
      m.rotation.x = -Math.PI / 2;
      g.add(m);
    }
    g.position.set(x, 0.05, z);
    this.scene.add(g);
    this.markers.push({ obj: g, r, until });
  }

  /** 落下技・大技の着地: 岩・輪・大きなゆれ */
  impact(x: number, z: number, r: number, big: boolean): void {
    this.rocks(x, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.08, z);
    this.add(ring, 0.4, 1.2, r);
    this.explode(x, 0.4, z, null, big);
    this.shake(big ? 0.6 : 0.4);
  }

  flash(side: number): void {
    this.rigs[side].flash = 0.12;
  }

  shake(n: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, n);
  }

  render(b: AnimeBattle, dt: number): void {
    b.f.forEach((f, i) => {
      const rig = this.rigs[i];
      rig.update(f, dt);
      // 技のため: 口に光が集まる
      const ch = this.charge[i];
      const a = f.act;
      if (a.k === 'tech' && !a.fired) {
        const tech = getTech(a.id);
        const k = Math.min(1, a.t / a.windup);
        // 撃つ技は口に光が集まる。体で行く技は、体に力の光をまとう
        const mouth = tech.kind === 'shot' || tech.kind === 'barrage' || tech.kind === 'beam';
        if (mouth) rig.mouth.getWorldPosition(ch.position);
        else ch.position.set(f.x, f.y + 0.8, f.z);
        ch.visible = true;
        ch.material.color.setHex(auraColor(tech.element));
        ch.scale.setScalar((tech.kind === 'beam' ? 1.6 : mouth ? 0.9 : 2.4) * k * (tech.strength === '大技' ? 1.6 : 1) * (1 + Math.sin(performance.now() / 30) * 0.12));
        // まわりから光の粒が集まる
        if (Math.random() < dt * 30) {
          const p = this.sprite(auraColor(tech.element));
          const ang = Math.random() * Math.PI * 2;
          const r = 1.2;
          p.position.set(ch.position.x + Math.cos(ang) * r, ch.position.y + (Math.random() - 0.5) * r, ch.position.z + Math.sin(ang) * r);
          this.add(p, 0.25, -0.9, 0.25, { vx: -Math.cos(ang) * r * 4, vz: -Math.sin(ang) * r * 4, vy: 0 });
        }
      } else ch.visible = false;
      // 体で行く技(突進・回転・連続攻撃): 体に光の尾と土けむり
      if (a.k === 'tech' && a.fired && !a.hit && dt > 0) {
        const kind = getTech(a.id).kind;
        const col = auraColor(getTech(a.id).element);
        if ((kind === 'rush' || kind === 'spin' || kind === 'combo') && Math.random() < dt * 45) {
          const p = this.sprite(col);
          p.position.set(f.x, f.y + 0.7, f.z);
          this.add(p, 0.3, 0.4, kind === 'spin' ? 1.5 : 1.2);
          if (Math.random() < 0.5) this.dust(f.x, f.z, false);
        }
        if (kind === 'drop' && f.y > 0 && Math.random() < dt * 30) {
          const p = this.sprite(col);
          p.position.set(f.x, f.y + 0.7, f.z);
          this.add(p, 0.3, 0.3, 1.4);
        }
      }
      // 守りのドーム
      const dome = this.domes[i];
      dome.visible = b.t < f.barrierUntil;
      if (dome.visible) {
        dome.position.set(f.x, f.y + 0.6, f.z);
        const left = f.barrierUntil - b.t;
        dome.scale.setScalar(f.barrierR * (left < 0.2 ? Math.max(0.05, left / 0.2) : 1));
        (dome.children[0] as THREE.Mesh).rotation.y += dt * 0.8;
      }
      // ふらつき(頭の上を星が回る)・まひ(ぴりぴり)
      const stars = this.stars[i];
      stars.visible = b.t < f.dizzyUntil && f.act.k !== 'ko';
      if (stars.visible) {
        stars.position.set(f.x, f.y + 1.75, f.z);
        stars.rotation.y += dt * 5;
      }
      if (b.t < f.paraUntil && f.act.k !== 'ko' && Math.random() < dt * 14) {
        const p = this.sprite(0xffe040, true, this.star);
        p.position.set(f.x + (Math.random() - 0.5) * 1.2, f.y + 0.4 + Math.random() * 1.2, f.z + (Math.random() - 0.5) * 1.2);
        this.add(p, 0.12, 0.5, 0.35);
      }
    });
    // 落ちてくる所の印
    this.markers = this.markers.filter((m) => {
      const live = b.t < m.until + 0.05;
      m.obj.visible = live;
      if (!live) {
        this.scene.remove(m.obj);
        return false;
      }
      const pulse = 1 + Math.sin(performance.now() / 70) * 0.06;
      m.obj.scale.setScalar(m.r * pulse);
      return true;
    });
    this.drawShots(b, dt);
    this.drawBeams(b);
    this.drawQuakes(b);
    for (const p of this.bursts) {
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      if (p.vx !== undefined) {
        p.obj.position.x += p.vx * dt;
        p.obj.position.z += (p.vz ?? 0) * dt;
        p.obj.position.y = Math.max(0.1, p.obj.position.y + (p.vy ?? 0) * dt);
        if (p.vy !== undefined && !p.fade) p.vy -= 18 * dt;
      }
      if (p.grow) p.obj.scale.setScalar(p.base * Math.max(0.05, 1 + p.grow * k));
      if (p.fade) {
        const mat = (p.obj as THREE.Sprite).material as THREE.Material & { opacity: number };
        mat.opacity = (mat.userData.o0 ??= mat.opacity) * (1 - k);
      }
    }
    this.bursts = this.bursts.filter((p) => {
      if (p.t < p.life) return true;
      this.scene.remove(p.obj);
      const m = p.obj as THREE.Mesh;
      if (!(p.obj instanceof THREE.Sprite)) m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose?.();
      return false;
    });
    this.follow(b, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private drawShots(b: AnimeBattle, dt: number): void {
    const alive = new Set<number>();
    for (const s of b.shots) {
      alive.add(s.id);
      let g = this.shotObjs.get(s.id);
      const col = ELEMENT_HEX[getTech(s.tech).element];
      if (!g) {
        g = new THREE.Group();
        const outer = this.sprite(col);
        outer.scale.setScalar(s.r * 3.2);
        const core = this.sprite(0xffffff, true, this.star);
        core.scale.setScalar(s.r * 1.8);
        g.add(outer, core);
        this.scene.add(g);
        this.shotObjs.set(s.id, g);
      }
      g.position.set(s.x, s.y, s.z);
      g.children[1].rotation.z += dt * 10;
      (g.children[1] as THREE.Sprite).material.rotation += dt * 12;
      // 尾
      const tail = this.sprite(col);
      tail.position.set(s.x, s.y, s.z);
      this.add(tail, 0.3, -0.8, s.r * 2.2);
    }
    for (const [id, g] of this.shotObjs)
      if (!alive.has(id)) {
        this.scene.remove(g);
        g.children.forEach((c) => ((c as THREE.Sprite).material as THREE.Material).dispose());
        this.shotObjs.delete(id);
      }
  }

  private drawBeams(b: AnimeBattle): void {
    while (this.beamObjs.length < b.beams.length) {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      const head = this.sprite(0xffffff, true, this.star);
      g.add(outer, core, head);
      this.scene.add(g);
      this.beamObjs.push(g);
    }
    this.beamObjs.forEach((g, i) => {
      const beam = b.beams[i];
      g.visible = !!beam;
      if (!beam) return;
      const tech = getTech(beam.tech);
      const col = ELEMENT_HEX[tech.element];
      const owner = this.rigs[beam.owner];
      const start = new THREE.Vector3();
      owner.mouth.getWorldPosition(start);
      const len = tech.range;
      const flick = 1 + Math.sin(performance.now() / 18) * 0.15;
      const k = Math.min(1, beam.t / 0.08) * (beam.t > tech.duration - 0.12 ? Math.max(0, (tech.duration - beam.t) / 0.12) : 1);
      const [outer, core, head] = g.children as [THREE.Mesh, THREE.Mesh, THREE.Sprite];
      (outer.material as THREE.MeshBasicMaterial).color.setHex(col);
      g.position.copy(start);
      g.rotation.set(0, -beam.dir, 0);
      outer.rotation.z = core.rotation.z = Math.PI / 2;
      outer.position.x = core.position.x = len / 2;
      outer.scale.set(tech.size * 1.6 * flick * k, len, tech.size * 1.6 * flick * k);
      core.scale.set(tech.size * 1.2 * k, len, tech.size * 1.2 * k);
      head.position.set(0, 0, 0);
      head.scale.setScalar(2.4 * flick * k);
    });
    if (b.beams.length) this.shake(0.08);
  }

  private drawQuakes(b: AnimeBattle): void {
    while (this.quakeObjs.length < b.quakes.length) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      this.quakeObjs.push(m);
    }
    this.quakeObjs.forEach((m, i) => {
      const q = b.quakes[i];
      m.visible = !!q;
      if (!q) return;
      m.position.set(q.x, 0.08, q.z);
      m.scale.setScalar(Math.max(0.1, q.r));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - q.r / getTech(q.tech).range);
      if (Math.random() < 0.5) this.dust(q.x + Math.cos(Math.random() * 7) * q.r, q.z + Math.sin(Math.random() * 7) * q.r, false);
    });
  }

  /**
   * カメラ: 自分のMONZのななめ後ろ・少し上から、相手のほうを見る(アニメ・ゲームのモンスターバトル風)【仮】。
   * 2体が両方入るように距離を変える
   */
  private follow(b: AnimeBattle, dt: number): void {
    const [p, q] = b.f;
    const dir = Math.atan2(q.z - p.z, q.x - p.x);
    const sep = Math.hypot(q.x - p.x, q.z - p.z);
    const back = 5.4 + sep * 0.25;
    const side = 2.6;
    const want = new THREE.Vector3(p.x - Math.cos(dir) * back - Math.sin(dir) * side, 3.3 + sep * 0.12, p.z - Math.sin(dir) * back + Math.cos(dir) * side);
    const look = new THREE.Vector3(p.x + (q.x - p.x) * 0.6, 0.9 + Math.max(p.y, q.y) * 0.3, p.z + (q.z - p.z) * 0.6);
    const k = 1 - Math.exp(-dt * 3.5);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 4));
    const pos = this.camPos.clone();
    if (this.shakeAmp > 0.002) {
      pos.x += (Math.random() - 0.5) * this.shakeAmp;
      pos.y += (Math.random() - 0.5) * this.shakeAmp;
      pos.z += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-dt * 10);
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
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
  }
}
