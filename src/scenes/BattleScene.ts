import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { BATTLE_VIEW, BUNK_ATTACKS, HP_MAX, MOVE, ROLL, SHIELD, newPractice, NO_INPUT, stepBattle, STOCKS, type AttackName, type Battle, type BattleEvent, type Fighter, type Input } from '../core/battle';
import { PALETTES } from '../core/palettes';
import { recolorPixels } from '../core/recolor';
import { BUNK_MOTION } from '../render/bunkView';
import { preloadPacks } from '../render/packs';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { DASH_PLAT_KEY } from './DashScene';
import { cameraBounds, cameraTarget, smoothCamera, type CameraView } from '../core/battleCamera';

/** 横画面(企画者の指示 2026-10-22: 横画面でできるように)。バトルの間だけ、ゲームの画面を横長にする */
const W = 1280;
const H = 720;
/** ほかの画面の大きさ(バトルを出るときに戻す) */
const PORTRAIT = { w: 720, h: 1280 };
const INK = '#16101c';
/** 【仮】BUNKの画面での大きさ(元画像1pxあたり) */
const FIGHTER_SCALE = 0.118;
/** 【仮】色違いのBUNK(練習の的)の配色(企画者決定 2026-10-22: 相手は色違いのBUNK) */
const ALT_PALETTE = PALETTES.find((p) => p.id === 'cobalt')!;
/** 足場の絵(DASH MONZ の足場を【仮】で使う)の各部分の幅と高さ */
/** ローリングで回す中心の高さ(足元から)。小さく丸めた体が地面より下に出ない高さ */
const ROLL_PIVOT = 62;
const PLAT = { left: 121, mid: 459, right: 123, h: 94, surface: 16 };

/** 操作ボタン(画面の座標・半径)。画面の上に重ねて出す。スティックは左がわの触った所に出る */
const STICK = { x: 170, y: 560, r: 100, knob: 46 };
const BUTTONS = {
  a: { x: 1150, y: 540, r: 66, label: 'A', color: 0xff5a4e },
  jump: { x: 1020, y: 460, r: 52, label: 'ジャンプ', color: 0xffd23a },
  shield: { x: 1010, y: 630, r: 52, label: 'ガード', color: 0x4ec3ff },
  b: { x: 1165, y: 650, r: 44, label: 'B', color: 0xb46cff },
} as const;
type ButtonName = keyof typeof BUTTONS;

interface PartsManifest {
  parts: Record<string, { x: number; y: number; w: number; h: number; z: number }>;
}

/** 0〜1 をなめらかに */
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;

/**
 * 攻撃の動きの3つの段階: ためる(startup) → 打つ(active) → もどる(recovery)。
 * windup: ためている強さ(0→1)、strike: 打っている強さ(0→1→0)
 */
function attackPhase(f: Fighter): { name: AttackName | ''; windup: number; strike: number } {
  if (!f.attack) return { name: '', windup: 0, strike: 0 };
  const d = BUNK_ATTACKS[f.attack.name];
  const a = f.attack.t;
  if (a < d.startup) return { name: f.attack.name, windup: easeOut(a / d.startup), strike: 0 };
  if (a < d.startup + d.active) {
    // 打った瞬間に一気に前へ(少し行きすぎてからもどる)
    const k = (a - d.startup) / d.active;
    return { name: f.attack.name, windup: 0, strike: Math.min(1.15, easeOut(Math.min(1, k * 2.2)) * (1 + 0.15 * Math.sin(Math.min(1, k * 2.2) * Math.PI))) };
  }
  const k = (a - d.startup - d.active) / d.recovery;
  return { name: f.attack.name, windup: 0, strike: Math.max(0, 1 - easeIn(Math.min(1, k))) };
}

/**
 * BUNKの見た目(バトル用)。元画像から切り出したパーツ(構えた姿)を並べて、拳・足・体の動きで攻撃の形にする。
 * 絵は描き直さない。【仮】攻撃の専用ポーズの絵が届いたら差しかえる。
 * 企画者の指示(2026-10-23): 2Dの手抜き感をなくして、ちゃんと動いている感じに →
 * ため・打つ・もどるの3段階、体ごと踏みこむ、のび縮み(ジャンプ・着地)、ボクサーのような小きざみな構え、足の運び
 */
