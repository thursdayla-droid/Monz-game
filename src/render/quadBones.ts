import * as THREE from 'three';

/**
 * 四つ足の けもの の骨を動かす(2026-11-04 RIOT。企画者「完全な四足歩行」「人間の腕や手のような動きは禁止」)。
 * Tripo の骨は 名前で 足が分からないので、骨の場所で 見つける:
 * - 足: 地面の近くにある 先の骨(足先)から、ほかの足と 分かれる所まで さかのぼった つながり。前(頭の向き = +X)・うしろ、左右は 場所で決める
 * - しっぽ: いちばん うしろの 先の骨の つながり
 * - 頭: いちばん高い 先の骨の つながり(足の つけねより先)
 * 回すのは モデルの中の向き(横の軸・上の軸)。形をくずさないよう、小さく回すだけ【仮】
 */
interface Joint {
  bone: THREE.Bone;
  bind: THREE.Quaternion;
  /** 親の、モデルから見た向き(はじめの形の時) */
  parentQ: THREE.Quaternion;
}

interface Leg {
  root: Joint;
  knee: Joint | null;
  front: boolean;
  left: boolean;
}

const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Quaternion();
const tmp2 = new THREE.Quaternion();

export interface QuadState {
  /** 歩く速さ(m/秒) */
  speed: number;
  /** 空中(ジャンプ・ふっとび) */
  air: boolean;
  /** 上へ向かっている(ジャンプの のぼり) */
  rising: boolean;
  /** よけている・やられた・たおれている・攻撃の ため */
  dodge: boolean;
  hurt: boolean;
  down: boolean;
  /** 向きが変わる速さ(ラジアン/秒。+ = 左回り) */
  turn: number;
}

export class QuadBones {
  private legs: Leg[] = [];
  private tail: Joint[] = [];
  private head: Joint | null = null;
  private phase = 0;
  private landT = 0;
  private wasAir = false;
  /** なめらかに変える値 */
  private sm = { walk: 0, run: 0, air: 0, turn: 0, brace: 0 };

