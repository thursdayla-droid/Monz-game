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

/**
 * 読み込み。マニフェストを読んでから、パーツ・表情の画像を読む。もう読み込んである物は読まない。
 * withFill: 隠れていた所を補った範囲の画像(パーツ確認画面だけで使う開発用)も読む。
 * 戻り値: 読み込みに入れた数(0 なら全部そろっている)
 */
export function loadBunk(load: Phaser.Loader.LoaderPlugin, withFill = false): number {
  const scene = load.scene;
  let queued = 0;
  const image = (key: string, url: string) => {
    if (scene.textures.exists(key)) return;
    load.image(key, url);
    queued++;
  };
  const json = (key: string, path: string, then: (data: never) => void) => {
    const cached = scene.cache.json.get(key);
    if (cached) {
      then(cached as never);
      return;
    }
    const embedded = embeddedJson(path);
    if (embedded) {
      scene.cache.json.add(key, embedded);
      then(embedded as never);
      return;
    }
    load.json(key, path);
    queued++;
    load.once(`filecomplete-json-${key}`, (_k: string, _t: string, data: never) => then(data));
  };
  for (const pose of POSES) {
    const dir = BUNK_MOTION.poses[pose].dir;
    image(cutoutKey(pose), assetUrl(BUNK_MOTION.poses[pose].cutout));
    json(manifestKey(pose), `${dir}/parts.json`, (data: PartsManifest) => {
      for (const [name, p] of Object.entries(data.parts)) {
        image(partKey(pose, name), assetUrl(`${dir}/${name}.png`));
        if (withFill && p.filledPx > 0) image(fillKey(pose, name), assetUrl(`${dir}/fill/${name}.png`));
      }
    });
  }
  json(FACES_KEY, `${BUNK_MOTION.faces.dir}/faces.json`, () => {
    for (const name of BUNK_MOTION.faces.names) image(faceKey(name), assetUrl(`${BUNK_MOTION.faces.dir}/${name}.png`));
  });
  return queued;
}

type Item = { name: string; objs: Phaser.GameObjects.Image[]; fist?: FistMotion; fistY?: number; jab?: boolean };

interface PoseView {
  root: Phaser.GameObjects.Container;
  groups: Phaser.GameObjects.Container[];
  items: Item[];
  face: Phaser.GameObjects.Image;
  cutout: Phaser.GameObjects.Image;
  /** 左右反転したときに上から重ねる、反転していない元の目(元画像から切り抜き) */
  eyeFix: { img: Phaser.GameObjects.Image; x: number }[];
}

/** 目のまわりを少し広めに切り抜く幅(元画像の px)。反転した目が、はみ出して見えないようにする */
const EYE_MARGIN = 16;
const eyeFixKey = (pose: BunkPoseName, eye: string) => `bunk:eyefix:${pose}:${eye}`;

