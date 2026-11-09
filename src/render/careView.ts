import * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';
import type { BunkBrain } from '../core/bunkBehavior';
import info from './careImages.json';

/**
 * BUNK・MOFU 以外の MONZ の お世話画面の 姿(2026-11-08 企画者「渡してある お世話用の 画像を 使って」)。
 * 企画者の お世話用の 絵(design/species/<種族>/care_main_*.png)を 1枚の まま 出し、体ぜんたいで 動かす
 * (息・歩く 時の ぴょこぴょこ・寝る・うれしい/おこる)。パーツに 分けて 動かすのは あとで【仮】。絵は 描き直さない。
 */
export const CARE_SPECIES = ['zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz', 'crownie'] as const;
const SIZE = info as Record<string, { w: number; h: number }>;
export const careKey = (sp: string) => `care:${sp}`;
export const careFaceKey = (sp: string) => `care:${sp}:face`;
// 進化した 姿(<種族>_f2 / _f3。2026-11-09)も お世話用の 絵
export const hasCareImage = (sp: string): boolean => (CARE_SPECIES as readonly string[]).includes(sp) || /_f[23]$/.test(sp);
export const careFiles = (sp: string): { key: string; url: string }[] =>
  hasCareImage(sp) ? [{ key: careKey(sp), url: `assets/care/${sp}.webp` }, { key: careFaceKey(sp), url: `assets/care/${sp}_face.webp` }] : [];

/** BUNK の 絵(高さ 約1150)と 同じ 大きさに 見えるように */
const BODY_H = 1150;

const M = {
  breath: { period: 3.2, scaleY: 0.025, scaleX: 0.012 },
  walk: { hopPeriod: 0.4, hopHeight: 30, tilt: 4 },
  idleTilt: { period: 5, deg: 1.5 },
  react: { time: 0.9, hop: 70, shake: 10 },
  sleep: { sink: 12, squash: 0.06 },
};

export class CareView extends Phaser.GameObjects.Container {
  private readonly actor: Phaser.GameObjects.Container;
  private readonly img: Phaser.GameObjects.Image;
  private readonly zz: Phaser.GameObjects.Text;
  still = true;
  mirrored = false;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number, species: string) {
    super(scene, x, y);
    this.actor = scene.add.container(0, 0);
    this.add(this.actor);
    const s = SIZE[species] ?? { w: 640, h: 760 };
    const k = BODY_H / s.h;
    // 足もと(絵の 下の まん中)が 立っている 所
    this.img = scene.add.image(0, 0, careKey(species)).setOrigin(0.5, 1).setScale(k);
    this.actor.add(this.img);
    this.zz = scene.add.text(s.w * k * 0.3, -BODY_H * 0.95, 'Zz', { fontFamily: 'sans-serif', fontSize: '110px', fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 14 }).setVisible(false);
    this.add(this.zz);
    this.setScale(scale);
    const w = s.w * k;
    this.setSize(w, BODY_H);
    this.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -BODY_H, w, BODY_H), Phaser.Geom.Rectangle.Contains);
    scene.add.existing(this);
  }

  render(brain: BunkBrain, t: number): void {
    const still = this.still;
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    const walking = brain.activity === 'walk' && !brain.switching && !brain.reaction;
    let x = 0;
    let y = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (!still) {
      const b = Math.sin((t * Math.PI * 2) / (sleeping ? M.breath.period * 1.5 : M.breath.period));
      sx = 1 - M.breath.scaleX * b;
      sy = 1 + M.breath.scaleY * b;
      rot = Math.sin((t * Math.PI * 2) / M.idleTilt.period) * M.idleTilt.deg;
      if (walking) {
        const ph = (t * Math.PI) / M.walk.hopPeriod;
        y -= Math.abs(Math.sin(ph)) * M.walk.hopHeight;
        rot = Math.sin(ph) * M.walk.tilt;
      }
      if (sleeping) {
        y += M.sleep.sink;
        sy *= 1 - M.sleep.squash;
        sx *= 1 + M.sleep.squash / 2;
        rot = 0;
      }
      if (brain.switching) {
        const s = Math.sin(Math.PI * brain.switching.k) * 0.06;
        sy *= 1 - s;
        sx *= 1 + s / 2;
      }
      const r = brain.reaction;
      if (r) {
        const fade = Math.max(0, 1 - r.age / M.react.time);
        if (r.kind === 'happy') y -= Math.abs(Math.sin(r.age * 9)) * M.react.hop * fade;
        if (r.kind === 'angry') x += Math.sin(r.age * 60) * M.react.shake * fade;
        if (r.kind === 'surprised') y -= Math.max(0, Math.sin(Math.min(r.age * 7, Math.PI))) * M.react.hop * 1.4;
      }
    }
    // 眠っている 時は Zz
    this.zz.setVisible(!still && sleeping).setAlpha(0.6 + Math.sin(t * 2) * 0.3);
    this.actor.setPosition(x, y).setRotation((rot * Math.PI) / 180).setScale(this.mirrored ? -sx : sx, sy);
  }
}

/** 読みこみ(まだの物だけ) */
export function loadCare(load: Phaser.Loader.LoaderPlugin, sp: string): number {
  let n = 0;
  for (const f of careFiles(sp)) {
    if (load.scene.textures.exists(f.key)) continue;
    load.image(f.key, assetUrl(f.url));
    n++;
  }
  return n;
}
