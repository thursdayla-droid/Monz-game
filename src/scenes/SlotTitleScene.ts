import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { EXCHANGE_PACKS, EXCHANGE_RATE, exchangeCoins, SLOT_COIN_NAME, SLOT_SHOP_ITEMS, SlotWallet } from '../core/slot/wallet';
import { UI_FONT } from '../ui/paint';
import { fillSize, safeInsets } from '../ui/viewport';
import { COIN_ART_FILE, COIN_ART_KEY } from './slotFx';

/**
 * ROYAL JACKPOT の タイトル画面(2026-11-12 企画者「スロット タイトル画面を 作って、遊ぶ と ショップ、コイン交換」)。
 * - あそぶ → スロット(SlotScene)
 * - ショップ → スロットの コインで だけ 交換できる アイテム(5個くらい。中身は 企画者が 作る【未確定】。今は 空き枠)
 * - コイン交換 → MONZ コインで スロットの コインを 買う(もどせない)
 * 見た目は【仮】(企画者の 背景の 絵が 届いたら 入れかえる)
 */
const W = 720;
const BASE_H = 1280;
const LOGO_KEY = 'slot:logo';
const BG_KEY = 'slot:lcd:normal';
const TITLE_BG_KEY = 'slot:title:bg';

export class SlotTitleScene extends Phaser.Scene {
  private H = BASE_H;
  private wallet!: SlotWallet;
  private life!: LifeRecord;
  private slotText!: Phaser.GameObjects.Text;
  private monzText!: Phaser.GameObjects.Text;
  private panel?: Phaser.GameObjects.Container;

  constructor() {
    super('SlotTitle');
  }

  preload(): void {
    if (!this.textures.exists(LOGO_KEY)) this.load.image(LOGO_KEY, assetUrl('assets/slot/logo.webp'));
    if (!this.textures.exists(BG_KEY)) this.load.image(BG_KEY, assetUrl('assets/slot/lcd_normal.webp'));
    if (!this.textures.exists(COIN_ART_KEY)) this.load.image(COIN_ART_KEY, assetUrl(COIN_ART_FILE));
  }

  create(): void {
    this.panel = undefined;
    this.H = Math.max(BASE_H, fillSize(this, { w: W, h: BASE_H }, { minRatio: 0.4, maxRatio: W / BASE_H }).h);
    this.scale.setGameSize(W, this.H);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(W, BASE_H));
    this.wallet = new SlotWallet();
    this.life = new LifeRecord(loadLife());
    const H = this.H;
    const top = safeInsets(this).top;