  constructor(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const bones: THREE.Bone[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    if (bones.length < 8) return;
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const invQ = new THREE.Quaternion();
    model.getWorldQuaternion(invQ).invert();
    const pos = new Map<THREE.Bone, THREE.Vector3>();
    for (const b of bones) pos.set(b, b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
    const ys = bones.map((b) => pos.get(b)!.y);
    const minY = Math.min(...ys);
    const H = Math.max(1e-6, Math.max(...ys) - minY);
    const isBone = (o: THREE.Object3D | null): o is THREE.Bone => !!o && (o as THREE.Bone).isBone;
    const kids = (b: THREE.Bone) => b.children.filter(isBone);
    const leaves = bones.filter((b) => kids(b).length === 0);
    // 足先: 地面の近くの 先の骨(同じ所に2本あるものは 1つに)
    const feet: THREE.Bone[] = [];
    // 同じ足の 先の骨が いくつかある時は、横に近いものを 1つにまとめる(いちばん低いもの)
    const flat = (a: THREE.Bone, b: THREE.Bone) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.z - pos.get(b)!.z);
    for (const l of leaves.filter((b) => pos.get(b)!.y - minY < H * 0.14).sort((a, b) => pos.get(a)!.y - pos.get(b)!.y)) if (!feet.some((f) => flat(f, l) < H * 0.2)) feet.push(l);
    // 地面に つく しっぽ などが まざる時は、体の まん中から 左右に いちばん はなれた 4つが 足(しっぽは まん中)
    if (feet.length > 4) {
      feet.sort((a, b) => Math.abs(pos.get(b)!.z) - Math.abs(pos.get(a)!.z));
      feet.length = 4;
    }
    if (feet.length !== 4) return;
    const ancestors = (b: THREE.Bone) => {
      const out: THREE.Bone[] = [];
      let p = b.parent;
      while (isBone(p)) {
        out.push(p);
        p = p.parent;
      }
      return out;
    };
    // ほかの足先の 祖先になっている骨(体の まん中・つけねの まとめ役)
    const hubOf = (foot: THREE.Bone) => {
      const others = feet.filter((f) => f !== foot).flatMap((f) => [f, ...ancestors(f)]);
      return ancestors(foot).find((a) => others.includes(a));
    };
    const joint = (b: THREE.Bone): Joint => {
      const pq = new THREE.Quaternion();
      if (b.parent) b.parent.getWorldQuaternion(pq);
      return { bone: b, bind: b.quaternion.clone(), parentQ: invQ.clone().multiply(pq) };
    };
    const cx = feet.reduce((s, f) => s + pos.get(f)!.x, 0) / 4;
    const legBones = new Set<THREE.Bone>();
    for (const f of feet) {
      const hub = hubOf(f);
      // 足のつながり(つけね → 足先)
      const chain: THREE.Bone[] = [];
      let b: THREE.Bone | null = f;
      while (b && b !== hub) {
        chain.unshift(b);
        b = isBone(b.parent) ? b.parent : null;
      }
      chain.forEach((c) => legBones.add(c));
      if (chain.length < 2) continue;
      const p = pos.get(f)!;
      this.legs.push({ root: joint(chain[0]), knee: chain.length >= 3 ? joint(chain[Math.floor(chain.length / 2)]) : null, front: p.x > cx, left: p.z < 0 });
    }
    if (this.legs.length !== 4 || this.legs.filter((l) => l.front).length !== 2) {
      this.legs = [];
      return;
    }
    const hubs = new Set(feet.flatMap((f) => [f, ...ancestors(f)]));
    // 足以外の 先の骨から、足の つけね(まとめ役)の手前まで
    const branch = (leaf: THREE.Bone) => {
      const chain: THREE.Bone[] = [];
      let b: THREE.Bone | null = leaf;
      while (b && !hubs.has(b)) {
        chain.unshift(b);
        b = isBone(b.parent) ? b.parent : null;
      }
      return chain;
    };
    const rest = leaves.filter((l) => !legBones.has(l) && !feet.includes(l));
    if (rest.length) {
      // しっぽ: いちばん うしろ(-X)
      const tailLeaf = rest.reduce((a, l) => (pos.get(l)!.x < pos.get(a)!.x ? l : a), rest[0]);
      if (pos.get(tailLeaf)!.x < cx) this.tail = branch(tailLeaf).slice(0, 4).map(joint);
      // 頭: いちばん高い
      const headLeaf = rest.reduce((a, l) => (pos.get(l)!.y > pos.get(a)!.y ? l : a), rest[0]);
      const hb = branch(headLeaf);
      if (hb.length && pos.get(headLeaf)!.x > cx - H * 0.1) this.head = joint(hb[0]);
    }
  }

  get ok(): boolean {
    return this.legs.length === 4;
  }

  /** j を モデルの中の軸 axis で angle だけ回す(はじめの形から) */
  private rot(j: Joint, axis: THREE.Vector3, angle: number, extra?: { axis: THREE.Vector3; angle: number }): void {
    tmp.setFromAxisAngle(axis, angle);
    if (extra) tmp.multiply(tmp2.setFromAxisAngle(extra.axis, extra.angle));
    // local = parentQ^-1 * R * parentQ * bind
    j.bone.quaternion.copy(j.parentQ).invert().multiply(tmp).multiply(j.parentQ).multiply(j.bind);
  }

  /** 歩きの はずみ(体を上下させる量。0〜) */
  bob = 0;

  update(t: number, dt: number, s: QuadState): void {
    const k = Math.min(1, dt * 10);
    const sm = this.sm;
    // 走る = 速い時(狼・ライオンのように 前足2本・うしろ足2本で はねる)
    const walk = Math.min(1, s.speed / 3);
    const run = Math.max(0, Math.min(1, (s.speed - 4.5) / 2));
    sm.walk += (walk - sm.walk) * k;
    sm.run += (run - sm.run) * k;
    sm.air += ((s.air ? 1 : 0) - sm.air) * Math.min(1, dt * 14);
    sm.turn += (Math.max(-1, Math.min(1, s.turn / 4)) - sm.turn) * k;
    sm.brace += ((s.hurt || s.dodge ? 1 : 0) - sm.brace) * Math.min(1, dt * 12);
    // 着地: 少しのあいだ ひざを まげる
    if (this.wasAir && !s.air) this.landT = 0.25;
    this.wasAir = s.air;
    this.landT = Math.max(0, this.landT - dt);
    const land = this.landT / 0.25;
    // 足の動き(歩く: ななめの足が いっしょ。走る: 前2本・うしろ2本)
    const stride = 1.25 + sm.run * 0.6;
    this.phase += dt * Math.PI * 2 * (Math.max(0.0, s.speed) / stride);
    const amp = 0.42 * sm.walk * (1 - sm.air) + 0.25 * sm.run;
    for (const l of this.legs) {
      const walkPh = (l.front === l.left ? 0 : Math.PI);
      const runPh = (l.front ? 0 : Math.PI) + (l.left ? 0 : 0.45);
      const ph = this.phase + walkPh * (1 - sm.run) + runPh * sm.run;
      let a = Math.sin(ph) * amp;
      // 空中: 前足は前へ・うしろ足は うしろへ のばす(のぼり)/ たたむ(おり)
      a += sm.air * (l.front ? (s.rising ? 0.55 : 0.25) : s.rising ? -0.55 : -0.2);
      // やられた・よける: 足を ふんばる(前足は前へ・うしろ足は うしろへ)
      a += sm.brace * (l.front ? 0.18 : -0.18);
      // たおれた: 足は 少し前へ(力がぬける)
      if (s.down) a = l.front ? 0.35 : 0.2;
      this.rot(l.root, AX_Z, a);
      if (l.knee) {
        // ひざ: 足を前へ出す時に まげる(前足と うしろ足で 逆)
        const lift = Math.max(0, Math.cos(ph)) * amp * 1.1 + land * 0.35 + sm.air * 0.3;
        this.rot(l.knee, AX_Z, (l.front ? -1 : 1) * lift);
      }
    }
    this.bob = Math.abs(Math.sin(this.phase * 2)) * 0.035 * sm.walk * (1 - sm.air) - land * 0.06;
    // しっぽ: いつも ゆらゆら(歩くと 大きく・曲がる時は 外へ)
    this.tail.forEach((j, i) => {
      const sw = Math.sin(t * (2.2 + sm.walk * 3) - i * 0.6) * (0.18 + sm.walk * 0.15) - sm.turn * 0.3;
      this.rot(j, AX_Y, sw * (1 + i * 0.2), { axis: AX_Z, angle: 0.08 * Math.sin(t * 1.7 - i * 0.5) + sm.run * 0.15 });
    });
    // 頭: 息をするように 少し うなずく・曲がる方を 向く・やられると のけぞる
    if (this.head) {
      const nod = Math.sin(t * 1.6) * 0.04 + (s.hurt ? 0.25 : 0) + (s.down ? 0.1 : 0) - sm.run * 0.08;
      this.rot(this.head, AX_Z, nod, { axis: AX_Y, angle: sm.turn * 0.35 });
    }
  }
}
