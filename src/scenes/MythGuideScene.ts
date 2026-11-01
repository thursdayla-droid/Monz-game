import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { preloadPacks } from '../render/packs';
import { ELEMENT_COLORS } from '../ui/mythCardArt';
import { UI_FONT } from '../ui/paint';
import { fillSize } from '../ui/viewport';
import { MYTH_TITLE_IMAGE } from './MythTitleScene';

const W = 720;
const PORTRAIT = { w: 720, h: 1280 };

/** 1ページ: 見出しと、文の行(色をつけたい行は [文, 色]) */
interface GuidePage {
  title: string;
  lines: (string | [string, string])[];
}

/**
 * ゲームガイドの中身(企画者 2026-11-01「ゲームガイドはお願いします」)。
 * 遊び方の説明に報酬(コイン・経験値の決まり)は書かない(CLAUDE.md)。数字はゲームの決まり(rules.ts)と合わせる
 */
const PAGES: GuidePage[] = [
  {
    title: 'MYTHCLASH ってなに？',
    lines: [
      'カードを3枚えらんでチームを作り、相手のチームと戦うカードバトル。',
      '場に出るのは1枚ずつ。相手の3枚を全部たおしたら勝ち！',
      '',
      ['カードはパックを開けると手に入る。', '#ffd23a'],
      'ちがうカードが3種類そろうと、バトルができるようになる。',
      '同じカードはチームに1枚まで。',
    ],
  },
  {
    title: 'カードの見方',
    lines: [
      ['HP', '#ff6a6a'],
      '0になるとそのカードはたおれる。',
      ['攻・防', '#ffb070'],
      '通常攻撃と必殺の強さ・受けるダメージの少なさ。',
      ['魔', '#c890ff'],
      '魔法の強さと、魔法に強いか。',
      ['速', '#ffd23a'],
      '高いほうが先に攻撃できる。',
      '',
      'レアは N → R → SR → UR → SEC の順に めずらしい。',
    ],
  },
  {
    title: 'ターンの流れ',
    lines: [
      '1ターンは「前半」と「後半」。',
      '速さが高いカードが、前半の攻撃側になる。後半は交代して、もう一方が攻撃。',
      '',
      ['攻撃側：通常攻撃・必殺・魔法', '#ff8a8a'],
      ['防御側：防御・魔法防御・カウンター', '#8ab8ff'],
      '',
      'それぞれ1つえらぶ。えらぶ時間は30秒。',
      '時間切れのときは、自動でえらばれる。',
    ],
  },
  {
    title: '攻撃と守りの相性',
    lines: [
      ['防御', '#8ab8ff'],
      '通常攻撃のダメージを半分にする。',
      ['魔法防御', '#c890ff'],
      '魔法のダメージを半分にして、魔法の追加効果も防ぐ。',
      ['カウンター', '#7dffa0'],
      '必殺を そのまま はね返す！ でも通常攻撃と魔法には効かない。',
      '',
      ['必殺は強いけど、使ったカードは次のターン必殺を使えない。', '#ffd23a'],
      '相手が何を出すか、読み合いが大事！',
    ],
  },
  {
    title: '属性',
    lines: [
      ['炎 → 自然 → 雷 → 水 → 炎', '#ffffff'],
      ['光 ⇔ 闇', '#ffffff'],
      '',
      '矢印の先の属性に強い。有利なら1.4倍、不利なら0.6倍のダメージ。',
      '光と闇は、おたがいに強い。無は相性なし。',
      '',
      '通常攻撃・必殺はカードの属性。',
      '魔法は、魔法の属性で決まる（カードの属性とちがうこともある）。',
    ],
  },
  {
    title: '魔法の追加効果',
    lines: [
      ['睡眠・凍結', '#7fd8ff'],
      '2回 行動できなくなる。',
      ['毒・火傷', '#c890ff'],
      'ターンの終わりに、最大HPの5%のダメージ。たおれるまで続く。',
      ['ダウン・回復・バリア・吸収', '#ffd23a'],
      '相手を弱くしたり、自分を守ったり。',
      '',
      '「(50%)」の効果は、コイントスで表が出たら効く。',
      ['ときどきクリティカル！ ダメージが1.4倍になる。', '#ff8a5a'],
    ],
  },
  {
    title: '交代と特性',
    lines: [
      'ターンのはじめ（前半）に、控えのカードと交代できる。',
      '交代したターンは、自分の攻撃がない。HPや毒はそのまま残る。',
      'カードがたおれたら、控えから次のカードを出す。',
      '',
      ['特性', '#ffd23a'],
      'カードによって、特別な力（特性）を持っている。',
      '決まった時に自動で発動する。',
      '',
      '相手のまだ出ていないカード・使っていない魔法・発動していない特性は「？？？」。',
    ],
  },
  {
    title: '遊べるモード',
    lines: [
      ['BLOOD TOWER', '#ff5a5a'],
      '10階だての塔。1つの階で3人と戦い、ボスをたおすと次の階へ。',
      '負けたら、その階の1戦目からやり直し。',
      'てっぺんで待つのは…？',
      '',
      ['バトルモード', '#ffd23a'],
      'CPU の強さ（弱い・普通・強い）をえらんで、何度でも戦える。',
      '',
      'チーム編成で、いつでもチームを組みかえられる。',
    ],
  },
];

