/**
 * 冒険の 3D 画面(2026-11-07 企画者「3D を ななめ上から」)。ダンジョン・自分の MONZ・モブ を 描く。
 * 自分の MONZ は MONZ RUMBLE の モデルと 動き(MonsterRig)を そのまま 使う。モブは【仮】の 形(企画者が 新しく 作る)。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../assetUrl';
import { newAnimeBattle, type AnimeEntrant, type AnimeMon } from '../core/battle3d/anime';
import { CELL, FLOOR } from '../core/adventure/dungeon';
import { ADV, RANKS, type Actor, type AdvEvent, type AdvItem, type AdvState, type Rank } from '../core/adventure/sim';
import type { modelFor } from '../core/roster';
import { MonsterRig } from './monsterRig';

type ModelPick = ReturnType<typeof modelFor>;

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 数字の 絵(ダメージ) */
function numberTexture(s: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '900 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#16101c';
  g.strokeText(s, 64, 34);
  g.fillStyle = color;
  g.fillText(s, 64, 34);
  return new THREE.CanvasTexture(c);
}

/** ランクの 色(D 灰・C 緑・B 青・A 紫・S 金) */
export const RANK_HEX: Record<Rank, number> = { D: 0x9a9aa8, C: 0x4ad06a, B: 0x3a9aff, A: 0xb04aff, S: 0xffc830 };

interface Pop {
  obj: THREE.Sprite;
  t: number;
  life: number;
  vy: number;
  grow: number;
}

/** 【仮】モブ: まるい 体に 角と 目(企画者の モブが できたら 入れかえ) */
class MobView {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private mat: THREE.MeshToonMaterial;
  private bar: THREE.Mesh;
  private barBg: THREE.Mesh;
  private deadT = 0;
  constructor(grad: THREE.Texture) {
    this.mat = new THREE.MeshToonMaterial({ color: 0x8a3ac8, gradientMap: grad });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), this.mat);
    this.body.position.y = 0.5;
    this.body.scale.y = 0.85;
    this.body.castShadow = true;
    this.root.add(this.body);
    const outline = new THREE.Mesh(this.body.geometry, new THREE.MeshBasicMaterial({ color: 0x16101c, side: THREE.BackSide }));
    outline.scale.setScalar(1.08);
    this.body.add(outline);
    const horn = new THREE.MeshToonMaterial({ color: 0xffb03a, gradientMap: grad });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), horn);
      h.position.set(0.1, 0.55, s * 0.28);
      h.rotation.x = s * 0.5;
      this.body.add(h);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
      eye.position.set(0.52, 0.12, s * 0.2);
      this.body.add(eye);
    }
    this.barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshBasicMaterial({ color: 0x16101c, depthTest: false }));
    this.bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.08), new THREE.MeshBasicMaterial({ color: 0xff4a6a, depthTest: false }));
    this.barBg.renderOrder = 10;
    this.bar.renderOrder = 11;
    this.barBg.position.y = 1.75;
    this.bar.position.y = 1.75;
    this.root.add(this.barBg, this.bar);
  }
  update(m: Actor, dt: number, cam: THREE.Camera, now: number): void {
    this.root.position.set(m.x, 0, m.z);
    this.body.rotation.y = -m.face;
    const M = ADV.mob;
    let sy = 0.85 + Math.sin(now * 6 + m.id) * 0.04;
    let sx = 1;
    this.mat.color.setHex(0x8a3ac8);
    if (m.act === 'attack') {
      const w = Math.min(1, m.actT / M.windup);
      if (!m.struck) {
        // ため: ちぢんで 赤く 光る(よける 合図)
        sy = 0.85 - w * 0.25;
        sx = 1 + w * 0.2;
        this.mat.color.setHex(w > 0.5 ? 0xff4a6a : 0xb04ab8);
      } else {
        sx = 1.25;
        sy = 0.7;
      }
    }
    if (m.act === 'hurt') this.mat.color.setHex(0xffffff);
    if (m.act === 'dead') {
      this.deadT += dt;
      const k = Math.max(0, 1 - this.deadT / 0.35);
      this.root.scale.setScalar(k);
      this.root.visible = k > 0;
    }
    this.body.scale.set(sx, sy, sx);
    const r = Math.max(0, m.hp / m.maxHp);
    this.bar.scale.x = r;
    this.bar.position.x = 0;
    this.barBg.quaternion.copy(cam.quaternion);
    this.bar.quaternion.copy(cam.quaternion);
    this.bar.translateX(-(1 - r) * 0.5);
    this.barBg.visible = this.bar.visible = m.hp < m.maxHp && m.act !== 'dead';
  }
}

