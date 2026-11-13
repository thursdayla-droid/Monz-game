import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import type { ColorTier } from '../core/slot/reach';
import { UI_FONT } from '../ui/paint';

/**
 * MONZ SLOT の 演出(2026-11-10 企画者「日本の パチンコ屋の スロットみたいに 楽しく。ぜんぶ いれたい。絵は 用意する」)。
 * 今は すべて プログラムで 描いた【仮】の 見た目。企画者の 絵が 届いたら 差しかえる(docs/SLOT.md の「絵の たのみ方」)。
 * ① ステップアップ予告 ② 色で 期待度 ③ PUSH ボタン ④ 図柄が うごく(SlotScene) ⑤ 当たりの 光と コイン
 * ⑥ 待っている 間の 液晶 ⑦ カットイン ⑧ 告知ランプ ⑨ 連続演出(SlotScene)
 */

/** 企画者の PUSH ボタンの 絵(元は design/slot/push.png) */
export const PUSH_KEY = 'slot:push';
export const PUSH_FILE = 'assets/slot/push.webp';

/** 企画者の ステップアップ予告の 絵(2026-11-10。元は design/slot/step/step1〜5.png) */
export const stepKey = (n: number) => `slot:step:${n}`;
export const STEP_FILES: [string, string][] = [1, 2, 3, 4, 5].map((n) => [stepKey(n), `assets/slot/step${n}.webp`]);

export interface LcdBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 色ごとの 見た目(青 → 緑 → 赤 → 金 → 虹) */
export const TIER_CSS: Record<ColorTier, string> = { blue: '#3a9dff', green: '#3ec46a', red: '#ff3a5a', gold: '#ffd23a', rainbow: '#ffffff' };
export const TIER_NUM: Record<ColorTier, number> = { blue: 0x3a9dff, green: 0x3ec46a, red: 0xff3a5a, gold: 0xffd23a, rainbow: 0xffffff };

const txt = (scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 0) =>
  scene.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center' }).setOrigin(0.5);

/** 文字を 虹色に 回す(虹の 時) */
export function rainbowText(scene: Phaser.Scene, t: Phaser.GameObjects.Text): void {
  let hue = 0;
  const ev = scene.time.addEvent({ delay: 70, loop: true, callback: () => t.active && t.setColor(`hsl(${(hue += 30) % 360},95%,65%)`) });
  t.once(Phaser.GameObjects.Events.DESTROY, () => ev.remove());
}

/** 色つきの 文字(②) */
export function tierText(scene: Phaser.Scene, x: number, y: number, s: string, size: number, tier: ColorTier): Phaser.GameObjects.Text {
  const t = txt(scene, x, y, s, size, TIER_CSS[tier], Math.max(6, size / 9));
  t.setShadow(0, 6, '#000000', 0, true, true);
  if (tier === 'rainbow') rainbowText(scene, t);
  return t;
}

/**
 * ① ステップアップ予告: 液晶に 1 → 2 → … と 段が 進む。段が 進むほど・色が アツいほど 当たりやすい。かかる 時間(ms)を 返す
 */
