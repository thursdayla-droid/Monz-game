import * as THREE from 'three';

/**
 * 「生き物用」の骨(Tripo の4本足・触角などの骨。名前が tripo::Head_0 や bone_12 など)のモデルを動かす(2026-11-03 MOFU)。
 * 人の形の骨(bunkBones.ts)とちがい、骨の名前で腕・足が分からないので、骨の場所で分ける:
 * - 上へのびる長いつながり(触角など): ゆらゆら。歩くと大きく
 * - 下の短いつながり(足・小さな触手): 歩くと 左右交互に小さくふる
 * 形がくずれないように、どれも小さく回すだけ【仮】
 */
interface Driven {
  bone: THREE.Bone;
  bind: THREE.Quaternion;
  /** 何番目のつながりか・つながりの中の何番目か */
  chain: number;
  depth: number;
  kind: 'antenna' | 'leg';
  side: number;
}

const tmpQ = new THREE.Quaternion();
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

export class CreatureBones {
  private driven: Driven[] = [];

  constructor(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const bones: THREE.Bone[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    if (bones.length < 4) return;
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const local = (b: THREE.Bone) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const ys = bones.map((b) => local(b).y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const h = Math.max(1e-6, maxY - minY);
    // 根もと(いちばん上の骨)の すぐ下の骨から、つながりを たどる
    const root = bones.find((b) => !(b.parent as THREE.Bone)?.isBone) ?? bones[0];
    let chain = 0;
    for (const start of root.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[]) {
      const list: THREE.Bone[] = [];
      let b: THREE.Bone | undefined = start;
      while (b) {
        list.push(b);
        b = b.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
      }
      const top = Math.max(...list.map((x) => (local(x).y - minY) / h));
      const bottom = (local(start).y - minY) / h;
      const p = local(start);
      // 上へ長くのびる(2つ以上・上のほうまで) = 触角。下のほう = 足
      const kind: Driven['kind'] | null = list.length >= 3 && top > 0.8 ? 'antenna' : bottom < 0.55 ? 'leg' : null;
      if (kind) {
        list.forEach((bone, depth) => this.driven.push({ bone, bind: bone.quaternion.clone(), chain, depth, kind, side: Math.sign(p.z) || 1 }));
        chain++;
      }
    }
  }

  get ok(): boolean {
    return this.driven.length > 0;
  }

  /** walk: 歩く強さ(0〜1)・sleep: 眠っている */
  update(t: number, walk: number, sleep: boolean, attacking: boolean): void {
    for (const d of this.driven) {
      d.bone.quaternion.copy(d.bind);
      if (d.kind === 'antenna') {
        // 先へいくほど少しずつ遅れて ゆれる(ぷるん)
        const amp = (sleep ? 0.03 : 0.06 + 0.07 * walk + (attacking ? 0.06 : 0)) * (1 + d.depth * 0.25);
        const ph = t * (2.6 + walk * 3) - d.depth * 0.5 + d.chain * 1.7;
        tmpQ.setFromAxisAngle(AX_X, Math.sin(ph) * amp);
        d.bone.quaternion.multiply(tmpQ);
        tmpQ.setFromAxisAngle(AX_Z, Math.cos(ph * 0.8) * amp * 0.6);
        d.bone.quaternion.multiply(tmpQ);
      } else {
        // 足: 歩くと左右交互にふる。止まっている時は ほとんど動かない
        const amp = 0.22 * walk + 0.02;
        const ph = t * 12 + (d.side > 0 ? 0 : Math.PI) + d.chain * 0.9;
        tmpQ.setFromAxisAngle(AX_Z, Math.sin(ph) * amp);
        d.bone.quaternion.multiply(tmpQ);
      }
    }
  }
}
