import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { COIN_ART_FILE, COIN_ART_KEY } from './slotFx';
import { drawScratch, SCRATCH_ITEMS, SCRATCH_NAMES, SCRATCH_TABLE, type ScratchKind } from '../core/scratch';
import { FURNITURE, FURNITURE_ART_READY, FURNITURE_SERIES, furnitureKey, KIND_RULES, MOVE_TICKET, MYSTERY_ITEMS, OTHER_ITEMS, SERIES_LABELS, type FurnitureDef, type FurnitureSeries } from '../core/furniture';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { drawCoin, drawPanel } from '../ui/homeArt';
import { canvasTexture, canvasTextureOnce, UI_FONT } from '../ui/paint';
import { preloadPacks } from '../render/packs';
import { assetUrl } from '../assetUrl';
import { homeIconKey, homeImageKey, homePlace } from './HomeScene';
import { MYTH_PACK_FILE, MYTH_PACK_IMAGE, openPackBuy } from '../ui/packBuy';
import { PACK_PRICE } from '../core/mythclash/packs';

const W = 720;
const H = 1280;
const INK = '#16101c';
/** スクラッチの 持ち物なら その 種類 */
const scratchKindOf = (id: string): ScratchKind | undefined => (Object.keys(SCRATCH_ITEMS) as ScratchKind[]).find((k) => SCRATCH_ITEMS[k] === id);
const SCRATCH_MARKS = [...new Set(Object.values(SCRATCH_TABLE).flatMap((t) => t.map((p) => p.mark).filter((m): m is NonNullable<typeof m> => !!m)))];
// 家具8種類(2026-10-22 テレビ・植物を追加)が1画面に入る大きさ
const CARD = { w: 320, h: 206, gap: 14, top: 330 };
/** 確認の箱に出す絵の高さ */
const DIALOG_IMAGE_H = 320;

/** ショップ(買う)か、アイテムボックス(持っている物を使う)か */
export type ItemScreenMode = 'shop' | 'box';
type Tab = 'furniture' | 'other';

/** 【仮】家具の絵が届くまでの、シリーズごとの色(カードの絵の所) */
const SERIES_COLORS: Record<FurnitureSeries, { bg: number; fg: string }> = {
  street: { bg: 0x2a2230, fg: '#ff8a1f' },
  pop: { bg: 0xffd9ea, fg: '#e0408a' },
  cyber: { bg: 0x101a2e, fg: '#3ee8ff' },
  vip: { bg: 0x1a1410, fg: '#e8b84a' },
};

/**
 * ショップとアイテムボックス(企画者決定 2026-10-21)。
 * - ショップ: タブは「家具」「その他」(コスチュームは後回し)。その他は 引越し券 と MYTHCLASH のカードパック(企画者決定 2026-10-26)。
 *   コインで買う。いくつかまとめて買える(2026-10-26)。買った物はアイテムボックスに入る。カードパックは買うとすぐ開ける
 * - アイテムボックス: タブは「家具」「その他」。家具は「部屋に置く」、引越し券は「引っ越す？」へ
 * 家具はシリーズ(STREET・POP・CYBER)で切りかえる。どの部屋にも、どのシリーズでも置ける。
 * 【仮】家具の絵がまだないので、カードには名前と色だけを出す。
 */
