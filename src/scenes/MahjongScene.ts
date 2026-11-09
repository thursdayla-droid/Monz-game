import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { cpuReact, cpuTurn, makeCpu, type Cpu } from '../core/mahjong/ai';
import { newGame, nextHanchan, nextRound, type GameState } from '../core/mahjong/game';
import { applyDamage, damageOf, PLAYER_SEAT, stageResult, umaDamage, type Damage, type Hp } from '../core/mahjong/rpg';
import { doDiscard, doKan, doKyuushu, doTsumo, doraIndicators, reactOptions, resolveReactions, seatWind, turnOptions, uraIndicators, type Reaction, type RoundResult, type RoundState } from '../core/mahjong/round';
import type { Meld } from '../core/mahjong/score';
import { EAST, isRed, type Kind, kindOf, type Tile } from '../core/mahjong/tiles';
import { randomSeed } from '../core/rng';
import { stageAt, type StageInfo } from '../core/mahjong/stages';
import { UI_FONT } from '../ui/paint';
import { fillSize, viewRatio, watchViewport } from '../ui/viewport';

/**
 * 麻雀RPG の 対局画面(2026-11-08 企画者 仕様書 Ver.1.0。docs/MAHJONG.md の 3段目)。
 * 横画面・全画面。まん中に 卓、下に 自分の 手牌、上・左・右に CPU。牌の 絵は 企画者(ChatGPT)の 絵。
 * 席 0 = あなた・1 = 右(子分)・2 = 上(ボス)・3 = 左(子分)。ボスの 席は【仮】
 */
const H = 720;
const BOSS = 2;
const SEAT_NAME = ['あなた', '子分A', 'ボス', '子分B'];
const START_HP = 30000;
/** CPU の 強さ(STAGE 1)【仮】 */
const LEVELS: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 2];
/**
 * 左右の あいた 所に 出す キャラ(2026-11-08 企画者「左右 余ってる 所に 敵3匹と 勇者が 戦ってる 姿」)。
 * 絵は すべて 企画者の 絵(主人公＝勇者・ボス・子分2匹。design/mahjong/chars/)。
 */
/** 敵の 絵(2026-11-08 企画者が ChatGPT で 作った オオカミ。左を 向いている)。1 = 子分A(黄色)・2 = ボス・3 = 子分B(青紫) */
const ENEMY_ART: Record<number, string> = { 1: 'minion_a', 2: 'boss', 3: 'minion_b' };
const CHAR_FILES = ['hero', 'boss', 'minion_a', 'minion_b', 'shop'].flatMap((n) => [n, `${n}_face`]);
/** オートパス(鳴き・明槓を 聞かない。ロンは 聞く)。企画者 2026-11-08「オートパスが ほしい」 */
let autoPass = false;
/** CPU が 1手 打つ 間(ミリ秒) */
const CPU_DELAY = 420;

const TILE_FILES = [...['m', 'p', 's'].flatMap((s) => Array.from({ length: 9 }, (_, i) => `${s}${i + 1}`)), ...Array.from({ length: 7 }, (_, i) => `z${i + 1}`), 'r5m', 'r5p', 'r5s', 'back'];
const texOf = (t: Tile): string => {
  const k = kindOf(t);
  if (isRed(t)) return `mj:r5${'mps'[Math.floor(k / 9)]}`;
  return kindTex(k);
};
const kindTex = (k: Kind): string => (k < 27 ? `mj:${'mps'[Math.floor(k / 9)]}${(k % 9) + 1}` : `mj:z${k - 26}`);

type Wait = { kind: 'turn' } | { kind: 'react' } | { kind: 'result' } | { kind: 'none' };

export class MahjongScene extends Phaser.Scene {
  private W = 1280;
  private mj!: GameState;
  private cpus: Cpu[] = [];
  private hp: Hp = { player: START_HP, playerMax: START_HP, enemy: START_HP, enemyMax: START_HP };
  private layer!: Phaser.GameObjects.Container;
  private ui!: Phaser.GameObjects.Container;
  private wait: Wait = { kind: 'none' };
  private selected: Tile | null = null;
  /** リーチの 牌を えらんでいる */
  private riichiMode = false;
  private timer?: Phaser.Time.TimerEvent;
  /** 配牌の 途中(席ごとの 配った 枚数)。null = 配り おわり */
  private dealt: number[] | null = null;
  /** 配った 局(局が 変わったら また 配る) */
  private dealtRound: RoundState | null = null;
  /** 配っている 間の 自分の 牌の 並び(配った 順。おわると 並べかえ) */
  private dealOrder: Tile[] = [];
  /** もう 見た 局の できごとの 数(リーチの 声を 1回だけ 出す ため) */
  private seenEv = 0;
  private finished: 'clear' | 'lose' | null = null;
  private leaving = false;
  /** 左右の キャラ(席ごと。0 = 勇者) */
  private actors: Phaser.GameObjects.Container[] = [];
  /** 卓の まん中・左右の 帯の はば */
  private geo = { cx: 640, cy: 300, sp: 230, tw: 820 };

  /** 今の ステージ(MahjongQuest から) */
  private stageNo = 0;
  private lap = 1;
  private st!: StageInfo;

  constructor() {
    super('Mahjong');
  }

  init(data: { stage?: number; lap?: number }): void {
    this.stageNo = data?.stage ?? 0;
    this.lap = data?.lap ?? 1;
    this.st = stageAt(this.stageNo, this.lap);
  }

  preload(): void {
    for (const f of TILE_FILES) if (!this.textures.exists(`mj:${f}`)) this.load.image(`mj:${f}`, assetUrl(`assets/mahjong/${f}.webp`));
    for (const n of CHAR_FILES) if (!this.textures.exists(`mjc:${n}`)) this.load.image(`mjc:${n}`, assetUrl(`assets/mahjong/chars/${n}.webp`));
  }

