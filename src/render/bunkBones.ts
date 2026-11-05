/**
 * 骨入りの BUNK(企画者が Tripo のオートリグで骨を入れたモデル・2026-11-01)を、Three.js で骨を回して動かす。
 * 企画者の決まり: 形・顔・色・体型を変えない／人間のような歩き方・ロボットのような動きにしない／モデルがゆがまないことを最優先。
 *
 * 骨を調べて分かったこと(design/battle3d/README.md):
 * - 骨は78本(人の形の骨)。右の肩・上の腕の骨が、頭(右の耳のあたり)まで動かしてしまう。左右の骨の位置がそろっていない。
 * - 腕を大きく(0.9ラジアンくらい)動かすと、顔と体がゴムのようにのびて形がくずれる → 腕は小さくしか動かさない(SAFE)。
 * - 足・背中・頭は、小さく動かせば形がくずれない。指の骨はグローブの形をくずすので動かさない。
 *
 * 2026-11-01 企画者「まず待機と移動だけ」→ 待機(ぷるんと呼吸)・移動(短い足で ぴょこぴょこ)。
 * 2026-11-01 右腕の骨を直した(design/battle3d/README.md)あと、企画者「お願いします」→ 腕を使う攻撃: 突進(グローブを突き出す)・連続攻撃(左右交互のパンチ)・弾(両手の間に光をためて撃つ)。
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
  /** 前の腕(待機・移動では動かさない。攻撃だけ) */
  /** 肩(攻撃だけ。肩ごと前へ出す) */
  L_Clavicle: 0.02,
  R_Clavicle: 0.02,
  L_Forearm: 0.5,
  R_Forearm: 0.5,
  L_Thigh: 0.4,
  R_Thigh: 0.4,
  L_Calf: 0.35,
  R_Calf: 0.35,
};
/**
 * 攻撃のときだけの上限(右腕の骨を直したあと、パンチ・フック・体のひねりで顔と体がくずれないことを確かめた角度。2026-11-01)。
 * 腕を真横に 0.9 ラジアンくらい上げると、肩の骨が胴体を広く動かして のびるので、それより小さくする
 */
// 2026-11-02 企画者「全然パンチ出してない」→ パンチを大きく(腕だけでなく、肩・体のひねり・体ごと前へ出る で見せる)。
// BUNKER・BUNKLORD は肩が高く、腕を大きく回すとグローブが顔の前へ上がる・上着がのびるので、モデルごとに大きさ(amp)を下げる
export const SAFE_ATTACK: Record<string, number> = { L_Upperarm: 1.0, R_Upperarm: 1.0, L_Forearm: 0.6, R_Forearm: 0.6, L_Clavicle: 0.3, R_Clavicle: 0.3, Spine01: 0.35, Spine02: 0.3, Head: 0.15 };

/** 攻撃の動きに要るもの(MonsterRig から) */
export interface AttackPose {
  kind: 'rush' | 'combo' | 'shot' | 'slam' | 'shot1' | 'roar';
  /** ため(0〜1)・出している(true)・もどり(0〜1) */
  wind: number;
  active: boolean;
  recover: number;
  /** 連続攻撃: 何発目か・今のパンチの進み(0〜1) */
  n: number;
  punch: number;
}

/** 背中の骨を少しふくらませる(呼吸)上限 */
const SAFE_SCALE = 0.04;

const AX = { front: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(0, 0, 1) };
type AxisName = keyof typeof AX;

interface Driven {
  bone: THREE.Bone;
  bind: THREE.Quaternion;
  bindScale: THREE.Vector3;
  bindPos: THREE.Vector3;
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
  private wAtk = 0;
  /** 攻撃の時は上限を広げる */
  private limit: Record<string, number> = SAFE;
  /** 頭・腕の遅れ(ぷるんとした揺れ) */
  private lag = { head: 0, headV: 0, arm: 0, armV: 0 };

  /** 体ごと前へ出る量(0〜1。MonsterRig が体を前へ動かす) */
  lunge = 0;

