import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { DASH, dashReward, DASH_REWARD, jump, meters, newDash, step, type DashState, type Platform, type Thing } from '../core/dash';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { newSeed } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { drawPanel } from '../ui/homeArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { homeIconKey } from './HomeScene';

/** 背景の絵 */
export const DASH_BG_KEY = 'dash:bg';
export const DASH_BG_FILE = 'assets/minigame/dash_bg.webp';

/** 足場の絵(左はし・まん中・右はし を横に並べた1枚)。数字は design/minigame/make_dash_assets.py の出力 */
export const DASH_PLAT_KEY = 'dash:platform';
export const DASH_PLAT_FILE = 'assets/minigame/dash_platform.webp';
/** 各部分の幅と、絵の上から「足が乗る面」までの高さ */
const PLAT = { left: 121, mid: 459, right: 123, h: 94, surface: 16 };

/** トゲの絵 */
export const DASH_SPIKE_KEY = 'dash:spike';
export const DASH_SPIKE_FILE = 'assets/minigame/dash_spike.webp';
const SPIKE_SIZE = 76;

/** 走るモンズの絵(企画者の絵)。height: 画面での高さ、ox/oy: 足元の位置(絵の幅・高さに対する割合) */
export const DASH_RUN_KEY = 'dash:run';
export const DASH_RUN_FILE = 'assets/minigame/dash_run.webp';
export const DASH_JUMP_KEY = 'dash:jump';
export const DASH_JUMP_FILE = 'assets/minigame/dash_jump.webp';
const POSES = {
  run: { key: DASH_RUN_KEY, height: 100, ox: 0.6, oy: 0.96 },
  jump: { key: DASH_JUMP_KEY, height: 112, ox: 0.6, oy: 0.96 },
};

