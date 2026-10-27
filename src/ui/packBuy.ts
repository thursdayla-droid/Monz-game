import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import type { BgmName } from '../audio/bgmFiles';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { PACK_COUNTS, PACK_PRICE } from '../core/mythclash/packs';
import { mulberry32, newSeed } from '../core/rng';
import { UI_FONT } from './paint';

export const MYTH_PACK_IMAGE = 'myth:pack';
export const MYTH_PACK_FILE = 'assets/mythclash/pack.webp';
/** カードの裏面(企画者の絵 2026-10-27。design/mythclash/make_card_back.py で切り抜く) */
export const MYTH_CARD_BACK = 'myth:cardBack';
export const MYTH_CARD_BACK_FILE = 'assets/mythclash/card_back.webp';

const INK = '#16101c';

/** パックを開ける画面に渡すもの */
export interface PackOpenData {
  cards: number[];
  newIds: number[];
  /** 開け終わったらもどる画面 */
  back: string;
  backData?: object;
  /** もどる画面の曲(ショップは曲を変えないので、ここで戻す) */
  bgm: BgmName;
  /** 画面の大きさ(開いた画面と同じ向きにする) */
  size?: { w: number; h: number };
}

/**
 * カードパックを買う箱(お世話画面のショップと、MYTHCLASH のタイトル画面の両方で使う。企画者決定 2026-10-26)。
 * 1パック(500)か10パック(5,000)を選ぶ。買ったら、すぐにパックを開ける画面へ。
 * 箱を出すたびに買う番号を作り、同じ番号では2回買えない(二重の購入を防ぐ)。保存できなかったら買わない。
 */
export function openPackBuy(scene: Phaser.Scene, opts: { back: string; backData?: object; bgm: BgmName; record?: LifeRecord; onClose?: () => void }): void {
  const record = opts.record ?? new LifeRecord(loadLife());
  const purchaseId = `pack:${Date.now()}:${newSeed()}`;
  const { width: W, height: H } = scene.scale;
  const k = Math.min(W / 720, H / 1000);
  const box = scene.add.container(W / 2, H / 2).setDepth(1000);
  const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.7).setInteractive();
  const inner = scene.add.container(0, 0).setScale(k);
  box.add([dim, inner]);
  const pw = 620;
  const ph = 900;
  const g = scene.add.graphics();
  g.fillStyle(0x1c1320, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 26);
  g.lineStyle(6, 0xc0182a, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 26);
  inner.add(g);
  const t = (x: number, y: number, s: string, size: number, color = '#ffffff') =>
    scene.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(0.5);
  inner.add(t(0, -ph / 2 + 50, 'カードパック', 40));
  if (scene.textures.exists(MYTH_PACK_IMAGE)) {
    const img = scene.add.image(0, -100, MYTH_PACK_IMAGE);
    img.setScale(420 / img.height);
    inner.add(img);
    scene.tweens.add({ targets: img, y: -112, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  inner.add(t(0, 148, 'MYTHCLASH のカードが 1枚入っている', 24, '#ffd23a'));
  const coinText = t(0, 190, `持っているコイン：${record.coins.toLocaleString()}`, 24, '#d8c8e8');
  inner.add(coinText);
  const msg = t(0, 228, '', 24, '#ff8a8a');
  inner.add(msg);

  let busy = false;
  const close = () => {
    box.destroy();
    opts.onClose?.();
  };
  PACK_COUNTS.forEach((n, i) => {
    const cost = PACK_PRICE * n;
    const ok = record.coins >= cost;
    const b = t((i - 0.5) * 290, 310, `${n}パック\n${cost.toLocaleString()} コイン`, 30, ok ? INK : '#ffffff')
      .setBackgroundColor(ok ? '#ffd23a' : '#6a6070')
      .setPadding(26, 12, 26, 14)
      .setLineSpacing(4);
    if (ok)
      b.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (busy) return;
        busy = true;
        const got = record.buyPacks(n, purchaseId, mulberry32(newSeed()));
        if (!got) {
          audio.se('tap', { pitch: 0.8 });
          msg.setText(record.coins < cost ? 'コインが たりません' : '保存できなかったので、買いませんでした');
          busy = false;
          return;
        }
        audio.se('select');
        const data: PackOpenData = { cards: got.cards, newIds: got.newIds, back: opts.back, backData: opts.backData, bgm: opts.bgm, size: { w: W, h: H } };
        scene.cameras.main.fadeOut(220, 0, 0, 0);
        scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start('MythPack', data));
      });
    inner.add(b);
  });
  if (PACK_COUNTS.every((n) => record.coins < PACK_PRICE * n)) msg.setText('コインが たりません');
  const cancel = t(0, 400, ' やめる ', 30).setBackgroundColor('#8a35e0').setPadding(26, 10, 26, 12).setInteractive({ useHandCursor: true });
  cancel.on('pointerdown', () => {
    if (busy) return;
    audio.se('back');
    close();
  });
  inner.add(cancel);
  box.setAlpha(0);
  scene.tweens.add({ targets: box, alpha: 1, duration: 140 });
  audio.se('tap');
}
