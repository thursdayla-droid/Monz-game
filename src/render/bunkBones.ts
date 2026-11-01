/**
 * 骨入りの BUNK(企画者が Tripo のオートリグで骨を入れたモデル・2026-11-01)を、Three.js で骨を回して動かす。
 * 企画者の決まり: 形・顔・色・体型を変えない／人間のような歩き方・ロボットのような動きにしない／モデルがゆがまないことを最優先。
 *
 * 骨を調べて分かったこと(design/battle3d/README.md):
 * - 骨は78本(人の形の骨)。右の肩・上の腕の骨が、頭(右の耳のあたり)まで動かしてしまう。左右の骨の位置がそろっていない。
 * - 腕を大きく(0.9ラジアンくらい)動かすと、顔と体がゴムのようにのびて形がくずれる → 腕は小さくしか動かさない(SAFE)。
 * - 足・背中・頭は、小さく動かせば形がくずれない。指の骨はグローブの形をくずすので動かさない。
 *
 * 2026-11-01 企画者「まず待機と移動だけ」→ 待機(ぷるんと呼吸)・移動(短い足で ぴょこぴょこ)だけ。ほかの動きは、確認のあとで足す。
 * 向き: モデルの前 = +x、上 = +y、左 = -z(ゲームと同じ)。
 */
import * as THREE from 'three';

/** 骨ごとの「ゆがまない」動きの大きさの上限(ラジアン。2026-11-01 にポーズを作って確かめた) */
export const SAFE: Record<string, number> = {
  Spine01: 0.15,
  Spine02: 0.15,
  Head: 0.15,
  L_Upperarm: 0.25,
  R_Upperarm: 0.25,
  L_Thigh: 0.4,
  R_Thigh: 0.4,
  L_Calf: 0.35,
  R_Calf: 0.35,
};
/** 背中の骨を少しふくらませる(呼吸)上限 */
const SAFE_SCALE = 0.04;

const AX = { front: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(0, 0, 1) };
type AxisName = keyof typeof AX;

interface Driven {
  bone: THREE.Bone;
  bind: THREE.Quaternion;
  bindScale: THREE.Vector3;
  /** モデルの向きの軸を、この骨の中の軸に直したもの */
  axis: Record<AxisName, THREE.Vector3>;
}

const tmpQ = new THREE.Quaternion();
const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));

export class BunkBones {
  private bones = new Map<string, Driven>();
  /** 待機・移動の強さ(なめらかに切りかえる) */
  private wIdle = 1;
  private wMove = 0;
  /** 頭・腕の遅れ(ぷるんとした揺れ) */
  private lag = { head: 0, headV: 0, arm: 0, armV: 0 };

