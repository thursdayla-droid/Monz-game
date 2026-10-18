import * as Phaser from 'phaser';
import { createDistinctDna, type Dna, type Personality } from '../core/dna';
import { randomSeed } from '../core/rng';
import { DEBUG, debugSet } from '../debug';
import { MonzView } from '../render/MonzView';
import { createMonzTextures, destroyMonzTextures } from '../render/monzTextures';
import { unlockAudio } from '../render/voice';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
const COLS = 2;
const ROWS = 3;
const CELL_W = 340;
const CELL_H = 320;
const TOP = 150;
const MONZ_SCALE = 0.22;

const TRAIT_LABELS: Record<keyof Personality, string> = {
  bravery: '勇敢',
  caution: '慎重',
  curiosity: '好奇心',
  sociability: '社交的',
  clinginess: '甘えん坊',
  competitiveness: '負けず嫌い',
  focus: '集中',
};

const EMOTION_LABELS = { happy: 'うれしい！', angry: 'いやがった！', surprised: 'びっくり！', neutral: '', sleepy: '' } as const;

/** 試作0: ランダムに生まれたMONZを並べて、個体差と動きを確認する画面 */
export class GalleryScene extends Phaser.Scene {
  private monz: MonzView[] = [];
  private labels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Gallery');
  }

  create(): void {
    const { width } = this.scale;
    this.add.text(width / 2, 50, 'MONZ 生成テスト', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(width / 2, 100, '試作0・BUNK系 / タップでなでる', { fontFamily: FONT, fontSize: '22px', color: '#d9c8ff' }).setOrigin(0.5);

    for (let i = 0; i < COLS * ROWS; i++) {
      const { x, y } = this.cellOrigin(i);
      const g = this.add.graphics();
      g.fillStyle(0x2c1a3d, 1).fillRoundedRect(x + 6, y + 6, CELL_W - 12, CELL_H - 12, 22);
      g.fillStyle(0x3d2654, 1).fillRoundedRect(x + 6, y + CELL_H - 110, CELL_W - 12, 104, { tl: 0, tr: 0, bl: 22, br: 22 });
    }

    const btnY = TOP + ROWS * CELL_H + 70;
    const btn = this.add
      .text(width / 2, btnY, '  あたらしく生まれる！  ', { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#1b1024', backgroundColor: '#ffe14d', padding: { x: 18, y: 14 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      unlockAudio();
      this.spawnAll();
    });
    this.input.on('pointerdown', unlockAudio);

    this.spawnAll();
  }

  private cellOrigin(i: number): { x: number; y: number } {
    const left = (this.scale.width - COLS * CELL_W) / 2;
    return { x: left + (i % COLS) * CELL_W, y: TOP + Math.floor(i / COLS) * CELL_H };
  }

  private spawnAll(): void {
    for (const m of this.monz) {
      destroyMonzTextures(this, m.dna);
      m.destroy();
    }
    for (const l of this.labels) l.destroy();
    this.monz = [];
    this.labels = [];

    const born: Dna[] = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const dna = createDistinctDna(
        born.map((d) => d.appearance),
        randomSeed,
        () => crypto.randomUUID(),
      );
      born.push(dna);
      createMonzTextures(this, dna);
      const { x, y } = this.cellOrigin(i);
      const ground = y + CELL_H - 60;
      const view = new MonzView(this, x + CELL_W / 2, ground, dna, MONZ_SCALE, x + 120, x + CELL_W - 120);
      view.on('pointerdown', () => {
        unlockAudio();
        const e = view.pet();
        this.toast(view, EMOTION_LABELS[e]);
        if (DEBUG) debugSet('dna', JSON.stringify(dna, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
      });
      this.monz.push(view);
      const label = this.add
        .text(x + CELL_W / 2, ground + 30, topTraits(dna.personality), { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
        .setOrigin(0.5, 0);
      this.labels.push(label);
    }
  }

  private toast(view: MonzView, text: string): void {
    if (!text) return;
    const t = this.add
      .text(view.x, view.y - 180, text, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number): void {
    for (const m of this.monz) m.tick(delta / 1000);
    if (DEBUG) debugSet('fps', this.game.loop.actualFps.toFixed(0));
  }
}

function topTraits(p: Personality): string {
  return (Object.entries(p) as [keyof Personality, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => TRAIT_LABELS[k])
    .join('・');
}
