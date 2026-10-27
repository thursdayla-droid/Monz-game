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

/** 葉っぱ(先がとがって、まん中に葉脈。明るい緑から濃い緑へ)。2026-10-26 企画者「草のエフェクトださい」で作り直し */
function leafKey(scene: Phaser.Scene): string {
  return canvasTextureOnce(scene, 'fx:leaf2', 64, 32, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 32);
    g.addColorStop(0, '#d8ff8a');
    g.addColorStop(0.5, '#4ec43a');
    g.addColorStop(1, '#1d6a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(2, 16);
    ctx.bezierCurveTo(14, -2, 44, -2, 62, 16);
    ctx.bezierCurveTo(44, 34, 14, 34, 2, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,50,10,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 葉脈
    ctx.strokeStyle = 'rgba(230,255,190,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(4, 16);
    ctx.lineTo(60, 16);
    for (let i = 1; i < 5; i++) {
      const x = 8 + i * 10;
      ctx.moveTo(x, 16);
      ctx.lineTo(x + 7, 8);
      ctx.moveTo(x, 16);
      ctx.lineTo(x + 7, 24);
    }
    ctx.stroke();
  });
}

/** 魔法陣(白でかいて、色をつけて使う)。地面に置くときは縦につぶす */
function circleKey(scene: Phaser.Scene): string {
  return canvasTextureOnce(scene, 'fx:circle', 256, 256, (ctx) => {
    ctx.translate(128, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 118, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.stroke();
    // 六芒星
    for (const off of [0, Math.PI / 3]) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = off + (i * Math.PI * 2) / 3 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * 100, Math.sin(a) * 100);
        else ctx.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
      }
      ctx.stroke();
    }
    // ふちの模様(文字のかわりの小さな線)
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r0 = 103;
      const r1 = i % 3 === 0 ? 116 : 110;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
  });
}

/** 曲がったつるを、根もとから先へ t(0〜1)まで描く。太さは先ほど細く、ところどころにトゲ */
function drawVine(g: Phaser.GameObjects.Graphics, pts: Pt[], t: number, width: number): void {
  const n = Math.max(1, Math.floor((pts.length - 1) * t));
  for (const [w, col, a] of [[1, 0x10380e, 1], [0.55, 0x3a9a2a, 1], [0.22, 0xb8f07a, 0.9]] as const) {
    for (let i = 0; i < n; i++) {
      const k = 1 - i / (pts.length - 1);
      g.lineStyle(Math.max(1.5, width * w * (0.35 + 0.65 * k)), col, a);
      g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
  }
  // トゲ
  g.fillStyle(0x10380e, 1);
  for (let i = 3; i < n; i += 4) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const side = i % 8 === 3 ? 1 : -1;
    const k = 1 - i / (pts.length - 1);
    const s = 6 + 8 * k;
    g.fillTriangle(p0.x + nx * s * 0.4 * side, p0.y + ny * s * 0.4 * side, p1.x, p1.y, p0.x + nx * s * 1.6 * side + dx * 0.2, p0.y + ny * s * 1.6 * side + dy * 0.2);
  }
}

