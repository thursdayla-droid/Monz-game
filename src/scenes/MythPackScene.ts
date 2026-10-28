import * as Phaser from 'phaser';
import { abilityLines } from '../core/mythclash/describe';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { card, CARDS, type Rarity } from '../core/mythclash/cards';
import { newCollection, ownedKinds } from '../core/mythclash/packs';
import { preloadPacks } from '../render/packs';
import { drawMythCard, MYTH_CARD_H, MYTH_CARD_W, queueCardArt, RARITY_COLORS, useCardArt } from '../ui/mythCardArt';
import { MYTH_PACK_IMAGE, type PackOpenData, MYTH_CARD_BACK } from '../ui/packBuy';
import { canvasTextureOnce, roundRectPath, UI_FONT } from '../ui/paint';
import { showCardZoom } from '../ui/cardZoom';

const PORTRAIT = { w: 720, h: 1280 };
/** パックの絵(切り抜き後 686x1412。2026-10-26 の新しい絵)の、切る線の高さ(上のギザギザと点の帯のすぐ下) */
const CUT_AT = 0.068;
/** カードの幅は、パックの幅のこのくらい */
const CARD_OF_PACK = 0.8;
/** カードの下の、パックに入ったままの割合 */
const CARD_TUCK = 0.15;
const cardKey = (id: number) => `mc:card:${id}`;
const BACK_KEY = 'mc:card:back2';

type Phase = 'cut' | 'cutting' | 'reveal' | 'grid' | 'leaving';

/**
 * MYTHCLASH のパックを開ける画面(企画者決定 2026-10-26)。カードはもう買って保存してある(ここでは見せるだけ)。
 * - パックの上を一直線に横に切って開ける(なぞる。タップでも開く)
 * - 1枚ずつ順番に見せる。10パックのときは、とちゅうでタップするとスキップして、10枚まとめて並べる
 * - SECのときは特別な演出(secEffect)。【仮】演出の中身は差しかえられるように分けてある
 * 画面の向きは、開いた画面(ショップは縦・MYTHCLASH のタイトルは横)と同じにする
 */
export class MythPackScene extends Phaser.Scene {
  private d!: PackOpenData;
  private phase: Phase = 'cut';
  private index = 0;
  private shown: Phaser.GameObjects.GameObject[] = [];
  private body?: Phaser.GameObjects.Image;
  /** パックの幅(表示)・カードの中心の高さ・パックの口(切った所)の高さ */
  private packW = 400;
  private cardY = 0;
  private mouthY = 0;
  private seqTimer?: Phaser.Time.TimerEvent;
  private W = PORTRAIT.w;
  private H = PORTRAIT.h;

  constructor() {
    super('MythPack');
  }

  init(data: PackOpenData): void {
    this.d = data;
    this.phase = 'cut';
    this.index = 0;
    this.shown = [];
    this.body = undefined;
    this.seqTimer = undefined;
    const size = data.size ?? PORTRAIT;
    this.scale.setGameSize(size.w, size.h);
    this.W = size.w;
    this.H = size.h;
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
    // カードの絵は出たカードの分だけ(2026-10-28)
    queueCardArt(this, this.d.cards);
  }

  create(): void {
    // 企画者のカードの絵を使えるようにする(2026-10-27)
    useCardArt(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    const { W, H } = this;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a0a12, 0x2a0a12, 0x0a0408, 0x0a0408, 1).fillRect(0, 0, W, H);
    for (const id of new Set(this.d.cards)) canvasTextureOnce(this, cardKey(id), MYTH_CARD_W, MYTH_CARD_H, (ctx) => drawMythCard(ctx, card(id)!));
    // カードの裏面: 企画者の絵(2026-10-27「パック開封の時も使って」)。表と同じ大きさにして、めくったときに形が変わらないようにする
    canvasTextureOnce(this, BACK_KEY, MYTH_CARD_W, MYTH_CARD_H, (ctx) => {
      if (this.textures.exists(MYTH_CARD_BACK)) ctx.drawImage(this.textures.get(MYTH_CARD_BACK).getSourceImage() as HTMLImageElement, 0, 0, MYTH_CARD_W, MYTH_CARD_H);
      else drawBack(ctx);
    });
    audio.playBgm('mythclashPack');
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.showPack();
  }

