import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { cardZoomTexture } from './mythCardArt';
import { UI_FONT } from './paint';

/** 大きく見ているときに、左右になぞって となりのカードへ(バインダー。企画者 2026-10-31) */
export interface CardZoomNav {
  /** 何枚あるか・今何枚目か */
  count: number;
  index: number;
  /** i 枚目の絵と文を用意して ready を呼ぶ(絵の読みこみを待てるように) */
  make: (i: number, ready: (texture: string, lines: string[]) => void) => void;
  /** 閉じたときに、最後に見ていたのが何枚目か */
  onClose?: (index: number) => void;
}

/**
 * MYTHCLASH のカードを大きく見る。パックの結果・バトル画面などで使う(企画者 2026-10-26)。
 * texture: カードの絵(相手のカードは、魔法をかくした絵を渡す)。lines: カードの下に出す文(HP・状態など)
 * 企画者 2026-10-31: カード以外の所をさわると閉じる(カードをさわっても閉じない)。nav があれば、左右になぞると となりのカード
 */
export function showCardZoom(scene: Phaser.Scene, texture: string, lines: string[] = [], onClose?: () => void, nav?: CardZoomNav): void {
  const { width: W, height: H } = scene.scale;
  audio.se('tap');
  const box = scene.add.container(0, 0).setDepth(500);
  const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0, 0).setInteractive();
  box.add(dim);
  let content: Phaser.GameObjects.Container | null = null;
  let cardRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);
  let index = nav?.index ?? 0;
  let busy = true;
  let closed = false;

  /** カードと文を並べる(dir: となりへ動いた向き。0 なら はじめて開いた) */
  const show = (tex: string, ls: string[], dir: number) => {
    const old = content;
    const c = scene.add.container(0, 0);
    box.add(c);
    // 下に出す文(長い文は折り返す)。先に作って高さをはかる
    const size = Math.round(28 * Math.max(1, H / 1280));
    const texts = ls.map((l, i) =>
      scene.add
        .text(W / 2, 0, l, { fontFamily: UI_FONT, fontSize: `${i === 0 ? size + 2 : size}px`, fontStyle: '900', color: l.startsWith('特性') ? '#ffd23a' : '#ffffff', align: 'center', wordWrap: { width: W * 0.88, useAdvancedWrap: true } })
        .setOrigin(0.5, 0),
    );
    // 左右になぞれるときは、文の行数でカードの大きさ・位置が変わらないように、いつも同じ高さをあけておく(企画者 2026-10-31「スライドするとカードの高さが違う」)
    const lineH = Math.round(size * 1.3) + 8;
    const textH = Math.max(texts.reduce((a, t) => a + t.height + 8, 0), nav && nav.count > 1 ? lineH * 5 : 0) + 50;
    // 企画者のカードの絵があれば、くっきりした大きい絵で見せる(2026-10-27)
    const key = cardZoomTexture(scene, tex);
    const frame = scene.textures.getFrame(key);
    const cw = frame.width;
    const ch = frame.height;
    const s = Math.min((W * 0.86) / cw, (H - textH - 40) / ch);
    const cy = (H - textH) / 2 + 10;
    const img = scene.add.image(W / 2, cy, key).setScale(dir ? s : s * 0.6);
    c.add(img);
    cardRect = new Phaser.Geom.Rectangle(W / 2 - (cw * s) / 2, cy - (ch * s) / 2, cw * s, ch * s);
    let y = cy + (ch * s) / 2 + 30;
    for (const t of texts) {
      t.setY(y);
      y += t.height + 8;
      c.add(t);
    }
    // 何枚目か(左右になぞれるとき)
    if (nav && nav.count > 1) c.add(scene.add.text(W / 2, cardRect.y - 14, `◀ ${index + 1} / ${nav.count} ▶`, { fontFamily: UI_FONT, fontSize: `${Math.round(size * 0.8)}px`, fontStyle: '900', color: '#d8c8e8' }).setOrigin(0.5, 1));
    content = c;
    if (dir) {
      c.x = dir * W;
      scene.tweens.add({ targets: c, x: 0, duration: 200, ease: 'Cubic.easeOut' });
      if (old) scene.tweens.add({ targets: old, x: -dir * W, duration: 200, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
    } else scene.tweens.add({ targets: img, scale: s, duration: 200, ease: 'Back.easeOut' });
    scene.time.delayedCall(200, () => (busy = false));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    audio.se('back');
    box.destroy();
    nav?.onClose?.(index);
    onClose?.();
  };

  const go = (d: number) => {
    if (!nav || nav.count < 2) return;
    busy = true;
    index = (index + d + nav.count) % nav.count;
    audio.se('tap');
    nav.make(index, (tex, ls) => !closed && show(tex, ls, d));
  };

  show(texture, lines, 0);
  // さわって はなしたとき: 横に大きくなぞったら となりのカード、そうでなくカードの外なら閉じる
  let down: { x: number; y: number } | null = null;
  dim.on('pointerdown', (p: Phaser.Input.Pointer) => (down = { x: p.x, y: p.y }));
  dim.on('pointerup', (p: Phaser.Input.Pointer) => {
    const d = down;
    down = null;
    if (!d || busy || closed) return;
    const dx = p.x - d.x;
    if (nav && nav.count > 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(p.y - d.y)) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 20 && Math.abs(p.y - d.y) < 20 && !cardRect.contains(p.x, p.y)) close();
  });
}
