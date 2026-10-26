import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { preloadPacks } from '../render/packs';
import { UI_FONT } from '../ui/paint';

/** 企画者のタイトルの絵(design/mythclash/title.png・1448x1086)。画面の大きさも絵と同じにする(横向き) */
export const MYTH_TITLE_IMAGE = 'myth:title';
export const MYTH_TITLE_FILE = 'assets/mythclash/title.webp';
const W = 1448;
const H = 1086;
const PORTRAIT = { w: 720, h: 1280 };

/** 押せる所(絵の座標 [x0, y0, x1, y1]) */
const ZONES = {
  battle: [365, 540, 1085, 685],
  collection: [445, 695, 1000, 782],
  team: [445, 792, 1000, 882],
  guide: [445, 898, 1000, 990],
  settings: [1148, 28, 1238, 118],
  news: [1240, 28, 1330, 118],
  ranking: [1332, 28, 1424, 118],
} as const;
type Zone = keyof typeof ZONES;
const LABELS: Record<Zone, string> = {
  battle: 'バトル',
  collection: 'カードコレクション',
  team: 'チーム編成',
  guide: 'ゲームガイド',
  settings: '設定',
  news: 'お知らせ',
  ranking: 'ランキング',
};

/**
 * MYTHCLASH のタイトル画面(企画者の絵 2026-10-26)。
 * 【仮】ボタンの先の画面はまだないので「準備中」を出す。入口はお世話画面の「バトル」→ バトルメニュー(企画者決定 2026-10-26)。?mythclash でも直接開ける
 */
export class MythTitleScene extends Phaser.Scene {
  private toastObj?: Phaser.GameObjects.Text;

  constructor() {
    super('MythTitle');
  }

  init(): void {
    this.scale.setGameSize(W, H);
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    this.add.image(0, 0, MYTH_TITLE_IMAGE).setOrigin(0, 0).setDisplaySize(W, H);
    for (const id of Object.keys(ZONES) as Zone[]) {
      const [x0, y0, x1, y1] = ZONES[id];
      const z = this.add.rectangle(x0, y0, x1 - x0, y1 - y0, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        z.setFillStyle(0xffffff, 0.25);
        this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
        audio.se('tap');
        this.toast(`${LABELS[id]}は準備中です`);
      });
    }
    // もどる(絵にないので、左上の空いている所に出す)。バトルメニューへ
    const back = this.add
      .text(28, 28, '◀ もどる', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 22, y: 12 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      audio.se('back');
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('BattleMenu'));
    });
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('mythclash');
  }

  private toast(msg: string): void {
    this.toastObj?.destroy();
    const t = this.add
      .text(W / 2, H - 50, msg, { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101cdd', padding: { x: 28, y: 12 } })
      .setOrigin(0.5);
    this.toastObj = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 1200, duration: 400, onComplete: () => t.destroy() });
  }
}
