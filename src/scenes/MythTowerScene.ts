import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { TOWER_FLOORS, towerOpenFloors, type MythMatch } from '../core/mythclash/modes';
import { newCollection } from '../core/mythclash/packs';
import { newSeed } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { fitArt } from '../ui/artFit';
import { fillSize, watchViewport } from '../ui/viewport';

/**
 * 企画者のストーリーモードの絵(design/mythclash/tower.png・852x1846。2026-10-27)。
 * 3〜9階の鍵マークを消した背景(tower.webp)と、部品(tower_parts.webp: 鍵・金色に光った札・暗い札)を
 * design/mythclash/make_tower.py で作る。部品の位置は、そのとき出る数字をここに書く
 */
export const MYTH_TOWER_IMAGE = 'myth:tower';
export const MYTH_TOWER_FILE = 'assets/mythclash/tower.webp';
export const MYTH_TOWER_PARTS = 'myth:towerParts';
export const MYTH_TOWER_PARTS_FILE = 'assets/mythclash/tower_parts.webp';
const ART = { w: 852, h: 1846 };
const PORTRAIT = { w: 720, h: 1280 };
/** 各階の札(絵の座標 x0, y0, x1, y1) */
const PLATES: Record<number, [number, number, number, number]> = {
  10: [335, 475, 535, 550],
  9: [345, 580, 525, 665],
  8: [342, 695, 528, 780],
  7: [340, 810, 530, 900],
  6: [338, 927, 532, 1018],
  5: [335, 1045, 535, 1135],
  4: [332, 1165, 538, 1258],
  3: [330, 1285, 542, 1380],
  2: [318, 1405, 555, 1505],
  1: [315, 1525, 560, 1635],
};
/** 部品の場所(tower_parts.webp の中。x, y, w, h) */
const FRAMES: Record<string, [number, number, number, number]> = {
  lock: [0, 0, 62, 73],
  lit3: [64, 0, 212, 95],
  lit4: [278, 0, 206, 93],
  lit5: [486, 0, 200, 90],
  lit6: [688, 0, 194, 91],
  lit7: [884, 0, 190, 90],
  lit8: [1076, 0, 186, 85],
  lit9: [1264, 0, 180, 85],
  dim2: [1446, 0, 237, 100],
};
/** 絵の「戻る」 */
const BACK_ZONE = [20, 1700, 258, 1798] as const;
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

/** タワーの1回の挑戦の番号(報酬を2回もらわないように) */
export const newTowerRun = (floor: number): string => `myth:tower:${floor}:${Date.now().toString(36)}:${newSeed().toString(36)}`;

/**
 * ストーリーモードの階えらび(企画者の絵 2026-10-27)。
 * - 1階〜(クリアした階の次)まで さわれる。クリアした階もまた遊べる。さわると階の画面(MythFloorScene)
 * - 行ける階は札が金色に光る(絵の1階・2階と同じ)。まだ行けない階は鍵(絵のとおり)。10階は絵の赤い札のまま
 * - クリアした階には「CLEAR」、次に挑戦する階は光がゆれる
 * - 絵は全部 画面に入れる(企画者 2026-10-27「画面内に収まってない」)。すき間は同じ絵をぼかしてしく
 */
export class MythTowerScene extends Phaser.Scene {
  private leaving = false;
  private W = ART.w;
  private H = ART.h;
  private k = 1;
  private ox = 0;
  private oy = 0;

  constructor() {
    super('MythTower');
  }

