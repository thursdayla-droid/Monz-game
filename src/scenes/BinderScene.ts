import * as Phaser from 'phaser';
import { preloadPacks } from '../render/packs';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { card, cardNo, CARDS, sortCardIds } from '../core/mythclash/cards';
import { addSortChips, cardSortChoice } from '../ui/sortChips';
import { battleUnlocked, kindsToUnlock, newCollection, ownedCount, ownedKinds, type MythCollection } from '../core/mythclash/packs';
import { drawMythCard, MYTH_CARD_H, MYTH_CARD_W, useCardArt, cardZoomTexture } from '../ui/mythCardArt';
import { canvasTextureOnce, roundRectPath, UI_FONT } from '../ui/paint';

const W = 720;
const H = 1280;
/** 1ページのポケット(3×3。本物のバインダーと同じ) */
const COLS = 3;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const POCKET = { w: 212, h: 290, gap: 10, top: 268 };
const CARD_S = Math.min((POCKET.w - 20) / MYTH_CARD_W, (POCKET.h - 20) / MYTH_CARD_H);
const cardKey = (id: number) => `mc:card:${id}`;

/**
 * カードバインダー(MYTHCLASH の持っているカード)。お世話画面の「もようがえ」の下と、MYTHCLASH の「カードコレクション」から開く(企画者決定 2026-10-26)。
 * - カードNo順に3×3のポケット。持っていないカードは「？？？」(番号だけ)。2枚以上は「×枚数」
 * - 上に「所持種類数：○/100」。バトル解放前は「異なるカードをあと○種類集めるとバトル解放！」
 * - ◀ ▶ か、横になぞってページをめくる。カードをさわると大きく見られる
 * - 並びかえ: 強い順・弱い順(総合値)・No.順(企画者 2026-10-26)。強い順・弱い順では、持っているカードが先、持っていないカードはあとにNo.順
 * 【仮】バインダーの見た目はプログラムで描いたもの
 */
export class BinderScene extends Phaser.Scene {
  private back = 'Home';
  private page = 0;
  private col: MythCollection = newCollection();
  private pageLayer?: Phaser.GameObjects.Container;
  private pageLabel?: Phaser.GameObjects.Text;
  private busy = false;
  /** ページに並べる順番(カードNo) */
  private order: number[] = [];

  constructor() {
    super('Binder');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'Home';
    this.page = 0;
    this.busy = false;
    this.scale.setGameSize(W, H);
  }