export class BunkView extends Phaser.GameObjects.Container {
  private readonly actor: Phaser.GameObjects.Container;
  private readonly views = {} as Record<BunkPoseName, PoseView>;
  private readonly faces: FacesManifest;
  private readonly rng = mulberry32(20261019);
  private nextBlink = 1.5;
  private blinkUntil = -1;
  /** true: 元画像と同じ姿で止める(呼吸なども止める) */
  still = true;
  /**
   * true: 左右反転(左を向く)。企画者の指示で、目は反転させない:
   * 顔のまん中の線で体を反転し、その上に元の向きの目(元画像から切り抜き)を重ねる。表情の顔も反転させない。
   */
  mirrored = false;
  /** 顔のまん中の線(元画像の x)。左右の目のまん中 */
  /** 顔のまん中の線(姿ごと。腕を下ろした姿は正面を向いているので、構えた姿と場所がちがう) */
  private faceAxis: Record<BunkPoseName, number> = { guard: 0, down: 0 };
  showOriginal = false;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number) {
    super(scene, x, y);
    this.faces = scene.cache.json.get(FACES_KEY) as FacesManifest;
    this.actor = scene.add.container(0, 0);
    this.add(this.actor);
    for (const pose of POSES) this.views[pose] = this.build(scene, pose);
    this.addEyeFix(scene);
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
        // 補った範囲の画像は、開発用に読み込んだときだけ
        if (p.filledPx > 0 && scene.textures.exists(fillKey(pose, name))) objs.push(scene.add.image(0, 0, fillKey(pose, name)).setTint(0xff00c8).setAlpha(0.65).setVisible(false));
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
    return { root, groups, items, face, cutout, eyeFix: [] };
  }

  /**
   * 反転したときに重ねる「元の向きの目」を用意する。目の場所は構えた姿の目のパーツから決める(腕を下ろした姿も同じ場所)。
   * 元画像(各姿の切り抜き)から目のまわりを楕円にぼかして切り出すだけで、描き直さない。
   */
  private addEyeFix(scene: Phaser.Scene): void {
    const guard = scene.cache.json.get(manifestKey('guard')) as PartsManifest;
    const eyesOf = (mf: PartsManifest) => ['eye_l', 'eye_r'].map((n) => mf.parts[n]).filter(Boolean);
    const [bx, by] = BUNK_MOTION.breath.pivot;
    for (const pose of POSES) {
      // 目の場所は、その姿に目のパーツがあればそれ、なければ構えた姿の目
      const own = scene.cache.json.get(manifestKey(pose)) as PartsManifest | undefined;
      const manifest = own && eyesOf(own).length === 2 ? own : guard;
      const eyes = eyesOf(manifest);
      if (eyes.length < 2) continue;
      this.faceAxis[pose] = eyes.reduce((s, e) => s + e.x + e.w / 2, 0) / eyes.length;
      const v = this.views[pose];
      const src = scene.textures.get(cutoutKey(pose)).getSourceImage() as HTMLImageElement;
      const sx = src.width / manifest.width;
      const sy = src.height / manifest.height;
      const group = v.groups.find((g) => g.exists(v.face));
      if (!group) continue;
      eyes.forEach((e, i) => {
        const x = e.x - EYE_MARGIN;
        const y = e.y - EYE_MARGIN;
        const w = e.w + EYE_MARGIN * 2;
        const h = e.h + EYE_MARGIN * 2;
        const key = eyeFixKey(pose, i ? 'r' : 'l');
        if (!scene.textures.exists(key)) {
          const tex = scene.textures.createCanvas(key, w, h);
          const ctx = tex?.getContext();
          if (!tex || !ctx) return;
          ctx.drawImage(src, x * sx, y * sy, w * sx, h * sy, 0, 0, w, h);
          // ふちをぼかした楕円で切り抜く
          const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          g.addColorStop(0, 'rgba(0,0,0,1)');
          g.addColorStop(0.86, 'rgba(0,0,0,1)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalCompositeOperation = 'destination-in';
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.scale(1, h / w);
          ctx.translate(-w / 2, -w / 2);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, w);
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          tex.refresh();
        }
        const img = scene.add.image(0, y - by, key).setOrigin(0, 0).setVisible(false);
        // 表情の顔のすぐ下(目のパーツより上、グローブより下)に入れる
        group.addAt(img, group.getIndex(v.face));
        v.eyeFix.push({ img, x: x - bx });
      });
    }
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
    // 作り直し中で使わない物(表情の顔・腕を下ろした姿)
    if (m.disabled?.includes('faces')) face = null;
    // 絵がまだない表情は出さない
    if (face && !m.faces.names.includes(face)) face = null;
    let pose: BunkPoseName = m.disabled?.includes('down') && brain.pose === 'down' ? 'guard' : brain.pose;
    // 新しい絵の表情の顔は、腕を下ろした姿(正面)に合わせて作っている(2026-10-21〜)。
    // 構えた姿(少し斜め)のときは、まばたきはしない。反応の顔(怒る・喜ぶなど)は、腕を下ろした姿にして出す
    if (face && m.facesOnlyDown && pose === 'guard') {
      if (face === brain.face()) pose = 'down';
      else face = null;
    }

    const br = still ? { scaleX: 1, scaleY: 1 } : sleeping ? breathPose(m, t, b.sleepBreathScale, b.sleepBreathPeriod) : breathPose(m, t);
    const hopPhase = (t * Math.PI) / b.hopPeriod;
    const swing = walking ? Math.sin(hopPhase) * b.walkSwing : 0;

    for (const p of POSES) {
      const v = this.views[p];
      const shown = p === pose;
      v.root.setVisible(shown);
      if (!shown) continue;
      for (const g of v.groups) g.setScale(br.scaleX, br.scaleY);
      for (const it of v.items) {
        if (!it.fist) continue;
        const f = still ? { angleRad: 0, bob: 0 } : fistPose(it.fist, t, (it.fist.pivot[0] < m.anchor[0] ? 1 : -1) * swing);
        const jab = it.jab && brain.jab !== null && !still ? jabAmount(brain.jab) : 0;
        const pj = m.poses[p].jab;
        for (const o of it.objs) {
          o.setRotation(f.angleRad)
            .setPosition(it.fist.pivot[0] - m.breath.pivot[0] + (pj?.dx ?? 0) * jab, (it.fistY ?? 0) + f.bob + (pj?.dy ?? 0) * jab)
            .setScale(1 + (pj?.scale ?? 0) * jab);
        }
      }
      // 反転しているときは、顔のまん中の線を軸に、目と表情の顔だけもう一度反転して元の向きに戻す
      const axis = this.faceAxis[p] - m.breath.pivot[0];
      const unflipX = (x: number) => (this.mirrored ? 2 * axis - x : x);
      if (face) {
        const fm = this.faces.faces[face];
        v.face
          .setTexture(faceKey(face))
          .setPosition(unflipX(fm.x - m.breath.pivot[0]), fm.y - m.breath.pivot[1])
          .setScale(this.mirrored ? -1 : 1, 1)
          .setVisible(true);
      } else {
        v.face.setVisible(false);
      }
      for (const e of v.eyeFix) e.img.setVisible(this.mirrored && !this.showOriginal).setPosition(unflipX(e.x), e.img.y).setScale(-1, 1);
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
    // 反転は顔のまん中の線を軸にする(足元の中心とは少しずれている)
    const flipShift = this.mirrored ? 2 * (this.faceAxis[pose] - m.anchor[0]) : 0;
    this.actor.setPosition(x + flipShift, y).setRotation((rot * Math.PI) / 180).setScale(this.mirrored ? -sx : sx, sy);
  }
}
