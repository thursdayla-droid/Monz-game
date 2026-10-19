import * as Phaser from 'phaser';
import { assetUrl, embeddedJson } from '../assetUrl';
import type { BunkBrain } from '../core/bunkBehavior';
import { breathPose, fistPose, jabAmount, type BunkFace, type BunkMotion, type BunkPoseName, type FistMotion } from '../core/bunkPose';
import { mulberry32, range } from '../core/rng';
import motionJson from './bunkMotion.json';

/**
 * 【仮】元画像から切り出したBUNKのパーツで組み立てて動かす(テスト実装)。
 * パーツは tools/split_parts.py、表情の顔は tools/build_bunk_faces.py が書き出す。
 * 座標の単位は元画像px。2つの姿(構え・腕を下ろした)は、元画像と同じ位置・大きさにそろえてある。
 */
export const BUNK_MOTION = motionJson as unknown as BunkMotion;
export const TEST_PERSONALITY = motionJson.testPersonality;
export const POSES: BunkPoseName[] = ['guard', 'down'];

interface PartsManifest {
  width: number;
  height: number;
  parts: Record<string, { x: number; y: number; w: number; h: number; z: number; filledPx: number }>;
}
interface FacesManifest {
  faces: Record<BunkFace, { x: number; y: number; w: number; h: number }>;
}

const manifestKey = (pose: BunkPoseName) => `bunk:${pose}:manifest`;
const FACES_KEY = 'bunk:faces:manifest';
const partKey = (pose: BunkPoseName, name: string) => `bunk:${pose}:${name}`;
const fillKey = (pose: BunkPoseName, name: string) => `bunk:${pose}:fill:${name}`;
const faceKey = (name: BunkFace) => `bunk:face:${name}`;
export const cutoutKey = (pose: BunkPoseName) => `bunk:cutout:${pose}`;

/** 読み込み。マニフェストを読んでから、パーツ・補った場所・表情の画像を読む */
export function loadBunk(load: Phaser.Loader.LoaderPlugin): void {
  const json = (key: string, path: string, then: (data: never) => void) => {
    const embedded = embeddedJson(path);
    if (embedded) {
      load.scene.cache.json.add(key, embedded);
      then(embedded as never);
      return;
    }
    load.json(key, path);
    load.once(`filecomplete-json-${key}`, (_k: string, _t: string, data: never) => then(data));
  };
  for (const pose of POSES) {
    const dir = BUNK_MOTION.poses[pose].dir;
    load.image(cutoutKey(pose), assetUrl(BUNK_MOTION.poses[pose].cutout));
    json(manifestKey(pose), `${dir}/parts.json`, (data: PartsManifest) => {
      for (const [name, p] of Object.entries(data.parts)) {
        load.image(partKey(pose, name), assetUrl(`${dir}/${name}.png`));
        if (p.filledPx > 0) load.image(fillKey(pose, name), assetUrl(`${dir}/fill/${name}.png`));
      }
    });
  }
  json(FACES_KEY, `${BUNK_MOTION.faces.dir}/faces.json`, () => {
    for (const name of BUNK_MOTION.faces.names) load.image(faceKey(name), assetUrl(`${BUNK_MOTION.faces.dir}/${name}.png`));
  });
}

type Item = { name: string; objs: Phaser.GameObjects.Image[]; fist?: FistMotion; fistY?: number; jab?: boolean };

interface PoseView {
  root: Phaser.GameObjects.Container;
  groups: Phaser.GameObjects.Container[];
  items: Item[];
  face: Phaser.GameObjects.Image;
  cutout: Phaser.GameObjects.Image;
}

