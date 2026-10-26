import * as Phaser from 'phaser';
import type { Element } from '../core/mythclash/cards';
import { canvasTextureOnce, UI_FONT } from './paint';

/**
 * MYTHCLASH のバトルの演出(企画者 2026-10-26: 魔法は属性ごとに、必殺技とカウンターはかっこよく)。
 * どれも、まん中が当たる時間(ミリ秒)までに盛り上がり、全体の長さ(ミリ秒)を返す。
 * 【仮】絵の素材は使わず、丸・線・光でかいている
 */

type Pt = { x: number; y: number };
const DEPTH = 60;

/** やわらかい光の点(色はあとで付ける) */
function dotKey(scene: Phaser.Scene): string {
  return canvasTextureOnce(scene, 'fx:dot', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function leafKey(scene: Phaser.Scene): string {
  return canvasTextureOnce(scene, 'fx:leaf', 40, 24, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(2, 12);
    ctx.quadraticCurveTo(20, -6, 38, 12);
    ctx.quadraticCurveTo(20, 30, 2, 12);
    ctx.fill();
  });
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 当たったところの光と火花 */
export function impactFx(scene: Phaser.Scene, at: Pt, color: number, big = false): void {
  const key = dotKey(scene);
  const flash = scene.add.image(at.x, at.y, key).setTint(0xffffff).setScale(big ? 3 : 1.6).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: flash, scale: big ? 9 : 5, alpha: 0, duration: big ? 420 : 280, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  const ring = scene.add.circle(at.x, at.y, 30).setStrokeStyle(big ? 10 : 6, color, 1).setDepth(DEPTH);
  scene.tweens.add({ targets: ring, scale: big ? 7 : 4, alpha: 0, duration: big ? 520 : 360, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  for (let i = 0; i < (big ? 22 : 12); i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(80, big ? 300 : 180);
    const p = scene.add.image(at.x, at.y, key).setTint(color).setScale(rand(0.2, 0.45)).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: p, x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, alpha: 0, scale: 0.05, duration: rand(300, 520), ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
  }
}

/** 通常攻撃: 3本の切りさく線 */
export function slashFx(scene: Phaser.Scene, at: Pt): number {
  for (let i = 0; i < 3; i++) {
    scene.time.delayedCall(i * 60, () => {
      const g = scene.add.graphics().setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      const off = (i - 1) * 40;
      const p = { t: 0 };
      scene.tweens.add({
        targets: p,
        t: 1,
        duration: 120,
        onUpdate: () => {
          g.clear();
          g.lineStyle(14, 0xffe0a0, 0.5).lineBetween(at.x - 120 + off, at.y - 140, at.x - 120 + off + 240 * p.t, at.y - 140 + 280 * p.t);
          g.lineStyle(5, 0xffffff, 1).lineBetween(at.x - 120 + off, at.y - 140, at.x - 120 + off + 240 * p.t, at.y - 140 + 280 * p.t);
        },
        onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }),
      });
    });
  }
  scene.time.delayedCall(140, () => impactFx(scene, at, 0xffd23a));
  return 600;
}

const ELEMENT_FX: Record<Element, number> = { 炎: 0xff5a1a, 水: 0x2a9dff, 雷: 0xffe14a, 自然: 0x3ec46a, 光: 0xfff2a8, 闇: 0x9a4aff, 無: 0xe0e0f0 };

/** 魔法: 属性ごとの演出。from: 使ったカード、to: 相手のカード。返すのは全体の長さ */
export function magicFx(scene: Phaser.Scene, element: Element, from: Pt, to: Pt): number {
  const color = ELEMENT_FX[element];
  const key = dotKey(scene);
  const H = scene.scale.height;
  switch (element) {
    case '雷': {
      // 空から相手に雷が落ちる(3回)
      for (let n = 0; n < 3; n++) {
        scene.time.delayedCall(n * 140, () => {
          const g = scene.add.graphics().setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
          const pts: Pt[] = [{ x: to.x + rand(-40, 40), y: -20 }];
          const steps = 9;
          for (let i = 1; i <= steps; i++) pts.push({ x: to.x + rand(-55, 55) * (1 - i / steps) + (n - 1) * 20 * (i / steps), y: -20 + ((to.y + 20) * i) / steps });
          const draw = (w: number, c: number, a: number) => {
            g.lineStyle(w, c, a);
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
            g.strokePath();
          };
          draw(26, color, 0.35);
          draw(12, color, 0.8);
          draw(4, 0xffffff, 1);
          scene.cameras.main.flash(90, 255, 250, 200);
          scene.tweens.add({ targets: g, alpha: 0, duration: 260, delay: 60, onComplete: () => g.destroy() });
          impactFx(scene, to, color, n === 2);
        });
      }
      scene.cameras.main.shake(420, 0.01);
      return 1000;
    }
    case '光': {
      // 天から光の柱
      const pillar = scene.add.rectangle(to.x, H / 2, 40, H * 1.2, 0xfff6c8, 0.9).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: pillar, width: 300, duration: 300, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: pillar, alpha: 0, delay: 450, duration: 400, onComplete: () => pillar.destroy() });
      for (let i = 0; i < 26; i++) {
        const p = scene.add.image(to.x + rand(-140, 140), to.y + rand(-200, 200), key).setTint(0xffffff).setScale(0.05).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: p, scale: rand(0.3, 0.6), y: p.y - rand(40, 120), alpha: 0, delay: rand(100, 500), duration: 500, onComplete: () => p.destroy() });
      }
      scene.time.delayedCall(350, () => impactFx(scene, to, color, true));
      scene.cameras.main.flash(200, 255, 255, 230);
      return 1000;
    }
    case '闇': {
      // 闇のうずが相手をのみこむ
      const shade = scene.add.rectangle(0, 0, scene.scale.width, H, 0x000000, 0).setOrigin(0, 0).setDepth(DEPTH - 1);
      scene.tweens.add({ targets: shade, fillAlpha: 0.45, duration: 250, yoyo: true, hold: 350, onComplete: () => shade.destroy() });
      for (let r = 0; r < 4; r++) {
        const ring = scene.add.circle(to.x, to.y, 220 - r * 40).setStrokeStyle(12 - r * 2, r % 2 ? 0x2a0a40 : color, 0.9).setDepth(DEPTH);
        scene.tweens.add({ targets: ring, scale: 0.1, angle: 360, alpha: 0.2, delay: r * 80, duration: 600, ease: 'Cubic.easeIn', onComplete: () => ring.destroy() });
      }
      for (let i = 0; i < 20; i++) {
        const a = rand(0, Math.PI * 2);
        const p = scene.add.image(to.x + Math.cos(a) * 260, to.y + Math.sin(a) * 260, key).setTint(color).setScale(rand(0.3, 0.6)).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: p, x: to.x, y: to.y, scale: 0.05, duration: rand(400, 650), ease: 'Cubic.easeIn', onComplete: () => p.destroy() });
      }
      scene.time.delayedCall(620, () => impactFx(scene, to, color, true));
      return 1100;
    }
    case '自然': {
      // 葉がうずを巻いて集まり、根(つる)が下から打ちつける
      const leaf = leafKey(scene);
      for (let i = 0; i < 18; i++) {
        const a0 = rand(0, Math.PI * 2);
        const p = scene.add.image(to.x, to.y, leaf).setTint(i % 3 ? color : 0xa8ff60).setDepth(DEPTH).setScale(rand(0.8, 1.4));
        const o = { a: a0, r: 240 };
        scene.tweens.add({
          targets: o,
          a: a0 + Math.PI * 2,
          r: 20,
          duration: 650,
          ease: 'Sine.easeIn',
          onUpdate: () => {
            p.setPosition(to.x + Math.cos(o.a) * o.r, to.y + Math.sin(o.a) * o.r * 0.7);
            p.setRotation(o.a + Math.PI / 2);
          },
          onComplete: () => p.destroy(),
        });
      }
      scene.time.delayedCall(500, () => {
        for (let i = 0; i < 4; i++) {
          const g = scene.add.graphics().setDepth(DEPTH);
          const x = to.x + (i - 1.5) * 50;
          const p = { t: 0 };
          scene.tweens.add({
            targets: p,
            t: 1,
            duration: 180,
            delay: i * 40,
            onUpdate: () => {
              g.clear();
              g.lineStyle(14, 0x2a6a20, 1).lineBetween(x, H, x + Math.sin(i) * 30, H - (H - to.y + 60) * p.t);
              g.lineStyle(6, color, 1).lineBetween(x, H, x + Math.sin(i) * 30, H - (H - to.y + 60) * p.t);
            },
            onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 300, delay: 150, onComplete: () => g.destroy() }),
          });
        }
        impactFx(scene, to, color, true);
      });
      return 1100;
    }
    default: {
      // 炎・水・無: 使ったカードから相手へ玉が飛んでいき、はじける
      const orb = scene.add.image(from.x, from.y, key).setTint(color).setScale(1.6).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      const core = scene.add.image(from.x, from.y, key).setTint(0xffffff).setScale(0.8).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      const trail = scene.time.addEvent({
        delay: 25,
        repeat: 14,
        callback: () => {
          const t = scene.add.image(orb.x, orb.y + rand(-12, 12), key).setTint(color).setScale(rand(0.6, 1.1)).setDepth(DEPTH - 1).setBlendMode(Phaser.BlendModes.ADD);
          scene.tweens.add({ targets: t, alpha: 0, scale: 0.1, y: t.y + (element === '炎' ? -40 : 20), duration: 350, onComplete: () => t.destroy() });
        },
      });
      scene.tweens.add({
        targets: [orb, core],
        x: to.x,
        y: to.y,
        duration: 380,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          trail.remove();
          orb.destroy();
          core.destroy();
          impactFx(scene, to, color, true);
          if (element === '炎') {
            // 燃え上がる
            for (let i = 0; i < 28; i++) {
              const f = scene.add.image(to.x + rand(-120, 120), to.y + rand(40, 160), key).setTint([0xff5a1a, 0xffa020, 0xffe060][i % 3]).setScale(rand(0.6, 1.2)).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
              scene.tweens.add({ targets: f, y: f.y - rand(160, 320), scale: 0.1, alpha: 0, delay: rand(0, 200), duration: rand(450, 700), onComplete: () => f.destroy() });
            }
          } else if (element === '水') {
            // 波の輪と、しぶき
            for (let r = 0; r < 3; r++) {
              const ring = scene.add.ellipse(to.x, to.y + 60, 80, 30).setStrokeStyle(8, color, 0.9).setDepth(DEPTH);
              scene.tweens.add({ targets: ring, scale: 5, alpha: 0, delay: r * 120, duration: 520, onComplete: () => ring.destroy() });
            }
            for (let i = 0; i < 22; i++) {
              const a = rand(-Math.PI, 0);
              const d = rand(120, 260);
              const p = scene.add.image(to.x, to.y, key).setTint(i % 2 ? color : 0xbfe8ff).setScale(rand(0.25, 0.5)).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
              scene.tweens.add({ targets: p, x: to.x + Math.cos(a) * d, duration: 600, ease: 'Quad.easeOut' });
              scene.tweens.add({ targets: p, y: to.y + Math.sin(a) * d * 0.8, duration: 300, ease: 'Quad.easeOut', yoyo: true, onComplete: () => p.destroy() });
            }
          } else {
            for (let r = 0; r < 3; r++) {
              const ring = scene.add.circle(to.x, to.y, 40).setStrokeStyle(8, 0xffffff, 0.8).setDepth(DEPTH);
              scene.tweens.add({ targets: ring, scale: 6, alpha: 0, delay: r * 100, duration: 500, onComplete: () => ring.destroy() });
            }
          }
          scene.cameras.main.shake(260, 0.008);
        },
      });
      return 1050;
    }
  }
}

