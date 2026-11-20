import * as Phaser from 'phaser';
import { audio } from './audio/engine';
import './debug';
import { AutoBattleScene } from './scenes/AutoBattleScene';
import { BattleScene } from './scenes/BattleScene';
import { Battle3DScene } from './scenes/Battle3DScene';
import { RumbleModeScene, RumbleStoryScene } from './scenes/RumbleScenes';
import { BootScene } from './scenes/BootScene';
import { BunkPartsScene } from './scenes/BunkPartsScene';
import { CompareScene } from './scenes/CompareScene';
import { BirthScene } from './scenes/BirthScene';
import { HomeScene } from './scenes/HomeScene';
import { MinigameSelectScene } from './scenes/MinigameSelectScene';
import { CardTitleScene } from './scenes/CardTitleScene';
import { MythTitleScene } from './scenes/MythTitleScene';
import { BattleMenuScene } from './scenes/BattleMenuScene';
import { MythPackScene } from './scenes/MythPackScene';
import { BinderScene } from './scenes/BinderScene';
import { MythBattleScene } from './scenes/MythBattleScene';
import { MythGuideScene } from './scenes/MythGuideScene';
import { MythDeckScene } from './scenes/MythDeckScene';
import { MythModeScene } from './scenes/MythModeScene';
import { MythTowerScene } from './scenes/MythTowerScene';
import { MythFloorScene } from './scenes/MythFloorScene';
import { CardPlayScene } from './scenes/CardPlayScene';
import { DashScene } from './scenes/DashScene';
import { SluggerScene } from './scenes/SluggerScene';
import { QuestionScene } from './scenes/QuestionScene';
import { RoomSelectScene } from './scenes/RoomSelectScene';
import { ShopScene } from './scenes/ShopScene';
import { AdventureScene } from './scenes/AdventureScene';
import { SplashScene } from './scenes/SplashScene';
import { TitleScene } from './scenes/TitleScene';
import { MahjongScene } from './scenes/MahjongScene';
import { MahjongQuestScene } from './scenes/MahjongQuestScene';
import { SlotScene } from './scenes/SlotScene';
import { SlotTitleScene } from './scenes/SlotTitleScene';
import { applyCoinGifts } from './core/coinGift';
import { settlePendingOnBoot } from './core/cardPending';
import { fillTall, watchViewport } from './ui/viewport';
import { installTextureBudget, trimTextures } from './render/texBudget';
import { addHomeButton, HOME_BUTTON_SCENES } from './ui/homeButton';

// 2026-11-09 企画者「公開してる ゲーム 友達たち やってるんだけど 100,000 コイン 追加できる？」→ 遊んでいる 人に 1回だけ
applyCoinGifts();
// MONZ CARD の 途中で 閉じた プレイの 役(2026-11-19 企画者「途中で 閉じても 揃えた やつは あげて」)
settlePendingOnBoot();

