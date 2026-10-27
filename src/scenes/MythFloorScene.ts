import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { card } from '../core/mythclash/cards';
import { BATTLES_PER_FLOOR, type MythMatch } from '../core/mythclash/modes';
import { towerOpponent } from '../core/mythclash/opponents';
import { opponentFaceTexture } from '../ui/opponentFace';
import { deckOwned, newCollection } from '../core/mythclash/packs';
import { preloadPacks } from '../render/packs';
import { showCardZoom } from '../ui/cardZoom';
import { drawMythCard, MYTH_CARD_H, MYTH_CARD_W } from '../ui/mythCardArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { fillSize, watchViewport } from '../ui/viewport';

/**
 * 企画者の「階に入ったときの画面」の絵(design/mythclash/floor.png・941x1672(9:16)。2026-10-27 に新しい絵へ差しかえ。前の絵は unused/)。
 * 新しい絵は「第　階層」の数字が空いていて、玉は光っておらず、あなたのチームの枠は空。make_floor.py で背景(floor.webp)と、光った玉(floor_parts.webp・前の絵の玉)を作る
 */
export const MYTH_FLOOR_IMAGE = 'myth:floor';
export const MYTH_FLOOR_FILE = 'assets/mythclash/floor.webp';
export const MYTH_FLOOR_ORB = 'myth:floorOrb';
export const MYTH_FLOOR_ORB_FILE = 'assets/mythclash/floor_parts.webp';
const ART = { w: 941, h: 1672 };
const PORTRAIT = { w: 720, h: 1280 };
/** 絵の座標 */
const DIGIT = { x: 446, y: 210 };
const NODES = [
  { x: 320, y: 303 },
  { x: 470, y: 303 },
  { x: 625, y: 300 },
];
const SLOTS = [
  [125, 1040, 337, 1305],
  [368, 1040, 580, 1305],
  [610, 1040, 822, 1305],
] as const;
const ZONES = {
  start: [200, 1355, 745, 1490],
  back: [45, 1515, 290, 1610],
  team: [625, 1525, 885, 1610],
  tower: [640, 45, 870, 115],
} as const;
/** 「敵チーム」の帯(絵の座標。まん中・顔の位置) */
const BANNER = { x: 470, y: 453, face: 300 };
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const cardKey = (id: number) => `mc:card:${id}`;

/**
 * ストーリーモードの階の画面(企画者の絵 2026-10-27)。タワーで階をえらんだとき・戦いに勝ったときに出る。
 * - 上: 第○階層と、1戦目・2戦目・3戦目(BOSS)のどこまで進んだか(今の戦いの玉が光る。勝った戦いは うすく光る)
 * - 敵チーム: 絵のとおり「？」(戦うまで見せない)。あなたのチーム: 今のデッキ(さわると大きく見る)
 * - バトル開始 → バトル。チーム編成 → デッキを組みかえて、この画面にもどる。戻る・タワーに戻る → タワー
 *   (2戦目からは「この階を出ると1戦目から」と確かめる。企画者決定: 負けたら・やめたら その階の1戦目から)
 */
export class MythFloorScene extends Phaser.Scene {
  private match!: Extract<MythMatch, { mode: 'tower' }>;
  private leaving = false;
  private W = ART.w;
  private H = ART.h;
  private k = 1;
  private ox = 0;
  private oy = 0;
  private deck: number[] | null = null;
  private dialog?: Phaser.GameObjects.Container;

  constructor() {
    super('MythFloor');
  }