export function stepUp(scene: Phaser.Scene, lcd: Phaser.GameObjects.Container, box: LcdBox, level: number, tier: ColorTier, fast: boolean, faces?: string[]): number {
  // 2026-11-12 企画者「ステップアップは 各リーチの 1枚目の 白黒で」→ faces(白黒の 1枚目)が あれば それを 1段ずつ
  if (faces && faces.length >= level && faces.every((k) => scene.textures.exists(k))) return faceSteps(scene, lcd, box, level, faces, fast);
  const art = scene.textures.exists(stepKey(1));
  // 2026-11-11 企画者「ステップアップも もう少し 長く」→ 1段 0.45 → 0.75秒(オートは 0.45秒)
  const per = art ? (fast ? 450 : 750) : fast ? 300 : 500;
  const { w, h } = box;
  const words = ['チャンス？', 'チャンス！', 'アツい！', '激アツ！！', 'MONZ 確定級！？'];
  for (let i = 0; i < level; i++) {
    scene.time.delayedCall(i * per, () => {
      if (!lcd.active) return;
      lcd.removeAll(true);
      // 段が 上がるほど 色が アツく(さいごの 段は 決まった 色)
      const t: ColorTier = i === level - 1 ? tier : (['blue', 'green', 'red', 'gold'] as const)[Math.min(3, i)];
      if (art && scene.textures.exists(stepKey(i + 1))) {
        // 企画者の STEP 1〜5 の 絵(1 青・2 緑・3 赤・4 金・5 虹)。うしろに 同じ 絵を 大きく うすく(液晶 いっぱい)、まん中に 絵 ぜんぶ
        const key = stepKey(i + 1);
        const back = scene.add.image(0, 0, key);
        const kb = Math.max((w - 8) / back.width, (h - 8) / back.height);
        back.setScale(kb).setAlpha(0.55);
        const cw = (w - 8) / kb;
        const ch = (h - 8) / kb;
        back.setCrop((back.width - cw) / 2, (back.height - ch) / 2, cw, ch);
        const img = scene.add.image(0, -h * 0.02, key);
        const k = Math.min((h * 0.9) / img.height, (w * 0.9) / img.width);
        img.setScale(k * 1.6).setAlpha(0);
        const steps = scene.add.container(0, h * 0.43);
        for (let n = 0; n < 5; n++) steps.add(scene.add.rectangle((n - 2) * 44, 0, 36, 12, n <= i ? 0xffd23a : 0x3a2a4a, 1).setStrokeStyle(2, 0x16101c));
        const flash = scene.add.rectangle(0, 0, w - 8, h - 8, 0xffffff, 0.7);
        lcd.add([back, img, steps, flash]);
        scene.tweens.add({ targets: img, scale: k, alpha: 1, duration: 220, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: flash, alpha: 0, duration: 260 });
        audio.se(i >= 3 ? 'mcCutin' : 'mcSelect', { pitch: 1 + i * 0.12 });
        if (i >= 3) scene.cameras.main.shake(160, 0.004 + (i - 3) * 0.003);
        return;
      }
      const flash = scene.add.rectangle(0, 0, w - 20, h - 20, TIER_NUM[t], 0.5);
      const steps = scene.add.container(0, h * 0.3);
      for (let k = 0; k < 5; k++) {
        const on = k <= i;
        steps.add(scene.add.rectangle((k - 2) * 70, 0, 56, 24, on ? TIER_NUM[t] : 0x3a2a4a, 1).setStrokeStyle(3, 0x16101c));
      }
      const label = txt(scene, 0, -h * 0.32, `STEP ${i + 1}`, Math.min(30, h * 0.08), '#ffffff', 5);
      const word = tierText(scene, 0, -h * 0.02, words[i], Math.min(84, h * 0.22), t);
      lcd.add([flash, label, word, steps]);
      word.setScale(2);
      scene.tweens.add({ targets: word, scale: 1, duration: 200, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: flash, alpha: 0.12, duration: per });
      audio.se(i >= 3 ? 'mcCutin' : 'mcSelect', { pitch: 1 + i * 0.12 });
      if (i >= 3) scene.cameras.main.shake(160, 0.004);
    });
  }
  return level * per;
}

/** 1枚絵の 上と 下を 切って よい 量(それぞれ。0.1 = 1割) */
export const ART_CUT = 0.1;

/**
 * 液晶に 1枚絵を 出す(リーチ・ステップアップ)。
 * 2026-11-13 企画者「液晶に 収まってない」→「小さく なるのは 微妙」→「あいだ」:
 * 上と 下は それぞれ ART_CUT まで 切って 大きく。それでも あまる 左右は 同じ 絵を 暗く して うめる
 */
