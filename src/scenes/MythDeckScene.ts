import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { card, sortCardIds } from '../core/mythclash/cards';
import { addSortChips, cardSortChoice } from '../ui/sortChips';
import { battleUnlocked, deckOwned, kindsToUnlock, ownedCount } from '../core/mythclash/packs';
import { showCardZoom } from '../ui/cardZoom';
import { drawMythCard, MYTH_CARD_H, MYTH_CARD_W } from '../ui/mythCardArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { fillSize } from '../ui/viewport';

const W = 720;
const PORTRAIT = { w: 720, h: 1280 };
const COLS = 4;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const GRID_S = 0.5;
const SLOT_S = 0.56;
const cardKey = (id: number) => `mc:card:${id}`;

/**
 * MYTHCLASH のデッキ編成(企画者 2026-10-26: タイトルの「バトルを始める」→ 3枚のデッキ編成 → バトル)。
 * - 持っているカードから、ちがうカードを3枚えらぶ。上の3つの枠に入った順に、先頭から場に出る
 * - 下のカードをさわると枠に入る(もう一度さわると外れる)。枠のカードをさわっても外れる。長押しで大きく見る
 * - 並びかえ: 強い順(総合値)・弱い順・No.順(企画者 2026-10-26)
 * - 組んだデッキは覚えておく(企画者 2026-10-26: 最後に使ったデッキを保存して、また選ばなくてもいいように)。
 *   次に開くと、前のデッキが入った状態で始まるので、そのまま「バトル開始！」を押せる
 * - mode: battle =「バトル開始」で対戦へ / edit =「チーム編成」から開いたとき。「決定」で覚えてタイトルへ
 * - バトル解放前(3種類ない)は、「あと○種類」と、テストプレイ(ランダムな3枚)のボタン【仮】
 */
export class MythDeckScene extends Phaser.Scene {
  private mode: 'battle' | 'edit' = 'battle';
  private record!: LifeRecord;
  private deck: number[] = [];
  private page = 0;
  private owned: number[] = [];
  private H = 1280;
  private layer?: Phaser.GameObjects.Container;
  private leaving = false;
  /** 前に使ったデッキを入れた状態で始めたか(さわって変えたら消える) */
  private fromSave = false;

  constructor() {
    super('MythDeck');
  }