export class BunkView extends Phaser.GameObjects.Container {
  private readonly actor: Phaser.GameObjects.Container;
  private readonly views = {} as Record<BunkPoseName, PoseView>;
  private readonly faces: FacesManifest;
  private readonly rng = mulberry32(20261019);
  private nextBlink = 1.5;
  private blinkUntil = -1;
  /** true: 元画像と同じ姿で止める(呼吸なども止める) */
  still = true;
  showOriginal = false;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number) {
    super(scene, x, y);
    this.faces = scene.cache.json.get(FACES_KEY) as FacesManifest;
    this.actor = scene.add.container(0, 0);
    this.add(this.actor);
    for (const pose of POSES) this.views[pose] = this.build(scene, pose);
    this.setScale(scale);
    this.setSize(1100, 1150);
    this.setInteractive(new Phaser.Geom.Rectangle(-550, -1150, 1100, 1150), Phaser.Geom.Rectangle.Contains);
    scene.add.existing(this);
  }

  /** 1つの姿を組み立てる。呼吸で一緒に動くパーツは、呼吸の中心を原点にした入れ物に入れる。
   *  足など動かさないパーツは入れ物の外に置く(重なり順は z のまま保つ)。表情の顔は z=faces.z に入れる。 */
  private build(scene: Phaser.Scene, pose: BunkPoseName): PoseView {
    const m = BUNK_MOTION;
    const pm = m.poses[pose];
    const manifest = scene.cache.json.get(manifestKey(pose)) as PartsManifest;
    const [ax, ay] = m.anchor;
    const [bx, by] = m.breath.pivot;
    const root = scene.add.container(-ax, -ay);
    this.actor.add(root);
    const groups: Phaser.GameObjects.Container[] = [];
    const items: Item[] = [];
    const face = scene.add.image(0, 0, faceKey('closed')).setOrigin(0, 0).setVisible(false);
    let group: Phaser.GameObjects.Container | null = null;
    const entries: { z: number; name: string }[] = Object.entries(manifest.parts).map(([name, p]) => ({ name, z: p.z }));
    entries.push({ name: '#face', z: m.faces.z });
    entries.sort((a, b) => a.z - b.z);
    for (const { name } of entries) {
      const still = pm.still.includes(name);
      let objs: Phaser.GameObjects.Image[];
      let item: Item | null = null;
      if (name === '#face') {
        objs = [face];
      } else {
        const p = manifest.parts[name];
        const img = scene.add.image(0, 0, partKey(pose, name));
        objs = [img];
        if (p.filledPx > 0) objs.push(scene.add.image(0, 0, fillKey(pose, name)).setTint(0xff00c8).setAlpha(0.65).setVisible(false));
        const fist = pm.fists[name];
        const anchor: [number, number] = fist ? fist.pivot : [p.x, p.y];
        for (const o of objs) {
          if (still) o.setOrigin(0, 0).setPosition(p.x, p.y);
          else o.setOrigin((anchor[0] - p.x) / p.w, (anchor[1] - p.y) / p.h).setPosition(anchor[0] - bx, anchor[1] - by);
        }
        item = { name, objs, fist, fistY: fist ? fist.pivot[1] - by : undefined, jab: pm.jab?.part === name };
        items.push(item);
      }
      if (still) {
        root.add(objs);
        group = null;
      } else {
        if (!group) {
          group = scene.add.container(bx, by);
          groups.push(group);
          root.add(group);
        }
        group.add(objs);
      }
    }
    const cutout = scene.add.image(0, 0, cutoutKey(pose)).setOrigin(0, 0).setVisible(false);
    root.add(cutout);
    return { root, groups, items, face, cutout };
  }

  setShowFill(show: boolean): void {
    for (const pose of POSES) for (const it of this.views[pose].items) for (const o of it.objs.slice(1)) o.setVisible(show);
  }

  /** brain の状態と時刻 t(秒) から姿を決める */
  render(brain: BunkBrain, t: number): void {
    const m = BUNK_MOTION;
    const b = m.behavior;
    const still = this.still;
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    const walking = brain.activity === 'walk' && !brain.switching && !brain.reaction;

    // まばたき(ふつうの顔のときだけ、目を閉じた顔を一瞬出す)
    if (t >= this.nextBlink) {
      this.blinkUntil = t + m.blink.duration;
      this.nextBlink = t + range(this.rng, m.blink.minInterval, m.blink.maxInterval);
    }
    let face = brain.face();
    if (!face && !still && t < this.blinkUntil && !brain.switching) face = 'closed';
    if (still) face = brain.face();

    const br = still ? { scaleX: 1, scaleY: 1 } : sleeping ? breathPose(m, t, b.sleepBreathScale, b.sleepBreathPeriod) : breathPose(m, t);
    const hopPhase = (t * Math.PI) / b.hopPeriod;
    const swing = walking ? Math.sin(hopPhase) * b.walkSwing : 0;

    for (const pose of POSES) {
      const v = this.views[pose];
      const shown = pose === brain.pose;
      v.root.setVisible(shown);
      if (!shown) continue;
      for (const g of v.groups) g.setScale(br.scaleX, br.scaleY);
      for (const it of v.items) {
        if (!it.fist) continue;
        const f = still ? { angleRad: 0, bob: 0 } : fistPose(it.fist, t, (it.fist.pivot[0] < m.anchor[0] ? 1 : -1) * swing);
        const jab = it.jab && brain.jab !== null && !still ? jabAmount(brain.jab) : 0;
        const pj = m.poses[pose].jab;
        for (const o of it.objs) {
          o.setRotation(f.angleRad)
            .setPosition(it.fist.pivot[0] - m.breath.pivot[0] + (pj?.dx ?? 0) * jab, (it.fistY ?? 0) + f.bob + (pj?.dy ?? 0) * jab)
            .setScale(1 + (pj?.scale ?? 0) * jab);
        }
      }
      if (face) {
        const fm = this.faces.faces[face];
        v.face.setTexture(faceKey(face)).setPosition(fm.x - m.breath.pivot[0], fm.y - m.breath.pivot[1]).setVisible(true);
      } else {
        v.face.setVisible(false);
      }
      v.cutout.setVisible(this.showOriginal);
      for (const g of v.groups) g.setVisible(!this.showOriginal);
      for (const it of v.items) if (!v.groups.some((g) => g.exists(it.objs[0]))) it.objs[0].setVisible(!this.showOriginal);
    }

    // 体ぜんたいの動き(足元を中心に)
    let y = 0;
    let x = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (!still) {
      rot = Math.sin((t * Math.PI * 2) / b.idleTiltPeriod) * b.idleTilt;
      if (walking) {
        y -= Math.abs(Math.sin(hopPhase)) * b.hopHeight;
        rot = Math.sin(hopPhase) * b.walkTilt;
      }
      if (sleeping) {
        y += b.sleepSink;
        rot = 0;
      }
      if (brain.switching) {
        const s = Math.sin(Math.PI * brain.switching.k) * b.switchSquash;
        sy = 1 - s;
        sx = 1 + s / 2;
      }
      const r = brain.reaction;
      if (r) {
        const fade = Math.max(0, 1 - r.age / b.reactTime);
        if (r.kind === 'happy') y -= Math.abs(Math.sin(r.age * 9)) * b.happyHop * fade;
        if (r.kind === 'angry') x += Math.sin(r.age * 60) * b.angryShake * fade;
        if (r.kind === 'surprised') y -= Math.max(0, Math.sin(Math.min(r.age * 7, Math.PI))) * b.happyHop * 1.4;
      }
    }
    this.actor.setPosition(x, y).setRotation((rot * Math.PI) / 180).setScale(sx, sy);
  }
}
