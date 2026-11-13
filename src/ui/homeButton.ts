import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { UI_FONT } from './paint';

/**
 * 1回で お世話画面に もどる ホームボタン(2026-11-13 企画者「戻る 戻るって 押すの 大変だから 1発で お世話画面に 戻る ホームボタンも 欲しい」)。
 * 企画者「1A・2A・3A」: メニュー画面だけ(遊んでいる 最中は 出さない)・仮の 見た目(家の マーク+ホーム)・右上。
 * 見た目は【仮】(あとで 絵に 差しかえ られる)
 */

/** ホームボタンを 出す 画面(メニュー画面だけ。バトル中・対局中・回転中は 出さない) */
export const HOME_BUTTON_SCENES: ReadonlySet<string> = new Set([
  'BattleMenu',
  'MinigameSelect',
  // ショップは お世話画面から すぐ なので「もどる」で ホーム(右上は コインが ある)
  'SlotTitle',
  'Slot',
  'CardTitle',
  'MahjongQuest',
  'MythTitle',
  'MythMode',
  'MythDeck',
  'MythGuide',
  'Binder',
]);

export const HOME_LABEL = '🏠 ホーム';

/** 今 開いている 画面を ぜんぶ 閉じて お世話画面へ */
export function goHome(scene: Phaser.Scene): void {
  audio.se('back');
  for (const s of scene.game.scene.getScenes(true)) if (s !== scene && s.scene.key !== 'Home') s.scene.stop();
  scene.scene.start('Home');
}

/** 画面の 中の「もどる」の 文字(高さ・大きさを そろえる) */
function findBack(list: readonly Phaser.GameObjects.GameObject[]): Phaser.GameObjects.Text | undefined {
  for (const o of list) {
    if (o instanceof Phaser.GameObjects.Text && o.visible && o.text.includes('もどる') && !o.parentContainer) return o;
    const kids = (o as Phaser.GameObjects.Container).list;
    if (Array.isArray(kids)) {
      const f = findBack(kids);
      if (f) return f;
    }
  }
  return undefined;
}

/** かさなっては いけない 物(画面に 出ている 小さめの 物。背景・大きな 板・もどるは のぞく) */
function blockers(scene: Phaser.Scene, self: Phaser.GameObjects.GameObject, back: Phaser.GameObjects.GameObject | undefined, viewW: number): Phaser.Geom.Rectangle[] {
  const out: Phaser.Geom.Rectangle[] = [];
  for (const o of scene.children.list) {
    if (o === self || o === back) continue;
    const g = o as unknown as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.GetBounds & { alpha?: number };
    if (typeof g.getBounds !== 'function' || !g.visible || g.alpha === 0) continue;
    const b = g.getBounds();
    if (b.width <= 2 || b.height <= 2 || b.width > viewW * 0.7) continue;
    out.push(b);
  }
  return out;
}

/**
 * 右上に ホームボタンを 出す(左上の「もどる」と 同じ 高さ・同じ 大きさ)。
 * busy: 遊んでいる 最中(スロットの 回転中 など)は かくす
 */
export function addHomeButton(scene: Phaser.Scene): Phaser.GameObjects.Text {
  const back = findBack(scene.children.list);
  const cam = scene.cameras.main;
  const size = back ? Number.parseInt(String(back.style.fontSize), 10) || 28 : 28;
  const y = back ? back.y + (0.5 - back.originY) * back.displayHeight : 74;
  const sf = back ? back.scrollFactorY : 1;
  const pad = back ? back.padding : { left: 18, right: 18, top: 10, bottom: 12 };
  const t = scene.add
    .text(0, y, HOME_LABEL, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { left: pad.left, right: pad.right, top: pad.top, bottom: pad.bottom } })
    .setOrigin(1, 0.5)
    .setScrollFactor(sf)
    .setDepth(Math.max(30, (back?.depth ?? 0) + 1));
  const right = () => (sf === 0 ? 0 : cam.scrollX) + cam.width / cam.zoom - 20;
  // 右上に ほかの 物(題・コイン・設定 など)が ある 時は、かさならない 所を さがす:
  // もどると 同じ 高さ → その 上 → その 下 → もどるの すぐ 右
  const others = blockers(scene, t, back, cam.width / cam.zoom);
  const h = t.displayHeight;
  const top = (sf === 0 ? 0 : cam.scrollY) + 8 + h / 2;
  const tries: [number, number][] = [[right(), y]];
  // 右はしで 上へ・下へ 少しずつ ずらして さがす
  for (let d = 6; d <= h * 3; d += 6) tries.push([right(), y - d], [right(), y + d]);
  if (back) tries.push([back.x + (1 - back.originX) * back.displayWidth + 16 + t.displayWidth, y]);
  let fx = 0;
  let pos = tries[0];
  for (const [x, yy] of tries) {
    if (yy < top) continue;
    const r = new Phaser.Geom.Rectangle(x - t.displayWidth - 4, yy - h / 2 - 4, t.displayWidth + 8, h + 8);
    if (!others.some((o) => Phaser.Geom.Intersects.RectangleToRectangle(r, o))) {
      pos = [x, yy];
      break;
    }
  }
  fx = pos[0] - right();
  t.setY(pos[1]);
  const place = () => t.setX(right() + fx);
  place();
  t.setInteractive({ useHandCursor: true });
  let gone = false;
  t.on('pointerdown', () => {
    if (gone) return;
    gone = true;
    goHome(scene);
  });
  // 遊んでいる 最中は かくす(スロットの 回転中・ボーナス中・フリーゲーム中)
  const busy = () => {
    const s = scene as unknown as { busy?: boolean; bonus?: unknown; free?: unknown; panel?: unknown };
    return !!(s.busy || s.bonus || s.free);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, () => {
    if (!t.active) return;
    place();
    t.setVisible(!busy());
  });
  return t;
}