export function fitArt(scene: Phaser.Scene, key: string, cx: number, cy: number, w: number, h: number, tint: number): [Phaser.GameObjects.Image, Phaser.GameObjects.Image] {
  const back = scene.add.image(cx, cy, key);
  const kb = Math.max(w / back.width, h / back.height);
  back.setScale(kb).setTint(tint);
  back.setCrop((back.width - w / kb) / 2, (back.height - h / kb) / 2, w / kb, h / kb);
  const img = scene.add.image(cx, cy, key);
  const k = Math.max(Math.min(w / img.width, h / img.height), Math.min(kb, h / (img.height * (1 - 2 * ART_CUT))));
  img.setScale(k);
  const cw = Math.min(img.width, w / k);
  const ch = Math.min(img.height, h / k);
  img.setCrop((img.width - cw) / 2, (img.height - ch) / 2, cw, ch);
  return [back, img];
}

/** ステップアップ(白黒の 1枚絵): 段ごとに 液晶 いっぱいに 白黒の 1枚目が 出る。段が 上がるほど 大きく ゆれる */
function faceSteps(scene: Phaser.Scene, lcd: Phaser.GameObjects.Container, box: LcdBox, level: number, faces: string[], fast: boolean): number {
  const per = fast ? 500 : 850;
  const { w, h } = box;
  for (let i = 0; i < level; i++) {
    scene.time.delayedCall(i * per, () => {
      if (!lcd.active) return;
      lcd.removeAll(true);
      const [back, img] = fitArt(scene, faces[i], 0, 0, w - 8, h - 8, 0x3a3a3a);
      const kk = img.scale;
      img.setScale(kk * 1.08);
      const steps = scene.add.container(0, h * 0.42);
      for (let n = 0; n < faces.length; n++) steps.add(scene.add.rectangle((n - (faces.length - 1) / 2) * 44, 0, 36, 12, n <= i ? 0xffd23a : 0x3a2a4a, 1).setStrokeStyle(2, 0x16101c));
      const label = txt(scene, 0, -h * 0.38, `STEP ${i + 1}`, Math.min(30, h * 0.08), '#ffffff', 6);
      const flash = scene.add.rectangle(0, 0, w - 8, h - 8, 0xffffff, 0.8);
      lcd.add([back, img, steps, label, flash]);
      scene.tweens.add({ targets: img, scale: kk, duration: 260, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: flash, alpha: 0, duration: 280 });
      audio.se(i >= 3 ? 'mcCutin' : 'mcSelect', { pitch: 1 + i * 0.12 });
      if (i >= 2) scene.cameras.main.shake(160, 0.003 + (i - 2) * 0.002);
    });
  }
  return level * per;
}

