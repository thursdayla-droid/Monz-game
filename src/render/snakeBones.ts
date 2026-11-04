import * as THREE from 'three';

/**
 * へびの骨を動かす(2026-11-04 SNEK・SNEKER・SNEKXUS。企画者「腕0本・脚0本」「地面を滑るように」「胴体を左右にくねらせる」「尻尾は少し遅れて」)。
 * SNEK たちは 体を立てた 形(下は とぐろ)なので、とぐろを くずさないよう:
 * - 首(立っている所): 左右に S字に くねる・曲がる方へ 頭が先に向く・やられると のけぞる
 * - とぐろ・しっぽ(地面の近く): 少しだけ おくれて ゆれる
 * - 体ぜんたいの 左右の ゆれ(yaw・roll)は MonsterRig が体ごと回す
 * 骨は 名前ではなく 場所で 見つける(いちばん高い先の骨 = 頭)。どれも 小さく回すだけ【仮】
 */
interface Joint {
  bone: THREE.Bone;
  bind: THREE.Quaternion;
  parentQ: THREE.Quaternion;
}

const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_X = new THREE.Vector3(1, 0, 0);
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const q3 = new THREE.Quaternion();

export interface SnakeState {
  speed: number;
  air: boolean;
  dodge: boolean;
  hurt: boolean;
  down: boolean;
  turn: number;
}

export class SnakeBones {
  private neck: Joint[] = [];
  private coil: Joint[] = [];
  private phase = 0;
  private sm = { walk: 0, run: 0, turn: 0, hurt: 0, down: 0, air: 0 };
  /** 体ぜんたいの 左右の向きの ゆれ・かたむき(MonsterRig が使う) */
  yaw = 0;
  roll = 0;

  constructor(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const bones: THREE.Bone[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    if (bones.length < 4) return;
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const invQ = new THREE.Quaternion();
    model.getWorldQuaternion(invQ).invert();
    const pos = new Map<THREE.Bone, THREE.Vector3>();
    for (const b of bones) pos.set(b, b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
    const ys = bones.map((b) => pos.get(b)!.y);
    const minY = Math.min(...ys);
    const H = Math.max(1e-6, Math.max(...ys) - minY);
    const isBone = (o: THREE.Object3D | null): o is THREE.Bone => !!o && (o as THREE.Bone).isBone;
    const leaves = bones.filter((b) => !b.children.some(isBone));
    const pathTo = (b: THREE.Bone) => {
      const out: THREE.Bone[] = [];
      let p: THREE.Object3D | null = b;
      while (isBone(p)) {
        out.unshift(p);
        p = p.parent;
      }
      return out;
    };
    const joint = (b: THREE.Bone): Joint => {
      const pq = new THREE.Quaternion();
      if (b.parent) b.parent.getWorldQuaternion(pq);
      return { bone: b, bind: b.quaternion.clone(), parentQ: invQ.clone().multiply(pq) };
    };
    const low = (b: THREE.Bone) => pos.get(b)!.y - minY < H * 0.22;
    // 頭: いちばん高い 先の骨。そこまでの道の 立っている所 = 首(頭の先の 小さな骨は 動かさない)
    const headLeaf = leaves.reduce((a, l) => (pos.get(l)!.y > pos.get(a)!.y ? l : a), leaves[0]);
    const path = pathTo(headLeaf);
    const neckBones = path.filter((b) => !low(b)).slice(0, -1);
    // 首の骨が 多すぎる時は 6つまで(なるべく 等しく えらぶ)
    const pick = (arr: THREE.Bone[], n: number) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]));
    this.neck = pick(neckBones, 6).map(joint);
    // とぐろ・しっぽ: 頭への道の 低い所 と、いちばん長い 低い枝
    const onPath = new Set(path);
    const lowPath = path.filter((b) => low(b) && b.parent && isBone(b.parent));
    let bestBranch: THREE.Bone[] = [];
    for (const l of leaves.filter((x) => !onPath.has(x) && low(x))) {
      const br = pathTo(l).filter((b) => !onPath.has(b));
      if (br.length > bestBranch.length) bestBranch = br;
    }
    this.coil = pick([...lowPath, ...bestBranch], 10).map(joint);
  }

  get ok(): boolean {
    return this.neck.length >= 1;
  }

  private rot(j: Joint, yaw: number, pitch: number, roll = 0): void {
    q1.setFromAxisAngle(AX_Y, yaw).multiply(q2.setFromAxisAngle(AX_Z, pitch)).multiply(q3.setFromAxisAngle(AX_X, roll));
    j.bone.quaternion.copy(j.parentQ).invert().multiply(q1).multiply(j.parentQ).multiply(j.bind);
  }

  update(t: number, dt: number, s: SnakeState): void {
    const sm = this.sm;
    const k = Math.min(1, dt * 8);
    sm.walk += (Math.min(1, s.speed / 3) - sm.walk) * k;
    sm.run += (Math.max(0, Math.min(1, (s.speed - 4.5) / 2)) - sm.run) * k;
    sm.turn += (Math.max(-1, Math.min(1, s.turn / 4)) - sm.turn) * k;
    sm.hurt += ((s.hurt ? 1 : 0) - sm.hurt) * Math.min(1, dt * 14);
    sm.down += ((s.down ? 1 : 0) - sm.down) * Math.min(1, dt * 6);
    sm.air += ((s.air ? 1 : 0) - sm.air) * Math.min(1, dt * 12);
    // くねる速さ: 進む速さに 合わせる(速いほど 細かく)
    this.phase += dt * Math.PI * 2 * (0.25 + s.speed / (1.7 - sm.run * 0.4));
    const n = this.neck.length;
    // 首: S字に くねる(下と上で 逆向き)。曲がる時は 頭が 先に向く。待機は ゆっくり ゆらゆら
    const sway = 0.05 + 0.1 * sm.walk + 0.04 * sm.run;
    this.neck.forEach((j, i) => {
      const u = n > 1 ? i / (n - 1) : 1;
      const wave = Math.sin(this.phase - i * 1.1) * sway * (i % 2 ? -1 : 1) * 0.6 + Math.sin(t * 1.1 + i) * 0.02 * (1 - sm.walk);
      const yaw = wave + sm.turn * 0.18 * (0.4 + u);
      // 前へ 進むほど 首を 少し前へ・やられると のけぞる・たおれると 下へ
      const pitch = -sm.run * 0.06 + sm.hurt * 0.14 - sm.down * 0.2 + Math.sin(t * 1.6) * 0.015 + sm.air * 0.05;
      this.rot(j, yaw, pitch, wave * 0.3);
    });
    // とぐろ・しっぽ: 首より おくれて 少しだけ ゆれる(先ほど 大きく)
    const m = this.coil.length;
    this.coil.forEach((j, i) => {
      const u = m > 1 ? i / (m - 1) : 1;
      const yaw = Math.sin(this.phase - 1.6 - i * 0.7) * (0.02 + 0.05 * sm.walk) * (0.4 + u) - sm.turn * 0.06 * u + Math.sin(t * 0.9 + i) * 0.01;
      this.rot(j, yaw, 0);
    });
    // 体ぜんたい: 進む時に 左右へ くねる(すべるように)・よける時は 大きく かたむく
    this.yaw = Math.sin(this.phase) * (0.16 * sm.walk + 0.06 * sm.run);
    this.roll = Math.sin(this.phase + 0.6) * 0.05 * sm.walk;
  }
}