class FighterView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly actor: Phaser.GameObjects.Container;
  private readonly parts = new Map<string, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  private readonly shield: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  /** ふらふらしているときに頭の上を回る星 */
  private readonly stars: Phaser.GameObjects.Text[] = [];
  private flash = 0;
  /** 着地・ジャンプの のび縮み(+ でつぶれる、- でのびる) */
  private squash = 0;
  private wasGround = true;
  private walkT = 0;
  /** 当たった瞬間のふるえ */
  private shake = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    alt: boolean,
  ) {
    const manifest = scene.cache.json.get('bunk:guard:manifest') as PartsManifest;
    const [ax, ay] = BUNK_MOTION.anchor;
    this.shadow = scene.add.ellipse(0, 0, 120, 18, 0x000000, 0.35).setDepth(9);
    this.root = scene.add.container(0, 0).setDepth(10);
    // body: 足元を中心に のび縮み・傾き。actor: 左右の向き(反転)と大きさ
    this.body = scene.add.container(0, 0);
    this.actor = scene.add.container(0, 0);
    this.body.add(this.actor);
    this.root.add(this.body);
    const names = Object.entries(manifest.parts).sort((a, b) => a[1].z - b[1].z);
    for (const [name, p] of names) {
      const key = alt ? altTexture(scene, `bunk:guard:${name}`) : `bunk:guard:${name}`;
      // 目は反転しない(企画者の指示): 目だけ自分の中心で もう一度反転できるように、中心を原点にする
      const img = scene.add.image(p.x - ax + p.w / 2, p.y - ay + p.h / 2, key);
      this.actor.add(img);
      this.parts.set(name, { img, x: img.x, y: img.y });
    }
    this.actor.setScale(FIGHTER_SCALE);
    this.shield = scene.add.circle(0, -MOVE.height / 2, SHIELD.maxR, 0x4ec3ff, 0.32).setStrokeStyle(4, 0xbfeaff, 0.9).setVisible(false);
    this.root.add(this.shield);
    for (let i = 0; i < 3; i++) {
      const st = scene.add.text(0, 0, '★', { fontFamily: UI_FONT, fontSize: '30px', color: '#ffd23a', stroke: '#16101c', strokeThickness: 5 }).setOrigin(0.5).setVisible(false);
      this.stars.push(st);
      this.root.add(st);
    }
  }

  hurt(damage: number): void {
    this.flash = 0.1;
    this.shake = 0.08 + damage * 0.012;
  }

  /** 土ぼこり */
  private dust(x: number, y: number, n: number, spread: number): void {
    for (let i = 0; i < n; i++) {
      const c = this.scene.add.circle(x + (Math.random() - 0.5) * 20, y - 4, 7 + Math.random() * 7, 0xe9dcff, 0.7).setDepth(8);
      const dir = i % 2 ? 1 : -1;
      this.scene.tweens.add({ targets: c, x: c.x + dir * (20 + Math.random() * spread), y: c.y - 10 - Math.random() * 16, scale: 1.8, alpha: 0, duration: 320 + Math.random() * 160, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
    }
  }

  update(f: Fighter, t: number, dt: number, floorY: number | null, frozen: boolean): void {
    const out = f.out > 0;
    this.root.setVisible(!out);
    this.shadow.setVisible(!out && floorY !== null);
    if (out) {
      this.wasGround = false;
      return;
    }
    if (floorY !== null) {
      const h = Math.max(0, floorY - f.y);
      this.shadow.setPosition(f.x, floorY + 2).setScale(Math.max(0.3, 1 - h / 400));
    }
    // 着地・ジャンプした瞬間
    const onGround = !!f.ground;
    if (onGround && !this.wasGround) {
      this.squash = 0.22;
      this.dust(f.x, f.y, 4, 30);
      audio.se('land', { pitch: 0.9 + Math.random() * 0.2 });
    }
    if (!onGround && this.wasGround && f.vy < -200) {
      this.squash = -0.2;
      this.dust(f.x, f.y, 3, 18);
    }
    this.wasGround = onGround;
    if (!frozen) this.squash *= Math.max(0, 1 - dt * 10);

    // 当たった瞬間はその場で小さくふるえる
    this.shake = Math.max(0, this.shake - dt);
    const jitter = this.shake > 0 ? (Math.random() - 0.5) * 10 : 0;
    this.root.setPosition(f.x + jitter, f.y);
    // 向き: 右向きがそのまま。左は反転(目だけは反転しない)
    this.actor.scaleX = FIGHTER_SCALE * f.face;

    const { name, windup, strike } = attackPhase(f);
    const set = (part: string, dx: number, dy: number, rot = 0, sx = 1, sy = sx) => {
      const p = this.parts.get(part);
      if (p) p.img.setPosition(p.x + dx, p.y + dy).setRotation(rot).setScale(part.startsWith('eye') ? f.face * sx : sx, sy);
    };
    for (const n of this.parts.keys()) set(n, 0, 0);

    let rot = 0;
    let lean = 0;
    let step = 0;
    let y = 0;
    let sq = this.squash;
    // 構え: ボクサーのように小きざみにはずむ。拳は左右で交互に上下
    const bounce = Math.sin(t * 7.5);
    if (!f.attack && onGround && !f.walking && !f.shield && f.stun <= 0 && f.dizzy <= 0) {
      y = -Math.abs(bounce) * 5;
      set('glove_r', 10 * bounce, -22 * bounce);
      set('glove_l', -8 * bounce, 22 * bounce);
      sq += Math.abs(bounce) * -0.025;
    }
    // 歩く: 足を交互に前へ出して、体を上下させる
    if (f.walking && !f.attack) {
      this.walkT += dt * 13;
      const s = Math.sin(this.walkT);
      set('foot_l', 70 * s, -Math.max(0, s) * 60);
      set('foot_r', -70 * s, -Math.max(0, -s) * 60);
      set('glove_r', 40 * s, -20);
      set('glove_l', -40 * s, -10);
      y = -Math.abs(s) * 9;
      lean = 6;
    }
    // 空中: のぼりは体をのばして足を引く、くだりは手足を広げる
    if (!onGround && !f.attack && f.stun <= 0) {
      if (f.vy < 0) {
        set('foot_l', 30, -90);
        set('foot_r', -20, -80);
        set('glove_r', 30, -60);
        lean = -4;
      } else {
        set('foot_l', -30, 20);
        set('foot_r', 40, 10);
        set('glove_l', -60, -40);
        set('glove_r', 60, -50);
        lean = 4;
      }
    }
    // 攻撃: ためで後ろへ引いて、打つときに体ごと踏みこむ
    if (name === 'jab') {
      set('glove_r', -60 * windup + 330 * strike, -10 * windup - 30 * strike, 0, 1 + 0.1 * strike);
      set('glove_l', 30 * strike, 20 * strike);
      lean = -3 * windup + 6 * strike;
      step = 8 * strike;
    }
    if (name === 'side' || name === 'climb') {
      set('glove_r', -200 * windup + 560 * strike, 10 * windup - 50 * strike, -0.15 * windup, 1 + 0.18 * strike, 1 + 0.1 * strike);
      set('glove_l', -80 * windup + 120 * strike, 30 * strike);
      set('foot_r', 40 * strike, 0);
      set('foot_l', -60 * strike, 0);
      lean = -9 * windup + 14 * strike;
      step = -6 * windup + 22 * strike;
      sq += 0.06 * windup - 0.05 * strike;
    }
    if (name === 'up') {
      // しゃがんでためて、のびあがって突き上げる
      set('glove_r', 60 * windup - 60 * strike, 160 * windup - 600 * strike, 0.2 * windup - 0.35 * strike, 1 + 0.12 * strike);
      set('glove_l', 40 * strike, 60 * strike);
      lean = 6 * windup - 10 * strike;
      sq += 0.16 * windup - 0.16 * strike;
      y = -14 * strike;
      step = 6 * strike;
    }
    if (name === 'down') {
      // 下パンチ(企画者の指示 2026-10-23: 足払いをやめてパンチに): 低くしゃがんで、前の下へ打ちこむ
      set('glove_r', -60 * windup + 420 * strike, -40 * windup + 420 * strike, 0.4 * strike, 1 + 0.12 * strike);
      set('glove_l', 60 * strike, 120 * strike);
      lean = -4 * windup + 16 * strike;
      sq += 0.12 * windup + 0.14 * strike;
      step = 16 * strike;
    }
    if (name === 'air_down') {
      // 空中の下A(企画者の指示 2026-10-23): 真下にパンチ。拳をふり上げてから、足の間を通して真下へ
      set('glove_r', -60 * windup - 470 * strike, -160 * windup + 600 * strike, -0.2 * windup + 1.5 * strike, 1 + 0.15 * strike);
      set('glove_l', -40 * strike, -60 * strike);
      set('foot_l', -90 * strike, -110 * strike);
      set('foot_r', 110 * strike, -110 * strike);
      sq += -0.08 * windup + 0.1 * strike;
      y = 10 * strike;
    }
    // 攻撃を受けて飛んでいる(企画者の指示 2026-10-23: くるくる回さない): のけぞって、手足をばたつかせる
    if (f.stun > 0 && !onGround) {
      const flail = Math.sin(t * 22);
      // 上へ飛ぶときは のけぞる、落ちるときは少し前へ
      lean = -12 + Phaser.Math.Clamp(f.vy / 90, -6, 10);
      set('glove_l', -60, -120 + flail * 30);
      set('glove_r', 60, -140 - flail * 30);
      set('foot_l', -20 - flail * 20, 30);
      set('foot_r', 30 + flail * 20, 30);
      sq -= 0.06;
    }
    // 地上でくらった(はねずに その場で): 少しのけぞる
    if (f.stun > 0 && onGround) {
      lean = -10;
      set('glove_l', -40, -60);
      set('glove_r', 40, -80);
      sq += 0.06;
    }
    // ガード: 両手を前で固める
    if (f.shield) {
      set('glove_r', -120, -40);
      set('glove_l', 140, -20);
      sq += 0.06;
    }
    // ガードが割れて ふらふら(企画者の指示 2026-10-23): 体を左右にゆらして、腕はだらんと下げる。頭の上で星が回る
    const dizzy = f.dizzy > 0 && f.stun <= 0;
    if (dizzy) {
      const w = Math.sin(t * 6);
      rot = w * 12;
      lean = 0;
      y = -Math.abs(Math.sin(t * 3)) * 4;
      set('glove_l', -40, 160 + w * 30, 0.3);
      set('glove_r', 40, 160 - w * 30, -0.3);
      set('foot_l', w * 30, 0);
      set('foot_r', -w * 30, 0);
      sq += 0.04;
    }
    this.stars.forEach((st, i) => {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      st.setVisible(dizzy).setPosition(Math.cos(a) * 46, -MOVE.height - 22 + Math.sin(a) * 12).setScale(Math.sin(a) > 0 ? 1 : 0.75);
      st.setDepth(Math.sin(a) > 0 ? 1 : -1);
    });
    // 上B(上へ上がる技。企画者の指示 2026-10-23): 両手を突き上げて、体をのばす。曲げた向きへ少し傾く
    if (f.special) {
      set('glove_r', -60, -520, -0.2, 1.1);
      set('glove_l', 260, -380, 0.2, 1.05);
      set('foot_l', 20, 40);
      set('foot_r', -20, 50);
      lean = (f.special.dx * f.face) * 40;
      sq -= 0.14;
    }
    // しりもち落下: 手足をだらんとして、少しうつむく
    if (f.freefall && !f.special && !onGround) {
      set('glove_l', -30, 80);
      set('glove_r', 30, 90);
      set('foot_l', -20, 30);
      set('foot_r', 20, 30);
      lean = 8;
    }
    // 崖につかまっている: 両手を上にのばして、足場のはしをつかむ
    if (f.ledge) {
      set('glove_r', 40, -560);
      set('glove_l', 300, -520);
      set('foot_l', -20, 40 + Math.sin(t * 3) * 10);
      set('foot_r', 20, 40 - Math.sin(t * 3) * 10);
      lean = 0;
      y = 0;
    }
    // 崖から登っている: ひざを引いて、体を持ち上げる
    if (f.climb) {
      set('glove_r', 40, -200);
      set('glove_l', 260, -160);
      set('foot_l', 60, -140);
      set('foot_r', -40, -100);
      sq += 0.12;
    }
    // ローリング: 体を丸めて転がる
    if (f.roll) {
      const k = Math.min(1, f.roll.t / ROLL.time);
      // 転がる向きに回る(後ろ向きに転がるときは逆回り)
      rot = -k * 360 * (f.roll.dir === f.face ? 1 : -1);
      set('foot_l', 120, -160);
      set('foot_r', -60, -140);
      set('glove_l', 160, 80);
      set('glove_r', -160, 80);
    }
    let sy = 1 - sq;
    let sx = 1 + sq * 0.6;
    // ローリングは体のまん中を中心に回す(足元で回すと、地面にめりこむため。企画者の指示 2026-10-23)
    const pivot = f.roll ? ROLL_PIVOT : 0;
    if (f.roll) {
      sx = 0.8;
      sy = 0.8;
    }
    this.body.setPosition(0, -pivot).setScale(sx, sy).setRotation((((rot + lean) * f.face) * Math.PI) / 180);
    this.actor.setPosition(step * f.face, y + pivot / sy);
    // ガードの丸: 残りが少ないほど小さく、赤っぽく(企画者の指示 2026-10-23)
    const left = Math.max(0, f.shieldHp);
    const r = SHIELD.minR + (SHIELD.maxR - SHIELD.minR) * left;
    this.shield.setVisible(f.shield).setScale((r / SHIELD.maxR) * (1 + Math.sin(t * 20) * 0.02));
    // 丸の大きさは、のび縮み・傾きとは関係なく見せる(root の直下)
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0xff5a4e), Phaser.Display.Color.ValueToColor(0x4ec3ff), 100, Math.round(left * 100));
    this.shield.setFillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), left < 0.3 ? 0.42 : 0.32);
    // 当たった瞬間は白く光る。復活したばかりは点滅
    this.flash = Math.max(0, this.flash - dt);
    for (const { img } of this.parts.values()) {
      if (this.flash > 0) {
        img.setTint(0xffffff);
        img.tintMode = Phaser.TintModes.FILL;
      } else if (f.freefall && !onGround) {
        // しりもち落下中は少し暗く(もう上Bが使えないのがわかるように)
        img.setTint(0x8a8094);
        img.tintMode = Phaser.TintModes.MULTIPLY;
      } else {
        img.clearTint();
        img.tintMode = Phaser.TintModes.MULTIPLY;
      }
    }
    // 復活したばかりは点滅、ローリング中(無敵)は少し透ける
    this.root.setAlpha(f.roll ? 0.6 : f.safe > 0 && Math.floor(t * 12) % 2 ? 0.45 : 1);
  }
}

