import * as Phaser from 'phaser';

/** ゲームを表示している所(ブラウザの画面)の 横÷縦 */
export function viewRatio(scene: Phaser.Scene): number {
  const p = scene.scale.parentSize;
  const w = p?.width || globalThis.innerWidth || 720;
  const h = p?.height || globalThis.innerHeight || 1280;
  return w / h;
}

/**
 * 画面いっぱいに出すための、ゲームの大きさ(企画者 2026-10-26: MYTHCLASH のタイトル・バトルを全画面に)。
 * base の片方の長さはそのままにして、もう片方を画面の形に合わせてのばす(黒い帯が出ない)。
 * min・max で、のばしすぎ・ちぢめすぎを止める(その外は、これまでどおり帯が出る)
 */
export function fillSize(scene: Phaser.Scene, base: { w: number; h: number }, limit: { minRatio: number; maxRatio: number }): { w: number; h: number } {
  const r = Math.min(limit.maxRatio, Math.max(limit.minRatio, viewRatio(scene)));
  return r > base.w / base.h ? { w: Math.round(base.h * r), h: base.h } : { w: base.w, h: Math.round(base.w / r) };
}

/**
 * 画面の形が変わったら(スマホを回したなど) onChange を呼ぶ。画面を閉じたら止める
 */
export function watchViewport(scene: Phaser.Scene, onChange: () => void): void {
  let last = viewRatio(scene);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const handler = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = viewRatio(scene);
      if (Math.abs(r - last) < 0.01) return;
      last = r;
      onChange();
    }, 200);
  };
  globalThis.addEventListener?.('resize', handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    clearTimeout(timer);
    globalThis.removeEventListener?.('resize', handler);
  });
}

/** ふつうの たての 画面の 大きさ */
export const PORTRAIT_SIZE = { w: 720, h: 1280 } as const;
/** 自分で 画面の 大きさを 決める 画面(MYTHCLASH・3D・冒険・ストーリーなど)は さわらない */
const OWN_SIZE = new Set(['Boot', 'Birth', 'Title', 'MinigameSelect', 'CardTitle', 'BattleMenu', 'Slugger', 'Mahjong', 'Battle3D', 'RumbleMode', 'RumbleStory', 'Adventure', 'AutoBattle', 'Battle', 'Compare', 'BunkParts', 'MythTitle', 'MythMode', 'MythDeck', 'MythTower', 'MythFloor', 'MythBattle', 'MythGuide', 'Binder']);

/**
 * 2026-11-08 企画者「下の 余白が 気になる・アプリゲームとして 出すから 全画面がいい」:
 * たての 画面(720×1280)を、スマホの 画面の 形まで 上下に のばす。中身は まん中のまま(カメラを ずらす)、
 * いちばん うしろの 背景(画面 いっぱいの 絵・四角・グラデーション)だけ のびた 所まで 広げる。
 */
export function fillTall(scene: Phaser.Scene): void {
  if (OWN_SIZE.has(scene.scene.key)) return;
  const { w, h } = PORTRAIT_SIZE;
  if (scene.scale.gameSize.width !== w || scene.scale.gameSize.height !== h) return;
  const tall = fillSize(scene, PORTRAIT_SIZE, { minRatio: 0.4, maxRatio: w / h }).h;
  if (tall <= h + 2) return;
  // 2026-11-08 企画者(スクショ)「上が おかしい」: 上下に 半分ずつ のばすと 上に すじの 帯が 出る →
  // 画面の 上に そろえて、のびた ぶんは 下だけ(お世話画面は 上下に 分けて 自分で 合わせる)
  const centered = scene.scene.key === 'Home';
  const ex = centered ? (tall - h) / 2 : 0;
  scene.scale.setGameSize(w, tall);
  const cam = scene.cameras.main;
  cam.setSize(w, tall);
  cam.setScroll(0, -ex);
  // 背景を 広げる(画面 いっぱいを おおっている 物だけ)。とちゅうで 物が 増えるので 写しを 回す
  for (const o of [...scene.children.list]) {
    const g = o as Phaser.GameObjects.Image & Phaser.GameObjects.Components.GetBounds;
    if (typeof g.getBounds !== 'function' || (g as unknown as { scrollFactorY?: number }).scrollFactorY === 0) continue;
    const b = g.getBounds();
    if (b.left > 1 || b.top > 1 || b.right < w - 1 || b.bottom < h - 1) continue;
    // 上下に のばして、ちょうど 画面の 上から 下まで(絵は 横も 同じ 倍で 大きく = 形を くずさない)
    const k = (tall + 2) / Math.max(1, b.height);
    if (k <= 1) continue;
    const cx = (b.left + b.right) / 2;
    void cx;
    if (o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Sprite) {
      // 2026-11-08 企画者「MONZ SLUGGER が ずれちゃってる」: 絵を 大きく すると 絵の 上に 重ねた ボタン・看板と ずれる。
      // → 絵は そのまま、上と 下に 絵の はしを 鏡に うつして つなげる(のびた 所だけ)
      extendImage(scene, o, b, -ex, tall - ex);
    } else {
      // 四角・絵を かいた もの: たてだけ のばす
      const t = o as unknown as Phaser.GameObjects.Components.Transform;
      t.scaleY *= k;
      const nb = g.getBounds();
      t.y += -ex - nb.top;
    }
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.setGameSize(w, h));
}

