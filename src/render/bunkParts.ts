import * as Phaser from 'phaser';
import { blinkScale, breathPose, fistPose, type BunkMotion } from '../core/bunkPose';
import { mulberry32, range } from '../core/rng';
import motionJson from './bunkMotion.json';

/** 元画像から切り出したBUNKのパーツ(tools/split_parts.py が書き出す) */
export const BUNK_PARTS_DIR = 'assets/bunk/parts';
export const BUNK_PARTS_MANIFEST = 'bunkparts:manifest';
export const bunkPartKey = (name: string) => `bunkparts:${name}`;
export const bunkFillKey = (name: string) => `bunkparts:fill:${name}`;

export interface BunkPartsManifest {
  width: number;
  height: number;
  parts: Record<string, { x: number; y: number; w: number; h: number; z: number; filledPx: number }>;
}

export const BUNK_MOTION = motionJson as unknown as BunkMotion;

/** マニフェストを読み込んだら、パーツ画像と補った場所の画像を読み込む */
export function loadBunkParts(load: Phaser.Loader.LoaderPlugin): void {
  load.json(BUNK_PARTS_MANIFEST, `${BUNK_PARTS_DIR}/parts.json`);
  load.once(`filecomplete-json-${BUNK_PARTS_MANIFEST}`, (_key: string, _type: string, data: BunkPartsManifest) => {
    for (const [name, p] of Object.entries(data.parts)) {
      load.image(bunkPartKey(name), `${BUNK_PARTS_DIR}/${name}.png`);
      if (p.filledPx > 0) load.image(bunkFillKey(name), `${BUNK_PARTS_DIR}/fill/${name}.png`);
    }
  });
}

type Item = { name: string; img: Phaser.GameObjects.Image; fill?: Phaser.GameObjects.Image };

/**
 * 【仮】元画像のパーツを、元画像と同じ位置・大きさに重ねて表示する(テスト実装)。
 * 座標の単位は元画像px。動きは呼吸・まばたき・拳の小さな揺れだけ。
 */
export class BunkPartsView extends Phaser.GameObjects.Container {
  private readonly manifest: BunkPartsManifest;
  private readonly groups: Phaser.GameObjects.Container[] = [];
  private readonly items: Item[] = [];
  private readonly rng = mulberry32(20261018);
  private nextBlink = 1.2;
  private blinkAt = -10;
  /** still: 元画像と同じ姿 / moving: 動く / frozen: t 秒目の姿で止める(確認用) */
  mode: 'still' | 'moving' | 'frozen' = 'still';
  t = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number) {
    super(scene, x, y);
    this.manifest = scene.cache.json.get(BUNK_PARTS_MANIFEST) as BunkPartsManifest;
    const m = BUNK_MOTION;
    const [bx, by] = m.breath.pivot;
    const names = Object.keys(this.manifest.parts).sort((a, b) => this.manifest.parts[a].z - this.manifest.parts[b].z);

    // 呼吸で一緒に動くパーツは、呼吸の中心を原点にした入れ物に入れる。
    // 足は動かさないので入れ物の外に置く(重なり順は z のまま保つ)。
    let group: Phaser.GameObjects.Container | null = null;
    for (const name of names) {
      const p = this.manifest.parts[name];
      const still = m.still.includes(name);
      const img = scene.add.image(0, 0, bunkPartKey(name));
      const fill = p.filledPx > 0 ? scene.add.image(0, 0, bunkFillKey(name)).setTint(0xff00c8).setAlpha(0.65).setVisible(false) : undefined;
      for (const im of fill ? [img, fill] : [img]) {
        if (still) im.setOrigin(0, 0).setPosition(p.x, p.y);
        else this.placeLocal(name, im);
      }
      const objs = fill ? [img, fill] : [img];
      if (still) {
        this.add(objs);
        group = null;
      } else {
        if (!group) {
          group = scene.add.container(bx, by);
          this.groups.push(group);
          this.add(group);
        }
        group.add(objs);
      }
      this.items.push({ name, img, fill });
    }
    this.setScale(scale);
    this.applyPose();
    scene.add.existing(this);
  }

  /** 呼吸の入れ物の中での、静止時の位置(パーツごとの回転・伸縮の中心をoriginにする) */
  private placeLocal(name: string, im: Phaser.GameObjects.Image): void {
    const p = this.manifest.parts[name];
    const [bx, by] = BUNK_MOTION.breath.pivot;
    const anchor = this.anchorOf(name);
    im.setOrigin((anchor[0] - p.x) / p.w, (anchor[1] - p.y) / p.h).setPosition(anchor[0] - bx, anchor[1] - by);
  }

  private anchorOf(name: string): [number, number] {
    const p = this.manifest.parts[name];
    const fist = BUNK_MOTION.fists[name];
    if (fist) return fist.pivot;
    if (BUNK_MOTION.eyes.includes(name)) return [p.x + p.w / 2, p.y + p.h / 2];
    return [p.x, p.y];
  }

  setShowFill(show: boolean): void {
    for (const it of this.items) it.fill?.setVisible(show);
  }

  setMoving(moving: boolean): void {
    this.mode = moving ? 'moving' : 'still';
    this.applyPose();
  }

  tick(dt: number): void {
    if (this.mode !== 'moving') return;
    this.t += Math.min(dt, 0.1);
    if (this.t >= this.nextBlink) {
      this.blinkAt = this.t;
      this.nextBlink = this.t + range(this.rng, BUNK_MOTION.blink.minInterval, BUNK_MOTION.blink.maxInterval);
    }
    this.applyPose();
  }

  /** t 秒目の姿にする(確認用)。blinkClosed=true なら目を閉じた瞬間 */
  setTime(t: number, blinkClosed = false): void {
    this.mode = 'frozen';
    this.t = t;
    this.blinkAt = blinkClosed ? t - BUNK_MOTION.blink.duration / 2 : -10;
    this.applyPose();
  }

  applyPose(): void {
    const m = BUNK_MOTION;
    const still = this.mode === 'still';
    const br = still ? { scaleX: 1, scaleY: 1 } : breathPose(m, this.t);
    for (const g of this.groups) g.setScale(br.scaleX, br.scaleY);
    const [, by] = m.breath.pivot;
    for (const { name, img, fill } of this.items) {
      if (m.still.includes(name)) continue;
      const objs = fill ? [img, fill] : [img];
      if (m.fists[name]) {
        const f = still ? { angleRad: 0, bob: 0 } : fistPose(m, name, this.t);
        for (const o of objs) o.setRotation(f.angleRad).setY(m.fists[name].pivot[1] - by + f.bob);
      } else if (m.eyes.includes(name)) {
        const k = still ? 1 : blinkScale(m, this.t, this.blinkAt);
        for (const o of objs) o.setScale(1, k);
      }
    }
  }
}
