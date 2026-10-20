import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { DASH, dashReward, DASH_REWARD, jump, meters, newDash, step, type DashState } from '../core/dash';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { newSeed } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { drawPanel } from '../ui/homeArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { homeIconKey } from './HomeScene';

const W = 720;
const H = 1280;
const INK = '#16101c';
type Phase = 'ready' | 'run' | 'paused' | 'over';

/**
 * ミニゲーム「DASH MONZ」(企画者仕様 2026-10-20)。タイトル(PLAY・遊び方)とプレイを1つの画面で。
 * 【仮】見た目: 背景・足場・危険物・さわっても大丈夫な物は仮の形(企画者が決めたら差しかえる)。
 * 走るのは黒いモンズ(企画者の絵。今はMONZ CARDのクリアの絵を使う。走る絵が届いたら差しかえる)。
 */
export class DashScene extends Phaser.Scene {
  private s!: DashState;
  private phase: Phase = 'ready';
  private record!: LifeRecord;
  private runId = '';
  private world!: Phaser.GameObjects.Graphics;
  private runner?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private distText!: Phaser.GameObjects.Text;
  private t = 0;
  private onHide?: () => void;

  constructor() {
    super('Dash');
  }

  preload(): void {
    preloadPacks(this, ['card', 'home']);
  }