/** ⑦ カットイン【仮：シルエット】。キャラの 絵が 届いたら その 絵(友だち・CROWNIE) */
export function cutIn(scene: Phaser.Scene, lcd: Phaser.GameObjects.Container, box: LcdBox, word: string, tier: ColorTier): void {
  const { w, h } = box;
  // 液晶の 外に はみ出さない ように、その場で 開いて 閉じる
  const c = scene.add.container(0, 0).setScale(0, 1);
  const band = scene.add.rectangle(0, 0, w - 30, h * 0.46, TIER_NUM[tier], 0.92).setAngle(-3);
  const band2 = scene.add.rectangle(0, 0, w - 40, h * 0.38, 0x16101c, 0.92).setAngle(-3);
  const sil = scene.add.graphics();
  sil.fillStyle(0x000000, 0.9).fillCircle(-w * 0.25, -h * 0.04, h * 0.12).fillRoundedRect(-w * 0.25 - h * 0.13, h * 0.06, h * 0.26, h * 0.2, 20);
  const t = tierText(scene, w * 0.12, 0, word, Math.min(60, h * 0.16), tier);
  c.add([band, band2, sil, t]);
  lcd.add(c);
  scene.tweens.add({ targets: c, scaleX: 1, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: sil, x: { from: -w * 0.2, to: 0 }, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, scaleY: 0, duration: 180, delay: 780, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  audio.se('mcCutin');
}

/**
 * ③ PUSH ボタン: 液晶に「PUSH!」。押すと 画面が ゆれて 結果へ(オートの 時・しばらく 押さない 時は 自動で)
 */
export function pushButton(scene: Phaser.Scene, lcd: Phaser.GameObjects.Container, box: LcdBox, tier: ColorTier, autoMs: number, onPress: () => void): void {
  const { h } = box;
  let done = false;
  const c = scene.add.container(0, h * 0.18);
  const r = Math.min(110, h * 0.28);
  // 企画者の PUSH ボタンの 絵(2026-11-10)。まわりの 光の 色で 期待度(②)
  const art = scene.textures.exists(PUSH_KEY);
  const ring = scene.add.circle(0, 0, art ? r * 1.18 : r, TIER_NUM[tier], art ? 0.55 : 0.95);
  if (!art) ring.setStrokeStyle(10, 0x16101c);
  c.add(ring);
  let hit: Phaser.GameObjects.GameObject = ring;
  if (art) {
    const img = scene.add.image(0, 0, PUSH_KEY);
    img.setScale((r * 2) / img.width);
    c.add(img);
    hit = img;
    scene.tweens.add({ targets: ring, scale: 1.15, alpha: 0.25, duration: 380, yoyo: true, repeat: -1 });
  } else c.add(txt(scene, 0, 0, 'PUSH!', Math.min(64, h * 0.17), tier === 'gold' || tier === 'rainbow' ? '#16101c' : '#ffffff', 6));
  lcd.add(c);
  scene.tweens.add({ targets: c, scale: { from: 0.4, to: 1 }, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, scale: 1.1, duration: 260, yoyo: true, repeat: -1, delay: 240 });
  if (tier === 'rainbow') scene.tweens.addCounter({ from: 0, to: 360, duration: 1200, repeat: -1, onUpdate: (tw) => ring.active && ring.setFillStyle(Phaser.Display.Color.HSVToRGB((tw.getValue() ?? 0) / 360, 0.6, 1).color) });
  audio.se('beep');
  const press = () => {
    if (done) return;
    done = true;
    audio.se('punchHeavy');
    scene.cameras.main.shake(260, 0.01);
    scene.tweens.add({ targets: c, scale: 1.6, alpha: 0, duration: 220, onComplete: () => c.destroy() });
    onPress();
  };
  hit.setInteractive({ useHandCursor: true }).once('pointerdown', press);
  scene.time.delayedCall(autoMs, press);
}

/** ⑥ 待っている 間の 液晶【仮】: 背景の 線が 流れて、キャラ(シルエット)が はねる。絵が 届いたら キャラと 背景の 絵 */
export function idleAnim(scene: Phaser.Scene, box: LcdBox): Phaser.GameObjects.GameObject[] {
  const { w, h } = box;
  const items: Phaser.GameObjects.GameObject[] = [];
  // ななめの 線が 流れる(液晶の 四角の 中だけ)
  const stripes = scene.add.graphics();
  const hw = w / 2 - 10;
  const hh = h / 2 - 10;
  const slant = h * 0.35;
  const drawStripes = (off: number) => {
    if (!stripes.active) return;
    stripes.clear();
    for (let k = -8; k < 10; k++) {
      const x0 = k * 70 + off;
      const pts = clipRect([[x0 - slant, hh], [x0 + 34 - slant, hh], [x0 + 34 + slant, -hh], [x0 + slant, -hh]], hw, hh);
      if (pts.length < 3) continue;
      stripes.fillStyle(k % 2 ? 0x9b5cff : 0xff8a1f, 0.07).fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    }
  };
  drawStripes(0);
  scene.tweens.addCounter({ from: 0, to: 140, duration: 2400, repeat: -1, onUpdate: (tw) => drawStripes(tw.getValue() ?? 0) });
  items.push(stripes);
  const sil = scene.add.graphics();
  sil.fillStyle(0x000000, 0.35).fillCircle(0, -26, 34).fillRoundedRect(-40, 6, 80, 70, 24);
  sil.setPosition(w * 0.3, h * 0.22);
  scene.tweens.add({ targets: sil, y: sil.y - 18, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeOut' });
  items.push(sil);
  for (let k = 0; k < 6; k++) {
    const st = txt(scene, (Math.random() - 0.5) * w * 0.9, (Math.random() - 0.5) * h * 0.8, '✦', 18 + Math.random() * 16, '#fff2a8').setAlpha(0);
    scene.tweens.add({ targets: st, alpha: 0.8, duration: 600, yoyo: true, repeat: -1, delay: k * 350 });
    items.push(st);
  }
  return items;
}

/** ⑧ 告知ランプ(MONZ の オリジナル: 王冠の 形)。当たりが 決まって いる 時だけ 光る */
/** 企画者の 告知ランプの 絵(消えている・光っている。2026-11-10。元は design/slot/lamp_off.png・lamp_on.png) */
export const LAMP_OFF_KEY = 'slot:lamp:off';
export const LAMP_ON_KEY = 'slot:lamp:on';
export const LAMP_FILES: [string, string][] = [
  [LAMP_OFF_KEY, 'assets/slot/lamp_off.webp'],
  [LAMP_ON_KEY, 'assets/slot/lamp_on.webp'],
];

export class NoticeLamp {
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Arc;
  private offImg?: Phaser.GameObjects.Image;
  private onImg?: Phaser.GameObjects.Image;
  private ev?: Phaser.Time.TimerEvent;
  lit = false;

  /** size: ランプの 横はば */
  constructor(private scene: Phaser.Scene, x: number, y: number, size = 76) {
    this.glow = scene.add.circle(x, y, size * 0.7, 0xffffff, 0).setDepth(7);
    this.g = scene.add.graphics().setDepth(7.5).setPosition(x, y);
    if (scene.textures.exists(LAMP_OFF_KEY) && scene.textures.exists(LAMP_ON_KEY)) {
      this.offImg = scene.add.image(x, y, LAMP_OFF_KEY).setDepth(7.5);
      this.offImg.setScale(size / this.offImg.width);
      this.onImg = scene.add.image(x, y - size * 0.08, LAMP_ON_KEY).setDepth(7.6).setVisible(false);
      this.onImg.setScale((size * 1.25) / this.onImg.width);
    } else this.paint(0x4a3a5a);
  }

  private paint(color: number): void {
    if (this.offImg) return;
    const g = this.g.clear();
    g.fillStyle(color, 1).lineStyle(5, 0x16101c, 1);
    const pts = [[-30, 18], [-30, -12], [-15, 2], [0, -22], [15, 2], [30, -12], [30, 18]].map(([x, y]) => new Phaser.Math.Vector2(x, y));
    g.fillPoints(pts, true).strokePoints(pts, true);
  }

  /** 光る(キュイン!)。まわりが 虹色に 光る */
  light(): void {
    if (this.lit) return;
    this.lit = true;
    let hue = 0;
    this.ev = this.scene.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        hue = (hue + 0.05) % 1;
        const c = Phaser.Display.Color.HSVToRGB(hue, 0.7, 1) as { color: number };
        this.paint(c.color);
        this.glow.setFillStyle(c.color, 0.45);
      },
    });
    this.scene.tweens.add({ targets: this.glow, scale: { from: 0.6, to: 1.4 }, duration: 380, yoyo: true, repeat: -1 });
    if (this.onImg && this.offImg) {
      this.offImg.setVisible(false);
      const base = this.onImg.scale;
      this.onImg.setVisible(true).setScale(base * 1.8);
      this.scene.tweens.add({ targets: this.onImg, scale: base, duration: 260, ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: this.onImg, scale: base * 1.08, duration: 300, yoyo: true, repeat: -1, delay: 280 });
      this.onImg.setData('base', base);
    }
    audio.se('mcMagic', { pitch: 1.6 });
    this.scene.time.delayedCall(140, () => audio.se('mcMagic', { pitch: 2 }));
    this.scene.cameras.main.flash(200, 255, 255, 255);
  }

  /** 見せる・かくす(宝箱ボーナスの 間は かくす) */
  show(v: boolean): void {
    for (const o of [this.glow, this.g, this.offImg, this.onImg]) o?.setAlpha(v ? 1 : 0);
  }

  off(): void {
    if (!this.lit) return;
    this.lit = false;
    this.ev?.remove();
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.setFillStyle(0xffffff, 0).setScale(1);
    if (this.onImg && this.offImg) {
      this.scene.tweens.killTweensOf(this.onImg);
      this.onImg.setVisible(false).setScale(this.onImg.getData('base') ?? this.onImg.scale);
      this.offImg.setVisible(true);
    }
    this.paint(0x4a3a5a);
  }
}

const COIN_KEY = 'slot:coin';
/** 企画者の コインの 絵(2026-11-10。元は design/slot/coin.png) */
export const COIN_ART_KEY = 'slot:coinart';
export const COIN_ART_FILE = 'assets/slot/coin.webp';

/** ⑤ コインが あふれる(大きい 当たり)。ジャラジャラ */
export function coinFountain(scene: Phaser.Scene, x: number, y: number, count: number): void {
  if (!scene.textures.exists(COIN_KEY)) {
    const t = scene.textures.createCanvas(COIN_KEY, 48, 48);
    const ctx = t?.getContext();
    if (t && ctx) {
      ctx.fillStyle = '#ffc21a';
      ctx.strokeStyle = '#16101c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(24, 24, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath();
      ctx.arc(19, 18, 6, 0, Math.PI * 2);
      ctx.fill();
      t.refresh();
    }
  }
  const H = scene.scale.height;
  for (let i = 0; i < count; i++) {
    const art = scene.textures.exists(COIN_ART_KEY);
    const c = scene.add.image(x + (Math.random() - 0.5) * 80, y, art ? COIN_ART_KEY : COIN_KEY).setDepth(25);
    c.setScale((48 / c.width) * (0.6 + Math.random() * 0.6));
    const vx = (Math.random() - 0.5) * 900;
    const up = 500 + Math.random() * 700;
    const t0 = i * 18;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1500,
      delay: t0,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        c.setPosition(x + vx * k, y - up * k + 1500 * k * k);
        c.setAngle(k * 720);
        if (c.y > H + 60) c.setVisible(false);
      },
      onComplete: () => c.destroy(),
    });
    if (i % 4 === 0) scene.time.delayedCall(t0, () => audio.se('tap', { pitch: 1.6 + Math.random() * 0.6 }));
  }
}

