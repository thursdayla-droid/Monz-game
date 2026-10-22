import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { HOME_PLACE_LABELS, HOME_PLACES, SECRET_PLACE, savedHomePlace, type HomePlace } from '../core/home';
import { LifeRecord, loadLife, saveLife } from '../core/lifeSave';
import { drawPanel } from '../ui/homeArt';
import { canvasTexture, drawButton, UI_FONT } from '../ui/paint';
import { preloadPacks } from '../render/packs';
import { assetUrl } from '../assetUrl';
import { homeImageFile, homeImageKey } from './HomeScene';

const W = 720;
const H = 1280;
/** 下の小さい部屋の絵(3つのときと、4つのとき) */
const THUMB3 = { w: 150, h: 225, y: 880, gap: 36 };
const THUMB4 = { w: 136, h: 204, y: 890, gap: 22 };
const INK = '#16101c';

/** first: 生まれた後の「どこで育てる？」 / move: 引越し券で「どこに引っ越す？」 */
export type RoomSelectMode = 'first' | 'move';

/**
 * 部屋を選ぶ画面。後ろには選んでいる部屋をそのまま大きく出す。下の小さい絵をタップで切りかえる。
 * - first(企画者決定 2026-10-21): 生まれた後に、3つの部屋から選ぶ
 * - move(企画者決定 2026-10-21): 引越し券で引っ越す。引越し券を買っていれば、4つめの部屋(VIP ROOM)がはじめて出てくる。
 *   4つめの小さい絵は黒いシルエットで、選んだときにはじめて中が見える。今の部屋は選べない。
 *   「引っ越す」→ 確認(使ったら元にもどせない)→ 引越し券を1枚使う
 */
export class RoomSelectScene extends Phaser.Scene {
  private mode: RoomSelectMode = 'first';
  private places: HomePlace[] = [...HOME_PLACES];
  private current?: HomePlace;
  private selected: HomePlace = 'street';
  private bg?: Phaser.GameObjects.Image;
  private frames: Phaser.GameObjects.Graphics[] = [];
  private label?: Phaser.GameObjects.Text;
  private okButton?: Phaser.GameObjects.Image;
  private note?: Phaser.GameObjects.Text;
  private leaving = false;
  private revealed = false;

  constructor() {
    super('RoomSelect');
  }

  init(data: { mode?: RoomSelectMode }): void {
    this.mode = data?.mode ?? 'first';
    // Phaser は、次に data なしで開いたときも前の data を使うので、使ったら消しておく
    if (data) delete data.mode;
    const life = loadLife();
    this.places = [...HOME_PLACES, ...(this.mode === 'move' && life.secretRoom ? [SECRET_PLACE] : [])];
  }

  preload(): void {
    preloadPacks(this, ['rooms']);
    if (this.places.includes(SECRET_PLACE))
      for (const thumb of [false, true])
        if (!this.textures.exists(homeImageKey(SECRET_PLACE, thumb))) this.load.image(homeImageKey(SECRET_PLACE, thumb), assetUrl(homeImageFile(SECRET_PLACE, thumb)));
  }