/** 必殺技のカットイン: 画面が暗くなり、ななめの帯にカードと「必殺技！」。返すのは全体の長さ */
export function specialCutin(scene: Phaser.Scene, texture: string, name: string, mine: boolean): number {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const box = scene.add.container(0, 0).setDepth(DEPTH + 20);
  const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0, 0);
  const band = scene.add.container(W / 2, H / 2).setAngle(-8);
  const bandBg = scene.add.rectangle(0, 0, W * 1.4, 230, mine ? 0x8a1020 : 0x103a8a, 0.95).setStrokeStyle(6, 0xffd23a, 1);
  band.add(bandBg);
  // 流れる線
  const lines: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 0; i < 14; i++) {
    const l = scene.add.rectangle(rand(-W, W), rand(-100, 100), rand(120, 400), rand(2, 6), 0xffffff, rand(0.3, 0.8));
    lines.push(l);
    band.add(l);
    scene.tweens.add({ targets: l, x: (mine ? 1 : -1) * W, duration: rand(250, 450), repeat: 3, onRepeat: () => l.setX((mine ? -1 : 1) * W) });
  }
  const card = scene.add.image((mine ? -1 : 1) * W * 0.6, 0, texture).setScale(0.5).setAngle(8);
  band.add(card);
  const title = scene.add.text((mine ? 1 : -1) * W * 0.6, -30, '必殺技！', { fontFamily: UI_FONT, fontSize: '84px', fontStyle: '900', color: '#ffd23a', stroke: '#16101c', strokeThickness: 12 }).setOrigin(0.5).setAngle(8);
  const sub = scene.add.text((mine ? 1 : -1) * W * 0.6, 56, name, { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 8 }).setOrigin(0.5).setAngle(8);
  band.add([title, sub]);
  box.add([dim, band]);
  band.setScale(1, 0);
  scene.tweens.add({ targets: band, scaleY: 1, duration: 140, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: card, x: (mine ? -1 : 1) * 220, duration: 260, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: [title, sub], x: (mine ? 1 : -1) * 140, duration: 260, delay: 60, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: box, alpha: 0, delay: 900, duration: 180, onComplete: () => box.destroy() });
  return 1100;
}

