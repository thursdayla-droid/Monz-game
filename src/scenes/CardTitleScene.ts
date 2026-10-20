import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { CARD_REWARD, TURN_SECONDS } from '../core/monzCard';
import { CARD_H, CARD_W, drawCardBack, drawCardFace, drawCardTable, drawGraffitiText } from '../ui/cardArt';
import { drawPanel } from '../ui/homeArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { homeIconKey } from './HomeScene';
import { preloadPacks } from '../render/packs';

const W = 720;
const H = 1280;
const INK = '#16101c';

/**
 * MONZ CARD のタイトル画面: PLAY・遊び方・もどる(ミニゲームのセレクトへ)。
 * 絵は企画者のタイトルの絵(2026-10-20)。読み込めなかったときだけ、プログラムで描いた仮の絵を出す。
 */
export class CardTitleScene extends Phaser.Scene {
  constructor() {
    super('CardTitle');
  }

  preload(): void {
    preloadPacks(this, ['card', 'home']);
  }

  create(): void {
    if (this.textures.exists('cardimg:title')) this.buildFromArt();
    else this.buildDrawn();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('card');
  }

  /** 企画者のタイトルの絵(design/minigame/card_title.png・941x1672)。押せる所は絵の座標で決める */
  private buildFromArt(): void {
    const sx = W / 941;
    const sy = H / 1672;
    this.add.image(0, 0, 'cardimg:title').setOrigin(0, 0).setDisplaySize(W, H);
    const zone = ([x0, y0, x1, y1]: number[], onTap: () => void) => {
      const z = this.add.rectangle(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        z.setFillStyle(0xffffff, 0.25);
        this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
        onTap();
      });
    };
    zone([35, 40, 265, 115], () => this.back());
    zone([140, 1210, 820, 1395], () => this.play());
    zone([245, 1480, 690, 1585], () => this.howTo());
    // 絵に描いてあるコインの数を隠して、本当の数を出す
    this.add.rectangle(728 * sx, 46 * sy, 108 * sx, 46 * sy, 0x01060e, 1).setOrigin(0, 0);
    const life = loadLife();
    this.add.text(834 * sx, 69 * sy, life.coins.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(1, 0.5);
    const rec = life.records.card;
    if (rec) this.add.text(W / 2, 1172 * sy, `自己ベスト：${rec.bestScore}枚（ラウンド${rec.bestRound}）`, { fontFamily: UI_FONT, fontSize: '26px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
  }

  private back(): void {
    audio.se('back');
    this.scene.start('MinigameSelect');
  }

  private play(): void {
    audio.se('sting');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('CardPlay'));
  }

  /** 【仮】絵が読めなかったときの、プログラムで描いた画面 */
  private buildDrawn(): void {
    canvasTextureOnce(this, 'card:table', W, H, (ctx) => drawCardTable(ctx, W, H));
    this.add.image(0, 0, 'card:table').setOrigin(0, 0);
    canvasTextureOnce(this, 'card:back', CARD_W, CARD_H, (ctx) => drawCardBack(ctx));
    // 飾りのカード(♠A・♥7)
    canvasTextureOnce(this, 'card:0', CARD_W, CARD_H, (ctx) => drawCardFace(ctx, 0));
    canvasTextureOnce(this, 'card:19', CARD_W, CARD_H, (ctx) => drawCardFace(ctx, 19));
    const deco = [
      this.add.image(W / 2 - 120, 700, 'card:back').setAngle(-16),
      this.add.image(W / 2 + 120, 700, 'card:19').setAngle(14),
      this.add.image(W / 2, 680, 'card:0'),
    ];
    deco.forEach((d, i) => this.tweens.add({ targets: d, y: d.y - 12, duration: 1400 + i * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    // ロゴ
    canvasTextureOnce(this, 'card:logo1', 680, 200, (ctx) => drawGraffitiText(ctx, 680, 200, 'MONZ', '#2fa8ff', 170, -0.08));
    canvasTextureOnce(this, 'card:logo2', 680, 170, (ctx) => drawGraffitiText(ctx, 680, 170, 'CARD', '#ffffff', 140, -0.05));
    const l1 = this.add.image(W / 2, 250, 'card:logo1');
    const l2 = this.add.image(W / 2 + 60, 390, 'card:logo2');
    [l1, l2].forEach((l, i) => {
      l.setScale(0.3);
      this.tweens.add({ targets: l, scale: 1, duration: 420, delay: i * 140, ease: 'Back.easeOut' });
    });

    // もどる・コイン
    const back = this.add.text(24, 28, '◀', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 18, y: 8 } }).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.back());
    canvasTextureOnce(this, 'card:coinbox', 190, 70, (ctx) => drawPanel(ctx, 190, 70, 93));
    this.add.image(W - 20 - 95, 65, 'card:coinbox');
    if (this.textures.exists(homeIconKey('coin'))) this.add.image(W - 20 - 158, 65, homeIconKey('coin')).setDisplaySize(56, 56);
    const life = loadLife();
    this.add.text(W - 36, 65, life.coins.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '28px', color: INK }).setOrigin(1, 0.5);
    // 自己ベスト
    const rec = life.records.card;
    if (rec) this.add.text(W / 2, 900, `自己ベスト：${rec.bestScore}枚（ラウンド${rec.bestRound}）`, { fontFamily: UI_FONT, fontSize: '28px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);

    // PLAY・遊び方
    const play = this.add.text(W / 2, 1010, '  PLAY ▶  ', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '58px', color: INK, backgroundColor: '#ffd23a', padding: { x: 30, y: 14 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: play, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    play.on('pointerdown', () => this.play());
    const how = this.add.text(W / 2, 1150, '  📖 遊び方  ', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101c', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    how.on('pointerdown', () => this.howTo());
  }

  private howTo(): void {
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(20);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    canvasTextureOnce(this, 'card:howpanel', 640, 900, (ctx) => drawPanel(ctx, 640, 900, 98));
    const panel = this.add.image(W / 2, H / 2, 'card:howpanel');
    const logo = this.textures.exists('cardimg:logo') ? this.add.image(W / 2, H / 2 - 470, 'cardimg:logo').setScale(0.6) : null;
    const R = CARD_REWARD;
    const text = [
      '遊び方',
      '',
      '・場札と「同じ数字」か「同じマーク」の',
      '  カードを、手札からタップして出そう',
      '・出したら、山札から1枚補充されるよ',
      `・1枚出すまでの時間は${TURN_SECONDS}秒`,
      '・時間切れか、出せるカードがなくなったら',
      '  ゲームオーバー',
      '・52枚ぜんぶ出しきったらラウンドクリア！',
      '  次のラウンドに進めるよ',
      '・上の CARD TRACKER で、まだ出ていない',
      '  カードがわかるよ（タップで大きく）',
      '',
      `報酬：ラウンドクリアで${R.clearCoins}コイン`,
      `${R.minCardsForReward}枚以上出すと、出した枚数に応じて`,
      'コインとEXPがもらえるよ',
    ].join('\n');
    const t = this.add.text(W / 2, H / 2 - 30, text, { fontFamily: UI_FONT, fontSize: '27px', fontStyle: '800', color: INK, lineSpacing: 8 }).setOrigin(0.5);
    const close = this.add.text(W / 2, H / 2 + 380, '  とじる  ', { fontFamily: UI_FONT, fontSize: '36px', fontStyle: '900', color: INK, backgroundColor: '#ffd23a', padding: { x: 18, y: 8 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      audio.se('back');
      box.destroy();
    });
    box.add([dim, panel, t, close]);
    if (logo) box.add(logo);
  }
}