  /** 縦長の画面なら大きく、横長なら高さに合わせる */
  private get unit(): number {
    return Math.min(this.W / 720, this.H / 1280) * (this.W > this.H ? 1.5 : 1);
  }

  // ---------------- パックを切る ----------------

  private showPack(): void {
    const { W, H } = this;
    const u = this.unit;
    const tex = this.textures.get(MYTH_PACK_IMAGE).getSourceImage() as HTMLImageElement;
    const ph = Math.min(H * 0.7, 820 * u);
    const s = ph / tex.height;
    const cx = W / 2;
    const cy = H * 0.5;
    const cutY = tex.height * CUT_AT;
    this.packW = tex.width * s;
    // 10パックのときは、うしろに重ねて見せる(切ったら消す)
    const stack: Phaser.GameObjects.GameObject[] = [];
    if (this.d.cards.length > 1) {
      for (let i = 2; i >= 1; i--) stack.push(this.add.image(cx + i * 14 * u, cy - i * 10 * u, MYTH_PACK_IMAGE).setScale(s).setAngle(i * 3).setTint(0x886666));
      stack.push(this.add.text(cx + (tex.width * s) / 2 - 10 * u, cy - ph / 2 + 30 * u, `×${this.d.cards.length}`, { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: `${Math.round(56 * u)}px`, color: '#ffd23a', stroke: '#16101c', strokeThickness: 10 * u }).setOrigin(0.5).setDepth(5));
    }
    // 上の切れはしと、本体(同じ絵を上下で分ける)
    const top = this.add.image(cx, cy, MYTH_PACK_IMAGE).setScale(s).setDepth(3);
    top.setCrop(0, 0, tex.width, cutY);
    const body = this.add.image(cx, cy, MYTH_PACK_IMAGE).setScale(s).setDepth(3);
    body.setCrop(0, cutY, tex.width, tex.height - cutY);
    this.body = body;
    const lineY = cy - ph / 2 + cutY * s;
    const x0 = cx - (tex.width * s) / 2;
    const x1 = cx + (tex.width * s) / 2;
    // 切る線の目じるし(点線と、ゆびの案内)
    const guide = this.add.graphics().setDepth(4);
    guide.lineStyle(4 * u, 0xffffff, 0.9);
    for (let x = x0 + 10; x < x1 - 10; x += 26 * u) guide.lineBetween(x, lineY, Math.min(x + 14 * u, x1 - 10), lineY);
    this.tweens.add({ targets: guide, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    const hint = this.add.text(cx, Math.min(H - 60 * u, cy + ph / 2 + 50 * u), '上の線を なぞって 開けよう', { fontFamily: UI_FONT, fontSize: `${Math.round(34 * u)}px`, fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 8 }).setOrigin(0.5).setDepth(6);
    const finger = this.add.text(x0, lineY + 34 * u, '👆', { fontSize: `${Math.round(56 * u)}px` }).setOrigin(0.5, 0).setDepth(6);
    this.tweens.add({ targets: finger, x: x1, duration: 1100, repeat: -1, ease: 'Sine.easeInOut', repeatDelay: 300 });

    let start: { x: number; y: number } | null = null;
    const cut = () => {
      if (this.phase !== 'cut') return;
      this.phase = 'cutting';
      this.input.off('pointerdown');
      this.input.off('pointermove');
      this.input.off('pointerup');
      this.tweens.killTweensOf([guide, finger]);
      guide.destroy();
      finger.destroy();
      hint.destroy();
      this.tweens.add({ targets: stack, alpha: 0, duration: 200, onComplete: () => stack.forEach((o) => o.destroy()) });
      this.cutAnimation(top, body, x0, x1, lineY);
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (start = { x: p.x, y: p.y }));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (start && p.isDown && Math.abs(p.x - start.x) > (x1 - x0) * 0.45) cut();
    });
    // なぞらずにタップしても開く
    this.input.on('pointerup', () => {
      if (start) cut();
      start = null;
    });
  }

