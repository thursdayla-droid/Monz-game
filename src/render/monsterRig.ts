/**
 * 3Dバトル(アニメのモンスターバトル風・企画者 2026-11-01)の【仮】のモンスター。
 * 丸い体・大きな目・小さな角・短い手足・しっぽ。BUNKの3Dモデルが届いたら差しかえる(BUNKの見た目はまだ使わない)。
 * 既存の作品のキャラクターに似せない。向き: 体の前 = +x、上 = +y。
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BunkBones, type AttackPose } from './bunkBones';
import { getTech } from '../core/battle3d/techTable';
import type { AnimeMon } from '../core/battle3d/anime';

/** 色違い: テクスチャの色の色相を回す(明るさは同じ) */
function shiftHue(mat: THREE.MeshStandardMaterial, angle: number): void {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float Y = dot(c, vec3(0.299, 0.587, 0.114));
        float I = dot(c, vec3(0.596, -0.274, -0.322));
        float Q = dot(c, vec3(0.211, -0.523, 0.312));
        float h = atan(Q, I) + ${angle.toFixed(4)};
        float ch = length(vec2(I, Q));
        I = ch * cos(h);
        Q = ch * sin(h);
        diffuseColor.rgb = clamp(vec3(Y + 0.956 * I + 0.621 * Q, Y - 0.272 * I - 0.647 * Q, Y - 1.106 * I + 1.703 * Q), 0.0, 1.0);
      }`,
    );
  };
  mat.customProgramCacheKey = () => `hue${angle.toFixed(3)}`;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1a1020, side: THREE.BackSide });

export class MonsterRig {
  readonly root = new THREE.Group();
  /** 体全体(つぶれる・のびる・回る) */
  readonly body = new THREE.Group();
  readonly mats: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[] = [];
  /** 企画者の3Dモデルを使っている(仮のモンスターの形はかくす) */
  private model: THREE.Object3D | null = null;
  /** 骨で動かす(骨入りのモデルのとき) */
  private bones: BunkBones | null = null;
  private lungeNow = 0;
  /** パンチのグローブの場所(のばしている時だけ。光の演出用) */
  punch(out: THREE.Vector3): { ext: number } | null {
    const b = this.bones;
    if (!b || b.punchSide === 0 || b.punchExt < 0.2) return null;
    return b.glove(b.punchSide, out) ? { ext: b.punchExt } : null;
  }
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

  /**
   * 企画者の3Dモデル(BUNK。Tripo・2026-11-01)に差しかえる。仮のモンスターの形はかくす。
   * hue: 色違い(色相を回す角度・ラジアン)。0 = そのまま。
   * 骨入りのモデル(2026-11-01)は、待機・移動を骨で動かす(bunkBones.ts)。骨がないモデルは体全体だけで動かす
   */
  useModel(src: THREE.Object3D, height: number, hue = 0, useBones = true, amp = 1): void {
    // 骨入りのモデルは、骨ごと写す(ふつうの写し方だと骨とのつながりが切れる)
    const model = SkeletonUtils.clone(src);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = height / Math.max(0.001, size.y);
    model.scale.setScalar(k);
    model.position.y = -box.min.y * k;
    for (const c of [...this.body.children]) if (c !== this.mouth) c.visible = false;
    this.mats.length = 0;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      // 骨で動くと、元の大きさの箱からはみ出すことがあるので、画面の外の判定で消さない
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.metalness = Math.min(mat.metalness, 0.2);
      if (hue) shiftHue(mat, hue);
      m.material = mat;
      this.mats.push(mat);
    });
    this.body.add(model);
    this.model = model;
    // 骨がずれているモデルは、骨を動かさない(形がくずれないように。体全体だけで動かす)
    const bones = useBones ? new BunkBones(model, amp) : null;
    this.bones = bones?.ok ? bones : null;
    // 口(技を撃つ所)を、モデルの顔の前に
    this.mouth.position.set(size.x * k * 0.55, height * 0.42, 0);
  }

  /** ばね(目標へ行きすぎて、ぷるんと戻る)。[今の値, 速さ] */
  private spr: Record<string, [number, number]> = { sx: [1, 0], sy: [1, 0], rz: [0, 0], rx: [0, 0], lift: [0, 0] };
  private spring(key: string, target: number, dt: number, stiff = 260, damp = 14): number {
    const s = this.spr[key];
    // 大きな時間でも暴れないように、細かく分けて計算する
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s[1] += (target - s[0]) * stiff * h;
      s[1] *= Math.exp(-damp * h);
      s[0] += s[1] * h;
    }
    return s[0];
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
    let direct = false;
    this.eyes.visible = !this.model && a.k !== 'ko';
    this.xEyes.visible = !this.model && a.k === 'ko';
    // 進む向き(体の前・横)で、体をかたむける
    const fwd = f.vx * Math.cos(f.face) + f.vz * Math.sin(f.face);
    const side = -f.vx * Math.sin(f.face) + f.vz * Math.cos(f.face);
    if (a.k === 'tech') {
      const tech = getTech(a.id);
      const w = Math.min(1, a.t / a.windup);
      if (!a.fired) {
        // ため: 体をちぢめて、うしろへ引く(ビームは ふるえる)
        sy = 1 - w * 0.22;
        sx = 1 + w * 0.15;
        rotZ = w * 0.35;
        arm = w * 1.2;
        if (tech.kind === 'beam') b.position.x = Math.sin(now * 70) * 0.025 * w;
        // 突進・回転のため: ぐっと しゃがむ(企画者のモデルは形をくずさず、体ごと下げる)
        if (this.model && (tech.kind === 'rush' || tech.kind === 'spin')) {
          lift = -0.12 * w;
          rotZ = tech.kind === 'spin' ? w * 0.6 : rotZ;
        }
      } else {
        const k = a.t - a.windup;
        if (tech.kind === 'shot' || tech.kind === 'beam') {
          // 撃つ: ぐっと前へのびて、反動でうしろへ
          const p = Math.max(0, 1 - k / 0.18);
          sx = 1 + 0.3 * p;
          sy = 1 - 0.15 * p;
          rotZ = -0.45 * p + (k > 0.18 && k < 0.4 ? 0.2 : 0) - (tech.kind === 'beam' && k < tech.duration ? 0.25 : 0);
          arm = -0.6;
        } else if (tech.kind === 'rush') {
          rotZ = -0.6;
          sx = 1.2;
          sy = 0.85;
          legSwing = Math.sin(now * 34) * 1.0;
        } else if (tech.kind === 'quake') {
          // 踏みつけ: 小さく跳ねて、ドスンとつぶれる
          if (f.y > 0) {
            sy = 1.18;
            sx = 0.9;
          } else {
            sy = 0.62;
            sx = 1.32;
          }
          arm = 1.2;
        } else if (tech.kind === 'drop') {
          // 落下: 高く跳んで回り、落ちてつぶれる
          if (f.y > 0) {
            rotZ = -k * 9;
            direct = true;
          } else {
            sy = 0.6;
            sx = 1.35;
          }
        } else if (tech.kind === 'spin') {
          // 回転: 丸くなって転がる
          if (!a.hit) {
            rotZ = -k * 22;
            direct = true;
            sy = 0.85;
            sx = 0.95;
          }
        } else if (tech.kind === 'jab' || (tech.kind === 'combo' && this.bones)) {
          // パンチ(通常攻撃・連続攻撃): 体はまっすぐ立てたまま、腕でパンチ(前にかたむけると頭突きに見える。2026-11-02 企画者「頭突きだし」)
          rotZ = 0.06;
          sx = 1;
          sy = 1;
        } else if (tech.kind === 'combo') {
          // 連続攻撃: 小きざみに跳ねて、何回もぶつかる
          lift = Math.abs(Math.sin(k * 22)) * 0.35;
          rotZ = -0.4 + Math.sin(k * 22) * 0.35;
          sx = 1.1;
          sy = 0.92;
          legSwing = Math.sin(k * 30) * 0.9;
        } else if (tech.kind === 'pillar') {
          // 火柱: 前の地面を なぐる(前へかがんで、ぐっと つぶれる)
          const p = Math.max(0, 1 - k / 0.35);
          rotZ = -0.55 * p;
          sy = 1 - 0.25 * p;
          sx = 1 + 0.18 * p;
          arm = -1.2 * p;
        } else if (tech.kind === 'barrier') {
          // 守り: 体を丸める
          sy = 0.82;
          sx = 1.12;
          arm = 1.4;
          rotZ = 0.1;
        }
      }
    } else if (a.k === 'dodge') {
      const p = Math.min(1, a.t / 0.3);
      if (a.jump) {
        rotX = (a.dz > 0 ? 1 : -1) * p * Math.PI * 2;
        direct = true;
      } else rotX = (a.dz > 0 ? 1 : -1) * Math.sin(p * Math.PI) * 0.7;
      sy = 1 - Math.sin(p * Math.PI) * 0.15;
      sx = 1 + Math.sin(p * Math.PI) * 0.1;
    } else if (a.k === 'hurt') {
      const p = 1 - a.t / a.until;
      rotZ = 0.6 * p;
      sx = 1 + 0.2 * p;
      sy = 1 - 0.2 * p;
    } else if (a.k === 'air') {
      rotZ = 0.6 + a.t * 10;
      direct = true;
    } else if (a.k === 'down' || a.k === 'ko') {
      rotZ = Math.PI / 2;
      lift = 0.05;
      if (a.k === 'down') rotY = Math.sin(now * 20) * 0.03;
    } else if (a.k === 'victory') {
      lift = Math.abs(Math.sin(a.t * 7)) * 0.5;
      arm = 1.3;
      rotY = Math.sin(a.t * 3) * 0.5;
    } else {
      // ふだん: ぷるぷる息をする。歩くと、ぴょこぴょこ跳ねる(速いほど大きく速く)
      const breathe = Math.sin(now * 4.5 + f.side * 2) * 0.035;
      sy = 1 + breathe;
      sx = 1 - breathe * 0.6;
      const sp = f.speed;
      if (sp > 0.3) {
        this.hop += dt * (6 + sp * 2.4);
        const h = Math.abs(Math.sin(this.hop));
        const big = Math.min(1, sp / 4);
        // 骨で動くモデルは、足で歩くので跳ねを小さく(歩いている感じ。2026-11-02)
        lift = h * (this.bones ? 0.09 : 0.26) * big;
        // 着地でつぶれ、空中でのびる
        sy += (h - 0.5) * 0.16 * big;
        sx -= (h - 0.5) * 0.1 * big;
        legSwing = Math.sin(this.hop) * 0.8 * big;
      }
      // 企画者のモデル: 止まっている時も、小さく はずむ(構え。2026-11-02)
      if (this.model && sp <= 0.3) lift = Math.abs(Math.sin(now * 5.5 + f.side * 1.3)) * 0.05;
      // 進む向きへ体をかたむける
      rotZ = -fwd * 0.07;
      rotX = side * 0.07;
      arm = 0.25 + breathe * 4 + Math.min(1, sp / 4) * 0.4;
      if (f.y > 0) {
        // 小さく跳ねたとき
        sy = 1.12;
        sx = 0.92;
        legSwing = 0.6;
      }
    }
    // 骨で動かす(待機・移動だけ。ほかの動きは骨を休ませ、体全体で動かす)
    if (this.bones) {
      const mode = a.k === 'free' && f.y <= 0 ? (f.speed > 0.3 ? 'move' : 'idle') : 'other';
      // 腕を使う攻撃(突進・連続攻撃・弾。2026-11-01)
      let atk: AttackPose | null = null;
      if (a.k === 'tech') {
        const tech = getTech(a.id);
        const kind = tech.kind === 'rush' ? 'rush' : tech.kind === 'combo' || tech.kind === 'jab' ? 'combo' : tech.kind === 'shot' || tech.kind === 'barrage' || tech.kind === 'beam' ? 'shot' : null;
        if (kind) {
          const wind = a.fired ? 0 : Math.min(1, a.t / a.windup);
          const run = a.t - a.windup;
          const activeT = kind === 'shot' ? (tech.kind === 'beam' ? tech.duration : 0.35) : 0;
          const active = a.fired && (kind === 'rush' ? !a.hit : tech.kind === 'jab' ? !a.hit || a.t < a.next : kind === 'combo' ? a.n < tech.hits || run < 0.1 : run < activeT);
          const recover = a.fired && !active ? Math.min(1, (run - activeT) / Math.max(0.1, tech.recovery)) : 0;
          const punch = kind === 'combo' && a.n > 0 ? Math.min(1, Math.max(0, 1 - (a.next - a.t) / Math.max(0.05, tech.duration))) : 0;
          atk = { kind, wind, active, recover, n: a.n, punch };
        }
      }
      this.bones.update(mode, this.hop, f.speed, now, dt, f.side * 1.3, atk, f.speed > 0.3 ? side / f.speed : 0);
      // パンチに合わせて、体ごと前へ出る(腕だけだと小さく見えるため。2026-11-02)
      // パンチは体ごと前へは出ない(腕が前へ出るのを見せる)
      const jabbing = a.k === 'tech' && (getTech(a.id).kind === 'jab' || getTech(a.id).kind === 'combo');
      this.lungeNow += ((atk && !jabbing ? this.bones.lunge : 0) - this.lungeNow) * Math.min(1, dt * 25);
    }
    // 企画者のモデルは、形をゆがめないことを最優先(つぶす・のばすを小さくする)
    if (this.model) {
      const q = this.bones ? 0.3 : 0.6;
      sx = 1 + (sx - 1) * q;
      sy = 1 + (sy - 1) * q;
    }
    // ばねで動かす(ぷるんと生き物らしく)。回転が大きい時はそのまま
    b.scale.set(this.spring('sx', sx, dt), this.spring('sy', sy, dt), this.spr.sx[0]);
    const rz = direct ? rotZ : this.spring('rz', rotZ, dt, 220, 12);
    const rx = direct ? rotX : this.spring('rx', rotX, dt, 220, 12);
    if (direct) {
      this.spr.rz = [0, 0];
      this.spr.rx = [0, 0];
    }
    b.rotation.set(rx, rotY, rz);
    b.position.y = this.spring('lift', lift, dt, 400, 18);
    if (a.k !== 'tech' || getTech(a.id).kind !== 'beam') b.position.x = this.lungeNow * 0.35 * (this.model ? this.model.scale.x / 1.8 : 1);
    this.armL.rotation.set(0, 0, arm * 0.9 + Math.sin(now * 9) * 0.05);
    this.armR.rotation.set(0, 0, arm * 0.9 - Math.sin(now * 9) * 0.05);
    this.legL.rotation.set(0, 0, legSwing);
    this.legR.rotation.set(0, 0, -legSwing);
    this.tail.rotation.set(0, Math.sin(now * (5 + f.speed * 2)) * (0.4 + f.speed * 0.08), 0);
    // 当たった時の白い光・よけている時の半透明
    this.flash = Math.max(0, this.flash - dt);
    const ghost = a.k === 'dodge' && a.t < 0.28 ? 0.6 : 1;
    for (const m of this.mats) {
      m.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000);
      m.emissiveIntensity = this.flash > 0 ? 0.9 : 0;
      m.transparent = ghost < 1;
      m.opacity = ghost;
    }
  }
}