export class ShopScene extends Phaser.Scene {
  private mode: ItemScreenMode = 'shop';
  private tab: Tab = 'furniture';
  private series: FurnitureSeries = 'street';
  private record?: LifeRecord;
  private list?: Phaser.GameObjects.Container;
  private chrome?: Phaser.GameObjects.Container;
  private coinLabel?: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Shop');
  }

  init(data: { mode?: ItemScreenMode; tab?: Tab }): void {
    this.mode = data?.mode ?? 'shop';
    // カードパックを開けて戻ってきたときは「その他」のまま
    this.tab = data?.tab ?? 'furniture';
    this.busy = false;
  }

  preload(): void {
    preloadPacks(this, ['home']);
    for (const id of FURNITURE_ART_READY) {
      const f = FURNITURE.find((x) => x.id === id);
      if (f && !this.textures.exists(furnitureKey(id))) this.load.image(furnitureKey(id), assetUrl(f.file));
    }
    if (this.mode === 'shop' && !this.textures.exists(MYTH_PACK_IMAGE)) this.load.image(MYTH_PACK_IMAGE, assetUrl(MYTH_PACK_FILE));
    // スクラッチの マーク(ROYAL JACKPOT の 図柄の 絵)
    if (!this.textures.exists(COIN_ART_KEY)) this.load.image(COIN_ART_KEY, assetUrl(COIN_ART_FILE));
    // スクラッチ券の 絵(2026-11-17 企画者。元は design/scratch/)
    for (const k of Object.values(SCRATCH_ITEMS)) if (!this.textures.exists(`scratch:art:${k}`)) this.load.image(`scratch:art:${k}`, assetUrl(`assets/scratch/${k}.webp`));
    for (const m of SCRATCH_MARKS) if (!this.textures.exists(`scratch:${m}`)) this.load.image(`scratch:${m}`, assetUrl(`assets/slot/sym_${m}.webp`));
  }

  create(): void {
    this.record = new LifeRecord(loadLife());
    const place = homePlace();
    if (place && this.textures.exists(homeImageKey(place))) {
      const bg = this.add.image(W / 2, H / 2, homeImageKey(place));
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    }
    this.add.rectangle(0, -400, W, H + 800, 0x0d0614, 0.78).setOrigin(0, 0);
    this.buildHeader();
    this.chrome = this.add.container(0, 0);
    this.list = this.add.container(0, 0);
    this.redraw();
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private t(x: number, y: number, s: string, size: number, color = INK, ox = 0.5, oy = 0.5): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(ox, oy);
  }

  private button(x: number, y: number, label: string, size: number, onTap: () => void, kind: 'yes' | 'no' | 'off' = 'yes'): Phaser.GameObjects.Text {
    const bg = { yes: '#ffd23a', no: '#8a35e0', off: '#9a9098' }[kind];
    const b = this.t(x, y, label, size, kind === 'yes' ? INK : '#ffffff').setBackgroundColor(bg).setPadding(22, 10, 22, 12);
    if (kind !== 'off') b.setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
    return b;
  }

  // ---------------- 上: もどる・題名・コイン ----------------

  private buildHeader(): void {
    this.button(92, 64, '◀ もどる', 26, () => this.leave(), 'no');
    this.t(W / 2 - 40, 64, this.mode === 'shop' ? 'SHOP' : 'アイテム', 44, '#ffffff').setStroke(INK, 8);
    canvasTexture(this, 'shop:coinCard', 200, 72, (ctx) => {
      drawPanel(ctx, 200, 72, 93);
      const key = homeIconKey('coin');
      if (this.textures.exists(key)) ctx.drawImage(this.textures.get(key).getSourceImage() as CanvasImageSource, 6, 4, 64, 64);
      else drawCoin(ctx, 38, 36, 24);
    });
    this.add.image(W - 16 - 100, 64, 'shop:coinCard');
    this.coinLabel = this.add.text(W - 30, 66, '', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '30px', color: INK }).setOrigin(1, 0.5);
    this.showCoins();
  }

  private showCoins(): void {
    this.coinLabel?.setText((this.record?.coins ?? 0).toLocaleString());
  }

  // ---------------- タブ・シリーズ・カード ----------------

  private redraw(): void {
    const chrome = this.chrome!;
    chrome.removeAll(true);
    const tabs: [Tab, string][] = [
      ['furniture', '家具'],
      ['other', 'その他'],
    ];
    tabs.forEach(([tab, label], i) => {
      const x = W / 2 + (i - 0.5) * 330;
      const on = tab === this.tab;
      const g = this.add.graphics();
      g.fillStyle(on ? 0xffd23a : 0x3a2a4a, 1).fillRoundedRect(x - 155, 140, 310, 76, 18);
      g.lineStyle(5, 0x16101c, 1).strokeRoundedRect(x - 155, 140, 310, 76, 18);
      const text = this.t(x, 178, label, 32, on ? INK : '#ffffff');
      const hit = this.add.zone(x, 178, 310, 76).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (this.busy || this.tab === tab) return;
        audio.se('tap');
        this.tab = tab;
        this.redraw();
      });
      chrome.add([g, text, hit]);
    });
    if (this.tab === 'furniture') {
      // VIPの家具は、VIPルームを開放してから(それまではVIPのことは一切出さない)
      const series = FURNITURE_SERIES.filter((s) => s !== 'vip' || this.record?.snapshot.vipOpen);
      const step = series.length > 3 ? 168 : 220;
      const ringW = series.length > 3 ? 156 : 190;
      series.forEach((s, i) => {
        const x = W / 2 + (i - (series.length - 1) / 2) * step;
        const on = s === this.series;
        const chip = this.t(x, 270, SERIES_LABELS[s], 28, on ? INK : '#ffffff')
          .setBackgroundColor(on ? '#ffffff' : '#00000000')
          .setPadding(series.length > 3 ? 14 : 26, 8, series.length > 3 ? 14 : 26, 10)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            if (this.busy || this.series === s) return;
            audio.se('tap');
            this.series = s;
            this.redraw();
          });
        const ring = this.add.graphics();
        ring.lineStyle(4, 0xffffff, on ? 1 : 0.5).strokeRoundedRect(x - ringW / 2, 240, ringW, 60, 30);
        chrome.add([ring, chip]);
      });
    }
    this.drawList();
  }

  private drawList(): void {
    const list = this.list!;
    list.removeAll(true);
    const record = this.record!;
    if (this.tab === 'furniture') {
      // 当たりの家具(金マッチョの中身)はショップには出さない。アイテムボックスには出る
      const items = FURNITURE.filter((f) => f.series === this.series && (this.mode === 'shop' ? !f.prize : record.owns(f.id) > 0));
      if (!items.length) {
        list.add(this.t(W / 2, 640, 'まだ ありません\nショップで 買えます', 32, '#ffffff'));
        return;
      }
      items.forEach((f, i) => {
        const x = (W - CARD.w * 2 - CARD.gap) / 2 + (i % 2) * (CARD.w + CARD.gap);
        const y = CARD.top + Math.floor(i / 2) * (CARD.h + CARD.gap);
        list.add(this.furnitureCard(f, x, y));
      });
      return;
    }
    // 引越し券など
    // スクラッチ(2026-11-17)は ROYAL JACKPOT の ショップで 交換する ので ここの ショップには 出さない
    const others = OTHER_ITEMS.filter((o) => (this.mode === 'shop' ? !o.hidden : record.owns(o.id) > 0));
    if (!others.length) {
      list.add(this.t(W / 2, 640, 'まだ ありません\nショップで 買えます', 32, '#ffffff'));
      return;
    }
    others.forEach((o, i) => {
      const x = 30;
      const y = 260 + i * 250;
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0xfbf1dc, 1).fillRoundedRect(0, 0, W - 60, 220, 20);
      g.lineStyle(6, 0x16101c, 1).strokeRoundedRect(0, 0, W - 60, 220, 20);
      // 【仮】引越し券の絵がまだないので、券の形をかく
      g.fillStyle(0xffd23a, 1).fillRoundedRect(24, 40, 170, 120, 14);
      g.lineStyle(4, 0x16101c, 1).strokeRoundedRect(24, 40, 170, 120, 14);
      const scratch = scratchKindOf(o.id);
      const artKey = `scratch:art:${o.id}`;
      let icon: Phaser.GameObjects.GameObject = this.t(109, 100, scratch ? 'SCRATCH' : 'TICKET', 28);
      if (scratch && this.textures.exists(artKey)) {
        // 企画者の 券の 絵(黄色い 券の 形は かくす)
        g.clear();
        g.fillStyle(0xfbf1dc, 1).fillRoundedRect(0, 0, W - 60, 220, 20);
        g.lineStyle(6, 0x16101c, 1).strokeRoundedRect(0, 0, W - 60, 220, 20);
        const img = this.add.image(109, 110, artKey);
        img.setScale(Math.min(190 / img.height, 180 / img.width));
        icon = img;
      }
      c.add([g, icon, this.t(220, 40, o.name, 36, INK, 0, 0), this.t(220, 96, scratch ? 'さわって けずろう' : o.text, 24, '#5a4a66', 0, 0)]);
      if (this.mode === 'shop') {
        c.add(this.priceRow(220, 160, o.price));
        c.add(this.t(W - 90, 176, `持っている：${record.owns(o.id)}`, 22, '#5a4a66', 1, 0.5));
      } else c.add(this.t(220, 160, `持っている：${record.owns(o.id)}`, 26, INK, 0, 0.5));
      const hit = this.add.zone(0, 0, W - 60, 220).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => (this.mode === 'shop' ? this.confirmBuy(o.id, o.name, o.price) : this.useOther(o.id)));
      c.add(hit);
      list.add(c);
    });
    if (this.mode === 'shop') list.add(this.packRow(30, 260 + others.length * 250));
  }

  /** MYTHCLASH のカードパック(買うとすぐ開ける。アイテムボックスには入らない) */
  private packRow(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0xfbf1dc, 1).fillRoundedRect(0, 0, W - 60, 220, 20);
    g.lineStyle(6, 0x16101c, 1).strokeRoundedRect(0, 0, W - 60, 220, 20);
    g.fillStyle(0x1c1320, 1).fillRoundedRect(24, 14, 170, 192, 14);
    c.add(g);
    if (this.textures.exists(MYTH_PACK_IMAGE)) {
      const img = this.add.image(109, 110, MYTH_PACK_IMAGE);
      img.setScale(178 / img.height);
      c.add(img);
    }
    c.add([this.t(220, 40, 'カードパック', 36, INK, 0, 0), this.t(220, 96, 'MYTHCLASH のカードが1枚', 24, '#5a4a66', 0, 0), this.priceRow(220, 160, PACK_PRICE)]);
    c.add(this.t(W - 90, 176, '10パックもある', 22, '#5a4a66', 1, 0.5));
    const hit = this.add.zone(0, 0, W - 60, 220).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.busy) return;
      this.busy = true;
      openPackBuy(this, { back: 'Shop', backData: { mode: 'shop', tab: 'other' }, bgm: 'home', record: this.record, onClose: () => (this.busy = false) });
    });
    c.add(hit);
    return c;
  }

  private priceRow(x: number, y: number, price: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    canvasTextureOnce(this, 'shop:coin', 40, 40, (ctx) => {
      const key = homeIconKey('coin');
      if (this.textures.exists(key)) ctx.drawImage(this.textures.get(key).getSourceImage() as CanvasImageSource, 0, 0, 40, 40);
      else drawCoin(ctx, 20, 20, 16);
    });
    c.add([this.add.image(0, 0, 'shop:coin').setOrigin(0, 0.5), this.t(46, 0, price.toLocaleString(), 28, INK, 0, 0.5)]);
    return c;
  }

  private furnitureCard(f: FurnitureDef, x: number, y: number): Phaser.GameObjects.Container {
    const record = this.record!;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0xfbf1dc, 1).fillRoundedRect(0, 0, CARD.w, CARD.h, 18);
    g.lineStyle(6, 0x16101c, 1).strokeRoundedRect(0, 0, CARD.w, CARD.h, 18);
    // 【仮】家具の絵の所(絵が届くまでは、シリーズの色と種類の名前)
    const col = SERIES_COLORS[f.series];
    g.fillStyle(col.bg, 1).fillRoundedRect(12, 12, CARD.w - 24, 100, 12);
    c.add(g);
    if (MYSTERY_ITEMS[f.id]) {
      // 中身は謎(企画者決定 2026-10-22)
      c.add(this.t(CARD.w / 2, 62, '？', 64, '#ffd23a').setStroke('#16101c', 8));
    } else if (this.textures.exists(furnitureKey(f.id))) {
      const img = this.add.image(CARD.w / 2, 62, furnitureKey(f.id));
      img.setScale(Math.min((CARD.w - 40) / img.width, 90 / img.height));
      c.add(img);
    } else c.add(this.t(CARD.w / 2, 62, KIND_RULES[f.kind].name, 30, col.fg));
    c.add(this.t(16, 120, f.name, 22, INK, 0, 0));
    const owned = record.owns(f.id);
    if (this.mode === 'shop') {
      c.add(this.priceRow(16, 176, f.price));
      if (owned) c.add(this.t(CARD.w - 16, 176, `持っている：${owned}`, 18, '#5a4a66', 1, 0.5));
    } else {
      c.add(this.t(16, 166, `ボックス：${record.inBox(f.id)}`, 22, INK, 0, 0.5));
      c.add(this.t(16, 190, `置いている：${owned - record.inBox(f.id)}`, 18, '#5a4a66', 0, 0.5));
    }
    const hit = this.add.zone(0, 0, CARD.w, CARD.h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => (this.mode === 'shop' ? this.confirmBuy(f.id, f.name, f.price) : this.useFurniture(f)));
    c.add(hit);
    return c;
  }

  // ---------------- 買う・使う ----------------

  /** まん中に出す確認の箱。buttons が空なら、さわると閉じる */
  private dialog(lines: { text: string; size: number; color?: string; image?: string }[], buttons: { label: string; kind: 'yes' | 'no' | 'off'; onTap?: () => void }[]): void {
    this.busy = true;
    const box = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, -400, W, H + 800, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const h = 100 + lines.reduce((s, l) => s + (l.image ? DIALOG_IMAGE_H : l.size * 1.3 * l.text.split('\n').length) + 14, 0) + (buttons.length ? 100 : 0);
    const top = H / 2 - h / 2;
    const g = this.add.graphics();
    g.fillStyle(0xfbf1dc, 1).fillRoundedRect(60, top, W - 120, h, 24);
    g.lineStyle(8, 0x16101c, 1).strokeRoundedRect(60, top, W - 120, h, 24);
    box.add([dim, g]);
    let y = top + 50;
    for (const l of lines) {
      if (l.image) {
        const img = this.add.image(W / 2, y, l.image).setOrigin(0.5, 0);
        img.setScale(Math.min(DIALOG_IMAGE_H / img.height, (W - 200) / img.width));
        box.add(img);
        y += DIALOG_IMAGE_H + 14;
        continue;
      }
      const tx = this.t(W / 2, y, l.text, l.size, l.color ?? INK, 0.5, 0);
      tx.setWordWrapWidth(W - 180, true);
      box.add(tx);
      y += tx.height + 14;
    }
    const close = () => {
      box.destroy();
      this.busy = false;
    };
    buttons.forEach((b, i) => {
      const bx = W / 2 + (buttons.length === 1 ? 0 : (i - 0.5) * 240);
      box.add(
        this.button(bx, top + h - 70, b.label, 32, () => {
          close();
          b.onTap?.();
        }, b.kind),
      );
    });
    if (!buttons.length) this.time.delayedCall(250, () => dim.once('pointerdown', close));
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 140 });
  }

  /** 買う確認。−・＋で数を変えて、まとめて買える(企画者決定 2026-10-26) */
  private confirmBuy(id: string, name: string, price: number): void {
    if (this.busy) return;
    audio.se('tap');
    this.busy = true;
    const coins = this.record?.coins ?? 0;
    const max = Math.max(1, Math.min(99, Math.floor(coins / price)));
    let n = 1;
    const box = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, -400, W, H + 800, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const h = 520;
    const top = H / 2 - h / 2;
    const g = this.add.graphics();
    g.fillStyle(0xfbf1dc, 1).fillRoundedRect(60, top, W - 120, h, 24);
    g.lineStyle(8, 0x16101c, 1).strokeRoundedRect(60, top, W - 120, h, 24);
    const title = this.t(W / 2, top + 60, `${name}を買う？`, 34).setWordWrapWidth(W - 180, true);
    const unit = this.t(W / 2, top + 118, `1つ ${price.toLocaleString()} コイン`, 24, '#5a4a66');
    const count = this.t(W / 2, top + 200, '', 56);
    const total = this.t(W / 2, top + 280, '', 30, '#c2410c');
    const warn = this.t(W / 2, top + 326, '', 24, '#c2410c');
    box.add([dim, g, title, unit, count, total, warn]);
    let buyBtn: Phaser.GameObjects.Text | null = null;
    const refresh = () => {
      const enough = coins >= price * n;
      count.setText(`× ${n}`);
      total.setText(`${(price * n).toLocaleString()} コイン`);
      warn.setText(enough ? '' : 'コインが たりません');
      buyBtn?.setBackgroundColor(enough ? '#ffd23a' : '#9a9098').setColor(enough ? INK : '#ffffff');
    };
    const step = (x: number, label: string, d: number) =>
      this.button(x, top + 200, label, 44, () => {
        const next = Math.max(1, Math.min(max, n + d));
        if (next === n) return;
        audio.se('tap');
        n = next;
        refresh();
      }, 'no').setPadding(26, 2, 26, 8);
    box.add([step(W / 2 - 170, '－', -1), step(W / 2 + 170, '＋', 1)]);
    const close = () => {
      box.destroy();
      this.busy = false;
    };
    box.add(this.button(W / 2 - 120, top + h - 70, 'やめる', 32, () => {
      audio.se('back');
      close();
    }, 'no'));
    buyBtn = this.button(W / 2 + 120, top + h - 70, ' 買う ', 32, () => {
      if (coins < price * n) return;
      close();
      this.buy(id, n);
    });
    box.add(buyBtn);
    refresh();
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 140 });
  }

  private buy(id: string, n: number): void {
    const record = this.record!;
    const got = record.buyMany(id, n);
    if (!got) return;
    audio.se('select');
    this.showCoins();
    this.drawList();
    if (MYSTERY_ITEMS[id]) {
      if (got.length === 1 && this.textures.exists(furnitureKey(got[0]))) {
        // 金マッチョ: 当たった像を見せる
        this.dialog([{ text: 'これが当たった！', size: 34 }, { text: '', size: 0, image: furnitureKey(got[0]) }, { text: 'アイテムボックスに入れました', size: 26 }], []);
        return;
      }
      // まとめて買ったときは、当たった物の名前と数
      const tally = new Map<string, number>();
      for (const g of got) tally.set(g, (tally.get(g) ?? 0) + 1);
      this.prizeDialog(tally);
      return;
    }
    this.dialog([{ text: got.length > 1 ? `${got.length}こ\nアイテムボックスに\n入れました！` : 'アイテムボックスに\n入れました！', size: 34 }], []);
  }

  /** まとめて買った ふくびきの家具: 当たった像を並べて、それぞれの数を出す。さわると閉じる */
  private prizeDialog(tally: Map<string, number>): void {
    this.busy = true;
    const box = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, -400, W, H + 800, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const h = 520;
    const top = H / 2 - h / 2;
    const g = this.add.graphics();
    g.fillStyle(0xfbf1dc, 1).fillRoundedRect(60, top, W - 120, h, 24);
    g.lineStyle(8, 0x16101c, 1).strokeRoundedRect(60, top, W - 120, h, 24);
    box.add([dim, g, this.t(W / 2, top + 56, 'これが当たった！', 34)]);
    const items = [...tally];
    items.forEach(([id, k], i) => {
      const x = W / 2 + (i - (items.length - 1) / 2) * 260;
      if (this.textures.exists(furnitureKey(id))) {
        const img = this.add.image(x, top + 250, furnitureKey(id));
        img.setScale(Math.min(220 / img.height, 220 / img.width));
        box.add(img);
      }
      box.add(this.t(x, top + 390, `× ${k}`, 40));
    });
    box.add(this.t(W / 2, top + h - 50, 'アイテムボックスに入れました', 26));
    this.time.delayedCall(250, () =>
      dim.once('pointerdown', () => {
        box.destroy();
        this.busy = false;
      }),
    );
  }

  private useFurniture(f: FurnitureDef): void {
    if (this.busy) return;
    audio.se('tap');
    if ((this.record?.inBox(f.id) ?? 0) <= 0) {
      this.dialog([{ text: `${f.name}は\nぜんぶ部屋に置いています`, size: 30 }], []);
      return;
    }
    this.dialog(
      [{ text: `${f.name}を\n部屋に置く？`, size: 34 }],
      [
        { label: 'やめる', kind: 'no', onTap: () => audio.se('back') },
        { label: '置く', kind: 'yes', onTap: () => this.goHome({ placeItem: f.id }) },
      ],
    );
  }

  private useOther(id: string): void {
    if (this.busy) return;
    audio.se('tap');
    const kind = scratchKindOf(id);
    if (kind) return this.openScratch(kind);
    if (id === MOVE_TICKET) {
      // 引越し先を選ぶ画面へ(引越し券を使うのは、引越し先を決めたとき)
      this.busy = true;
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('RoomSelect', { mode: 'move' }));
    }
  }

  /**
   * スクラッチを 削る(2026-11-17 企画者「3個 削って 2個 同じ マーク そろったら 当たり」)。
   * 先に 1枚 使って 結果を 決め、もらう ものも 先に 入れる(とちゅうで 閉じても なくならない)。削るのは 見せ方だけ。
   * 2026-11-17 企画者「もっと コインで 削ってる 感じ」「削ってる 時も 何が 当たったら どの くらいか 表示」
   * → 指で なぞった 所だけ 銀が はがれる(コインが 指に ついて くる)・下に もらえる 表
   */
  private openScratch(kind: ScratchKind): void {
    const record = this.record;
    if (!record || !record.useItem(SCRATCH_ITEMS[kind])) return;
    const res = drawScratch(kind, Math.random);
    if (res.prize.amount) {
      if (kind === 'coin') record.add(res.prize.amount);
      else record.grant({ runId: `scratch:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, source: 'scratch', coins: 0, exp: res.prize.amount });
    }
    this.busy = true;
    const box = this.add.container(0, 0).setDepth(100);
    box.add(this.add.rectangle(0, -400, W, H + 800, 0x000000, 0.7).setOrigin(0, 0).setInteractive());
    const PH = 960;
    const top = H / 2 - PH / 2;
    const g = this.add.graphics();
    g.fillGradientStyle(0xffe680, 0xffe680, 0xffb020, 0xffb020, 1).fillRoundedRect(40, top, W - 80, PH, 28);
    g.lineStyle(8, 0x16101c, 1).strokeRoundedRect(40, top, W - 80, PH, 28);
    box.add(g);
    box.add(this.t(W / 2, top + 56, SCRATCH_NAMES[kind], 44, INK));
    box.add(this.t(W / 2, top + 108, '指で なぞって 3つ けずろう！ 2つ そろえば 当たり', 22, '#5a3a10'));
    // 何が そろったら どの くらい(確率は 出さない)
    const ty0 = top + 410;
    const tbl = this.add.graphics();
    tbl.fillStyle(0xfff6d8, 1).fillRoundedRect(80, ty0 - 34, W - 160, 52 + SCRATCH_TABLE[kind].filter((p) => p.mark).length * 50, 18);
    tbl.lineStyle(4, 0x16101c, 1).strokeRoundedRect(80, ty0 - 34, W - 160, 52 + SCRATCH_TABLE[kind].filter((p) => p.mark).length * 50, 18);
    box.add(tbl);
    box.add(this.t(W / 2, ty0, kind === 'coin' ? '2つ そろうと MONZ コイン' : '2つ そろうと 経験値', 22, '#8a5a10'));
    const rows = new Map<string, Phaser.GameObjects.Text>();
    SCRATCH_TABLE[kind]
      .filter((p) => p.mark)
      .forEach((p, i) => {
        const y = ty0 + 48 + i * 50;
        for (const dx of [-170, -118]) {
          const key = `scratch:${p.mark}`;
          if (this.textures.exists(key)) {
            const ic = this.add.image(W / 2 + dx, y, key);
            ic.setScale(44 / Math.max(ic.width, ic.height));
            box.add(ic);
          }
        }
        box.add(this.t(W / 2 - 60, y, '→', 26, '#8a7a60'));
        const amt = this.t(W / 2 + 180, y, `${p.amount.toLocaleString()} ${kind === 'coin' ? 'コイン' : '経験値'}`, 28, INK, 1, 0.5);
        box.add(amt);
        rows.set(p.mark!, amt);
      });
    const resY = top + PH - 150;
    const result = this.t(W / 2, resY, '', 40, INK);
    box.add(result);
    const closeBtn = this.t(W / 2, top + PH - 56, 'とじる', 32, '#ffffff').setBackgroundColor('#16101c').setPadding(40, 12, 40, 14).setVisible(false);
    closeBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      audio.se('back');
      for (const k of keys) if (this.textures.exists(k)) this.textures.remove(k);
      box.destroy();
      this.busy = false;
      this.scene.restart({ mode: this.mode, tab: 'other' });
    });
    box.add(closeBtn);
    const finish = () => {
      const p = res.prize;
      if (p.amount) {
        audio.se('cheer');
        result.setText(`当たり！！ ${kind === 'coin' ? `MONZ コイン +${p.amount.toLocaleString()}` : `経験値 +${p.amount.toLocaleString()}`}`).setColor('#c0182a');
        rows.get(p.mark!)?.setColor('#c0182a');
        this.cameras.main.flash(300, 255, 240, 160);
      } else {
        audio.se('back');
        result.setText('ハズレ…').setColor('#5a4a66');
      }
      result.setScale(1.6);
      this.tweens.add({ targets: result, scale: 1, duration: 300, ease: 'Back.easeOut' });
      closeBtn.setVisible(true);
    };
    // 3つの マス。銀は 自分で 描いた 絵(なぞった 所を 消す)
    const cell = 180;
    const cy = top + 250;
    const R = 22;
    const keys: string[] = [];
    let open = 0;
    // 指に ついて くる コイン
    const coin = this.textures.exists(COIN_ART_KEY) ? this.add.image(0, 0, COIN_ART_KEY).setVisible(false).setDepth(101) : undefined;
    coin?.setScale(70 / coin.width);
    res.marks.forEach((m, i) => {
      const x = W / 2 + (i - 1) * (cell + 20);
      box.add(this.add.rectangle(x, cy, cell, cell, 0xffffff, 1).setStrokeStyle(5, 0x16101c));
      const key = `scratch:${m}`;
      if (this.textures.exists(key)) {
        const img = this.add.image(x, cy, key);
        img.setScale((cell - 30) / Math.max(img.width, img.height));
        box.add(img);
      }
      const ck = `scratch:cover:${Date.now()}:${i}`;
      keys.push(ck);
      const tex = this.textures.createCanvas(ck, cell - 6, cell - 6);
      const ctx = tex?.getContext();
      if (!tex || !ctx) return;
      const S = cell - 6;
      const grd = ctx.createLinearGradient(0, 0, S, S);
      grd.addColorStop(0, '#e4e6ee');
      grd.addColorStop(0.5, '#a8acb8');
      grd.addColorStop(1, '#d8dae4');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = 0; k < 40; k++) ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 18, 2);
      ctx.fillStyle = '#7a7e8a';
      ctx.font = '900 70px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', S / 2, S / 2);
      tex.refresh();
      const cover = this.add.image(x, cy, ck);
      box.add(cover);
      // 消した 所(12×12 の ます)を 数えて 8割 けずれたら ひらく
      const N = 12;
      const hit = new Set<number>();
      let done = false;
      let last: { x: number; y: number } | null = null;
      const erase = (px: number, py: number) => {
        if (done) return;
        const lx = px - (x - S / 2);
        const ly = py - (cy - S / 2);
        const pts = last ? Math.max(1, Math.ceil(Math.hypot(lx - last.x, ly - last.y) / 8)) : 1;
        ctx.globalCompositeOperation = 'destination-out';
        for (let k = 1; k <= pts; k++) {
          const ax = last ? last.x + ((lx - last.x) * k) / pts : lx;
          const ay = last ? last.y + ((ly - last.y) * k) / pts : ly;
          ctx.beginPath();
          ctx.arc(ax, ay, R, 0, Math.PI * 2);
          ctx.fill();
          for (let gx = Math.floor((ax - R) / (S / N)); gx <= Math.floor((ax + R) / (S / N)); gx++)
            for (let gy = Math.floor((ay - R) / (S / N)); gy <= Math.floor((ay + R) / (S / N)); gy++) if (gx >= 0 && gy >= 0 && gx < N && gy < N) hit.add(gx * N + gy);
        }
        ctx.globalCompositeOperation = 'source-over';
        tex.refresh();
        last = { x: lx, y: ly };
        if (Math.random() < 0.35) audio.se('tap', { pitch: 1.7 + Math.random() * 0.4 });
        if (hit.size < N * N * 0.8) return;
        done = true;
        this.tweens.add({ targets: cover, alpha: 0, duration: 200, onComplete: () => cover.destroy() });
        audio.se('select');
        if (++open === 3) this.time.delayedCall(400, finish);
      };
      cover.setInteractive({ useHandCursor: true });
      cover.on('pointerdown', (p: Phaser.Input.Pointer) => {
        last = null;
        erase(p.worldX, p.worldY);
      });
      cover.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) erase(p.worldX, p.worldY);
        else last = null;
      });
      cover.on('pointerout', () => (last = null));
    });
    // コインを 指に ついて こさせる
    const follow = (p: Phaser.Input.Pointer) => {
      if (!coin?.active) return;
      coin.setVisible(p.isDown && open < 3).setPosition(p.worldX + 18, p.worldY - 18).setAngle(-25 + Math.sin(this.time.now / 60) * 8);
    };
    this.input.on('pointermove', follow);
    this.input.on('pointerdown', follow);
    this.input.on('pointerup', () => coin?.setVisible(false));
    box.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('pointermove', follow);
      this.input.off('pointerdown', follow);
      coin?.destroy();
    });
  }

  private leave(): void {
    this.goHome();
  }

  private goHome(data?: { placeItem?: string }): void {
    if (this.busy) return;
    this.busy = true;
    audio.se(data ? 'select' : 'back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Home', data ?? {}));
  }
}