    // 背景(企画者の タイトルの 絵が あれば それ。なければ 液晶の 背景を 画面 いっぱいに)【仮】
    const bgKey = this.textures.exists(TITLE_BG_KEY) ? TITLE_BG_KEY : BG_KEY;
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(W / 2, H / 2, bgKey);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    } else this.add.rectangle(W / 2, H / 2, W, H, 0x1a0628);
    this.add.rectangle(W / 2, H / 2, W, H, 0x0d0614, 0.35);

    // ロゴ
    if (this.textures.exists(LOGO_KEY)) {
      const logo = this.add.image(W / 2, H * 0.24, LOGO_KEY);
      logo.setScale(Math.min((W * 0.86) / logo.width, (H * 0.26) / logo.height));
      this.tweens.add({ targets: logo, scale: logo.scale * 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else this.text(W / 2, H * 0.24, 'ROYAL JACKPOT', 64, '#ffd23a', 10);

    // もっている コイン
    const cy = H * 0.43;
    this.add.rectangle(W / 2, cy, W - 120, 120, 0x16101c, 0.85).setStrokeStyle(4, 0xffd23a);
    if (this.textures.exists(COIN_ART_KEY)) this.add.image(130, cy - 14, COIN_ART_KEY).setDisplaySize(64, 64);
    this.text(W / 2 + 30, cy - 34, SLOT_COIN_NAME, 26, '#ffd23a', 5);
    this.slotText = this.text(W / 2 + 30, cy + 4, '', 46, '#ffffff', 6);
    this.monzText = this.text(W / 2, cy + 46, '', 20, '#d8c8e8', 4);
    this.refresh();

    // ボタン 3つ
    const by = H * 0.56;
    this.button(W / 2, by, 'あそぶ', 0xff4ad8, 60, () => this.play());
    this.button(W / 2, by + 150, 'ショップ', 0x9b5cff, 44, () => this.openShop());
    this.button(W / 2, by + 270, 'コイン交換', 0x2a9df4, 44, () => this.openExchange());

    // もどる
    const back = this.text(86, top + 46, '◀ もどる', 26).setBackgroundColor('#16101ccc').setPadding(16, 8, 16, 10).setDepth(20).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => (this.panel ? this.closePanel() : this.leave()));

    // 確認用ページだけ: MONZ コインを 足す(コイン交換を ためす ため)
    if (['Slot', 'SlotTitle'].includes((window as { __MONZ_START?: string }).__MONZ_START ?? '')) {
      const dev = this.text(W - 160, top + 46, '+10,000 MONZ（確認用）', 18, '#16101c').setBackgroundColor('#7de8ff').setPadding(10, 6, 10, 8).setDepth(20).setInteractive({ useHandCursor: true });
      dev.on('pointerdown', () => {
        this.life.add(10000);
        this.refresh();
      });
    }

    audio.playBgm('slot');
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 0): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center' }).setOrigin(0.5);
  }

  private button(x: number, y: number, label: string, color: number, size: number, onTap: () => void, w = 460, h?: number): Phaser.GameObjects.Container {
    const bh = h ?? size * 2;
    const c = this.add.container(x, y);
    const shadow = this.add.rectangle(0, 8, w, bh, 0x000000, 0.45);
    const body = this.add.rectangle(0, 0, w, bh, color).setStrokeStyle(5, 0xffd23a);
    const t = this.text(0, 0, label, size, '#ffffff', 8);
    c.add([shadow, body, t]);
    body.setInteractive({ useHandCursor: true });
    body.on('pointerdown', () => {
      audio.unlock();
      this.tweens.add({ targets: c, scale: 0.94, duration: 70, yoyo: true });
      onTap();
    });
    return c;
  }

  private refresh(): void {
    this.slotText.setText(this.wallet.coins.toLocaleString());
    this.monzText.setText(`MONZ コイン ${this.life.coins.toLocaleString()}`);
  }

  private play(): void {
    audio.se('next');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Slot'));
  }

  private leave(): void {
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MinigameSelect'));
  }

  // ---------------- まど(ショップ・コイン交換) ----------------

  private openPanel(title: string): Phaser.GameObjects.Container {
    this.closePanel();
    audio.se('select');
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(10);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
    const box = this.add.rectangle(W / 2, H / 2 + 40, W - 60, H * 0.72, 0x16101c, 0.97).setStrokeStyle(5, 0xffd23a);
    const t = this.text(W / 2, H / 2 + 40 - H * 0.36 + 56, title, 46, '#ffd23a', 8);
    c.add([dim, box, t]);
    const close = this.text(W / 2, H / 2 + 40 + H * 0.36 - 60, 'とじる', 32, '#ffffff', 6).setBackgroundColor('#5a4a6a').setPadding(40, 10, 40, 12).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.closePanel());
    c.add(close);
    this.panel = c;
    return c;
  }

  private closePanel(): void {
    if (!this.panel) return;
    audio.se('back');
    this.panel.destroy();
    this.panel = undefined;
    this.refresh();
  }

  /** ショップ: スロットの コインで だけ 交換できる アイテム(中身は 企画者が 作る。今は 空き枠) */
  private openShop(): void {
    const c = this.openPanel('ショップ');
    const H = this.H;
    const y0 = H / 2 + 40 - H * 0.36 + 140;
    const coin = this.text(W / 2, y0, `${SLOT_COIN_NAME} ${this.wallet.coins.toLocaleString()}`, 26, '#ffffff', 4);
    c.add(coin);
    const step = Math.min(130, (H * 0.72 - 300) / SLOT_SHOP_ITEMS.length);
    SLOT_SHOP_ITEMS.forEach((item, i) => {
      const y = y0 + 80 + i * step;
      const row = this.add.rectangle(W / 2, y, W - 120, step - 16, 0x2a1838).setStrokeStyle(3, 0x9b5cff);
      const name = this.text(200, y, item.ready ? item.name : '？？？', 30, item.ready ? '#ffffff' : '#8a7a9a', 4);
      const owned = this.wallet.itemCount(item.id);
      const sub = this.text(200, y + 30, owned ? `もっている ${owned}` : '', 18, '#d8c8e8');
      const price = this.text(W - 190, y, item.ready ? `${item.price.toLocaleString()}` : 'じゅんび中', 26, item.ready ? '#ffd23a' : '#8a7a9a', 4);
      c.add([row, name, sub, price]);
      if (item.ready) {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerdown', () => {
          if (this.wallet.buy(item)) {
            audio.se('koBlast');
            coin.setText(`${SLOT_COIN_NAME} ${this.wallet.coins.toLocaleString()}`);
            sub.setText(`もっている ${this.wallet.itemCount(item.id)}`);
          } else {
            audio.se('tap', { pitch: 0.7 });
            this.cameras.main.shake(100, 0.003);
          }
        });
      }
    });
  }

  /** コイン交換: MONZ コイン → スロットの コイン(もどせない) */
  private openExchange(): void {
    const c = this.openPanel('コイン交換');
    const H = this.H;
    const y0 = H / 2 + 40 - H * 0.36 + 140;
    const info = this.text(W / 2, y0, '', 24, '#ffffff', 4);
    const show = () => info.setText(`MONZ コイン ${this.life.coins.toLocaleString()}\n${SLOT_COIN_NAME} ${this.wallet.coins.toLocaleString()}`);
    show();
    c.add(info);
    c.add(this.text(W / 2, y0 + 70, `MONZ コイン 1枚 → ${SLOT_COIN_NAME} ${EXCHANGE_RATE}枚\n${SLOT_COIN_NAME}は MONZ コインに もどせません`, 20, '#d8c8e8', 3));
    EXCHANGE_PACKS.forEach((m, i) => {
      const b = this.button(W / 2, y0 + 190 + i * 130, `${m.toLocaleString()} MONZ → ${(m * EXCHANGE_RATE).toLocaleString()}`, 0x2a9df4, 30, () => {
        if (exchangeCoins(this.life, this.wallet, m)) {
          audio.se('koBlast');
          show();
        } else {
          audio.se('tap', { pitch: 0.7 });
          this.cameras.main.shake(100, 0.003);
          info.setText('MONZ コインが たりないよ');
          this.time.delayedCall(1200, show);
        }
      }, 540, 96);
      c.add(b);
    });
  }
}