  /** 光る線が左から右へ走り、上の切れはしが飛んでいく */
  private cutAnimation(top: Phaser.GameObjects.Image, body: Phaser.GameObjects.Image, x0: number, x1: number, y: number): void {
    const u = this.unit;
    audio.se('swing');
    const line = this.add.graphics().setDepth(7);
    const p = { t: 0 };
    this.tweens.add({
      targets: p,
      t: 1,
      duration: 260,
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        const x = x0 + (x1 - x0) * p.t;
        line.clear();
        line.lineStyle(10 * u, 0xfff2a8, 0.5).lineBetween(x0, y, x, y);
        line.lineStyle(4 * u, 0xffffff, 1).lineBetween(x0, y, x, y);
        line.fillStyle(0xffffff, 1).fillCircle(x, y, 9 * u);
      },
      onComplete: () => {
        audio.se('crack');
        this.cameras.main.shake(120, 0.004);
        this.tweens.add({ targets: line, alpha: 0, duration: 260, onComplete: () => line.destroy() });
        this.tweens.add({ targets: top, x: top.x + 220 * u, y: top.y - 260 * u, angle: 28, alpha: 0, duration: 520, ease: 'Cubic.easeOut' });
        // 本体を少し下へ。カードは本体の口(切った所)から出てきて、下の方はパックに入ったまま(企画者 2026-10-26)
        const cardH = MYTH_CARD_H * this.bigScale;
        const cardY = this.H * 0.16 + cardH / 2;
        this.cardY = cardY;
        this.mouthY = cardY + cardH * (0.5 - CARD_TUCK);
        this.tweens.add({
          targets: body,
          y: body.y + (this.mouthY - y),
          duration: 420,
          delay: 160,
          ease: 'Cubic.easeInOut',
          onComplete: () => {
            this.phase = 'reveal';
            this.input.on('pointerdown', () => this.skip());
            this.nextCard();
          },
        });
      },
    });
  }

  // ---------------- 1枚ずつ見せる ----------------

  /** 1枚ずつ見せるときのカードの大きさ: パックの幅より小さく(企画者 2026-10-26: パックよりカードが大きすぎた) */
  private get bigScale(): number {
    return (this.packW * CARD_OF_PACK) / MYTH_CARD_W;
  }

  private nextCard(): void {
    if (this.phase !== 'reveal') return;
    if (this.index >= this.d.cards.length) {
      this.showGrid();
      return;
    }
    const { W } = this;
    const id = this.d.cards[this.index];
    const c = card(id)!;
    const isNew = this.d.newIds.includes(id) && this.d.cards.indexOf(id) === this.index;
    const s = this.bigScale;
    // パックの口の下(本体のうしろ)から、ゆっくり上に出てくる → 下の方はパックに入ったまま、うら返る
    const img = this.add.image(W / 2, this.mouthY + (MYTH_CARD_H * s) / 2 + 10, BACK_KEY).setScale(s).setDepth(2);
    this.shown.push(img);
    this.tweens.add({
      targets: img,
      y: this.cardY,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: img,
          scaleX: 0,
          duration: 120,
          onComplete: () => {
            img.setTexture(cardKey(id));
            audio.se('plop');
            this.tweens.add({ targets: img, scaleX: s, duration: 140 });
            // うら返ったら、全部読めるところまで少し引き出す(下のはしはパックの口のまま)
            this.tweens.add({ targets: img, y: this.cardY - MYTH_CARD_H * s * (CARD_TUCK - 0.02), duration: 220, delay: 100, ease: 'Cubic.easeOut', onComplete: () => this.afterFlip(img, c.rarity, isNew) });
          },
        });
      },
    });
  }

  private afterFlip(img: Phaser.GameObjects.Image, rarity: Rarity, isNew: boolean): void {
    if (this.phase !== 'reveal') return;
    const u = this.unit;
    this.rarityEffect(img, rarity);
    if (isNew) this.shown.push(this.newBadge(img.x + img.displayWidth / 2 - 30 * u, img.y - img.displayHeight / 2 + 10 * u, u * 1.2));
    const counter = this.add.text(this.W / 2, img.y - img.displayHeight / 2 - 40 * u, `${this.index + 1} / ${this.d.cards.length}`, { fontFamily: UI_FONT, fontSize: `${Math.round(28 * u)}px`, fontStyle: '900', color: '#ffffff' }).setOrigin(0.5).setDepth(9);
    this.shown.push(counter);
    const last = this.index === this.d.cards.length - 1;
    const hold = { N: 750, R: 850, SR: 1100, UR: 1400, SEC: 2400, LR: 2400 }[rarity];
    if (last && this.d.cards.length === 1) {
      this.time.delayedCall(500, () => this.showGrid());
      return;
    }
    this.seqTimer = this.time.delayedCall(hold, () => {
      if (this.phase !== 'reveal') return;
      this.index++;
      if (last) {
        this.showGrid();
        return;
      }
      const old = [...this.shown];
      this.shown = [];
      this.tweens.add({ targets: old, x: `-=${this.W * 0.7}`, alpha: 0, duration: 260, ease: 'Cubic.easeIn', onComplete: () => old.forEach((o) => o.destroy()) });
      this.nextCard();
    });
  }

  /** レアごとの演出。SR以上は光る。SECは secEffect */
  private rarityEffect(img: Phaser.GameObjects.Image, rarity: Rarity): void {
    if (rarity === 'N' || rarity === 'R') return;
    const col = Phaser.Display.Color.HexStringToColor(RARITY_COLORS[rarity].light).color;
    const ring = this.add.circle(img.x, img.y, 40, col, 0.6).setDepth(1);
    this.shown.push(ring);
    this.tweens.add({ targets: ring, scale: 8, alpha: 0, duration: 700, ease: 'Cubic.easeOut' });
    audio.se('sting');
    if (rarity === 'SEC') this.secEffect(img);
  }

  /** 【仮】SECが出たときの特別な演出(あとで差しかえられるように、ここにまとめる) */
  private secEffect(img: Phaser.GameObjects.Image): void {
    audio.se('cheer');
    this.cameras.main.flash(500, 255, 240, 200);
    this.cameras.main.shake(400, 0.008);
    const u = this.unit;
    const t = this.add.text(this.W / 2, img.y - img.displayHeight * 0.2, 'SECRET!!', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: `${Math.round(64 * u)}px`, color: '#ffd23a', stroke: '#c0182a', strokeThickness: 12 }).setOrigin(0.5).setDepth(10).setScale(0.2);
    this.shown.push(t);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, angle: { from: -3, to: 3 }, duration: 90, yoyo: true, repeat: 5 });
  }

  private newBadge(x: number, y: number, k: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, 'NEW', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: `${Math.round(26 * k)}px`, color: '#16101c', backgroundColor: '#ffd23a', padding: { x: 8 * k, y: 2 * k } })
      .setOrigin(0.5)
      .setAngle(12)
      .setDepth(11);
  }

  // ---------------- まとめて並べる ----------------

  private skip(): void {
    if (this.phase !== 'reveal' || this.d.cards.length === 1) return;
    audio.se('tap');
    this.showGrid();
  }

  private showGrid(): void {
    if (this.phase === 'grid' || this.phase === 'leaving') return;
    this.phase = 'grid';
    this.seqTimer?.remove();
    this.input.off('pointerdown');
    this.tweens.killAll();
    this.shown.forEach((o) => o.destroy());
    this.shown = [];
    const { W, H } = this;
    const u = this.unit;
    this.body?.destroy();
    this.children.list.filter((o) => o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Text).forEach((o) => o.destroy());
    const n = this.d.cards.length;
    const titleH = 110 * u;
    const footH = 190 * u;
    const area = { x: 20 * u, y: titleH, w: W - 40 * u, h: H - titleH - footH };
    // いちばん大きく並べられる列の数を選ぶ
    let best = { cols: 1, s: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const s = Math.min((area.w / cols - 12 * u) / MYTH_CARD_W, (area.h / rows - 12 * u) / MYTH_CARD_H);
      if (s > best.s) best = { cols, s };
    }
    const s = Math.min(best.s, this.bigScale);
    const cols = best.cols;
    const rows = Math.ceil(n / cols);
    const cw = MYTH_CARD_W * s + 12 * u;
    const ch = MYTH_CARD_H * s + 12 * u;
    this.add.text(W / 2, titleH / 2 + 6 * u, n > 1 ? `${n}パックの結果` : 'カードを手に入れた！', { fontFamily: UI_FONT, fontSize: `${Math.round(40 * u)}px`, fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 8 }).setOrigin(0.5);
    const seen = new Set<number>();
    this.d.cards.forEach((id, i) => {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, n - r * cols);
      const x = W / 2 + (i % cols - (inRow - 1) / 2) * cw;
      const y = area.y + area.h / 2 + (r - (rows - 1) / 2) * ch;
      const img = this.add.image(x, y, cardKey(id)).setScale(s * 0.6).setAlpha(0);
      this.tweens.add({ targets: img, scale: s, alpha: 1, duration: 220, delay: i * 45, ease: 'Back.easeOut' });
      // さわると大きく見られる(企画者 2026-10-26)
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.phase === 'grid') showCardZoom(this, cardKey(id), [card(id)!.name, ...abilityLines(card(id)!)]);
      });
      if (this.d.newIds.includes(id) && !seen.has(id)) this.newBadge(x + (MYTH_CARD_W * s) / 2 - 18 * u, y - (MYTH_CARD_H * s) / 2 + 8 * u, Math.min(1.2 * u, Math.max(0.7, s * 2.2)));
      seen.add(id);
    });
    const col = loadLife().mythclash ?? newCollection();
    this.add.text(W / 2, H - footH + 40 * u, `所持種類数：${ownedKinds(col)}/${CARDS.length}`, { fontFamily: UI_FONT, fontSize: `${Math.round(28 * u)}px`, fontStyle: '900', color: '#ffd23a' }).setOrigin(0.5);
    const ok = this.add
      .text(W / 2, H - footH / 2 + 30 * u, '  OK  ', { fontFamily: UI_FONT, fontSize: `${Math.round(40 * u)}px`, fontStyle: '900', color: '#16101c', backgroundColor: '#ffd23a', padding: { x: 30 * u, y: 10 * u } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    ok.on('pointerdown', () => this.leave());
    audio.se('happy');
  }

  private leave(): void {
    if (this.phase === 'leaving') return;
    this.phase = 'leaving';
    audio.se('back');
    audio.playBgm(this.d.bgm);
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(this.d.back, this.d.backData ?? {}));
  }
}

/** 企画者の裏面の絵が読めなかったときだけ使う、プログラムで描いたカードのうら */
function drawBack(ctx: CanvasRenderingContext2D): void {
  const w = MYTH_CARD_W;
  const h = MYTH_CARD_H;
  roundRectPath(ctx, 0, 0, w, h, 20);
  ctx.fillStyle = '#c0182a';
  ctx.fill();
  roundRectPath(ctx, 12, 12, w - 24, h - 24, 14);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2a0a12');
  g.addColorStop(0.5, '#5a0f1c');
  g.addColorStop(1, '#2a0a12');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#ffd23a';
  ctx.lineWidth = 4;
  roundRectPath(ctx, 26, 26, w - 52, h - 52, 10);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd23a';
  ctx.font = `900 40px "Arial Black", Impact, sans-serif`;
  ctx.fillText('MYTH', w / 2, h / 2 - 24);
  ctx.fillText('CLASH', w / 2, h / 2 + 24);
}
