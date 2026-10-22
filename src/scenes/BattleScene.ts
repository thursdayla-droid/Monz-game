import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { BUNK_ATTACKS, HP_MAX, MOVE, newPractice, NO_INPUT, stepBattle, STOCKS, type Battle, type BattleEvent, type Fighter, type Input } from '../core/battle';
import { PALETTES } from '../core/palettes';
import { recolorPixels } from '../core/recolor';
import { BUNK_MOTION } from '../render/bunkView';
import { preloadPacks } from '../render/packs';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { DASH_PLAT_KEY } from './DashScene';

const W = 720;
const H = 1280;
const INK = '#16101c';
/** 下の操作ボタンの帯の上のはし */
const PAD_TOP = 900;
/** 【仮】BUNKの画面での大きさ(元画像1pxあたり) */
const FIGHTER_SCALE = 0.118;
/** 【仮】色違いのBUNK(練習の的)の配色(企画者決定 2026-10-22: 相手は色違いのBUNK) */
const ALT_PALETTE = PALETTES.find((p) => p.id === 'cobalt')!;
/** 足場の絵(DASH MONZ の足場を【仮】で使う)の各部分の幅と高さ */
const PLAT = { left: 121, mid: 459, right: 123, h: 94, surface: 16 };

/** 操作ボタン(画面の座標・半径) */
const STICK = { x: 165, y: 1090, r: 120, knob: 52 };
const BUTTONS = {
  a: { x: 612, y: 1045, r: 72, label: 'A', color: 0xff5a4e },
  jump: { x: 478, y: 962, r: 58, label: 'ジャンプ', color: 0xffd23a },
  shield: { x: 462, y: 1150, r: 58, label: 'ガード', color: 0x4ec3ff },
  b: { x: 612, y: 1200, r: 52, label: 'B', color: 0x8a8394 },
} as const;
type ButtonName = keyof typeof BUTTONS;

interface PartsManifest {
  parts: Record<string, { x: number; y: number; w: number; h: number; z: number }>;
}

/**
 * BUNKの見た目(バトル用)。元画像から切り出したパーツ(構えた姿)を並べて、拳・足・体の傾きで攻撃の形にする。
 * 絵は描き直さない。【仮】攻撃の専用ポーズの絵が届いたら差しかえる。
 */
class FighterView {
  readonly root: Phaser.GameObjects.Container;
  private readonly actor: Phaser.GameObjects.Container;
  private readonly parts = new Map<string, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  private readonly shield: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private flash = 0;

  constructor(scene: Phaser.Scene, alt: boolean) {
    const manifest = scene.cache.json.get('bunk:guard:manifest') as PartsManifest;
    const [ax, ay] = BUNK_MOTION.anchor;
    this.shadow = scene.add.ellipse(0, 0, 120, 18, 0x000000, 0.35).setDepth(9);
    this.root = scene.add.container(0, 0).setDepth(10);
    this.actor = scene.add.container(0, 0);
    this.root.add(this.actor);
    const names = Object.entries(manifest.parts).sort((a, b) => a[1].z - b[1].z);
    for (const [name, p] of names) {
      const key = alt ? altTexture(scene, `bunk:guard:${name}`) : `bunk:guard:${name}`;
      // 目は反転しない(企画者の指示): 目だけ自分の中心で もう一度反転できるように、中心を原点にする
      const img = scene.add.image(p.x - ax + p.w / 2, p.y - ay + p.h / 2, key);
      this.actor.add(img);
      this.parts.set(name, { img, x: img.x, y: img.y });
    }
    this.actor.setScale(FIGHTER_SCALE);
    this.shield = scene.add.circle(0, -MOVE.height / 2, 78, 0x4ec3ff, 0.32).setStrokeStyle(4, 0xbfeaff, 0.9).setVisible(false);
    this.root.add(this.shield);
  }

  hurt(): void {
    this.flash = 0.12;
  }