  create(): void {
    this.leaving = false;
    this.revealed = false;
    this.frames = [];
    const life = loadLife();
    this.current = savedHomePlace(life.place);
    // 生まれた後の部屋選びは、いつも STREET から(前の部屋は残さない)
    this.selected = this.mode === 'move' ? (this.places.find((p) => p !== this.current) ?? 'street') : 'street';
    if (this.selected === SECRET_PLACE) this.selected = 'street';
    this.bg = this.add.image(W / 2, H / 2, homeImageKey(this.selected));
    this.fitBg(this.bg);

    // 上の題名
    canvasTexture(this, 'room:title', 640, 150, (ctx) => drawPanel(ctx, 640, 150, 71));
    this.add.image(W / 2, 110, 'room:title');
    if (this.mode === 'first') {
      const name = life.monz.find((m) => m.uid === life.activeMonz)?.name ?? life.monz[0]?.name;
      this.add.text(W / 2, 88, name ? `${name}を` : 'MONZを', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: INK }).setOrigin(0.5);
      this.add.text(W / 2, 134, 'どこで育てる？', { fontFamily: UI_FONT, fontSize: '44px', fontStyle: '900', color: INK }).setOrigin(0.5);
    } else {
      this.add.text(W / 2, 92, 'どこに引っ越す？', { fontFamily: UI_FONT, fontSize: '44px', fontStyle: '900', color: INK }).setOrigin(0.5);
      this.add.text(W / 2, 140, '引越し券を1枚使います', { fontFamily: UI_FONT, fontSize: '22px', fontStyle: '900', color: '#5a4a66' }).setOrigin(0.5);
      this.add
        .text(16, 196, '◀ もどる', { fontFamily: UI_FONT, fontSize: '26px', fontStyle: '900', color: '#ffffff', backgroundColor: '#8a35e0', padding: { x: 18, y: 8 } })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.back());
    }

    // 下: 部屋の名前・小さい絵・決定ボタン
    const T = this.places.length > 3 ? THUMB4 : THUMB3;
    const shade = this.add.graphics();
    shade.fillStyle(0x16101c, 0.82).fillRect(0, T.y - 110, W, H - T.y + 110);
    this.label = this.add.text(W / 2, T.y - 58, '', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    const total = this.places.length * T.w + (this.places.length - 1) * T.gap;
    this.places.forEach((place, i) => {
      const x = (W - total) / 2 + i * (T.w + T.gap) + T.w / 2;
      const y = T.y + T.h / 2;
      this.add
        .image(x, y, homeImageKey(place, true))
        .setDisplaySize(T.w, T.h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.choose(place));
      if (this.mode === 'move' && place === this.current)
        this.add.text(x, y + T.h / 2 - 18, 'いまの部屋', { fontFamily: UI_FONT, fontSize: '20px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 8, y: 4 } }).setOrigin(0.5);
      this.frames.push(this.add.graphics({ x, y }));
    });
    const okLabel = this.mode === 'first' ? 'ここで育てる' : '引っ越す';
    canvasTexture(this, `room:ok:${this.mode}`, 480, 112, (ctx) => drawButton(ctx, 480, 112, okLabel, 'next', 72));
    this.okButton = this.add
      .image(W / 2, H - 78, `room:ok:${this.mode}`)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.decide());
    this.note = this.add.text(W / 2, H - 78, 'いまの部屋です', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    this.showSelected();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    audio.playBgm('home');
  }

  private fitBg(img: Phaser.GameObjects.Image): void {
    img.setScale(Math.max(W / img.width, H / img.height)).setDepth(-10);
  }

  private choose(place: HomePlace): void {
    if (this.leaving || place === this.selected) return;
    audio.se('tap');
    this.selected = place;
    // 部屋の絵を、ふわっと切りかえる
    const old = this.bg;
    this.bg = this.add.image(W / 2, H / 2, homeImageKey(place)).setAlpha(0);
    this.fitBg(this.bg);
    this.bg.setDepth(-9);
    this.tweens.add({ targets: this.bg, alpha: 1, duration: place === SECRET_PLACE ? 700 : 250, onComplete: () => { old?.destroy(); this.bg?.setDepth(-10); } });
    if (place === SECRET_PLACE && !this.revealed) this.reveal();
    this.showSelected();
  }

  /** 4つめの部屋をはじめて選んだ: 光って、名前が出る */
  private reveal(): void {
    this.revealed = true;
    audio.se('burst');
    const flash = this.add.rectangle(0, 0, W, H, 0xfff1c0, 0.9).setOrigin(0, 0).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
    const t = this.add
      .text(W / 2, 520, 'SECRET\nVIP ROOM', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '64px', color: '#ffd76a', stroke: INK, strokeThickness: 12, align: 'center' })
      .setOrigin(0.5)
      .setDepth(51)
      .setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 470, delay: 1800, duration: 500, onComplete: () => t.destroy() });
  }

  private showSelected(): void {
    const T = this.places.length > 3 ? THUMB4 : THUMB3;
    this.label?.setText(HOME_PLACE_LABELS[this.selected]);
    this.places.forEach((place, i) => {
      const g = this.frames[i];
      const on = place === this.selected;
      g.clear();
      g.lineStyle(on ? 10 : 4, on ? 0xffd23a : 0xffffff, on ? 1 : 0.5);
      g.strokeRoundedRect(-T.w / 2 - 4, -T.h / 2 - 4, T.w + 8, T.h + 8, 10);
    });
    // 引越しでは、今の部屋は選べない
    const same = this.mode === 'move' && this.selected === this.current;
    this.okButton?.setVisible(!same);
    this.note?.setVisible(same);
  }

  private decide(): void {
    if (this.leaving) return;
    if (this.mode === 'move') {
      this.confirmMove();
      return;
    }
    this.leaving = true;
    audio.se('select');
    saveLife({ ...loadLife(), place: this.selected });
    this.go('Home');
  }

  /** 引越しの確認(企画者からおまかせの文 2026-10-21) */
  private confirmMove(): void {
    this.leaving = true;
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(60);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0xfbf1dc, 1).fillRoundedRect(50, 420, W - 100, 400, 24);
    g.lineStyle(8, 0x16101c, 1).strokeRoundedRect(50, 420, W - 100, 400, 24);
    const t = (y: number, s: string, size: number, color = INK) =>
      this.add.text(W / 2, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center', wordWrap: { width: W - 160, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    const btn = (x: number, label: string, bg: string, color: string, onTap: () => void) =>
      this.add
        .text(x, 750, label, { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color, backgroundColor: bg, padding: { x: 22, y: 10 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);
    box.add([
      dim,
      g,
      t(460, `${HOME_PLACE_LABELS[this.selected]}に\n引っ越す？`, 38),
      t(580, '注意：引越し券を1枚使います。使ったら元にもどせません。置いてある家具は、アイテムボックスにもどります。', 22, '#c2410c'),
      btn(W / 2 - 130, 'やめる', '#8a35e0', '#ffffff', () => {
        audio.se('back');
        box.destroy();
        this.leaving = false;
      }),
      btn(W / 2 + 130, '引っ越す', '#ffd23a', INK, () => {
        const record = new LifeRecord(loadLife());
        if (!record.moveTo(this.selected)) {
          box.destroy();
          this.leaving = false;
          return;
        }
        audio.se('select');
        this.go('Home');
      }),
    ]);
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se('back');
    this.go('Shop', { mode: 'box' });
  }

  private go(scene: string, data?: object): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    // 選ばなかった部屋の絵は、お世話画面に入ったところでメモリから外す(HomeScene)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