/**
 * MYTHCLASH のゲームガイド(遊び方の説明。企画者 2026-11-01)。タイトルの「ゲームガイド」から開く。
 * 1ページずつ。◀ ▶ か左右になぞってめくる。【仮】見た目はプログラムで描いたもの
 */
export class MythGuideScene extends Phaser.Scene {
  private H = 1280;
  private page = 0;
  private layer?: Phaser.GameObjects.Container;
  private label?: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('MythGuide');
  }

  init(): void {
    this.page = 0;
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
    if (this.textures.exists(MYTH_TITLE_IMAGE)) {
      const img = this.add.image(W / 2, 0, MYTH_TITLE_IMAGE).setOrigin(0.5, 0).setAlpha(0.25);
      img.setCrop(0, 0, img.width, 560).setScale(W / img.width);
    }
    const back = this.add
      .text(24, 30, '◀ もどる', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 8 } })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    this.add.text(W / 2 + 60, 54, 'ゲームガイド', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffd23a', stroke: '#16101c', strokeThickness: 8 }).setOrigin(0.5);
    const footY = H - 70;
    const arrow = (x: number, s: string, d: number) =>
      this.add
        .text(x, footY, s, { fontFamily: UI_FONT, fontSize: '44px', fontStyle: '900', color: '#16101c', backgroundColor: '#ffd23a', padding: { x: 26, y: 4 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.turn(d));
    arrow(110, '◀', -1);
    arrow(W - 110, '▶', 1);
    this.label = this.add.text(W / 2, footY, '', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    let downX: number | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (downX = p.x));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (downX !== null && Math.abs(p.x - downX) > 90) this.turn(p.x < downX ? 1 : -1);
      downX = null;
    });
    this.draw(0);
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  private turn(d: number): void {
    const next = (this.page + d + PAGES.length) % PAGES.length;
    audio.se('tap');
    this.page = next;
    this.draw(d);
  }

  private draw(dir: number): void {
    const old = this.layer;
    const L = this.add.container(0, 0);
    this.layer = L;
    const p = PAGES[this.page];
    const top = 120;
    const panelH = this.H - top - 150;
    const g = this.add.graphics();
    g.fillStyle(0x16101c, 0.88).fillRoundedRect(30, top, W - 60, panelH, 24);
    g.lineStyle(4, 0xc0182a, 1).strokeRoundedRect(30, top, W - 60, panelH, 24);
    L.add(g);
    L.add(this.add.text(W / 2, top + 50, p.title, { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: '#ffd23a' }).setOrigin(0.5));
    // 属性のページは、属性の色の丸を並べる
    let y = top + 110;
    if (this.page === 4) {
      const els = ['炎', '自然', '雷', '水', '光', '闇', '無'] as const;
      els.forEach((e, i) => {
        const x = W / 2 + (i - 3) * 88;
        L.add(this.add.circle(x, y + 30, 36, Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[e]).color, 1).setStrokeStyle(4, 0xffffff, 0.8));
        L.add(this.add.text(x, y + 30, e, { fontFamily: UI_FONT, fontSize: e.length > 1 ? '22px' : '30px', fontStyle: '900', color: '#16101c' }).setOrigin(0.5));
      });
      y += 90;
    }
    for (const line of p.lines) {
      const [s, color] = typeof line === 'string' ? [line, '#ffffff'] : line;
      if (!s) {
        y += 18;
        continue;
      }
      const t = this.add.text(60, y, s, { fontFamily: UI_FONT, fontSize: '28px', fontStyle: '900', color, wordWrap: { width: W - 120, useAdvancedWrap: true }, lineSpacing: 6 });
      L.add(t);
      y += t.height + 10;
    }
    this.label?.setText(`${this.page + 1} / ${PAGES.length}`);
    if (old && dir) {
      L.x = dir * W;
      this.tweens.add({ targets: old, x: -dir * W, duration: 220, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
      this.tweens.add({ targets: L, x: 0, duration: 220, ease: 'Cubic.easeOut' });
    } else old?.destroy();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MythTitle'));
  }
}
