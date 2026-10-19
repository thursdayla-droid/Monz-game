import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { INTRO, QUESTIONS, decideFirstMonz, type Answers } from '../core/questions';
import { SAVE_VERSION, writeSave } from '../core/save';
import { addSoundButton } from '../ui/soundButton';
import { canvasTexture, drawButton, drawCard, drawPaper, drawPlaceCard, drawProgress, drawStreet, richText, richTextHeight, COLORS, CREAM } from '../ui/paint';

const W = 720;
const PAPER = { x: 40, y: 150, w: 640 };
const GRID = { top: 520, cardW: 312, cardH: 286, gap: 16 };
const ROWS = { top: 520, cardW: 640, cardH: 186, gap: 16 };
const BUTTON_Y = 1180;
const BUTTON_H = 112;

/**
 * 初回起動時の質問(はじめの説明 → 1/5〜5/5)。
 * 1画面1問。選ぶとカードが光り、「つぎへ」で進む。「もどる」で前の質問へ。
 * 途中では、最初に出会うMONZの種類や姿を出さない。
 */
export class QuestionScene extends Phaser.Scene {
  /** -1 = はじめの説明、0〜4 = 質問 */
  private step = -1;
  private answers: Answers = {};
  private content?: Phaser.GameObjects.Container;
  private busy = false;

  constructor() {
    super('Question');
  }

  init(): void {
    this.step = -1;
    this.answers = {};
    this.busy = false;
  }

  create(): void {
    canvasTexture(this, 'ui:street', W, 1280, (ctx) => drawStreet(ctx, W, 1280));
    this.add.image(0, 0, 'ui:street').setOrigin(0, 0);
    this.show(0);
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('question', 1.5);
    addSoundButton(this, W - 46, 56);
  }