  update(f: Fighter, t: number, dt: number, floorY: number | null): void {
    const out = f.out > 0;
    this.root.setVisible(!out);
    this.shadow.setVisible(!out && floorY !== null);
    if (out) return;
    if (floorY !== null) {
      const h = Math.max(0, floorY - f.y);
      this.shadow.setPosition(f.x, floorY + 2).setScale(Math.max(0.3, 1 - h / 400));
    }
    this.root.setPosition(f.x, f.y);
    // 向き: 右向きがそのまま。左は反転(目だけは反転しない)
    this.actor.scaleX = FIGHTER_SCALE * f.face;
    for (const eye of ['eye_l', 'eye_r']) this.parts.get(eye)?.img.setScale(f.face, 1);

    // 攻撃の形(0→1→0)
    let punch = 0;
    let name = '';
    if (f.attack) {
      const d = BUNK_ATTACKS[f.attack.name];
      const a = f.attack.t;
      name = f.attack.name;
      punch = a < d.startup ? (a / d.startup) * 0.6 : a < d.startup + d.active ? 1 : Math.max(0, 1 - (a - d.startup - d.active) / d.recovery);
    }
    const set = (part: string, dx: number, dy: number, rot = 0, sc = 1) => {
      const p = this.parts.get(part);
      if (p) p.img.setPosition(p.x + dx, p.y + dy).setRotation(rot).setScale(part.startsWith('eye') ? f.face * sc : sc, sc);
    };
    for (const n of this.parts.keys()) set(n, 0, 0);
    let rot = 0;
    let sy = 1;
    let y = 0;
    if (name === 'jab') set('glove_r', 230 * punch, -20 * punch);
    if (name === 'side') {
      set('glove_r', 420 * punch, -40 * punch, 0, 1 + 0.08 * punch);
      set('glove_l', 80 * punch, 0);
      rot = 7 * punch;
    }
    if (name === 'up') {
      set('glove_r', -60 * punch, -620 * punch, -0.3 * punch, 1 + 0.06 * punch);
      rot = -6 * punch;
      y = -6 * punch;
    }
    if (name === 'down') {
      set('foot_r', 300 * punch, -30 * punch);
      sy = 1 - 0.14 * punch;
      rot = 6 * punch;
    }
    // 歩く・空中・吹っ飛び
    if (!f.attack) {
      if (f.walking) {
        y = -Math.abs(Math.sin(t * 14)) * 7;
        rot = Math.sin(t * 14) * 4;
      } else if (!f.ground) {
        rot = f.vy < 0 ? -5 : 4;
      } else {
        sy = 1 + Math.sin(t * 4) * 0.012;
      }
    }
    if (f.stun > 0 && !f.ground) rot += (t * 900) % 360;
    this.actor.setRotation(((rot * f.face) * Math.PI) / 180).setPosition(0, y);
    this.actor.scaleY = FIGHTER_SCALE * sy;
    this.shield.setVisible(f.shield);
    // 当たった瞬間は白く光る。復活したばかりは点滅
    this.flash = Math.max(0, this.flash - dt);
    for (const { img } of this.parts.values()) {
      if (this.flash > 0) {
        img.setTint(0xffffff);
        img.tintMode = Phaser.TintModes.FILL;
      } else {
        img.clearTint();
        img.tintMode = Phaser.TintModes.MULTIPLY;
      }
    }
    this.root.setAlpha(f.safe > 0 && Math.floor(t * 12) % 2 ? 0.45 : 1);
  }
}

/** 色違いの絵(パーツの絵の色をぬりかえた物)を作る。陰影は元の絵のまま */
function altTexture(scene: Phaser.Scene, key: string): string {
  const alt = `battle:alt:${key}`;
  if (scene.textures.exists(alt)) return alt;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const tex = scene.textures.createCanvas(alt, src.width, src.height);
  const ctx = tex?.getContext();
  if (!tex || !ctx) return key;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, src.width, src.height);
  recolorPixels(data.data, ALT_PALETTE, { belly: true });
  ctx.putImageData(data, 0, 0);
  tex.refresh();
  return alt;
}

/**
 * バトル(企画者の仕様 2026-10-22、docs/BATTLE.md)。今は練習場:
 * BUNKを動かして(移動・2段ジャンプ・ガード・A攻撃4つ)、動かない的(色違いのBUNK)をたたく。
 * 【仮】ステージ・背景・ボタンの絵、BGM、数字。B必殺技はまだ(ボタンだけ)
 */