  create(): void {
    this.record = new LifeRecord(loadLife());
    this.phase = 'ready';
    // 【仮】背景: 空のグラデーションと遠くのビル
    canvasTextureOnce(this, 'dash:sky', W, H, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1a5e');
      g.addColorStop(0.55, '#7a3fa0');
      g.addColorStop(1, '#ff8a5c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    this.add.image(0, 0, 'dash:sky').setOrigin(0, 0).setScrollFactor(0);
    canvasTextureOnce(this, 'dash:city', 1440, 500, (ctx) => {
      ctx.fillStyle = 'rgba(22,16,40,0.6)';
      let x = 0;
      let i = 0;
      while (x < 1440) {
        const w = 60 + ((i * 37) % 70);
        const h = 120 + ((i * 53) % 260);
        ctx.fillRect(x, 500 - h, w - 6, h);
        x += w;
        i++;
      }
    });
    this.add.tileSprite(0, 520, W, 500, 'dash:city').setOrigin(0, 0).setName('city');
    this.world = this.add.graphics();
    if (this.textures.exists('cardimg:clearMonz')) this.runner = this.add.image(DASH.runnerX, 900, 'cardimg:clearMonz').setOrigin(0.5, 0.92).setScale(0.2);
    else this.runner = this.add.rectangle(DASH.runnerX, 900, DASH.runnerW, DASH.runnerH, 0x16101c).setOrigin(0.5, 1);
    this.runner.setDepth(3);

    this.distText = this.add.text(W / 2, 40, '', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '52px', color: '#ffffff', stroke: INK, strokeThickness: 10 }).setOrigin(0.5, 0).setDepth(10);
    const pause = this.add.text(24, 30, 'Ⅱ', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: '#ffffff', backgroundColor: '#16101ccc', padding: { x: 16, y: 6 } }).setDepth(10).setInteractive({ useHandCursor: true }).setName('pause');
    pause.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.phase === 'run') this.pause();
    });
    // コイン
    canvasTextureOnce(this, 'card:coinbox', 190, 70, (ctx) => drawPanel(ctx, 190, 70, 93));
    this.add.image(W - 20 - 95, 65, 'card:coinbox').setDepth(10);
    if (this.textures.exists(homeIconKey('coin'))) this.add.image(W - 20 - 158, 65, homeIconKey('coin')).setDisplaySize(56, 56).setDepth(10);
    this.add.text(W - 36, 65, this.record.coins.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '28px', color: INK }).setOrigin(1, 0.5).setDepth(10).setName('coins');

    // 画面のどこをタップしてもジャンプ
    this.input.on('pointerdown', () => {
      if (this.phase === 'run' && jump(this.s)) audio.se('boing', { pitch: 1.4 });
    });
    this.onHide = () => {
      if (document.hidden && this.phase === 'run') this.pause();
    };
    document.addEventListener('visibilitychange', this.onHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onHide && document.removeEventListener('visibilitychange', this.onHide));

    this.s = newDash(newSeed());
    this.drawWorld();
    this.showTitle();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    audio.playBgm('main');
  }

  // ---------------- タイトル ----------------

  private showTitle(): void {
    this.phase = 'ready';
    const box = this.add.container(0, 0).setDepth(20);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.35).setOrigin(0, 0).setInteractive();
    const logo = this.add.text(W / 2, 300, 'DASH\nMONZ', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '130px', color: '#ffd23a', stroke: INK, strokeThickness: 18, align: 'center', lineSpacing: -20 }).setOrigin(0.5).setAngle(-6);
    const sub = this.add.text(W / 2, 470, 'ダッシュモンズ', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
    const rec = loadLife().records.dash;
    const best = this.add.text(W / 2, 560, rec ? `自己ベスト：${rec.bestScore}m` : '', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
    const play = this.button(W / 2, 1010, '  PLAY ▶  ', '#ffd23a', INK, 58);
    const how = this.button(W / 2, 1140, '  📖 遊び方  ', '#16101c', '#ffffff', 34);
    const back = this.button(70, 64, '◀', '#16101ccc', '#ffffff', 34);
    box.add([dim, logo, sub, best, play, how, back]);
    play.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      audio.se('sting');
      box.destroy();
      this.startRun();
    });
    how.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.howTo();
    });
    back.on('pointerdown', () => {
      audio.se('back');
      this.scene.start('MinigameSelect');
    });
  }

  private button(x: number, y: number, label: string, bg: string, color: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, { fontFamily: size > 40 ? '"Arial Black", Impact, sans-serif' : UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, backgroundColor: bg, padding: { x: 20, y: 10 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
  }

  private howTo(): void {
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(30);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    canvasTextureOnce(this, 'dash:howpanel', 640, 760, (ctx) => drawPanel(ctx, 640, 760, 99));
    const panel = this.add.image(W / 2, H / 2, 'dash:howpanel');
    const text = [
      '遊び方',
      '',
      '・モンズは自動で右へ走るよ',
      '・画面をタップするとジャンプ！',
      '  （いつも同じ高さ。空中では跳べない）',
      '・足場から落ちたらゲームオーバー',
      '・赤いトゲに当たってもゲームオーバー',
      '・進むほど、だんだん速くなるよ',
      '',
      `報酬：${DASH_REWARD.metersPerCoin}mごとに1コイン`,
    ].join('\n');
    const t = this.add.text(W / 2, H / 2 - 30, text, { fontFamily: UI_FONT, fontSize: '28px', fontStyle: '800', color: INK, lineSpacing: 10 }).setOrigin(0.5);
    const close = this.button(W / 2, H / 2 + 310, '  とじる  ', '#ffd23a', INK, 36);
    close.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      audio.se('back');
      box.destroy();
    });
    box.add([dim, panel, t, close]);
  }

  // ---------------- プレイ ----------------

  private startRun(): void {
    this.s = newDash(newSeed());
    this.runId = `dash-${Date.now().toString(36)}-${newSeed().toString(36)}`;
    this.phase = 'run';
    audio.playBgm('main');
  }

  private pause(): void {
    this.phase = 'paused';
    const box = this.add.container(0, 0).setDepth(30);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
    const t = this.add.text(W / 2, 440, 'PAUSE', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '110px', color: '#ffd23a', stroke: INK, strokeThickness: 16 }).setOrigin(0.5);
    const go = this.button(W / 2, 660, '  つづける  ', '#ffd23a', INK, 40);
    const quit = this.button(W / 2, 800, '  やめる  ', '#8a35e0', '#ffffff', 34);
    box.add([dim, t, go, quit]);
    go.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      audio.se('select');
      box.destroy();
      // 再開してすぐ落ちないよう、少しだけ待ってから
      this.time.delayedCall(250, () => (this.phase = 'run'));
    });
    quit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      box.destroy();
      this.s.over = 'fall';
      this.gameOver();
    });
  }

  private gameOver(): void {
    this.phase = 'over';
    const m = meters(this.s);
    const r = dashReward(m);
    this.record.grant({ runId: this.runId, source: 'dash', coins: r.coins, exp: r.exp });
    const best = this.record.record('dash', m, 0);
    (this.children.getByName('coins') as Phaser.GameObjects.Text | null)?.setText(this.record.coins.toLocaleString());
    audio.se('slam');
    this.cameras.main.shake(200, 0.006);
    this.time.delayedCall(500, () => {
      const box = this.add.container(0, 0).setDepth(30);
      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
      const title = this.add.text(W / 2, 200, 'GAME OVER', { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '96px', color: '#c9c4d6', stroke: INK, strokeThickness: 16 }).setOrigin(0.5);
      const monz = this.textures.exists('cardimg:overMonz') ? this.add.image(W / 2, 420, 'cardimg:overMonz').setScale(0.6) : null;
      const why = this.add.text(W / 2, 575, this.s.over === 'hit' ? 'トゲに当たった！' : '落ちちゃった！', { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: '#ff8a9a' }).setOrigin(0.5);
      canvasTextureOnce(this, 'dash:overpanel', 560, 300, (ctx) => drawPanel(ctx, 560, 300, 96));
      const panel = this.add.image(W / 2, 780, 'dash:overpanel');
      const txt = this.add.text(W / 2, 780, [`走った距離   ${m}m`, `獲得コイン   ${r.coins}`, `獲得EXP   ${r.exp}`].join('\n'), { fontFamily: UI_FONT, fontSize: '36px', fontStyle: '900', color: INK, align: 'center', lineSpacing: 18 }).setOrigin(0.5);
      const note = this.add.text(W / 2, 960, best ? '★ 自己ベスト！' : '', { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffd23a', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);
      const toTitle = this.button(W / 2 - 150, 1080, ' タイトルへ ', '#16101c', '#ffffff', 34);
      const again = this.button(W / 2 + 150, 1080, ' もう一度 ', '#ffd23a', INK, 34);
      box.add([dim, title, why, panel, txt, note, toTitle, again]);
      if (monz) box.add(monz);
      toTitle.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        audio.se('back');
        this.scene.restart();
      });
      again.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        audio.se('next');
        box.destroy();
        this.startRun();
      });
    });
  }

  /** 【仮】足場・危険物・さわっても大丈夫な物を描く(コースの座標 → 画面の座標) */
  private drawWorld(): void {
    const g = this.world;
    const s = this.s;
    g.clear();
    const ox = -s.dist;
    for (const p of s.platforms) {
      const x = p.x + ox;
      if (x > W || x + p.w < 0) continue;
      g.fillStyle(0x3b2f52, 1).fillRect(x, p.y, p.w, H - p.y);
      g.fillStyle(0x6fd0ff, 1).fillRect(x, p.y, p.w, 16);
      g.lineStyle(6, 0x16101c, 1).strokeRect(x, p.y, p.w, H - p.y + 10);
    }
    for (const t of s.things) {
      const x = t.x + ox;
      if (x > W || x + t.w < 0) continue;
      if (t.kind === 'danger') {
        // 赤いトゲ
        g.fillStyle(0xff3b4f, 1).lineStyle(5, 0x16101c, 1);
        g.beginPath();
        g.moveTo(x, t.y + t.h);
        g.lineTo(x + t.w * 0.25, t.y + 6);
        g.lineTo(x + t.w * 0.5, t.y + t.h * 0.45);
        g.lineTo(x + t.w * 0.75, t.y);
        g.lineTo(x + t.w, t.y + t.h);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
    const runner = this.runner!;
    const bob = s.grounded ? Math.abs(Math.sin(this.t * 14)) * 6 : 0;
    runner.setPosition(DASH.runnerX, s.y - bob).setAngle(s.grounded ? Math.sin(this.t * 14) * 4 : s.vy < 0 ? -10 : 10);
    (this.children.getByName('city') as Phaser.GameObjects.TileSprite | null)?.setTilePosition(s.dist * 0.2, 0);
    this.distText.setText(`${meters(s)}m`);
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    (this.children.getByName('pause') as Phaser.GameObjects.Text | null)?.setVisible(this.phase === 'run' || this.phase === 'paused');
    if (this.phase === 'run') {
      // 細かく分けて進める(速くなっても足場をすり抜けないように)
      const n = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < n && !this.s.over; i++) step(this.s, dt / n);
      if (this.s.over) this.gameOver();
    }
    this.drawWorld();
  }
}