/** ベジェ曲線の点 */
function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
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
      // 1. 発動: 相手の足もとに緑の魔法陣、使ったカードのまわりから緑の光がのぼる
      // 2. 命中: トゲのあるつるが地面から何本も伸びて、相手にからみつく + 葉がはじける
      // 3. 余韻: 葉がゆれながら舞い落ち、花粉のような光の粒
      const leaf = leafKey(scene);
      const ground = to.y + 150;
      // 地面に寝かせた魔法陣(入れものを縦につぶし、中の絵だけを回す)
      const ring = scene.add.container(to.x, ground).setScale(0.2, 0.07).setAlpha(0).setDepth(DEPTH - 2);
      const ringImg = scene.add.image(0, 0, circleKey(scene)).setTint(0x7dff6a).setBlendMode(Phaser.BlendModes.ADD);
      ring.add(ringImg);
      scene.tweens.add({ targets: ring, scaleX: 1.5, scaleY: 0.45, alpha: 0.95, duration: 380, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: ringImg, angle: 140, duration: 1500 });
      scene.tweens.add({ targets: ring, alpha: 0, delay: 1150, duration: 350, onComplete: () => ring.destroy() });
      for (let i = 0; i < 14; i++) {
        const m = scene.add.image(from.x + rand(-120, 120), from.y + rand(40, 160), key).setTint(i % 2 ? 0x9dff6a : 0x3ec46a).setScale(rand(0.15, 0.35)).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: m, y: m.y - rand(120, 220), alpha: 0, duration: rand(450, 700), delay: rand(0, 200), onComplete: () => m.destroy() });
      }
      scene.time.delayedCall(300, () => {
        // つる: 地面から生えて、カードのまわりを曲がりながら上へ
        const vines = scene.add.graphics().setDepth(DEPTH + 1);
        const paths = [-1, 1, -0.45, 0.45, 0].map((side, k) => {
          const x0 = to.x + side * rand(120, 170);
          const p0 = { x: x0, y: ground + 30 };
          const p1 = { x: x0 - side * 40, y: to.y + 60 };
          const p2 = { x: to.x + side * (k < 2 ? 190 : 110), y: to.y - 40 };
          const p3 = { x: to.x - side * rand(20, 90), y: to.y - rand(110, 170) };
          return bezier(p0, p1, p2, p3, 28);
        });
        const p = { t: 0 };
        scene.tweens.add({
          targets: p,
          t: 1,
          duration: 330,
          ease: 'Cubic.easeOut',
          onUpdate: () => {
            vines.clear();
            paths.forEach((pts, k) => drawVine(vines, pts, Math.min(1, p.t * (1 + k * 0.08)), k < 2 ? 30 : 22));
          },
          onComplete: () => {
            // しめつけ
            scene.tweens.add({ targets: vines, scaleX: 0.97, x: to.x * 0.03, duration: 90, yoyo: true, repeat: 1 });
            scene.tweens.add({ targets: vines, alpha: 0, delay: 650, duration: 350, onComplete: () => vines.destroy() });
          },
        });
        scene.time.delayedCall(260, () => {
          impactFx(scene, to, color, true);
          scene.cameras.main.shake(260, 0.009);
          // 葉がはじける → ゆれながら落ちる
          for (let i = 0; i < 26; i++) {
            const a = rand(0, Math.PI * 2);
            const d = rand(90, 260);
            const lf = scene.add.image(to.x, to.y, leaf).setScale(rand(0.9, 1.6)).setRotation(a).setDepth(DEPTH + 2);
            const tx = to.x + Math.cos(a) * d;
            const ty = to.y + Math.sin(a) * d * 0.8;
            scene.tweens.add({ targets: lf, x: tx, y: ty, rotation: a + rand(-3, 3), duration: 320, ease: 'Cubic.easeOut' });
            scene.tweens.add({
              targets: lf,
              y: ty + rand(140, 260),
              x: tx + rand(-50, 50),
              rotation: `+=${rand(-4, 4)}`,
              alpha: 0,
              delay: 320,
              duration: rand(700, 1000),
              ease: 'Sine.easeIn',
              onComplete: () => lf.destroy(),
            });
          }
          for (let i = 0; i < 18; i++) {
            const sp = scene.add.image(to.x + rand(-160, 160), to.y + rand(-160, 120), key).setTint(i % 3 ? 0xeaff9a : 0xffe8a0).setScale(0.05).setDepth(DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: sp, scale: rand(0.18, 0.32), alpha: 0, y: sp.y - rand(30, 90), delay: rand(100, 600), duration: 600, onComplete: () => sp.destroy() });
          }
        });
      });
      return 1300;
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

/**
 * コイントス(企画者 2026-10-27: 50%で効果が出るものは、コイントスして見せる)。
 * 結果はもう決まっている(win)。コインが回りながら上がって落ち、表(成功)か裏(失敗)で止まる。返すのは全体の長さ
 */
/** コイントスのコインの表(企画者の絵。design/mythclash/make_coin.py で切り抜く) */
export const MYTH_COIN_FRONT = 'myth:coinFront';
export const MYTH_COIN_FRONT_FILE = 'assets/mythclash/coin_front.webp';