/** 色違いの絵(パーツの絵の色をぬりかえた物)を作る。陰影は元の絵のまま */
export function altTexture(scene: Phaser.Scene, key: string): string {
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
  private pressed = { a: false, jump: false, b: false };
  private knob!: Phaser.GameObjects.Arc;
  private buttonGfx: Partial<Record<ButtonName, Phaser.GameObjects.Container>> = {};
  private hud: { hp: Phaser.GameObjects.Graphics; hpText: Phaser.GameObjects.Text; stocks: Phaser.GameObjects.Text }[] = [];
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private leaving = false;
  private stickBase!: Phaser.GameObjects.Arc;
  private stickCenter = { x: STICK.x, y: STICK.y };
  private turnHint?: Phaser.GameObjects.Container;
  private trailT = 0;
  /** 今のカメラ(なめらかに目標へ近づける) */
  private camView?: CameraView;
  /** 画面の外にいるキャラクターの位置を知らせる丸い窓(キャラクターごと) */
  private offscreen: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Battle');
  }

  init(): void {
    this.scale.setGameSize(W, H);
  }

  preload(): void {
    preloadPacks(this, ['bunk', 'dash']);
  }

  /** 上の表示・ボタン用のカメラ(引いて見せるステージとは別に、そのままの大きさで出す) */
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  /** true の間に作った物は、上の表示・ボタン(uiCam だけに映す) */
  private makingUi = false;

  private ui<T>(make: () => T): T {
    this.makingUi = true;
    try {
      return make();
    } finally {
      this.makingUi = false;
    }
  }

  create(): void {
    // ステージは自動ズームのカメラで映す(企画者の仕様 2026-10-23)。HP・ボタンは別のカメラでそのまま
    const cam = this.cameras.main;
    cam.setZoom(W / BATTLE_VIEW.w).centerOn(BATTLE_VIEW.w / 2, BATTLE_VIEW.h / 2);
    this.camView = undefined;
    this.uiCam = this.cameras.add(0, 0, W, H);
    const sort = (go: Phaser.GameObjects.GameObject) => {
      if (this.makingUi) cam.ignore(go);
      else this.uiCam.ignore(go);
    };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, sort);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, sort));
    this.t = 0;
    this.acc = 0;
    this.leaving = false;
    this.stick = { id: -1, x: 0, y: 0 };
    this.held = {};
    this.pressed = { a: false, jump: false, b: false };
    this.hud = [];
    this.buttonGfx = {};
    this.battle = newPractice();
    this.input.addPointer(3);
    this.drawBackground();
    this.drawStage();
    this.views = this.battle.fighters.map((f) => new FighterView(this, f.dummy));
    // 自分のBUNKを、的より手前に
    this.views[0]?.root.setDepth(11);
    this.ui(() => {
      this.buildHud();
      this.buildPad();
      this.buildTurnHint();
      this.offscreen = this.battle.fighters.map((f) => this.buildOffscreen(f.dummy));
    });
    this.updateCamera(1);
    this.keys = this.input.keyboard?.addKeys('LEFT,RIGHT,UP,DOWN,Z,X,C,V,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.uiCam.fadeIn(300, 0, 0, 0);
    audio.playBgm('dash');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
  }

  /** スマホが縦のときは「横にしてね」を出す(そのままでも遊べる) */
  private buildTurnHint(): void {
    const c = this.add.container(W / 2, H / 2).setDepth(90);
    const bg = this.add.rectangle(0, 0, 620, 150, 0x16101c, 0.88).setStrokeStyle(4, 0xffd23a, 1);
    const t = this.text(0, 0, 'スマホを 横にしてね', 44, '#ffd23a');
    c.add([bg, t]);
    this.turnHint = c;
  }

  // ---------------- 見た目 ----------------

  private drawBackground(): void {
    // 【仮】背景: 夜のアリーナっぽい色の帯とライト
    const BW = BATTLE_VIEW.w;
    const BH = BATTLE_VIEW.h;
    canvasTextureOnce(this, 'battle:bg:view', BW, BH, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, BH);
      g.addColorStop(0, '#1d0f33');
      g.addColorStop(0.6, '#3a1d5c');
      g.addColorStop(1, '#5e2a5a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BW, BH);
      for (let i = 0; i < 7; i++) {
        const x = 120 + i * 175;
        const beam = ctx.createLinearGradient(x, 0, x, 600);
        beam.addColorStop(0, 'rgba(255,230,160,0.22)');
        beam.addColorStop(1, 'rgba(255,230,160,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(x - 14, 0);
        ctx.lineTo(x + 14, 0);
        ctx.lineTo(x + 60 - (i - 3) * 40, 600);
        ctx.lineTo(x - 60 - (i - 3) * 40, 600);
        ctx.closePath();
        ctx.fill();
      }
    });
    // 自動ズームでいちばん引いても はしが見えないように、映してよい範囲より大きく広げる
    const b = cameraBounds(this.battle.stage);
    this.add.image(b.x0 - 400, b.y0 - 300, 'battle:bg:view').setOrigin(0, 0).setDisplaySize(b.x1 - b.x0 + 800, b.y1 - b.y0 + 600).setDepth(-10);
  }

  private drawStage(): void {
    const main = this.battle.stage.platforms.find((p) => !p.thin)!;
    // 大きな足場の下の土台(浮いた島)
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x24123a, 1);
    g.beginPath();
    // かたい足場の厚さ(depth)と同じ形(横・下からぶつかる所が見た目でもわかるように)
    const d = main.depth ?? 100;
    g.moveTo(main.x0, main.y + 10);
    g.lineTo(main.x1, main.y + 10);
    g.lineTo(main.x1, main.y + d - 18);
    g.lineTo(main.x1 - 18, main.y + d);
    g.lineTo(main.x0 + 18, main.y + d);
    g.lineTo(main.x0, main.y + d - 18);
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
    const back = this.text(16, 34, '◀ もどる', 26).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    this.text(W / 2, 34, 'れんしゅう', 30, '#ffd23a');
    const names = ['BUNK', 'まと'];
    names.forEach((n, i) => {
      const x = i === 0 ? 24 : W - 24 - 300;
      const y = 62;
      const panel = this.add.graphics().setDepth(49);
      panel.fillStyle(0x16101c, 0.7).fillRoundedRect(x, y, 300, 86, 14);
      this.text(x + 16, y + 24, n, 24).setOrigin(0, 0.5);
      const stocks = this.text(x + 284, y + 24, '', 22, '#ffd23a').setOrigin(1, 0.5);
      const hp = this.add.graphics().setDepth(50);
      const hpText = this.text(x + 284, y + 62, '', 20).setOrigin(1, 0.5);
      this.hud.push({ hp, hpText, stocks });
    });
    // 遊び方(はじめに少しだけ出す)
    const help = this.text(W / 2, 190, 'スティックで いどう　A：パンチ（スティックの向きで 技が変わる）\nジャンプは 空中でも もう1回　空中で 下＋A：真下にパンチ\nガード中に 左右で ローリング（地上だけ）　上＋B：上へ上がる（空中で1回）', 22, '#ffffff');
    this.tweens.add({ targets: help, alpha: 0, delay: 4500, duration: 800, onComplete: () => help.destroy() });
  }

  private refreshHud(): void {
    this.battle.fighters.forEach((f, i) => {
      const h = this.hud[i];
      if (!h) return;
      const x = i === 0 ? 24 : W - 24 - 300;
      const y = 62;
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
    // スティック(画面の上に重ねる。少し透ける)
    this.stickBase = this.add.circle(STICK.x, STICK.y, STICK.r, 0xffffff, 0.1).setStrokeStyle(5, 0xffffff, 0.4).setDepth(41);
    this.knob = this.add.circle(STICK.x, STICK.y, STICK.knob, 0xffffff, 0.7).setStrokeStyle(5, 0x16101c, 1).setDepth(42);
    for (const [name, b] of Object.entries(BUTTONS) as [ButtonName, (typeof BUTTONS)[ButtonName]][]) {
      const c = this.add.container(b.x, b.y).setDepth(41).setAlpha(0.85);
      const circle = this.add.circle(0, 0, b.r, b.color, 1).setStrokeStyle(6, 0x16101c, 1);
      const label = this.add.text(0, 0, b.label, { fontFamily: UI_FONT, fontSize: `${b.label.length > 1 ? 20 : 44}px`, fontStyle: '900', color: INK }).setOrigin(0.5);
      c.add([circle, label]);
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
    // 上の表示(もどる・HP)の所は除く
    if (p.y < 160) return;
    const b = this.buttonAt(p.x, p.y);
    if (b) {
      this.held[b] = p.id;
      if (b === 'a') this.pressed.a = true;
      if (b === 'jump') this.pressed.jump = true;
      if (b === 'b') this.pressed.b = true;
      this.buttonGfx[b]?.setScale(0.9);
      return;
    }
    // 左がわを触ったら、触った所にスティックが出る(指の位置がずれても使えるように)
    if (p.x < W * 0.45 && this.stick.id < 0) {
      this.stick.id = p.id;
      this.stickCenter = { x: Phaser.Math.Clamp(p.x, STICK.r + 10, W * 0.45), y: Phaser.Math.Clamp(p.y, 260, H - STICK.r - 6) };
      this.stickBase.setPosition(this.stickCenter.x, this.stickCenter.y);
      this.onMove(p);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stick.id) return;
    let dx = p.x - this.stickCenter.x;
    let dy = p.y - this.stickCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK.r) {
      dx = (dx / len) * STICK.r;
      dy = (dy / len) * STICK.r;
    }
    this.knob.setPosition(this.stickCenter.x + dx, this.stickCenter.y + dy);
    const dead = 0.22;
    const nx = dx / STICK.r;
    const ny = dy / STICK.r;
    this.stick.x = Math.abs(nx) < dead ? 0 : nx;
    this.stick.y = Math.abs(ny) < dead ? 0 : ny;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stick.id) {
      this.stick = { id: -1, x: 0, y: 0 };
      this.stickCenter = { x: STICK.x, y: STICK.y };
      this.stickBase.setPosition(STICK.x, STICK.y);
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
      b: this.pressed.b || (!!k && Phaser.Input.Keyboard.JustDown(k.V)),
      shield: this.held.shield !== undefined || (!!k && (k.C.isDown || k.SHIFT.isDown)),
    };
    this.pressed = { a: false, jump: false, b: false };
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
      inp = { ...inp, a: false, jump: false, b: false };
      for (const e of events) this.onEvent(e);
    }
    const frozen = this.battle.hitstop > 0;
    // 強く吹っ飛んでいるときは、けむりの尾を引く
    this.trailT -= dt;
    if (this.trailT <= 0 && !frozen) {
      this.trailT = 0.03;
      for (const f of this.battle.fighters) {
        // 上Bで上がっているときは、オレンジの炎の尾
        if (f.special && f.out <= 0) {
          const fire = this.add.circle(f.x + (Math.random() - 0.5) * 30, f.y - 20, 16, Math.random() < 0.5 ? 0xff9a3c : 0xffd23a, 0.85).setDepth(8);
          this.tweens.add({ targets: fire, scale: 0.2, alpha: 0, y: fire.y + 30, duration: 300, onComplete: () => fire.destroy() });
          continue;
        }
        if (f.out > 0 || f.stun <= 0 || Math.hypot(f.vx, f.vy) < 500 || (f.hitBy && BUNK_ATTACKS[f.hitBy].noSpin)) continue;
        const c = this.add.circle(f.x, f.y - MOVE.height / 2, 14, 0xffffff, 0.55).setDepth(8);
        this.tweens.add({ targets: c, scale: 2.2, alpha: 0, duration: 380, onComplete: () => c.destroy() });
      }
    }
    this.battle.fighters.forEach((f, i) => this.views[i]?.update(f, this.t, dt, this.floorUnder(f), frozen));
    this.updateCamera(dt);
    this.refreshHud();
    this.turnHint?.setVisible(window.innerHeight > window.innerWidth);
  }

  /** 自動ズームカメラ: 場にいる全員が映るように、なめらかに寄ったり引いたりする */
  private updateCamera(dt: number): void {
    const pts = this.battle.fighters.filter((f) => f.out <= 0).map((f) => ({ x: f.x, y: f.y }));
    const target = cameraTarget(pts, this.battle.stage, W, H);
    this.camView = this.camView ? smoothCamera(this.camView, target, dt) : target;
    const cam = this.cameras.main;
    cam.setZoom(this.camView.zoom).centerOn(this.camView.x, this.camView.y);
    // 画面の外(上・左右・下)にいるキャラクターは、画面のはしに丸い窓を出して知らせる
    const view = cam.worldView;
    const z = this.camView.zoom;
    this.battle.fighters.forEach((f, i) => {
      const box = this.offscreen[i];
      if (!box) return;
      // 世界の座標 → 画面の座標
      const sx = (f.x - view.x) * z;
      const sy = (f.y - MOVE.height / 2 - view.y) * z;
      // 画面の外、または上の HP の表示の下にかくれている
      const inside = f.out > 0 || (sx > 0 && sx < W && sy > 150 && sy < H + 20);
      box.setVisible(!inside);
      if (inside) return;
      const m = 64;
      const px = Phaser.Math.Clamp(sx, m, W - m);
      const py = Phaser.Math.Clamp(sy, 190, H - m);
      box.setPosition(px, py);
      // 矢印は、キャラクターのいる向き
      box.getAt<Phaser.GameObjects.Graphics>(2)?.setRotation(Math.atan2(sy - py, sx - px));
      // 遠いほど小さく
      const dist = Math.hypot(sx - px, sy - py);
      box.setScale(Phaser.Math.Clamp(1.1 - dist / 1600, 0.6, 1.1));
    });
  }

  /** 画面の外にいるときに出す丸い窓(中にキャラクターの体の絵と、向きの矢印) */
  private buildOffscreen(alt: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setDepth(45).setVisible(false);
    const ring = this.add.circle(0, 0, 44, 0x16101c, 0.85).setStrokeStyle(5, alt ? 0x4ec3ff : 0xff9a3c, 1);
    const key = alt ? altTexture(this, 'bunk:guard:body') : 'bunk:guard:body';
    const img = this.add.image(0, 4, key);
    img.setScale(70 / Math.max(img.width, img.height));
    const arrow = this.add.graphics();
    arrow.fillStyle(alt ? 0x4ec3ff : 0xff9a3c, 1).fillTriangle(62, 0, 46, -12, 46, 12);
    c.add([ring, img, arrow]);
    return c;
  }

  /** 影を落とす床の高さ(下に床がなければ null) */
  private floorUnder(f: Fighter): number | null {
    let best: number | null = null;
    for (const p of this.battle.stage.platforms) if (f.x >= p.x0 && f.x <= p.x1 && p.y >= f.y - 1 && (best === null || p.y < best)) best = p.y;
    return best;
  }

  private onEvent(e: BattleEvent): void {
    if (e.kind === 'swing') {
      audio.se('whoosh', { pitch: e.name === 'jab' ? 1.35 : e.name === 'side' ? 0.85 : 1 });
      this.swoosh(e.who, e.name);
    }
    if (e.kind === 'jump') {
      audio.se('hop', { pitch: e.air ? 1.35 : 1 });
      // 2段目のジャンプ: 足もとに輪
      if (e.air) this.ring(e.who.x, e.who.y, 1.1);
    }
    if (e.kind === 'roll') audio.se('whoosh', { pitch: 0.7 });
    if (e.kind === 'upB') {
      audio.se('whoosh', { pitch: 0.55 });
      audio.se('hop', { pitch: 0.8 });
      this.ring(e.who.x, e.who.y, 1.4);
    }
    if (e.kind === 'ledge') audio.se('land', { pitch: 1.3 });
    if (e.kind === 'climb') audio.se('hop', { pitch: 1.1 });
    if (e.kind === 'shieldBreak') {
      audio.se('crackBig');
      this.spark(e.who.x, e.who.y - MOVE.height / 2, 0x4ec3ff, 1.6);
      const t = this.text(e.who.x, e.who.y - MOVE.height - 60, 'ガードがわれた！', 30, '#9fe3ff');
      this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, delay: 300, duration: 500, onComplete: () => t.destroy() });
    }
    if (e.kind === 'block') {
      audio.se('guard');
      this.spark(e.x, e.y, 0x9fe3ff, 0.7);
    }
    if (e.kind === 'hit') {
      const i = this.battle.fighters.indexOf(e.target);
      this.views[i]?.hurt(e.damage);
      const heavy = e.damage >= 5;
      // 企画者の指示(2026-10-23): ダメージの音を、スマブラ64や鉄拳のように気持ちよく
      audio.se(heavy ? 'punchHeavy' : 'punch', { pitch: 0.9 + e.damage * 0.03 });
      this.spark(e.x, e.y, heavy ? 0xffd23a : 0xfff3b0, heavy ? 1.5 : 1);
      this.ring(e.x, e.y, heavy ? 1.4 : 0.9);
      const n = this.text(e.x, e.y - 34, `${e.damage}`, heavy ? 40 : 30, '#ffd23a').setScale(0.4);
      this.tweens.add({ targets: n, scale: 1, duration: 120, ease: 'Back.easeOut' });
      this.tweens.add({ targets: n, y: n.y - 46, alpha: 0, delay: 260, duration: 420, onComplete: () => n.destroy() });
      this.cameras.main.shake(heavy ? 140 : 70, heavy ? 0.008 : 0.0035);
    }
    if (e.kind === 'ko') {
      audio.se('koBlast');
      this.cameras.main.shake(320, 0.016);
      this.cameras.main.flash(120, 255, 255, 255);
      this.uiCam.shake(200, 0.004);
      const f = e.target;
      const x = Phaser.Math.Clamp(f.x, 80, BATTLE_VIEW.w - 80);
      const y = Phaser.Math.Clamp(f.y - 60, 160, BATTLE_VIEW.h - 80);
      this.spark(x, y, 0xffffff, 2.4);
      this.ring(x, y, 3);
      const t = this.ui(() => this.text(W / 2, 260, e.fell ? 'アウト！' : 'KO！', 72, '#ff5a4e').setScale(0.3));
      this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, scale: 1.3, alpha: 0, delay: 650, duration: 450, onComplete: () => t.destroy() });
    }
  }

  /** 攻撃の軌跡(拳の通り道に白い弧を出す) */
  private swoosh(f: Fighter, name: AttackName): void {
    const d = BUNK_ATTACKS[name];
    this.time.delayedCall(d.startup * 1000, () => {
      const g = this.add.graphics().setDepth(12);
      const cx = f.x + f.face * (d.box.x + d.box.w * 0.45);
      const cy = f.y + d.box.y + d.box.h / 2;
      const r = Math.max(d.box.w, d.box.h) * 0.55;
      // 技ごとの弧の向き(ラジアン、右向きのとき)
      const arcs: Record<AttackName, [number, number]> = { jab: [-0.5, 0.4], side: [-0.7, 0.5], up: [-2.6, -0.4], down: [0.1, 1.3], air_down: [0.9, 2.2], climb: [-0.6, 0.5] };
      let [a0, a1] = arcs[name];
      if (f.face < 0) [a0, a1] = [Math.PI - a1, Math.PI - a0];
      g.lineStyle(name === 'jab' ? 8 : 14, 0xffffff, 0.85);
      g.beginPath();
      g.arc(cx - f.face * r * 0.4, cy, r, a0, a1, false);
      g.strokePath();
      g.lineStyle(4, 0xffd23a, 0.7);
      g.beginPath();
      g.arc(cx - f.face * r * 0.4, cy, r * 0.82, a0, a1, false);
      g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
    });
  }

  /** 当たったときに広がる輪 */
  private ring(x: number, y: number, size: number): void {
    const c = this.add.circle(x, y, 18 * size).setStrokeStyle(6, 0xffffff, 0.9).setDepth(31);
    this.tweens.add({ targets: c, scale: 2.6, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }

  /** 当たったときの光(とがった星形と、飛びちる線) */
  private spark(x: number, y: number, color: number, size: number): void {
    const g = this.add.graphics().setDepth(30).setPosition(x, y);
    g.fillStyle(color, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 20; i++) {
      const r = (i % 2 ? 10 : 34 + (i % 4) * 8) * size;
      const a = (i / 20) * Math.PI * 2;
      pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 12 * size);
    this.tweens.add({ targets: g, scale: 1.4, alpha: 0, duration: 200, onComplete: () => g.destroy() });
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const line = this.add.rectangle(x, y, 26 * size, 5, color, 1).setRotation(a).setDepth(30);
      this.tweens.add({ targets: line, x: x + Math.cos(a) * 70 * size, y: y + Math.sin(a) * 70 * size, scaleX: 0.2, alpha: 0, duration: 240, ease: 'Quad.easeOut', onComplete: () => line.destroy() });
    }
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se('back');
    this.uiCam.fadeOut(200, 0, 0, 0);
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('BattleMenu'));
  }
}