  /** 今の step の画面を作る。dir は切りかえの向き(1=進む, -1=戻る, 0=最初) */
  private show(dir: number): void {
    const old = this.content;
    const c = this.add.container(dir * W, 0);
    this.content = c;
    const total = QUESTIONS.length;
    const q = this.step >= 0 ? QUESTIONS[this.step] : null;
    const key = (name: string) => `ui:q${this.step}:${name}`;

    // 進行表示
    const progressStep = Math.max(1, this.step + 1);
    canvasTexture(this, key('progress'), 470, 110, (ctx) => drawProgress(ctx, 470, 110, progressStep, total, 11 + this.step));
    c.add(this.add.image(W / 2, 80, key('progress')));

    // 質問の紙
    const paperH = q ? 360 : 560;
    canvasTexture(this, key('paper'), PAPER.w, paperH, (ctx) => {
      const p = drawPaper(ctx, PAPER.w, paperH, 21 + this.step);
      const title = q ? q.title : INTRO.title;
      const sub = q ? q.sub : INTRO.sub;
      const subLines = sub.split('\n').length;
      const titleH = richTextHeight(ctx, title, q ? 62 : 76, p.w - 50);
      const subSize = 28;
      const block = titleH + 18 + subLines * subSize * 1.3;
      const top = p.y + (p.h - block) / 2;
      richText(ctx, title, PAPER.w / 2, top, q ? 62 : 76, p.w - 50);
      ctx.fillStyle = '#16101c';
      ctx.font = `800 ${subSize}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      sub.split('\n').forEach((l, i) => ctx.fillText(l, PAPER.w / 2, top + titleH + 18 + i * subSize * 1.3));
      ctx.textAlign = 'left';
    });
    c.add(this.add.image(PAPER.x, PAPER.y, key('paper')).setOrigin(0, 0));

    // 選択カード
    const cards: { id: string; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Graphics; w: number; h: number }[] = [];
    if (q) {
      q.choices.forEach((choice, i) => {
        let x: number;
        let y: number;
        let w: number;
        let h: number;
        if (q.layout === 'grid') {
          w = GRID.cardW;
          h = GRID.cardH;
          x = (W - (w * 2 + GRID.gap)) / 2 + (i % 2) * (w + GRID.gap) + w / 2;
          y = GRID.top + Math.floor(i / 2) * (h + GRID.gap) + h / 2;
        } else {
          w = ROWS.cardW;
          h = ROWS.cardH;
          x = W / 2;
          y = ROWS.top + i * (h + ROWS.gap) + h / 2;
        }
        const k = key(`card${i}`);
        canvasTexture(this, k, w, h, (ctx) =>
          q.layout === 'grid' ? drawCard(ctx, w, h, i, choice.icon, choice.label, 31 + i + this.step * 7) : drawPlaceCard(ctx, w, h, choice.icon, choice.label, 41 + i),
        );
        const glow = this.add.graphics({ x, y });
        glow.lineStyle(14, Phaser.Display.Color.HexStringToColor(COLORS.yellow).color, 1).strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 30);
        glow.lineStyle(6, 0xffffff, 1).strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 30);
        glow.setVisible(false);
        const img = this.add.image(x, y, k).setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.choose(q.id, choice.id));
        c.add([img, glow]);
        cards.push({ id: choice.id, img, glow, w, h });
      });
    }

    // ボタン
    const hasBack = this.step >= 1;
    const nextW = hasBack ? 380 : 440;
    const nextX = hasBack ? W - 40 - nextW / 2 : W / 2;
    canvasTexture(this, key('next'), nextW, BUTTON_H, (ctx) => drawButton(ctx, nextW, BUTTON_H, 'つぎへ', 'next', 51 + this.step));
    const next = this.add.image(nextX, BUTTON_Y, key('next')).setInteractive({ useHandCursor: true });
    next.on('pointerdown', () => this.next());
    c.add(next);
    if (hasBack) {
      const backW = 230;
      canvasTexture(this, key('back'), backW, BUTTON_H - 16, (ctx) => drawButton(ctx, backW, BUTTON_H - 16, 'もどる', 'back', 61 + this.step));
      const back = this.add.image(40 + backW / 2, BUTTON_Y, key('back')).setInteractive({ useHandCursor: true });
      back.on('pointerdown', () => this.back());
      c.add(back);
    }

    // 選択状態の見た目
    const refresh = () => {
      const chosen = q ? this.answers[q.id] : undefined;
      for (const card of cards) {
        const on = card.id === chosen;
        card.glow.setVisible(on);
        card.img.setScale(on ? 1.04 : 1);
        if (chosen && !on) card.img.setTint(0x9a9aa6);
        else card.img.clearTint();
        card.glow.setScale(on ? 1.04 : 1);
      }
      const ready = !q || !!chosen;
      if (ready) next.clearTint();
      else next.setTint(0x77707f);
    };
    refresh();
    c.setData('refresh', refresh);
    if (cards.length) {
      this.tweens.add({ targets: cards.map((cd) => cd.glow), alpha: 0.45, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // 切りかえ
    if (old) {
      this.busy = true;
      this.tweens.add({ targets: old, x: -dir * W, duration: 260, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
      this.tweens.add({ targets: c, x: 0, duration: 300, delay: 60, ease: 'Cubic.easeOut', onComplete: () => (this.busy = false) });
    }
  }

  private choose(questionId: string, choiceId: string): void {
    if (this.busy) return;
    this.answers[questionId] = choiceId;
    audio.se('select');
    (this.content?.getData('refresh') as (() => void) | undefined)?.();
  }

  private next(): void {
    if (this.busy) return;
    const q = this.step >= 0 ? QUESTIONS[this.step] : null;
    if (q && !this.answers[q.id]) {
      // まだ選んでいない: 紙を少しゆらして知らせる
      this.cameras.main.shake(160, 0.004);
      audio.se('tap', { pitch: 0.6 });
      return;
    }
    if (this.step < QUESTIONS.length - 1) {
      this.step++;
      audio.se('next');
      this.show(1);
      return;
    }
    this.finish();
  }

  private back(): void {
    if (this.busy || this.step < 1) return;
    this.step--;
    audio.se('back');
    this.show(-1);
  }

  /** 5問目のあと: 回答を保存して誕生の演出へ */
  private finish(): void {
    this.busy = true;
    // 【未確定】判定ルールが決まるまで判定しない。いまはMONZがBUNKしかいないのでBUNKにする。
    const firstMonz = decideFirstMonz(this.answers) ?? 'bunk';
    writeSave({ version: SAVE_VERSION, answers: { ...this.answers }, answeredAt: new Date().toISOString(), firstMonz });
    const flash = this.add.rectangle(0, 0, W, 1280, Phaser.Display.Color.HexStringToColor(CREAM).color).setOrigin(0, 0).setAlpha(0);
    this.tweens.add({
      targets: flash,
      alpha: 1,
      duration: 380,
      onComplete: () => this.scene.start('Birth', { intro: true }),
    });
  }
}
