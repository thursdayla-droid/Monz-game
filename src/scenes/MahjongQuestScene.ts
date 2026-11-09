import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { clearStage, loadProgress, saveProgress, type MjProgress } from '../core/mahjong/progress';
import { ENDING_STORY, STAGE_COUNT, stageAt } from '../core/mahjong/stages';
import { UI_FONT } from '../ui/paint';
import { fillSize, watchViewport } from '../ui/viewport';

/**
 * MAHJONG QUEST の 対局の 外の 画面(2026-11-09 企画者「最初 1枚絵で 軽く ストーリーを 伝えて、敵の 1枚絵が 出て 対局開始」)。
 * title(タイトル)→ story(話の 1枚絵)→ intro(敵の 1枚絵)→ 対局(Mahjong)→ clear(ゴールド)/ lose → … → 5つめの あと ending → 2周目。
 * 1枚絵は まだ ない【仮：絵が 届くまで 色と 文字・キャラの 絵で 代わり】
 */
const H = 720;
type Mode = 'title' | 'story' | 'intro' | 'clear' | 'lose' | 'ending';
export interface QuestParams {
  mode?: Mode;
  /** clear の 時: もらえる ゴールド */
  gold?: number;
}

const CHAR_FILES = ['hero', 'boss', 'minion_a', 'minion_b'];

export class MahjongQuestScene extends Phaser.Scene {
  private W = 1280;
  private mode: Mode = 'title';
  private params: QuestParams = {};
  private prog!: MjProgress;
  private busy = false;

  constructor() {
    super('MahjongQuest');
  }

  init(data: QuestParams): void {
    this.params = data ?? {};
    this.mode = data?.mode ?? 'title';
  }

  preload(): void {
    for (const n of CHAR_FILES) if (!this.textures.exists(`mjc:${n}`)) this.load.image(`mjc:${n}`, assetUrl(`assets/mahjong/chars/${n}.webp`));
  }

  create(): void {
    this.busy = false;
    this.prog = loadProgress();
    // クリアの ごほうびは ここで 1回だけ 足して 保存
    if (this.mode === 'clear') {
      const { lapUp } = clearStage(this.prog, this.params.gold ?? 0);
      saveProgress(this.prog);
      this.params = { ...this.params, mode: lapUp ? 'ending' : 'clear' };
      if (lapUp) this.mode = 'ending';
    }
    this.layout();
    watchViewport(this, () => {
      this.layout();
      this.draw();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(720, 1280));
    audio.playBgm(this.mode === 'title' ? 'home' : 'battle');
    this.draw();
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private layout(): void {
    this.W = Math.max(1280, fillSize(this, { w: 1280, h: H }, { minRatio: 1280 / H, maxRatio: 2.2 }).w);
    this.scale.setGameSize(this.W, H);
    this.cameras.main.setSize(this.W, H);
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 0): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center', lineSpacing: 10 }).setOrigin(0.5);
  }

  private button(x: number, y: number, label: string, color: string, onTap: () => void): void {
    const t = this.text(x, y, label, 30, '#16101c').setInteractive({ useHandCursor: true });
    t.setBackgroundColor(color).setPadding(30, 12, 30, 12);
    t.on('pointerdown', () => {
      if (this.busy) return;
      audio.unlock();
      audio.se('select');
      onTap();
    });
  }

  private bg(top: number, bottom: number): void {
    const g = this.add.graphics();
    g.fillGradientStyle(top, top, bottom, bottom, 1).fillRect(0, 0, this.W, H);
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 12; i++) {
      const x = rnd(i + 40) * this.W;
      const y = rnd(i + 70) * H;
      const len = 120 + rnd(i + 5) * 300;
      g.fillStyle(i % 2 ? 0xff8a3a : 0xb04aff, 0.2);
      g.fillTriangle(x, y, x + len, y - len * 0.45, x + len + 26, y - len * 0.45 + 10);
    }
  }