export class DungeonView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** 2026-11-07 企画者「カメラ もっと 引きで」「もっと 2D 感」→ 遠近の ない カメラで、高い ところから 見下ろす */
  readonly camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 200);
  /** 画面の たての 広さ(世界の 長さ) */
  private viewH = 14;
  private grad = toonGradient();
  private rig: MonsterRig;
  private puppet: AnimeMon;
  private mobs: MobView[] = [];
  private torch: THREE.PointLight;
  private exit: THREE.Mesh;
  private exitMat: THREE.MeshBasicMaterial;
  private pops: Pop[] = [];
  private shake = 0;
  private drops = new Map<number, THREE.Object3D>();
  /** 装備の ランクの 光(企画者「装備の 見た目 A」: ランクごとに 体の まわりが 光る) */
  private aura: THREE.Mesh;
  private auraMat: THREE.MeshBasicMaterial;
  ready = false;

  constructor(canvas: HTMLCanvasElement, s: AdvState, entrant: AnimeEntrant, private model: ModelPick) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene.background = new THREE.Color(0x0b0712);
    
    this.scene.add(new THREE.HemisphereLight(0x9a8acc, 0x2a1a30, 0.9));
    const moon = new THREE.DirectionalLight(0xc8b8ff, 0.6);
    moon.position.set(-8, 20, 6);
    this.scene.add(moon);
    // 自分の まわりを 照らす あかり(ダンジョンの 雰囲気)
    this.torch = new THREE.PointLight(0xffb070, 40, 18, 1.2);
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    this.scene.add(this.torch);
    this.buildFloor(s);
    // 出口(全部 倒すと 光る)
    this.exitMat = new THREE.MeshBasicMaterial({ color: 0x4a3a5a, transparent: true, opacity: 0.6 });
    this.exit = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), this.exitMat);
    this.exit.rotation.x = -Math.PI / 2;
    this.exit.position.set(s.floor.exit.x, 0.03, s.floor.exit.z);
    this.scene.add(this.exit);
    // 自分の MONZ(MONZ RUMBLE と 同じ 体と 動き)
    this.rig = new MonsterRig(0x8fb4e8, 0xe8f0ff, 0xffd23a, this.grad);
    this.scene.add(this.rig.root);
    this.puppet = newAnimeBattle(entrant, entrant, 1).f[0];
    for (let i = 0; i < s.mobs.length; i++) {
      const v = new MobView(this.grad);
      this.mobs.push(v);
      this.scene.add(v.root);
    }
    this.auraMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 32), this.auraMat);
    this.aura.rotation.x = -Math.PI / 2;
    this.scene.add(this.aura);
    this.loadModel();
  }

  /** 落ちている 物(回復の実 = 緑の 実・装備 = ランクの 色の 箱) */
  private dropMesh(item: AdvItem): THREE.Object3D {
    const g = new THREE.Group();
    if (item.kind === 'herb') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshToonMaterial({ color: 0x5ad05a, gradientMap: this.grad }));
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), new THREE.MeshToonMaterial({ color: 0x2a8a3a, gradientMap: this.grad }));
      leaf.position.y = 0.24;
      m.add(leaf);
      g.add(m);
    } else {
      const c = RANK_HEX[item.rank];
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshToonMaterial({ color: c, gradientMap: this.grad, emissive: c, emissiveIntensity: 0.4 }));
      g.add(m);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = -0.38;
      g.add(glow);
    }
    return g;
  }

  /** 技の 光(打つ 技 = 前に 広がる オレンジの 輪・回復 = 緑の 輪)【仮】 */
  private ringFx(x: number, z: number, color: number, r: number): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    this.scene.add(m);
    this.pops.push({ obj: m as unknown as THREE.Sprite, t: 0, life: 0.4, vy: 0, grow: r });
  }

  /** 床と 壁(箱を ならべる) */
  private buildFloor(s: AdvState): void {
    const f = s.floor;
    const floors: number[] = [];
    const walls: number[] = [];
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        if (f.tiles[i] === FLOOR) floors.push(i);
        else {
          // 床の となりの 壁だけ 立てる
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < f.w && yy < f.h && f.tiles[yy * f.w + xx] === FLOOR) near = true;
            }
          if (near) walls.push(i);
        }
      }
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 0.2, CELL), new THREE.MeshLambertMaterial({ color: 0xffffff }), floors.length);
    floors.forEach((i, k) => {
      const x = i % f.w;
      const y = Math.floor(i / f.w);
      m4.makeTranslation((x + 0.5) * CELL, -0.1, (y + 0.5) * CELL);
      fl.setMatrixAt(k, m4);
      // 石の 床(少しずつ 色を 変える)
      const v = ((x * 7 + y * 13) % 5) / 5;
      col.setRGB(0.5 + v * 0.06, 0.44 + v * 0.05, 0.5 + v * 0.06);
      fl.setColorAt(k, col);
    });
    fl.receiveShadow = true;
    this.scene.add(fl);
    const wl = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 2.0, CELL), new THREE.MeshLambertMaterial({ color: 0xffffff }), walls.length);
    walls.forEach((i, k) => {
      const x = i % f.w;
      const y = Math.floor(i / f.w);
      m4.makeTranslation((x + 0.5) * CELL, 1.0, (y + 0.5) * CELL);
      wl.setMatrixAt(k, m4);
      const v = ((x * 5 + y * 3) % 4) / 4;
      col.setRGB(0.13 + v * 0.04, 0.09 + v * 0.03, 0.2 + v * 0.05);
      wl.setColorAt(k, col);
    });
    wl.castShadow = true;
    wl.receiveShadow = true;
    this.scene.add(wl);
  }

  private loadModel(): void {
    const m = this.model;
    if (!m) {
      this.ready = true;
      return;
    }
    const done = (g: { scene: THREE.Object3D }) => {
      try {
        this.rig.useModel(g.scene, m.height, m.hue ?? 0, m.bones, m.amp, m.rig);
      } catch {
        // 使えない モデルは 仮の 形の まま
      }
      this.ready = true;
    };
    const fail = () => {
      this.ready = true;
    };
    const url = assetUrl(m.file);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      if (url.startsWith('data:')) {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        // iPhone の アプリでは 絵を fetch で 読めないので、その間だけ createImageBitmap を かくす(animeField と 同じ)
        const w = window as unknown as { createImageBitmap?: unknown };
        const cib = w.createImageBitmap;
        w.createImageBitmap = undefined;
        try {
          loader.parse(buf.buffer, '', done, fail);
        } finally {
          w.createImageBitmap = cib;
        }
      } else loader.load(url, done, undefined, fail);
    } catch {
      fail();
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    const a = w / Math.max(1, h);
    this.camera.top = this.viewH / 2;
    this.camera.bottom = -this.viewH / 2;
    this.camera.left = (-this.viewH * a) / 2;
    this.camera.right = (this.viewH * a) / 2;
    this.camera.updateProjectionMatrix();
  }

  private pop(text: string, color: string, x: number, y: number, z: number, size = 0.9): void {
    const mat = new THREE.SpriteMaterial({ map: numberTexture(text, color), transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(size * 2, size, 1);
    sp.renderOrder = 20;
    this.scene.add(sp);
    this.pops.push({ obj: sp, t: 0, life: 0.7, vy: 2.2, grow: 0 });
  }

  private burst(x: number, z: number, color: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(x + (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.6);
      sp.scale.setScalar(0.25);
      this.scene.add(sp);
      this.pops.push({ obj: sp, t: 0, life: 0.35, vy: 1 + Math.random() * 2, grow: 2 });
    }
  }

  /** 1フレーム 描く */
  render(s: AdvState, events: AdvEvent[], dt: number): void {
    const now = performance.now() / 1000;
    const p = s.player;
    for (const e of events) {
      if (e.kind === 'hit') {
        const toMe = e.target === 0;
        this.pop(String(e.dmg), toMe ? '#ff6a6a' : e.crit ? '#ffd23a' : '#ffffff', e.x, 2.1, e.z, e.crit ? 1.2 : 0.9);
        this.burst(e.x, e.z, toMe ? 0xff4a4a : 0xffc060, e.crit ? 14 : 8);
        this.shake = Math.max(this.shake, toMe ? 0.25 : 0.12);
        if (toMe) this.rig.flash = 0.12;
      } else if (e.kind === 'die') this.burst(e.x, e.z, 0xb070ff, 18);
      else if (e.kind === 'open') this.burst(e.x, e.z, 0x7affd0, 24);
      else if (e.kind === 'drop') {
        const o = this.dropMesh(e.drop.item);
        o.position.set(e.drop.x, 0.45, e.drop.z);
        this.scene.add(o);
        this.drops.set(e.drop.id, o);
      } else if (e.kind === 'pick') {
        const o = this.drops.get(e.drop.id);
        if (o) this.scene.remove(o);
        this.drops.delete(e.drop.id);
        this.pop(e.drop.item.kind === 'herb' ? '実' : e.drop.item.rank, e.drop.item.kind === 'herb' ? '#7aff8a' : `#${RANK_HEX[e.drop.item.rank].toString(16).padStart(6, '0')}`, p.x, 2.2, p.z, 0.8);
      } else if (e.kind === 'tech') {
        if (e.support) this.ringFx(e.x, e.z, 0x5aff8a, 5);
        else this.ringFx(e.x + Math.cos(p.face) * 1.4, e.z + Math.sin(p.face) * 1.4, 0xff9a3a, 7);
      } else if (e.kind === 'heal' && e.amount > 0) {
        this.pop(`+${e.amount}`, '#7aff8a', e.x, 2.3, e.z, 1);
        this.burst(e.x, e.z, 0x5aff8a, 10);
      }
    }
    // 自分の MONZ: MONZ RUMBLE の 体を 動かす(人形に 今の 動きを 入れる)
    const f = this.puppet;
    f.x = p.x;
    f.z = p.z;
    f.y = 0;
    f.vy = 0;
    f.vx = p.vx;
    f.vz = p.vz;
    f.face = p.face;
    f.speed = Math.hypot(p.vx, p.vz);
    const W = ADV.player.windup;
    f.act =
      p.act === 'attack' || p.act === 'tech'
        ? { k: 'tech', id: 'punch', t: p.actT, dir: p.face, fired: p.actT >= W, hit: p.actT >= W, tx: p.x, tz: p.z, windup: W, n: 1, next: 0 }
        : p.act === 'hurt'
          ? { k: 'hurt', t: p.actT, until: ADV.hurtTime }
          : p.act === 'dead'
            ? { k: 'ko', t: p.actT }
            : { k: 'free' };
    this.rig.update(f, dt);
    // 落ちている 物: くるくる・ふわふわ
    for (const o of this.drops.values()) {
      o.rotation.y += dt * 2;
      o.position.y = 0.45 + Math.sin(now * 3 + o.id) * 0.08;
    }
    // 装備の ランクの 光(いちばん 高い ランク)
    const best = (['claw', 'armor', 'charm'] as const).reduce((r, k) => Math.max(r, s.gear[k] ? RANKS.indexOf(s.gear[k]!.rank) : -1), -1);
    this.auraMat.opacity = best < 0 ? 0 : 0.25 + best * 0.1 + Math.sin(now * 4) * 0.08;
    if (best >= 0) this.auraMat.color.setHex(RANK_HEX[RANKS[best]]);
    this.aura.position.set(p.x, 0.06, p.z);
    this.aura.scale.setScalar(1 + best * 0.12);
    s.mobs.forEach((m, i) => this.mobs[i].update(m, dt, this.camera, now));
    // 出口
    this.exitMat.color.setHex(s.exitOpen ? 0x7affd0 : 0x4a3a5a);
    this.exitMat.opacity = s.exitOpen ? 0.55 + Math.sin(now * 5) * 0.25 : 0.5;
    // ポップ
    for (const q of this.pops) {
      q.t += dt;
      q.obj.position.y += q.vy * dt;
      const k = q.t / q.life;
      (q.obj.material as THREE.SpriteMaterial).opacity = 1 - k;
      if (q.grow) q.obj.scale.setScalar(0.25 * (1 + q.grow * k));
    }
    this.pops = this.pops.filter((q) => {
      if (q.t < q.life) return true;
      this.scene.remove(q.obj);
      (q.obj.material as THREE.SpriteMaterial).map?.dispose();
      (q.obj.material as THREE.SpriteMaterial).dispose();
      return false;
    });
    // あかりと カメラ(ななめ上から ついていく)
    this.torch.position.set(p.x, 3.2, p.z + 0.5);
    const cx = p.x + (Math.random() - 0.5) * this.shake;
    const cz = p.z + (Math.random() - 0.5) * this.shake;
    this.shake *= Math.exp(-dt * 12);
    // 角度は 最初の 試作と 同じ(約58度。2026-11-07 企画者「真上からは嫌・角度は最初のぐらい」)
    this.camera.position.set(cx, 17, cz + 17); // 同じ日「若干 真上っぽい」→ 45度に
    this.camera.lookAt(cx, 0.6, cz);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