/** タイトルのロゴ(企画者の絵) */
export const DASH_LOGO_KEY = 'dash:logo';
export const DASH_LOGO_FILE = 'assets/minigame/dash_logo.webp';

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
  private runner?: Phaser.GameObjects.Image;
  private pose: keyof typeof POSES | '' = '';
  private distText!: Phaser.GameObjects.Text;
  private t = 0;
  private onHide?: () => void;
  private spikeViews = new Map<Thing, Phaser.GameObjects.Image>();
  private platViews = new Map<Platform, { img: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle; dx: number; dy?: number }[]>();

  constructor() {
    super('Dash');
  }

  preload(): void {
    preloadPacks(this, ['card', 'home', 'dash']);
  }

  create(): void {
    this.record = new LifeRecord(loadLife());
    this.phase = 'ready';
    // 背景(企画者の絵)。元の絵と左右反転した絵を並べた1枚を、横にくり返して流す
    const bg = this.add.tileSprite(0, 0, W, H, DASH_BG_KEY).setOrigin(0, 0).setName('city');
    bg.setTileScale(H / bg.texture.getSourceImage().height);
    const pt = this.textures.get(DASH_PLAT_KEY);
    if (!pt.has('left')) {
      pt.add('left', 0, 0, 0, PLAT.left, PLAT.h);
      pt.add('mid', 0, PLAT.left + 4, 0, PLAT.mid, PLAT.h);
      pt.add('right', 0, PLAT.left + PLAT.mid + 8, 0, PLAT.right, PLAT.h);
    }
    this.platViews = new Map();
    this.pose = '';
    this.spikeViews = new Map();
    this.runner = this.add.image(DASH.runnerX, 900, DASH_RUN_KEY).setDepth(3);
    this.setPose('run');

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
    audio.playBgm('dash');
  }

  // ---------------- タイトル ----------------

  private showTitle(): void {
    this.phase = 'ready';
    const box = this.add.container(0, 0).setDepth(20);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.35).setOrigin(0, 0).setInteractive();
    const logo = this.add.image(W / 2, 290, DASH_LOGO_KEY);
    const sub = this.add.text(W / 2, 480, 'ダッシュモンズ', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
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
      '・トゲに当たってもゲームオーバー',
      '  （はねるトゲは、下をくぐるか跳び越える）',
      '・マグマの足場をふんでもゲームオーバー',
      '・進むほど、だんだん速くなるよ',
      '',
      `報酬：${DASH_REWARD.metersPerCoin}mごとに1コイン`,
      `経験値：${DASH_REWARD.expFrom}mで1、そこから${DASH_REWARD.metersPerExp}mごとに1`,
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
    audio.playBgm('dash');
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
      const why = this.add.text(W / 2, 575, this.s.over === 'hit' ? 'トゲに当たった！' : this.s.over === 'magma' ? 'マグマをふんだ！' : '落ちちゃった！', { fontFamily: UI_FONT, fontSize: '32px', fontStyle: '900', color: '#ff8a9a' }).setOrigin(0.5);
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
  /** 走る/ジャンプの絵に切りかえる。足元が足場の面にくるように合わせる */
  private setPose(name: keyof typeof POSES): void {
    if (this.pose === name || !this.runner) return;
    this.pose = name;
    const p = POSES[name];
    this.runner.setTexture(p.key).setOrigin(p.ox, p.oy);
    this.runner.setScale(p.height / this.runner.height);
  }

  /**
   * 足場1つ分の絵を作る。左はし・まん中(くり返し)・右はし を並べる。短い足場は はしを半分ずつ使う。
   * 【仮】マグマの足場: 同じ絵を赤くして、上の面に光るマグマを重ねる(企画者の絵が来たら差しかえる)
   */
  private buildPlatform(width: number, magma = false): { img: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle; dx: number; dy?: number }[] {
    const parts = this.platformPieces(width);
    if (!magma) return parts;
    // 低い所にあるので、まわりの足場の後ろに描く
    parts.forEach((v) => (v.img as Phaser.GameObjects.Image).setTint(0xff7a4a).setDepth(0.5));
    const w = Math.round(width);
    const lava = this.add.rectangle(0, 0, w - 16, 22, 0xff4a10).setOrigin(0, 0).setDepth(0.5);
    const glow = this.add.rectangle(0, 0, w - 24, 8, 0xffd23a).setOrigin(0, 0).setDepth(0.5);
    this.tweens.add({ targets: glow, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 });
    return [...parts, { img: lava, dx: 8, dy: 3 }, { img: glow, dx: 12, dy: 6 }];
  }

  private platformPieces(width: number): { img: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle; dx: number; dy?: number }[] {
    const w = Math.round(width);
    const { left, mid, right } = PLAT;
    const piece = (frame: string, dx: number, cropX: number, cropW: number) => {
      const img = this.add.image(0, 0, DASH_PLAT_KEY, frame).setOrigin(0, 0).setDepth(1).setCrop(cropX, 0, cropW, PLAT.h);
      return { img, dx };
    };
    if (w < left + right) {
      const half = Math.floor(w / 2);
      return [piece('left', 0, 0, half), piece('right', w - right, right - (w - half), w - half)];
    }
    const out = [piece('left', 0, 0, left)];
    for (let dx = left; dx < w - right; dx += mid) out.push(piece('mid', dx, 0, Math.min(mid, w - right - dx)));
    out.push(piece('right', w - right, 0, right));
    return out;
  }

  private drawWorld(): void {
    const s = this.s;
    const ox = -s.dist;
    const alive = new Set(s.platforms);
    for (const [p, view] of this.platViews) {
      if (alive.has(p)) continue;
      view.forEach((v) => {
        this.tweens.killTweensOf(v.img);
        v.img.destroy();
      });
      this.platViews.delete(p);
    }
    for (const p of s.platforms) {
      const x = p.x + ox;
      const visible = x < W && x + p.w > 0;
      let view = this.platViews.get(p);
      if (!view) {
        if (!visible) continue;
        view = this.buildPlatform(p.w, p.magma);
        this.platViews.set(p, view);
      }
      for (const v of view) v.img.setPosition(Math.round(x + v.dx), p.y - PLAT.surface + (v.dy ?? 0)).setVisible(visible);
    }
    const things = new Set(s.things);
    for (const [t, img] of this.spikeViews) {
      if (things.has(t)) continue;
      img.destroy();
      this.spikeViews.delete(t);
    }
    for (const t of s.things) {
      if (t.kind !== 'danger') continue;
      const x = t.x + ox;
      const visible = x < W && x + t.w > 0;
      let img = this.spikeViews.get(t);
      if (!img) {
        if (!visible) continue;
        // 当たり判定より少し大きく描く(とがった先は当たらない)
        img = this.add.image(0, 0, DASH_SPIKE_KEY).setDisplaySize(SPIKE_SIZE, SPIKE_SIZE).setDepth(2);
        this.spikeViews.set(t, img);
      }
      img.setPosition(Math.round(x + t.w / 2), t.y + t.h - SPIKE_SIZE / 2 + 6).setVisible(visible);
      // はねるトゲは、転がっているように回す
      if (t.bounce) img.setAngle(-(s.time - t.bounce.t0) * 240);
    }
    const runner = this.runner!;
    const bob = s.grounded ? Math.abs(Math.sin(this.t * 14)) * 6 : 0;
    this.setPose(s.grounded ? 'run' : 'jump');
    runner.setPosition(DASH.runnerX, s.y - bob).setAngle(s.grounded ? Math.sin(this.t * 14) * 3 : s.vy < 0 ? -4 : 4);
    const bg = this.children.getByName('city') as Phaser.GameObjects.TileSprite | null;
    bg?.setTilePosition((s.dist * 0.2) / bg.tileScaleX, 0);
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