  private draw(): void {
    this.children.removeAll(true);
    const W = this.W;
    const st = stageAt(this.prog.stage, this.prog.lap);
    const stageLabel = `${this.prog.lap >= 2 ? `${this.prog.lap}周目  ` : ''}STAGE ${this.prog.stage + 1}`;
    if (this.mode === 'title') {
      this.bg(0x2a0f52, 0x6a2cc0);
      const t = this.text(W / 2, 170, 'MAHJONG\nQUEST', 104, '#ffd23a', 14);
      this.tweens.add({ targets: t, scale: { from: 1.15, to: 1 }, duration: 500, ease: 'Back.easeOut' });
      this.charImg('mjc:hero', W / 2 - 330, 430, 300, false);
      this.charImg('mjc:boss', W / 2 + 330, 430, 300, false);
      this.text(W / 2, 400, `${stageLabel}  ／  ${this.prog.gold}G`, 26, '#ffffff', 6);
      this.button(W / 2, 500, this.prog.clears || this.prog.stage ? 'つづきから' : 'はじめる', '#ffd23a', () => this.go('story'));
      this.backButton();
      return;
    }
    if (this.mode === 'story' || this.mode === 'ending') {
      // 話の 1枚絵【仮：絵が 届くまで 背景と 勇者】
      this.bg(0x16081f, 0x3a1670);
      this.charImg('mjc:hero', W / 2, 360, 360, false).setAlpha(0.35);
      this.text(W / 2, 80, this.mode === 'ending' ? 'ENDING' : stageLabel, 40, '#ffd23a', 8);
      const box = this.add.graphics();
      box.fillStyle(0x16101c, 0.88).fillRoundedRect(W / 2 - 520, 430, 1040, 190, 20).lineStyle(4, 0xffd23a).strokeRoundedRect(W / 2 - 520, 430, 1040, 190, 20);
      const msg = this.mode === 'ending' ? ENDING_STORY : st.story;
      const t = this.text(W / 2, 525, '', 28, '#ffffff');
      // 文字を 1文字ずつ
      let i = 0;
      const ev = this.time.addEvent({ delay: 35, loop: true, callback: () => t.setText(msg.slice(0, ++i)) && i >= msg.length && ev.remove() });
      this.text(W - 120, H - 40, 'タップで つぎへ ▶', 20, '#e8dcf4', 4);
      this.input.once('pointerdown', () => {
        audio.unlock();
        audio.se('next');
        if (this.mode === 'ending') this.go('title');
        else this.go('intro');
      });
      return;
    }
    if (this.mode === 'intro') {
      // 敵の 1枚絵【仮：絵が 届くまで 3匹を 並べる】
      this.bg(0x3a0a1a, 0x6a1a3a);
      this.charImg('mjc:minion_b', W / 2 - 330, 470, 300, false, st.tint);
      this.charImg('mjc:minion_a', W / 2 + 330, 470, 300, false, st.tint);
      this.charImg('mjc:boss', W / 2, 500, 400, false, st.tint);
      const t1 = this.text(W / 2, 90, stageLabel, 40, '#ffd23a', 8);
      const t2 = this.text(W / 2, 160, `VS ${st.name}`, 64, '#ff6a8a', 10);
      this.tweens.add({ targets: [t1, t2], scale: { from: 2, to: 1 }, alpha: { from: 0, to: 1 }, duration: 380, ease: 'Back.easeOut' });
      this.cameras.main.shake(300, 0.006);
      audio.se('mcSlash');
      this.time.delayedCall(700, () => this.button(W / 2, H - 70, '対局 開始！', '#ffd23a', () => this.startMatch()));
      return;
    }
    if (this.mode === 'clear') {
      this.bg(0x2a0f52, 0x6a2cc0);
      const prev = (this.prog.stage + STAGE_COUNT - 1) % STAGE_COUNT;
      const t = this.text(W / 2, 150, `STAGE ${prev + 1} CLEAR!`, 80, '#ffd23a', 12);
      this.tweens.add({ targets: t, scale: { from: 1.8, to: 1 }, duration: 450, ease: 'Back.easeOut' });
      this.charImg('mjc:hero', W / 2, 420, 300, false);
      this.text(W / 2, 600, `+${this.params.gold ?? 0}G  （もちもの ${this.prog.gold}G）`, 34, '#ffffff', 6);
      audio.se('cheer');
      // 道具屋は 5段目【仮：今は すぐ 次へ】
      this.button(W / 2, H - 50, 'つぎの ステージへ', '#ffd23a', () => this.go('story'));
      return;
    }
    if (this.mode === 'lose') {
      this.bg(0x10081a, 0x2a1440);
      this.text(W / 2, 170, 'GAME OVER', 90, '#9fe0ff', 12);
      this.charImg('mjc:hero', W / 2, 440, 280, false).setTint(0x8888aa);
      this.text(W / 2, 590, `${stageLabel} から やりなおし`, 28, '#ffffff', 6);
      this.button(W / 2 - 170, H - 50, 'もう一度', '#ffd23a', () => this.go('intro'));
      this.button(W / 2 + 170, H - 50, 'タイトルへ', '#ffffff', () => this.go('title'));
    }
  }

  private charImg(key: string, x: number, y: number, h: number, flip: boolean, tint?: number): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, this.textures.exists(key) ? key : '__DEFAULT');
    img.setScale(h / img.height).setFlipX(flip);
    if (tint) img.setTint(tint);
    return img;
  }

  private backButton(): void {
    const b = this.text(70, 30, '◀ もどる', 18, '#ffffff').setInteractive({ useHandCursor: true });
    b.setBackgroundColor('#16101caa').setPadding(12, 6, 12, 6);
    b.on('pointerup', () => {
      audio.se('back');
      if ((window as { __MONZ_START?: string }).__MONZ_START === 'MahjongQuest') return;
      this.scene.start('MinigameSelect');
    });
  }

  private go(mode: Mode): void {
    this.mode = mode;
    this.input.off('pointerdown');
    this.draw();
  }

  private startMatch(): void {
    this.busy = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Mahjong', { stage: this.prog.stage, lap: this.prog.lap }));
  }
}
