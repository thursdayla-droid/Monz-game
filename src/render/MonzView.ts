import * as Phaser from 'phaser';
import type { Dna } from '../core/dna';
import { chooseIdleAction, reactToPet, type Emotion, type IdleAction } from '../core/reaction';
import { mulberry32, range, type Rng } from '../core/rng';
import { BODY_SOCKETS, HEAD_SOCKETS, LEG_LENGTH, PIVOTS, TEXTURE_SCALE, type PartName } from './bunkRig';
import { monzKey } from './monzTextures';
import { playVoice } from './voice';

type Vec = readonly [number, number];

const EXPRESSIONS: Record<Emotion | 'sleeping', { eyes: 'smug' | 'half' | 'shut'; mouth: PartName; mouthScale: number }> = {
  neutral: { eyes: 'smug', mouth: 'mouth_smirk', mouthScale: 1 },
  happy: { eyes: 'shut', mouth: 'mouth_grin', mouthScale: 1 },
  angry: { eyes: 'smug', mouth: 'mouth_angry', mouthScale: 1 },
  sleepy: { eyes: 'half', mouth: 'mouth_smirk', mouthScale: 0.9 },
  surprised: { eyes: 'half', mouth: 'mouth_open', mouthScale: 1 },
  sleeping: { eyes: 'shut', mouth: 'mouth_open', mouthScale: 0.55 },
};

/** ばね(二次モーション用) */
class Spring {
  value = 0;
  vel = 0;
  constructor(private k: number, private damp: number) {}
  step(target: number, dt: number): number {
    this.vel += (target - this.value) * this.k * dt;
    this.vel *= Math.exp(-this.damp * dt);
    this.value += this.vel * dt;
    return this.value;
  }
}

/**
 * 1体のMONZの見た目と動き。DNAからパーツを組み立て、毎フレーム手続き的に動かす。
 * 座標の単位は元絵px。全体の大きさは displayScale で決まる。
 */
export class MonzView extends Phaser.GameObjects.Container {
  readonly dna: Dna;
  private readonly rng: Rng;
  private readonly displayScale: number;
  private readonly bodyGroup: Phaser.GameObjects.Container;
  private readonly bodyImg: Phaser.GameObjects.Image;
  private readonly head?: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Container;
  private readonly eyeL: Phaser.GameObjects.Image;
  private readonly eyeR: Phaser.GameObjects.Image;
  private readonly mouth: Phaser.GameObjects.Image;
  private readonly armL: Phaser.GameObjects.Image;
  private readonly armR: Phaser.GameObjects.Image;
  private readonly legL?: Phaser.GameObjects.Image;
  private readonly legR?: Phaser.GameObjects.Image;
  private readonly toppers: { img: Phaser.GameObjects.Image; socket: Vec; base: number }[] = [];
  private readonly zText: Phaser.GameObjects.Text;

  private t = 0;
  private dir: 1 | -1 = -1;
  private walkPhase = 0;
  private action: IdleAction = 'idle';
  private actionTimer = 0;
  private emotion: Emotion = 'neutral';
  private emotionTimer = 0;
  private emotionAge = 0;
  private blinkTimer = 1;
  private blinkLeft = 0;
  private energy: number;
  private readonly armSpring = new Spring(60, 6);
  private readonly topSpring = new Spring(90, 5);
  private prevBob = 0;
  private minX: number;
  private maxX: number;

