import * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';
import type { BunkBrain } from '../core/bunkBehavior';
import { mulberry32, range } from '../core/rng';
import manifest from './mofuParts.json';

/**
 * MOFU のお世話画面の姿(2026-11-03 企画者「BUNKと同じにする」)。
 * 企画者の絵(design/species/mofu/care_main_v2_2026-11-03.png。2026-11-03 に差しかえ)を、tools/split_mofu.py でパーツに分けて動かす。絵は描き直さない。
 * - 体: 息をする(ふくらむ)
 * - 触角(左右): ゆらゆら。歩くと大きく
 * - しっぽ: ふりふり
 * - まばたき: まぶた(紫)を下へのばして目をおおう。眠っている時は閉じたまま
 * 表情・姿の絵は、企画者が作ったら足す(今は無い)。座標は元の絵の px(1266x1242)。【仮】動きの数字
 */
export const MOFU_PARTS = manifest as { width: number; height: number; parts: Record<string, { x: number; y: number; w: number; h: number; z: number; pivot?: number[] }> };
export const mofuPartKey = (name: string) => `mofu:part:${name}`;
/** 顔のまわりだけの小さい絵(お世話画面の左上の顔に使う。元の絵の (320,330) から 620x620 を 240x240 に) */
export const MOFU_CUTOUT_KEY = 'mofu:face';
export const MOFU_CUTOUT_FILE = 'assets/mofu/mofu_face.webp';

/** 読み込む絵 */
export const mofuFiles = (): { key: string; url: string }[] => [
  ...Object.keys(MOFU_PARTS.parts).map((n) => ({ key: mofuPartKey(n), url: `assets/mofu/parts/${n}.webp` })),
  { key: MOFU_CUTOUT_KEY, url: MOFU_CUTOUT_FILE },
];

/** 動きの数字【仮】 */
const M = {
  /** 足もと(元の絵の px)。BUNK と同じく、ここが立っている所 */
  anchor: [633, 1218],
  breath: { period: 3.2, scaleY: 0.022, scaleX: 0.01, pivot: [633, 1180] },
  antenna: { idle: 4, walk: 9, period: 2.2 },
  tail: { idle: 8, walk: 16, period: 1.4 },
  blink: { min: 2.2, max: 5, duration: 0.14, close: 1.95 },
  walk: { hopPeriod: 0.42, hopHeight: 28, tilt: 3 },
  idleTilt: { period: 5, deg: 1.2 },
  react: { time: 0.9, happyHop: 60, angryShake: 10 },
  sleepSink: 10,
};

export class MofuView extends Phaser.GameObjects.Container {
  private readonly actor: Phaser.GameObjects.Container;
  private readonly breathGroup: Phaser.GameObjects.Container;
  private readonly imgs: Record<string, Phaser.GameObjects.Image> = {};
  private readonly rng = mulberry32(20261103);
  private nextBlink = 1.5;
  private blinkUntil = -1;
  still = true;
  mirrored = false;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number) {
    super(scene, x, y);
    this.actor = scene.add.container(0, 0);
    this.add(this.actor);
    const [ax, ay] = M.anchor;
    const [bx, by] = M.breath.pivot;
    const root = scene.add.container(-ax, -ay);
    this.actor.add(root);
    this.breathGroup = scene.add.container(bx, by);
    root.add(this.breathGroup);
    const names = Object.keys(MOFU_PARTS.parts).sort((a, b) => MOFU_PARTS.parts[a].z - MOFU_PARTS.parts[b].z);
    for (const name of names) {
      const p = MOFU_PARTS.parts[name];
      const [px, py] = p.pivot ?? [p.x, p.y];
      const img = scene.add.image(px - bx, py - by, mofuPartKey(name)).setOrigin((px - p.x) / p.w, (py - p.y) / p.h);
      this.breathGroup.add(img);
      this.imgs[name] = img;
    }
    this.setScale(scale);
    this.setSize(1100, 1150);
    this.setInteractive(new Phaser.Geom.Rectangle(-550, -1150, 1100, 1150), Phaser.Geom.Rectangle.Contains);
    scene.add.existing(this);
  }

  render(brain: BunkBrain, t: number): void {
    const still = this.still;
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    const walking = brain.activity === 'walk' && !brain.switching && !brain.reaction;
    // まばたき・眠っている時は目を閉じる
    if (t >= this.nextBlink) {
      this.blinkUntil = t + M.blink.duration;
      this.nextBlink = t + range(this.rng, M.blink.min, M.blink.max);
    }
    const closed = !still && (sleeping || t < this.blinkUntil || brain.face() === 'closed');
    for (const n of ['lid_l', 'lid_r']) this.imgs[n]?.setScale(1, closed ? M.blink.close : 1);
    // 息・触角・しっぽ
    const breathK = still ? 0 : Math.sin((t * Math.PI * 2) / (sleeping ? M.breath.period * 1.5 : M.breath.period));
    this.breathGroup.setScale(1 - M.breath.scaleX * breathK, 1 + M.breath.scaleY * breathK);
    const ant = still ? 0 : (walking ? M.antenna.walk : sleeping ? M.antenna.idle * 0.4 : M.antenna.idle) * Math.sin((t * Math.PI * 2) / M.antenna.period);
    this.imgs.antenna_l?.setAngle(ant);
    this.imgs.antenna_r?.setAngle(-ant * 0.9 + (still ? 0 : Math.sin(t * 1.3) * 1.5));
    const tail = still ? 0 : (walking ? M.tail.walk : sleeping ? M.tail.idle * 0.3 : M.tail.idle) * Math.sin((t * Math.PI * 2) / (walking ? M.tail.period * 0.6 : M.tail.period));
    this.imgs.tail?.setAngle(tail);
    // 体ぜんたい(足もとを中心に)
    let x = 0;
    let y = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (!still) {
      rot = Math.sin((t * Math.PI * 2) / M.idleTilt.period) * M.idleTilt.deg;
      if (walking) {
        const ph = (t * Math.PI) / M.walk.hopPeriod;
        y -= Math.abs(Math.sin(ph)) * M.walk.hopHeight;
        rot = Math.sin(ph) * M.walk.tilt;
      }
      if (sleeping) {
        y += M.sleepSink;
        rot = 0;
      }
      if (brain.switching) {
        const s = Math.sin(Math.PI * brain.switching.k) * 0.06;
        sy = 1 - s;
        sx = 1 + s / 2;
      }
      const r = brain.reaction;
      if (r) {
        const fade = Math.max(0, 1 - r.age / M.react.time);
        if (r.kind === 'happy') y -= Math.abs(Math.sin(r.age * 9)) * M.react.happyHop * fade;
        if (r.kind === 'angry') x += Math.sin(r.age * 60) * M.react.angryShake * fade;
        if (r.kind === 'surprised') y -= Math.max(0, Math.sin(Math.min(r.age * 7, Math.PI))) * M.react.happyHop * 1.4;
      }
    }
    this.actor.setPosition(x, y).setRotation((rot * Math.PI) / 180).setScale(this.mirrored ? -sx : sx, sy);
  }
}

/** 読みこみ(まだの物だけ)。入れた数 */
export function loadMofu(load: Phaser.Loader.LoaderPlugin): number {
  let n = 0;
  for (const f of mofuFiles()) {
    if (load.scene.textures.exists(f.key)) continue;
    load.image(f.key, assetUrl(f.url));
    n++;
  }
  return n;
}