export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views: FighterView[] = [];
  private t = 0;
  private acc = 0;
  private stick = { id: -1, x: 0, y: 0 };
  private held: Partial<Record<ButtonName, number>> = {};
  private pressed = { a: false, jump: false };
  private knob!: Phaser.GameObjects.Arc;
  private buttonGfx: Partial<Record<ButtonName, Phaser.GameObjects.Container>> = {};
  private hud: { hp: Phaser.GameObjects.Graphics; hpText: Phaser.GameObjects.Text; stocks: Phaser.GameObjects.Text }[] = [];
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private leaving = false;

  constructor() {
    super('Battle');
  }

  preload(): void {
    preloadPacks(this, ['bunk', 'dash']);
  }

  create(): void {
    this.t = 0;
    this.acc = 0;
    this.leaving = false;
    this.stick = { id: -1, x: 0, y: 0 };
    this.held = {};
    this.pressed = { a: false, jump: false };
    this.battle = newPractice();
    this.input.addPointer(3);
    this.drawBackground();
    this.drawStage();
    this.views = this.battle.fighters.map((f) => new FighterView(this, f.dummy));
    // 自分のBUNKを、的より手前に
    this.views[0]?.root.setDepth(11);
    this.buildHud();
    this.buildPad();
    this.keys = this.input.keyboard?.addKeys('LEFT,RIGHT,UP,DOWN,Z,X,C,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('dash');
  }

  // ---------------- 見た目 ----------------

  private drawBackground(): void {
    // 【仮】背景: 夜のアリーナっぽい色の帯とライト
    canvasTextureOnce(this, 'battle:bg', W, PAD_TOP, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, PAD_TOP);
      g.addColorStop(0, '#1d0f33');
      g.addColorStop(0.6, '#3a1d5c');
      g.addColorStop(1, '#5e2a5a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, PAD_TOP);
      for (let i = 0; i < 5; i++) {
        const x = 80 + i * 140;
        const beam = ctx.createLinearGradient(x, 0, x, 700);
        beam.addColorStop(0, 'rgba(255,230,160,0.22)');
        beam.addColorStop(1, 'rgba(255,230,160,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(x - 14, 0);
        ctx.lineTo(x + 14, 0);
        ctx.lineTo(x + 90 - i * 45, 700);
        ctx.lineTo(x - 90 - i * 45 + 90, 700);
        ctx.closePath();
        ctx.fill();
      }
    });
    this.add.image(0, 0, 'battle:bg').setOrigin(0, 0).setDepth(-10);
  }

  private drawStage(): void {
    const main = this.battle.stage.platforms.find((p) => !p.thin)!;
    // 大きな足場の下の土台(浮いた島)
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x24123a, 1);
    g.beginPath();
    g.moveTo(main.x0 + 10, main.y + 20);
    g.lineTo(main.x1 - 10, main.y + 20);
    g.lineTo(main.x1 - 90, main.y + 120);
    g.lineTo(main.x0 + 90, main.y + 120);
    g.closePath();
    g.fillPath();
    g.lineStyle(6, 0x16101c, 1).strokePath();
    for (const p of this.battle.stage.platforms) {
      const w = p.x1 - p.x0;
      const h = p.thin ? 34 : 58;
      const key = `battle:plat:${Math.round(w)}:${h}`;
      canvasTextureOnce(this, key, w, h, (ctx) => {
        if (!this.textures.exists(DASH_PLAT_KEY)) {
          ctx.fillStyle = '#c9a0ff';
          ctx.fillRect(0, 0, w, h);
          return;
        }
        const img = this.textures.get(DASH_PLAT_KEY).getSourceImage() as HTMLImageElement;
        const k = h / PLAT.h;
        const lw = PLAT.left * k;
        const rw = PLAT.right * k;
        ctx.drawImage(img, 0, 0, PLAT.left, PLAT.h, 0, 0, lw, h);
        ctx.drawImage(img, PLAT.left, 0, PLAT.mid, PLAT.h, lw, 0, w - lw - rw, h);
        ctx.drawImage(img, PLAT.left + PLAT.mid, 0, PLAT.right, PLAT.h, w - rw, 0, rw, h);
      });
      const surface = PLAT.surface * (h / PLAT.h);
      this.add.image(p.x0, p.y - surface, key).setOrigin(0, 0).setDepth(2);
    }
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = INK): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke, strokeThickness: Math.round(size * 0.18), align: 'center' })
      .setOrigin(0.5)
      .setDepth(50);
  }

  private buildHud(): void {
    const back = this.text(16, 40, '◀ もどる', 26).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    this.text(W / 2, 40, 'れんしゅう', 30, '#ffd23a');
    const names = ['BUNK', 'まと'];
    names.forEach((n, i) => {
      const x = i === 0 ? 24 : W - 24 - 300;
      const y = 82;
      const panel = this.add.graphics().setDepth(49);
      panel.fillStyle(0x16101c, 0.7).fillRoundedRect(x, y, 300, 86, 14);
      this.text(x + 16, y + 24, n, 24).setOrigin(0, 0.5);
      const stocks = this.text(x + 284, y + 24, '', 22, '#ffd23a').setOrigin(1, 0.5);
      const hp = this.add.graphics().setDepth(50);
      const hpText = this.text(x + 284, y + 62, '', 20).setOrigin(1, 0.5);
      this.hud.push({ hp, hpText, stocks });
    });
    // 遊び方(はじめに少しだけ出す)
    const help = this.text(W / 2, 220, 'スティックで いどう\nA：パンチ（スティックの向きで 技が変わる）\nジャンプは 空中でも もう1回', 22, '#ffffff');
    this.tweens.add({ targets: help, alpha: 0, delay: 4500, duration: 800, onComplete: () => help.destroy() });
  }

  private refreshHud(): void {
    this.battle.fighters.forEach((f, i) => {
      const h = this.hud[i];
      if (!h) return;
      const x = i === 0 ? 24 : W - 24 - 300;
      const y = 82;
      const share = f.out > 0 ? 0 : f.hp / HP_MAX;
      h.hp.clear();
      h.hp.fillStyle(0x3a2f45, 1).fillRoundedRect(x + 16, y + 52, 190, 20, 8);
      h.hp.fillStyle(share > 0.5 ? 0x7be36b : share > 0.25 ? 0xffd23a : 0xff5a4e, 1).fillRoundedRect(x + 16, y + 52, Math.max(0.001, 190 * share), 20, 8);
      h.hpText.setText(`HP ${f.out > 0 ? 0 : f.hp}`);
      h.stocks.setText('●'.repeat(f.stocks) + '○'.repeat(Math.max(0, STOCKS - f.stocks)));
    });
  }

  // ---------------- 操作 ----------------

  private buildPad(): void {
    const pad = this.add.graphics().setDepth(40);
    pad.fillStyle(0x16101c, 0.92).fillRect(0, PAD_TOP, W, H - PAD_TOP);
    pad.lineStyle(4, 0x3a2f45, 1).lineBetween(0, PAD_TOP, W, PAD_TOP);
    // スティック
    this.add.circle(STICK.x, STICK.y, STICK.r, 0xffffff, 0.08).setStrokeStyle(5, 0xffffff, 0.35).setDepth(41);
    this.knob = this.add.circle(STICK.x, STICK.y, STICK.knob, 0xffffff, 0.85).setStrokeStyle(5, 0x16101c, 1).setDepth(42);
    for (const [name, b] of Object.entries(BUTTONS) as [ButtonName, (typeof BUTTONS)[ButtonName]][]) {
      const c = this.add.container(b.x, b.y).setDepth(41);
      const circle = this.add.circle(0, 0, b.r, b.color, 1).setStrokeStyle(6, 0x16101c, 1);
      const label = this.add.text(0, 0, b.label, { fontFamily: UI_FONT, fontSize: `${b.label.length > 1 ? 20 : 44}px`, fontStyle: '900', color: INK }).setOrigin(0.5);
      c.add([circle, label]);
      if (name === 'b') c.add(this.add.text(0, b.r - 4, 'SOON', { fontFamily: UI_FONT, fontSize: '16px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101c', padding: { x: 4, y: 1 } }).setOrigin(0.5));
      this.buttonGfx[name] = c;
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private buttonAt(x: number, y: number): ButtonName | null {
    for (const [name, b] of Object.entries(BUTTONS) as [ButtonName, (typeof BUTTONS)[ButtonName]][]) if (Math.hypot(x - b.x, y - b.y) <= b.r + 14) return name;
    return null;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.y < PAD_TOP) return;
    const b = this.buttonAt(p.x, p.y);
    if (b) {
      this.held[b] = p.id;
      if (b === 'a') this.pressed.a = true;
      if (b === 'jump') this.pressed.jump = true;
      this.buttonGfx[b]?.setScale(0.9);
      return;
    }
    // ボタン以外の左がわを触ったら、そこがスティックになる(指の位置がずれても使えるように)
    if (p.x < 360 && this.stick.id < 0) {
      this.stick.id = p.id;
      this.onMove(p);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stick.id) return;
    let dx = p.x - STICK.x;
    let dy = p.y - STICK.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK.r) {
      dx = (dx / len) * STICK.r;
      dy = (dy / len) * STICK.r;
    }
    this.knob.setPosition(STICK.x + dx, STICK.y + dy);
    const dead = 0.22;
    const nx = dx / STICK.r;
    const ny = dy / STICK.r;
    this.stick.x = Math.abs(nx) < dead ? 0 : nx;
    this.stick.y = Math.abs(ny) < dead ? 0 : ny;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stick.id) {
      this.stick = { id: -1, x: 0, y: 0 };
      this.knob.setPosition(STICK.x, STICK.y);
    }
    for (const name of Object.keys(this.held) as ButtonName[]) {
      if (this.held[name] === p.id) {
        delete this.held[name];
        this.buttonGfx[name]?.setScale(1);
      }
    }
  }

  private readInput(): Input {
    const k = this.keys;
    let x = this.stick.x;
    let y = this.stick.y;
    if (k) {
      if (k.LEFT.isDown) x = -1;
      if (k.RIGHT.isDown) x = 1;
      if (k.UP.isDown) y = -1;
      if (k.DOWN.isDown) y = 1;
    }
    const inp: Input = {
      x,
      y,
      a: this.pressed.a || (!!k && Phaser.Input.Keyboard.JustDown(k.Z)),
      jump: this.pressed.jump || (!!k && (Phaser.Input.Keyboard.JustDown(k.X) || Phaser.Input.Keyboard.JustDown(k.SPACE))),
      shield: this.held.shield !== undefined || (!!k && (k.C.isDown || k.SHIFT.isDown)),
    };
    this.pressed = { a: false, jump: false };
    return inp;
  }

  // ---------------- 進める ----------------

  update(_time: number, delta: number): void {
    if (!this.battle) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.t += dt;
    this.acc += dt;
    const step = 1 / 120;
    let inp = this.readInput();
    while (this.acc >= step) {
      this.acc -= step;
      const events = stepBattle(this.battle, [inp, NO_INPUT], step);
      // 押した瞬間の入力は1回だけ使う
      inp = { ...inp, a: false, jump: false };
      for (const e of events) this.onEvent(e);
    }
    this.battle.fighters.forEach((f, i) => this.views[i]?.update(f, this.t, dt, this.floorUnder(f)));
    this.refreshHud();
  }

  /** 影を落とす床の高さ(下に床がなければ null) */
  private floorUnder(f: Fighter): number | null {
    let best: number | null = null;
    for (const p of this.battle.stage.platforms) if (f.x >= p.x0 && f.x <= p.x1 && p.y >= f.y - 1 && (best === null || p.y < best)) best = p.y;
    return best;
  }

  private onEvent(e: BattleEvent): void {
    if (e.kind === 'swing') audio.se('swing', { pitch: e.name === 'jab' ? 1.3 : 1 });
    if (e.kind === 'jump') audio.se('boing', { pitch: 1.4 });
    if (e.kind === 'block') {
      audio.se('knock');
      this.spark(e.x, e.y, 0x4ec3ff, 0.7);
    }
    if (e.kind === 'hit') {
      const i = this.battle.fighters.indexOf(e.target);
      this.views[i]?.hurt();
      audio.se(e.damage >= 8 ? 'slam' : 'knock');
      this.spark(e.x, e.y, 0xffe066, e.damage >= 8 ? 1.4 : 1);
      const n = this.text(e.x, e.y - 30, `${e.damage}`, 34, '#ffd23a');
      this.tweens.add({ targets: n, y: n.y - 50, alpha: 0, duration: 600, onComplete: () => n.destroy() });
      if (e.damage >= 8) this.cameras.main.shake(120, 0.006);
    }
    if (e.kind === 'ko') {
      audio.se('crackBig');
      this.cameras.main.shake(260, 0.012);
      const f = e.target;
      const x = Phaser.Math.Clamp(f.x, 60, W - 60);
      const y = Phaser.Math.Clamp(f.y - 60, 120, PAD_TOP - 60);
      this.spark(x, y, 0xffffff, 2.2);
      const t = this.text(W / 2, 400, e.fell ? 'アウト！' : 'KO！', 64, '#ff5a4e');
      this.tweens.add({ targets: t, scale: 1.3, alpha: 0, delay: 500, duration: 500, onComplete: () => t.destroy() });
    }
  }

  /** 当たったときの光 */
  private spark(x: number, y: number, color: number, size: number): void {
    const g = this.add.graphics().setDepth(30).setPosition(x, y);
    g.fillStyle(color, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 16; i++) {
      const r = (i % 2 ? 14 : 38) * size;
      const a = (i / 16) * Math.PI * 2;
      pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    g.fillPoints(pts, true);
    this.tweens.add({ targets: g, scale: 1.5, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home'));
  }
}