  init(): void {
    const size = fillSize(this, ART, { minRatio: 0.4, maxRatio: 0.75 });
    this.W = size.w;
    this.H = size.h;
    this.scale.setGameSize(size.w, size.h);
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    this.leaving = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    watchViewport(this, () => !this.leaving && this.scene.restart());
    const parts = this.textures.get(MYTH_TOWER_PARTS);
    for (const [name, [x, y, w, h]] of Object.entries(FRAMES)) if (!parts.has(name)) parts.add(name, 0, x, y, w, h);
    // 絵は全部 画面に入れる(はしを切らない。企画者 2026-10-27)
    ({ k: this.k, ox: this.ox, oy: this.oy } = fitArt(this, MYTH_TOWER_IMAGE, ART, { w: this.W, h: this.H }));
    const { k, ox, oy } = this;

    const cleared = (loadLife().mythclash ?? newCollection()).towerCleared ?? 0;
    const open = towerOpenFloors(cleared);
    for (let f = 1; f <= TOWER_FLOORS; f++) this.floor(f, f <= cleared, f <= open, f === open && f > cleared);

    // 絵の「戻る」
    const [bx0, by0, bx1, by1] = BACK_ZONE;
    const bz = this.add.rectangle(ox + bx0 * k, oy + by0 * k, (bx1 - bx0) * k, (by1 - by0) * k, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    bz.on('pointerdown', () => this.back(bz));
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('mythclash');
  }

  /** 1つの階の札(done: クリアずみ / open: 行ける / next: 次に挑戦する階) */
  private floor(f: number, done: boolean, open: boolean, next: boolean): void {
    const { k, ox, oy } = this;
    const [x0, y0, x1, y1] = PLATES[f];
    const cx = ox + ((x0 + x1) / 2) * k;
    const cy = oy + ((y0 + y1) / 2) * k;
    const w = (x1 - x0) * k;
    const h = (y1 - y0) * k;
    // 札の見た目: 3〜9階は絵では暗い札なので、行けるなら金色の札を重ねる。2階は絵では金色なので、行けないなら暗い札を重ねる
    if (open && f >= 3 && f <= 9) this.add.image(cx, cy, MYTH_TOWER_PARTS, `lit${f}`).setScale(k);
    if (!open && f === 2) this.add.image(cx, cy, MYTH_TOWER_PARTS, 'dim2').setScale(k);
    if (!open) {
      // 鍵(絵の鍵と同じ所。札の右の方)。10階は赤い札のまま少し暗く
      if (f === 10) this.add.rectangle(cx, cy, w * 0.92, h * 0.8, 0x000000, 0.3);
      this.add.image(ox + (x0 + (x1 - x0) * 0.78) * k, cy, MYTH_TOWER_PARTS, 'lock').setScale(k * 0.78);
      return;
    }
    if (done) {
      this.add
        .text(ox + (x1 - 10) * k, oy + (y1 - 8) * k, 'CLEAR', { fontFamily: SERIF, fontSize: `${Math.round(19 * k)}px`, fontStyle: '900', color: '#ffe9a8', stroke: '#3a1a08', strokeThickness: Math.max(2, 5 * k) })
        .setOrigin(1, 1)
        .setAngle(-8);
    }
    if (next) {
      // 次に挑戦する階: 金色の光がゆれる
      const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      for (let i = 0; i < 4; i++) glow.lineStyle((4 + i * 5) * k, 0xffb040, 0.55 - i * 0.12).strokeRoundedRect(cx - w / 2 - i * 3 * k, cy - h / 2 - i * 3 * k, w + i * 6 * k, h + i * 6 * k, 12 * k);
      this.tweens.add({ targets: glow, alpha: 0.25, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const zone = this.add.rectangle(cx, cy, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      zone.setFillStyle(0xffffff, 0.25);
      this.tweens.add({ targets: zone, fillAlpha: 0, duration: 220 });
      this.start(f);
    });
  }

  private start(floor: number): void {
    const match: MythMatch = { mode: 'tower', floor, battle: 0, runId: newTowerRun(floor) };
    this.go('MythFloor', { match }, 'tap');
  }

  private back(z?: Phaser.GameObjects.Rectangle): void {
    if (z) {
      z.setFillStyle(0xffffff, 0.25);
      this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
    }
    this.go('MythMode', undefined, 'back');
  }

  private go(scene: string, data: object | undefined, se: 'tap' | 'back'): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se(se);
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
