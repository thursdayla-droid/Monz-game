import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { CPU_LABELS, CPU_LEVELS, type CpuLevel } from '../core/mythclash/cpu';
import { BATTLE_MODE, BATTLE_UNLOCK_FROM, battleLevelOpen, type MythMatch } from '../core/mythclash/modes';
import { battleUnlocked, kindsToUnlock, newCollection } from '../core/mythclash/packs';
import { preloadPacks } from '../render/packs';
import { UI_FONT } from '../ui/paint';
import { fillSize, safeInsets } from '../ui/viewport';
import { MYTH_TITLE_IMAGE } from './MythTitleScene';

const W = 720;
const PORTRAIT = { w: 720, h: 1280 };
export type MythModeView = 'mode' | 'cpu';

/** 企画者のモード選択の絵(2026-11-01。design/mythclash/mode_select.png・941x1672)。文字・看板は絵に入っている */
export const MYTH_MODE_IMAGE = 'myth:mode';
export const MYTH_MODE_FILE = 'assets/mythclash/mode.webp';
const MODE_ART = { w: 941, h: 1672 };
/** 押せる看板(絵の座標 [x0, y0, x1, y1]) */
/** 企画者の強さえらびの絵(2026-11-01。design/mythclash/cpu_select.png・941x1672) */
export const MYTH_CPU_IMAGE = 'myth:cpu';
export const MYTH_CPU_FILE = 'assets/mythclash/cpu.webp';
const CPU_ZONES: Record<CpuLevel, readonly [number, number, number, number]> = {
  weak: [35, 440, 910, 702],
  normal: [35, 735, 910, 1002],
  strong: [30, 1040, 915, 1342],
};
const MODE_ZONES = {
  tower: [30, 398, 915, 800],
  battle: [25, 828, 915, 1248],
} as const;


const CPU_STARS: Record<CpuLevel, string> = { weak: '★', normal: '★★', strong: '★★★' };
const CPU_COLORS: Record<CpuLevel, string> = { weak: '#3aa860', normal: '#2a6ad8', strong: '#c0182a' };

/**
 * MYTHCLASH のモードえらび(企画者決定 2026-10-27)。タイトルの「バトルを始める」から開く。
 * - mode: ストーリーモード / バトルモード
 * - ストーリーモードの階えらびは MythTowerScene(企画者の絵)
 * - cpu: バトルモードの CPU の強さ(弱い・普通・強い)
 * えらんだら デッキ編成 → バトル。カードが3種類ないときは「あと○種類」だけ(はじめのカードのプレゼントはしない。企画者)
 * モードえらびの画面は企画者の絵(2026-11-01。絵が読めないときは前のプログラムで描いた板)。CPU の強さの画面も企画者の絵(2026-11-01)
 */
export class MythModeScene extends Phaser.Scene {
  private view: MythModeView = 'mode';
  private H = 1280;
  private layer?: Phaser.GameObjects.Container;
  private leaving = false;

  constructor() {
    super('MythMode');
  }