export function coinTossFx(scene: Phaser.Scene, x: number, y: number, win: boolean, title: string, onFlip?: () => void, onLand?: (win: boolean) => void): number {
  const R = 70;
  const face = (key: string, front: boolean) =>
    canvasTextureOnce(scene, key, R * 2 + 8, R * 2 + 8, (ctx) => {
      const c = R + 4;
      const g = ctx.createRadialGradient(c - 20, c - 24, 6, c, c, R);
      if (front) {
        g.addColorStop(0, '#fff6c0');
        g.addColorStop(0.55, '#f0c030');
        g.addColorStop(1, '#a06a08');
      } else {
        g.addColorStop(0, '#f0f0f8');
        g.addColorStop(0.55, '#9aa0b8');
        g.addColorStop(1, '#4a5068');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = front ? '#7a4a00' : '#2a3048';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, R - 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = front ? '#6a3a00' : '#1e2236';
      ctx.font = `900 64px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(front ? '表' : '裏', c, c + 4);
    });
  // 表は企画者の絵(2026-10-27)。絵が読めていなければ、プログラムで描いた金色の「表」。裏は絵が届くまでプログラムの銀色の「裏」【仮】
  const front = scene.textures.exists(MYTH_COIN_FRONT)
    ? canvasTextureOnce(scene, 'fx:coin:front:art', R * 2 + 8, R * 2 + 8, (ctx) => ctx.drawImage(scene.textures.get(MYTH_COIN_FRONT).getSourceImage() as HTMLImageElement, 0, 0, R * 2 + 8, R * 2 + 8))
    : face('fx:coin:front', true);
  const back = face('fx:coin:back', false);
  const box = scene.add.container(x, y).setDepth(DEPTH + 30);
  const dim = scene.add.rectangle(0, 0, 520, 360, 0x0a0408, 0.78).setStrokeStyle(4, 0xd8b060, 1);
  const t = scene.add.text(0, -140, title, { fontFamily: UI_FONT, fontSize: '28px', fontStyle: '900', color: '#ffd23a' }).setOrigin(0.5);
  const coin = scene.add.image(0, 10, front);
  const shadow = scene.add.ellipse(0, 110, 120, 22, 0x000000, 0.5);
  box.add([dim, shadow, t, coin]);
  box.setAlpha(0);
  scene.tweens.add({ targets: box, alpha: 1, duration: 150 });
  // くるくる回る(横はばを 1 → 0 → 1 にして、0 のときに面をかえる)
  const flips = 7;
  let side = true;
  const spin = { k: 0 };
  scene.tweens.add({
    targets: spin,
    k: flips,
    duration: 1100,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      const f = spin.k % 1;
      coin.scaleX = Math.abs(Math.cos(f * Math.PI));
      const now = Math.floor(spin.k + 0.5) % 2 === 0;
      if (now !== side) {
        side = now;
        // 回っている間は表と裏を交互に(止まったときに結果の面にする)
        coin.setTexture(side ? front : back);
        onFlip?.();
      }
    },
    onComplete: () => {
      coin.setTexture(win ? front : back).setScale(1);
      onLand?.(win);
      const res = scene.add.text(0, 132, win ? '表！ 成功' : '裏… 失敗', { fontFamily: UI_FONT, fontSize: '36px', fontStyle: '900', color: win ? '#ffd23a' : '#b8c0d8', stroke: '#16101c', strokeThickness: 8 }).setOrigin(0.5).setScale(0.4);
      box.add(res);
      scene.tweens.add({ targets: res, scale: 1, duration: 200, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: coin, scale: 1.18, duration: 120, yoyo: true });
      if (win) impactFx(scene, { x, y: y + 10 }, 0xffd23a, false);
      scene.tweens.add({ targets: box, alpha: 0, delay: 650, duration: 220, onComplete: () => box.destroy() });
    },
  });
  // 上がって落ちる
  scene.tweens.add({ targets: [coin], y: -60, duration: 550, ease: 'Quad.easeOut', yoyo: true });
  scene.tweens.add({ targets: shadow, scaleX: 0.5, alpha: 0.2, duration: 550, ease: 'Quad.easeOut', yoyo: true });
  return 2050;
}

