import * as Phaser from 'phaser';
import { BunkBrain } from '../core/bunkBehavior';
import type { BunkFace, BunkPoseName } from '../core/bunkPose';
import { BUNK_MOTION, BunkView, loadBunk, TEST_PERSONALITY } from '../render/bunkView';
import { preloadPacks } from '../render/packs';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
const SCALE = 0.42;
const REACTION_LABELS = { happy: 'うれしい！', angry: 'いやがった！', surprised: 'びっくり！' } as const;

/**
 * 【仮・テスト実装】元画像のパーツで組み立てたBUNKを動かして確かめる画面。
 * BUNKをタップすると反応する。
 * URL: ?parts でこの画面を直接開く / &move 自動で動かす / &state=guard|down|walk|sleep / &face=happy|angry|sad|closed
 *      &t=秒 その瞬間の姿で止める / &jab=0〜1 拳を突き出した途中 / &fill 補った場所 / &original 元画像
 */
export class BunkPartsScene extends Phaser.Scene {
  private view!: BunkView;
  private brain!: BunkBrain;
  private status!: Phaser.GameObjects.Text;
  private zText!: Phaser.GameObjects.Text;
  private t = 0;
  private frozen = false;
  private showFill = false;
  private minX = 0;
  private maxX = 0;

  constructor() {
    super('BunkParts');
  }

  preload(): void {
    // パーツ確認用に、補った範囲の画像も読む(開発用)
    preloadPacks(this, ['bunk']);
    loadBunk(this.load, true);
  }

  create(): void {
    const { width } = this.scale;
    const q = new URLSearchParams(location.search);
    this.add.text(width / 2, 50, 'BUNK 動きのテスト', { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(width / 2, 96, '【テスト】完成ではありません／BUNKをタップすると反応します', { fontFamily: FONT, fontSize: '21px', color: '#d9c8ff' }).setOrigin(0.5);

    const floorY = 690;
    this.add.graphics().fillStyle(0x2c1a3d, 1).fillRoundedRect(16, 130, width - 32, floorY - 130 + 40, 22);
    this.minX = 60 + 560 * SCALE;
    this.maxX = width - 60 - 560 * SCALE;
    this.view = new BunkView(this, width / 2, floorY, SCALE);
    this.brain = new BunkBrain(BUNK_MOTION.behavior, 20261019, TEST_PERSONALITY);
    this.brain.hold = true;
    this.brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    this.zText = this.add.text(0, 0, 'z', { fontFamily: 'Arial Black, sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setVisible(false);

    this.view.on('pointerdown', () => {
      if (this.view.still) this.setMode('manual');
      const r = this.brain.pet();
      this.toast(REACTION_LABELS[r]);
    });

    this.status = this.add.text(width / 2, floorY + 80, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', align: 'center' }).setOrigin(0.5);
    const bx = [width / 2 - 170, width / 2 + 170];
    let by = floorY + 160;
    const row = (a: [string, () => void], b: [string, () => void]) => {
      this.button(bx[0], by, ...a);
      this.button(bx[1], by, ...b);
      by += 88;
    };
    row(['自動で動く／止める', () => this.setMode(this.view.still || this.brain.hold ? 'auto' : 'still')], ['構え ⇄ 腕を下ろす', () => {
      this.setMode('manual');
      this.brain.setPose(this.brain.pose === 'guard' ? 'down' : 'guard');
    }]);
    row(['歩く', () => {
      this.setMode('manual');
      this.brain.start('walk');
    }], ['寝る', () => {
      this.setMode('manual');
      this.brain.start('sleep');
    }]);
    row(['拳を突き出す', () => {
      this.setMode('manual');
      if (this.brain.pose !== 'guard') this.brain.setPose('guard');
      else this.brain.startJab();
    }], ['補った場所を表示', () => {
      this.showFill = !this.showFill;
      this.view.setShowFill(this.showFill);
    }]);
    this.button(bx[0], by, '元画像と見比べる', () => {
      this.view.showOriginal = !this.view.showOriginal;
    });

    // 確認用のURL
    if (q.has('move')) this.setMode('auto');
    const state = q.get('state');
    if (state === 'down' || state === 'guard') {
      this.setMode('manual');
      this.brain.pose = state as BunkPoseName;
    }
    if (state === 'walk' || state === 'sleep') {
      this.setMode('manual');
      this.brain.pose = 'down';
      this.brain.start(state);
    }
    const face = q.get('face') as BunkFace | null;
    if (face) {
      this.setMode('manual');
      this.brain.reaction = { face, kind: face === 'happy' ? 'happy' : face === 'angry' ? 'angry' : 'surprised', left: 999, age: 999 };
    }
    const jab = q.get('jab');
    if (jab !== null) {
      this.setMode('manual');
      this.brain.pose = 'guard';
      this.brain.jab = Number(jab);
    }
    if (q.has('fill')) {
      this.showFill = true;
      this.view.setShowFill(true);
    }
    if (q.has('original')) this.view.showOriginal = true;
    const t = q.get('t');
    if (t !== null) {
      this.setMode('manual');
      this.t = Number(t);
      this.frozen = true;
    }
    this.view.render(this.brain, this.t);
  }

  private setMode(mode: 'still' | 'auto' | 'manual'): void {
    if (mode === 'still') {
      this.brain = new BunkBrain(BUNK_MOTION.behavior, 20261019, TEST_PERSONALITY);
      this.brain.hold = true;
      this.brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
      this.view.still = true;
      this.view.x = this.scale.width / 2;
      this.t = 0;
    } else {
      this.view.still = false;
      this.brain.hold = mode === 'manual';
    }
  }

  private button(x: number, y: number, label: string, onTap: () => void): void {
    this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#1b1024', backgroundColor: '#ffe14d', padding: { x: 12, y: 12 }, fixedWidth: 310, align: 'center' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onTap);
  }

  private toast(text: string): void {
    const t = this.add.text(this.view.x, this.view.y - 1150 * SCALE, text, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    if (!this.frozen && !this.view.still) {
      this.t += dt;
      this.brain.update(dt);
      if (this.brain.activity === 'walk' && !this.brain.switching && !this.brain.reaction) {
        this.view.x += this.brain.dir * BUNK_MOTION.behavior.walkSpeed * SCALE * dt;
        if (this.view.x > this.maxX) {
          this.view.x = this.maxX;
          this.brain.bounce(-1);
        } else if (this.view.x < this.minX) {
          this.view.x = this.minX;
          this.brain.bounce(1);
        }
      }
    }
    this.view.render(this.brain, this.t);

    const sleeping = this.brain.activity === 'sleep' && !this.brain.switching;
    this.zText.setVisible(sleeping && !this.view.showOriginal);
    if (sleeping) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(this.view.x + 130 + k * 40, this.view.y - 900 * SCALE - k * 60).setAlpha(1 - k).setScale(0.7 + k * 0.6);
    }
    const pose = this.brain.pose === 'guard' ? '構え' : '腕を下ろした姿';
    const act = this.view.still ? '静止（元画像と同じ姿）' : this.brain.switching ? '姿を切りかえ中' : this.brain.activity === 'walk' ? '歩く' : this.brain.activity === 'sleep' ? '寝ている' : '待っている';
    const mode = this.view.still ? '' : this.frozen ? `／${this.t}秒目で停止` : this.brain.hold ? '／手動' : '／自動';
    this.status.setText(`${pose}：${act}${mode}${this.view.showOriginal ? '\n元画像を表示中' : ''}${this.showFill ? '\n補った場所をピンクで表示' : ''}`);
  }
}