  init(data: { match: Extract<MythMatch, { mode: 'tower' }> }): void {
    this.match = data.match;
    this.leaving = false;
    this.dialog = undefined;
    const size = fillSize(this, ART, { minRatio: 0.4, maxRatio: 0.75 });
    this.W = size.w;
    this.H = size.h;
    this.scale.setGameSize(size.w, size.h);
    this.k = Math.max(size.w / ART.w, size.h / ART.h);
    this.ox = (size.w - ART.w * this.k) / 2;
    // 画面いっぱい(企画者 2026-10-27「画面いっぱいでいい」)
    this.oy = (size.h - ART.h * this.k) / 2;
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  /** 絵の座標 → 画面の座標 */
  private px(x: number): number {
    return this.ox + x * this.k;
  }

  private py(y: number): number {
    return this.oy + y * this.k;
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    watchViewport(this, () => !this.leaving && this.scene.restart({ match: this.match }));
    const { k } = this;
    this.add.image(this.ox, this.oy, MYTH_FLOOR_IMAGE).setOrigin(0, 0).setScale(k);
    const col = loadLife().mythclash ?? newCollection();
    this.deck = col.deck && deckOwned(col, col.deck) ? [...col.deck] : null;

    // 第○階層
    this.add
      .text(this.px(DIGIT.x), this.py(DIGIT.y), String(this.match.floor), { fontFamily: SERIF, fontSize: `${Math.round((this.match.floor >= 10 ? 50 : 64) * k)}px`, fontStyle: '900', color: '#ffd04a', stroke: '#3a1a04', strokeThickness: Math.max(2, 5 * k) })
      .setOrigin(0.5)
      .setShadow(0, 0, '#ff9a20', 16 * k, false, true);

    this.drawProgress();
    this.drawTeam();
    this.drawOpponent();

    const zone = (z: readonly [number, number, number, number], fn: () => void) => {
      const [x0, y0, x1, y1] = z;
      const r = this.add.rectangle(this.px(x0), this.py(y0), (x1 - x0) * k, (y1 - y0) * k, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      r.on('pointerdown', () => {
        if (this.dialog || this.leaving) return;
        r.setFillStyle(0xffffff, 0.22);
        this.tweens.add({ targets: r, fillAlpha: 0, duration: 220 });
        fn();
      });
      return r;
    };
    zone(ZONES.start, () => this.startBattle());
    zone(ZONES.team, () => this.go('MythDeck', { mode: 'edit', match: this.match }, 'tap'));
    zone(ZONES.back, () => this.leaveFloor());
    zone(ZONES.tower, () => this.leaveFloor());
    // 絵の下が切れて見えないときは、左上にも戻るを出す
    if (this.py(ZONES.back[3]) > this.H) {
      const u = this.W / ART.w;
      this.add
        .text(20 * u, 110 * u, '◀ 戻る', { fontFamily: UI_FONT, fontSize: `${Math.round(36 * u)}px`, fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 8 } })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => !this.dialog && this.leaveFloor());
    }
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('mythclash');
  }

