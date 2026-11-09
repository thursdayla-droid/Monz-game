import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { clearStage, loadProgress, resetRun, saveProgress, type MjProgress } from '../core/mahjong/progress';
import { ENDING_ART, ENDING_STORY, STAGE_COUNT, STAGES, stageAt } from '../core/mahjong/stages';
import { UI_FONT } from '../ui/paint';
import { fillSize, viewRatio, watchViewport } from '../ui/viewport';

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
/** タイトルの 絵(2026-11-09 企画者。design/mahjong/title.png。たて長)。絵の 中の ボタンの 場所(元の 絵 934×1685 の 座標) */
const TITLE_ART = { w: 934, h: 1685, start: [118, 1318, 816, 1482], howto: [226, 1500, 708, 1636] } as const;

/** この 回の 遊びで 麻雀クエストを 遊んでいる 途中か(アプリを 閉じると 消える) */
const SESSION_KEY = 'monz:mahjong:playing';
const sessionFlag = (): boolean => {
  try {
    return globalThis.sessionStorage?.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
};
const setSessionFlag = (on: boolean): void => {
  try {
    if (on) globalThis.sessionStorage?.setItem(SESSION_KEY, '1');
    else globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    /* 使えなくても 続ける */
  }
};

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
    // Phaser は 次に 何も 渡さずに 開いた 時も 前の data を 使う → クリアの ごほうびが 2回 入らない ように 消す
    this.sys.settings.data = {};
  }

  preload(): void {
    for (const n of [...CHAR_FILES, ...new Set(STAGES.flatMap((st) => [st.art.boss, st.art.minionA, st.art.minionB]))]) if (!this.textures.exists(`mjc:${n}`)) this.load.image(`mjc:${n}`, assetUrl(`assets/mahjong/chars/${n}.webp`));
    if (!this.textures.exists('mj:title')) this.load.image('mj:title', assetUrl('assets/mahjong/title.webp'));
    // 敵の 1枚絵の うしろに 使う ステージの 背景
    if (!this.textures.exists(`mj:story:${ENDING_ART}`)) this.load.image(`mj:story:${ENDING_ART}`, assetUrl(`assets/mahjong/story/${ENDING_ART}.webp`));
    for (const st of STAGES) if (st.storyArt && !this.textures.exists(`mj:story:${st.storyArt}`)) this.load.image(`mj:story:${st.storyArt}`, assetUrl(`assets/mahjong/story/${st.storyArt}.webp`));
    for (const st of STAGES) if (st.bg && !this.textures.exists(`mj:bg:${st.bg}`)) this.load.image(`mj:bg:${st.bg}`, assetUrl(`assets/mahjong/bg/${st.bg}.webp`));
  }

  create(): void {
    this.busy = false;
    this.prog = loadProgress();
    // アプリを 開きなおした 時は 最初の ステージから(この 回の 遊びの 間だけ 続きから。企画者 2026-11-09)
    if (!sessionFlag()) {
      resetRun(this.prog);
      saveProgress(this.prog);
      setSessionFlag(true);
    }
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
    audio.playBgm(this.mode === 'title' ? 'home' : 'mahjong');
    this.draw();
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  /** 画面の 高さ(タイトルは たて・ほかは 横) */
  private Ht = H;

  private layout(): void {
    if (this.mode === 'title') {
      // タイトルは 企画者の たて長の 絵(スマホの 形まで のばす)
      this.W = 720;
      this.Ht = Math.max(1280, fillSize(this, { w: 720, h: 1280 }, { minRatio: 0.4, maxRatio: 720 / 1280 }).h);
    } else {
      this.W = Math.max(1280, fillSize(this, { w: 1280, h: H }, { minRatio: 1280 / H, maxRatio: 2.2 }).w);
      this.Ht = H;
    }
    this.scale.setGameSize(this.W, this.Ht);
    this.cameras.main.setSize(this.W, this.Ht);
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
      this.drawTitle();
      return;
    }
    if (viewRatio(this) < 1) this.turnHint();
    if (this.mode === 'story' || this.mode === 'ending') {
      // 話の 1枚絵(企画者の 絵。ない 時は 背景と 勇者)
      this.bg(0x16081f, 0x3a1670);
      const artKey = `mj:story:${this.mode === 'ending' ? ENDING_ART : st.storyArt ?? ''}`;
      if (this.textures.exists(artKey)) {
        const im = this.add.image(W / 2, H / 2, artKey);
        im.setScale(Math.max(W / im.width, H / im.height));
        this.tweens.add({ targets: im, scale: im.scale * 1.04, duration: 6000, ease: 'Sine.easeOut' });
      } else this.charImg('mjc:hero', W / 2, 360, 360, false).setAlpha(0.35);
      this.text(W / 2, 50, this.mode === 'ending' ? 'ENDING' : stageLabel, 36, '#ffd23a', 8);
      // 文字は 下の 帯に(絵を かくさない ように)
      const box = this.add.graphics();
      box.fillStyle(0x16101c, 0.82).fillRoundedRect(W / 2 - 560, 520, 1120, 170, 20).lineStyle(4, 0xffd23a).strokeRoundedRect(W / 2 - 560, 520, 1120, 170, 20);
      const msg = this.mode === 'ending' ? ENDING_STORY : st.story;
      const t = this.text(W / 2, 605, '', 28, '#ffffff');
      // 文字を 1文字ずつ
      let i = 0;
      const ev = this.time.addEvent({ delay: 35, loop: true, callback: () => t.setText(msg.slice(0, ++i)) && i >= msg.length && ev.remove() });
      this.text(W / 2 + 470, 676, 'タップで つぎへ ▶', 18, '#e8dcf4', 4);
      // 押した 指で すぐ 次へ 進まない ように 少し 待ってから。文字の 途中で さわったら まず 全部 出す
      this.time.delayedCall(350, () => {
        const onTap = () => {
          if (i < msg.length) {
            i = msg.length;
            t.setText(msg);
            ev.remove();
            this.input.once('pointerdown', onTap);
            return;
          }
          audio.unlock();
          audio.se('next');
          if (this.mode === 'ending') this.go('title');
          else this.go('intro');
        };
        this.input.once('pointerdown', onTap);
      });
      return;
    }
    if (this.mode === 'intro') {
      // 敵の 1枚絵【仮：絵が 届くまで 3匹を 並べる】
      this.bg(0x3a0a1a, 0x6a1a3a);
      if (st.bg && this.textures.exists(`mj:bg:${st.bg}`)) {
        const im = this.add.image(W / 2, H / 2, `mj:bg:${st.bg}`);
        im.setScale(Math.max(W / im.width, H / im.height)).setTint(0xb0a0c0);
      }
      this.charImg(`mjc:${st.art.minionB}`, W / 2 - 330, 470, 300, false);
      this.charImg(`mjc:${st.art.minionA}`, W / 2 + 330, 470, 300, false);
      this.charImg(`mjc:${st.art.boss}`, W / 2, 500, 400, false);
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

  /** タイトル: 企画者の 絵を 横はばいっぱいに・上下の あまりは 絵の はしを のばす。絵の「スタート」「遊び方」が ボタン */
  private drawTitle(): void {
    const W = this.W;
    const Ht = this.Ht;
    const k = W / TITLE_ART.w;
    const ih = TITLE_ART.h * k;
    const y0 = Math.max(0, (Ht - ih) / 2);
    this.cameras.main.setBackgroundColor('#4a9be0');
    const src = this.textures.get('mj:title').getSourceImage() as HTMLImageElement;
    const band = (key: string, sy: number, y: number, h: number) => {
      if (h <= 0) return;
      if (!this.textures.exists(key)) {
        const c = this.textures.createCanvas(key, src.width, 4);
        c?.getContext().drawImage(src, 0, sy, src.width, 4, 0, 0, src.width, 4);
        c?.refresh();
      }
      this.add.image(0, y, key).setOrigin(0, 0).setDisplaySize(W, h + 2);
    };
    band('mj:title:top', 0, 0, y0);
    band('mj:title:bot', src.height - 4, y0 + ih - 1, Ht - y0 - ih);
    this.add.image(0, y0, 'mj:title').setOrigin(0, 0).setDisplaySize(W, ih);
    const zone = ([x0, a0, x1, a1]: readonly number[], onTap: () => void) => {
      const z = this.add.rectangle(x0 * k, y0 + a0 * k, (x1 - x0) * k, (a1 - a0) * k, 0xffffff, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        if (this.busy) return;
        audio.unlock();
        audio.se('select');
        z.setFillStyle(0xffffff, 0.3);
        this.tweens.add({ targets: z, fillAlpha: 0, duration: 220 });
        onTap();
      });
    };
    zone(TITLE_ART.start, () => this.go('story'));
    zone(TITLE_ART.howto, () => this.howTo());
    // 今の ステージ・ゴールド(小さく)
    const st = `${this.prog.lap >= 2 ? `${this.prog.lap}周目 ` : ''}STAGE ${this.prog.stage + 1}  ${this.prog.gold}G`;
    this.text(W - 130, 36, st, 20, '#ffffff', 0).setBackgroundColor('#16101caa').setPadding(12, 6, 12, 6);
    this.backButton();
  }

  /** 遊び方(報酬の 決まりは 書かない: CLAUDE.md) */
  private howTo(): void {
    const W = this.W;
    const c = this.add.container(W / 2, this.Ht / 2).setDepth(50);
    c.add(this.add.rectangle(0, 0, W, this.Ht, 0x000000, 0.6).setInteractive());
    c.add(this.add.rectangle(0, 0, 660, 900, 0x16101c, 0.97).setStrokeStyle(5, 0xffd23a));
    c.add(this.text(0, -390, '遊び方', 40, '#ffd23a', 6));
    const lines = [
      'ふつうの 4人麻雀で 戦うよ。',
      'あいては 敵チーム 3人(ボスと 子分2人)。',
      '3人で 1つの HP を 持っている。',
      '',
      'アガると、その 点数が 敵への ダメージ！',
      'ロン … アガった 点数',
      'ツモ … 3人が 払う 点の 合計',
      '',
      '敵に アガられると、あなたが ダメージ。',
      '敵の HP を 0 に したら ステージ クリア！',
      'あなたの HP が 0 に なったら 負け。',
      '',
      '牌は 2回 タップで 捨てる。',
      '「オートパス」で チー・ポン・カンを 聞かない。',
    ];
    c.add(this.text(0, 20, lines.join('\n'), 24, '#ffffff').setLineSpacing(12));
    const b = this.text(0, 385, 'とじる', 28, '#16101c').setInteractive({ useHandCursor: true });
    b.setBackgroundColor('#ffd23a').setPadding(30, 10, 30, 10);
    b.on('pointerdown', () => {
      audio.se('back');
      c.destroy();
    });
    c.add(b);
  }

  /** スマホが たての 時(対局の 前の 画面は 横) */
  private turnHint(): void {
    const c = this.add.container(this.W / 2, H / 2).setDepth(60);
    c.add(this.add.rectangle(0, 0, 680, 150, 0x16101c, 0.92).setStrokeStyle(4, 0xffd23a));
    c.add(this.text(0, 0, 'スマホを 横にしてね', 46, '#ffd23a'));
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
      // 麻雀クエストを やめたら 次は 最初の ステージから
      resetRun(this.prog);
      saveProgress(this.prog);
      setSessionFlag(false);
      this.scene.start('MinigameSelect');
    });
  }

  private go(mode: Mode): void {
    const wasTitle = this.mode === 'title';
    this.mode = mode;
    this.input.off('pointerdown');
    if (wasTitle !== (mode === 'title')) this.layout();
    this.cameras.main.setBackgroundColor('#000000');
    this.draw();
  }

  private startMatch(): void {
    this.busy = true;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Mahjong', { stage: this.prog.stage, lap: this.prog.lap }));
  }
}