  init(data: { mode?: 'battle' | 'edit' }): void {
    this.mode = data?.mode ?? 'battle';
    this.page = 0;
    this.leaving = false;
    this.H = fillSize(this, PORTRAIT, { minRatio: 0.42, maxRatio: PORTRAIT.w / PORTRAIT.h }).h;
    this.scale.setGameSize(W, this.H);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    this.record = new LifeRecord(loadLife());
    const col = this.record.mythclash;
    this.owned = sortCardIds(Object.keys(col.owned).map(Number), cardSortChoice.deck ?? 'strong');
    this.deck = col.deck && deckOwned(col, col.deck) ? [...col.deck] : [];
    this.fromSave = this.deck.length === 3;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a0a12, 0x2a0a12, 0x0a0408, 0x0a0408, 1).fillRect(0, 0, W, this.H);
    this.draw();
    this.cameras.main.fadeIn(220, 0, 0, 0);
    audio.playBgm('mythclash');
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(0.5);
  }

  private tex(id: number): string {
    return canvasTextureOnce(this, cardKey(id), MYTH_CARD_W, MYTH_CARD_H, (ctx) => drawMythCard(ctx, card(id)!));
  }

  private draw(): void {
    this.layer?.destroy();
    const L = this.add.container(0, 0);
    this.layer = L;
    const H = this.H;
    const col = this.record.mythclash;
    const back = this.text(90, 46, '◀ もどる', 28, '#ffffff').setBackgroundColor('#16101ccc').setPadding(14, 6, 14, 8).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.go('MythTitle'));
    L.add([back, this.text(W / 2 + 60, 46, this.mode === 'edit' ? 'チーム編成' : 'デッキ編成', 40, '#ffd23a').setStroke('#16101c', 8)]);

    if (!battleUnlocked(col)) {
      // まだバトルできない
      L.add(this.text(W / 2, H / 2 - 80, `異なるカードをあと${kindsToUnlock(col)}種類集めると\nバトル解放！`, 34, '#ffffff'));
      if (this.mode === 'battle') {
        const test = this.text(W / 2, H / 2 + 80, 'テストプレイ（ランダムな3枚）', 30, '#16101c').setBackgroundColor('#ffd23a').setPadding(24, 10, 24, 12).setInteractive({ useHandCursor: true });
        test.on('pointerdown', () => this.go('MythBattle', { deck: null }));
        L.add(test);
      }
      return;
    }

    // 上: 3つの枠(入れた順に、先頭から場に出る)
    L.add(this.text(W / 2, 108, this.fromSave ? '前回のデッキ（そのまま「バトル開始！」でOK）' : 'ちがうカードを3枚えらんでね（1番から順に出る）', 22, this.fromSave ? '#7dffa0' : '#d8c8e8'));
    const sw = MYTH_CARD_W * SLOT_S;
    const sh = MYTH_CARD_H * SLOT_S;
    for (let i = 0; i < 3; i++) {
      const x = W / 2 + (i - 1) * (sw + 24);
      const y = 140 + sh / 2;
      const frame = this.add.graphics();
      frame.lineStyle(4, 0xffd23a, this.deck[i] ? 1 : 0.5).strokeRoundedRect(x - sw / 2 - 6, y - sh / 2 - 6, sw + 12, sh + 12, 12);
      L.add([frame, this.text(x - sw / 2 + 4, y - sh / 2 - 4, String(i + 1), 26, '#ffd23a').setOrigin(0, 0).setStroke('#16101c', 6).setDepth(2)]);
      const id = this.deck[i];
      if (id === undefined) {
        L.add(this.text(x, y, '？', 60, '#5a4a66'));
        continue;
      }
      const img = this.add.image(x, y, this.tex(id)).setScale(SLOT_S);
      this.touchable(img, () => this.toggle(id), () => showCardZoom(this, this.tex(id), [card(id)!.name]));
      L.add(img);
    }

    // 並びかえ(強い順・弱い順・No.順)
    const sortY = 140 + sh + 36;
    addSortChips(this, L, W / 2, sortY, cardSortChoice.deck ?? 'strong', (k) => {
      cardSortChoice.deck = k;
      this.owned = sortCardIds(this.owned, k);
      this.page = 0;
      this.draw();
    });
    // まん中: 持っているカード(ページごと)
    const top = sortY + 34;
    const gw = MYTH_CARD_W * GRID_S;
    const gh = MYTH_CARD_H * GRID_S;
    const gap = (W - COLS * gw) / (COLS + 1);
    const pages = Math.max(1, Math.ceil(this.owned.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    this.owned.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((id, k) => {
      const x = gap + gw / 2 + (k % COLS) * (gw + gap);
      const y = top + gh / 2 + Math.floor(k / COLS) * (gh + 30);
      const img = this.add.image(x, y, this.tex(id)).setScale(GRID_S);
      const n = this.deck.indexOf(id);
      if (n >= 0) img.setTint(0x777777);
      L.add(img);
      if (n >= 0) L.add(this.text(x, y, `${n + 1}`, 64, '#ffd23a').setStroke('#16101c', 10));
      const cnt = ownedCount(this.record.mythclash, id);
      if (cnt > 1) L.add(this.text(x + gw / 2 - 18, y + gh / 2 - 14, `×${cnt}`, 20, '#ffffff').setStroke('#16101c', 6));
      this.touchable(img, () => this.toggle(id), () => showCardZoom(this, this.tex(id), [card(id)!.name, `持っている：${cnt}枚`]));
    });
    const pageY = top + ROWS * (gh + 30) + 6;
    if (pages > 1) {
      const arrow = (x: number, s: string, d: number) => {
        const a = this.text(x, pageY, s, 36, '#16101c').setBackgroundColor('#ffd23a').setPadding(20, 2, 20, 4).setInteractive({ useHandCursor: true });
        a.on('pointerdown', () => {
          audio.se('tap');
          this.page = (this.page + d + pages) % pages;
          this.draw();
        });
        L.add(a);
      };
      arrow(110, '◀', -1);
      arrow(W - 110, '▶', 1);
      L.add(this.text(W / 2, pageY, `${this.page + 1} / ${pages}`, 26, '#ffffff'));
    }
    L.add(this.text(W / 2, pageY + 44, 'さわると えらぶ・はずす　長押しで 大きく見る', 18, '#9a8aa8'));

    // 下: バトル開始 / 決定
    const ready = this.deck.length === 3;
    const label = this.mode === 'edit' ? '決定' : 'バトル開始！';
    const go = this.text(W / 2, H - 70, label, 40, ready ? '#16101c' : '#8a8090').setBackgroundColor(ready ? '#ffd23a' : '#3a3040').setPadding(48, 12, 48, 14);
    if (ready)
      go.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.record.setMythDeck(this.deck);
        if (this.mode === 'edit') this.go('MythTitle');
        else this.go('MythBattle', { deck: [...this.deck] });
      });
    L.add(go);
  }

  /** さわる(短く)と onTap、長押し(0.45秒)で onHold */
  private touchable(obj: Phaser.GameObjects.Image, onTap: () => void, onHold: () => void): void {
    let timer: Phaser.Time.TimerEvent | undefined;
    let held = false;
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () => {
      held = false;
      timer = this.time.delayedCall(450, () => {
        held = true;
        onHold();
      });
    });
    obj.on('pointerup', () => {
      timer?.remove();
      if (!held) onTap();
    });
    obj.on('pointerout', () => timer?.remove());
  }

  private toggle(id: number): void {
    this.fromSave = false;
    const i = this.deck.indexOf(id);
    if (i >= 0) {
      this.deck.splice(i, 1);
      audio.se('back');
    } else if (this.deck.length < 3) {
      this.deck.push(id);
      audio.se('select');
    } else {
      audio.se('tap', { pitch: 0.8 });
      return;
    }
    this.draw();
  }

  private go(scene: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se(scene === 'MythBattle' ? 'next' : 'back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