  create(): void {
    this.leaving = false;
    this.finished = null;
    this.layout();
    watchViewport(this, () => {
      this.layout();
      this.placeActors();
      this.redraw();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(720, 1280));
    this.cameras.main.setBackgroundColor('#5a2fb0');
    this.bg = this.add.graphics().setDepth(-10);
    this.layout();
    this.layer = this.add.container(0, 0);
    this.buildActors();
    this.ui = this.add.container(0, 0).setDepth(50);
    const seed = randomSeed();
    this.mj = newGame(seed, 0);
    const lv = [LEVELS[0], ...this.st.levels];
    this.cpus = [0, 1, 2, 3].map((i) => makeCpu(lv[i], seed + i * 977));
    this.hp = { player: START_HP, playerMax: START_HP, enemy: this.st.enemyHp, enemyMax: this.st.enemyHp };
    audio.playBgm('battle');
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.step();
  }

  /** 画面の 大きさ(横画面。横は スマホの 形まで のばす) */
  private bg!: Phaser.GameObjects.Graphics;

  private layout(): void {
    this.W = Math.max(1280, fillSize(this, { w: 1280, h: H }, { minRatio: 1280 / H, maxRatio: 2.2 }).w);
    this.scale.setGameSize(this.W, H);
    this.cameras.main.setSize(this.W, H);
    const tw = Math.min(980, Math.max(820, this.W - 480));
    this.geo = { cx: this.W / 2, cy: 386, tw, sp: (this.W - tw) / 2 };
    // 背景(2026-11-08 企画者の イメージの 絵: こい 紫の 街・オレンジと 紫の ななめの 筋・金の 粒)
    const g = this.bg?.clear();
    if (!g) return;
    g.fillGradientStyle(0x2a0f52, 0x2a0f52, 0x6a2cc0, 0x6a2cc0, 1).fillRect(0, 0, this.W, H);
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 14; i++) {
      const x = rnd(i + 40) * this.W;
      const y = rnd(i + 70) * H;
      const len = 120 + rnd(i + 5) * 260;
      g.fillStyle(i % 2 ? 0xff8a3a : 0xb04aff, 0.18 + rnd(i) * 0.2);
      g.fillTriangle(x, y, x + len, y - len * 0.45, x + len + 26, y - len * 0.45 + 10);
    }
    for (let i = 0; i < 50; i++) g.fillStyle(i % 3 ? 0xffd23a : 0xffffff, 0.15 + rnd(i + 7) * 0.25).fillCircle(rnd(i) * this.W, rnd(i + 99) * H, 1.5 + rnd(i + 3) * 4);
  }

  // ---------------- キャラ(敵3人は 上に 横一列・自分は 左下。企画者の イメージの 絵) ----------------