  /** amp: 腕の動きの大きさ(モデルごと。肩が高い・上着があるモデルは小さく) */
  constructor(private modelRoot: THREE.Object3D, private amp = 1) {
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
      this.bones.set(name, { bone, bind: bone.quaternion.clone(), bindScale: bone.scale.clone(), bindPos: bone.position.clone(), axis });
    }
  }

  /** 骨がそろっているか(足りないときは、骨を使わずに体全体だけで動かす) */
  get ok(): boolean {
    return this.bones.size === Object.keys(SAFE).length;
  }

  /**
   * 骨を前へ押し出す(漫画のパンチのように、腕がのびてグローブが前へ出る。2026-11-02 企画者「パンチ出してるの分からない」)。
   * amount はモデルの大きさ(高さ 約0.9)での長さ
   */
  private push(name: string, axis: AxisName, amount: number): void {
    const d = this.bones.get(name);
    if (!d) return;
    d.bone.position.addScaledVector(d.axis[axis], amount);
  }

  /** グローブ(手の骨)の場所(世界の座標) */
  glove(side: 1 | -1, out: THREE.Vector3): THREE.Vector3 | null {
    const h = this.modelRoot.getObjectByName(side > 0 ? 'R_Hand' : 'L_Hand');
    return h ? h.getWorldPosition(out) : null;
  }

  /** パンチを出している腕(1 = 右・-1 = 左・0 = なし)と、のびぐあい(光の演出用) */
  punchSide: 0 | 1 | -1 = 0;
  punchExt = 0;

  /** 骨を、入れたときの形にもどしてから、少しずつ回す */
  private rot(name: string, axis: AxisName, angle: number): void {
    const d = this.bones.get(name);
    if (!d) return;
    tmpQ.setFromAxisAngle(d.axis[axis], clamp(angle, this.limit[name] ?? SAFE[name]));
    d.bone.quaternion.premultiply(tmpQ);
  }

  /**
   * 毎フレーム。mode: 待機・移動・そのほか(そのほかの動きは まだ作らない → 骨は休んだ形にもどす)。
   * hop: 歩きの調子(MonsterRig の跳ねる調子と同じ)。speed: 歩く速さ。t: 時間(秒)
   */
  update(mode: 'idle' | 'move' | 'other', hop: number, speed: number, t: number, dt: number, seed = 0, atk: AttackPose | null = null, sideways = 0): void {
    const k = 1 - Math.exp(-dt * 8);
    this.wIdle += ((mode === 'idle' && !atk ? 1 : 0) - this.wIdle) * k;
    this.wMove += ((mode === 'move' && !atk ? 1 : 0) - this.wMove) * k;
    // 攻撃はすばやく入る(もどりはゆっくり)
    this.wAtk += ((atk ? 1 : 0) - this.wAtk) * (1 - Math.exp(-dt * (atk ? 30 : 10)));
    this.limit = this.wAtk > 0.05 ? { ...SAFE, ...SAFE_ATTACK } : SAFE;
    for (const d of this.bones.values()) {
      d.bone.quaternion.copy(d.bind);
      d.bone.scale.copy(d.bindScale);
      d.bone.position.copy(d.bindPos);
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
    // ---- 待機の構え: ずっと立っているだけにしない(2026-11-02 企画者「もう少し体を動かして」)
    // 小さく はずむ(ひざを曲げのばし)・グローブを上げて構える・体を左右にゆらす・ときどきグローブを小さく突き出す(フェイント)
    if (wi > 0.01) {
      const bo = Math.abs(Math.sin(t * 5.5 + seed));
      this.rot('L_Thigh', 'side', 0.12 * bo * wi);
      this.rot('R_Thigh', 'side', 0.12 * bo * wi);
      this.rot('L_Calf', 'side', -0.2 * bo * wi);
      this.rot('R_Calf', 'side', -0.2 * bo * wi);
      const sway = Math.sin(t * 1.7 + seed);
      this.rot('Spine01', 'up', 0.12 * sway * wi);
      this.rot('Spine01', 'front', 0.07 * Math.sin(t * 1.3 + seed) * wi);
      this.rot('Head', 'up', -0.08 * sway * wi);
      // グローブを上げて構える(左右で少しずらして上下)
      this.rot('L_Upperarm', 'side', (0.18 + 0.05 * Math.sin(t * 5.5 + seed)) * wi);
      this.rot('R_Upperarm', 'side', (0.18 + 0.05 * Math.sin(t * 5.5 + seed + 1.5)) * wi);
      this.rot('L_Forearm', 'side', 0.25 * wi);
      this.rot('R_Forearm', 'side', 0.25 * wi);
      // フェイント: 3秒に1回くらい、片方のグローブを小さく前へ
      const ph = (t + seed * 0.7) % 3.1;
      if (ph < 0.35) {
        const k = Math.sin((ph / 0.35) * Math.PI);
        const sideF = Math.floor((t + seed) / 3.1) % 2 ? 'L' : 'R';
        this.rot(`${sideF}_Forearm`, 'side', 0.2 * k * wi);
        this.push(`${sideF}_Forearm`, 'front', 0.05 * k * wi);
      }
    }
    // ---- 移動: 短い足で ぴょこぴょこ(人の歩き方ではなく、左右に体をゆらしながら小走り) ----
    if (wm > 0.01) {
      const s = Math.sin(hop);
      const lift = Math.max(0, s);
      const liftR = Math.max(0, -s);
      const amp = wm * Math.min(1, 0.4 + speed / 6);
      // 足: 前後に小さく、上げるときは ひざを曲げる。横へ歩くときは、足を横へ開いて 一歩ずつ(2026-11-02 企画者「歩いてる感じ」)
      const fw = 1 - Math.min(1, Math.abs(sideways));
      const sw = Math.max(-1, Math.min(1, sideways));
      this.rot('L_Thigh', 'side', s * 0.38 * amp * fw);
      this.rot('R_Thigh', 'side', -s * 0.38 * amp * fw);
      this.rot('L_Thigh', 'front', -lift * 0.32 * amp * sw);
      this.rot('R_Thigh', 'front', -liftR * 0.32 * amp * sw);
      this.rot('L_Calf', 'side', -lift * 0.32 * amp);
      this.rot('R_Calf', 'side', -liftR * 0.32 * amp);
      // 体を左右にゆらす(よちよち)・少し前のめり
      this.rot('Spine01', 'front', s * (0.1 + 0.06 * Math.abs(sw)) * amp);
      this.rot('Spine02', 'side', -0.08 * amp);
      // 腕(グローブ)は足と反対に、小さく前後
      this.rot('L_Upperarm', 'side', -this.lag.arm * amp);
      this.rot('R_Upperarm', 'side', this.lag.arm * amp);
    } else {
      this.rot('L_Upperarm', 'side', this.lag.arm * 0.3);
      this.rot('R_Upperarm', 'side', this.lag.arm * 0.3);
    }
    this.punchExt = 0;
    this.punchSide = 0;
    if (this.wAtk > 0.01) this.attack(atk ?? this.lastAtk, this.wAtk);
    if (atk) this.lastAtk = atk;
  }

  private lastAtk: AttackPose = { kind: 'rush', wind: 0, active: false, recover: 1, n: 0, punch: 0 };

  /**
   * 腕を使う攻撃(model の向き: 前 = +x。腕を前へ = side の軸で +。体をひねる = up の軸で +(右の肩が前))。
   * 人のボクシングのまねではなく、丸い体ごとグローブをぶつける感じにする
   */
  private attack(a: AttackPose, w: number): void {
    const ease = (x: number) => 1 - (1 - x) * (1 - x);
    // パンチ1発(side: どちらの腕か 1 = 右・-1 = 左、p: 0 ため → 1 のばしきり)
    const punch = (side: 1 | -1, p: number) => {
      const ext = p < 0 ? -0.35 * -p : ease(p);
      const up = side > 0 ? 'R_Upperarm' : 'L_Upperarm';
      const fo = side > 0 ? 'R_Forearm' : 'L_Forearm';
      const am = this.amp;
      this.rot(up, 'side', 0.95 * am * ext * w);
      // 腕は下へたれているので、前へ回すと外へ開く → 内へ寄せて、胸の前へ突き出す
      this.rot(up, 'up', side * 0.3 * Math.max(0, ext) * w);
      this.rot(fo, 'side', 0.5 * am * ext * w);
      // 肩ごと前へ
      this.rot(side > 0 ? 'R_Clavicle' : 'L_Clavicle', 'up', side * 0.25 * Math.max(0, ext) * w);
      // 体をひねって肩を前へ
      this.rot('Spine01', 'up', side * 0.32 * ext * w);
      this.rot('Spine02', 'up', side * 0.15 * ext * w);
      this.lunge = Math.max(this.lunge, Math.max(0, ext) * w);
      // 腕ごとグローブを前へ押し出す(骨を回すだけでは、肩が高く腕がたれているため、前に出て見えない)
      const e2 = Math.max(0, ext) * w;
      // 腕を大きく前へ(のびる)。2026-11-02 企画者「全然パンチしない」
      this.push(up, 'front', 0.1 * e2);
      this.push(fo, 'front', 0.24 * e2);
      this.push(side > 0 ? 'R_Clavicle' : 'L_Clavicle', 'front', 0.04 * e2);
      if (e2 > this.punchExt) {
        this.punchExt = e2;
        this.punchSide = side;
      }
      // 反対の腕は少し引く(ガード)
      this.rot(side > 0 ? 'L_Upperarm' : 'R_Upperarm', 'side', -0.15 * ext * w);
    };
    this.lunge = 0;
    this.punchExt = 0;
    this.punchSide = 0;
    if (a.kind === 'rush') {
      // 突進: 体を前にかたむけ、グローブ2つを前に突き出して飛びこむ。ぶつかった(走り終わった)瞬間に、右のストレート
      if (!a.active && a.wind === 0 && a.recover < 0.7) {
        punch(1, a.recover < 0.15 ? a.recover / 0.15 : 1 - ((a.recover - 0.15) / 0.55) * 0.8);
        this.rot('Spine01', 'side', -0.1 * w);
        return;
      }
      const ext = a.active ? 1 : a.wind > 0 ? -0.4 * a.wind : 1 - a.recover;
      this.rot('Spine01', 'side', -0.14 * Math.abs(ext) * w);
      this.rot('Spine02', 'side', -0.12 * Math.abs(ext) * w);
      this.rot('Head', 'side', 0.08 * ext * w);
      for (const s of [1, -1] as const) {
        this.rot(s > 0 ? 'R_Upperarm' : 'L_Upperarm', 'side', 0.65 * ext * w);
        this.rot(s > 0 ? 'R_Forearm' : 'L_Forearm', 'side', 0.25 * Math.max(0, ext) * w);
        this.rot(s > 0 ? 'R_Upperarm' : 'L_Upperarm', 'up', s * 0.3 * Math.max(0, ext) * w);
        this.push(s > 0 ? 'R_Forearm' : 'L_Forearm', 'front', 0.12 * Math.max(0, ext) * w);
      }
      // 足はうしろへ流す
      this.rot('L_Thigh', 'side', -0.3 * Math.max(0, ext) * w);
      this.rot('R_Thigh', 'side', -0.3 * Math.max(0, ext) * w);
    } else if (a.kind === 'combo') {
      // 連続攻撃: 左右交互のパンチ(近づく間は、グローブを上げて構える)
      if (a.n === 0) {
        this.rot('L_Upperarm', 'side', 0.35 * w);
        this.rot('R_Upperarm', 'side', 0.35 * w);
        this.rot('Spine01', 'side', -0.1 * w);
      } else {
        const side = a.n % 2 === 1 ? 1 : -1;
        // すばやくのばし、のばしきりで少し止めて(見えるように)、少しもどす
        const p = a.punch < 0.3 ? a.punch / 0.3 : a.punch < 0.8 ? 1 : 1 - ((a.punch - 0.8) / 0.2) * 0.5;
        punch(side, p);
        this.rot('Spine01', 'side', -0.08 * w);
      }
    } else if (a.kind === 'shot1') {
      // 片手で撃つ(ポンポンショット。2026-11-03 企画者の演出指示「片方のグローブを前に出し」): 右のグローブを前へ突き出して撃つ
      const p = a.active ? 1 : a.wind > 0 ? -0.5 * a.wind : 1 - a.recover;
      punch(1, p);
    } else if (a.kind === 'roar') {
      // ほえる(威圧ロア): ためで大きく息を吸う(胸を反らし、頭を上げ、腕を広げる) → 前へ乗り出して ほえる
      const inhale = a.active || a.recover > 0 ? 0 : a.wind;
      const out = a.active ? 1 : a.recover > 0 ? 1 - a.recover : 0;
      this.rot('Spine01', 'side', (0.18 * inhale - 0.25 * out) * w);
      this.rot('Spine02', 'side', (0.12 * inhale - 0.2 * out) * w);
      this.rot('Head', 'side', (0.12 * inhale - 0.12 * out) * w);
      for (const s of [1, -1] as const) {
        this.rot(s > 0 ? 'R_Upperarm' : 'L_Upperarm', 'front', s * (0.2 * inhale + 0.25 * out) * w);
        this.rot(s > 0 ? 'R_Upperarm' : 'L_Upperarm', 'side', -0.2 * out * w);
      }
      // ほえている間は小さく ふるえる
      if (a.active) this.rot('Spine02', 'up', Math.sin(performance.now() / 22) * 0.04 * w);
    } else if (a.kind === 'slam') {
      // 地面なぐり(火柱。2026-11-02 企画者「自分の下のちゃんと地面を殴って」):
      // ため の前半で右のグローブを高く振り上げ → ため の終わりに 自分の足もとの地面へ一気に振り下ろす → そのまま地面に当てて止める → もどる
      const am = this.amp;
      let raise = 0;
      let down = 0;
      if (!a.active && a.recover === 0) {
        if (a.wind < 0.75) raise = ease(a.wind / 0.75);
        else {
          const d = (a.wind - 0.75) / 0.25;
          raise = 1 - d;
          down = ease(d);
        }
      } else if (a.active) down = 1;
      else down = 1 - ease(a.recover);
      // 振り上げ: 腕を前から上へ・ひじを曲げる・体を少し反らす
      this.rot('R_Upperarm', 'side', (1.0 * raise + 0.35 * down) * am * w);
      this.rot('R_Forearm', 'side', (0.6 * raise - 0.2 * down) * am * w);
      this.rot('R_Clavicle', 'up', 0.2 * raise * w);
      this.rot('Spine01', 'side', (0.15 * raise - 0.35 * down) * w);
      this.rot('Spine02', 'side', (0.08 * raise - 0.3 * down) * w);
      this.rot('Spine01', 'up', (0.2 * raise + 0.25 * down) * w);
      this.rot('Head', 'side', -0.1 * down * w);
      // 振り下ろし: グローブを下へ(足もとの地面まで)押し下げる
      this.push('R_Upperarm', 'up', -0.06 * down * w);
      this.push('R_Forearm', 'up', -0.16 * down * w);
      this.push('R_Forearm', 'front', 0.1 * down * w);
      this.push('R_Clavicle', 'up', -0.03 * down * w);
      // 左手は引いて構える・ひざを曲げて ぐっと沈む
      this.rot('L_Upperarm', 'side', (0.25 * raise - 0.2 * down) * w);
      this.rot('L_Thigh', 'side', 0.3 * down * w);
      this.rot('R_Thigh', 'side', 0.3 * down * w);
      this.rot('L_Calf', 'side', -0.35 * down * w);
      this.rot('R_Calf', 'side', -0.35 * down * w);
      if (down > 0.6) {
        this.punchExt = down * w;
        this.punchSide = 1;
      }
    } else {
      // 弾: 両手を胸の前に寄せて光をため(ため)、前へ押し出して撃つ(反動で少し反る)
      const gather = a.active ? 1 : a.wind > 0 ? a.wind : 1 - a.recover;
      const push = a.active ? 1 : 0;
      for (const s of [1, -1] as const) {
        this.rot(s > 0 ? 'R_Upperarm' : 'L_Upperarm', 'side', (0.45 * gather + 0.12 * push) * w);
        this.rot(s > 0 ? 'R_Upperarm' : 'L_Upperarm', 'up', s * 0.45 * gather * w);
        this.rot(s > 0 ? 'R_Forearm' : 'L_Forearm', 'side', (0.15 * gather + 0.25 * push) * w);
      }
      this.rot('Spine01', 'side', (-0.06 * gather + 0.12 * push) * w);
      this.rot('Head', 'side', -0.05 * gather * w);
    }
  }
}