  constructor(scene: Phaser.Scene, x: number, y: number, dna: Dna, displayScale: number, minX: number, maxX: number) {
    super(scene, x, y);
    this.dna = dna;
    this.displayScale = displayScale;
    this.minX = minX;
    this.maxX = maxX;
    this.rng = mulberry32(dna.seed ^ 0x9e3779b9);
    this.energy = range(this.rng, 50, 100);
    this.blinkTimer = range(this.rng, 0.5, 3);
    this.actionTimer = range(this.rng, 0.5, 2);
    const a = dna.appearance;

    const img = (part: PartName, flip = false) => {
      const im = scene.add.image(0, 0, monzKey(dna), part);
      const [px, py] = PIVOTS[part];
      const w = im.width / TEXTURE_SCALE;
      const h = im.height / TEXTURE_SCALE;
      im.setOrigin(flip ? 1 - px / w : px / w, py / h);
      im.setFlipX(flip);
      return im;
    };

    if (a.legs) {
      this.legL = img('leg_l');
      this.legR = img('leg_r');
      this.add([this.legL, this.legR]);
    }

    this.bodyGroup = scene.add.container(0, 0);
    this.add(this.bodyGroup);

    if (a.layout === 'headOnBody') {
      this.head = img('head');
      this.bodyGroup.add(this.head);
    } else {
      if (a.topper === 'horns' || a.topper === 'both') {
        const hl = img('horn_l', true);
        const hr = img('horn_l');
        this.toppers.push({ img: hl, socket: BODY_SOCKETS.hornL, base: -0.35 }, { img: hr, socket: BODY_SOCKETS.hornR, base: 0.35 });
      }
      if (a.topper === 'spike' || a.topper === 'both') {
        this.toppers.push({ img: img('spike'), socket: BODY_SOCKETS.top, base: 0 });
      }
      this.bodyGroup.add(this.toppers.map((t) => t.img));
    }

    this.bodyImg = img('body');
    this.bodyGroup.add(this.bodyImg);

    this.face = scene.add.container(0, 0);
    this.eyeL = img('eyes_smug_l');
    this.eyeR = img('eyes_smug_r');
    this.mouth = img('mouth_smirk');
    this.face.add([this.mouth, this.eyeL, this.eyeR]);
    this.bodyGroup.add(this.face);

    this.armL = img('arm_l');
    this.armR = img('arm_r');
    this.bodyGroup.add([this.armL, this.armR]);

    this.zText = scene.add
      .text(0, 0, 'z', { fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setVisible(false);

    const hit = new Phaser.Geom.Rectangle(-420, -820, 840, 840);
    this.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    this.setScale(displayScale);
    this.applyExpression();
    this.layout(1);
    scene.add.existing(this);
  }

  setBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = maxX;
  }

  /** なでられた(タップされた) */
  pet(): Emotion {
    let e: Emotion;
    if (this.action === 'sleep') {
      this.action = 'idle';
      this.actionTimer = range(this.rng, 1, 2);
      e = this.rng() < 0.5 ? 'surprised' : 'angry';
    } else {
      e = reactToPet(this.dna.personality, this.rng);
    }
    this.setEmotion(e, 1.8);
    playVoice(this.dna.voicePitch, e);
    return e;
  }

  setEmotion(e: Emotion, seconds: number): void {
    this.emotion = e;
    this.emotionTimer = seconds;
    this.emotionAge = 0;
    this.applyExpression();
  }

  private applyExpression(): void {
    const key = this.action === 'sleep' && this.emotion === 'neutral' ? 'sleeping' : this.emotion;
    const ex = EXPRESSIONS[key];
    this.eyeL.setFrame(`eyes_${ex.eyes}_l`);
    this.eyeR.setFrame(`eyes_${ex.eyes}_r`);
    this.mouth.setFrame(ex.mouth);
    for (const [im, part] of [
      [this.eyeL, `eyes_${ex.eyes}_l`],
      [this.eyeR, `eyes_${ex.eyes}_r`],
      [this.mouth, ex.mouth],
    ] as const) {
      const [px, py] = PIVOTS[part as PartName];
      im.setOrigin(px / (im.width / TEXTURE_SCALE), py / (im.height / TEXTURE_SCALE));
    }
    this.mouthExtra = ex.mouthScale;
  }
  private mouthExtra = 1;

  private chooseAction(): void {
    this.action = chooseIdleAction(this.dna.personality, this.energy, this.rng);
    if (this.action === 'walk') {
      this.actionTimer = range(this.rng, 1.5, 4.5);
      if (this.rng() < 0.5) this.dir = this.dir === 1 ? -1 : 1;
    } else if (this.action === 'sleep') {
      this.actionTimer = range(this.rng, 5, 10);
    } else {
      this.actionTimer = range(this.rng, 1.5, 4);
    }
    if (this.emotion === 'neutral' || this.emotion === 'sleepy') {
      this.emotion = this.energy < 35 && this.action !== 'sleep' ? 'sleepy' : 'neutral';
    }
    this.applyExpression();
  }

  /** 毎フレーム呼ぶ。dt は秒。 */
  tick(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const p = this.dna.personality;

    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.chooseAction();
    if (this.emotionTimer > 0) {
      this.emotionTimer -= dt;
      this.emotionAge += dt;
      if (this.emotionTimer <= 0) {
        this.emotion = 'neutral';
        this.applyExpression();
      }
    }

    const sleeping = this.action === 'sleep' && this.emotionTimer <= 0;
    const walking = this.action === 'walk' && this.emotionTimer <= 0;
    this.energy = Math.min(100, Math.max(0, this.energy + dt * (sleeping ? 8 : walking ? -3 : -0.5)));

    // 呼吸
    const breathPeriod = sleeping ? 4 : 2.2 + p.focus / 60;
    const breath = Math.sin((this.t * Math.PI * 2) / breathPeriod) * (sleeping ? 0.035 : 0.02);

    // 歩く
    let bob = 0;
    let tilt = 0;
    let swing = 0;
    if (walking) {
      const speed = 70 + p.curiosity * 0.9 + p.bravery * 0.4; // 元絵px/秒ではなく画面px/秒
      const stepRate = 5 + p.curiosity / 40;
      this.walkPhase += dt * stepRate;
      this.x += this.dir * speed * dt;
      if (this.x < this.minX) {
        this.x = this.minX;
        this.dir = 1;
      } else if (this.x > this.maxX) {
        this.x = this.maxX;
        this.dir = -1;
      }
      const s = Math.sin(this.walkPhase);
      bob = Math.abs(s) * (this.dna.appearance.legs ? 18 : 34);
      tilt = s * 0.07;
      swing = s;
    } else {
      this.walkPhase = 0;
    }

    // 感情の身振り
    let shakeX = 0;
    if (this.emotionTimer > 0) {
      if (this.emotion === 'happy') bob += Math.abs(Math.sin(this.emotionAge * 11)) * 45;
      if (this.emotion === 'angry') shakeX = Math.sin(this.emotionAge * 60) * 10;
      if (this.emotion === 'surprised') bob += Math.max(0, Math.sin(Math.min(this.emotionAge * 7, Math.PI))) * 70;
    }

    // まばたき(目を開けている表情のときだけ)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkLeft = 0.13;
      this.blinkTimer = range(this.rng, 1.5, 5);
    }
    this.blinkLeft = Math.max(0, this.blinkLeft - dt);

    const bobVel = (bob - this.prevBob) / Math.max(dt, 1e-3);
    this.prevBob = bob;
    const armAngle = this.armSpring.step(swing * 0.2 + (this.emotion === 'angry' && this.emotionTimer > 0 ? -0.25 : 0), dt);
    const topAngle = this.topSpring.step(Math.max(-0.4, Math.min(0.4, bobVel * 0.0012)), dt);

    this.layout(1 + breath, { bob, tilt, shakeX, swing, armAngle, topAngle, sleeping });

    // 向き(元絵は左向き)
    this.scaleX = this.displayScale * (this.dir < 0 ? 1 : -1);

    // 寝ているときのZ
    this.zText.setVisible(sleeping);
    if (sleeping) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(this.x + 30 + k * 30, this.y - 230 * this.displayScale - k * 50);
      this.zText.setAlpha(1 - k);
      this.zText.setScale(0.7 + k * 0.6);
    }
  }

  private layout(
    breathe: number,
    m: { bob: number; tilt: number; shakeX: number; swing: number; armAngle: number; topAngle: number; sleeping: boolean } = {
      bob: 0, tilt: 0, shakeX: 0, swing: 0, armAngle: 0, topAngle: 0, sleeping: false,
    },
  ): void {
    const a = this.dna.appearance;
    const ts = 1 / TEXTURE_SCALE;
    const bsx = a.bodyScaleX * (2 - breathe * 0.5 - 0.5);
    const bsy = a.bodyScaleY * breathe;
    const at = (s: Vec): [number, number] => [s[0] * bsx, s[1] * bsy];
    const bobPx = m.bob / this.displayScale / 3;

    // 足と胴体の高さ
    let lift = 0;
    if (this.legL && this.legR) {
      const legLen = LEG_LENGTH * a.legScale;
      lift = legLen - 95 * a.bodyScaleY;
      const legSwing = m.swing * 0.35;
      this.legL.setPosition(BODY_SOCKETS.hipL[0] * a.bodyScaleX, -legLen - bobPx * 0.3).setScale(ts * a.legScale).setRotation(legSwing);
      this.legR.setPosition(BODY_SOCKETS.hipR[0] * a.bodyScaleX, -legLen - bobPx * 0.3).setScale(ts * a.legScale).setRotation(-legSwing);
    }
    // 寝ているときは少し沈む
    const sink = m.sleeping ? 20 : 0;
    this.bodyGroup.setPosition(m.shakeX, -lift - bobPx + sink).setRotation(m.tilt);
    this.bodyImg.setScale(ts * bsx, ts * bsy);

    // 頭と顔
    const faceScale = a.eyeScale;
    let eyeL: Vec, eyeR: Vec, mouth: Vec;
    let faceOrigin: [number, number];
    let faceRot = 0;
    let faceSize = 1;
    if (this.head) {
      const neck = at(BODY_SOCKETS.neck);
      const nod = m.sleeping ? 0.12 : Math.sin(this.t * 1.3) * 0.03;
      this.head.setPosition(neck[0], neck[1]).setScale(ts * a.headScale).setRotation(nod);
      faceOrigin = neck;
      faceRot = nod;
      faceSize = a.headScale;
      eyeL = HEAD_SOCKETS.eyeL;
      eyeR = HEAD_SOCKETS.eyeR;
      mouth = HEAD_SOCKETS.mouth;
    } else {
      faceOrigin = [0, a.faceOffsetY * bsy];
      eyeL = at(BODY_SOCKETS.eyeL);
      eyeR = at(BODY_SOCKETS.eyeR);
      mouth = at(BODY_SOCKETS.mouth);
      for (const tp of this.toppers) {
        const [x, y] = at(tp.socket);
        tp.img.setPosition(x, y).setScale(ts).setRotation(tp.base + m.topAngle);
      }
    }
    this.face.setPosition(faceOrigin[0], faceOrigin[1]).setRotation(faceRot).setScale(faceSize);
    const gap = a.eyeGap;
    const centerX = (eyeL[0] + eyeR[0]) / 2;
    const blink = this.blinkLeft > 0 ? 0.12 : 1;
    this.eyeL.setPosition(centerX + (eyeL[0] - centerX) * gap, eyeL[1]).setScale(ts * faceScale, ts * faceScale * blink);
    this.eyeR.setPosition(centerX + (eyeR[0] - centerX) * gap, eyeR[1]).setScale(ts * faceScale, ts * faceScale * blink);
    this.mouth.setPosition(mouth[0], mouth[1]).setScale(ts * a.mouthScale * this.mouthExtra);

    // 腕
    const spread = (a.armSpread * Math.PI) / 180;
    const sl = at(BODY_SOCKETS.shoulderL);
    const sr = at(BODY_SOCKETS.shoulderR);
    const droop = m.sleeping ? -0.15 : 0;
    this.armL.setPosition(sl[0], sl[1]).setScale(ts * a.armScale).setRotation(spread + m.armAngle + droop);
    this.armR.setPosition(sr[0], sr[1]).setScale(ts * a.armScale).setRotation(-spread + m.armAngle - droop);
  }

  destroy(fromScene?: boolean): void {
    this.zText.destroy();
    super.destroy(fromScene);
  }
}