  /** 1戦目・2戦目・3戦目(BOSS)の進み具合 */
  private drawProgress(): void {
    const { k } = this;
    const b = this.match.battle;
    // 金色の線(1戦目から今の戦いまで)
    if (b > 0) {
      const g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      const a = NODES[0];
      const z = NODES[b];
      g.lineStyle(9 * k, 0xff9a20, 0.35).lineBetween(this.px(a.x), this.py(a.y), this.px(z.x), this.py(z.y));
      g.lineStyle(3.5 * k, 0xffd870, 1).lineBetween(this.px(a.x), this.py(a.y), this.px(z.x), this.py(z.y));
    }
    for (let i = 0; i < BATTLES_PER_FLOOR; i++) {
      const n = NODES[i];
      const x = this.px(n.x);
      const y = this.py(n.y);
      const boss = i === BATTLES_PER_FLOOR - 1;
      if (i < b) {
        // 勝った戦い: うすく光る玉と ✓
        if (!boss) this.add.image(x, y, MYTH_FLOOR_ORB).setScale(k * 0.85).setAlpha(0.6);
        this.add.text(x, y, '✓', { fontFamily: UI_FONT, fontSize: `${Math.round(30 * k)}px`, fontStyle: '900', color: '#ffffff', stroke: '#5a2a00', strokeThickness: 5 * k }).setOrigin(0.5);
      } else if (i === b) {
        // 今の戦い: 光る(ボスはドクロのまわりが赤く光る)
        if (boss) {
          const glow = this.add.circle(x, y, 40 * k, 0xff3a1a, 0.55).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        } else {
          const orb = this.add.image(x, y, MYTH_FLOOR_ORB).setScale(k);
          this.tweens.add({ targets: orb, scale: k * 1.15, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
      }
    }
  }

  /**
   * 相手(企画者 2026-10-27: 戦う前に どんな相手か)。「敵チーム」の帯(文字は make_floor.py で消した)に 顔と「○○のチーム」。
   * 顔をさわると、肩書きと ひとことを出す。カードは「？」で隠したまま
   */
  private drawOpponent(): void {
    const { k } = this;
    const op = towerOpponent(this.match.floor, this.match.battle);
    const boss = this.match.battle === BATTLES_PER_FLOOR - 1;
    const cx = this.px(BANNER.x);
    const cy = this.py(BANNER.y);
    const face = this.add.image(this.px(BANNER.face), cy, opponentFaceTexture(this, op, 52 * k, boss)).setInteractive({ useHandCursor: true });
    this.add
      .text(cx + 30 * k, cy, `${op.name}のチーム`, { fontFamily: SERIF, fontSize: `${Math.round(34 * k)}px`, fontStyle: '900', color: boss ? '#ffb0a0' : '#fff4dc', stroke: '#2a0408', strokeThickness: 5 * k })
      .setOrigin(0.5);
    // ひとこと(ふきだし)。顔をさわると出たり消えたり
    const bubble = this.add.container(this.px(470), this.py(BANNER.y + 70)).setDepth(10);
    const t = this.add.text(0, 0, `${op.title}\n「${op.line}」`, { fontFamily: UI_FONT, fontSize: `${Math.round(24 * k)}px`, fontStyle: '900', color: '#ffffff', align: 'center', lineSpacing: 4 * k }).setOrigin(0.5, 0);
    const bg = this.add.rectangle(0, -8 * k, t.width + 40 * k, t.height + 20 * k, 0x16060a, 0.92).setOrigin(0.5, 0).setStrokeStyle(3 * k, boss ? 0xff6a3a : 0xd8a64a, 1);
    bubble.add([bg, t]);
    this.tweens.add({ targets: bubble, alpha: 0, delay: 2600, duration: 400 });
    face.on('pointerdown', () => {
      if (this.dialog) return;
      this.tweens.killTweensOf(bubble);
      bubble.setAlpha(1);
      this.tweens.add({ targets: bubble, alpha: 0, delay: 2600, duration: 400 });
    });
  }

  /** あなたのチーム(今のデッキ。先頭から出る) */
  private drawTeam(): void {
    const { k } = this;
    SLOTS.forEach(([x0, y0, x1, y1], i) => {
      const cx = this.px((x0 + x1) / 2);
      const cy = this.py((y0 + y1) / 2);
      const id = this.deck?.[i];
      if (id === undefined) {
        this.add.text(cx, cy, '？', { fontFamily: SERIF, fontSize: `${Math.round(80 * k)}px`, fontStyle: '900', color: '#8a7a80' }).setOrigin(0.5);
        return;
      }
      const tex = canvasTextureOnce(this, cardKey(id), MYTH_CARD_W, MYTH_CARD_H, (ctx) => drawMythCard(ctx, card(id)!));
      const s = Math.min(((x1 - x0) * k) / MYTH_CARD_W, ((y1 - y0) * k) / MYTH_CARD_H) * 0.96;
      const img = this.add.image(cx, cy, tex).setScale(s).setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => !this.dialog && showCardZoom(this, tex, [card(id)!.name]));
    });
  }

  private startBattle(): void {
    if (!this.deck) {
      // デッキがまだない → チーム編成へ
      this.toast('チーム編成で 3枚えらんでね');
      this.time.delayedCall(700, () => this.go('MythDeck', { mode: 'edit', match: this.match }, 'tap'));
      return;
    }
    this.go('MythBattle', { deck: this.deck, match: this.match }, 'next');
  }

  /** タワーへもどる。2戦目からは、1戦目からになることを確かめる */
  private leaveFloor(): void {
    if (this.match.battle === 0) {
      this.go('MythTower', undefined, 'back');
      return;
    }
    audio.se('tap');
    const { W, H } = this;
    const u = W / ART.w;
    const box = this.add.container(0, 0).setDepth(500);
    this.dialog = box;
    const text = (x: number, y: number, s: string, size: number, color: string) =>
      this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${Math.round(size * u)}px`, fontStyle: '900', color, align: 'center' }).setOrigin(0.5);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 700 * u, 340 * u, 0x1c1018, 1).setStrokeStyle(5 * u, 0xd8a040, 1);
    const title = text(W / 2, H / 2 - 95 * u, 'タワーにもどる？', 44, '#ffffff');
    const note = text(W / 2, H / 2 - 30 * u, 'この階は、次は1戦目からになります', 28, '#e8d0b0');
    const yes = text(W / 2 - 150 * u, H / 2 + 80 * u, 'もどる', 36, '#ffffff').setBackgroundColor('#8a2a20').setPadding(26, 10, 26, 12).setInteractive({ useHandCursor: true });
    const no = text(W / 2 + 150 * u, H / 2 + 80 * u, 'つづける', 36, '#16101c').setBackgroundColor('#ffd23a').setPadding(26, 10, 26, 12).setInteractive({ useHandCursor: true });
    box.add([dim, panel, title, note, yes, no]);
    no.on('pointerdown', () => {
      audio.se('back');
      box.destroy();
      this.dialog = undefined;
    });
    yes.on('pointerdown', () => {
      box.destroy();
      this.dialog = undefined;
      this.go('MythTower', undefined, 'back');
    });
  }

  private toast(msg: string): void {
    const u = this.W / ART.w;
    const t = this.add
      .text(this.W / 2, this.py(1450), msg, { fontFamily: UI_FONT, fontSize: `${Math.round(36 * u)}px`, fontStyle: '900', color: '#ffffff', backgroundColor: '#16101cdd', padding: { x: 24, y: 10 } })
      .setOrigin(0.5)
      .setDepth(400);
    this.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  }

  private go(scene: string, data: object | undefined, se: 'tap' | 'back' | 'next'): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se(se);
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