  constructor(modelRoot: THREE.Object3D) {
    modelRoot.updateMatrixWorld(true);
    const rootInv = modelRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const name of Object.keys(SAFE)) {
      const bone = modelRoot.getObjectByName(name) as THREE.Bone | undefined;
      if (!bone || !bone.parent) continue;
      // 親の向き(モデルから見た、骨を入れたときの向き)
      const p = rootInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
      const pInv = p.clone().invert();
      const axis = {} as Record<AxisName, THREE.Vector3>;
      for (const k of Object.keys(AX) as AxisName[]) axis[k] = AX[k].clone().applyQuaternion(pInv).normalize();
      this.bones.set(name, { bone, bind: bone.quaternion.clone(), bindScale: bone.scale.clone(), axis });
    }
  }

  /** 骨がそろっているか(足りないときは、骨を使わずに体全体だけで動かす) */
  get ok(): boolean {
    return this.bones.size === Object.keys(SAFE).length;
  }

  /** 骨を、入れたときの形にもどしてから、少しずつ回す */
  private rot(name: string, axis: AxisName, angle: number): void {
    const d = this.bones.get(name);
    if (!d) return;
    tmpQ.setFromAxisAngle(d.axis[axis], clamp(angle, SAFE[name]));
    d.bone.quaternion.premultiply(tmpQ);
  }

  /**
   * 毎フレーム。mode: 待機・移動・そのほか(そのほかの動きは まだ作らない → 骨は休んだ形にもどす)。
   * hop: 歩きの調子(MonsterRig の跳ねる調子と同じ)。speed: 歩く速さ。t: 時間(秒)
   */
  update(mode: 'idle' | 'move' | 'other', hop: number, speed: number, t: number, dt: number, seed = 0): void {
    const k = 1 - Math.exp(-dt * 8);
    this.wIdle += ((mode === 'idle' ? 1 : 0) - this.wIdle) * k;
    this.wMove += ((mode === 'move' ? 1 : 0) - this.wMove) * k;
    for (const d of this.bones.values()) {
      d.bone.quaternion.copy(d.bind);
      d.bone.scale.copy(d.bindScale);
    }
    const wi = this.wIdle;
    const wm = this.wMove;
    // ---- 待機: 呼吸するように、体がぷるんと揺れる ----
    const br = Math.sin(t * 2.6 + seed); // 呼吸(ゆっくり)
    const wob = Math.sin(t * 5.2 + seed * 2); // 小さな揺れ
    // 背中をふくらませる(息を吸う)・少し反る
    const swell = 1 + SAFE_SCALE * wi * (0.5 + 0.5 * br);
    const sp = this.bones.get('Spine02');
    if (sp) sp.bone.scale.set(sp.bindScale.x * swell, sp.bindScale.y * (1 + (swell - 1) * 0.5), sp.bindScale.z * swell);
    this.rot('Spine01', 'side', wi * br * 0.04);
    // 頭と腕は、体より少し遅れてついてくる(ばね)→ ぷるん
    const headT = wi * br * 0.06 + wm * Math.sin(hop * 2) * 0.05;
    this.lag.headV += (headT - this.lag.head) * 120 * dt;
    this.lag.headV *= Math.exp(-dt * 9);
    this.lag.head += this.lag.headV * dt;
    this.rot('Head', 'side', this.lag.head);
    this.rot('Head', 'front', wi * wob * 0.03);
    const armT = wi * br * 0.08 + wm * Math.sin(hop) * 0.2;
    this.lag.armV += (armT - this.lag.arm) * 90 * dt;
    this.lag.armV *= Math.exp(-dt * 7);
    this.lag.arm += this.lag.armV * dt;
    // 腕は小さく(大きく動かすと顔までのびるため)。グローブを少し外へ・前へ
    this.rot('L_Upperarm', 'front', -wi * 0.04 * (0.5 + 0.5 * br));
    this.rot('R_Upperarm', 'front', wi * 0.04 * (0.5 + 0.5 * br));
    // ---- 移動: 短い足で ぴょこぴょこ(人の歩き方ではなく、左右に体をゆらしながら小走り) ----
    if (wm > 0.01) {
      const s = Math.sin(hop);
      const lift = Math.max(0, s);
      const liftR = Math.max(0, -s);
      const amp = wm * Math.min(1, 0.4 + speed / 6);
      // 足: 前後に小さく、上げるときは ひざを曲げる
      this.rot('L_Thigh', 'side', s * 0.38 * amp);
      this.rot('R_Thigh', 'side', -s * 0.38 * amp);
      this.rot('L_Calf', 'side', -lift * 0.32 * amp);
      this.rot('R_Calf', 'side', -liftR * 0.32 * amp);
      // 体を左右にゆらす(よちよち)・少し前のめり
      this.rot('Spine01', 'front', s * 0.1 * amp);
      this.rot('Spine02', 'side', -0.08 * amp);
      // 腕(グローブ)は足と反対に、小さく前後
      this.rot('L_Upperarm', 'side', -this.lag.arm * amp);
      this.rot('R_Upperarm', 'side', this.lag.arm * amp);
    } else {
      this.rot('L_Upperarm', 'side', this.lag.arm * 0.3);
      this.rot('R_Upperarm', 'side', this.lag.arm * 0.3);
    }
  }
}