  private get pages(): number {
    return Math.ceil(CARDS.length / PER_PAGE);
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    // 企画者のカードの絵を使えるようにする(2026-10-27)
    useCardArt(this);
    this.col = loadLife().mythclash ?? newCollection();
    // 表紙の内側(黒っぽい赤の革)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3a0d16, 0x3a0d16, 0x14060a, 0x14060a, 1).fillRect(0, 0, W, H);
    bg.fillStyle(0x000000, 0.25).fillRect(0, 0, 26, H);
    for (let y = 120; y < H; y += 170) bg.fillStyle(0xb8a070, 1).fillCircle(13, y, 6);

    const back = this.add
      .text(24, 30, '◀ もどる', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 8 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    this.add.text(W / 2 + 70, 54, 'カードバインダー', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffd23a', stroke: '#16101c', strokeThickness: 8 }).setOrigin(0.5);
    const kinds = ownedKinds(this.col);
    this.add.text(W / 2, 130, `所持種類数：${kinds}/${CARDS.length}`, { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    const unlock = battleUnlocked(this.col) ? 'バトル解放ずみ！' : `異なるカードをあと${kindsToUnlock(this.col)}種類集めるとバトル解放！`;
    this.add.text(W / 2, 182, unlock, { fontFamily: UI_FONT, fontSize: '26px', fontStyle: '900', color: battleUnlocked(this.col) ? '#7dffa0' : '#ffb070' }).setOrigin(0.5);

    // ページめくり
    const footY = POCKET.top + ROWS * (POCKET.h + POCKET.gap) + 50;
    const arrow = (x: number, label: string, d: number) =>
      this.add
        .text(x, footY, label, { fontFamily: UI_FONT, fontSize: '44px', fontStyle: '900', color: '#16101c', backgroundColor: '#ffd23a', padding: { x: 26, y: 4 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.turn(d));
    arrow(110, '◀', -1);
    arrow(W - 110, '▶', 1);
    this.pageLabel = this.add.text(W / 2, footY, '', { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    let downX: number | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (downX = p.x));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (downX !== null && Math.abs(p.x - downX) > 90 && !this.busy) this.turn(p.x < downX ? 1 : -1);
      downX = null;
    });
    this.sortLayer = this.add.container(0, 0);
    this.applySort(cardSortChoice.binder ?? 'no');
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  private sortLayer?: Phaser.GameObjects.Container;

  private applySort(k: 'strong' | 'weak' | 'no'): void {
    cardSortChoice.binder = k;
    const all = CARDS.map((c) => c.id);
    const have = all.filter((id) => ownedCount(this.col, id) > 0);
    const not = all.filter((id) => ownedCount(this.col, id) === 0);
    this.order = k === 'no' ? all : [...sortCardIds(have, k), ...not];
    this.sortLayer?.removeAll(true);
    addSortChips(this, this.sortLayer!, W / 2, 226, k, (n) => this.applySort(n));
    this.page = 0;
    this.drawPage(0, 0);
  }

  private turn(d: number): void {
    if (this.busy) return;
    const next = (this.page + d + this.pages) % this.pages;
    audio.se('tap');
    this.drawPage(d, next);
  }

  /** ページを描く(dir: めくる向き。0 ならそのまま) */
  private drawPage(dir: number, page = this.page): void {
    const old = this.pageLayer;
    this.page = page;
    this.pageLabel?.setText(`${page + 1} / ${this.pages}`);
    const layer = this.add.container(0, 0);
    const x0 = (W - COLS * POCKET.w - (COLS - 1) * POCKET.gap) / 2 + 8;
    for (let i = 0; i < PER_PAGE; i++) {
      const id = this.order[page * PER_PAGE + i];
      if (id === undefined) break;
      const x = x0 + (i % COLS) * (POCKET.w + POCKET.gap);
      const y = POCKET.top + Math.floor(i / COLS) * (POCKET.h + POCKET.gap);
      layer.add(this.pocket(id, x, y));
    }
    this.pageLayer = layer;
    if (old && dir) {
      // めくる: 前のページは出ていき、新しいページが入ってくる
      layer.x = dir * W;
      this.tweens.add({ targets: old, x: -dir * W, duration: 240, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
      this.tweens.add({ targets: layer, x: 0, duration: 240, ease: 'Cubic.easeOut' });
    } else old?.destroy();
  }

  private pocket(id: number, x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const n = ownedCount(this.col, id);
    const g = this.add.graphics();
    // ポケット(とうめいのビニール)
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(0, 0, POCKET.w, POCKET.h, 10);
    g.lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(0, 0, POCKET.w, POCKET.h, 10);
    c.add(g);
    const cx = POCKET.w / 2;
    const cy = POCKET.h / 2;
    if (n > 0) {
      const def = card(id)!;
      canvasTextureOnce(this, cardKey(id), MYTH_CARD_W, MYTH_CARD_H, (ctx) => drawMythCard(ctx, def));
      const img = this.add.image(cx, cy, cardKey(id)).setScale(CARD_S);
      c.add(img);
      if (n > 1) c.add(this.add.text(POCKET.w - 12, POCKET.h - 14, `×${n}`, { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '28px', color: '#ffd23a', stroke: '#16101c', strokeThickness: 7 }).setOrigin(1, 1));
      img.setInteractive({ useHandCursor: true }).on('pointerup', (p: Phaser.Input.Pointer) => {
        if (Math.abs(p.x - p.downX) < 20) this.zoom(id, n);
      });
    } else {
      // 持っていないカード: 番号だけ
      canvasTextureOnce(this, 'mc:binder:empty', MYTH_CARD_W, MYTH_CARD_H, (ctx) => {
        roundRectPath(ctx, 0, 0, MYTH_CARD_W, MYTH_CARD_H, 20);
        ctx.fillStyle = 'rgba(10,4,8,0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 6;
        ctx.setLineDash([16, 12]);
        roundRectPath(ctx, 10, 10, MYTH_CARD_W - 20, MYTH_CARD_H - 20, 14);
        ctx.stroke();
      });
      c.add(this.add.image(cx, cy, 'mc:binder:empty').setScale(CARD_S));
      c.add(this.add.text(cx, cy - 20, '？？？', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: 'rgba(255,255,255,0.35)' }).setOrigin(0.5));
      c.add(this.add.text(cx, cy + 30, cardNo(id), { fontFamily: UI_FONT, fontSize: '22px', fontStyle: '900', color: 'rgba(255,255,255,0.45)' }).setOrigin(0.5));
    }
    return c;
  }

  /** カードを大きく見る(さわると閉じる) */
  private zoom(id: number, n: number): void {
    if (this.busy) return;
    this.busy = true;
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0, 0).setInteractive();
    // 企画者のカードの絵があれば、くっきりした大きい絵で見せる(2026-10-27)
    const key = cardZoomTexture(this, cardKey(id));
    const f = this.textures.getFrame(key);
    const s = Math.min((W - 80) / f.width, (H * 0.68) / f.height);
    const img = this.add.image(W / 2, H * 0.45, key).setScale(s * 0.6);
    const t = this.add.text(W / 2, H * 0.45 + (f.height * s) / 2 + 50, `持っている：${n}枚`, { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    box.add([dim, img, t]);
    this.tweens.add({ targets: img, scale: s, duration: 200, ease: 'Back.easeOut' });
    this.time.delayedCall(200, () =>
      dim.once('pointerdown', () => {
        audio.se('back');
        box.destroy();
        this.busy = false;
      }),
    );
  }

  private leave(): void {
    if (this.busy) return;
    this.busy = true;
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(this.back));
  }
}