/** カウンター成功: 守った側に盾の光と「COUNTER!」、はね返す光が攻撃した側へ */
export function counterFx(scene: Phaser.Scene, defender: Pt, attacker: Pt): number {
  const g = scene.add.graphics().setDepth(DEPTH).setPosition(defender.x, defender.y);
  const hex = (r: number) => Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(Math.cos((Math.PI / 3) * i + Math.PI / 6) * r, Math.sin((Math.PI / 3) * i + Math.PI / 6) * r));
  g.fillStyle(0x3ae8ff, 0.25).fillPoints(hex(170), true);
  g.lineStyle(8, 0xbff8ff, 1).strokePoints(hex(170), true);
  g.lineStyle(3, 0xffffff, 0.8).strokePoints(hex(140), true);
  g.setScale(0.3);
  scene.tweens.add({ targets: g, scale: 1.1, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 300, onComplete: () => g.destroy() });
  scene.cameras.main.flash(120, 190, 250, 255);
  const t = scene.add.text(defender.x, defender.y - 210, 'COUNTER!', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '72px', color: '#bff8ff', stroke: '#0a2a5a', strokeThickness: 12 }).setOrigin(0.5).setDepth(DEPTH + 5).setScale(2.4).setAlpha(0);
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 200, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 800, duration: 300, onComplete: () => t.destroy() });
  // はね返す光
  const key = dotKey(scene);
  scene.time.delayedCall(320, () => {
    const bolt = scene.add.image(defender.x, defender.y, key).setTint(0x3ae8ff).setScale(2).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
    const line = scene.add.graphics().setDepth(DEPTH - 1).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: bolt,
      x: attacker.x,
      y: attacker.y,
      duration: 180,
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        line.clear();
        line.lineStyle(18, 0x3ae8ff, 0.4).lineBetween(defender.x, defender.y, bolt.x, bolt.y);
        line.lineStyle(6, 0xffffff, 1).lineBetween(defender.x, defender.y, bolt.x, bolt.y);
      },
      onComplete: () => {
        bolt.destroy();
        scene.tweens.add({ targets: line, alpha: 0, duration: 200, onComplete: () => line.destroy() });
        impactFx(scene, attacker, 0x3ae8ff, true);
        scene.cameras.main.shake(300, 0.012);
      },
    });
  });
  return 1100;
}
