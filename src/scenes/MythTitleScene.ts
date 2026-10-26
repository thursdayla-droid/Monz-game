import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { preloadPacks } from '../render/packs';
import { UI_FONT } from '../ui/paint';
import { loadLife } from '../core/lifeSave';
import { MYTH_PACK_IMAGE, openPackBuy } from '../ui/packBuy';
import { fillSize, watchViewport } from '../ui/viewport';

/**
 * 企画者のタイトルの絵(design/mythclash/title.png・縦長 852x1846。2026-10-26 に新しいロゴ入りの絵へ差しかえ。前の絵は design/mythclash/unused/)。
 * 画面いっぱいに出す(企画者 2026-10-26): ゲームの大きさを画面の形に合わせ、絵は画面をおおうように置く(はしが少し切れることがある)
 */
export const MYTH_TITLE_IMAGE = 'myth:title';
export const MYTH_TITLE_FILE = 'assets/mythclash/title.webp';
const ART = { w: 852, h: 1846 };
const PORTRAIT = { w: 720, h: 1280 };

/** 押せる所(絵の座標 [x0, y0, x1, y1]) */
const ZONES = {
  battle: [92, 845, 762, 985],
  collection: [104, 1000, 750, 1122],
  team: [104, 1140, 750, 1260],
  guide: [104, 1278, 750, 1400],
} as const;
type Zone = keyof typeof ZONES;
const LABELS: Record<Zone, string> = {
  battle: 'バトル',
  collection: 'カードコレクション',
  team: 'チーム編成',
  guide: 'ゲームガイド',
};

/**
 * MYTHCLASH のタイトル画面(企画者の絵 2026-10-26)。
 * 【仮】ボタンの先の画面はまだないので「準備中」を出す。入口はお世話画面の「バトル」→ バトルメニュー(企画者決定 2026-10-26)。?mythclash でも直接開ける
 */
export class MythTitleScene extends Phaser.Scene {
  private toastObj?: Phaser.GameObjects.Text;
  private leaving = false;
  private W = ART.w;
  private H = ART.h;
  /** 絵の座標 → 画面の座標 */
  private k = 1;
  private ox = 0;
  private oy = 0;

  constructor() {
    super('MythTitle');
  }

  init(): void {
    const size = fillSize(this, ART, { minRatio: 0.4, maxRatio: 0.75 });
    this.W = size.w;
    this.H = size.h;
    this.scale.setGameSize(size.w, size.h);
    this.k = Math.max(size.w / ART.w, size.h / ART.h);
    this.ox = (size.w - ART.w * this.k) / 2;
    this.oy = (size.h - ART.h * this.k) / 2;
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    this.leaving = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    // 画面の形が変わったら(スマホを回したなど)、作り直す
    watchViewport(this, () => !this.leaving && this.scene.restart());
    const { k, ox, oy } = this;
    this.add.image(ox, oy, MYTH_TITLE_IMAGE).setOrigin(0, 0).setScale(k);
    for (const id of Object.keys(ZONES) as Zone[]) {
      const [x0, y0, x1, y1] = ZONES[id];
      const z = this.add.rectangle(ox + x0 * k, oy + y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        z.setFillStyle(0xffffff, 0.25);
        this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
        audio.se('tap');
        // カードコレクション = お世話画面と同じバインダー(企画者 2026-10-26)
        if (id === 'collection') this.go('Binder', { back: 'MythTitle' });
        // 【仮】テストプレイ(企画者 2026-10-26)。チーム編成・相手選びができるまでは、すぐCPUと対戦
        else if (id === 'battle') this.go('MythBattle');
        else this.toast(`${LABELS[id]}は準備中です`);
      });
    }
    // もどる(絵にないので、左上の空いている所に出す)。バトルメニューへ
    const back = this.add
      .text(28, 28, '◀ もどる', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 22, y: 12 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      audio.se('back');
      this.go('BattleMenu');
    });
    this.buildPackButton();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('mythclash');
  }

  private go(scene: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }

  /** パックを買う(企画者決定 2026-10-26: タイトル画面からも買える。このボタンでよい)。絵にないので、下の床の所に出す */
  private buildPackButton(): void {
    // 画面の下からの位置で置く(絵の下のはしが切れても見えるように)。
    // 画面が横に広くて、ゲームガイドの下に入らないときは、右上の空の所に小さめに置く
    const u = this.W / ART.w;
    const guideBottom = this.oy + ZONES.guide[3] * this.k;
    const roomy = this.H - guideBottom >= 330 * u;
    const c = roomy ? this.add.container(0, this.H - 236 * u).setScale(u) : this.add.container(this.W - 580 * u, 170 * u).setScale(u * 0.75);
    const x = 250;
    const y = 0;
    const glow = this.add.circle(x, y, 170, 0xffd23a, 0.18);
    c.add(glow);
    this.tweens.add({ targets: glow, scale: 1.15, alpha: 0.05, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const pack = this.add.image(x, y, MYTH_PACK_IMAGE).setAngle(-8);
    c.add(pack);
    pack.setScale(270 / pack.height);
    this.tweens.add({ targets: pack, y: y - 12, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const label = this.add
      .text(x + 330, y - 30, 'パックを買う', { fontFamily: UI_FONT, fontSize: '44px', fontStyle: '900', color: '#16101c', backgroundColor: '#ffd23a', padding: { x: 20, y: 8 } })
      .setOrigin(0.5);
    c.add(label);
    const coins = this.add.text(x + 330, y + 40, `コイン ${loadLife().coins.toLocaleString()}`, { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 6 }).setOrigin(0.5);
    c.add(coins);
    let open = false;
    for (const o of [pack, label]) {
      o.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (open) return;
        open = true;
        openPackBuy(this, { back: 'MythTitle', bgm: 'mythclash', onClose: () => (open = false) });
      });
    }
  }

  private toast(msg: string): void {
    this.toastObj?.destroy();
    const t = this.add
      .text(this.W / 2, this.H * 0.83, msg, { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101cdd', padding: { x: 28, y: 12 } })
      .setOrigin(0.5);
    this.toastObj = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 1200, duration: 400, onComplete: () => t.destroy() });
  }
}
