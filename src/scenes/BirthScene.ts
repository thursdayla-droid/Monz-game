import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { BunkBrain } from '../core/bunkBehavior';
import { loadSave } from '../core/save';
import { BUNK_MOTION, BunkView, TEST_PERSONALITY } from '../render/bunkView';
import { mulberry32, range } from '../core/rng';
import {
  BASKET_H,
  BASKET_W,
  DRAGON_EGG,
  DRAGON_H,
  DRAGON_W,
  EGG_H,
  EGG_W,
  WORLD_H,
  WORLD_TOP,
  drawBasketBack,
  drawBasketFront,
  drawCloud,
  drawCracks,
  drawDragon,
  drawEgg,
  drawGlow,
  drawRays,
  drawShell,
  drawSkyWorld,
} from '../ui/birthArt';
import { canvasTexture, UI_FONT } from '../ui/paint';
import { createNameplate } from '../ui/nameplate';
import { addSoundButton } from '../ui/soundButton';

const W = 720;
const H = 1280;
const SCALE = 0.5;
const FLOOR_Y = 1100;
const NAMES: Record<string, string> = { bunk: 'BUNK' };

/**
 * 誕生の演出と、最初のMONZとの出会い。
 * intro=true: 質問のあと(ドラゴンが運んだ卵が籠に落ちて割れ、MONZが現れる)。intro=false: 2回目からの起動(すぐ表示)。
 * 出会ったあとはホーム(HomeScene)へ移る。
 */
export class BirthScene extends Phaser.Scene {
  private view?: BunkView;
  private brain?: BunkBrain;
  private t = 0;
  private alive = false;
  private zText?: Phaser.GameObjects.Text;

  constructor() {
    super('Birth');
  }

  create(data: { intro?: boolean }): void {
    this.alive = false;
    this.t = 0;
    const monz = loadSave()?.firstMonz ?? 'bunk';
    addSoundButton(this, 56, H - 56).setScrollFactor(0);
    if (data.intro) this.playIntro(monz);
    // 2回目からはホームへ(古い呼び方への備え)
    else this.scene.start('Home');
  }