const game = new Phaser.Game({
  // ?canvas を付けるとCanvas描画で動かす(表示がおかしいときの確認用)
  type: new URLSearchParams(location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1024',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  // 1回の描画で使うテクスチャを1枚に限定する。複数枚にすると一部の環境でパーツが欠けて描かれたため。
  render: { antialias: true, maxTextures: 1 },
  // 指 2本ぶん(1本が 消えた ボタンで 残っても 押せる ように。2026-11-17)
  // 2026-11-17(2回目): ゲームの 外(MONZ RUMBLE の ボタンなど)を さわった 指は ゲームで 数えない
  // (外の ボタンは すぐ 消えたり、iPhone が 指を はなした ことを とどけない ことが あり、指が 残って 押せなく なる)
  input: { activePointers: 2, windowEvents: false },
  scene: [BootScene, SplashScene, TitleScene, QuestionScene, BirthScene, RoomSelectScene, HomeScene, ShopScene, MinigameSelectScene, CardTitleScene, CardPlayScene, DashScene, SluggerScene, MahjongQuestScene, MahjongScene, SlotTitleScene, SlotScene, BattleMenuScene, AutoBattleScene, Battle3DScene, RumbleModeScene, RumbleStoryScene, AdventureScene, BattleScene, MythTitleScene, MythPackScene, BinderScene, MythBattleScene, MythDeckScene, MythModeScene, MythTowerScene, MythFloorScene, MythGuideScene, CompareScene, BunkPartsScene],
});

// 2026-11-08: ホーム画面から 開いた 時の 大きさ合わせ(fitStandalone)は やめた。画面の 外に はみ出して 下の ボタンが 切れたため。かわりに 時計・電池の 帯を 黒に(index.html)

// 2026-11-08 企画者「全画面がいい」: たての 画面を スマホの 形まで のばす(背景を 広げる)
/** 向きが 変わったら 作り直す 画面(作り直しても 遊んでいる 中身が 消えない メニュー・お世話画面) */
/** 3D を 使う 画面 */
const HEAVY_3D = new Set(['Battle3D', 'Battle3DFight', 'Adventure']);
const RELAYOUT_ON_ROTATE = new Set(['Title', 'Home', 'BattleMenu', 'MinigameSelect', 'CardTitle', 'RoomSelect', 'Shop', 'MythMode']);

game.events.once(Phaser.Core.Events.READY, () => {
  // 2026-11-09 企画者「長く 遊ぶと 重くなる のを 解決したい」: 画面が 変わったら 長く 使っていない 絵を メモリから 外す
  installTextureBudget(game);
  let trimT: ReturnType<typeof setTimeout> | undefined;
  for (const s of game.scene.scenes) {
    s.events.on(Phaser.Scenes.Events.CREATE, () => {
      clearTimeout(trimT);
      // 3D の 画面(MONZ RUMBLE・冒険)は 3D に メモリを 使うので、ゲームの 絵は すぐ 少なめに(2026-11-20 iPhone で 読み直される 対策)
      if (HEAVY_3D.has(s.scene.key)) trimTextures(game, 60 * 1024 * 1024);
      else trimT = setTimeout(() => trimTextures(game), 1000);
      fillTall(s);
      // 2026-11-13 企画者「1発で お世話画面に 戻る ホームボタン」(メニュー画面だけ・右上)
      // 確認用ページ(スロットだけ などの 一部だけ 入った ページ)には お世話画面が ないので 出さない
      if (HOME_BUTTON_SCENES.has(s.scene.key) && !(window as { __MONZ_START?: string }).__MONZ_START) addHomeButton(s);
      // 2026-11-08 企画者「バトルセレクトで 横画面に してから 縦に したら 左上の 戻る 押せない」:
      // 画面の 大きさは 開いた 時の 向きで 決めるので、向きが 変わったら 作り直す(たての メニュー画面だけ)
      if (RELAYOUT_ON_ROTATE.has(s.scene.key))
        watchViewport(s, () => {
          if (!s.scene.isActive() || s.cameras.main.fadeEffect.isRunning) return;
          s.scene.restart();
        });
    });
  }
});

// 2026-11-08: iPhone が 古い 版を 覚えたまま 開くと、新しい 絵と 合わずに ずれた → 公開ページでは 新しい 版が あれば 読みこみ直す
if (!import.meta.env.DEV && location.protocol.startsWith('http')) {
  const mine = [...document.scripts].map((x) => x.src).find((u) => /assets\/index-[^/]+\.js/.test(u));
  fetch(`./?v=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.text())
    .then((html) => {
      const m = html.match(/assets\/index-[^"']+\.js/);
      if (mine && m && !mine.endsWith(m[0]) && sessionStorage.getItem('monz:reloaded') !== m[0]) {
        sessionStorage.setItem('monz:reloaded', m[0]);
        location.reload();
      }
    })
    .catch(() => {});
}

// 2026-11-08 企画者(スクショ)「公開テストで 画面が アップに なっちゃう」:
// iPhone は 2本の 指(スティック＋ボタン)や すばやい 2回 タップを「拡大」と みなす → 拡大を 止める
const stopZoom = (e: Event) => e.preventDefault();
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stopZoom, { passive: false });
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 || ((e as TouchEvent & { scale?: number }).scale ?? 1) !== 1) e.preventDefault();
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  const el = e.target as HTMLElement | null;
  // ボタン・入力欄は そのまま(2回目の タップが 消えない ように)
  if (now - lastTouchEnd < 350 && !el?.closest('button, input, textarea, select, a')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// もう 拡大されて しまった 時(前の 版で 拡大した・向きを 変えた など)は もとの 大きさに 戻す
const vv = (globalThis as { visualViewport?: VisualViewport }).visualViewport;
// 2026-11-09 企画者「横画面から 縦に すると サイズが 少し アップした 状態」→ 向きを 変えた 時は 拡大して いなくても 必ず 大きさを 決め直す
const resetZoom = (force = false) => {
  if (!force && (!vv || vv.scale <= 1.01)) {
    if (globalThis.scrollX || globalThis.scrollY) globalThis.scrollTo(0, 0);
    return;
  }
  const meta = document.querySelector('meta[name=viewport]');
  if (meta) {
    const c = meta.getAttribute('content') ?? '';
    meta.setAttribute('content', c.replace('maximum-scale=1', 'maximum-scale=1.0001'));
    setTimeout(() => meta.setAttribute('content', c), 50);
  }
  globalThis.scrollTo(0, 0);
};
vv?.addEventListener('resize', () => resetZoom());
globalThis.addEventListener('orientationchange', () => {
  setTimeout(() => resetZoom(true), 300);
  setTimeout(() => resetZoom(), 900);
  // 2026-11-11 企画者「モンズランブルの あと 縦に すると 左上の 戻る 押せない」:
  // 向きを 変えた あと、さわる 場所の 計算に 使う 画面の 位置を 読みなおす(古い 位置の ままだと ボタンが ずれる)
  for (const ms of [400, 1000, 1800]) setTimeout(() => game.scale.refresh(), ms);
});
vv?.addEventListener('scroll', () => game.scale.refresh());
// 2026-11-13 企画者「モンズランブル → タイトル → 戻る → 縦の バトル画面で 戻れない」(2回目):
// iPhone は 向きを 変えた あと、時計・電池の 帯の ぶん ゲームの 位置が おくれて 変わる ことが あり、
// 古い 位置の ままだと さわった 所が ずれて 小さい ボタン(左上の もどる)に とどかない。
// → さわった 瞬間に 毎回 ゲームの 位置を 読みなおしてから ゲームに わたす(ゲームより 先に 動く よう capture)
for (const ev of ['touchstart', 'pointerdown', 'mousedown'] as const) globalThis.addEventListener(ev, () => game.scale.updateBounds(), { capture: true, passive: true });

// 2026-11-17 企画者「モンズランブル → ストーリーで バトル → タイトルへ → 戻る → バトル画面で 何も 押せない」(3回目):
// MONZ RUMBLE の ボタン(ゲームの 外の ボタン)を 押すと、指を はなす 前に その ボタンが 消える ことが ある。
// 消えた ボタンの「指を はなした」は ゲームに とどかず、ゲームは まだ 指が さわって いると 思いこむ →
// さわれる 指の 数が うまって、そのあと 何を 押しても 反応 しない。
// → 新しく さわった 瞬間に、もう 画面に ない 指を ゲームから 外す(ゲームより 先に 動く よう capture)
const releaseTouches = (live: Set<number>) => {
  for (const p of game.input?.pointers ?? []) {
    if (!p || p.id === 0 || !p.active || live.has(p.identifier)) continue;
    p.active = false;
    p.isDown = false;
    p.primaryDown = false;
    p.buttons = 0;
  }
};
// 画面が かわった 時も、のこって いる 指を 外す(2026-11-17 企画者「バトル → 戻る → ホーム → お世話画面 押せない」)
game.events.once(Phaser.Core.Events.READY, () => {
  for (const s of game.scene.scenes) s.events.on(Phaser.Scenes.Events.CREATE, () => releaseTouches(new Set()));
});
globalThis.addEventListener(
  'touchstart',
  (e) => {
    releaseTouches(new Set(Array.from((e as TouchEvent).touches, (t) => t.identifier)));
  },
  { capture: true, passive: true },
);
setTimeout(() => resetZoom(), 500);

// 2026-11-17 企画者「モンズランブルの あと バトル画面で 戻るも MYTHCLASH も 押せない」:
// iPhone は 3D(MONZ RUMBLE)の あと、ゲームの 画面の 描く 場所(WebGL)を 止める ことが ある → 画面が 止まって 何も 動かない ように 見える。
// 止まって 2.5秒 もどらなければ 読みなおす(保存データは そのまま)
let glLostTimer: ReturnType<typeof setTimeout> | undefined;
game.events.once(Phaser.Core.Events.READY, () => {
  game.canvas?.addEventListener('webglcontextlost', () => {
    clearTimeout(glLostTimer);
    glLostTimer = setTimeout(() => location.reload(), 2500);
  });
  game.canvas?.addEventListener('webglcontextrestored', () => clearTimeout(glLostTimer));
});

// 開発中だけ、確認用にゲームを外から触れるようにする
// 2026-11-08 企画者「やってる人のデータを消さないで」: iPhone などに「この ゲームの 保存データは 自動で 消さないで」と お願いする
// (ことわられても ゲームは そのまま 動く)
try {
  void navigator.storage?.persist?.().catch(() => undefined);
} catch {
  /* できない 環境でも 続ける */
}

if (import.meta.env.DEV) Object.assign(window, { __monzGame: game, __monzAudio: audio });
