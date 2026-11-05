/**
 * 3Dバトル(アニメのモンスターバトル風・企画者 2026-11-01)の【仮】のモンスター。
 * 丸い体・大きな目・小さな角・短い手足・しっぽ。BUNKの3Dモデルが届いたら差しかえる(BUNKの見た目はまだ使わない)。
 * 既存の作品のキャラクターに似せない。向き: 体の前 = +x、上 = +y。
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CreatureBones } from './creatureBones';
import { QuadBones, type QuadStyle } from './quadBones';
import { SnakeBones } from './snakeBones';
import type { ModelRig } from '../core/roster';
import { BunkBones, type AttackPose } from './bunkBones';
import { getTech } from '../core/battle3d/techTable';
import type { AnimeMon } from '../core/battle3d/anime';
import { ANIME } from '../core/battle3d/animeConfig';
import { BEAST } from '../core/battle3d/beastScripts';

/**
 * 新しい5体の 通常攻撃の 1発の 進みぐあい(2026-11-05 企画者「その場で何してるか全然わからない」)。
 * up: ため(体を引く・前足を上げる。打つ瞬間に 0)・hit: 打つ(当たる瞬間に 1 → もどる)・spin: 回る技の 回りぐあい(0〜1)
 */
export interface MonMovePose {
  move: string;
  up: number;
  hit: number;
  spin: number;
}
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function monMovePose(f: AnimeMon): MonMovePose | null {
  const a = f.act;
  // 新しい5体の 技(1歩ずつの 動き。beastScripts.ts): ため → 打つ → もどる を 1歩ごとに
  const bs = a.k === 'tech' ? BEAST[a.id] : undefined;
  if (bs && a.k === 'tech') {
    if (!a.fired) return { move: bs[0].mv, up: ease(a.t / Math.max(0.01, a.windup)), hit: 0, spin: 0 };
    const i = a.step ?? 0;
    if (i >= bs.length) return null;
    const s = bs[i];
    const p = (a.stepT ?? 0) / s.t;
    const h = s.hit;
    let up = 0;
    let hit = 0;
    if (h?.contact) hit = Math.min(1, p * 4);
    else if (h && (h.n ?? 1) > 1) {
      // 何回も 当てる(炎の息・押しこみ): 当てるたびに 前へ
      const ph = Math.max(0, (a.stepT ?? 0) - (h.at ?? 0) * s.t) / Math.max(0.05, h.every ?? 0.1);
      hit = 0.5 + 0.5 * Math.sin((ph % 1) * Math.PI);
      up = 1 - hit;
    } else if (h) {
      const at = h.at ?? 0.5;
      if (p < at) up = ease(p / at);
      else hit = 1 - ease((p - at) / Math.max(0.05, 1 - at));
    } else up = ease(Math.min(1, p * 2));
    return { move: s.mv, up, hit, spin: s.spin ? (s.spinN ? Math.min(1, p) * s.spinN : ease(p)) : 0 };
  }
  if (a.k !== 'tech' || !f.jab.moves || getTech(a.id).kind !== 'jab') return null;
  if (a.sp) {
    // ためた強い1発・ダッシュ攻撃(2026-11-05): ためる間は 体を引いたまま(ふるえる)→ 大きく とびこむ
    const P = a.sp === 'charge' ? ANIME.power : ANIME.dashAtk;
    if (!a.fired) {
      const up = a.sp === 'charge' ? Math.min(1, a.t / 0.2) : ease(a.t / Math.max(0.01, a.windup));
      return { move: a.mv ?? 'head', up, hit: 0, spin: 0 };
    }
    const r = a.t - (a.tf ?? 0);
    const s = ease(r / P.strike);
    const fo = ease((r - P.strike) / P.follow);
    // 回るのは しっぽ・甲羅の 動きだけ(2026-11-05 企画者「くるくる回ってるだけ」→ ほかの 動きは 回らない)
    const spinMv = a.mv === 'tail' || a.mv === 'shell';
    return { move: a.mv ?? 'head', up: 1 - s, hit: s * (1 - fo), spin: spinMv ? ease(r / (P.strike + P.follow * 0.6)) : 0 };
  }
  const i = a.hit ? a.n - 1 : a.n;
  const move = f.jab.moves[Math.max(0, i)];
  const mv = ANIME.monMove[move];
  if (!mv) return null;
  const tW = Math.max(0.01, a.windup);
  const tI = tW + mv.d * 0.45;
  const tE = tW + mv.d;
  const t = a.t;
  const w = ease(t / tW);
  const s = ease((t - tW) / (tI - tW));
  const fo = ease((t - tI) / (tE - tI));
  return { move, up: w * (1 - s), hit: s * (1 - fo), spin: move === 'tail' || move === 'shell' ? ease((t - tW * 0.6) / (tE - tW * 0.6)) : 0 };
}

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
  /** 生き物用の骨(人の形でない骨。MOFU 2026-11-03) */
  private creature: CreatureBones | null = null;
  /** 四つ足の けもの(RIOT など。2026-11-04) */
  private quad: QuadBones | null = null;
  /** へび(SNEK など) */
  private snake: SnakeBones | null = null;
  private lastFace: number | null = null;
  /** 体を固めている(ひるまない) */
  armored = false;
  private lungeNow = 0;
  /** 新しい5体の 通常攻撃で 体を前へ出す量 */
  private monFwd = 0;
  /** パンチのグローブの場所(のばしている時だけ。光の演出用) */
  punch(out: THREE.Vector3): { ext: number } | null {
    const b = this.bones;
    if (!b || b.punchSide === 0 || b.punchExt < 0.2) return null;
    return b.glove(b.punchSide, out) ? { ext: b.punchExt } : null;
  }
  /** 両方のグローブのまん中(骨入りのモデルだけ。両手で撃つ技の光が出る所)。なければ false */
  gloves(out: THREE.Vector3): boolean {
    const b = this.bones;
    if (!b) return false;
    const t = new THREE.Vector3();
    if (!b.glove(1, out) || !b.glove(-1, t)) return false;
    out.add(t).multiplyScalar(0.5);
    return true;
  }
  /** 右のグローブ(片手で撃つ技)。なければ false */
  glove(out: THREE.Vector3): boolean {
    return !!this.bones && !!this.bones.glove(1, out);
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
  /** 攻撃が当たらない間(たおれている・起きた直後・よけている瞬間)。白く点滅させる(2026-11-02 企画者「喰らわない時白くするか分かりやすく」) */
  safe = false;

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
  useModel(src: THREE.Object3D, height: number, hue = 0, useBones = true, amp = 1, rig: ModelRig = 'auto'): void {
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
    // 四つ足の けもの(企画者「完全な四足歩行」): 人の形の骨・生き物用の骨は 使わない
    const quadStyle = rig.startsWith('quad') ? ((rig.split(':')[1] ?? 'wild') as QuadStyle) : null;
    const qb = useBones && quadStyle ? new QuadBones(model, quadStyle) : null;
    this.quad = qb?.ok ? qb : null;
    // へび(企画者「腕0本・脚0本」): 人の形・四つ足・生き物用の骨は 使わない
    const sb = useBones && rig === 'snake' ? new SnakeBones(model) : null;
    this.snake = sb?.ok ? sb : null;
    // 四つ足・へびの種族は、骨が 見つからなくても 人の形の動きは 使わない(体ぜんたいだけで 動く)
    const special = rig !== 'auto';
    const bones = useBones && !special ? new BunkBones(model, amp) : null;
    this.bones = bones?.ok ? bones : null;
    // 人の形の骨でなければ、生き物用の骨として動かす(触角・足)
    const cb = useBones && !this.bones && !special ? new CreatureBones(model) : null;
    this.creature = cb?.ok ? cb : null;
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
    const mp = monMovePose(f);
    this.monFwd = 0;
    if (mp) {
      // 新しい5体の 通常攻撃: ためで 体を引き、とびこんで 打つ(体ぜんたいで 大きく見せる。2026-11-05)
      const { up, hit } = mp;
      const sgn = mp.move === 'clawL' ? -1 : 1;
      // 動きは 短いので ばねを通さず そのまま(おくれて 小さく見えないように)
      direct = true;
      if (mp.move === 'clawR' || mp.move === 'clawL') {
        // 前足で ひっかく: 体を起こして 前足を上げ → ななめに 振りおろす
        rotZ = 0.5 * up - 0.25 * hit;
        lift = 0.25 * up;
        rotY = sgn * (-0.45 * up + 0.4 * hit);
        rotX = sgn * 0.15 * up;
        this.monFwd = -0.15 * up + 0.45 * hit;
      } else if (mp.move === 'bite') {
        // かみつく: 頭を引いて → 前へ のびて かむ
        rotZ = 0.25 * up - 0.3 * hit;
        lift = 0.06 * up;
        this.monFwd = -0.3 * up + 0.7 * hit;
      } else if (mp.move === 'head') {
        // 頭突き: 頭を下げて 体を引き → 体ごと ぶつかる
        rotZ = -0.2 * up - 0.35 * hit;
        lift = -0.05 * up + 0.08 * hit;
        this.monFwd = -0.45 * up + 0.8 * hit;
      } else if (mp.move === 'shoulder') {
        // 体当たり(肩): 体を 横へ ひねって → 肩から ぶつかる
        rotY = -0.9 * up + 0.35 * hit;
        rotX = 0.25 * hit;
        this.monFwd = -0.25 * up + 0.7 * hit;
      } else if (mp.move === 'shell' || mp.move === 'tail') {
        // 甲羅・しっぽ: その場で ぐるっと 1回まわる(甲羅を ぶつける・しっぽで はらう)
        rotY = -Math.PI * 2 * mp.spin;
        lift = mp.move === 'shell' ? -0.05 * (up + hit) : 0;
        rotZ = mp.move === 'shell' ? -0.06 * hit : 0;
        this.monFwd = 0.25 * hit;
      } else if (mp.move === 'zap') {
        // 電気: 体を ためて → 口を前へ つきだす
        rotZ = 0.3 * up - 0.15 * hit;
        sy = 1 - 0.08 * up;
        rotY = Math.sin(now * 70) * 0.06 * up;
        this.monFwd = -0.2 * up + 0.35 * hit;
      }
      // 回る技(しっぽ・甲羅 以外の 動きでも)
      if (mp.spin > 0 && mp.move !== 'shell' && mp.move !== 'tail') rotY += -Math.PI * 2 * mp.spin;
      // ためた強い1発・ダッシュ攻撃: ためる間 ぶるぶる ふるえ、とびこみは 大きく
      if (a.k === 'tech' && a.sp) {
        if (!a.fired) rotY += Math.sin(now * 55) * (a.full ? 0.08 : 0.045);
        this.monFwd *= 1.4;
        rotZ *= 1.2;
      }
    } else if (a.k === 'tech') {
      const tech = getTech(a.id);
      const w = Math.min(1, a.t / a.windup);
      if (!a.fired) {
        // ため: 体をちぢめて、うしろへ引く(ビームは ふるえる)
        sy = 1 - w * 0.22;
        sx = 1 + w * 0.15;
        rotZ = w * 0.35;
        arm = w * 1.2;
        if (tech.kind === 'beam' || a.sp) b.position.x = Math.sin(now * 70) * (a.full ? 0.05 : 0.025) * w;
        // 突進・回転のため: ぐっと しゃがむ(企画者のモデルは形をくずさず、体ごと下げる)
        // 地面なぐりのため: 振り上げて少し反り、さいごに前へ振り下ろす
        if (tech.kind === 'pillar' || tech.kind === 'field') {
          rotZ = w < 0.75 ? 0.25 * (w / 0.75) : 0.25 - 0.75 * ((w - 0.75) / 0.25);
          sy = 1;
          sx = 1;
          arm = 0;
        }
        // ほえるため: 大きく息を吸って ふくらみ、少し反る
        if (tech.kind === 'debuff') {
          sy = 1 + w * 0.12;
          sx = 1 + w * 0.08;
          rotZ = w * 0.2;
          arm = w * 0.8;
        }
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
        } else if (tech.kind === 'rush' || a.sp) {
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
        } else if (tech.kind === 'drop' && tech.strength !== '中' && f.y > 0) {
          // 強い落下(バンクブレイカーなど): 回らずに、のぼる間は両こぶしを構え、落ちる時は体を前へかたむけて こぶしから急降下
          rotZ = f.vy > 0 ? 0.25 : -0.7;
          sx = f.vy > 0 ? 0.95 : 1.1;
          sy = f.vy > 0 ? 1.08 : 0.95;
        } else if (tech.kind === 'drop') {
          // 落下: 高く跳んで回り(体を丸める)、落ちてつぶれる
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
        } else if (tech.kind === 'jab' && f.jab.whip && !this.bones) {
          // ツルのムチ(MOFU。腕のないモデル): ツルを振るたびに 体を小さく前へ しならせる
          const p = Math.min(1, Math.max(0, 1 - (a.next - a.t) / Math.max(0.05, tech.duration)));
          const snap = a.n > 0 ? Math.sin(p * Math.PI) : 0;
          rotZ = -0.22 * snap;
          sx = 1 + 0.06 * snap;
          sy = 1 - 0.05 * snap;
          rotY = (a.n % 2 ? 1 : -1) * 0.15 * snap;
        } else if (tech.kind === 'jab' || (tech.kind === 'combo' && this.bones)) {
          // パンチ(通常攻撃・連続攻撃): 体はまっすぐ立てたまま、腕でパンチ(前にかたむけると頭突きに見える。2026-11-02 企画者「頭突きだし」)
          rotZ = 0.06;
          sx = 1;
          sy = 1;
          // 中の連続攻撃(跳ねつき連撃): 近づく間は 小きざみに跳ねる(企画者の演出指示)
          if (tech.kind === 'combo' && tech.strength === '中') lift = Math.abs(Math.sin(k * (a.n === 0 ? 18 : 12))) * (a.n === 0 ? 0.32 : 0.12);
        } else if (tech.kind === 'combo') {
          // 連続攻撃: 小きざみに跳ねて、何回もぶつかる
          lift = Math.abs(Math.sin(k * 22)) * 0.35;
          rotZ = -0.4 + Math.sin(k * 22) * 0.35;
          sx = 1.1;
          sy = 0.92;
          legSwing = Math.sin(k * 30) * 0.9;
        } else if (tech.kind === 'debuff') {
          // ほえる: 前へ乗り出して ふるえる
          const p = Math.max(0, 1 - k / 0.6);
          rotZ = -0.3 * p;
          sx = 1 + 0.12 * p;
          sy = 1 - 0.06 * p;
          rotY = Math.sin(now * 60) * 0.03 * p;
        } else if (tech.kind === 'pillar' || tech.kind === 'field') {
          // 火柱: 自分の足もとの地面を なぐる(前へかがんで、ぐっと沈む。0.3秒 地面に当てたまま → もどる)
          const p = k < 0.3 ? 1 : Math.max(0, 1 - (k - 0.3) / 0.3);
          rotZ = -0.5 * p;
          lift = -0.12 * p;
          sy = 1 - 0.2 * p;
          sx = 1 + 0.15 * p;
          arm = -1.2 * p;
        } else if (tech.kind === 'barrier') {
          // 守り: 体を丸める
          sy = 0.82;
          sx = 1.12;
          arm = 1.4;
          rotZ = 0.1;
        }
      }
    } else if (a.k === 'guard') {
      // ガード: 体を少し丸めて、腕を前へ(かまえる)
      sy = 0.88;
      sx = 1.08;
      rotZ = 0.18;
      arm = 1.4;
      lift = -0.04;
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
      // ふっとんで 浮いている: 横に たおれた形(ころがらない。浮いているのが 分かるように 2026-11-05 企画者「横になっててほしい」)
      rotX = (f.side ? -1 : 1) * Math.PI * 0.45;
      rotZ = Math.sin(now * 6) * 0.08;
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
        // 2026-11-03 種族らしい歩き方【仮】
        if (f.species === 'puni') {
          // PUNI: ぽよん ぽよん と大きく はねる(着地で ぺちゃっと つぶれる)
          const hp = Math.abs(Math.sin(now * 4.2 + f.side));
          lift = hp * 0.42 * big;
          sy = 1 + (hp - 0.35) * 0.32 * big;
          sx = 1 - (hp - 0.35) * 0.22 * big;
        } else if (f.species === 'klak') {
          // KLAK: はねずに、小きざみに カタカタ(横歩き)
          lift = Math.abs(Math.sin(now * 15 + f.side)) * 0.04 * big;
          legSwing = Math.sin(now * 30) * 0.9 * big;
        }
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
    // 四つ足・へびの 技(2026-11-05 新しい5体の技): BUNK 向けの 宙返り・前転がり を やめて、体に合った 動きに
    let tp: MonMovePose | null = mp;
    if (!mp && a.k === 'tech' && (this.quad || this.snake)) {
      const tech = getTech(a.id);
      const k = tech.kind;
      const w = a.fired ? 0 : Math.min(1, a.t / Math.max(0.01, a.windup));
      const run = a.t - a.windup;
      const strike = a.fired ? Math.max(0, 1 - run / 0.35) : 0;
      const sw = (this.snake ? 'tail' : f.species === 'shellz' ? 'shell' : 'tail') as string;
      sx = 1;
      sy = 1;
      rotY = 0;
      rotX = 0;
      lift = 0;
      direct = true;
      if (k === 'rush') {
        // 突進: ためで 低く かまえ → 頭を下げて つっこむ
        rotZ = 0.12 * w - (a.fired && !a.hit ? 0.22 : 0);
        lift = -0.05 * w;
        tp = { move: f.species === 'grit' || f.species === 'shellz' ? 'head' : 'bite', up: w, hit: a.fired && !a.hit ? 1 : strike, spin: 0 };
      } else if (k === 'combo') {
        // 連続攻撃: 1発ごとに かみつき・爪(左右)を くりかえす
        const seq = this.snake ? ['bite', 'tail', 'bite'] : ['bite', 'clawR', 'clawL'];
        const pp = a.n > 0 ? Math.min(1, Math.max(0, 1 - (a.next - a.t) / Math.max(0.05, tech.duration))) : 0;
        const mv = seq[(Math.max(1, a.n) - 1) % seq.length];
        const hitk = a.n > 0 ? Math.sin(pp * Math.PI) : 0;
        tp = { move: mv, up: a.fired ? 1 - hitk : w, hit: hitk, spin: 0 };
        rotZ = 0.15 * (a.fired ? 0 : w) - 0.15 * hitk;
        this.monFwd = 0.3 * hitk;
      } else if (k === 'spin') {
        // 回転: 立ったまま その場で 横に ぐるぐる(しっぽ・甲羅で はらう)
        rotY = a.fired && !a.hit ? -a.t * 16 : 0;
        tp = { move: sw, up: w, hit: a.fired ? 1 : 0, spin: 0 };
      } else if (k === 'drop') {
        // 落下: 宙返りしない。のぼる時は 前を上げ、おりる時は 頭から とびかかる
        rotZ = f.y > 0 ? (f.vy > 0 ? 0.3 : -0.4) : 0.12 * w;
        tp = { move: this.snake ? 'bite' : 'clawR', up: f.y > 0 && f.vy > 0 ? 1 : w, hit: f.y > 0 && f.vy <= 0 ? 1 : 0, spin: 0 };
      } else if (k === 'quake' || k === 'field' || k === 'pillar') {
        // 地面を ふむ・たたく: 前を 起こして → ドスンと おろす
        rotZ = 0.3 * w - 0.12 * strike;
        lift = 0.08 * w;
        tp = { move: this.snake ? 'tail' : 'clawR', up: w, hit: strike, spin: 0 };
      } else if (k === 'shot' || k === 'barrage' || k === 'beam' || k === 'drain' || k === 'debuff') {
        // 口から 吐く・ほえる: 頭を 引いて → 前へ つきだす(ほえる は 上を 向く)
        const roar = k === 'debuff';
        const hold = k === 'beam' && a.fired && run < tech.duration ? 1 : strike;
        rotZ = (roar ? 0.25 : 0.12) * w + (roar ? 0.18 : -0.08) * hold;
        tp = { move: 'zap', up: w, hit: hold, spin: 0 };
        if (roar) rotY = Math.sin(now * 50) * 0.04 * hold;
      } else if (k === 'barrier') {
        // 守り: 低く ふんばる(亀は 首を すくめる・へびは とぐろを 巻く)
        lift = -0.06;
        rotZ = 0.05;
        tp = { move: f.species === 'shellz' ? 'shell' : 'head', up: 1, hit: 0, spin: 0 };
      } else {
        // 回復・強化: 体を ぶるっと ふるわせる
        rotY = Math.sin(now * 40) * 0.05 * (a.fired ? 1 : w);
        lift = 0.04 * Math.abs(Math.sin(now * 9));
      }
    }
    // 骨で動かす(待機・移動だけ。ほかの動きは骨を休ませ、体全体で動かす)
    if (this.bones) {
      const mode = a.k === 'free' && f.y <= 0 ? (f.speed > 0.3 ? 'move' : 'idle') : 'other';
      // 腕を使う攻撃(突進・連続攻撃・弾。2026-11-01)
      let atk: AttackPose | null = null;
      if (a.k === 'tech') {
        const tech = getTech(a.id);
        const bigDrop = tech.kind === 'drop' && tech.strength !== '中';
        const kind =
          tech.kind === 'rush' || a.sp || (bigDrop && a.fired && f.y > 0) ? 'rush'
          : tech.kind === 'jab' && f.jab.whip ? 'shot1'
          : tech.kind === 'combo' || tech.kind === 'jab' ? 'combo'
          : tech.kind === 'shot' && tech.strength === '弱' ? 'shot1'
          : tech.kind === 'shot' || tech.kind === 'barrage' || tech.kind === 'beam' ? 'shot'
          : tech.kind === 'pillar' || tech.kind === 'field' ? 'slam'
          : tech.kind === 'debuff' ? 'roar'
          : null;
        if (kind) {
          const wind = bigDrop && kind === 'rush' ? (f.vy > 0 ? 1 : 0) : a.fired ? 0 : Math.min(1, a.t / a.windup);
          const run = a.t - a.windup;
          const activeT = kind === 'shot' || kind === 'shot1' ? (tech.kind === 'beam' ? tech.duration : 0.35) : kind === 'slam' ? 0.3 : kind === 'roar' ? 0.6 : 0;
          const active = bigDrop && kind === 'rush' ? f.vy <= 0 : a.fired && (kind === 'rush' ? !a.hit : tech.kind === 'jab' ? !a.hit || a.t < a.next : kind === 'combo' ? a.n < tech.hits || run < 0.1 : run < activeT);
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
    if (this.creature) this.creature.update(now, Math.min(1, f.speed / 4), a.k === 'down' || a.k === 'ko', a.k === 'tech');
    if (this.quad) {
      // 向きが変わる速さ(曲がる時に 頭・しっぽが 動く)
      const turn = this.lastFace === null || dt <= 0 ? 0 : Math.atan2(Math.sin(f.face - this.lastFace), Math.cos(f.face - this.lastFace)) / dt;
      this.lastFace = f.face;
      const sp = a.k === 'dodge' && a.t < 0.3 ? 8 : a.k === 'free' ? f.speed : 0;
      this.quad.update(now, dt, { speed: sp, air: f.y > 0.05, rising: f.vy > 0, dodge: a.k === 'dodge', hurt: a.k === 'hurt' || a.k === 'air', down: a.k === 'down' || a.k === 'ko', turn, atk: tp });
      // 四つ足は ぴょこぴょこ はねない(歩く はずみ だけ)。体は 息をするように 少し ふくらむ。重い種族は 左右に ゆれる
      if (a.k === 'free' && f.y <= 0) {
        lift = this.quad.bob;
        const br = Math.sin(now * 3.2 + f.side * 2) * 0.018;
        sy = 1 + br - this.quad.land * 0.05;
        sx = 1 - br * 0.5 + this.quad.land * 0.03;
        rotX += this.quad.roll;
      }
      // よける: 宙返りは しない。横へ 体を かたむけて とぶ
      if (a.k === 'dodge') {
        const pq = Math.min(1, a.t / 0.3);
        rotX = (a.dz > 0 ? 1 : -1) * Math.sin(pq * Math.PI) * 0.3;
        direct = false;
        sy = 1;
        sx = 1;
      }
    }
    if (this.snake) {
      const turn = this.lastFace === null || dt <= 0 ? 0 : Math.atan2(Math.sin(f.face - this.lastFace), Math.cos(f.face - this.lastFace)) / dt;
      this.lastFace = f.face;
      const sp = a.k === 'dodge' && a.t < 0.3 ? 8 : a.k === 'free' ? f.speed : 0;
      this.snake.update(now, dt, { speed: sp, air: f.y > 0.05, dodge: a.k === 'dodge', hurt: a.k === 'hurt' || a.k === 'air', down: a.k === 'down' || a.k === 'ko', turn, atk: tp });
      // へびは はねない。地面を すべるように、体ごと 左右に くねる。息で 少し ふくらむ
      if (a.k === 'free' && f.y <= 0) {
        lift = 0;
        const br = Math.sin(now * 2.6 + f.side * 2) * 0.02;
        sy = 1 + br;
        sx = 1 - br * 0.4;
        rotZ = 0;
      }
      rotY += this.snake.yaw;
      rotX += this.snake.roll;
      // たおれても 横には ころがらない(体を 低く・少し かたむける)
      if (a.k === 'down' || a.k === 'ko') {
        rotZ = 0.12;
        lift = 0;
        sy = 0.9;
      }
      if (a.k === 'dodge') {
        const p = Math.min(1, a.t / 0.3);
        rotX = (a.dz > 0 ? 1 : -1) * Math.sin(p * Math.PI) * 0.3;
        direct = false;
        sy = 1;
        sx = 1;
      }
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
    // (腕のないモデルのタックルは、上で前へ出している)
    if (a.k !== 'tech' || !(getTech(a.id).kind === 'beam' || (a.sp && !a.fired && !this.quad && !this.snake))) b.position.x = this.lungeNow * 0.35 * (this.model ? this.model.scale.x / 1.8 : 1) + this.monFwd;
    this.armL.rotation.set(0, 0, arm * 0.9 + Math.sin(now * 9) * 0.05);
    this.armR.rotation.set(0, 0, arm * 0.9 - Math.sin(now * 9) * 0.05);
    this.legL.rotation.set(0, 0, legSwing);
    this.legR.rotation.set(0, 0, -legSwing);
    this.tail.rotation.set(0, Math.sin(now * (5 + f.speed * 2)) * (0.4 + f.speed * 0.08), 0);
    // 当たった時の白い光・よけている時の半透明
    this.flash = Math.max(0, this.flash - dt);
    const bsg = a.k === 'tech' ? BEAST[a.id] : undefined;
    const shadowStep = !!(bsg && a.k === 'tech' && a.fired && bsg[a.step ?? 0]?.ghost);
    const ghost = shadowStep ? 0.28 : a.k === 'dodge' && a.t < 0.28 ? 0.6 : 1;
    // 当たらない間: 白く ちかちか(当たった時の光より弱く、点滅させて ちがいが分かるように)
    const safeGlow = this.safe ? 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(now * 28)) : 0;
    for (const m of this.mats) {
      // 体を固めている(GRIT の 頑固ガード など): 鉄のような 灰色の光
      const armorGlow = this.armored ? 0.25 + 0.1 * Math.sin(now * 10) : 0;
      m.emissive.setHex(this.flash > 0 || safeGlow > 0 ? 0xffffff : armorGlow > 0 ? 0x9a8a6a : 0x000000);
      m.emissiveIntensity = this.flash > 0 ? 0.9 : safeGlow > 0 ? safeGlow : armorGlow;
      m.transparent = ghost < 1;
      m.opacity = ghost;
    }
  }
}
