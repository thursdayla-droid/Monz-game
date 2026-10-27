import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { CPU_LABELS, CPU_LEVELS, type CpuLevel } from '../core/mythclash/cpu';
import { BATTLE_MODE, TOWER_FLOORS, towerOpenFloors, type MythMatch } from '../core/mythclash/modes';
import { battleUnlocked, kindsToUnlock, newCollection } from '../core/mythclash/packs';
import { newSeed } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { UI_FONT } from '../ui/paint';
import { fillSize } from '../ui/viewport';
import { MYTH_TITLE_IMAGE } from './MythTitleScene';

const W = 720;
const PORTRAIT = { w: 720, h: 1280 };
export type MythModeView = 'mode' | 'tower' | 'cpu';

/** タワーの1回の挑戦の番号(報酬を2回もらわないように) */
export const newTowerRun = (floor: number): string => `myth:tower:${floor}:${Date.now().toString(36)}:${newSeed().toString(36)}`;

const CPU_STARS: Record<CpuLevel, string> = { weak: '★', normal: '★★', strong: '★★★' };
const CPU_COLORS: Record<CpuLevel, string> = { weak: '#3aa860', normal: '#2a6ad8', strong: '#c0182a' };

/**
 * MYTHCLASH のモードえらび(企画者決定 2026-10-27)。タイトルの「バトルを始める」から開く。
 * - mode: ストーリーモード / バトルモード
 * - tower: ストーリーモードの階えらび。1階〜(クリアした階の次)から始められる。クリアした階もまた遊べる
 * - cpu: バトルモードの CPU の強さ(弱い・普通・強い)
 * えらんだら デッキ編成 → バトル。カードが3種類ないときは「あと○種類」だけ(はじめのカードのプレゼントはしない。企画者)
 * 【仮】画面の見た目はプログラムで描いたもの
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
    const back = this.text(90, 46, '◀ もどる', 28, '#ffffff').setBackgroundColor('#16101ccc').setPadding(14, 6, 14, 8).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      if (this.view === 'mode') this.go('MythTitle');
      else this.switchView('mode');
    });
    const title = this.view === 'tower' ? 'ストーリーモード' : this.view === 'cpu' ? 'バトルモード' : 'モードをえらぶ';
    L.add([back, this.text(W / 2 + 60, 46, title, 40, '#ffd23a').setStroke('#16101c', 8)]);
    if (this.view === 'tower') this.drawTower(L);
    else if (this.view === 'cpu') this.drawCpu(L);
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
    this.panel(L, top, 240, '#8a35e0', '🏰 ストーリー', 'タワーを 1階から のぼろう', ok ? () => this.switchView('tower') : null);
    this.panel(L, top + 300, 240, '#c0182a', '⚔ バトル', 'CPUの強さを えらんで 1回バトル', ok ? () => this.switchView('cpu') : null);
    if (!ok) L.add(this.text(W / 2, top + 500, `異なるカードをあと${kindsToUnlock(col)}種類集めると\nバトル解放！`, 32, '#ffb070'));
  }

  /** タワー(上が10階)。遊べる階だけ さわれる */
  private drawTower(L: Phaser.GameObjects.Container): void {
    const H = this.H;
    const cleared = (loadLife().mythclash ?? newCollection()).towerCleared ?? 0;
    const open = towerOpenFloors(cleared);
    const top = 120;
    const rowH = Math.min(100, (H - top - 40) / TOWER_FLOORS);
    // 塔のかべ
    const g = this.add.graphics();
    g.fillStyle(0x1c1018, 0.9).fillRect(W / 2 - 250, top - 10, 500, rowH * TOWER_FLOORS + 20);
    g.lineStyle(4, 0x5a3a48, 1).strokeRect(W / 2 - 250, top - 10, 500, rowH * TOWER_FLOORS + 20);
    L.add(g);
    for (let f = TOWER_FLOORS; f >= 1; f--) {
      const y = top + (TOWER_FLOORS - f) * rowH + rowH / 2;
      const done = f <= cleared;
      const can = f <= open;
      const next = can && !done;
      const c = this.add.container(W / 2, y);
      const box = this.add.graphics();
      const fill = next ? 0xc0182a : done ? 0x2a5a3a : 0x2a2030;
      box.fillStyle(fill, 1).fillRoundedRect(-230, -rowH / 2 + 6, 460, rowH - 12, 14);
      box.lineStyle(4, next ? 0xffd23a : done ? 0x7dffa0 : 0x4a3a50, 1).strokeRoundedRect(-230, -rowH / 2 + 6, 460, rowH - 12, 14);
      c.add(box);
      c.add(this.text(-150, 0, `${f}F`, 40, can ? '#ffffff' : '#6a5a70').setStroke('#16101c', 6));
      const note = done ? '✓ クリア' : next ? 'ちょうせん！' : '🔒';
      c.add(this.text(70, 0, note, 30, done ? '#7dffa0' : next ? '#ffd23a' : '#6a5a70'));
      if (next) this.tweens.add({ targets: box, alpha: 0.7, duration: 600, yoyo: true, repeat: -1 });
      if (can) {
        const hit = this.add.zone(0, 0, 460, rowH - 12).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.startTower(f));
        c.add(hit);
      }
      L.add(c);
    }
  }

  private startTower(floor: number): void {
    const match: MythMatch = { mode: 'tower', floor, battle: 0, runId: newTowerRun(floor) };
    this.go('MythDeck', { mode: 'battle', match });
  }

  private drawCpu(L: Phaser.GameObjects.Container): void {
    const H = this.H;
    const top = H / 2 - 260;
    L.add(this.text(W / 2, top - 130, 'CPUの強さを えらんでね', 30, '#ffffff'));
    CPU_LEVELS.forEach((lv, i) => {
      this.panel(L, top + i * 230, 190, CPU_COLORS[lv], `${CPU_STARS[lv]} ${CPU_LABELS[lv]}`, `相手は ${BATTLE_MODE[lv].rarities.join('・')} のカード`, () => {
        const match: MythMatch = { mode: 'battle', level: lv };
        this.go('MythDeck', { mode: 'battle', match });
      });
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
