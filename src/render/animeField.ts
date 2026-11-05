/**
 * 3Dバトル(アニメのモンスターバトル風・企画者 2026-11-01)の見た目。計算は src/core/battle3d/anime.ts。
 * - 【仮】広い野外のバトル場: 青空・雲・草のコート(白い線)・まわりの木と岩・遠くの山
 * - 【仮】モンスター: monsterRig.ts(BUNKの3Dモデル待ち)
 * - 技の光: 弾(光る玉と尾)・ビーム(ためる光と太い光線)・衝撃波(広がる輪と岩)・突進(土けむり)・爆発
 * - カメラ: 自分のMONZのななめ後ろから、相手を見る(アニメ・ゲームのモンスターバトルの見せ方)【仮】
 */
import { BEAST } from '../core/battle3d/beastScripts';
import * as THREE from 'three';
import { ANIME, type Element, type TechId } from '../core/battle3d/animeConfig';
import { isInvincible, type AnimeBattle, type AnimeMon } from '../core/battle3d/anime';
import { getTech } from '../core/battle3d/techTable';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../assetUrl';
import type { modelFor } from '../core/roster';

type ModelPick = ReturnType<typeof modelFor>;
import { MonsterRig } from './monsterRig';
import { buildArena } from './arenaView';
import { obstacleTop, rayHit, type ArenaMap } from '../core/battle3d/arena';

/** 企画者の BUNK の3Dモデル(軽くしたもの。design/battle3d/README.md) */
export const BUNK_MODEL_FILE = 'assets/battle3d/bunk.glb';
/** 【仮】ゲームの中の高さ・色違い(相手)の色相の回し方 */
const MODEL = { height: 1.55, rivalHue: 2.4 };

export const ELEMENT_HEX: Record<Element, number> = { 炎: 0xff6a2a, 水: 0x3aa8ff, 自然: 0x6ad04a, 雷: 0xffd23a, 光: 0xfff2a0, 闇: 0xa05aff, 無: 0xe0e0f0 };
/** 力の光の色(無属性は白だと見えにくいので、あたたかい色) */
/** 一度に出せる光の粒の数(iPhone の負担を おさえる) */
const MAX_BURSTS = 320;
/** 場が出てからの時間 */
const getTechAge = (fl: { until: number }, t: number) => ANIME.gfield.time - (fl.until - t);
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
  /** 色(material)も使い回している(消すときに捨てない) */
  sharedMat?: boolean;
  /** 大事な演出(粒の数の上限でも消さない) */
  must?: boolean;
  /** 毎フレーム呼ぶ(k = 0〜1 の進み) */
  tick?: (k: number) => void;
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