  private buildActors(): void {
    this.actors.forEach((a) => a.destroy());
    this.actors = [0, 1, 2, 3].map((seat) => {
      // 2026-11-09 企画者「主人公 これに しよう」→ 主人公は 企画者の 勇者の 絵(design/mahjong/chars/hero.png。正面向き)
      const art = seat === 0 ? 'hero' : ENEMY_ART[seat];
      const faceKey = `mjc:${art}_face`;
      const bodyKey = `mjc:${art}`;
      const big = seat === BOSS || seat === 0;
      const r = seat === BOSS ? 46 : big ? 56 : 50;
      const c = this.add.container(0, 0).setDepth(5);
      const frame = this.add.graphics();
      const col = seat === 0 ? 0x3ad070 : seat === BOSS ? 0xff4a6a : 0x9b5cff;
      frame.fillStyle(0x16101c, 0.92).fillRoundedRect(-r, -r, r * 2, r * 2, 18);
      frame.lineStyle(5, col, 1).strokeRoundedRect(-r, -r, r * 2, r * 2, 18);
      c.add(frame);
      if (this.textures.exists(faceKey)) {
        const img = this.add.image(0, 2, faceKey);
        img.setScale((r * 1.85) / Math.max(img.width, img.height));
        c.add(img);
      } else c.add(this.add.rectangle(0, 0, 1, 1, 0, 0));
      // 名前の 札
      const name = seat === 0 ? 'プレイヤー' : seat === BOSS ? 'ボス' : '子分';
      // ボスは 下に 伏せた 牌が あるので 名前は 顔の 中の 下に
      const tag = this.text(0, seat === BOSS ? r - 8 : r + 14, name, big ? 18 : 15, '#ffffff', 0);
      tag.setBackgroundColor(seat === 0 ? '#1f8a4a' : seat === BOSS ? '#d0304a' : '#5a34b0').setPadding(10, 3, 10, 3);
      c.add(tag);
      // ボスに 王冠
      if (seat === BOSS) {
        const cr = this.add.graphics();
        cr.fillStyle(0xffd23a, 1).lineStyle(3, 0x16101c, 1);
        const pts = [-26, 0, -26, -22, -13, -8, 0, -28, 13, -8, 26, -22, 26, 0].map((v, i) => (i % 2 ? v * 0.7 - r + 10 : v * 0.8));
        cr.beginPath();
        cr.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) cr.lineTo(pts[i], pts[i + 1]);
        cr.closePath();
        cr.fillPath();
        cr.strokePath();
        c.add(cr);
      }
      c.setData('face', faceKey).setData('body', bodyKey).setData('left', seat !== 0);
      this.tweens.add({ targets: c, scale: { from: 1, to: 1.04 }, duration: 900 + seat * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return c;
    });
    this.placeActors();
  }

  /** 敵: ボスは 上の まん中・子分は その 左右(それぞれの 席の 側)。自分は 左下 */
  private placeActors(): void {
    const { cx, sp } = this.geo;
    const pos: [number, number][] = [
      [Math.max(80, sp / 2), 398],
      // 2026-11-09 企画者「ボスの スペース 狭い。子分は 左右で いい」→ 子分は 左右の あいた 所・ボスだけ 上の まん中
      [this.W - Math.max(90, sp / 2), 220],
      [cx, 62],
      [Math.max(80, sp / 2), 220],
    ];
    this.actors.forEach((a, i) => a.setPosition(pos[i][0], pos[i][1]).setData('home', pos[i]));
  }

  /** アガった 人が 相手に 体当たり → 相手が ゆれて 赤く 光る */
  private attackAnim(from: number, targets: number[]): void {
    const a = this.actors[from];
    const [hx, hy] = a.getData('home') as [number, number];
    const t0 = this.actors[targets[0]];
    const [tx] = t0.getData('home') as [number, number];
    const [, ty] = t0.getData('home') as [number, number];
    this.tweens.add({ targets: a, x: hx + (tx - hx) * 0.25, y: hy + (ty - hy) * 0.25, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
    this.time.delayedCall(170, () => {
      for (const t of targets) {
        const v = this.actors[t];
        const [vx] = v.getData('home') as [number, number];
        this.tweens.add({ targets: v, x: { from: vx - 12, to: vx }, duration: 60, repeat: 4 });
        const img = v.list[1] as Phaser.GameObjects.Image | undefined;
        img?.setTint(0xff4a6a);
        this.time.delayedCall(260, () => img?.clearTint());
      }
    });
  }

  private get round(): RoundState {
    return this.mj.round;
  }

  // ---------------- 流れ ----------------

  /** 今の 状態を 見て 次に 進む(CPU は 少し 待ってから) */
  private step(): void {
    this.timer?.remove();
    this.selected = null;
    this.riichiMode = false;
    const s = this.round;
    if (this.finished) return;
    // 局の はじめは 高速で 配牌(2026-11-09 企画者「最初 高速で 配牌して ほしい」)
    // だれかが リーチしたら 顔と「リーチ！」(2026-11-09 企画者「いつ 敵が リーチしたのか 分からない」)
    if (this.dealtRound === s) {
      const fresh = s.events.slice(this.seenEv);
      this.seenEv = s.events.length;
      const rc = fresh.find((e) => e.type === 'discard' && e.riichi) as { seat: number } | undefined;
      if (rc && s.phase !== 'end') {
        this.wait = { kind: 'none' };
        this.redraw();
        this.cutIn(rc.seat, 'リーチ！', () => this.step(), 900);
        return;
      }
    }
    if (this.dealtRound !== s && s.phase === 'turn') {
      this.dealtRound = s;
      this.seenEv = 0;
      this.playDeal(() => this.step());
      return;
    }
    if (s.phase === 'end') {
      this.wait = { kind: 'result' };
      this.redraw();
      this.showResult(s.result!);
      return;
    }
    if (s.phase === 'turn') {
      if (s.turn === PLAYER_SEAT) {
        this.wait = { kind: 'turn' };
        // リーチ中は ツモ・カン が なければ 自動で ツモ切り
        const o = turnOptions(s);
        this.redraw();
        if (s.players[0].riichi && !o.tsumo && !o.ankan.length) this.later(600, () => this.playerDiscard(o.discards[0]));
        return;
      }
      this.wait = { kind: 'none' };
      this.redraw();
      this.later(CPU_DELAY, () => {
        cpuTurn(s, this.cpus[s.turn]);
        if (s.phase === 'react' || s.phase === 'end') audio.se('tap', { pitch: 0.9 });
        this.step();
      });
      return;
    }
    // 捨て牌・加槓に 対する 返事
    const mine = reactOptions(s, PLAYER_SEAT);
    if (mine.ron || (!autoPass && (mine.pon.length || mine.chi.length || mine.minkan.length))) {
      this.wait = { kind: 'react' };
      this.redraw();
      return;
    }
    this.wait = { kind: 'none' };
    this.redraw();
    this.later(120, () => this.resolve(null));
  }

  /** 親から 順に 4枚ずつ 3回 → 1枚ずつ(約1.2秒)。おわると 自分の 牌を 並べかえる */
  private playDeal(done: () => void): void {
    const s = this.round;
    const dealer = s.cfg.dealer;
    const chunks: [number, number][] = [];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) chunks.push([(dealer + i) % 4, 4]);
    for (let i = 0; i < 4; i++) chunks.push([(dealer + i) % 4, 1]);
    const mine = s.players[0].hand.filter((t) => !(s.turn === 0 && t === s.drawn));
    // 配る 順は ばらばら(種から 決める)
    this.dealOrder = [...mine].sort((a, b) => ((a * 2654435761) % 997) - ((b * 2654435761) % 997));
    this.dealt = [0, 0, 0, 0];
    this.wait = { kind: 'none' };
    this.redraw();
    let i = 0;
    const tick = () => {
      if (i < chunks.length) {
        const [seat, n] = chunks[i++];
        this.dealt![seat] += n;
        audio.se('tap', { pitch: 1.3 + (i % 4) * 0.08 });
        this.redraw();
        this.later(70, tick);
        return;
      }
      // 並べかえて おわり
      this.dealt = null;
      audio.se('plop');
      this.redraw();
      this.later(250, done);
    };
    this.later(200, tick);
  }

  private later(ms: number, f: () => void): void {
    this.timer = this.time.delayedCall(ms, f);
  }

  private resolve(mine: Reaction): void {
    const s = this.round;
    const choices = [0, 1, 2, 3].map((i) => (i === PLAYER_SEAT ? mine : cpuReact(s, i, this.cpus[i])));
    const before = s.events.length;
    resolveReactions(s, choices);
    if (s.events.slice(before).some((e) => e.type === 'call')) audio.se('slam');
    this.step();
  }

  private playerDiscard(t: Tile, riichi = false): void {
    if (this.wait.kind !== 'turn') return;
    doDiscard(this.round, t, riichi);
    audio.se(riichi ? 'mcSpecial' : 'tap');
    this.step();
  }

  // ---------------- 描く ----------------

  private redraw(): void {
    this.layer.removeAll(true);
    this.ui.removeAll(true);
    const { cx, cy, tw } = this.geo;
    // 卓(明るい 紫・金の ふち)
    const g = this.add.graphics();
    const top = 118;
    const bot = 602;
    g.fillStyle(0x0b0614, 0.45).fillRoundedRect(cx - tw / 2 + 6, top + 8, tw, bot - top, 34);
    g.fillGradientStyle(0x4a2290, 0x4a2290, 0x2c1260, 0x2c1260, 1).fillRoundedRect(cx - tw / 2, top, tw, bot - top, 34);
    g.lineStyle(7, 0xffb03a, 1).strokeRoundedRect(cx - tw / 2, top, tw, bot - top, 34);
    g.lineStyle(2, 0xffd23a, 0.5).strokeRoundedRect(cx - tw / 2 + 12, top + 12, tw - 24, bot - top - 24, 26);
    g.fillStyle(0x16101c, 0.95).fillRoundedRect(cx - 98, cy - 76, 196, 152, 18);
    g.lineStyle(4, 0xff8a3a, 1).strokeRoundedRect(cx - 98, cy - 76, 196, 152, 18);
    this.layer.add(g);
    this.drawCenter(cx, cy);
    // 河・鳴き・ほかの 人の 手
    for (let seat = 0; seat < 4; seat++) this.drawSeat(seat, cx, cy);
    this.drawHand();
    this.drawHud();
    this.drawButtons();
    if (viewRatio(this) < 1) this.drawTurnHint();
  }

  private tile(x: number, y: number, tex: string, w: number, rot = 0): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, tex).setRotation(rot);
    img.setScale(w / img.width);
    return img;
  }