/** 多角形を 四角(-hw..hw, -hh..hh)の 中だけに 切る */
function clipRect(pts: [number, number][], hw: number, hh: number): [number, number][] {
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= -hw, (a, b) => [-hw, a[1] + ((b[1] - a[1]) * (-hw - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= hw, (a, b) => [hw, a[1] + ((b[1] - a[1]) * (hw - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= -hh, (a, b) => [a[0] + ((b[0] - a[0]) * (-hh - a[1])) / (b[1] - a[1]), -hh]],
    [(p) => p[1] <= hh, (a, b) => [a[0] + ((b[0] - a[0]) * (hh - a[1])) / (b[1] - a[1]), hh]],
  ];
  let out = pts;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

/**
 * まわる 光の 線(液晶の 四角の 中だけ)。cx・cy: 光の 中心(液晶の まん中から)。box: 液晶の 大きさ
 */
export function lcdRays(scene: Phaser.Scene, box: LcdBox, color: number | ((i: number, n: number) => number), alpha: number, n: number, cx = 0, cy = 0, turnMs = 4000): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const hw = box.w / 2 - 10;
  const hh = box.h / 2 - 10;
  const R = Math.hypot(box.w, box.h);
  const draw = (deg: number) => {
    if (!g.active) return;
    g.clear();
    const off = (deg * Math.PI) / 180;
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2;
      const a2 = a + (Math.PI / n) * 0.9;
      const tri: [number, number][] = [
        [cx, cy],
        [cx + Math.cos(a) * R, cy + Math.sin(a) * R],
        [cx + Math.cos(a2) * R, cy + Math.sin(a2) * R],
      ];
      const pts = clipRect(tri, hw, hh);
      if (pts.length < 3) continue;
      g.fillStyle(typeof color === 'function' ? color(k, n) : color, alpha);
      g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    }
  };
  draw(0);
  scene.tweens.addCounter({ from: 0, to: 360, duration: turnMs, repeat: -1, onUpdate: (tw) => draw(tw.getValue() ?? 0) });
  return g;
}
