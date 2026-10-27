import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { TOWER_FLOORS, towerOpenFloors, type MythMatch } from '../core/mythclash/modes';
import { newCollection } from '../core/mythclash/packs';
import { newSeed } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { fillSize, watchViewport } from '../ui/viewport';

/**
 * 企画者のストーリーモードの絵(design/mythclash/tower.png・941x1672(9:16)。2026-10-27 に新しい絵へ差しかえ。前の絵は unused/)。
 * 背景(tower.webp)は絵のまま。部品(tower_parts.webp: 鍵・金色に光った札)を design/mythclash/make_tower.py で作る。
 * 部品の位置は、そのとき出る数字をここに書く
 */
export const MYTH_TOWER_IMAGE = 'myth:tower';
export const MYTH_TOWER_FILE = 'assets/mythclash/tower.webp';
export const MYTH_TOWER_PARTS = 'myth:towerParts';
export const MYTH_TOWER_PARTS_FILE = 'assets/mythclash/tower_parts.webp';
const ART = { w: 941, h: 1672 };
const PORTRAIT = { w: 720, h: 1280 };
/** 各階の札(絵の座標 x0, y0, x1, y1) */
const PLATES: Record<number, [number, number, number, number]> = {
  10: [375, 420, 575, 505],
  9: [377, 515, 573, 600],
  8: [376, 613, 574, 698],
  7: [375, 712, 575, 798],
  6: [374, 810, 576, 898],
  5: [372, 910, 578, 998],
  4: [370, 1010, 580, 1100],
  3: [368, 1112, 582, 1200],
  2: [366, 1212, 584, 1302],
  1: [364, 1312, 586, 1405],
};
/** 部品の場所(tower_parts.webp の中。x, y, w, h。make_tower.py の出す数字) */
const FRAMES: Record<string, [number, number, number, number]> = {
  lock: [0, 0, 61, 66],
  lit1: [63, 0, 222, 93],
  lit2: [287, 0, 218, 90],
  lit3: [507, 0, 214, 88],
  lit4: [723, 0, 210, 90],
  lit5: [935, 0, 206, 88],
  lit6: [1143, 0, 202, 88],
  lit7: [1347, 0, 200, 86],
  lit8: [1549, 0, 198, 85],
  lit9: [1749, 0, 196, 85],
};
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

/** タワーの1回の挑戦の番号(報酬を2回もらわないように) */
export const newTowerRun = (floor: number): string => `myth:tower:${floor}:${Date.now().toString(36)}:${newSeed().toString(36)}`;

/**
 * ストーリーモードの階えらび(企画者の絵 2026-10-27)。
 * - 1階〜(クリアした階の次)まで さわれる。クリアした階もまた遊べる。さわると階の画面(MythFloorScene)
 * - 行ける階は札が金色に光る(元の札の色を金色にした部品)。まだ行けない階は鍵(前の絵の鍵)。10階は絵の赤い札のまま
 * - クリアした階には「CLEAR」、次に挑戦する階は光がゆれる
 * - 画面いっぱいに出す(タイトルと同じ。はしが少し切れることがある。左右は背景だけなので、たいてい左右が少し切れる)
 * - 新しい絵には「戻る」が無いので、左下にプログラムで描いたボタンを出す(企画者「良い」2026-10-27)
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
    this.k = Math.max(size.w / ART.w, size.h / ART.h);
    // 左右が切れるときは、左の説明の枠(絵の x=52 から)が切れないように、左は少しだけ切る
    const cutX = ART.w * this.k - size.w;
    this.ox = -Math.min(cutX / 2, 40 * this.k);
    // 画面いっぱい(企画者 2026-10-27「画面いっぱいでいい」)
    this.oy = (size.h - ART.h * this.k) / 2;
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    this.leaving = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    watchViewport(this, () => !this.leaving && this.scene.restart());
    const { k, ox, oy } = this;
    const parts = this.textures.get(MYTH_TOWER_PARTS);
    for (const [name, [x, y, w, h]] of Object.entries(FRAMES)) if (!parts.has(name)) parts.add(name, 0, x, y, w, h);
    this.add.image(ox, oy, MYTH_TOWER_IMAGE).setOrigin(0, 0).setScale(k);

    const cleared = (loadLife().mythclash ?? newCollection()).towerCleared ?? 0;
    const open = towerOpenFloors(cleared);
    for (let f = 1; f <= TOWER_FLOORS; f++) this.floor(f, f <= cleared, f <= open, f === open && f > cleared);

    this.backButton();
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
    // 札の見た目: 絵の札は全部暗いので、行ける階(1〜9階)は金色の札を重ねる。10階は絵の赤い札のまま
    if (open && f <= 9) this.add.image(cx, cy, MYTH_TOWER_PARTS, `lit${f}`).setScale(k);
    if (!open) {
      // 鍵(札の右の方)。10階は赤い札のまま少し暗く
      if (f === 10) this.add.rectangle(cx, cy, w * 0.92, h * 0.8, 0x000000, 0.3);
      this.add.image(ox + (x0 + (x1 - x0) * 0.83) * k, cy, MYTH_TOWER_PARTS, 'lock').setScale(k * 0.72);
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

  /** 戻る(左下。絵の札と同じ 黒・赤・金の色) */
  private backButton(): void {
    const u = Math.min(this.W, this.H * (ART.w / ART.h)) / ART.w;
    const bw = 300 * u;
    const bh = 96 * u;
    const x = 24 * u + bw / 2;
    const y = this.H - 28 * u - bh / 2;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const cut = 18 * u;
    // 六角形の札(左右がとがる)。sx・sy で内側の線用に縮める
    const shape = (sx = 1, sy = 1, dx = 0, dy = 0) =>
      [
        [-bw / 2 + cut, -bh / 2],
        [bw / 2 - cut, -bh / 2],
        [bw / 2, 0],
        [bw / 2 - cut, bh / 2],
        [-bw / 2 + cut, bh / 2],
        [-bw / 2, 0],
      ].map(([px, py]) => new Phaser.Math.Vector2(px * sx + dx, py * sy + dy));
    g.fillStyle(0x000000, 0.5).fillPoints(shape(1, 1, 4 * u, 6 * u), true);
    g.fillGradientStyle(0x6a1018, 0x6a1018, 0x2a0408, 0x2a0408, 1).fillPoints(shape(), true);
    g.lineStyle(4 * u, 0xd8a64a, 1).strokePoints(shape(), true);
    g.lineStyle(1.5 * u, 0xffe6a0, 0.7).strokePoints(shape(0.9, 0.78), true);
    c.add(g);
    c.add(this.add.text(0, 0, '‹　戻る', { fontFamily: SERIF, fontSize: `${Math.round(44 * u)}px`, fontStyle: '900', color: '#fff4dc', stroke: '#2a0408', strokeThickness: 4 * u }).setOrigin(0.5));
    const hit = this.add.zone(0, 0, bw, bh).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 0.94, duration: 70, yoyo: true });
      this.back();
    });
  }

  private start(floor: number): void {
    const match: MythMatch = { mode: 'tower', floor, battle: 0, runId: newTowerRun(floor) };
    this.go('MythFloor', { match }, 'tap');
  }

  private back(): void {
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
