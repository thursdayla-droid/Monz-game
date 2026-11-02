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
import type { modelFor } from '../core/roster';

type ModelPick = ReturnType<typeof modelFor>;
import { MonsterRig } from './monsterRig';

/** 企画者の BUNK の3Dモデル(軽くしたもの。design/battle3d/README.md) */
export const BUNK_MODEL_FILE = 'assets/battle3d/bunk.glb';
/** 【仮】ゲームの中の高さ・色違い(相手)の色相の回し方 */
const MODEL = { height: 1.55, rivalHue: 2.4 };

export const ELEMENT_HEX: Record<Element, number> = { 炎: 0xff6a2a, 水: 0x3aa8ff, 自然: 0x6ad04a, 雷: 0xffd23a, 光: 0xfff2a0, 闇: 0xa05aff, 無: 0xe0e0f0 };
/** 力の光の色(無属性は白だと見えにくいので、あたたかい色) */
/** 一度に出せる光の粒の数(iPhone の負担を おさえる) */
const MAX_BURSTS = 320;
const auraColor = (e: Element) => (e === '無' ? 0xff7a2a : ELEMENT_HEX[e]);

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
  /** 形を使い回している(消すときに形を捨てない) */
  shared?: boolean;
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

/** 地面のひび割れの絵(放射状の割れ目) */
function crackTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(40,24,10,0.9)';
  g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    let a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
    let x = 128;
    let y = 128;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      a += (Math.random() - 0.5) * 0.7;
      x += Math.cos(a) * 20;
      y += Math.sin(a) * 20;
      g.lineTo(x, y);
      g.lineWidth = Math.max(1.5, 7 - s);
    }
    g.stroke();
  }
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 60);
  grad.addColorStop(0, 'rgba(60,40,20,0.6)');
  grad.addColorStop(1, 'rgba(60,40,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
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
  /** 回転技の、体のまわりを回る光の輪(紫と、属性の色) */
  private spinRings: THREE.Group[] = [];
  /** スピードライン(使い回す細い棒) */
  private streakGeo = new THREE.BoxGeometry(1, 0.035, 0.035);
  /** 体で行く技の、力の光(体をつつむ) */
  private auras: THREE.Mesh[] = [];
  private crackTex = crackTexture();
  private tmpV = new THREE.Vector3();
  /** パンチの光を出したか(のばしきりで1回) */
  private punchLit = [0, 0];
  private stars: THREE.Group[] = [];
  private markers: { obj: THREE.Group; r: number; until: number }[] = [];
  private camPos = new THREE.Vector3(-12, 5, 6);
  private camLook = new THREE.Vector3();
  private shakeAmp = 0;
  /** カメラの見ている向き(床の上。スティックの向きを世界の向きに直すのに使う) */
  camForward = { x: 1, z: 0 };
  /** カメラの向き(ゆっくりついていく) */
  private camYaw: number | null = null;
  zoom = 1;
  /** モデルの読みこみが終わった(失敗したときも true。仮のモンスターのまま) */
  ready = false;
  private gradient = toonGradient();

  /** species: 2体の種族(モデルを選ぶ。モデルのない種族は仮のモンスター) */
  /** models: 2体の3Dモデル(roster.ts の modelFor。null なら仮のモンスター) */
  constructor(canvas: HTMLCanvasElement, private models: [ModelPick, ModelPick] = [null, null]) {
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
      const ring = new THREE.Group();
      for (const [c, rot] of [[0xa040ff, 0], [0xff8a2a, Math.PI]] as const) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.11, 6, 28, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
        arc.rotation.z = rot;
        ring.add(arc);
      }
      ring.visible = false;
      this.scene.add(ring);
      this.spinRings.push(ring);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      aura.visible = false;
      this.scene.add(aura);
      this.auras.push(aura);
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
    // 種族ごとのモデル(roster.ts。2026-11-01 全キャラの入れ物)。同じ種族の2体目は色違い
    const files = new Map<string, number[]>();
    this.models.forEach((m, i) => {
      if (m) files.set(m.file, [...(files.get(m.file) ?? []), i]);
    });
    let left = files.size;
    if (!left) this.ready = true;
    for (const [file, sides] of files) this.loadOne(file, sides, () => {
      if (--left <= 0) this.ready = true;
    });
  }

  private loadOne(file: string, sides: number[], finish: () => void): void {
    const done = (g: { scene: THREE.Object3D }) => {
      try {
        // 同じモデルの2体目は色違い
        sides.forEach((i, n) => this.rigs[i].useModel(g.scene, this.models[i]?.height ?? MODEL.height, n > 0 ? MODEL.rivalHue : 0, this.models[i]?.bones ?? true, this.models[i]?.amp ?? 1));
      } catch (e) {
        this.modelError = `使えない: ${String(e)}`;
      }
      finish();
    };
    const fail = (e: unknown) => {
      this.modelError = `読めない: ${e instanceof Error ? e.message : String(e)}`;
      finish();
    };
    const url = assetUrl(file);
    const loader = new GLTFLoader();
    try {
      if (url.startsWith('data:')) {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        // 絵は <img> で読む(2026-11-01 iPhone のアプリでは、絵を fetch で読む方法が止められ、BUNK が白くなった)。
        // 読み方は、読みこみ係を作る時に createImageBitmap があるかで決まるので、その間だけ隠す
        const w = window as unknown as { createImageBitmap?: unknown };
        const cib = w.createImageBitmap;
        w.createImageBitmap = undefined;
        try {
          loader.parse(buf.buffer, '', done, fail);
        } finally {
          w.createImageBitmap = cib;
        }
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
    // iPhone の負担を おさえるため、光の粒は一度に出す数に上限(2026-11-02)
    if (this.bursts.length > MAX_BURSTS) {
      ((obj as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.();
      if (!extra.shared && !(obj instanceof THREE.Sprite)) (obj as THREE.Mesh).geometry?.dispose?.();
      return;
    }
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

  /** 炎(炎の技): ゆらゆら のぼる火の粉(赤・オレンジ・黄色) */
  flame(x: number, y: number, z: number, spread: number, n = 2): void {
    for (let i = 0; i < n; i++) {
      const c = [0xff3a10, 0xff7a1a, 0xffc040][Math.floor(Math.random() * 3)];
      const s = this.sprite(c);
      s.position.set(x + (Math.random() - 0.5) * spread, y + Math.random() * spread * 0.5, z + (Math.random() - 0.5) * spread);
      this.add(s, 0.4 + Math.random() * 0.25, -0.5, 0.5 + Math.random() * 0.3, { vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: 1.8 + Math.random() * 1.5 });
    }
  }

  /** 炎の技が当たった: 火が はじける */
  flameBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const c = [0xff3a10, 0xff7a1a, 0xffd060][i % 3];
      const s = this.sprite(c);
      s.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      this.add(s, 0.45, -0.4, 0.5, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.5 + Math.random() * 3 });
    }
  }

  /** 突進・回転の出だし: 足もとの砂けむりと、うしろへ飛ぶ土 */
  launch(x: number, z: number, dir: number): void {
    this.dust(x, z, true);
    for (let i = 0; i < 6; i++) {
      const s = this.sprite(0xd8c8a8, false);
      s.material.opacity = 0.8;
      s.position.set(x, 0.15, z);
      const a = dir + Math.PI + (Math.random() - 0.5) * 1.2;
      const sp = 2 + Math.random() * 3;
      this.add(s, 0.5, 1.2, 0.5, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1 + Math.random() * 2 });
    }
  }

  /** 突進の命中: 火花が前へ飛び散る */
  rushHit(x: number, y: number, z: number, dir: number, color: number, strong: boolean): void {
    for (let i = 0; i < (strong ? 16 : 10); i++) {
      const s = this.sprite(i % 3 ? color : 0xffffff, true, this.star);
      s.position.set(x, y, z);
      const a = dir + (Math.random() - 0.5) * 1.8;
      const sp = 4 + Math.random() * 5;
      this.add(s, 0.3, -0.6, 0.35, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1 + Math.random() * 4 });
    }
    if (strong) this.rocks(x, z);
  }

  /** 回転の命中: うずを巻いて広がる光(回転の勢い) */
  spinHit(x: number, y: number, z: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = this.sprite(i % 2 ? 0xa040ff : color);
      s.position.set(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, z);
      // 円に沿って(うず)外へ
      this.add(s, 0.4, -0.5, 0.45, { vx: Math.cos(a + 1.2) * 5, vz: Math.sin(a + 1.2) * 5, vy: Math.sin(a) * 2 });
    }
    this.shockRing(x, y, z, 0xa040ff, 1.4);
  }

  /** 当たった所から広がる、立った光の輪(カメラのほうを向く) */
  shockRing(x: number, y: number, z: number, color: number, size = 1): void {
    for (const [r0, life, grow] of [[0.4, 0.28, 5], [0.25, 0.4, 7]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.set(x, y, z);
      ring.lookAt(this.camera.position);
      this.add(ring, life, grow, r0 * size);
    }
  }

  /** 地面のひび割れ(衝撃波・落下)。少しのあいだ残る */
  crack(x: number, z: number, r: number): void {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, 0.03, z);
    this.add(m, 2.6, 0.15, r * 2.4);
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
      // パンチ: グローブのあとに光の尾、のばしきりで星の光(2026-11-02 企画者「パンチ出してるの分からない」)
      const pg = rig.punch(this.tmpV);
      if (pg && dt > 0) {
        const tr = this.sprite(0xffe0a0);
        tr.position.copy(this.tmpV);
        this.add(tr, 0.18, -0.5, 0.55);
        if (pg.ext > 0.9 && this.punchLit[i] < 0.9) {
          const st = this.sprite(0xffffff, true, this.star);
          st.position.copy(this.tmpV);
          this.add(st, 0.22, 2.8, 0.9);
          this.shockRing(this.tmpV.x, this.tmpV.y, this.tmpV.z, 0xffd080, 0.8);
        }
      }
      this.punchLit[i] = pg ? pg.ext : 0;
      // 体で行く技(突進・回転・連続攻撃・落下・衝撃波): 体を力の光がつつむ(ためから、技が終わるまで)
      const aura = this.auras[i];
      const at = a.k === 'tech' ? getTech(a.id) : null;
      // 回転は、回る輪で見せる(光の玉は輪をかくすので出さない)
      const auraOn = !!at && ['rush', 'combo', 'drop', 'quake'].includes(at.kind) && !(a.k === 'tech' && a.hit && at.kind !== 'combo');
      aura.visible = auraOn;
      if (auraOn && at) {
        const pulse = 1 + Math.sin(performance.now() / 45) * 0.08;
        const big = at.strength === '大技' ? 1.5 : at.strength === '強' ? 1.2 : 1;
        aura.position.set(f.x, f.y + 0.85, f.z);
        aura.scale.set(1.1 * pulse * big, 1.25 * pulse * big, 1.1 * pulse * big);
        (aura.material as THREE.MeshBasicMaterial).color.setHex(auraColor(at.element));
        (aura.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(performance.now() / 30) * 0.06;
      }
      // 炎の技: ためから技が終わるまで、体から火の粉が のぼる(2026-11-02 企画者「技炎少しほしい」)
      if (a.k === 'tech' && dt > 0 && getTech(a.id).element === '炎' && !(a.fired && a.hit && getTech(a.id).kind !== 'shot')) {
        if (Math.random() < dt * 70) this.flame(f.x, f.y + 0.3, f.z, 1.2, 2);
      }
      // 突進: オレンジのスピードライン(体のうしろへ流れる)。回転: 体のまわりを紫と属性の色の輪が回り、軌跡が残る(2026-11-02 企画者の技演出イメージ)
      const sr = this.spinRings[i];
      sr.visible = false;
      if (a.k === 'tech' && a.fired && !a.hit && dt > 0) {
        const t2 = getTech(a.id);
        if (t2.kind === 'rush') {
          for (let n = 0; n < 2; n++) {
            const m = new THREE.Mesh(this.streakGeo, new THREE.MeshBasicMaterial({ color: n ? 0xffd080 : 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            const side = (Math.random() - 0.5) * 1.3;
            m.position.set(f.x - Math.cos(a.dir) * (0.6 + Math.random()) - Math.sin(a.dir) * side, f.y + 0.3 + Math.random() * 1.1, f.z - Math.sin(a.dir) * (0.6 + Math.random()) + Math.cos(a.dir) * side);
            m.rotation.y = -a.dir;
            this.add(m, 0.16, 0, 1, { shared: true });
            m.scale.set(1.2 + Math.random() * 1.2, 1, 1);
          }
        } else if (t2.kind === 'spin') {
          const col = t2.element === '無' ? 0xff8a2a : ELEMENT_HEX[t2.element];
          sr.visible = true;
          sr.position.set(f.x, f.y + 0.75, f.z);
          sr.rotation.set(0, -a.dir, 0);
          ((sr.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(col);
          for (const c of sr.children) c.rotation.z -= dt * 22;
          // 回転の軌跡(紫と属性の色を交互に)
          const tr = this.sprite(Math.random() < 0.5 ? 0xa040ff : col);
          tr.position.set(f.x + (Math.random() - 0.5) * 0.6, f.y + 0.3 + Math.random() * 0.9, f.z + (Math.random() - 0.5) * 0.6);
          this.add(tr, 0.35, -0.4, 0.75);
          // 雷の回転は、火花が飛ぶ
          if (t2.element === '雷' && Math.random() < dt * 30) {
            const sp = this.sprite(0xfff060, true, this.star);
            sp.position.set(f.x + (Math.random() - 0.5) * 1.6, f.y + 0.2 + Math.random() * 1.3, f.z + (Math.random() - 0.5) * 1.6);
            this.add(sp, 0.12, 1.2, 0.45);
          }
        }
      }
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
    this.drawRoarsFields(b);
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
      if (!(p.obj instanceof THREE.Sprite) && !p.shared) m.geometry?.dispose();
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
      // 炎の弾は、火の粉を引く
      if (getTech(s.tech).element === '炎' && Math.random() < 0.7) this.flame(s.x, s.y, s.z, 0.4, 1);
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

  private roarObjs: THREE.Mesh[] = [];
  private fieldObjs: THREE.Mesh[] = [];
  /** 【仮の見た目】ほえる声の輪(紫・立った輪)と、重力の場(紫と黒の円)。くわしい演出は数字の承認のあと */
  private drawRoarsFields(b: AnimeBattle): void {
    while (this.roarObjs.length < b.roars.length) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0xc070ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.scene.add(m);
      this.roarObjs.push(m);
    }
    this.roarObjs.forEach((m, i) => {
      const q = b.roars[i];
      m.visible = !!q;
      if (!q) return;
      m.position.set(q.x, 0.9, q.z);
      m.rotation.x = Math.PI / 2;
      m.scale.setScalar(Math.max(0.1, q.r));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - q.r / getTech(q.tech).range);
    });
    while (this.fieldObjs.length < b.fields.length) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x5a1a8a, transparent: true, opacity: 0.45, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xc070ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      m.add(rim);
      this.scene.add(m);
      this.fieldObjs.push(m);
    }
    this.fieldObjs.forEach((m, i) => {
      const fl = b.fields[i];
      m.visible = !!fl;
      if (!fl) return;
      m.position.set(fl.x, 0.04, fl.z);
      m.scale.setScalar(fl.r * (1 + Math.sin(performance.now() / 200) * 0.03));
      m.rotation.z += 0.01;
    });
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
    // 2026-11-02 企画者「カメラがガチャガチャ」「若干遠目でもいい」→ 技ごとにカメラを動かすのをやめ、ひとつの落ち着いたカメラに。
    // 2体のまん中を、自分の MONZ 側のななめうしろ・少し横から、少し遠めに見る。2体が回りこんでも、向きはゆっくりついていく
    // 2026-11-02 パンチ(腕が前へ出る)が見えるよう、横からに近づけた(0.95 → 1.25)
    const targetYaw = dir + Math.PI - 1.25;
    if (this.camYaw === null) this.camYaw = targetYaw;
    this.camYaw += Math.atan2(Math.sin(targetYaw - this.camYaw), Math.cos(targetYaw - this.camYaw)) * (1 - Math.exp(-dt * 1.2));
    const mid = new THREE.Vector3(p.x + (q.x - p.x) * 0.45, 0, p.z + (q.z - p.z) * 0.45);
    const dist = 7.5 + Math.min(sep, 16) * 0.45;
    const want = new THREE.Vector3(mid.x + Math.cos(this.camYaw) * dist, 3.6 + Math.min(sep, 16) * 0.18, mid.z + Math.sin(this.camYaw) * dist);
    const look = new THREE.Vector3(mid.x, 0.9 + Math.max(p.y, q.y) * 0.25, mid.z);
    this.camPos.lerp(want, 1 - Math.exp(-dt * 2));
    this.camLook.lerp(look, 1 - Math.exp(-dt * 2.5));
    {
      const fx = this.camLook.x - this.camPos.x;
      const fz = this.camLook.z - this.camPos.z;
      const n = Math.hypot(fx, fz) || 1;
      this.camForward = { x: fx / n, z: fz / n };
    }
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