/** 重力の魔法陣(重力プレス): 二重の円・六芒星・文字のような印。紫と黒(2026-11-03 企画者の演出指示「紫と黒の重力フィールド」「円形の魔法陣」) */
function magicCircleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const C = 256;
  const grad = g.createRadialGradient(C, C, 20, C, C, 250);
  grad.addColorStop(0, 'rgba(20,0,40,0.85)');
  grad.addColorStop(0.7, 'rgba(70,10,120,0.55)');
  grad.addColorStop(1, 'rgba(120,40,200,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(C, C, 250, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(214,150,255,0.95)';
  g.lineWidth = 8;
  for (const r of [238, 200, 120]) {
    g.beginPath();
    g.arc(C, C, r, 0, Math.PI * 2);
    g.stroke();
  }
  // 六芒星
  g.lineWidth = 5;
  for (const off of [0, Math.PI / 3]) {
    g.beginPath();
    for (let k = 0; k <= 3; k++) {
      const a = off + (k / 3) * Math.PI * 2 - Math.PI / 2;
      const x = C + Math.cos(a) * 200;
      const y = C + Math.sin(a) * 200;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // 円のあいだの印(文字のような短い線)
  g.lineWidth = 4;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const x = C + Math.cos(a) * 219;
    const y = C + Math.sin(a) * 219;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(-6, -9);
    g.lineTo(6, k % 2 ? 9 : -2);
    g.moveTo(-6, 6);
    g.lineTo(k % 3 ? 6 : 0, 9);
    g.stroke();
    g.restore();
  }
  return new THREE.CanvasTexture(c);
}

/** 花の輪(千花天幕・自分の場): 花びらと光の根。緑・ピンク・白 */
function flowerCircleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const C = 256;
  const grad = g.createRadialGradient(C, C, 10, C, C, 250);
  grad.addColorStop(0, 'rgba(255,255,220,0.7)');
  grad.addColorStop(0.6, 'rgba(120,220,120,0.45)');
  grad.addColorStop(1, 'rgba(120,220,120,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(C, C, 250, 0, Math.PI * 2);
  g.fill();
  // 光の根(くねくね外へ)
  g.strokeStyle = 'rgba(255,250,200,0.9)';
  g.lineWidth = 5;
  for (let k = 0; k < 12; k++) {
    let a = (k / 12) * Math.PI * 2;
    let r = 40;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
    for (let s = 0; s < 8; s++) {
      r += 26;
      a += Math.sin(s + k) * 0.12;
      g.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
    }
    g.stroke();
  }
  // 花(ピンクと白の花びら)
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + (k % 2) * 0.1;
    const r = 120 + (k % 3) * 45;
    const x = C + Math.cos(a) * r;
    const y = C + Math.sin(a) * r;
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2;
      g.fillStyle = k % 2 ? 'rgba(255,140,200,0.95)' : 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.ellipse(x + Math.cos(pa) * 10, y + Math.sin(pa) * 10, 10, 6, pa, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,220,80,1)';
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/** 守りのドームの六角形のもよう(2026-11-03 企画者の演出指示「バリア表面に六角形の模様」) */
function hexTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  const r = 16;
  const h = Math.sqrt(3) * r;
  for (let row = -1; row < 256 / h + 1; row++)
    for (let col = -1; col < 256 / (r * 1.5) + 1; col++) {
      const x = col * r * 1.5;
      const y = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        if (k === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
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
  /** 回転技の、体のまわりを回る光の輪(紫と、属性の色) */
  private spinRings: THREE.Group[] = [];
  /** スピードライン(使い回す細い棒) */
  private streakGeo = new THREE.BoxGeometry(1, 0.035, 0.035);
  /** 体で行く技の、力の光(体をつつむ) */
  private auras: THREE.Mesh[] = [];
  private crackTex = crackTexture();
  private hexTex = hexTexture();
  /** ねむりの Z */
  private zTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '900 52px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#1a1030';
    g.strokeText('Z', 32, 34);
    g.fillStyle = '#9ad0ff';
    g.fillText('Z', 32, 34);
    return new THREE.CanvasTexture(c);
  })();
  private circleTex = magicCircleTexture();
  private flowerTex = flowerCircleTexture();
  /** 綿毛(ふわふわの丸い かたまり) */
  private puffTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    for (const [x, y, r] of [[32, 34, 18], [20, 30, 13], [44, 30, 13], [26, 20, 12], [40, 20, 12], [32, 44, 12]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.85)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  })();
  /** 葉っぱの形 */
  private leafTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(32, 4);
    g.quadraticCurveTo(60, 32, 32, 60);
    g.quadraticCurveTo(4, 32, 32, 4);
    g.fill();
    g.strokeStyle = '#1f5a1f';
    g.lineWidth = 4;
    g.stroke();
    g.beginPath();
    g.moveTo(32, 8);
    g.lineTo(32, 56);
    g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  private tmpV = new THREE.Vector3();
  /** パンチの光を出したか(のばしきりで1回) */
  private punchLit = [0, 0];
  /** ZIPP: 稲妻の線の形(使い回し)・前のフレームの場所(速く動いたら稲妻の線を引く)・ダッシュの長さの目じるし */
  private boltGeo = new THREE.BoxGeometry(1, 1, 1);
  private zLast: ({ x: number; y: number; z: number } | null)[] = [null, null];
  private dashGuide: THREE.Mesh[] = [];
  /** PUNI の水の玉の形・KLAK のトラップ(id → 見た目) */
  private blobGeo = new THREE.SphereGeometry(1, 14, 10);
  private trapObjs = new Map<number, THREE.Group>();
  /** とくべつな技の見た目(2026-11-03): ねらいの線・のびる体・十字/線の場・山なりのしずくの id */
  private aimLines: THREE.Mesh[] = [];
  private tendrils: THREE.Mesh[] = [];
  private shapeFields = new Map<object, THREE.Group>();
  private gooIds = new Set<number>();
  /** さいごに描いた試合(ガードの光の場所に使う) */
  private lastB: AnimeBattle | null = null;
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
  constructor(canvas: HTMLCanvasElement, private models: [ModelPick, ModelPick] = [null, null], private arena: ArenaMap | null = null) {
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
    // マップがある時は広いので、影の範囲も広く
    const shR = arena ? arena.radius + 2 : 16;
    sc.left = -shR;
    sc.right = shR;
    sc.top = arena ? shR : 12;
    sc.bottom = arena ? -shR : -12;
    this.scene.add(sun);
    // 地面(コートの外は草原)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 48), new THREE.MeshLambertMaterial({ color: 0x6aa84a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const F = ANIME.field;
    // マップ(2026-11-03 ロストテンプル): 石だたみ・柱・壁・外の遺跡。前のコート・木・岩は出さない
    if (arena) this.scene.add(buildArena(arena, this.gradient).group);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    if (!arena) {
    const court = new THREE.Mesh(new THREE.PlaneGeometry(F.halfX * 2 + 2, F.halfZ * 2 + 2), new THREE.MeshLambertMaterial({ map: courtTexture() }));
    court.rotation.x = -Math.PI / 2;
    court.receiveShadow = true;
    this.scene.add(court);
    // まわりの木・岩・山【仮】
    const trunk = new THREE.MeshToonMaterial({ color: 0x7a5232, gradientMap: this.gradient });
    const leaf = new THREE.MeshToonMaterial({ color: 0x3a8a3a, gradientMap: this.gradient });
    const leaf2 = new THREE.MeshToonMaterial({ color: 0x4aa040, gradientMap: this.gradient });
    const rock = new THREE.MeshToonMaterial({ color: 0x9a96a0, gradientMap: this.gradient });
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
      dome.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ map: this.hexTex, color: 0xbfe8ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
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
        sides.forEach((i, n) => this.rigs[i].useModel(g.scene, this.models[i]?.height ?? MODEL.height, n > 0 ? MODEL.rivalHue : 0, this.models[i]?.bones ?? true, this.models[i]?.amp ?? 1, this.models[i]?.rig ?? 'auto'));
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
    // モデルは meshopt で小さくしてある(2026-11-03 15体になり、確認用ページの上限をこえるため)。ほどく道具はプログラムの中にある(ネットから読まない)
    loader.setMeshoptDecoder(MeshoptDecoder);
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
    if (this.bursts.length > MAX_BURSTS && !extra.must) {
      if (!extra.sharedMat) ((obj as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.();
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
    if (tech === 'puniWater') this.splash(x, y, z);
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

  /** 地面と平行に広がる光の輪 */
  groundRing(x: number, z: number, r: number, color: number, life = 0.4, grow = 1.2): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.08, z);
    this.add(ring, life, grow, r, { must: true });
  }

  /**
   * 落下技・大技の着地: 岩・輪・大きなゆれ。
   * level(2026-11-03 企画者の演出指示): 0 = 控えめ(跳躍プレス: 土けむりと小さな輪)・1 = 強い(バンクブレイカー: 岩・強い輪2つ)・2 = 大技
   */
  impact(x: number, z: number, r: number, big: boolean, level = big ? 2 : 1, soft = false): void {
    // MOFU の着地(もふどっかん など): 岩ではなく、綿毛と花びらが ぶわっと
    if (soft) {
      this.cotton(x, 0.3, z, 10 + level * 6, r, 3);
      this.petals(x, 0.5, z, 8 + level * 6, 4);
      this.groundRing(x, z, r, 0xfff0fa, 0.45, 1.4);
      this.shake(0.25 + level * 0.1);
      return;
    }
    if (level === 0) {
      this.dust(x, z, true);
      this.dust(x, z, false);
      this.groundRing(x, z, r * 0.8, 0xfff0c0, 0.35, 1);
      this.explode(x, 0.3, z, null, false);
      this.shake(0.25);
      return;
    }
    this.rocks(x, z);
    if (level >= 2) this.rocks(x, z);
    this.groundRing(x, z, r, 0xffe8a0);
    this.groundRing(x, z, r * 0.6, 0xffffff, 0.55, 3.2);
    this.explode(x, 0.4, z, null, big);
    this.shake(big ? 0.6 : 0.45);
  }

  /** 回復: 緑と白の光が体からのぼる・光の輪(大技は大きく、光の木の柱) */
  healFx(side: number, big: boolean): void {
    const f = this.rigs[side].root.position;
    for (let i = 0; i < (big ? 30 : 16); i++) {
      const p = this.sprite(i % 3 ? 0x9aff9a : 0xffffff);
      const a = Math.random() * Math.PI * 2;
      p.position.set(f.x + Math.cos(a) * 0.7, 0.2 + Math.random() * 0.6, f.z + Math.sin(a) * 0.7);
      this.add(p, 0.9, -0.4, 0.4, { vx: 0, vz: 0, vy: 2 + Math.random() * 2 });
    }
    this.groundRing(f.x, f.z, 1, 0x9aff9a, 0.6, 1.5);
    if (big) this.lightPillar(f.x, f.z, 0x9aff9a);
  }

  /** 強化: 色の光の輪(守り = 緑・攻撃 = オレンジ・速さ = 水色) */
  buffFx(side: number, what: 'atk' | 'def' | 'speed'): void {
    const f = this.rigs[side].root.position;
    const col = what === 'def' ? 0x9aff9a : what === 'atk' ? 0xff9a3a : 0x7ad0ff;
    this.groundRing(f.x, f.z, 0.9, col, 0.5, 2);
    this.shockRing(f.x, 1, f.z, col, 1.3);
    for (let i = 0; i < 12; i++) {
      const p = this.sprite(col);
      const a = (i / 12) * Math.PI * 2;
      p.position.set(f.x + Math.cos(a) * 0.9, 0.3, f.z + Math.sin(a) * 0.9);
      this.add(p, 0.6, -0.3, 0.4, { vx: 0, vz: 0, vy: 3 });
    }
  }

  /** 吸収: 当たった相手から、光の粒が自分へもどる */
  drainFx(from: number, to: number): void {
    const a = this.rigs[from].root.position;
    const t = this.rigs[to].root.position;
    for (let i = 0; i < 10; i++) {
      const p = this.sprite(i % 2 ? 0x9aff9a : 0xffffff);
      p.position.set(a.x + (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.5, a.z + (Math.random() - 0.5) * 0.6);
      const k = 1.6 + Math.random() * 0.6;
      this.add(p, 0.5, -0.4, 0.35, { vx: (t.x - a.x) * k, vz: (t.z - a.z) * k, vy: 0 });
    }
  }

  /** 攻撃が柱・壁に当たった: 石のかけらと土けむり */
  wallHit(x: number, y: number, z: number): void {
    for (let i = 0; i < 8; i++) {
      const r = new THREE.Mesh(this.pebbleGeo, this.stoneChipMat);
      r.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      this.add(r, 0.7, 0, 0.5 + Math.random() * 0.6, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 3, fade: false, shared: true, sharedMat: true });
    }
    const d = this.sprite(0xe8dcc0, false);
    d.material.opacity = 0.8;
    d.position.set(x, y, z);
    this.add(d, 0.5, 1.6, 0.8);
  }
  private stoneChipMat = new THREE.MeshToonMaterial({ color: 0xcdb27a });

  /** 光の柱(大技の着地。天地轟砕) */
  lightPillar(x: number, z: number, color: number): void {
    for (const [w, c, life] of [[1.6, color, 0.7], [0.7, 0xffffff, 0.5]] as const) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.position.set(x, 7, z);
      this.add(m, life, -0.6, 1, { must: true });
    }
    for (let i = 0; i < 16; i++) {
      const p = this.sprite(i % 2 ? color : 0xffffff);
      p.position.set(x + (Math.random() - 0.5) * 2, Math.random() * 3, z + (Math.random() - 0.5) * 2);
      this.add(p, 0.8, -0.3, 0.7, { vx: 0, vz: 0, vy: 6 + Math.random() * 6 });
    }
  }

  /** 撃つ技の発射: 撃った所に小さな光の輪(企画者の演出指示「発射時に小さな光のリング」) */
  muzzle(side: number, tech: TechId): void {
    const t = getTech(tech);
    const rig = this.rigs[side];
    const p = this.tmpV;
    const ok = t.kind === 'shot' && t.strength === '弱' ? rig.glove(p) : rig.gloves(p);
    if (!ok) rig.mouth.getWorldPosition(p);
    const col = t.element === '無' ? 0xffd080 : ELEMENT_HEX[t.element];
    const big = t.kind === 'beam' ? 1.8 : t.strength === '弱' ? 0.6 : 1;
    this.shockRing(p.x, p.y, p.z, col, big);
    const f = this.sprite(0xffffff, true, this.star);
    f.position.copy(p);
    this.add(f, 0.15, 2, 0.6 * big);
  }

  /**
   * 連続攻撃の1発ごとの命中(企画者の演出指示「各攻撃に異なる軌跡とヒットエフェクト・最後の一撃を派手に」)。
   * n: 何発目。奇数は右から・偶数は左からの弧、さいごは大きな星と光の輪
   */
  comboHit(x: number, y: number, z: number, dir: number, n: number, last: boolean, strong: boolean): void {
    const col = [0xffe060, 0xff9a3a, 0xffffff, 0xff6aa0][(n - 1) % 4];
    if (!last) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 6, 24, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      arc.position.set(x, y, z);
      arc.lookAt(this.camera.position);
      arc.rotateZ(n % 2 ? -0.6 : Math.PI + 0.6);
      this.add(arc, 0.2, 0.6, 1);
      for (let i = 0; i < 6; i++) {
        const s = this.sprite(col, true, this.star);
        s.position.set(x, y, z);
        const a = dir + (n % 2 ? 1 : -1) * (0.4 + Math.random() * 0.9);
        this.add(s, 0.22, -0.5, 0.3, { vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, vy: 1 + Math.random() * 3 });
      }
      this.shockRing(x, y, z, col, 0.7);
      return;
    }
    // さいごの1発
    const st = this.sprite(0xffffff, true, this.star);
    st.position.set(x, y, z);
    this.add(st, 0.3, 3.5, strong ? 1.6 : 1.1);
    this.shockRing(x, y, z, 0xffd060, strong ? 2 : 1.4);
    this.rushHit(x, y, z, dir, 0xff9a3a, strong);
    this.shake(strong ? 0.5 : 0.3);
  }

  /**
   * ツルのムチ(MOFU の通常攻撃。2026-11-03 企画者「ツルの鞭みたいな中距離」): 体の前(手があれば手)から、
   * 緑のツルが しなりながら前へのびる。n で左右に しなる向きを変える
   */
  vineWhip(side: number, dir: number, len: number, n: number): void {
    const rig = this.rigs[side];
    const start = new THREE.Vector3();
    if (!rig.glove(start)) rig.mouth.getWorldPosition(start);
    start.y = Math.max(0.5, start.y - 0.1);
    const sideX = -Math.sin(dir);
    const sideZ = Math.cos(dir);
    const sgn = n % 2 ? 1 : -1;
    const vinePts = (bend: number, reach: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        const wave = Math.sin(k * Math.PI) * bend * (1 - k * 0.3) + bend * 0.25 * k;
        pts.push(new THREE.Vector3(start.x + Math.cos(dir) * reach * k + sideX * wave, start.y + Math.sin(k * Math.PI) * 0.45 - k * 0.15, start.z + Math.sin(dir) * reach * k + sideZ * wave));
      }
      return pts;
    };
    // 2026-11-03 企画者「エフェクトしょぼい」→ 大きく横から振りぬく(残像が2つ)・先に緑の斬撃の弧・葉っぱが舞う
    const life = 0.42;
    const tube = (pts: THREE.Vector3[], r: number, col: number, opacity: number, addMode: boolean, delay: number, grow: number) => {
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 7, false);
      const total = geo.index ? geo.index.count : 0;
      geo.setDrawRange(0, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, depthWrite: false, ...(addMode ? { blending: THREE.AdditiveBlending } : {}) }));
      m.renderOrder = 3;
      this.add(m, life, 0, 1, { must: true, tick: (k) => geo.setDrawRange(0, Math.floor((total * Math.max(0, Math.min(1, (k - delay) / grow))) / 6) * 6) });
    };
    // 残像(大きく しなった前の位置) → 本体
    tube(vinePts(sgn * 2.4, len * 0.85), 0.12, 0x6adf4a, 0.25, true, 0, 0.18);
    tube(vinePts(sgn * 1.5, len * 0.95), 0.13, 0x6adf4a, 0.4, true, 0.05, 0.2);
    const main = vinePts(sgn * 0.7, len);
    tube(main, 0.19, 0x1a4a1a, 1, false, 0.1, 0.22);
    tube(main, 0.13, 0x4fc04f, 1, false, 0.1, 0.22);
    tube(main, 0.055, 0xe0ffb8, 1, true, 0.1, 0.22);
    // ツルのトゲのような葉っぱ
    for (let i = 2; i <= 9; i += 2) {
      const lp = this.sprite(0x8aef6a, false, this.leafTex);
      lp.position.copy(main[i]);
      lp.material.rotation = Math.random() * Math.PI;
      this.add(lp, life * 0.9, 0.3, 0.36, { must: true });
    }
    // 先: 緑の斬撃の弧(カメラを向く)と光
    const tip = main[main.length - 1];
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.09, 6, 28, Math.PI * 0.85), new THREE.MeshBasicMaterial({ color: 0xb8ff7a, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    arc.position.copy(tip);
    arc.lookAt(this.camera.position);
    arc.rotateZ(sgn > 0 ? 0.3 : Math.PI - 0.3);
    this.add(arc, 0.24, 0.9, 1, { must: true });
    const flash = this.sprite(0xeaffc0, true, this.star);
    flash.position.copy(tip);
    this.add(flash, 0.22, 2.4, 0.9, { must: true });
    for (let i = 0; i < 8; i++) {
      const p = this.sprite(i % 2 ? 0x7adf5a : 0xffffff);
      p.position.copy(tip);
      const a2 = Math.random() * Math.PI * 2;
      this.add(p, 0.35, -0.4, 0.35, { vx: Math.cos(a2) * 3, vz: Math.sin(a2) * 3, vy: 1 + Math.random() * 2.5 });
    }
  }

  /** MOFU らしさ(2026-11-03 企画者「モフっぽいのに」): ふわふわの綿毛のかたまり */
  cotton(x: number, y: number, z: number, n: number, spread = 1, speed = 2): void {
    for (let i = 0; i < n; i++) {
      const p = this.sprite(i % 4 ? 0xffffff : 0xe8dcff, false, this.puffTex);
      p.material.opacity = 0.9;
      p.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.5, z + (Math.random() - 0.5) * spread);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random());
      this.add(p, 0.6 + Math.random() * 0.4, 0.6, 0.35 + Math.random() * 0.3, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 0.4 + Math.random() * 1.2 });
    }
  }

  /** 花びら(ピンク・白)が ひらひら */
  petals(x: number, y: number, z: number, n: number, speed = 3): void {
    for (let i = 0; i < n; i++) {
      const p = this.sprite(i % 3 ? 0xff9ad0 : 0xffffff, false, this.leafTex);
      p.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random());
      const spin = (Math.random() - 0.5) * 14;
      this.add(p, 0.7 + Math.random() * 0.3, -0.2, 0.22 + Math.random() * 0.12, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1 + Math.random() * 2.5, tick: () => { p.material.rotation += spin / 60; } });
    }
  }

  /**
   * 新しい5体の 通常攻撃の 1発(当たらなくても 出す。2026-11-05 企画者「その場で何してるか全然わからない」)。
   * (x, z): 打った側の場所・dir: 向き・reach: とどく長さ・h: 体の高さ
   * 爪 = 3本の ひっかき線 / かみつき = 上下の キバが とじる / 頭突き・体当たり = 前へ 風の輪 / 甲羅・しっぽ = 体のまわりを 回る 弧 / 電気 = 口から 稲妻
   */
  monSwing(x: number, z: number, dir: number, move: string, reach: number, h: number, last: boolean, col?: number): void {
    const cx = x + Math.cos(dir) * reach * 0.75;
    const cz = z + Math.sin(dir) * reach * 0.75;
    const y = h;
    const mat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    if (move === 'clawR' || move === 'clawL') {
      const sgn = move === 'clawL' ? -1 : 1;
      for (let i = -1; i <= 1; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.075), mat(i ? 0xffffff : col ?? 0xff5a3a));
        m.position.set(cx, y, cz);
        m.lookAt(this.camera.position);
        m.rotateZ(sgn * 0.85);
        m.translateY(i * 0.2);
        this.add(m, 0.24, 0.35, last ? 1.3 : 1);
      }
      return;
    }
    if (move === 'bite') {
      // 上と下の キバ(白い弧)が まん中へ とじる
      for (const up of [1, -1]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 18, Math.PI), mat(col ?? 0xffffff));
        arc.position.set(cx, y, cz);
        arc.lookAt(this.camera.position);
        if (up < 0) arc.rotateZ(Math.PI);
        const off = new THREE.Vector3(0, up * 0.32, 0).applyQuaternion(arc.quaternion);
        const base = arc.position.clone();
        this.add(arc, 0.22, 0.2, last ? 1.3 : 1, { tick: (k) => arc.position.copy(base).addScaledVector(off, 1 - Math.min(1, k * 2.5)) });
      }
      return;
    }
    if (move === 'head' || move === 'shoulder') {
      // 前へ つっこむ 風(輪と 線)
      this.shockRing(cx, y, cz, col ?? 0xffffff, last ? 0.9 : 0.6);
      for (let i = 0; i < 5; i++) {
        const sp = this.sprite(0xfff0c0, true, this.star);
        sp.position.set(x + Math.cos(dir) * 0.4, y + (Math.random() - 0.5) * 0.5, z + Math.sin(dir) * 0.4);
        const a = dir + (Math.random() - 0.5) * 0.5;
        this.add(sp, 0.2, -0.4, 0.22, { vx: Math.cos(a) * 9, vz: Math.sin(a) * 9 });
      }
      return;
    }
    if (move === 'shell' || move === 'tail') {
      // 体のまわりを まわる 弧(甲羅は 水色・しっぽは 紫)
      const rc = col ?? (move === 'shell' ? 0x7ae0ff : 0xc08aff);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(reach * 0.75, 0.08, 6, 32, Math.PI * 1.3), mat(rc));
      arc.position.set(x, move === 'shell' ? h * 0.8 : 0.35, z);
      arc.rotation.x = -Math.PI / 2;
      const r0 = -dir - Math.PI * 0.8;
      arc.rotation.z = r0;
      this.add(arc, 0.26, 0.15, 1, { tick: (k) => { arc.rotation.z = r0 - k * 2.2; } });
      return;
    }
    if (move === 'zap') {
      this.bolt(x + Math.cos(dir) * 0.6, y, z + Math.sin(dir) * 0.6, x + Math.cos(dir) * (reach + 0.4), y, z + Math.sin(dir) * (reach + 0.4), last ? 1.4 : 1);
      this.bolt(x + Math.cos(dir) * 0.6, y, z + Math.sin(dir) * 0.6, x + Math.cos(dir + 0.25) * reach, y + 0.2, z + Math.sin(dir + 0.25) * reach, 0.6);
    }
  }

  /** ためている間: 光の粒が 体へ すいこまれる(いっぱいに なると 金色)(2026-11-05) */
  chargeFx(x: number, y: number, z: number, full: boolean): void {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.1 + Math.random() * 0.5;
      const h = (Math.random() - 0.3) * 1.2;
      const s = this.sprite(full ? 0xffd23a : 0xffffff, true, this.star);
      s.position.set(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r);
      const L = 0.22;
      this.add(s, L, -0.6, full ? 0.3 : 0.22, { vx: (-Math.cos(a) * r) / L, vz: (-Math.sin(a) * r) / L, vy: -h / L });
    }
  }

  /**
   * 新しい5体の 技の 1歩の光(2026-11-05 企画者「全部一緒でつまらない」→ 技ごとに ちがう光)。
   * (x, z): 光の まん中・(ax, az): 打った側の場所・col: 種族・属性の色
   */
  beastFx(fx: string, x: number, z: number, ax: number, az: number, y: number, dir: number, hit: boolean, col: number): void {
    const big = fx === 'nova' || fx === 'titan' || fx === 'abyssBurst';
    switch (fx) {
      case 'claw':
      case 'clawUp':
        this.monSwing(x, z, dir, Math.random() < 0.5 ? 'clawR' : 'clawL', 0, y, fx === 'clawUp', col);
        if (fx === 'clawUp') for (let i = 0; i < 8; i++) this.flame(x, y, z, 0.4, 1);
        break;
      case 'bite':
      case 'darkBite':
      case 'fireBite':
        this.monSwing(x, z, dir, 'bite', 0, y, false, col);
        if (fx === 'fireBite') this.flame(x, y, z, 0.5, 4);
        break;
      case 'bigJaw':
        // 大きな あご: キバが 大きく とじる
        this.monSwing(x, z, dir, 'bite', 0, y, true, col);
        this.monSwing(x, z, dir, 'bite', 0, y + 0.05, true, 0xffffff);
        break;
      case 'head':
      case 'shove':
        this.monSwing(x, z, dir, 'head', 0, y, fx === 'head', col);
        if (fx === 'shove') this.dust(x, z, false);
        break;
      case 'flameBurst':
        this.flameBurst(x, y, z);
        this.monSwing(x, z, dir, 'clawR', 0, y, true, col);
        break;
      case 'flame':
        // 炎の息: 口から 前へ ひろがる 炎
        for (let k = 0; k < 4; k++) {
          const d = 0.8 + k * 0.9;
          this.flame(ax + Math.cos(dir) * d, y, az + Math.sin(dir) * d, 0.3 + k * 0.25, 2);
        }
        break;
      case 'wave':
        // うなり声の 地面の波(前へ 走る)
        this.groundRing(x, z, 0.9, col, 0.35, 1.6);
        this.dust(x, z, false);
        break;
      case 'stomp':
        this.crack(x, z, 0.9);
        this.rocks(x, z);
        this.groundRing(x, z, 0.8, 0xc8a070, 0.3, 1.4);
        break;
      case 'slam':
      case 'darkSlam':
      case 'titan':
      case 'nova':
        this.impact(x, z, big ? 3.6 : 2, big, big ? 3 : 2);
        this.groundRing(x, z, big ? 2.5 : 1.4, col, 0.5, big ? 2.6 : 1.8);
        if (fx === 'titan') for (let i = 0; i < 3; i++) this.rocks(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4);
        if (fx === 'nova') for (let i = 0; i < 10; i++) { const g = (i / 10) * Math.PI * 2; this.flame(x + Math.cos(g) * 2.2, 0.5, z + Math.sin(g) * 2.2, 0.6, 3); }
        if (fx === 'darkSlam') this.groundRing(x, z, 1, 0x9a4aff, 0.6, 2.2);
        this.shake(big ? 0.7 : 0.4);
        break;
      case 'ring':
        // しっぽ・体で まわりを はらう 弧
        this.monSwing(ax, az, dir, 'tail', 3, y * 0.5, true, col);
        break;
      case 'spark':
      case 'sparkUp':
      case 'cross':
        // VYBE: 電気の 爪(サンダークロスは 2本 交差)
        this.monSwing(x, z, dir, Math.random() < 0.5 ? 'clawR' : 'clawL', 0, y, fx !== 'spark', col);
        if (fx === 'cross') this.monSwing(x, z, dir, 'clawL', 0, y, true, 0xffffff);
        this.zap(x, y, z);
        if (fx === 'sparkUp') this.bolt(x, y - 0.4, z, x, y + 2.2, z, 1.2);
        break;
      case 'sparkBite':
      case 'lightBite':
        this.monSwing(x, z, dir, 'bite', 0, y, false, col);
        if (fx === 'sparkBite') this.zap(x, y, z);
        else this.shockRing(x, y, z, 0xfff6c0, 0.7);
        break;
      case 'sparkRing':
      case 'lightRing':
      case 'shellRing':
        this.monSwing(ax, az, dir, 'tail', 2.8, y * 0.6, true, col);
        if (fx === 'sparkRing') this.bolt(ax - 1.4, y, az, ax + 1.4, y, az, 0.8);
        break;
      case 'spikes':
        // SHELLZ: 甲羅の トゲ
        this.monSwing(ax, az, dir, 'shell', 2.4, y * 0.7, true, 0xe0d0b0);
        for (let i = 0; i < 6; i++) {
          const st = this.sprite(0xffffff, true, this.star);
          st.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
          this.add(st, 0.2, 1.2, 0.35);
        }
        break;
      case 'splashSlam':
        this.impact(x, z, 2, false, 2, true);
        this.splash(x, 0.6, z);
        this.groundRing(x, z, 1.6, 0x5ac8ff, 0.5, 2);
        this.shake(0.4);
        break;
      case 'whirl':
        // 甲羅タイフーン: 水の うず
        this.monSwing(ax, az, dir + Math.random() * 6, 'tail', 4, 0.5, true, 0x5ac8ff);
        this.splash(ax + (Math.random() - 0.5) * 3, 0.5, az + (Math.random() - 0.5) * 3);
        break;
      case 'waterTrail':
        this.splash(x, y, z);
        this.monSwing(x, z, dir, 'head', 0, y, true, col);
        break;
      case 'tongue':
        // SNEK 闇の舌: むらさきの 舌が のびる
        this.monSwing(ax, az, dir, 'head', 0, y, true, 0x9a4aff);
        for (let k = 1; k <= 4; k++) {
          const t2 = this.sprite(0xb070ff);
          t2.position.set(ax + Math.cos(dir) * k * 0.8, y - 0.2, az + Math.sin(dir) * k * 0.8);
          this.add(t2, 0.22, -0.3, 0.45);
        }
        break;
      case 'sparkAura':
        this.bolt(ax, 0.2, az, ax, y + 1.6, az, 1);
        break;
      case 'thunderDive':
        this.bolt(x, 6, z, x, 0.1, z, 2);
        this.impact(x, z, 2.2, true, 2);
        this.zap(x, 0.8, z);
        this.shake(0.5);
        break;
      case 'abyss':
        // 闇の とぐろ: まわりに 闇の 弧が 回る
        this.monSwing(ax, az, dir + Math.random() * 6, 'tail', 4.6, 0.6, true, 0x7a3ad0);
        this.groundRing(ax, az, 3.2, 0x5a1a9a, 0.3, 0.4);
        break;
      case 'abyssBurst':
        this.shockRing(ax, 1, az, 0x9a4aff, 3);
        this.groundRing(ax, az, 3.6, 0x7a3ad0, 0.6, 1.5);
        this.shake(0.5);
        break;
      default:
        this.monSwing(x, z, dir, 'head', 0, y, false, col);
    }
    if (hit && !big) {
      const st = this.sprite(0xffffff, true, this.star);
      st.position.set(x, y, z);
      this.add(st, 0.18, 2.2, 0.7);
    }
  }

  /** 歩いている間の 光(炎の 足あと・影・炎を まとう) */
  beastTrail(fx: string, x: number, z: number): void {
    if (fx === 'fireTrail' || fx === 'flameAura') this.flame(x, 0.3 + Math.random() * 0.6, z, fx === 'flameAura' ? 0.7 : 0.35, fx === 'flameAura' ? 3 : 2);
    else if (fx === 'waterTrail') {
      const s = this.sprite(0x8ad8ff, true);
      s.position.set(x + (Math.random() - 0.5) * 0.6, 0.2, z + (Math.random() - 0.5) * 0.6);
      this.add(s, 0.4, 0.6, 0.5, { vy: 1.5 });
    } else if (fx === 'shadow') {
      for (let i = 0; i < 2; i++) {
        const s = this.sprite(i ? 0x2a0a40 : 0x6a2ab0, false);
        s.position.set(x + (Math.random() - 0.5) * 0.8, 0.25, z + (Math.random() - 0.5) * 0.8);
        this.add(s, 0.5, 0.8, 0.7, { vy: 0.6 });
      }
    }
  }

  /** 新しい5体の 通常攻撃が 当たった(動きごとの 光。さいごの1発は 大きく ゆれる) */
  monHit(x: number, y: number, z: number, dir: number, move: string, last: boolean): void {
    const st = this.sprite(0xffffff, true, this.star);
    st.position.set(x, y, z);
    this.add(st, 0.2, 2.6, last ? 1.2 : 0.8);
    if (move === 'clawR' || move === 'clawL') this.rushHit(x, y, z, dir, 0xff5a3a, last);
    else if (move === 'bite') this.rushHit(x, y, z, dir, 0xffffff, last);
    else if (move === 'head' || move === 'shoulder') {
      this.shockRing(x, y, z, 0xffc040, last ? 1.6 : 1.1);
      this.rushHit(x, y, z, dir, 0xffa040, last);
    } else if (move === 'shell') this.spinHit(x, y, z, 0x7ae0ff);
    else if (move === 'tail') this.spinHit(x, y, z, 0xc08aff);
    else if (move === 'zap') this.zap(x, y, z);
    this.shake(last ? 0.3 : 0.12);
  }

  /** ツルのムチが当たった: 葉っぱが くるくる回りながら はじける・緑の光の輪 */
  whipHit(x: number, y: number, z: number, last: boolean): void {
    for (let i = 0; i < (last ? 16 : 10); i++) {
      const lp = this.sprite(i % 3 ? 0x7adf5a : 0xc8ff9a, false, this.leafTex);
      lp.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 3.5;
      const spin = (Math.random() - 0.5) * 20;
      this.add(lp, 0.55, -0.3, 0.32, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.5 + Math.random() * 3, tick: () => { lp.material.rotation += spin / 60; } });
    }
    this.shockRing(x, y, z, 0x7adf5a, last ? 1.6 : 1.1);
    const st = this.sprite(0xffffff, true, this.star);
    st.position.set(x, y, z);
    this.add(st, 0.18, 2.6, last ? 1.1 : 0.8);
    this.shake(last ? 0.3 : 0.18);
  }

  /** 稲妻の線(ぎざぎざ。白いしんと 黄色い光)。ZIPP の電撃ダッシュ・ジグザグ・回りこみ(2026-11-03) */
  bolt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w = 1, life = 0.22): void {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (len < 0.05) return;
    const n = Math.max(2, Math.min(9, Math.round(len / 0.6)));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const j = i === 0 || i === n ? 0 : 0.28 * w;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * k + (Math.random() - 0.5) * j, y0 + (y1 - y0) * k + (Math.random() - 0.5) * j, z0 + (z1 - z0) * k + (Math.random() - 0.5) * j));
    }
    const g = new THREE.Group();
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const c = pts[i + 1];
      const l = a.distanceTo(c);
      for (const [mat, th] of [[core, 0.05 * w], [glow, 0.16 * w]] as const) {
        const m = new THREE.Mesh(this.boltGeo, mat);
        m.position.copy(a).lerp(c, 0.5);
        m.scale.set(th, th, l + th);
        m.lookAt(c);
        g.add(m);
      }
    }
    this.add(g, life, 0, 1, {
      fade: false,
      shared: true,
      sharedMat: true,
      tick: (k) => {
        core.opacity = 1 - k;
        glow.opacity = 0.75 * (1 - k);
        if (k >= 1) {
          core.dispose();
          glow.dispose();
        }
      },
    });
  }

  /** ZIPP の電撃ダッシュの 走り出し(ためたほど 大きい) */
  zdashStart(side: number, x: number, z: number, dir: number, c: number): void {
    this.zap(x, 0.7, z);
    this.groundRing(x, z, 0.8 + c, 0xffd23a, 0.3, 1.5);
    for (let k = 0; k < 2 + Math.round(c * 3); k++) {
      const a = dir + Math.PI + (Math.random() - 0.5) * 1.6;
      const r = 0.6 + Math.random() * (0.6 + c);
      this.bolt(x, 0.3 + Math.random() * 0.8, z, x + Math.cos(a) * r, 0.2 + Math.random(), z + Math.sin(a) * r, 0.7, 0.18);
    }
    void side;
  }

  /** しぶき(PUNI のぷに玉が当たった・はじけた。緑) */
  splash(x: number, y: number, z: number): void {
    for (let i = 0; i < 10; i++) {
      const d = this.sprite(i % 3 ? 0x7ae05a : 0xffffff);
      d.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.add(d, 0.45, -0.4, 0.3, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 3, fade: true });
    }
    this.groundRing(x, z, 0.7, 0x7ae05a, 0.35, 1.4);
  }

  /** KLAK の はさみトラップが はさんだ */
  trapSnap(x: number, z: number): void {
    this.shockRing(x, 0.4, z, 0xff5040, 1.2);
    for (let k = 0; k < 8; k++) {
      const sp = this.sprite(k % 2 ? 0xffffff : 0xffc040, true, this.star);
      sp.position.set(x + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.7, z + (Math.random() - 0.5) * 0.8);
      this.add(sp, 0.25, 1.5, 0.35);
    }
  }

  /** KLAK の はさみトラップ: 地面の金属の輪と、開いた はさみ。効くようになると赤いランプが点めつ。はさむと閉じる */
  private drawTraps(b: AnimeBattle): void {
    const alive = new Set<number>();
    for (const tp of b.traps) {
      alive.add(tp.id);
      let g = this.trapObjs.get(tp.id);
      if (!g) {
        g = new THREE.Group();
        const metal = new THREE.MeshToonMaterial({ color: 0x8a96a8, gradientMap: this.gradient });
        const dark = new THREE.MeshToonMaterial({ color: 0x3a4250, gradientMap: this.gradient });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(tp.r * 0.9, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffc020 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(tp.r * 0.35, tp.r * 0.4, 0.08, 12), dark);
        plate.position.y = 0.04;
        g.add(ring, plate);
        // はさみ 2つ(ぎざぎざの歯つき)。userData.side で 開き・閉じ
        for (const sd of [1, -1]) {
          const jaw = new THREE.Group();
          const bar = new THREE.Mesh(new THREE.TorusGeometry(tp.r * 0.75, 0.08, 5, 12, Math.PI), metal);
          jaw.add(bar);
          for (let k = 1; k < 6; k++) {
            const a = (k / 6) * Math.PI;
            const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), metal);
            tooth.position.set(Math.cos(a) * tp.r * 0.75, Math.sin(a) * tp.r * 0.75 - 0.1, 0);
            tooth.rotation.z = Math.PI;
            jaw.add(tooth);
          }
          jaw.userData.side = sd;
          jaw.rotation.y = sd > 0 ? 0 : Math.PI;
          g.add(jaw);
        }
        const lamp = this.sprite(0xff3020);
        lamp.position.y = 0.2;
        lamp.scale.setScalar(0.35);
        g.add(lamp);
        g.position.set(tp.x, 0, tp.z);
        this.scene.add(g);
        this.trapObjs.set(tp.id, g);
        this.groundRing(tp.x, tp.z, tp.r, 0xffc040, 0.3, 0.6);
      }
      const armed = b.t >= tp.armAt;
      const close = tp.snapAt === undefined ? 0 : Math.min(1, (b.t - tp.snapAt) / 0.08);
      for (const c of g.children) {
        if (c.userData.side === undefined) continue;
        // 開いている: ななめに開いた口(見て分かるように 少し立てる) → 閉じる: 立ち上がって 合わさる
        c.rotation.x = 0;
        c.rotation.z = 0;
        const open = (1 - close) * (armed ? 1.05 : 1.3);
        c.rotation.set(c.userData.side > 0 ? -open : open, c.userData.side > 0 ? 0 : Math.PI, 0);
      }
      const lamp = g.children[g.children.length - 1] as THREE.Sprite;
      lamp.visible = armed && tp.snapAt === undefined && Math.sin(performance.now() / 110) > 0;
      // 消える前は 点めつ
      g.visible = tp.snapAt !== undefined || tp.until - b.t > 1.2 || Math.sin(performance.now() / 60) > 0;
    }
    for (const [id, g] of this.trapObjs)
      if (!alive.has(id)) {
        this.scene.remove(g);
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          (m.material as THREE.Material | undefined)?.dispose?.();
        });
        this.trapObjs.delete(id);
      }
  }

  /** 光の輪(撃った所) */
  private muzzleAt(x: number, y: number, z: number): void {
    const s = this.sprite(0xffffff, true, this.star);
    s.position.set(x, y, z);
    this.add(s, 0.2, 2, 0.6);
  }

  /**
   * 技ごとの とくべつな見た目(2026-11-03 企画者「そのキャラにあった技を」):
   * ねらう技の赤い線・光軌レールの地面の線・ぷにタッチの のびる体・超膨張インパクト/大ぷにプレスで ふくらむ体
   */
  private styleFx(b: AnimeBattle, f: AnimeMon, i: number, dt: number): void {
    const a = f.act;
    const o = b.f[i === 0 ? 1 : 0];
    const st = a.k === 'tech' ? ANIME.techStyle[a.id] : undefined;
    let line = this.aimLines[i];
    if (!line) {
      line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      this.scene.add(line);
      this.aimLines[i] = line;
    }
    let ten = this.tendrils[i];
    if (!ten) {
      ten = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshToonMaterial({ color: 0x7ad85a, gradientMap: this.gradient }));
      this.scene.add(ten);
      this.tendrils[i] = ten;
    }
    line.visible = false;
    ten.visible = false;
    const rig = this.rigs[i];
    let grow = 1;
    if (a.k === 'tech') {
      const aiming = !a.fired && (st === 'sweep' || st === 'snipe' || st === 'pinpoint' || st === 'rail');
      if (aiming) {
        // ねらいの線: 赤く(光軌レールは 地面に 光の線)。ためるほど 太く 明るく
        const w = Math.min(1, a.t / a.windup);
        const len = st === 'rail' ? getTech(a.id).range : Math.max(1, Math.hypot(o.x - f.x, o.z - f.z));
        const y = st === 'rail' ? 0.05 : 0.85;
        line.visible = true;
        line.position.set(f.x + Math.cos(a.dir) * len * 0.5, y, f.z + Math.sin(a.dir) * len * 0.5);
        line.rotation.set(-Math.PI / 2, 0, -a.dir);
        line.scale.set(len, (st === 'rail' ? 0.6 : 0.05) * (0.5 + w), 1);
        const m = line.material as THREE.MeshBasicMaterial;
        m.color.setHex(st === 'rail' ? 0xfff2a0 : 0xff3030);
        m.opacity = (0.3 + 0.5 * w) * (Math.sin(performance.now() / 50) > -0.3 ? 1 : 0.4);
      }
      if (st === 'stretch' && a.fired) {
        // ぷにタッチ: 体が にゅっと のびる(緑のぷにぷに)
        const k = a.t - a.windup;
        const ext = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.2);
        if (ext > 0) {
          const len = ANIME.style.stretchReach * ext;
          ten.visible = true;
          ten.position.set(f.x + Math.cos(a.dir) * (0.4 + len / 2), 0.75, f.z + Math.sin(a.dir) * (0.4 + len / 2));
          ten.rotation.set(0, -a.dir, Math.PI / 2);
          ten.scale.set(0.22 + 0.06 * Math.sin(k * 40), len, 0.22);
        }
      }
      if (st === 'inflate' && !a.fired) grow = 1 + 1.2 * Math.min(1, a.t / a.windup);
      if (st === 'bigPress' && a.fired && f.y > 0) grow = 1.55;
      if (st === 'elastic' && dt > 0 && Math.random() < dt * 30) {
        const p = this.sprite(0xc0ffb0);
        p.position.set(f.x + (Math.random() - 0.5) * 1.2, f.y + Math.random() * 1.4, f.z + (Math.random() - 0.5) * 1.2);
        this.add(p, 0.4, -0.5, 0.4);
      }
    }
    // ジップタックル: ためている間 体が 消えかける(ちらちら)
    rig.root.visible = !(a.k === 'tech' && st === 'vanishTackle' && !a.fired && Math.sin(performance.now() / 25) > -0.6);
    // 残光ステップ中: 黄色い残像が ずっと のこる
    if (dt > 0 && b.t < (f.blinkUntil ?? 0) && Math.random() < dt * 25) {
      const g = this.sprite(0xffe060);
      g.position.set(f.x, f.y + 0.75, f.z);
      this.add(g, 0.3, -0.2, 1.5);
    }
    // ぐにゃりスリップ中: 足もとが 緑に てかてか
    if (dt > 0 && b.t < (f.slipUntil ?? 0) && Math.random() < dt * 20) {
      const g = this.sprite(0x9af07a);
      g.position.set(f.x + (Math.random() - 0.5) * 0.8, 0.08, f.z + (Math.random() - 0.5) * 0.8);
      this.add(g, 0.5, 0.6, 0.5);
    }
    // 体の大きさ(なめらかに もどる)
    const cur = rig.root.scale.x;
    rig.root.scale.setScalar(cur + (grow - cur) * Math.min(1, dt * 12 + (dt === 0 ? 0 : 0.05)));
  }

  private guardObjs: THREE.Mesh[] = [];
  private guardGlow = [0, 0];
  /** ガード: 体の前に 青い光の盾(ガードの量が へると 小さく・赤く)。受けた時に 光る */
  guardFlash(side: number, just: boolean, broke = false): void {
    this.guardGlow[side] = just ? 2 : 1;
    const f = this.lastB?.f[side];
    if (!f) return;
    const x = f.x + Math.cos(f.face) * 0.8;
    const z = f.z + Math.sin(f.face) * 0.8;
    if (broke) {
      for (let k = 0; k < 10; k++) {
        const p = this.sprite(k % 2 ? 0x7ad0ff : 0xffffff, true, this.star);
        p.position.set(x, 0.9, z);
        const a = Math.random() * Math.PI * 2;
        this.add(p, 0.5, 0.5, 0.4, { vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, vy: 3 });
      }
      return;
    }
    this.shockRing(x, 0.9, z, just ? 0xffffff : 0x7ad0ff, just ? 1.6 : 0.9);
    if (just) {
      const st = this.sprite(0xffffff, true, this.star);
      st.position.set(x, 0.9, z);
      this.add(st, 0.3, 3, 1.2);
    }
  }

  private drawGuards(b: AnimeBattle, dt: number): void {
    b.f.forEach((f, i) => {
      let m = this.guardObjs[i];
      if (!m) {
        const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.hexTex, color: 0x7ad0ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        // 2026-11-04 企画者「ガードが薄いからもう少し濃く」→ 中を 青く ぬった 盾を重ねる(ふつうの色の重ね方で はっきり見える)
        const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a9cff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
        fill.renderOrder = -1;
        m.add(fill);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
        rim.rotation.x = Math.PI / 2;
        m.add(rim);
        this.scene.add(m);
        this.guardObjs[i] = m;
      }
      const on = f.act.k === 'guard';
      m.visible = on || this.guardGlow[i] > 0.05;
      this.guardGlow[i] = Math.max(0, this.guardGlow[i] - dt * 4);
      if (!m.visible) return;
      const g = f.guardGauge / ANIME.guard.max;
      // 体の前に 立てた 半分の球(盾)
      // 横から見ても わかるように、大きく まるい盾(2026-11-04 企画者「見えにくい」)
      m.position.set(f.x + Math.cos(f.face) * 0.3, f.y + 0.85, f.z + Math.sin(f.face) * 0.3);
      m.rotation.set(0, -f.face, -Math.PI / 2);
      const sc = (0.85 + 0.3 * g) * (1 + this.guardGlow[i] * 0.15);
      m.scale.set(sc * 1.3, sc * 0.85, sc * 1.3);
      const mat = m.material as THREE.MeshBasicMaterial;
      const low = g <= 0.3;
      mat.color.setHex(this.guardGlow[i] > 1 ? 0xffffff : low ? 0xff6a4a : 0x9ae0ff);
      const k = (on ? 1 : 0) * (0.85 + 0.15 * Math.sin(performance.now() / 60));
      mat.opacity = Math.min(1, k + this.guardGlow[i] * 0.4);
      const fillMat = (m.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      fillMat.color.setHex(low ? 0xff4a2a : 0x3a9cff);
      fillMat.opacity = Math.min(0.7, 0.5 * k + this.guardGlow[i] * 0.25);
      ((m.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.9 * k + this.guardGlow[i] * 0.4);
    });
  }

  private tetherObjs: THREE.Mesh[] = [];
  /** ぷに触手ドレイン: PUNI から相手へ のびる 緑の触手(ぴくぴく 動いて、光の粒が PUNI へ もどる) */
  private drawTethers(b: AnimeBattle, dt: number): void {
    while (this.tetherObjs.length < b.tethers.length) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshToonMaterial({ color: 0x7ad85a, gradientMap: this.gradient }));
      this.scene.add(m);
      this.tetherObjs.push(m);
    }
    this.tetherObjs.forEach((m, i) => {
      const th = b.tethers[i];
      m.visible = !!th;
      if (!th) return;
      const ow = b.f[th.owner];
      const tg = b.f[th.owner === 0 ? 1 : 0];
      const ax = ow.x;
      const az = ow.z;
      const dx = tg.x - ax;
      const dz = tg.z - az;
      const len = Math.hypot(dx, dz);
      m.position.set(ax + dx / 2, 0.8 + Math.sin(performance.now() / 70) * 0.05, az + dz / 2);
      m.rotation.set(0, -Math.atan2(dz, dx), Math.PI / 2);
      m.scale.set(0.1 + Math.sin(performance.now() / 60) * 0.02, len, 0.1);
      if (dt > 0 && Math.random() < dt * 20) {
        const p = this.sprite(0xc0ffa0);
        p.position.set(tg.x, 0.8, tg.z);
        this.add(p, len / 8, -0.3, 0.35, { vx: -dx / len * 8, vz: -dz / len * 8, vy: 0 });
      }
    });
  }

  /** 十字・線の場(十字ワイヤー・雷走ブレイカーの電気の線) */
  private drawShapeFields(b: AnimeBattle, dt: number): void {
    const alive = new Set<object>();
    for (const fl of b.fields) {
      if (!fl.shape) continue;
      alive.add(fl);
      let g = this.shapeFields.get(fl);
      if (!g) {
        g = new THREE.Group();
        // 炎の爪痕(RIOT)は オレンジの 炎の線(2026-11-05)
        const col = fl.shape === 'line' ? (getTech(fl.tech).element === '炎' ? 0xff6a1a : 0xffd23a) : 0x80e8ff;
        const mk = () => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2;
          return m;
        };
        if (fl.shape === 'line' && fl.x2 !== undefined && fl.z2 !== undefined) {
          const len = Math.hypot(fl.x2 - fl.x, fl.z2 - fl.z);
          const m = mk();
          m.scale.set(len, fl.r * 1.2, 1);
          m.rotation.z = -Math.atan2(fl.z2 - fl.z, fl.x2 - fl.x);
          g.add(m);
          g.position.set((fl.x + fl.x2) / 2, 0.04, (fl.z + fl.z2) / 2);
        } else {
          for (const r of [0, Math.PI / 2]) {
            const m = mk();
            m.scale.set(fl.r * 2, 0.5, 1);
            m.rotation.z = -(fl.rot ?? 0) - r;
            g.add(m);
            // ワイヤーのはしの 杭
            for (const sd of [1, -1]) {
              const post = new THREE.Mesh(this.boltGeo, new THREE.MeshToonMaterial({ color: 0x506070, gradientMap: this.gradient }));
              post.scale.set(0.12, 0.6, 0.12);
              const ang = (fl.rot ?? 0) + r;
              post.position.set(Math.cos(ang) * fl.r * sd, 0.3, Math.sin(ang) * fl.r * sd);
              g.add(post);
            }
          }
          g.position.set(fl.x, 0.05, fl.z);
        }
        this.scene.add(g);
        this.shapeFields.set(fl, g);
      }
      const left = fl.until - b.t;
      for (const c of g.children) {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (m.blending === THREE.AdditiveBlending) m.opacity = (0.45 + Math.sin(performance.now() / 45) * 0.2) * Math.min(1, left / 0.4);
      }
      // 電気の線: ところどころ 稲妻がはしる
      if (dt > 0 && fl.shape === 'line' && fl.x2 !== undefined && fl.z2 !== undefined && Math.random() < dt * 16) {
        const k = Math.random();
        const x = fl.x + (fl.x2 - fl.x) * k;
        const z = fl.z + (fl.z2 - fl.z) * k;
        this.bolt(x, 0.05, z, x + (Math.random() - 0.5) * 0.8, 0.5, z + (Math.random() - 0.5) * 0.8, 0.5, 0.12);
      }
    }
    for (const [k, g] of this.shapeFields)
      if (!alive.has(k)) {
        this.scene.remove(g);
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry && m.geometry !== this.boltGeo) m.geometry.dispose();
          (m.material as THREE.Material | undefined)?.dispose?.();
        });
        this.shapeFields.delete(k);
      }
  }

  /** 雷の命中: 短い放電(ぎざぎざの線) */
  zap(x: number, y: number, z: number): void {
    for (let k = 0; k < 5; k++) {
      const pts: THREE.Vector3[] = [];
      let px = x;
      let py = y;
      let pz = z;
      const a = Math.random() * Math.PI * 2;
      const up = (Math.random() - 0.3) * 1.2;
      for (let s = 0; s < 5; s++) {
        pts.push(new THREE.Vector3(px, py, pz));
        px += Math.cos(a) * 0.35 + (Math.random() - 0.5) * 0.3;
        pz += Math.sin(a) * 0.35 + (Math.random() - 0.5) * 0.3;
        py += up * 0.3 + (Math.random() - 0.5) * 0.3;
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: k % 2 ? 0xffffff : 0xfff060, transparent: true, depthWrite: false }));
      this.add(line, 0.16, 0, 1);
    }
  }

  /** ドームに当たった所が光る(六角形の光) */
  domeHit(x: number, y: number, z: number): void {
    const s = this.sprite(0x9ae0ff, true, this.hexTex);
    s.position.set(x, y, z);
    this.add(s, 0.3, 1.2, 1.2);
    const c = this.sprite(0xffffff);
    c.position.set(x, y, z);
    this.add(c, 0.2, 1, 0.8);
  }

  flash(side: number): void {
    this.rigs[side].flash = 0.12;
  }

  shake(n: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, n);
  }

  /** 足もとの まるい影(空中にいる時 どこに 落ちるか 分かるように。2026-11-05 企画者「着地してるか分かりにくい」) */
  private blobs: THREE.Object3D[] = [];

  render(b: AnimeBattle, dt: number): void {
    b.f.forEach((f, i) => {
      const rig = this.rigs[i];
      if (!this.blobs[i]) {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.9, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
        disc.rotation.x = ring.rotation.x = -Math.PI / 2;
        g.add(disc, ring);
        this.scene.add(g);
        this.blobs[i] = g;
      }
      {
        const g = this.blobs[i];
        const air = f.y > 0.15 && f.act.k !== 'ko';
        g.visible = air;
        if (air) {
          g.position.set(f.x, 0.03, f.z);
          // 高いほど 少し小さく(近づくと 大きく)
          g.scale.setScalar(Math.max(0.55, 1 - f.y * 0.12));
        }
      }
      rig.safe = f.act.k !== 'ko' && f.act.k !== 'victory' && isInvincible(b, f);
      rig.armored = b.t < (f.armorUntil ?? 0);
      rig.update(f, dt);
      // 技のため: 口に光が集まる
      const ch = this.charge[i];
      const a = f.act;
      // 新しい5体の技(1歩ずつの動き)は 光の玉・力の光・スピードラインを 出さない(みんな 同じに 見えるので。2026-11-05)
      const own = a.k === 'tech' && !!BEAST[a.id];
      if (a.k === 'tech' && !a.fired && !own) {
        const tech = getTech(a.id);
        const k = Math.min(1, a.t / a.windup);
        // 撃つ技は口に光が集まる。体で行く技は、体に力の光をまとう
        const mouth = tech.kind === 'shot' || tech.kind === 'barrage' || tech.kind === 'beam' || tech.kind === 'debuff';
        // 2026-11-03 企画者の演出指示: 撃つ技はグローブから(片手の弱い弾は右のグローブ、ほかは両手のあいだ)。ほえる技は口
        const fromGlove = tech.kind !== 'debuff' && mouth && (tech.kind === 'shot' && tech.strength === '弱' ? rig.glove(ch.position) : rig.gloves(ch.position));
        if (mouth && !fromGlove) rig.mouth.getWorldPosition(ch.position);
        else if (!mouth) ch.position.set(f.x, f.y + 0.8, f.z);
        ch.visible = true;
        const chCol = tech.kind === 'debuff' ? 0xb060ff : tech.strength === '大技' && tech.element === '無' ? 0xa040ff : auraColor(tech.element);
        ch.material.color.setHex(chCol);
        ch.scale.setScalar((tech.kind === 'beam' ? (tech.strength === '強' ? 2.4 : 1.6) : mouth ? 0.9 : 2.4) * k * (tech.strength === '大技' ? 1.6 : 1) * (1 + Math.sin(performance.now() / 30) * 0.12));
        // まわりから光の粒が集まる(ビームは多く・遠くから)
        if (Math.random() < dt * (tech.kind === 'beam' ? 70 : 30)) {
          const p = this.sprite(chCol);
          const ang = Math.random() * Math.PI * 2;
          const r = tech.kind === 'beam' ? 2.2 : 1.2;
          p.position.set(ch.position.x + Math.cos(ang) * r, ch.position.y + (Math.random() - 0.5) * r, ch.position.z + Math.sin(ang) * r);
          this.add(p, 0.25, -0.9, 0.25, { vx: -Math.cos(ang) * r * 4, vz: -Math.sin(ang) * r * 4, vy: 0 });
        }
      } else ch.visible = false;
      this.styleFx(b, f, i, dt);
      // ZIPP(2026-11-03 企画者「電撃のエフェクトで前に…貯めることができて」):
      // 電撃ダッシュを ためている間: 体が光って 火花が散り、地面に どこまで走るかの線が のびる
      if (f.species === 'zipp') {
        const dashing = a.k === 'tech' && a.id === 'punch' && !!f.jab?.dash;
        const charging = dashing && !a.fired && a.t >= a.windup;
        let guide = this.dashGuide[i];
        if (!guide) {
          guide = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
          guide.rotation.x = -Math.PI / 2;
          this.scene.add(guide);
          this.dashGuide[i] = guide;
        }
        guide.visible = charging;
        if (charging && a.k === 'tech') {
          const Z = ANIME.zdash;
          const P = Z.byForm[(f.jab.dash ?? 1) - 1];
          const c = (a.charge ?? 0) / Z.charge;
          const len = P.min + (P.max - P.min) * c;
          const d = f.pad && Math.hypot(f.pad.x, f.pad.z) > 0.3 ? Math.atan2(f.pad.z, f.pad.x) : f.face;
          guide.position.set(f.x + Math.cos(d) * len * 0.5, 0.04, f.z + Math.sin(d) * len * 0.5);
          guide.rotation.set(-Math.PI / 2, 0, -d);
          guide.scale.set(len, 0.35 + c * 0.35, 1);
          (guide.material as THREE.MeshBasicMaterial).opacity = 0.25 + c * 0.4 + Math.sin(performance.now() / 40) * 0.08;
          ch.visible = true;
          ch.position.set(f.x, f.y + 0.95, f.z);
          ch.material.color.setHex(0xffd23a);
          ch.scale.setScalar((0.9 + c * 1.3) * (1 + Math.sin(performance.now() / 25) * 0.15));
          if (dt > 0 && Math.random() < dt * (8 + c * 30)) {
            const an = Math.random() * Math.PI * 2;
            const r = 0.5 + Math.random() * 0.6;
            this.bolt(f.x + Math.cos(an) * 0.2, f.y + 0.3 + Math.random() * 0.9, f.z + Math.sin(an) * 0.2, f.x + Math.cos(an) * r, f.y + Math.random() * 1.4, f.z + Math.sin(an) * r, 0.5, 0.1);
          }
        }
        // 速く動いた時(ダッシュ・ジグザグ・よける): 通ったあとに稲妻の線と 黄色い残像
        const last = this.zLast[i];
        if (last && dt > 0) {
          const mv = Math.hypot(f.x - last.x, f.z - last.z);
          const fast = mv / dt > 9 && mv < 4 && (a.k === 'tech' || a.k === 'dodge');
          if (fast) {
            this.bolt(last.x, last.y + 0.7, last.z, f.x, f.y + 0.7, f.z, 1, 0.26);
            if (Math.random() < 0.5) {
              const ghost = this.sprite(0xffe060);
              ghost.position.set(last.x, last.y + 0.75, last.z);
              this.add(ghost, 0.2, -0.3, 1.6);
            }
          }
        }
        this.zLast[i] = { x: f.x, y: f.y, z: f.z };
      }
      // パンチ: グローブのあとに光の尾、のばしきりで星の光(2026-11-02 企画者「パンチ出してるの分からない」)
      const pg = rig.punch(this.tmpV);
      if (pg && dt > 0) {
        const tr = this.sprite(0xffe0a0);
        tr.position.copy(this.tmpV);
        this.add(tr, 0.18, -0.5, 0.55);
        // 進化したパンチ: グローブから火の粉(2026-11-02 企画者「パンチから火が少し飛ぶ」)
        const fire = f.jab?.fire ?? 0;
        if (fire > 0 && pg.ext > 0.4 && Math.random() < dt * (fire > 1 ? 90 : 55)) this.flame(this.tmpV.x, this.tmpV.y, this.tmpV.z, fire > 1 ? 0.5 : 0.35, fire > 1 ? 2 : 1);
        if (fire > 0 && pg.ext > 0.9 && this.punchLit[i] < 0.9) this.flameBurst(this.tmpV.x, this.tmpV.y, this.tmpV.z);
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
      const auraOn = !own && !!at && ['rush', 'combo', 'drop', 'quake'].includes(at.kind) && !(a.k === 'tech' && a.hit && at.kind !== 'combo');
      aura.visible = auraOn;
      if (auraOn && at) {
        const pulse = 1 + Math.sin(performance.now() / 45) * 0.08;
        const big = at.strength === '大技' ? 1.5 : at.strength === '強' ? 1.2 : 1;
        aura.position.set(f.x, f.y + 0.85, f.z);
        aura.scale.set(1.1 * pulse * big, 1.25 * pulse * big, 1.1 * pulse * big);
        // 大技(無)は大きな紫の力(天地轟砕。企画者の演出指示)
        (aura.material as THREE.MeshBasicMaterial).color.setHex(f.species === 'mofu' ? 0xfff0fa : at.strength === '大技' && at.element === '無' ? 0xa040ff : auraColor(at.element));
        // 強い突進(剛力クラッシュ): オレンジの光に、紫の粒をまぜる(企画者「紫とオレンジのエネルギー」)
        if ((at.kind === 'rush' && at.strength === '強') || at.strength === '大技') {
          if (dt > 0 && Math.random() < dt * 40) {
            const p = this.sprite(0xa040ff);
            p.position.set(f.x + (Math.random() - 0.5) * 1.4, f.y + 0.2 + Math.random() * 1.4, f.z + (Math.random() - 0.5) * 1.4);
            this.add(p, 0.35, -0.5, 0.45, { vx: 0, vz: 0, vy: 2 });
          }
        }
        (aura.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(performance.now() / 30) * 0.06;
      }
      // 炎の技: ためから技が終わるまで、体から火の粉が のぼる(2026-11-02 企画者「技炎少しほしい」)
      if (a.k === 'tech' && dt > 0 && getTech(a.id).element === '炎' && !(a.fired && a.hit && getTech(a.id).kind !== 'shot')) {
        if (Math.random() < dt * 70) this.flame(f.x, f.y + 0.3, f.z, 1.2, 2);
      }
      // 突進: オレンジのスピードライン(体のうしろへ流れる)。回転: 体のまわりを紫と属性の色の輪が回り、軌跡が残る(2026-11-02 企画者の技演出イメージ)
      const sr = this.spinRings[i];
      sr.visible = false;
      if (a.k === 'tech' && a.fired && !a.hit && dt > 0 && !own) {
        const t2 = getTech(a.id);
        if (t2.kind === 'rush' && f.species === 'mofu') {
          // MOFU の突進(ふわっとダッシュ): うしろに綿毛の帯と花びら
          if (Math.random() < 0.7) this.cotton(f.x - Math.cos(a.dir) * 0.8, f.y + 0.6, f.z - Math.sin(a.dir) * 0.8, 1, 0.8, 0.5);
          if (Math.random() < 0.3) this.petals(f.x, f.y + 0.6, f.z, 1, 1);
        } else if (t2.kind === 'rush') {
          for (let n = 0; n < 2; n++) {
            const m = new THREE.Mesh(this.streakGeo, new THREE.MeshBasicMaterial({ color: n ? 0xffd080 : 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            const side = (Math.random() - 0.5) * 1.3;
            m.position.set(f.x - Math.cos(a.dir) * (0.6 + Math.random()) - Math.sin(a.dir) * side, f.y + 0.3 + Math.random() * 1.1, f.z - Math.sin(a.dir) * (0.6 + Math.random()) + Math.cos(a.dir) * side);
            m.rotation.y = -a.dir;
            this.add(m, 0.16, 0, 1, { shared: true });
            m.scale.set(1.2 + Math.random() * 1.2, 1, 1);
          }
        } else if (t2.kind === 'spin') {
          const col = f.species === 'mofu' ? 0xffb0e0 : t2.element === '無' ? 0xff8a2a : ELEMENT_HEX[t2.element];
          sr.visible = true;
          ((sr.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(f.species === 'mofu' ? 0xffffff : 0xa040ff);
          sr.position.set(f.x, f.y + 0.75, f.z);
          sr.rotation.set(0, -a.dir, 0);
          ((sr.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(col);
          for (const c of sr.children) c.rotation.z -= dt * 22;
          // 回転の軌跡(紫と属性の色を交互に)
          // MOFU の回転(ふわころ)は綿毛が舞う
          if (f.species === 'mofu' && Math.random() < 0.6) this.cotton(f.x, f.y + 0.4, f.z, 1, 0.8, 1.5);
          const tr = this.sprite(Math.random() < 0.5 ? (f.species === 'mofu' ? 0xffffff : 0xa040ff) : col);
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
          if (Math.random() < 0.5) {
            if (f.species === 'mofu') this.cotton(f.x, 0.2, f.z, 1, 0.6, 0.6);
            else this.dust(f.x, f.z, false);
          }
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
        // MOFU の守りは綿雲のドーム(六角形ではなく、ふわふわ)
        const dm = (dome.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const wantMap = f.species === 'mofu' ? this.puffTex : this.hexTex;
        // PUNI は 緑の ぷるぷる膜・ZIPP は 電気の膜(2026-11-03)
        const domeCol = f.species === 'mofu' ? 0xffffff : f.species === 'puni' ? 0x9af07a : f.species === 'zipp' ? 0xfff080 : 0xbfe8ff;
        if (dm.map !== wantMap || dm.color.getHex() !== domeCol) {
          dm.map = wantMap;
          dm.color.setHex(domeCol);
          dm.blending = f.species === 'mofu' ? THREE.NormalBlending : THREE.AdditiveBlending;
          dm.opacity = f.species === 'mofu' ? 0.55 : 0.7;
          dm.needsUpdate = true;
        }
        if (f.species === 'zipp' && dt > 0 && Math.random() < dt * 14) {
          const an = Math.random() * Math.PI * 2;
          const rr = f.barrierR;
          this.bolt(f.x + Math.cos(an) * rr, f.y + 0.3 + Math.random() * rr, f.z + Math.sin(an) * rr, f.x + Math.cos(an + 0.6) * rr, f.y + 0.3 + Math.random() * rr, f.z + Math.sin(an + 0.6) * rr, 0.6, 0.12);
        }
        if (f.species === 'puni') (dome.children[0] as THREE.Mesh).scale.set(1 + Math.sin(performance.now() / 90) * 0.05, 1 - Math.sin(performance.now() / 90) * 0.05, 1 + Math.sin(performance.now() / 90) * 0.05);
        if (f.species === 'mofu' && dt > 0 && Math.random() < dt * 12) this.cotton(f.x + (Math.random() - 0.5) * f.barrierR * 1.6, f.y + 0.3 + Math.random() * f.barrierR, f.z + (Math.random() - 0.5) * f.barrierR * 1.6, 1, 0.3, 0.3);
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
      // 強化中: 体のまわりに色の粒(守り = 緑・攻撃 = オレンジ)
      if (f.act.k !== 'ko' && dt > 0 && (b.t < f.defUpUntil || b.t < f.atkUpUntil) && Math.random() < dt * 12) {
        const p = this.sprite(b.t < f.defUpUntil ? 0x9aff9a : 0xff9a3a);
        const a = Math.random() * Math.PI * 2;
        p.position.set(f.x + Math.cos(a) * 0.8, f.y + 0.2 + Math.random() * 1.2, f.z + Math.sin(a) * 0.8);
        this.add(p, 0.5, -0.3, 0.3, { vx: 0, vz: 0, vy: 1 });
      }
      // やけど(体から火)・どく(紫のあわ)・ねむり(Z が のぼる)
      if (f.act.k !== 'ko' && dt > 0) {
        if (b.t < f.burnUntil && Math.random() < dt * 25) this.flame(f.x, f.y + 0.4, f.z, 1.0, 1);
        if (b.t < f.poisonUntil && Math.random() < dt * 10) {
          const p = this.sprite(Math.random() < 0.5 ? 0xa040ff : 0x60d040);
          p.position.set(f.x + (Math.random() - 0.5) * 1.1, f.y + 0.3 + Math.random() * 0.8, f.z + (Math.random() - 0.5) * 1.1);
          this.add(p, 0.6, 0.6, 0.3, { vx: 0, vz: 0, vy: 1.2 });
        }
        if (b.t < f.sleepUntil && Math.random() < dt * 3) {
          const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zTex, transparent: true, depthWrite: false }));
          z.position.set(f.x + 0.3, f.y + 1.7, f.z);
          this.add(z, 1.2, 0.6, 0.45, { vx: 0.3, vz: 0, vy: 0.6 });
        }
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
    this.drawTraps(b);
    this.drawTethers(b, dt);
    this.drawGuards(b, dt);
    this.lastB = b;
    this.drawBeams(b);
    this.drawQuakes(b);
    this.drawRoarsFields(b, dt);
    this.drawPillars(b, dt);
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
      p.tick?.(k);
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
      if (!p.sharedMat) (m.material as THREE.Material)?.dispose?.();
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
      const fluffy = b.f[s.owner].species === 'mofu' && getTech(s.tech).kind !== 'drain';
      if (!g && fluffy) {
        // MOFU の弾(わたげだま・わたげちらし): ふわふわの綿毛の玉
        g = new THREE.Group();
        const puff = this.sprite(0xffffff, false, this.puffTex);
        puff.scale.setScalar(s.r * 3.6);
        const core = this.sprite(0xfff0fa, true);
        core.scale.setScalar(s.r * 2);
        g.add(puff, core);
        this.scene.add(g);
        this.shotObjs.set(s.id, g);
      }
      if (fluffy && g) {
        // ゆらゆら回りながら飛ぶ・綿毛をこぼす
        g.position.set(s.x, s.y + Math.sin(s.t * 14) * 0.08, s.z);
        (g.children[0] as THREE.Sprite).material.rotation += dt * 4;
        if (Math.random() < 0.5) this.cotton(s.x, s.y, s.z, 1, 0.3, 0.3);
        continue;
      }
      const owner = b.f[s.owner];
      const stl = ANIME.techStyle[s.tech];
      if (!g && (owner.species === 'puni' && getTech(s.tech).kind !== 'drain')) this.gooIds.add(s.id);
      if (!g && s.look !== 'ghost' && (s.stop !== undefined || (s.wait !== undefined && s.t < s.wait) || stl === 'soundRing')) {
        // 時限ボム(黒い玉)・千機包囲網(小さな砲台)・カチンショット(音の輪)
        g = new THREE.Group();
        if (s.stop !== undefined) {
          const ball = new THREE.Mesh(this.blobGeo, new THREE.MeshToonMaterial({ color: 0x2a2a34, gradientMap: this.gradient }));
          ball.scale.setScalar(0.38);
          const lamp = this.sprite(0xff3020);
          lamp.scale.setScalar(0.4);
          lamp.position.y = 0.38;
          g.add(ball, lamp);
          g.userData.kind = 'bomb';
        } else if (s.wait !== undefined) {
          const base = new THREE.Mesh(this.boltGeo, new THREE.MeshToonMaterial({ color: 0x7a8aa0, gradientMap: this.gradient }));
          base.scale.set(0.5, 0.35, 0.5);
          const barrel = new THREE.Mesh(this.boltGeo, new THREE.MeshToonMaterial({ color: 0x3a4250, gradientMap: this.gradient }));
          barrel.scale.set(0.6, 0.14, 0.14);
          barrel.position.set(0.3, 0.12, 0);
          const lamp = this.sprite(0xfff2a0);
          lamp.scale.setScalar(0.5);
          lamp.position.set(0.62, 0.12, 0);
          g.add(base, barrel, lamp);
          g.userData.kind = 'turret';
        } else {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
          const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 6, 16), new THREE.MeshBasicMaterial({ color: 0xa0e8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
          g.add(ring, ring2);
          g.userData.kind = 'ring';
        }
        this.scene.add(g);
        this.shotObjs.set(s.id, g);
      }
      if (g?.userData.kind) {
        const kd = g.userData.kind;
        g.position.set(s.x, kd === 'turret' ? 0.4 : s.y, s.z);
        if (kd === 'bomb') {
          g.children[0].rotation.z -= dt * Math.hypot(s.vx, s.vz) * 2.5;
          g.rotation.y = -Math.atan2(s.vz, s.vx);
          g.children[1].visible = s.fuse === undefined || Math.sin(performance.now() / (s.fuse - b.t < 0.4 ? 30 : 70)) > 0;
        } else if (kd === 'turret') {
          g.rotation.y = -Math.atan2(s.vz, s.vx);
          if (s.wait !== undefined && s.t >= s.wait) {
            // 撃った: 砲台は消えて、光の弾に
            this.scene.remove(g);
            this.shotObjs.delete(s.id);
            this.muzzleAt(s.x, 0.5, s.z);
          }
        } else {
          g.rotation.y = -Math.atan2(s.vz, s.vx) + Math.PI / 2;
          const k = 1 + Math.sin(s.t * 30) * 0.15;
          g.scale.setScalar(k * (1 + s.t * 0.8));
        }
        continue;
      }
      if (s.look === 'ghost') {
        // 迅雷乱舞の残像: 黄色く光る ZIPP の かげ。走ると 稲妻の線を引く
        if (!g) {
          g = new THREE.Group();
          const body = this.sprite(0xffe060);
          body.scale.set(1.3, 1.7, 1);
          const core = this.sprite(0xffffff);
          core.scale.setScalar(0.7);
          g.add(body, core);
          g.userData.px = s.x;
          g.userData.pz = s.z;
          this.scene.add(g);
          this.shotObjs.set(s.id, g);
        }
        g.position.set(s.x, 0.85, s.z);
        const waiting = s.wait !== undefined && s.t < s.wait;
        ((g.children[0] as THREE.Sprite).material as THREE.SpriteMaterial).opacity = waiting ? 0.35 + Math.sin(performance.now() / 40) * 0.2 : 0.9;
        if (!waiting && dt > 0) this.bolt(g.userData.px, 0.8, g.userData.pz, s.x, 0.8, s.z, 0.9, 0.2);
        g.userData.px = s.x;
        g.userData.pz = s.z;
        continue;
      }
      if (s.tech === 'puniWater' || this.gooIds.has(s.id)) {
        // PUNI のぷに玉(2026-11-03): ぷるぷる ゆれる 半透明の緑のかたまり(PUNI は自然。企画者)。しずくをこぼす
        if (!g) {
          g = new THREE.Group();
          const blob = new THREE.Mesh(this.blobGeo, new THREE.MeshBasicMaterial({ color: 0x6ad84a, transparent: true, opacity: 0.75, depthWrite: false }));
          const shine = this.sprite(0xffffff, true);
          shine.scale.setScalar(s.r * 1.1);
          shine.position.set(-s.r * 0.35, s.r * 0.4, 0);
          const glow = this.sprite(0x8ae86a);
          glow.scale.setScalar(s.r * 3);
          g.add(blob, shine, glow);
          this.scene.add(g);
          this.shotObjs.set(s.id, g);
        }
        const w = Math.sin(s.t * 26) * 0.18;
        g.position.set(s.x, s.y + Math.abs(Math.sin(s.t * 9)) * 0.12, s.z);
        g.children[0].scale.set(s.r * (1 + w), s.r * (1 - w), s.r * (1 + w * 0.5));
        g.children[0].rotation.y = -Math.atan2(s.vz, s.vx);
        if (dt > 0 && Math.random() < dt * 25) {
          const d = this.sprite(0xa8f08a);
          d.position.set(s.x + (Math.random() - 0.5) * 0.3, s.y, s.z + (Math.random() - 0.5) * 0.3);
          this.add(d, 0.4, -0.5, 0.22, { vx: 0, vz: 0, vy: -1, fade: true });
        }
        continue;
      }
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
      // 2026-11-05 新しい5体の弾の 形: 大きくなる 電気の輪(雷紋)・ふわふわの 泡・光の 狼(光る 粒を 引く)
      if (s.look === 'ring' || s.look === 'bubble') {
        g.children[0].scale.setScalar(s.r * (s.look === 'ring' ? 3.6 : 2.6) * (1 + Math.sin(s.t * 12) * 0.08));
        g.position.y = s.y + (s.look === 'bubble' ? Math.sin(s.t * 6) * 0.2 : 0);
        if (dt > 0 && s.look === 'ring' && Math.random() < dt * 14) this.bolt(s.x - s.r, s.y, s.z, s.x + s.r, s.y, s.z, 0.6, 0.1);
        continue;
      }
      if (s.look === 'wolf') {
        g.children[0].scale.set(s.r * 4.4, s.r * 2.6, 1);
        if (dt > 0) for (let n = 0; n < 2; n++) {
          const tr = this.sprite(n ? 0xffffff : 0xfff0a0, true, this.star);
          tr.position.set(s.x + (Math.random() - 0.5) * 0.5, s.y + (Math.random() - 0.3) * 0.5, s.z + (Math.random() - 0.5) * 0.5);
          this.add(tr, 0.3, -0.6, 0.3);
        }
        continue;
      }
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
        this.gooIds.delete(id);
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
      // 両手のグローブのあいだから(企画者の演出指示)。骨がなければ口から
      if (!owner.gloves(start)) owner.mouth.getWorldPosition(start);
      // 柱で止まった所まで(2026-11-03 ロストテンプル)
      const len = beam.len ?? tech.range;
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
    // 光線のまわりを光の粒が流れる
    for (const beam of b.beams) {
      if (Math.random() < 0.6) {
        const tech = getTech(beam.tech);
        const d = Math.random() * tech.range;
        const p = this.sprite(Math.random() < 0.5 ? 0xffffff : ELEMENT_HEX[tech.element]);
        const o = this.rigs[beam.owner].root.position;
        p.position.set(o.x + Math.cos(beam.dir) * d + (Math.random() - 0.5) * tech.size * 2, 0.9 + (Math.random() - 0.5) * tech.size * 2, o.z + Math.sin(beam.dir) * d + (Math.random() - 0.5) * tech.size * 2);
        this.add(p, 0.25, -0.6, 0.4, { vx: Math.cos(beam.dir) * 12, vz: Math.sin(beam.dir) * 12, vy: 0 });
      }
    }
    if (b.beams.length) this.shake(0.08);
  }

  private roarObjs: THREE.Group[] = [];
  private fieldObjs: THREE.Group[] = [];
  /**
   * ほえる声の輪(威圧ロア)と、重力の場(重力プレス)。2026-11-03 企画者の演出指示:
   * 威圧ロア「口元から円形の音波・紫色の空気の揺らぎ」→ 紫の輪が3重に広がり、前に立った音の輪、紫のゆらぎの粒
   * 重力プレス「紫と黒の重力フィールド・円形の魔法陣」→ 回る魔法陣・逆に回る輪・上から押しつける紫の粒
   */
  private drawRoarsFields(b: AnimeBattle, dt: number): void {
    while (this.roarObjs.length < b.roars.length) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) g.add(new THREE.Mesh(new THREE.TorusGeometry(1, k === 0 ? 0.08 : 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: k === 1 ? 0xffffff : 0xc070ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      // 前に立った音の輪(口から出る)
      for (let k = 0; k < 3; k++) g.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40, Math.PI * 1.2), new THREE.MeshBasicMaterial({ color: 0xd890ff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
      this.scene.add(g);
      this.roarObjs.push(g);
    }
    this.roarObjs.forEach((g, i) => {
      const q = b.roars[i];
      g.visible = !!q;
      if (!q) return;
      const range = getTech(q.tech).range;
      const fade = Math.max(0, 1 - q.r / range);
      const owner = b.f[q.owner];
      const dir = owner.face;
      const mofuRoar = owner.species === 'mofu';
      g.position.set(q.x, 0, q.z);
      g.children.forEach((m, k) => {
        const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (k < 3) {
          // 地面と平行に広がる輪(少しずつ遅れて3重)
          const r = Math.max(0.1, q.r - k * 0.9);
          m.position.set(0, 0.9 - k * 0.25, 0);
          m.rotation.set(Math.PI / 2, 0, 0);
          m.scale.setScalar(r);
          mat.opacity = (k === 1 ? 0.6 : 0.9) * fade * (q.r - k * 0.9 > 0 ? 1 : 0);
        } else {
          // 口の前に立つ音の輪(前へ進みながら大きくなる)
          const j = k - 3;
          const d = ((q.r * 0.8 + j * 1.2) % (range * 0.9)) + 0.6;
          m.position.set(Math.cos(dir) * d, 1.0, Math.sin(dir) * d);
          m.rotation.set(0, -dir + Math.PI / 2, Math.PI * 0.4);
          m.scale.setScalar(0.4 + d * 0.28);
          mat.opacity = 0.75 * fade * (1 - d / range);
        }
      });
      // MOFU(花嵐のゆりかご): 輪はピンク、花びらがうずをまいて広がる
      g.children.forEach((m) => ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(mofuRoar ? 0xffa0d8 : 0xc070ff));
      if (mofuRoar) {
        if (dt > 0 && Math.random() < dt * 90 * fade) {
          const a = Math.random() * Math.PI * 2;
          this.petals(q.x + Math.cos(a) * q.r, 0.4 + Math.random() * 1.2, q.z + Math.sin(a) * q.r, 3, 1.5);
        }
        return;
      }
      // 紫の空気のゆらぎ
      if (dt > 0 && Math.random() < dt * 60 * fade) {
        const a = Math.random() * Math.PI * 2;
        const p = this.sprite(Math.random() < 0.3 ? 0xffffff : 0xb060ff);
        p.position.set(q.x + Math.cos(a) * q.r, 0.4 + Math.random() * 1.2, q.z + Math.sin(a) * q.r);
        this.add(p, 0.35, 0.8, 0.5, { vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 0.5 });
      }
    });
    while (this.fieldObjs.length < b.fields.length) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.circleTex, transparent: true, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 6), new THREE.MeshBasicMaterial({ color: 0xe0a0ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      // 円のふちから立ちのぼる、うすい紫の壁
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x6a20b0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      wall.position.y = 0.6;
      g.add(disc, ring, wall);
      this.scene.add(g);
      this.fieldObjs.push(g);
    }
    this.drawShapeFields(b, dt);
    this.fieldObjs.forEach((g, i) => {
      const fl = b.fields[i];
      g.visible = !!fl && !fl.shape;
      if (!fl || fl.shape) return;
      const [disc, ring, wall] = g.children as THREE.Mesh[];
      const sp = b.f[fl.owner].species;
      // 自分の場(千花天幕)は花の輪・相手の場は重力の魔法陣
      const dm = disc.material as THREE.MeshBasicMaterial;
      // MOFU の場(ねむりの綿雨)は、綿雲のじゅうたん
      const cloud = !fl.self && b.f[fl.owner].species === 'mofu';
      // ZIPP・PUNI・KLAK の場は 魔法陣の絵ではなく、種族の色の まるい光(2026-11-04)
      // 新しい5体(2026-11-05)も 技の 属性の色の まるい光(炎・水・闇の毒・雷・土)
      const neo = sp === 'riot' || sp === 'snek' || sp === 'grit' || sp === 'vybe' || sp === 'shellz';
      const plain = !fl.self && !cloud && (sp === 'zipp' || sp === 'puni' || sp === 'klak' || neo);
      const want = fl.self ? this.flowerTex : cloud ? this.puffTex : plain ? this.glow : this.circleTex;
      if (dm.map !== want) {
        dm.map = want;
        dm.opacity = cloud ? 0.75 : plain ? 0.55 : 1;
        dm.needsUpdate = true;
      }
      // 種族の色(2026-11-03): ZIPP は電気の黄・PUNI は ぷにぷにの緑・KLAK は 機械の水色
      const fel = getTech(fl.tech).element;
      const neoCol = fel === '炎' ? [0xff7a2a, 0xc03a00, 0xffc080] : fel === '水' ? [0x5ac8ff, 0x1a60c0, 0xc0f0ff] : fel === '闇' ? [0xb070ff, 0x4a1a8a, 0xe0c0ff] : fel === '雷' ? [0xfff060, 0xc0a000, 0xfff0a0] : [0xd8b070, 0x7a5a30, 0xf0e0c0];
      const fc = fl.self ? [0xfff0a0, 0x80e080, 0xffffff] : cloud ? [0xd0e8ff, 0xb0d0ff, 0xffffff] : neo ? neoCol : sp === 'zipp' ? [0xfff060, 0xc0a000, 0xfff0a0] : sp === 'puni' ? [0x8af06a, 0x3a9a30, 0x9af080] : sp === 'klak' ? [0x80e8ff, 0x2080b0, 0xa0e8ff] : [0xe0a0ff, 0x6a20b0, 0xffffff];
      (ring.material as THREE.MeshBasicMaterial).color.setHex(fc[0]);
      (wall.material as THREE.MeshBasicMaterial).color.setHex(fc[1]);
      dm.color.setHex(plain ? fc[0] : fc[2]);
      const left = fl.until - b.t;
      // 出てすぐは広がり、消える前はしぼむ
      const age = getTechAge(fl, b.t);
      const open = Math.min(1, age / 0.25) * (left < 0.3 ? Math.max(0, left / 0.3) : 1);
      g.position.set(fl.x, 0.04, fl.z);
      g.scale.setScalar(fl.r * open * (1 + Math.sin(performance.now() / 200) * 0.02));
      disc.rotation.z += dt * 0.6;
      ring.rotation.z -= dt * 1.4;
      (wall.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(performance.now() / 150) * 0.03;
      // 新しい5体の場: 炎は 火の粉・水は しぶき・闇は 毒の あわ・雷は 火花
      if (neo && !fl.self && dt > 0 && Math.random() < dt * (fl.mine ? 6 : 18)) {
        const a2 = Math.random() * Math.PI * 2;
        const r2 = Math.random() * fl.r;
        const px = fl.x + Math.cos(a2) * r2;
        const pz = fl.z + Math.sin(a2) * r2;
        if (fel === '炎') this.flame(px, 0.15, pz, 0.3, 1);
        else if (fel === '雷') this.bolt(px, 0.05, pz, px + (Math.random() - 0.5) * 0.6, 0.4, pz + (Math.random() - 0.5) * 0.6, 0.4, 0.1);
        else {
          const pp = this.sprite(fel === '水' ? 0xa8e8ff : fel === '闇' ? 0xc080ff : 0xe0c090);
          pp.position.set(px, 0.15, pz);
          this.add(pp, 0.6, -0.3, 0.3, { vx: 0, vz: 0, vy: fl.pull ? 0.4 : 1.2 });
        }
      }
      if (fl.pull) disc.rotation.z += dt * 4;
      // 自分の場: 花びらと光の粒が ふわふわ のぼる
      if (fl.self) {
        if (dt > 0 && Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * fl.r;
          const p = this.sprite(Math.random() < 0.5 ? 0xff9ad0 : 0xfff6c0);
          p.position.set(fl.x + Math.cos(a) * r, 0.2, fl.z + Math.sin(a) * r);
          this.add(p, 1.0, -0.3, 0.35, { vx: 0, vz: 0, vy: 1.5 });
        }
        return;
      }
      // MOFU の綿雲: 上に雲・綿毛の雨が ふわふわ降る
      if (cloud) {
        if (dt > 0 && Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.random() * fl.r;
          const p = this.sprite(0xffffff, false, this.puffTex);
          p.position.set(fl.x + Math.cos(a) * rr, 2.6, fl.z + Math.sin(a) * rr);
          this.add(p, 1.2, -0.3, 0.3, { vx: 0, vz: 0, vy: -1.8 });
        }
        if (dt > 0 && Math.random() < dt * 6) {
          const c = this.sprite(0xf4f0ff, false, this.puffTex);
          c.position.set(fl.x + (Math.random() - 0.5) * fl.r, 2.9, fl.z + (Math.random() - 0.5) * fl.r);
          this.add(c, 1.0, 0.3, 1.4);
        }
        return;
      }
      // ZIPP の場: 中で 小さな稲妻が はしる。PUNI: 緑の あわが ぷくぷく。KLAK: 水色の光の粒が のぼる
      if (sp === 'zipp' || sp === 'puni' || sp === 'klak') {
        if (dt > 0 && Math.random() < dt * (sp === 'zipp' ? 14 : 30)) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * fl.r;
          const x = fl.x + Math.cos(a) * r;
          const z = fl.z + Math.sin(a) * r;
          if (sp === 'zipp') this.bolt(x, 0.1, z, x + (Math.random() - 0.5) * 1.6, 0.1 + Math.random() * 0.4, z + (Math.random() - 0.5) * 1.6, 0.6, 0.14);
          else {
            const p = this.sprite(sp === 'puni' ? 0xa8f08a : 0x9ae8ff);
            p.position.set(x, 0.1, z);
            this.add(p, 0.8, sp === 'puni' ? 0.6 : -0.3, sp === 'puni' ? 0.35 : 0.25, { vx: 0, vz: 0, vy: sp === 'puni' ? 0.8 : 1.6 });
          }
        }
        return;
      }
      // 上から押しつける紫と黒の粒
      if (dt > 0 && Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * fl.r;
        const p = this.sprite(Math.random() < 0.35 ? 0x200030 : 0xb060ff, Math.random() >= 0.35);
        p.position.set(fl.x + Math.cos(a) * r, 2.6, fl.z + Math.sin(a) * r);
        this.add(p, 0.5, -0.4, 0.4, { vx: 0, vz: 0, vy: -5 });
      }
    });
  }

  private pillarObjs: THREE.Group[] = [];
  /** 火柱(2026-11-02 企画者「相手の真下とその周り3箇所ぐらい下から炎の柱」): 地面が赤く光る → 下から炎の柱が噴き出す */
  private drawPillars(b: AnimeBattle, dt: number): void {
    while (this.pillarObjs.length < b.pillars.length) {
      const g = new THREE.Group();
      const warn = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xff3a00, transparent: true, opacity: 0.5, depthWrite: false }));
      warn.rotation.x = -Math.PI / 2;
      warn.position.y = 0.05;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.06;
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4a0a, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      g.add(warn, rim, outer, inner);
      this.scene.add(g);
      this.pillarObjs.push(g);
    }
    const P = ANIME.pillar;
    this.pillarObjs.forEach((g, i) => {
      const p = b.pillars[i];
      g.visible = !!p;
      if (!p) return;
      g.position.set(p.x, 0, p.z);
      const [warn, rim, outer, inner] = g.children as THREE.Mesh[];
      const k = b.t - p.at;
      const mat = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial;
      // 見た目(2026-11-03): 火柱(赤・橙)・落雷(黄・白)・光の杭(水色・白・細い)・光の砲撃(赤い照準 → 白い光)
      const lk = p.look ?? 'fire';
      const cols = lk === 'water' ? [0x2a8aff, 0x8ad8ff, 0x5ab8ff, 0xe8f8ff] : lk === 'rock' ? [0x8a6a40, 0xc0a070, 0x9a7a50, 0xd8c098] : lk === 'bolt' ? [0xffd23a, 0xfff6a0, 0xffe040, 0xffffff] : lk === 'stake' ? [0x40c0ff, 0xc0f0ff, 0x80e0ff, 0xffffff] : lk === 'beam' ? [0xff2a2a, 0xff8080, 0xfff0a0, 0xffffff] : [0xff3a00, 0xffc040, 0xff4a0a, 0xffd040];
      mat(warn).color.setHex(cols[0]);
      mat(rim).color.setHex(cols[1]);
      mat(outer).color.setHex(cols[2]);
      mat(inner).color.setHex(cols[3]);
      if (lk === 'beam' && k < 0) rim.rotation.z += dt * 6;
      if (k < 0) {
        // 出る前: 地面が赤く光って ふるえる(ここから出ると分かる)
        const w = 1 - Math.min(1, -k / P.warn);
        warn.visible = rim.visible = true;
        outer.visible = inner.visible = false;
        warn.scale.setScalar(p.r * (0.4 + 0.6 * w));
        rim.scale.setScalar(p.r);
        mat(warn).opacity = 0.25 + 0.4 * w + Math.sin(performance.now() / 40) * 0.1;
        mat(rim).opacity = 0.5 + 0.5 * w;
        if (dt > 0 && lk === 'fire' && Math.random() < dt * 25) this.flame(p.x, 0.1, p.z, p.r * 1.4, 1);
        if (dt > 0 && lk === 'bolt' && Math.random() < dt * 10) this.bolt(p.x + (Math.random() - 0.5) * p.r, 0.05, p.z + (Math.random() - 0.5) * p.r, p.x + (Math.random() - 0.5) * p.r, 0.3, p.z + (Math.random() - 0.5) * p.r, 0.5, 0.1);
        return;
      }
      // 柱: 一気にのびて、太くなり、消えていく
      const life = P.life;
      const grow = Math.min(1, k / 0.1);
      const fade = Math.max(0, 1 - Math.max(0, k - P.burst) / (life - P.burst));
      const h = 5 * grow;
      warn.visible = true;
      rim.visible = false;
      mat(warn).opacity = 0.7 * fade;
      warn.scale.setScalar(p.r * 1.2);
      outer.visible = inner.visible = true;
      const wob = (1 + Math.sin(performance.now() / 25 + i) * 0.08) * (lk === 'stake' ? 0.45 : lk === 'bolt' ? 0.6 : lk === 'rock' ? 0.8 : 1);
      outer.scale.set(p.r * wob * (0.8 + 0.3 * grow), h, p.r * wob * (0.8 + 0.3 * grow));
      outer.position.y = h / 2;
      inner.scale.set(p.r, h * 1.05, p.r);
      inner.position.y = (h * 1.05) / 2;
      mat(outer).opacity = 0.8 * fade;
      mat(inner).opacity = 0.95 * fade;
      inner.renderOrder = 2;
      outer.rotation.y += dt * 8;
      if (dt > 0 && fade > 0.2) {
        if (Math.random() < dt * 60) this.flame(p.x, Math.random() * h, p.z, p.r * 1.2, 2);
      }
    });
  }

  private drawQuakes(b: AnimeBattle): void {
    while (this.quakeObjs.length < b.quakes.length) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      // 外側に土の壁(波が地面をもり上げて進む)
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xd8c8a8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      wall.rotation.x = Math.PI / 2;
      wall.position.z = -0.25;
      m.add(wall);
      this.scene.add(m);
      this.quakeObjs.push(m);
    }
    this.quakeObjs.forEach((m, i) => {
      const q = b.quakes[i];
      m.visible = !!q;
      if (!q) return;
      const tech = getTech(q.tech);
      const fade = Math.max(0, 1 - q.r / tech.range);
      m.position.set(q.x, 0.08, q.z);
      m.scale.setScalar(Math.max(0.1, q.r));
      const big = tech.strength === '大技';
      const mofuQ = b.f[q.owner]?.species === 'mofu';
      (m.material as THREE.MeshBasicMaterial).color.setHex(mofuQ ? 0xd8ffd0 : big && tech.element === '無' ? 0xc080ff : 0xffe8a0);
      ((m.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(mofuQ ? 0xffffff : 0xd8c8a8);
      // MOFU(ふわりの風・超膨張): 綿毛と花びらの風(石は飛ばない)
      if (mofuQ) {
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
        if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          if (Math.random() < 0.5) this.cotton(q.x + Math.cos(a) * q.r, 0.4, q.z + Math.sin(a) * q.r, 1, 0.3, 1);
          else this.petals(q.x + Math.cos(a) * q.r, 0.5, q.z + Math.sin(a) * q.r, 1, 1.5);
        }
        return;
      }
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      const wall = m.children[0] as THREE.Mesh;
      wall.scale.set(1, 1, big ? 2.4 : 1.4);
      (wall.material as THREE.MeshBasicMaterial).opacity = 0.45 * fade;
      // 波のふちで 小石と砂けむりが はね上がる(企画者の演出指示「小石と砂煙が跳ね上がる」)
      if (Math.random() < 0.6) this.dust(q.x + Math.cos(Math.random() * 7) * q.r, q.z + Math.sin(Math.random() * 7) * q.r, false);
      if (Math.random() < (big ? 0.9 : 0.5)) {
        const a = Math.random() * Math.PI * 2;
        const r = new THREE.Mesh(this.pebbleGeo, this.pebbleMat);
        r.position.set(q.x + Math.cos(a) * q.r, 0.15, q.z + Math.sin(a) * q.r);
        this.add(r, 0.6, 0, 0.6 + Math.random() * 0.8, { vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5, vy: 3 + Math.random() * 3, fade: false, shared: true, sharedMat: true });
      }
    });
  }
  private pebbleGeo = new THREE.DodecahedronGeometry(0.15, 0);
  private pebbleMat = new THREE.MeshToonMaterial({ color: 0x8a6a4a });

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
    // 2体が はなれている時は、自分の MONZ が 画面から出ないように、自分のほうを 中心に(2026-11-04)
    const frac = sep > 12 ? Math.max(0.2, 0.45 - (sep - 12) * 0.016) : 0.45;
    const mid = new THREE.Vector3(p.x + (q.x - p.x) * frac, 0, p.z + (q.z - p.z) * frac);
    const dist = 7.5 + Math.min(sep, 16) * 0.45;
    const camH = 3.6 + Math.min(sep, 16) * 0.18;
    const want = new THREE.Vector3(mid.x + Math.cos(this.camYaw) * dist, camH, mid.z + Math.sin(this.camYaw) * dist);
    // 高く ふっとんだ時は カメラも 上を 見る(画面の上から 出ないように 2026-11-05)
    const look = new THREE.Vector3(mid.x, 0.9 + Math.max(p.y, q.y) * 0.5, mid.z);
    // マップ: 柱・壁で 自分の MONZ が かくれる時は、カメラを 見える向きへ回す。だめなら前へ・上へ。
    // 壁や柱の中・外の壁の外へも出ない(2026-11-03 ロストテンプル)
    if (this.arena) {
      const A = this.arena;
      // 体の下のほう(0.6)まで見えるか で調べる(低い柱で体が半分かくれるのも さける)
      const me = new THREE.Vector3(p.x, 0.6, p.z);
      const blockFrom = (m: { x: number; y: number; z: number }, x: number, y: number, z: number) => {
        const h = rayHit(A, m.x, m.z, x, z, 0, 0.45);
        if (!h) return null;
        return h.o.h + 0.3 > m.y + (y - m.y) * h.t ? { t: h.t, h: h.o.h } : null;
      };
      const blockAt = (x: number, y: number, z: number) => blockFrom(me, x, y, z);
      // 2026-11-03 相手も かくれないように(まずは2体とも見える向き → だめなら自分だけ見える向き)
      const foe = { x: q.x, y: 0.6, z: q.z };
      const blockBoth = (x: number, y: number, z: number) => blockAt(x, y, z) ?? blockFrom(foe, x, y, z);
      // 2026-11-04 企画者「マップの左の端の方行くとモンズが見えなくなる」: はしでは「うしろ」が マップの外になり、
      // カメラが MONZ の真上に おしこまれていた → マップの中に置ける向きへ 回す
      const Rin = A.radius - 0.6;
      const out = (x: number, z: number) => Math.hypot(x, z) > Rin;
      const wall = { t: 0, h: 99 };
      const inBoth = (x: number, y: number, z: number) => (out(x, z) ? wall : blockBoth(x, y, z));
      const inMe = (x: number, y: number, z: number) => (out(x, z) ? wall : blockAt(x, y, z));
      let hit = blockAt(want.x, want.y, want.z) ?? (out(want.x, want.z) ? wall : null);
      if (hit || blockBoth(want.x, want.y, want.z)) {
        // 少しずつ横へ回して、さえぎられない・マップの中の向きをさがす(近い向きから)
        search: for (const test of [inBoth, inMe]) {
          for (const off of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.2, -2.2, 2.7, -2.7]) {
            const yaw = this.camYaw + off;
            const x = mid.x + Math.cos(yaw) * dist;
            const z = mid.z + Math.sin(yaw) * dist;
            if (!test(x, camH, z)) {
              want.set(x, camH, z);
              this.camYaw += off * (1 - Math.exp(-dt * (hit === wall ? 5 : 3)));
              hit = null;
              break search;
            }
          }
          if (!hit) break;
        }
      }
      if (hit === wall) hit = null;
      if (hit) {
        // どこからも見えない時: さえぎる物より 手前(自分の MONZ 側)へ寄せて、上から見る
        const len = Math.hypot(want.x - me.x, want.z - me.z) || 1;
        const k = Math.max(0.12, Math.min(hit.t - 0.9 / len, 1));
        want.set(me.x + (want.x - me.x) * k, Math.max(camH, 4.5, Math.min(hit.h, 6) + 1.2), me.z + (want.z - me.z) * k);
      }
      // 外の壁より内側に置く(壁の外へ出ると 壁が画面をふさぐ)。はしに近いほど 上から見る
      const R = A.radius - 0.6;
      const dd = Math.hypot(want.x, want.z);
      if (dd > R) {
        want.x *= R / dd;
        want.z *= R / dd;
        want.y = Math.max(want.y, 4.2 + (dd - R) * 0.35);
      }
      want.y = Math.max(want.y, obstacleTop(A, want.x, want.z, 0.6) + 1.2, 1.2);
    }
    want.y += Math.max(0, Math.max(p.y, q.y) - 1) * 0.35;
    this.camPos.lerp(want, 1 - Math.exp(-dt * 2));
    this.camLook.lerp(look, 1 - Math.exp(-dt * 2.5));
    if (this.arena) {
      // なめらかに動く とちゅうでも、柱・壁の中や 外の壁の外には入らない
      const R = this.arena.radius - 0.4;
      const dd = Math.hypot(this.camPos.x, this.camPos.z);
      if (dd > R) {
        this.camPos.x *= R / dd;
        this.camPos.z *= R / dd;
      }
      this.camPos.y = Math.max(this.camPos.y, obstacleTop(this.arena, this.camPos.x, this.camPos.z, 0.5) + 0.8);
    }
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