  private text(x: number, y: number, str: string, size: number, color = '#ffffff', stroke = 0): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center' }).setOrigin(0.5);
  }

  /** まん中: 場・本場・残り枚数・ドラ・4人の 点数 */
  private drawCenter(cx: number, cy: number): void {
    const s = this.round;
    const g = this.mj;
    const wind = '東南西北'[g.roundWind - EAST] ?? '東';
    this.layer.add(this.text(cx, cy - 56, `${wind}${g.kyoku + 1}局  ${g.honba}本場`, 21, '#ffd23a'));
    this.layer.add(this.text(cx, cy - 34, `のこり ${s.live.length}  リーチ棒 ${s.cfg.sticks}`, 14, '#e8dcf4'));
    const ind = doraIndicators(s);
    this.layer.add(this.text(cx - 70, cy - 8, 'ドラ', 14, '#ffb03a'));
    ind.forEach((k, i) => this.layer.add(this.tile(cx - 40 + i * 27, cy - 8, kindTex(k), 23)));
    // 4人の 点数(それぞれの 席の 向きに 置く。手番の 人は 黄色)
    const pos = [
      [cx, cy + 62],
      [cx + 52, cy + 41],
      [cx, cy + 20],
      [cx - 52, cy + 41],
    ];
    for (let i = 0; i < 4; i++) {
      const w = '東南西北'[seatWind(s, i) - EAST];
      const [x, y] = pos[i];
      this.layer.add(this.text(x, y, `${w} ${g.points[i]}`, 14, i === s.turn ? '#ffd23a' : '#ffffff'));
    }
  }

  /** 席ごとの 河(捨て牌)・鳴いた 牌・(CPU は)伏せた 手 */
  private drawSeat(seat: number, cx: number, cy: number): void {
    const s = this.round;
    const p = s.players[seat];
    const rot = [0, -Math.PI / 2, Math.PI, Math.PI / 2][seat];
    const c = this.add.container(cx, cy).setRotation(rot);
    this.layer.add(c);
    // 河: 6枚ずつ
    const rw = 32;
    const rh = rw * (172 / 132);
    p.discards.forEach((d, i) => {
      const row = Math.min(3, Math.floor(i / 6));
      const col = i - row * 6 + (row === 3 ? 6 * 0 : 0);
      const x = -3 * rw + rw / 2 + (row === 3 ? i - 18 : col) * rw;
      const y = (seat % 2 === 0 ? 80 : 104) + row * rh + rh / 2;
      const img = this.tile(x, y, texOf(d.tile), rw, d.riichi ? Math.PI / 2 : 0);
      if (d.called) img.setAlpha(0.35);
      c.add(img);
      // さいごに 捨てた 牌に 印
      if (s.lastTile && s.lastTile.seat === seat && i === p.discards.length - 1 && s.phase !== 'turn') {
        const m = this.add.rectangle(x, y, rw + 4, rh + 4).setStrokeStyle(3, 0xff4a6a);
        c.add(m);
      }
    });
    if (seat === PLAYER_SEAT) return;
    // 伏せた 手(CPU)
    // 2026-11-08 企画者「ボスの 牌 今 出てないから 表示して ほしい」→ ボスも 伏せた 手を 出す(顔の すぐ 下)
    // 2026-11-09 企画者「ボスの 机が 狭い」→ ボスの 前を 広く(卓を 上へ・牌を 子分と 同じ 大きさ)
    const bw = 24;
    const dy = seat === BOSS ? 238 : 300;
    const n = this.dealt ? Math.min(this.dealt[seat], 13) : p.hand.length;
    const full = this.dealt ? 13 : n;
    for (let i = 0; i < n; i++) c.add(this.tile(-((full - 1) * bw) / 2 + i * bw, dy, 'mj:back', bw - 1));
    // 鳴いた 牌(伏せた 手の 横)
    this.drawMelds(c, p.melds, ((n - 1) * bw) / 2 + 16, dy, seat === BOSS ? 24 : 26);
    // 名前・リーチ
    if (p.riichi) {
      const nameT = this.text(-((n - 1) * bw) / 2 - 50, dy, 'リーチ', 18, '#ffd23a', 5);
      nameT.setRotation(-rot);
      c.add(nameT);
    }
  }

  private drawMelds(c: Phaser.GameObjects.Container, melds: Meld[], x0: number, y: number, w: number): void {
    let x = x0;
    for (const m of melds) {
      const tiles = [...m.tiles];
      tiles.forEach((t, i) => {
        const hidden = m.type === 'ankan' && (i === 0 || i === 3);
        const isCalled = t === m.called;
        const img = this.tile(x + w / 2, y, hidden ? 'mj:back' : texOf(t), w, isCalled ? Math.PI / 2 : 0);
        c.add(img);
        x += isCalled ? w * 1.3 : w;
      });
      x += 8;
    }
  }

  /** 自分の 手牌(下)。タップで えらぶ → もう一度 タップで 捨てる */
  private drawHand(): void {
    const s = this.round;
    const p = s.players[0];
    const W = this.W;
    // 2026-11-08 企画者「牌が 小さくて 押しづらい」→ 画面の はばに 合わせて できるだけ 大きく(最大 96)
    const meldTile = 46;
    const meldW0 = p.melds.reduce((a, m) => a + m.tiles.length * meldTile + 14, 0);
    const tw = Math.min(96, Math.floor((W - 30 - meldW0 - 20) / 14.4));
    const th = tw * (172 / 132);
    const drawn = s.turn === 0 && s.drawn !== null && !this.dealt ? s.drawn : null;
    let hand = drawn !== null ? p.hand.filter((t) => t !== drawn) : [...p.hand];
    hand.sort((a, b) => a - b);
    // 配っている 間は 配った 分だけ(配った 順のまま)
    if (this.dealt) hand = this.dealOrder.slice(0, this.dealt[0]);
    const all = drawn !== null ? [...hand, drawn] : hand;
    const meldW = meldW0;
    const total = all.length * tw + (drawn !== null ? 14 : 0);
    const x0 = Math.min(W / 2 - total / 2 - meldW / 2, W - 30 - meldW - total);
    const y = H - th / 2 - 6;
    const o = this.wait.kind === 'turn' ? turnOptions(s) : null;
    const can = new Set(this.riichiMode ? o?.riichi ?? [] : o?.discards ?? []);
    all.forEach((t, i) => {
      const x = x0 + i * tw + tw / 2 + (t === drawn && i === all.length - 1 ? 14 : 0);
      const up = this.selected === t ? -24 : 0;
      const img = this.tile(x, y + up, texOf(t), tw - 2);
      if (o && !can.has(t)) img.setTint(0x777788);
      if (o && can.has(t)) {
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.tapTile(t));
      }
      this.layer.add(img);
    });
    // 鳴いた 牌
    const mc = this.add.container(0, 0);
    this.layer.add(mc);
    this.drawMelds(mc, p.melds, W - 20 - meldW, y + 10, meldTile);
    if (p.riichi) this.layer.add(this.text(x0 + 30, y - th / 2 - 18, 'リーチ中', 18, '#ffd23a', 4));
  }

  private tapTile(t: Tile): void {
    if (this.wait.kind !== 'turn') return;
    if (this.selected === t) {
      this.playerDiscard(t, this.riichiMode);
      return;
    }
    this.selected = t;
    audio.se('tap', { pitch: 1.2 });
    this.redraw();
  }

  /** HP バー(左の 帯: あなた・右の 帯: 敵チーム)・やめる・オートパス */
  private drawHud(): void {
    const { sp } = this.geo;
    const W = this.W;
    const bar = (x: number, y: number, w: number, label: string, v: number, max: number, color: number) => {
      const g = this.add.graphics();
      g.fillStyle(0x16101c, 0.85).fillRoundedRect(x - 8, y - 32, w + 16, 62, 14);
      g.fillStyle(0x3a2a4a, 1).fillRoundedRect(x, y, w, 20, 10);
      g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(0, (w * v) / max), 20, 10);
      g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x, y, w, 20, 10);
      this.ui.add(g);
      this.ui.add(this.text(x + w / 2, y - 15, `${label}  ${v.toLocaleString()}`, 16, '#ffffff'));
    };
    // 敵チームの HP は 上の まん中に 大きく・自分の HP は 左下の 顔の 下
    // 2026-11-09 企画者「敵の HP 上だと 窮屈だから 右上の 空いてる とこで いい」
    const ew = Math.max(190, Math.min(280, sp - 30));
    bar(W - Math.max(110, sp / 2) - ew / 2, 44, ew, '敵チーム HP', this.hp.enemy, this.hp.enemyMax, 0xff4a6a);
    const pw = Math.max(170, Math.min(240, sp - 30));
    // 2026-11-09 企画者「左の 牌が 主人公の 体力ゲージと 少し 被ってる」→ 上へ
    bar(Math.max(80, sp / 2) - pw / 2, 530, pw, 'HP', this.hp.player, this.hp.playerMax, 0x3ad070);
    // やめる(左上)
    const back = this.text(70, 28, '◀ やめる', 17, '#ffffff', 0).setInteractive({ useHandCursor: true });
    back.setBackgroundColor('#16101caa').setPadding(12, 6, 12, 6);
    back.on('pointerup', () => this.quit());
    this.ui.add(back);
    // オートパス(鳴きを 聞かない。ロンは 聞く)
    const ap = this.text(W - Math.max(90, sp / 2), 470, `オートパス ${autoPass ? 'ON' : 'OFF'}`, 18, autoPass ? '#16101c' : '#ffffff').setInteractive({ useHandCursor: true });
    ap.setBackgroundColor(autoPass ? '#ffd23a' : '#16101caa').setPadding(14, 8, 14, 8);
    ap.on('pointerdown', () => {
      autoPass = !autoPass;
      audio.se('select');
      this.redrawHudOnly();
      if (autoPass && this.wait.kind === 'react' && !reactOptions(this.round, PLAYER_SEAT).ron) this.resolve(null);
    });
    this.ui.add(ap);
    // リーチ中の 人の 顔に「リーチ」の 札
    this.round.players.forEach((p, seat) => {
      if (!p.riichi) return;
      const a = this.actors[seat];
      if (!a) return;
      const [x, y] = a.getData('home') as [number, number];
      const tag = this.text(x + (x > this.W / 2 ? -82 : 82), y - 20, 'リーチ', 20, '#16101c', 0).setBackgroundColor('#ff8a3a').setPadding(10, 3, 10, 3).setAngle(-8);
      this.ui.add(tag);
    });
  }

  private button(x: number, y: number, label: string, color: string, onTap: () => void): void {
    const t = this.text(x, y, label, 26, '#16101c').setInteractive({ useHandCursor: true });
    t.setBackgroundColor(color).setPadding(18, 10, 18, 10);
    t.on('pointerdown', () => {
      audio.se('select');
      onTap();
    });
    this.ui.add(t);
  }

  /** その時に できる ことの ボタン(手牌の 上・右) */
  private drawButtons(): void {
    const s = this.round;
    const list: [string, string, () => void][] = [];
    if (this.wait.kind === 'turn') {
      const o = turnOptions(s);
      if (o.tsumo) list.push(['ツモ', '#ffd23a', () => { doTsumo(s); audio.se('mcThunder'); this.step(); }]);
      if (o.riichi.length && !this.riichiMode) list.push(['リーチ', '#ff8a3a', () => { this.riichiMode = true; this.selected = null; this.redraw(); }]);
      if (this.riichiMode) list.push(['リーチやめ', '#ffffff', () => { this.riichiMode = false; this.redraw(); }]);
      for (const k of [...o.ankan, ...o.kakan]) list.push([`カン`, '#9fe0ff', () => { doKan(s, k); audio.se('slam'); this.step(); }]);
      if (o.kyuushu) list.push(['九種九牌', '#c8bcd8', () => { doKyuushu(s); this.step(); }]);
    }
    if (this.wait.kind === 'react') {
      const o = reactOptions(s, PLAYER_SEAT);
      if (o.ron) list.push(['ロン', '#ffd23a', () => { audio.se('mcThunder'); this.resolve({ type: 'ron' }); }]);
      if (o.minkan.length) list.push(['カン', '#9fe0ff', () => this.resolve({ type: 'minkan', tiles: o.minkan[0] })]);
      if (o.pon.length) list.push(['ポン', '#ff8a3a', () => this.resolve({ type: 'pon', tiles: o.pon[0] })]);
      o.chi.forEach((c, i) => list.push([o.chi.length > 1 ? `チー${i + 1}` : 'チー', '#3ad070', () => this.resolve({ type: 'chi', tiles: c })]));
      list.push(['パス', '#ffffff', () => this.resolve(null)]);
      // チーが いくつか ある 時は、どの 牌で 鳴くかを 小さく 見せる
      const by = H - (Math.min(96, Math.floor((this.W - 50) / 14.4)) * 172) / 132 - 44;
      if (o.chi.length > 1)
        o.chi.forEach((c, i) => {
          const x = this.geo.cx + this.geo.tw / 2 - 240 - i * 110;
          c.forEach((t, j) => this.ui.add(this.tile(x + j * 32, by - 70, texOf(t), 30)));
          this.ui.add(this.text(x + 16, by - 104, `チー${i + 1}`, 15, '#3ad070', 4));
        });
    }
    const by = H - (Math.min(96, Math.floor((this.W - 50) / 14.4)) * 172) / 132 - 44;
    list.forEach(([label, color, f], i) => this.button(this.geo.cx + this.geo.tw / 2 - 80 - i * 140, by, label, color, f));
    if (this.wait.kind === 'turn' && !list.length && !this.round.players[0].riichi && this.selected === null)
      this.ui.add(this.text(this.W / 2, by, '捨てる 牌を 2回 タップ', 17, '#ffffff', 4));
    if (this.riichiMode) this.ui.add(this.text(this.W / 2, by - 40, 'リーチ: 光っている 牌を 2回 タップ', 17, '#ffd23a', 4));
  }

  private drawTurnHint(): void {
    const c = this.add.container(this.W / 2, H / 2);
    c.add(this.add.rectangle(0, 0, 640, 150, 0x16101c, 0.9).setStrokeStyle(4, 0xffd23a));
    c.add(this.text(0, 0, 'スマホを 横にしてね', 44, '#ffd23a'));
    this.ui.add(c);
  }

  // ---------------- 結果 ----------------

  private showResult(r: RoundResult): void {
    const d = damageOf(r, BOSS);
    this.hp = applyDamage(this.hp, d);
    // 2026-11-08 企画者「ロンされたら 敵の 顔・自分が アガったら 勇者の 顔が 一瞬」→ 顔の カットイン の あとで 結果
    if (r.kind === 'win') {
      const w = r.wins[0];
      this.cutIn(w.seat, w.from === null ? 'ツモ！' : 'ロン！', () => this.resultPanel(r, d));
    } else this.resultPanel(r, d);
  }

  /** アガった 人の 顔が 横から 大きく 出る(約1.2秒) */
  private cutIn(seat: number, word: string, done: () => void, ms = 1150): void {
    const faceKey = this.actors[seat]?.getData('face') as string;
    const left = this.actors[seat]?.getData('left') as boolean;
    const mine = seat === PLAYER_SEAT;
    const c = this.add.container(this.W / 2, H / 2).setDepth(85);
    const band = this.add.rectangle(0, 0, this.W + 40, 260, mine ? 0xffd23a : 0xff4a6a, 0.95).setAngle(-6);
    const band2 = this.add.rectangle(0, 0, this.W + 40, 230, 0x16101c, 0.92).setAngle(-6);
    c.add([band, band2]);
    const face = this.textures.exists(faceKey) ? this.add.image(mine ? -this.W * 0.18 : this.W * 0.18, 0, faceKey) : null;
    if (face) {
      face.setScale(250 / face.height);
      // 右がわの 顔は 左を 向く(オオカミの 絵は もとから 左向き)
      if (!mine && !left) face.setFlipX(true);
      c.add(face);
    }
    const t = this.text(mine ? this.W * 0.12 : -this.W * 0.12, 0, word, 110, mine ? '#ffd23a' : '#ff6a8a', 12);
    c.add(t);
    c.setX(mine ? -this.W : this.W * 2);
    audio.se(mine ? 'mcThunder' : 'mcSlash');
    this.tweens.add({ targets: c, x: this.W / 2, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, scale: { from: 1.5, to: 1 }, duration: 300, delay: 120, ease: 'Back.easeOut' });
    this.time.delayedCall(ms, () => {
      this.tweens.add({ targets: c, x: mine ? this.W * 2 : -this.W, duration: 200, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
      done();
    });
  }

  /** 結果: 役を 1つずつ → さいごに 点数と いっしょに アガった 人が 相手を 攻撃 */
  private resultPanel(r: RoundResult, d: Damage): void {
    const panel = this.add.container(this.W / 2, H / 2).setDepth(80);
    panel.add(this.add.rectangle(0, 0, 860, 580, 0x16101c, 0.95).setStrokeStyle(5, 0xffd23a));
    let title = '';
    const rows: { text: string; color: string; size: number }[] = [];
    let total = '';
    if (r.kind === 'win') {
      const w = r.wins[0];
      title = `${SEAT_NAME[w.seat]}の ${w.from === null ? 'ツモ' : 'ロン'}！`;
      for (const wn of r.wins) {
        const sc = wn.score;
        if (r.wins.length > 1) rows.push({ text: `【${SEAT_NAME[wn.seat]}】`, color: '#ffb03a', size: 18 });
        for (const y of sc.yaku) rows.push({ text: `${y.name}　${y.yakuman ? (y.yakuman > 1 ? 'ダブル役満' : '役満') : `${y.han}翻`}`, color: '#ffffff', size: 21 });
        if (sc.dora) rows.push({ text: `ドラ　${sc.dora}翻`, color: '#ffb03a', size: 21 });
        total += `${total ? '\n' : ''}${sc.yakuman ? sc.limit : `${sc.han}翻 ${sc.fu}符 ${sc.limit}`}  ${(wn.from === null ? wn.paid.reduce((a, b) => a + b, 0) : sc.ron).toLocaleString()}点`;
      }
      // アガった 手
      const p = this.round.players[w.seat];
      const hand = [...p.hand, ...(w.from === null ? [] : [this.round.lastTile!.tile])];
      hand.forEach((t, i) => panel.add(this.tile(-((hand.length - 1) * 42) / 2 + i * 42, -200, texOf(t), 40)));
      if (p.riichi) {
        const ura = uraIndicators(this.round);
        panel.add(this.text(-330, -146, '裏ドラ表示', 14, '#ffb03a'));
        ura.forEach((k, i) => panel.add(this.tile(-262 + i * 28, -146, kindTex(k), 26)));
      }
    } else {
      title = r.reason === 'kyuushu' ? '九種九牌で 流局' : r.nagashi?.length ? `流し満貫！(${r.nagashi.map((n) => SEAT_NAME[n.seat]).join('・')})` : '流局';
      if (r.reason === 'exhaust') rows.push({ text: `テンパイ: ${r.tenpai.map((t, i) => (t ? SEAT_NAME[i] : '')).filter(Boolean).join('・') || 'なし'}`, color: '#ffffff', size: 20 });
    }
    panel.add(this.text(0, -254, title, 34, '#ffd23a', 6));
    // 役を 1つずつ(左がわ)
    const step = 300;
    rows.forEach((row, i) => {
      const t = this.text(-210, -110 + i * 30, row.text, row.size, row.color).setAlpha(0);
      panel.add(t);
      this.time.delayedCall(250 + i * step, () => {
        t.setAlpha(1);
        audio.se('tap', { pitch: 1 + i * 0.06 });
        this.tweens.add({ targets: t, x: { from: -250, to: -210 }, duration: 160, ease: 'Quad.easeOut' });
      });
    });
    const tEnd = 250 + rows.length * step + 200;
    const res = stageResult(this.hp);
    this.time.delayedCall(tEnd, () => {
      if (total) {
        const tt = this.text(-210, 150, total, 26, '#ffd23a', 5);
        panel.add(tt);
        this.tweens.add({ targets: tt, scale: { from: 1.5, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      }
      // 攻撃の 絵(右がわ)
      for (const h of d.hits) this.attackScene(panel, h.winner, h.target === 'enemy');
      if (d.hits.length) this.time.delayedCall(450, () => this.damageText(panel, d));
      this.redrawHudOnly();
      for (const h of d.hits) this.attackAnim(h.winner, h.target === 'enemy' ? [1, 2, 3] : [0]);
      this.time.delayedCall(d.hits.length ? 900 : 100, () => {
        const b = this.text(0, 248, res ? 'つぎへ' : 'つぎの 局へ', 26, '#16101c').setInteractive({ useHandCursor: true });
        b.setBackgroundColor('#ffd23a').setPadding(24, 10, 24, 10);
        b.on('pointerdown', () => {
          audio.se('next');
          panel.destroy();
          if (res) return this.finish(res);
          nextRound(this.mj);
          if (this.mj.over) return this.endHanchan();
          this.step();
        });
        panel.add(b);
      });
    });
  }

  /** 結果の 右がわ: アガった 人が 相手に 飛びかかる 絵(自分なら 勇者 → 敵、敵なら 敵 → 勇者) */
  private attackScene(panel: Phaser.GameObjects.Container, winner: number, toEnemy: boolean): void {
    const who = (seat: number) => ({ key: this.actors[seat]?.getData('body') as string, left: this.actors[seat]?.getData('left') as boolean });
    const mk = (a: { key: string; left: boolean }, x: number, faceRight: boolean) => {
      if (!this.textures.exists(a.key)) return null;
      const img = this.add.image(x, 60, a.key).setOrigin(0.5, 0.5);
      // 左向きの 絵は 右を 向かせる 時に 反転・前向きの 絵は 右がわの 時だけ 反転
      img.setScale(200 / img.height).setFlipX(faceRight ? a.left : !a.left);
      panel.add(img);
      return img;
    };
    // 攻撃する 側は 左(右を 向く)、受ける 側は 右(左を 向く)
    const def = mk(who(toEnemy ? BOSS : 0), 300, false);
    const atk = mk(who(winner), 110, true);
    if (!atk || !def) return;
    this.tweens.add({ targets: atk, x: 230, y: 40, angle: 12, duration: 180, delay: 80, yoyo: true, hold: 120, ease: 'Quad.easeIn' });
    this.time.delayedCall(260, () => {
      // 当たった 光
      const star = this.add.star(270, 50, 10, 30, 90, 0xffd23a).setStrokeStyle(5, 0xffffff);
      panel.add(star);
      this.tweens.add({ targets: star, scale: { from: 0.3, to: 1.4 }, alpha: { from: 1, to: 0 }, angle: 40, duration: 420, onComplete: () => star.destroy() });
      def.setTint(0xff6a6a);
      this.tweens.add({ targets: def, x: { from: 290, to: 310 }, duration: 50, yoyo: true, repeat: 5, onComplete: () => def.clearTint() });
      this.cameras.main.shake(220, toEnemy ? 0.004 : 0.008);
      audio.se(toEnemy ? 'punchHeavy' : 'punch');
    });
  }

  private damageText(panel: Phaser.GameObjects.Container, d: Damage, x = 205, y = 170): void {
    if (d.toEnemy) {
      const t = this.text(x, y, `敵に ${d.toEnemy.toLocaleString()} ダメージ！`, 34, '#ff6a8a', 7);
      panel.add(t);
      this.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    }
    if (d.toPlayer) {
      const t = this.text(x, d.toEnemy ? y + 36 : y, `あなたに ${d.toPlayer.toLocaleString()} ダメージ…`, 30, '#9fe0ff', 6);
      panel.add(t);
      this.cameras.main.shake(260, 0.006);
    }
  }

  private redrawHudOnly(): void {
    this.ui.removeAll(true);
    this.drawHud();
    if (this.wait.kind === 'turn' || this.wait.kind === 'react') this.drawButtons();
  }

  /** 半荘 おわり: ウマ(自分の だけ)を HP に → 次の 半荘(点数は そのまま) */
  private endHanchan(): void {
    const ranks = [0, 1, 2, 3].sort((a, b) => this.mj.points[b] - this.mj.points[a]);
    const d = umaDamage(this.mj);
    this.hp = applyDamage(this.hp, d);
    const panel = this.add.container(this.W / 2, H / 2).setDepth(80);
    panel.add(this.add.rectangle(0, 0, 720, 420, 0x16101c, 0.95).setStrokeStyle(5, 0xffd23a));
    panel.add(this.text(0, -170, '半荘 おわり', 34, '#ffd23a', 6));
    panel.add(this.text(0, -70, ranks.map((s, i) => `${i + 1}位 ${SEAT_NAME[s]}  ${this.mj.points[s]}点`).join('\n'), 20, '#ffffff'));
    panel.add(this.text(0, 40, `あなたの ウマ: ${d.toEnemy ? `+${d.toEnemy}` : d.toPlayer ? `-${d.toPlayer}` : '0'}`, 22, '#ffb03a'));
    this.damageText(panel, d, 0, 100);
    this.redrawHudOnly();
    const res = stageResult(this.hp);
    const b = this.text(0, 170, res ? 'つぎへ' : 'つぎの 半荘へ', 26, '#16101c').setInteractive({ useHandCursor: true });
    b.setBackgroundColor('#ffd23a').setPadding(24, 10, 24, 10);
    b.on('pointerdown', () => {
      audio.se('next');
      panel.destroy();
      if (res) return this.finish(res);
      nextHanchan(this.mj);
      this.step();
    });
    panel.add(b);
  }

  /** ステージ クリア / ゲームオーバー【仮：画面は あとで(4段目)】 */
  private finish(res: 'clear' | 'lose'): void {
    this.finished = res;
    this.redraw();
    const panel = this.add.container(this.W / 2, H / 2).setDepth(90);
    panel.add(this.add.rectangle(0, 0, 640, 320, 0x16101c, 0.96).setStrokeStyle(6, res === 'clear' ? 0xffd23a : 0x9fe0ff));
    panel.add(this.text(0, -60, res === 'clear' ? 'STAGE CLEAR!' : 'GAME OVER', 60, res === 'clear' ? '#ffd23a' : '#9fe0ff', 8));
    audio.se(res === 'clear' ? 'cheer' : 'back');
    // クリア → ゴールド / 負け → やりなおし(MahjongQuest)
    this.time.delayedCall(1600, () => {
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MahjongQuest', res === 'clear' ? { mode: 'clear', gold: this.st.gold } : { mode: 'lose' }));
    });
  }

  private quit(force = false): void {
    if (this.leaving) return;
    if (!force && !this.finished && !window.confirm('対局を やめて もどりますか？')) return;
    this.leaving = true;
    this.timer?.remove();
    audio.se('back');
    this.scene.start('MahjongQuest', { mode: 'title' });
  }

  /** 開発用: 今の 状態(テスト用) */
  get debugState(): { mj: GameState; hp: Hp; wait: Wait } {
    return { mj: this.mj, hp: this.hp, wait: this.wait };
  }
}