/** 絵の 上下に、絵の はしを 鏡に うつした 帯を 足す(top〜bottom: 画面の 上下の はし。ゲームの 座標) */
function extendImage(scene: Phaser.Scene, img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, b: Phaser.Geom.Rectangle, top: number, bottom: number): void {
  const fr = img.frame;
  const src = fr.source.image as CanvasImageSource;
  const band = (gap: number, atTop: boolean) => {
    if (gap <= 1) return;
    // 絵の いちばん はしの 数行を のばして つなげる(鏡に すると 戻るなどが さかさに 2つ 見えたため)
    const hs = 4;
    const key = `ext:${img.texture.key}:${fr.name}:${atTop ? 't' : 'b'}`;
    if (!scene.textures.exists(key)) {
      const c = scene.textures.createCanvas(key, fr.cutWidth, hs);
      const ctx = c?.getContext();
      if (!c || !ctx) return;
      ctx.drawImage(src, fr.cutX, atTop ? fr.cutY : fr.cutY + fr.cutHeight - hs, fr.cutWidth, hs, 0, 0, fr.cutWidth, hs);
      c.refresh();
    }
    const e = scene.add.image(b.left, atTop ? b.top : b.bottom, key).setOrigin(0, atTop ? 1 : 0).setDisplaySize(b.width, gap + 2).setDepth(img.depth).setTint(0x8a8a98);
    scene.children.moveBelow(e as unknown as Phaser.GameObjects.GameObject, img as unknown as Phaser.GameObjects.GameObject);
    // 絵から はなれるほど 暗く(すじが 目立たない ように)
    const y0 = atTop ? b.top - gap - 2 : b.bottom;
    const fade = scene.add.graphics().setDepth(img.depth);
    const dark = 0x1b1024;
    if (atTop) fade.fillGradientStyle(dark, dark, dark, dark, 1, 1, 0.2, 0.2);
    else fade.fillGradientStyle(dark, dark, dark, dark, 0.2, 0.2, 1, 1);
    fade.fillRect(b.left, y0, b.width, gap + 2);
    scene.children.moveAbove(fade as unknown as Phaser.GameObjects.GameObject, e as unknown as Phaser.GameObjects.GameObject);
  };
  band(b.top - top, true);
  band(bottom - b.bottom, false);
}

/* 2026-11-08: 上の はしの 表示を 1つずつ 下げる 作り(keepBelowNotch)は やめた。ゲームの 画面を 時計・電池の 下から はじめる(index.html) */

/** iPhone の 上の 切りかき・下の バー の ぶん(ゲームの 長さ)。全画面の 時に 表示を そこへ かからないように */
export function safeInsets(scene: Phaser.Scene): { top: number; bottom: number } {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
  document.body.appendChild(d);
  const cs = getComputedStyle(d);
  const t = parseFloat(cs.paddingTop) || 0;
  const b = parseFloat(cs.paddingBottom) || 0;
  d.remove();
  const k = scene.scale.gameSize.width / Math.max(1, scene.scale.parentSize.width || globalThis.innerWidth || 720);
  // ゲームの 画面は 時計・電池の 下から はじまる(index.html)ので、上は もう よけなくて いい
  void t;
  return { top: 0, bottom: b * k };
}