  init(data: { view?: MythModeView }): void {
    this.view = data?.view ?? 'mode';
    this.leaving = false;
    this.H = fillSize(this, PORTRAIT, { minRatio: 0.42, maxRatio: PORTRAIT.w / PORTRAIT.h }).h;
    this.scale.setGameSize(W, this.H);
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    const H = this.H;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a0a12, 0x2a0a12, 0x0a0408, 0x0a0408, 1).fillRect(0, 0, W, H);
    // タイトルの絵のお城(上の所だけ。タイトルのボタンは出さない)をうすく【仮】
    if (this.textures.exists(MYTH_TITLE_IMAGE)) {
      const img = this.add.image(W / 2, 0, MYTH_TITLE_IMAGE).setOrigin(0.5, 0).setAlpha(0.35);
      img.setCrop(0, 0, img.width, 560).setScale(W / img.width);
      const fadeY = 560 * (W / img.width);
      this.add.graphics().fillGradientStyle(0x0a0408, 0x0a0408, 0x0a0408, 0x0a0408, 0, 0, 1, 1).fillRect(0, fadeY * 0.4, W, fadeY * 0.6 + 2);
    }
    this.add.rectangle(0, 0, W, H, 0x0a0408, 0.35).setOrigin(0, 0);
    this.draw();
    this.cameras.main.fadeIn(220, 0, 0, 0);
    audio.playBgm('mythclash');
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(0.5);
  }

  private draw(): void {
    this.layer?.destroy();
    const L = this.add.container(0, 0);
    this.layer = L;
    // 2026-11-08 企画者「左上の 戻る 押せない・二重・もう少し 下に」→ 下げて 大きく・はなした 時に 動く(押した 時だと 次の 画面の 戻るまで 反応していた)
    const back = this.add.text(24, safeInsets(this).top + 80, '◀ もどる', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 22, y: 14 } }).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => {
      if (this.view === 'mode') this.go('MythTitle');
      else this.switchView('mode');
    });
    const title = this.view === 'cpu' ? 'バトルモード' : 'モードをえらぶ';
    const art = this.textures.exists(this.view === 'mode' ? MYTH_MODE_IMAGE : MYTH_CPU_IMAGE);
    // 企画者の絵には「MODE SELECT」「BATTLE MODE」の文字があるので、見出しは出さない
    L.add(art ? [back] : [back, this.text(W / 2 + 60, 46, title, 40, '#ffd23a').setStroke('#16101c', 8)]);
    if (this.view === 'cpu') {
      if (art) this.drawCpuArt(L);
      else this.drawCpu(L);
    }
    else if (art) this.drawModesArt(L);
    else this.drawModes(L);
  }

  private switchView(v: MythModeView): void {
    audio.se(v === 'mode' ? 'back' : 'tap');
    this.view = v;
    this.draw();
  }

  /** 大きなボタン(板) */
  private panel(L: Phaser.GameObjects.Container, y: number, h: number, color: string, main: string, sub: string, onTap: (() => void) | null): void {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    const col = Phaser.Display.Color.HexStringToColor(color).color;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(-300 + 6, -h / 2 + 8, 600, h, 22);
    g.fillStyle(onTap ? col : 0x3a3040, 1).fillRoundedRect(-300, -h / 2, 600, h, 22);
    g.lineStyle(5, onTap ? 0xffd23a : 0x5a4a66, 1).strokeRoundedRect(-300, -h / 2, 600, h, 22);
    c.add(g);
    c.add(this.text(0, sub ? -h * 0.14 : 0, main, 48, onTap ? '#ffffff' : '#8a8090').setStroke('#16101c', 8));
    if (sub) c.add(this.text(0, h * 0.24, sub, 24, onTap ? '#fff4d0' : '#8a8090'));
    L.add(c);
    if (!onTap) return;
    const hit = this.add.zone(0, 0, 600, h).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 0.96, duration: 70, yoyo: true });
      onTap();
    });
  }

  private drawModes(L: Phaser.GameObjects.Container): void {
    const H = this.H;
    const col = loadLife().mythclash ?? newCollection();
    const ok = battleUnlocked(col);
    const top = H / 2 - 200;
    // 名前は BLOOD TOWER(企画者 2026-10-27: 「ストーリーじゃなくて BLOOD TOWER」)
    this.panel(L, top, 240, '#8a35e0', '🏰 BLOOD TOWER', 'タワーを 1階から のぼろう', ok ? () => this.go('MythTower') : null);
    this.panel(L, top + 300, 240, '#c0182a', '⚔ バトル', 'CPUの強さを えらんで 1回バトル', ok ? () => this.switchView('cpu') : null);
    if (!ok) L.add(this.text(W / 2, top + 500, `異なるカードをあと${kindsToUnlock(col)}種類集めると\nバトル解放！`, 32, '#ffb070'));
  }

  /** 企画者の絵を画面いっぱいに出し、看板の所を押せるようにする(2026-11-01) */
  private drawModesArt(L: Phaser.GameObjects.Container): void {
    const H = this.H;
    const col = loadLife().mythclash ?? newCollection();
    const ok = battleUnlocked(col);
    const k = Math.max(W / MODE_ART.w, H / MODE_ART.h);
    const ox = (W - MODE_ART.w * k) / 2;
    const oy = (H - MODE_ART.h * k) / 2;
    L.addAt(this.add.image(ox, oy, MYTH_MODE_IMAGE).setOrigin(0, 0).setScale(k), 0);
    const targets = { tower: () => this.go('MythTower'), battle: () => this.switchView('cpu') };
    for (const id of Object.keys(MODE_ZONES) as (keyof typeof MODE_ZONES)[]) {
      const [x0, y0, x1, y1] = MODE_ZONES[id];
      const z = this.add.rectangle(ox + x0 * k, oy + y0 * k, (x1 - x0) * k, (y1 - y0) * k, ok ? 0xffffff : 0x0a0408, ok ? 0 : 0.6).setOrigin(0, 0);
      L.add(z);
      // カードが3種類そろうまでは、看板を暗くして押せない
      if (!ok) continue;
      z.setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        z.setFillStyle(0xffffff, 0.25);
        this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
        targets[id]();
      });
    }
    // お知らせは、絵の下の空いている所に出す
    if (!ok) L.add(this.text(W / 2, oy + 1430 * k, `異なるカードをあと${kindsToUnlock(col)}種類集めると\nバトル解放！`, 32, '#ffb070').setStroke('#16101c', 6));
  }

  /** 強さえらび(企画者の絵 2026-11-01)。まだ解放していない強さは、看板を暗くして解放のしかたを重ねる */
  private drawCpuArt(L: Phaser.GameObjects.Container): void {
    const H = this.H;
    const k = Math.max(W / MODE_ART.w, H / MODE_ART.h);
    const ox = (W - MODE_ART.w * k) / 2;
    const oy = (H - MODE_ART.h * k) / 2;
    L.addAt(this.add.image(ox, oy, MYTH_CPU_IMAGE).setOrigin(0, 0).setScale(k), 0);
    const won = (loadLife().mythclash ?? newCollection()).battleWon ?? [];
    for (const lv of CPU_LEVELS) {
      const [x0, y0, x1, y1] = CPU_ZONES[lv];
      const open = battleLevelOpen(lv, won);
      const z = this.add.rectangle(ox + x0 * k, oy + y0 * k, (x1 - x0) * k, (y1 - y0) * k, open ? 0xffffff : 0x0a0408, open ? 0 : 0.8).setOrigin(0, 0);
      L.add(z);
      if (!open) {
        const from = BATTLE_UNLOCK_FROM[lv];
        L.add(this.text(ox + ((x0 + x1) / 2) * k, oy + ((y0 + y1) / 2) * k, `🔒 「${from ? CPU_LABELS[from] : ''}」に勝つと解放`, 32, '#ffffff').setBackgroundColor('#16101ce6').setPadding(22, 12, 22, 14));
        continue;
      }
      z.setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        z.setFillStyle(0xffffff, 0.25);
        this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
        const match: MythMatch = { mode: 'battle', level: lv };
        this.go('MythDeck', { mode: 'battle', match });
      });
    }
  }

  private drawCpu(L: Phaser.GameObjects.Container): void {
    const H = this.H;
    const top = H / 2 - 260;
    L.add(this.text(W / 2, top - 130, 'CPUの強さを えらんでね', 30, '#ffffff'));
    // 弱いに勝つと普通、普通に勝つと強いが解放(企画者 2026-11-01)。まだのものは暗くして、解放のしかたを出す
    const won = (loadLife().mythclash ?? newCollection()).battleWon ?? [];
    CPU_LEVELS.forEach((lv, i) => {
      const open = battleLevelOpen(lv, won);
      const from = BATTLE_UNLOCK_FROM[lv];
      const sub = open ? `相手は ${BATTLE_MODE[lv].rarities.join('・')} のカード` : `🔒 「${from ? CPU_LABELS[from] : ''}」に勝つと解放`;
      this.panel(L, top + i * 230, 190, open ? CPU_COLORS[lv] : '#3a3040', `${CPU_STARS[lv]} ${CPU_LABELS[lv]}`, sub, open ? () => {
        const match: MythMatch = { mode: 'battle', level: lv };
        this.go('MythDeck', { mode: 'battle', match });
      } : null);
    });
  }

  private go(scene: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se(scene === 'MythTitle' ? 'back' : 'tap');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
