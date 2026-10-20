import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { BunkBrain } from '../core/bunkBehavior';
import { loadSave } from '../core/save';
import { mulberry32, range } from '../core/rng';
import LAYOUT from '../render/birthLayout.json';
import { BUNK_MOTION, BunkView, TEST_PERSONALITY } from '../render/bunkView';
import { SHELL_PIECES, drawCracks, drawGlow, drawRays, drawShell } from '../ui/birthArt';
import { canvasTexture, UI_FONT } from '../ui/paint';
import { createNameplate } from '../ui/nameplate';
import { preloadPacks, releasePack } from '../render/packs';
import { addSoundButton } from '../ui/soundButton';

const W = 720;
const H = 1280;
const NAMES: Record<string, string> = { bunk: 'BUNK' };

/** 企画者の画像(design/birth/ → design/birth/make_assets.py で切り分け) */
export const BIRTH_FILES = {
  sky: 'sky.webp',
  basket: 'basket.webp',
  basketFront: 'basket_front.webp',
  egg: 'egg.webp',
  dragonBody: 'dragon_body.webp',
  wingNear: 'dragon_wing_near.webp',
  wingFar: 'dragon_wing_far.webp',
} as const;
export const birthKey = (name: keyof typeof BIRTH_FILES) => `birth:${name}`;
const key = birthKey;

// 籠の場面: ふつうの画面の位置。卵が落ちてきたら、ここへ切りかえる
const BASKET_TOP = 0;
// 空の場面: 籠の場面より上(別の場所)に、空の絵を少し大きく出す。卵を追ってカメラが下へ動く
const SKY_SCALE = (H * 1.2) / LAYOUT.sky.h;
const SKY_H = LAYOUT.sky.h * SKY_SCALE;
const SKY_TOP = -SKY_H - 400;
const BASKET_SCALE = H / LAYOUT.basket.h;
const NEST_X = W / 2 + (LAYOUT.basket.nest[0] - LAYOUT.basket.w / 2) * BASKET_SCALE;
const NEST_Y = BASKET_TOP + LAYOUT.basket.nest[1] * BASKET_SCALE;
/** 籠の中の卵の大きさ・卵の底の位置 */
const EGG_SCALE = 0.75;
const EGG_BOTTOM = NEST_Y + 12;
/** ドラゴンの足の卵の大きさ(ドラゴンの大きさに対して) */
const EGG_IN_CLAW = 0.26;
/** 籠の中のMONZ */
const MONZ_SCALE = 0.36;
const MONZ_FEET = NEST_Y + 110;
/** 羽ばたき1回の秒数 */
const FLAP = 0.95;

/**
 * 誕生の演出(質問のあと、約14秒)。
 * 空 → 黒いドラゴンが卵を運んでくる → 卵を落とす(カメラが追う) → 木の籠に「ポトッ」→ 揺れて止まる
 * → コンコン・ヒビ・金色の光 → 一瞬の静寂 → 割れて光が広がる → 籠の中にMONZ(目を開ける)→ 名前 → ホームへ。
 * MONZの正体は卵が割れるまで見せない。MONZの絵は元の画像のまま。
 */
export class BirthScene extends Phaser.Scene {
  private view?: BunkView;
  private brain?: BunkBrain;
  private t = 0;
  private alive = false;

  constructor() {
    super('Birth');
  }

  preload(): void {
    preloadPacks(this, ['bunk', 'birth']);
  }

  create(data: { intro?: boolean }): void {
    // 誕生の絵は1回しか使わないので、この画面を離れたらメモリから外す(その場で作ったヒビ・殻・光の絵も)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => releasePack(this, 'birth', 'birth:'));
    this.alive = false;
    this.t = 0;
    const monz = loadSave()?.firstMonz ?? 'bunk';
    addSoundButton(this, 56, H - 56).setScrollFactor(0).setDepth(60);
    if (data.intro) this.playIntro(monz);
    // 2回目からはホームへ(古い呼び方への備え)
    else this.scene.start('Home');
  }