  /**
   * 誕生の演出【仮の絵】: 空 → ドラゴンの影が卵を運ぶ → 卵を落とす → 籠に「ポトッ」→ ゴトゴト → ヒビ → 静寂 → 誕生。
   * MONZの姿は卵が割れるまで出さない。
   */
  private playIntro(monz: string): void {
    const cam = this.cameras.main;
    const s = (ms: number, fn: () => void) => this.time.delayedCall(ms, fn);
    const tex = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => canvasTexture(this, key, w, h, draw);

    // 絵を用意する
    tex('birth:sky', W, WORLD_H, (ctx) => drawSkyWorld(ctx, W, WORLD_H));
    [0, 1, 2].forEach((i) => tex(`birth:cloud${i}`, 300, 170, (ctx) => drawCloud(ctx, 300, 170, 3 + i * 5)));
    [1, 0, -1].forEach((wing, i) => tex(`birth:dragon${i}`, DRAGON_W, DRAGON_H, (ctx) => drawDragon(ctx, DRAGON_W, DRAGON_H, wing)));
    tex('birth:egg', EGG_W, EGG_H, (ctx) => drawEgg(ctx));
    [1, 2, 3].forEach((st) => tex(`birth:crack${st}`, EGG_W, EGG_H, (ctx) => drawCracks(ctx, st)));
    tex('birth:shellTop', EGG_W, EGG_H, (ctx) => drawShell(ctx, 'top'));
    tex('birth:shellBottom', EGG_W, EGG_H, (ctx) => drawShell(ctx, 'bottom'));
    tex('birth:basketBack', BASKET_W, BASKET_H, (ctx) => drawBasketBack(ctx));
    tex('birth:basketFront', BASKET_W, BASKET_H, (ctx) => drawBasketFront(ctx));
    tex('birth:rays', 900, 900, (ctx) => drawRays(ctx, 900, 18));
    tex('birth:glow', 300, 300, (ctx) => drawGlow(ctx, 300));

    // 空の世界(上へ長い)。カメラは上から始めて、卵を追って下へ
    this.add.image(0, WORLD_TOP, 'birth:sky').setOrigin(0, 0);
    const rng = mulberry32(31);
    // 雲は空にだけ(地面の近くには置かない)
    for (let i = 0; i < 10; i++) {
      const c = this.add.image(range(rng, 60, W - 60), WORLD_TOP + 150 + i * 270 + range(rng, -60, 60), `birth:cloud${i % 3}`).setScale(range(rng, 0.6, 1.2));
      this.tweens.add({ targets: c, x: c.x + range(rng, -80, 80), duration: range(rng, 6000, 9000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    cam.setBounds(0, WORLD_TOP, W, WORLD_H);
    cam.setScroll(0, WORLD_TOP);
    cam.fadeIn(800, 251, 241, 220);
    this.tweens.add({ targets: cam, scrollY: WORLD_TOP + 150, duration: 3600, ease: 'Sine.easeInOut' });
    audio.playBgm('dragon', 2.5);

    // 籠(地面)
    const BASKET_Y = 1165;
    const EGG_BOTTOM = BASKET_Y - BASKET_H + BASKET_H * 0.32 + 52;
    const basketBack = this.add.image(W / 2, BASKET_Y, 'birth:basketBack').setOrigin(0.5, 1);
    const eggC = this.add.container(0, 0);
    const egg = this.add.image(0, 0, 'birth:egg');
    const cracks = [1, 2, 3].map((st) => this.add.image(0, 0, `birth:crack${st}`).setVisible(false));
    const leak = this.add.image(0, -10, 'birth:glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.6);
    eggC.add([egg, ...cracks, leak]);
    const basketFront = this.add.image(W / 2, BASKET_Y, 'birth:basketFront').setOrigin(0.5, 1);
    const rays = this.add.image(W / 2, EGG_BOTTOM - EGG_H / 2, 'birth:rays').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.4).setDepth(-1);
    this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
    basketBack.setDepth(1);
    rays.setDepth(1.5);
    eggC.setDepth(2);
    basketFront.setDepth(3);

    // ドラゴン(影)。羽ばたきは3枚の絵を順に出す
    const dragon = this.add.image(600, WORLD_TOP + 260, 'birth:dragon0').setScale(0.1).setAlpha(0).setDepth(4);
    let frame = 0;
    const flap = this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        frame = (frame + 1) % 4;
        dragon.setTexture(`birth:dragon${[0, 1, 2, 1][frame]}`);
        if (frame === 2 && dragon.scale > 0.35 && dragon.visible) audio.se('wing', { pitch: Math.min(1, dragon.scale) });
      },
    });
    let holding = true;
    const eggOnDragon = () => {
      const k = dragon.scale;
      eggC.setPosition(dragon.x + (DRAGON_EGG.x - DRAGON_W / 2) * k, dragon.y + (DRAGON_EGG.y - DRAGON_H / 2) * k).setScale(k).setAlpha(dragon.alpha);
    };
    eggOnDragon();
    const follow = () => {
      if (holding) eggOnDragon();
    };
    this.events.on('update', follow);

    s(700, () => {
      this.tweens.add({ targets: dragon, alpha: 1, duration: 900 });
      this.tweens.add({ targets: dragon, x: 340, y: WORLD_TOP + 470, scale: 0.92, duration: 3400, ease: 'Sine.easeIn' });
    });

    // 卵を落とす
    let falling = false;
    s(4200, () => {
      holding = false;
      falling = true;
      audio.se('whistle');
      this.tweens.add({ targets: dragon, x: -320, y: WORLD_TOP - 200, scale: 1.7, duration: 1700, ease: 'Sine.easeIn', onComplete: () => { dragon.setVisible(false); flap.remove(); } });
      this.tweens.add({ targets: eggC, y: EGG_BOTTOM - EGG_H / 2, x: W / 2, scale: 1, angle: 720, duration: 2000, ease: 'Quad.easeIn', onComplete: land });
    });
    const camFollow = () => {
      if (falling) cam.setScroll(0, Phaser.Math.Clamp(eggC.y - 560, WORLD_TOP, 0));
    };
    this.events.on('update', camFollow);

    // 籠に「ポトッ」(少しコミカルに)
    const land = () => {
      falling = false;
      cam.setScroll(0, 0);
      // ここからは卵の底を中心に揺らす
      eggC.setAngle(0).setPosition(W / 2, EGG_BOTTOM);
      for (const o of [egg, ...cracks]) o.setY(-EGG_H / 2);
      leak.setY(-EGG_H / 2 - 10);
      audio.se('plop');
      this.tweens.chain({
        targets: eggC,
        tweens: [
          { scaleX: 1.3, scaleY: 0.65, duration: 70 },
          { scaleX: 0.9, scaleY: 1.15, y: EGG_BOTTOM - 90, duration: 230, ease: 'Quad.easeOut' },
          { scaleX: 1, scaleY: 1, y: EGG_BOTTOM, duration: 220, ease: 'Quad.easeIn' },
          { scaleX: 1.12, scaleY: 0.88, duration: 70 },
          { scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' },
        ],
      });
      s(40, () => audio.se('boing'));
      this.tweens.add({ targets: [basketBack, basketFront], scaleY: 0.86, scaleX: 1.06, duration: 90, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
      const pop = this.add
        .text(W / 2 + 150, EGG_BOTTOM - 250, 'ポトッ！', { fontFamily: UI_FONT, fontSize: '64px', fontStyle: '900', color: '#ffd23a', stroke: '#16101c', strokeThickness: 12 })
        .setOrigin(0.5)
        .setAngle(-12)
        .setScale(0)
        .setDepth(6);
      this.tweens.add({ targets: pop, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: pop, alpha: 0, y: pop.y - 40, delay: 900, duration: 400, onComplete: () => pop.destroy() });
      hatch();
    };

    // ゴトゴト → ヒビ → 光 → 静寂 → 誕生
    const wobble = (startMs: number, angles: number[], step = 170) =>
      angles.forEach((a, i) =>
        s(startMs + i * step, () => {
          this.tweens.add({ targets: eggC, angle: a, duration: step * 0.8, ease: 'Sine.easeInOut' });
          audio.se('knock', { pitch: 0.9 + (i % 2) * 0.2 });
        }),
      );
    const crack = (stage: number, big = false) => {
      cracks.forEach((c, i) => c.setVisible(i === stage - 1));
      audio.se(big ? 'crackBig' : 'crack');
      cam.shake(big ? 180 : 110, big ? 0.006 : 0.003);
    };
    const hatch = () => {
      wobble(1100, [-12, 10, -8, 0]);
      s(2000, () => crack(1));
      wobble(2500, [9, -9, 0], 150);
      s(3100, () => {
        crack(2);
        this.tweens.add({ targets: leak, alpha: 0.45, duration: 400 });
        this.tweens.add({ targets: rays, alpha: 0.25, scale: 0.55, duration: 600 });
      });
      wobble(3600, [-7, 7, -7, 7, 0], 110);
      s(4200, () => {
        crack(3, true);
        this.tweens.add({ targets: leak, alpha: 0.8, scale: 0.8, duration: 300 });
        this.tweens.add({ targets: rays, alpha: 0.5, scale: 0.8, duration: 500 });
      });
      // 一瞬の静寂(音を止めて、ゆっくり卵に寄る)
      s(4700, () => {
        audio.stopBgm(0.12);
        // 画面の外(地面の下)が見えないよう、カメラの範囲はそのまま
        cam.pan(W / 2, EGG_BOTTOM - EGG_H / 2, 1500, 'Sine.easeInOut');
        cam.zoomTo(1.45, 1500, 'Sine.easeInOut');
        this.tweens.add({ targets: leak, alpha: 1, scale: 1.1, duration: 1500, ease: 'Sine.easeIn' });
      });
      // 誕生
      s(6400, () => {
        audio.se('burst');
        const flash = this.add.rectangle(0, 0, W, H, 0xfffbe8).setOrigin(0, 0).setScrollFactor(0).setDepth(20).setAlpha(0);
        this.tweens.add({
          targets: flash,
          alpha: 1,
          duration: 120,
          onComplete: () => {
            cam.setZoom(1).setScroll(0, 0);
            eggC.setVisible(false);
            basketBack.setVisible(false);
            basketFront.setVisible(false);
            rays.setPosition(W / 2, FLOOR_Y - 220).setAlpha(0.9).setScale(1.3).setDepth(1.5);
            this.tweens.add({ targets: rays, alpha: 0, duration: 2600, delay: 400, ease: 'Sine.easeIn' });
            // 殻が飛び散る
            const shells: [string, number, number, number][] = [['birth:shellTop', -260, -420, -540], ['birth:shellBottom', 230, -300, 400]];
            for (const [key, dx, dy, spin] of shells) {
              const sh = this.add.image(W / 2, EGG_BOTTOM - EGG_H / 2, key).setDepth(6);
              this.tweens.add({ targets: sh, x: sh.x + dx, y: sh.y + dy, angle: spin, duration: 650, ease: 'Quad.easeOut' });
              this.tweens.add({ targets: sh, y: FLOOR_Y + 60, alpha: 0, delay: 650, duration: 900, ease: 'Quad.easeIn', onComplete: () => sh.destroy() });
            }
            this.spawn(monz);
            this.tweens.add({ targets: flash, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
            s(150, () => audio.playBgm('hatch', 0.8));
            this.events.off('update', follow);
            this.events.off('update', camFollow);
          },
        });
      });
    };
  }

  /** 卵からMONZを出す(喜んで跳ね、名前を出す) */
  private spawn(monz: string): void {
    const view = new BunkView(this, W / 2, FLOOR_Y, SCALE);
    view.setDepth(2);
    view.still = false;
    const brain = new BunkBrain(BUNK_MOTION.behavior, Date.now() & 0xffff, TEST_PERSONALITY);
    brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    brain.hold = true;
    this.view = view;
    this.brain = brain;
    this.alive = true;
    view.on('pointerdown', () => {
      audio.unlock();
      audio.se(brain.pet());
    });
    this.zText = this.text(0, 0, 'z', 38, '#ffffff').setVisible(false);

    // 誕生直後: 喜んで跳ね、名前を出したあと、ホームへ移る
    const name = NAMES[monz] ?? monz.toUpperCase();
    brain.reaction = { face: 'happy', kind: 'happy', left: 2.2, age: 0 };
    view.setScale(SCALE * 0.2);
    this.tweens.add({ targets: view, scale: SCALE, duration: 520, ease: 'Back.easeOut' });
    const plate = createNameplate(this, name, W / 2, 250);
    plate.reveal();
    this.time.delayedCall(3600, () => {
      plate.dock(true);
      this.time.delayedCall(1400, () => {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home'));
      });
    });
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: Math.round(size * 0.2), align: 'center' })
      .setOrigin(0.5)
      .setDepth(5);
  }

  update(_time: number, delta: number): void {
    if (!this.alive || !this.view || !this.brain) return;
    const dt = Math.min(delta / 1000, 0.1);
    const view = this.view;
    const brain = this.brain;
    this.t += dt;
    brain.update(dt);
    if (brain.activity === 'walk' && !brain.switching && !brain.reaction) {
      const minX = 300;
      const maxX = W - 300;
      view.x += brain.dir * BUNK_MOTION.behavior.walkSpeed * SCALE * dt;
      if (view.x > maxX) {
        view.x = maxX;
        brain.bounce(-1);
      } else if (view.x < minX) {
        view.x = minX;
        brain.bounce(1);
      }
    }
    view.render(brain, this.t);
    const sleeping = brain.activity === 'sleep' && !brain.switching;
    this.zText?.setVisible(sleeping);
    if (sleeping && this.zText) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(view.x + 150 + k * 40, view.y - 900 * SCALE - k * 60).setAlpha(1 - k).setScale(0.7 + k * 0.6);
    }
  }
}