  private playIntro(monz: string): void {
    const cam = this.cameras.main;
    const s = (ms: number, fn: () => void) => this.time.delayedCall(ms, fn);
    const eggImg = this.textures.get(key('egg')).getSourceImage() as HTMLImageElement;
    const EW = LAYOUT.egg.w;
    const EH = LAYOUT.egg.h;
    [1, 2, 3].forEach((st) => canvasTexture(this, `birth:crack${st}`, EW, EH, (ctx) => drawCracks(ctx, eggImg, EW, EH, st)));
    for (const p of SHELL_PIECES) canvasTexture(this, `birth:shell:${p}`, EW, EH, (ctx) => drawShell(ctx, eggImg, EW, EH, p));
    canvasTexture(this, 'birth:rays', 900, 900, (ctx) => drawRays(ctx, 900, 18));
    canvasTexture(this, 'birth:glow', 300, 300, (ctx) => drawGlow(ctx, 300));

    // ---- シーン1: ドラゴン登場(約3秒) ----
    this.add.image(W / 2, SKY_TOP, key('sky')).setOrigin(0.5, 0).setScale(SKY_SCALE);
    cam.setBounds(0, SKY_TOP, W, SKY_H);
    cam.setScroll(0, SKY_TOP);
    cam.fadeIn(700, 0, 0, 0);
    this.tweens.add({ targets: cam, scrollY: SKY_TOP + 70, duration: 3200, ease: 'Sine.easeInOut' });
    // メインの曲がそのまま続く(割れる直前だけ止める)
    audio.playBgm('main', 2.0);

    const D = LAYOUT.dragon;
    const farWing = this.add.image(D.farPivot[0] - D.w / 2, D.farPivot[1] - D.h / 2, key('wingFar')).setOrigin(D.farPivot[0] / D.w, D.farPivot[1] / D.h);
    const body = this.add.image(0, 0, key('dragonBody'));
    const nearWing = this.add.image(D.nearPivot[0] - D.w / 2, D.nearPivot[1] - D.h / 2, key('wingNear')).setOrigin(D.nearPivot[0] / D.w, D.nearPivot[1] / D.h);
    const dragon = this.add.container(780, SKY_TOP + 220, [farWing, body, nearWing]).setScale(0.12).setAlpha(0).setDepth(5);
    const egg = this.add.image(0, 0, key('egg')).setDepth(4);
    const clawEgg = { x: D.claw[0] - D.w / 2, y: D.claw[1] - D.h / 2 + 34 };

    // 羽ばたき(翼の付け根を中心に回し、振り下ろすときに翼が短く見えるようにする)
    let flapping = true;
    let lastPhase = 0;
    let holding = true;
    const flapUpdate = () => {
      if (!flapping) return;
      const ph = (this.t / FLAP) * Math.PI * 2;
      const sn = Math.sin(ph);
      nearWing.setAngle(4 + 13 * sn).setScale(1, 1 - 0.1 * (sn + 1));
      farWing.setAngle(-4 - 11 * sn).setScale(1, 1 - 0.08 * (sn + 1));
      body.setY(-10 * Math.cos(ph));
      // 振り下ろしの始まりで「バサッ」
      const phase = Math.floor(ph / (Math.PI * 2) + 0.25);
      if (phase !== lastPhase && dragon.alpha > 0.5 && dragon.scale > 0.3) audio.se('wing', { pitch: Math.min(1, dragon.scale + 0.2) });
      lastPhase = phase;
      if (holding) {
        const k = dragon.scale;
        egg.setPosition(dragon.x + clawEgg.x * k, dragon.y + (clawEgg.y + body.y) * k).setScale(k * EGG_IN_CLAW).setAlpha(dragon.alpha);
      }
    };
    this.events.on('update', flapUpdate);
    flapUpdate();
    this.tweens.add({ targets: dragon, alpha: 1, duration: 700 });
    this.tweens.add({ targets: dragon, x: 380, y: SKY_TOP + 500, scale: 0.72, duration: 3000, ease: 'Sine.easeOut' });

    // ---- シーン2: 卵を落とす(約2秒) ----
    let falling = false;
    s(3200, () => {
      holding = false;
      falling = true;
      audio.se('whistle');
      this.tweens.add({ targets: dragon, x: -160, y: SKY_TOP + 120, scale: 0.26, duration: 2000, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: dragon, alpha: 0, delay: 1300, duration: 700 });
      this.tweens.add({ targets: egg, x: W / 2 + 10, y: SKY_TOP + SKY_H + 260, angle: 540, scale: EGG_SCALE * 0.7, duration: 1700, ease: 'Quad.easeIn', onComplete: enterBasket });
    });
    const camFollow = () => {
      if (falling) cam.setScroll(0, Phaser.Math.Clamp(egg.y - 560, SKY_TOP, SKY_TOP + SKY_H - H));
    };
    this.events.on('update', camFollow);

    // ---- シーン3: 木の籠に着地(約2秒) ----
    this.add.image(W / 2, BASKET_TOP, key('basket')).setOrigin(0.5, 0).setScale(BASKET_SCALE);
    const front = this.add
      .image(W / 2, BASKET_TOP + LAYOUT.basket.frontTop * BASKET_SCALE, key('basketFront'))
      .setOrigin(0.5, 0)
      .setScale(BASKET_SCALE)
      .setDepth(8);
    const glow = this.add.image(NEST_X, EGG_BOTTOM - (EH * EGG_SCALE) / 2, 'birth:glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(3);
    const rays = this.add.image(NEST_X, EGG_BOTTOM - (EH * EGG_SCALE) / 2, 'birth:rays').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.4).setDepth(2);
    this.tweens.add({ targets: rays, angle: 360, duration: 16000, repeat: -1 });
    const cracks = [1, 2, 3].map((st) => this.add.image(NEST_X, EGG_BOTTOM, `birth:crack${st}`).setOrigin(0.5, 1).setScale(EGG_SCALE).setDepth(4.5).setVisible(false));
    /** 卵とヒビをいっしょに動かす */
    const eggParts = [egg, ...cracks];

    const enterBasket = () => {
      falling = false;
      this.events.off('update', camFollow);
      cam.setBounds(0, BASKET_TOP, W, H);
      cam.setScroll(0, BASKET_TOP);
      // 速さを感じる白い線
      const rng = mulberry32(5);
      for (let i = 0; i < 9; i++) {
        const line = this.add.rectangle(range(rng, 60, W - 60), BASKET_TOP + range(rng, 0, 700), range(rng, 3, 7), range(rng, 160, 360), 0xffffff, 0.7).setDepth(9);
        this.tweens.add({ targets: line, y: line.y + 500, alpha: 0, duration: 380, onComplete: () => line.destroy() });
      }
      egg.setOrigin(0.5, 1).setPosition(NEST_X, BASKET_TOP - 40).setScale(EGG_SCALE).setAngle(-160).setAlpha(1);
      this.tweens.add({ targets: egg, y: EGG_BOTTOM, angle: 0, duration: 380, ease: 'Quad.easeIn', onComplete: land });
    };

    const land = () => {
      audio.se('plop');
      s(40, () => audio.se('boing'));
      cam.shake(140, 0.004);
      this.tweens.add({ targets: front, y: front.y + 10, duration: 80, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
      this.tweens.chain({
        targets: egg,
        tweens: [
          { scaleX: EGG_SCALE * 1.25, scaleY: EGG_SCALE * 0.72, duration: 70 },
          { scaleX: EGG_SCALE * 0.92, scaleY: EGG_SCALE * 1.1, y: EGG_BOTTOM - 70, duration: 210, ease: 'Quad.easeOut' },
          { scaleX: EGG_SCALE, scaleY: EGG_SCALE, y: EGG_BOTTOM, duration: 200, ease: 'Quad.easeIn' },
          { scaleX: EGG_SCALE * 1.1, scaleY: EGG_SCALE * 0.9, duration: 60 },
          { scaleX: EGG_SCALE, scaleY: EGG_SCALE, duration: 140, ease: 'Back.easeOut' },
        ],
      });
      // 左右にコロン、コロンと揺れて止まる
      [-16, 12, -7, 3, 0].forEach((a, i) =>
        s(620 + i * 210, () => {
          this.tweens.add({ targets: egg, angle: a, duration: 190, ease: 'Sine.easeInOut' });
          if (i < 3) audio.se('knock', { pitch: 1.5 - i * 0.1 });
        }),
      );
      const pop = this.add
        .text(NEST_X + 190, EGG_BOTTOM - 330, 'ポトッ！', { fontFamily: UI_FONT, fontSize: '70px', fontStyle: '900', color: '#ffd23a', stroke: '#16101c', strokeThickness: 13 })
        .setOrigin(0.5)
        .setAngle(-12)
        .setScale(0)
        .setDepth(10);
      this.tweens.add({ targets: pop, scale: 1, duration: 240, ease: 'Back.easeOut' });
      this.tweens.add({ targets: pop, alpha: 0, y: pop.y - 40, delay: 950, duration: 400, onComplete: () => pop.destroy() });
      s(1900, hatch);
    };

    // ---- シーン4: 孵化(約4秒) ----
    const shake = (times: number, px: number, step = 45) => {
      this.tweens.add({ targets: eggParts, x: { from: NEST_X - px, to: NEST_X + px }, duration: step, yoyo: true, repeat: times, ease: 'Sine.easeInOut', onComplete: () => eggParts.forEach((o) => o.setX(NEST_X)) });
    };
    const crack = (stage: number) => {
      cracks.forEach((c, i) => c.setVisible(i === stage - 1));
      audio.se(stage === 3 ? 'crackBig' : 'crack');
      cam.shake(stage === 3 ? 160 : 90, stage === 3 ? 0.005 : 0.0025);
    };
    const hatch = () => {
      shake(3, 3);
      audio.se('knock', { pitch: 1.1 });
      s(260, () => audio.se('knock', { pitch: 1.2 }));
      s(600, () => crack(1));
      s(1000, () => {
        shake(4, 5);
        audio.se('knock', { pitch: 1.0 });
        s(220, () => audio.se('knock', { pitch: 1.15 }));
      });
      s(1400, () => {
        crack(2);
        this.tweens.add({ targets: glow, alpha: 0.5, scale: 1.1, duration: 400 });
      });
      s(1800, () => shake(6, 7, 40));
      s(2200, () => {
        crack(3);
        this.tweens.add({ targets: glow, alpha: 0.85, scale: 1.5, duration: 300 });
        this.tweens.add({ targets: rays, alpha: 0.45, scale: 0.75, duration: 500 });
      });
      // 一瞬の静寂(音楽を止めて、卵に寄る)
      s(2600, () => {
        audio.stopBgm(0.12);
        cam.zoomTo(1.35, 1100, 'Sine.easeInOut');
        shake(14, 4, 38);
        this.tweens.add({ targets: glow, alpha: 1, scale: 2.1, duration: 1100, ease: 'Sine.easeIn' });
        this.tweens.add({ targets: rays, alpha: 0.7, scale: 1, duration: 1100, ease: 'Sine.easeIn' });
      });
      s(3800, burst);
    };

    // 割れて光が広がる → ---- シーン5: MONZ誕生(約3秒) ----
    const burst = () => {
      audio.se('burst');
      const flash = this.add.rectangle(0, 0, W, H, 0xfffbe8).setOrigin(0, 0).setScrollFactor(0).setDepth(50).setAlpha(0);
      this.tweens.add({
        targets: flash,
        alpha: 1,
        duration: 110,
        onComplete: () => {
          cam.setZoom(1);
          eggParts.forEach((o) => o.setVisible(false));
          glow.setAlpha(0.9).setScale(3.2).setDepth(7);
          this.tweens.add({ targets: glow, alpha: 0, scale: 2, duration: 1800, ease: 'Sine.easeIn' });
          rays.setAlpha(1).setScale(1.5);
          this.tweens.add({ targets: rays, alpha: 0, duration: 2600, delay: 500, ease: 'Sine.easeIn' });
          // 下半分の殻は左右に開いて籠に残り、上のかけらは飛び散る
          for (const side of [-1, 1]) {
            const half = this.add.image(NEST_X, EGG_BOTTOM, `birth:shell:${side < 0 ? 'bottomL' : 'bottomR'}`).setOrigin(0.5, 1).setScale(EGG_SCALE).setDepth(6);
            this.tweens.add({ targets: half, x: NEST_X + side * 175, y: EGG_BOTTOM + 18, angle: side * 24, duration: 520, ease: 'Back.easeOut' });
          }
          const fly: [string, number, number, number][] = [
            ['top0', -250, -330, -300],
            ['top1', 30, -460, 200],
            ['top2', 260, -300, 340],
          ];
          for (const [p, dx, dy, spin] of fly) {
            const sh = this.add.image(NEST_X, EGG_BOTTOM, `birth:shell:${p}`).setOrigin(0.5, 1).setScale(EGG_SCALE).setDepth(9);
            this.tweens.add({ targets: sh, x: sh.x + dx, y: sh.y + dy, angle: spin, duration: 600, ease: 'Quad.easeOut' });
            this.tweens.add({ targets: sh, y: BASKET_TOP + H + 200, alpha: 0.6, delay: 600, duration: 800, ease: 'Quad.easeIn', onComplete: () => sh.destroy() });
          }
          this.spawn(monz);
          // 光がゆっくり消える
          this.tweens.add({ targets: flash, alpha: 0, duration: 1300, ease: 'Sine.easeOut', onComplete: () => flash.destroy() });
          s(150, () => audio.playBgm('main', 0.8));
          flapping = false;
          this.events.off('update', flapUpdate);
          dragon.destroy();
        },
      });
    };
  }

  /** 籠の中にMONZを出す(目を閉じている → 目を開ける → 少し体を動かす → 名前) */
  private spawn(monz: string): void {
    const view = new BunkView(this, NEST_X, MONZ_FEET, MONZ_SCALE);
    view.setDepth(5);
    view.still = false;
    const brain = new BunkBrain(BUNK_MOTION.behavior, Date.now() & 0xffff, TEST_PERSONALITY);
    brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    brain.hold = true;
    brain.reaction = { face: 'closed', kind: 'calm', left: 1.5, age: 0 };
    this.view = view;
    this.brain = brain;
    this.alive = true;
    view.on('pointerdown', () => {
      audio.unlock();
      audio.se(brain.pet());
    });

    const name = NAMES[monz] ?? monz.toUpperCase();
    this.time.delayedCall(1500, () => {
      // 目を開けて、うれしそうに少し跳ねる
      brain.reaction = { face: 'happy', kind: 'happy', left: 2.2, age: 0 };
      audio.se('happy');
      const plate = createNameplate(this, name, W / 2, 250);
      plate.reveal();
      this.time.delayedCall(3600, () => {
        plate.dock(true);
        this.time.delayedCall(1400, () => {
          this.cameras.main.fadeOut(500, 0, 0, 0);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home'));
        });
      });
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    this.t += dt;
    if (!this.alive || !this.view || !this.brain) return;
    this.brain.update(dt);
    this.view.render(this.brain, this.t);
  }
}
