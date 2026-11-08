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
  private finished: 'clear' | 'lose' | null = null;
  private leaving = false;

  constructor() {
    super('Mahjong');
  }

  preload(): void {
    for (const f of TILE_FILES) if (!this.textures.exists(`mj:${f}`)) this.load.image(`mj:${f}`, assetUrl(`assets/mahjong/${f}.webp`));
  }

  create(): void {
    this.leaving = false;
    this.finished = null;
    this.layout();
    watchViewport(this, () => {
      this.layout();
      this.redraw();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(720, 1280));
    this.cameras.main.setBackgroundColor('#1a0d26');
    this.layer = this.add.container(0, 0);
    this.ui = this.add.container(0, 0).setDepth(50);
    const seed = randomSeed();
    this.mj = newGame(seed, 0);
    this.cpus = [0, 1, 2, 3].map((i) => makeCpu(LEVELS[i], seed + i * 977));
    this.hp = { player: START_HP, playerMax: START_HP, enemy: START_HP, enemyMax: START_HP };
    audio.playBgm('battle');
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.step();
  }

  /** 画面の 大きさ(横画面。横は スマホの 形まで のばす) */
  private layout(): void {
    this.W = Math.max(1280, fillSize(this, { w: 1280, h: H }, { minRatio: 1280 / H, maxRatio: 2.2 }).w);
    this.scale.setGameSize(this.W, H);
    this.cameras.main.setSize(this.W, H);
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
    if (mine.ron || mine.pon.length || mine.chi.length || mine.minkan.length) {
      this.wait = { kind: 'react' };
      this.redraw();
      return;
    }
    this.wait = { kind: 'none' };
    this.redraw();
    this.later(120, () => this.resolve(null));
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
    const W = this.W;
    const cx = W / 2;
    const cy = 318;
    // 卓
    const g = this.add.graphics();
    g.fillStyle(0x2a1440, 1).fillRoundedRect(cx - 470, 20, 940, 560, 40);
    g.lineStyle(6, 0xffb03a, 1).strokeRoundedRect(cx - 470, 20, 940, 560, 40);
    g.fillStyle(0x16101c, 0.9).fillRoundedRect(cx - 98, cy - 88, 196, 176, 18);
    g.lineStyle(3, 0x9b5cff, 1).strokeRoundedRect(cx - 98, cy - 88, 196, 176, 18);
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
    this.layer.add(this.text(cx, cy - 66, `${wind}${g.kyoku + 1}局  ${g.honba}本場`, 19, '#ffd23a'));
    this.layer.add(this.text(cx, cy - 42, `のこり ${s.live.length}  リーチ棒 ${s.cfg.sticks}`, 14, '#e8dcf4'));
    const ind = doraIndicators(s);
    this.layer.add(this.text(cx - 70, cy - 10, 'ドラ', 13, '#ffb03a'));
    ind.forEach((k, i) => this.layer.add(this.tile(cx - 40 + i * 27, cy - 10, kindTex(k), 25)));
    // 4人の 点数(それぞれの 席の 向きに 置く。手番の 人は 黄色)
    const pos = [
      [cx, cy + 70],
      [cx + 52, cy + 46],
      [cx, cy + 22],
      [cx - 52, cy + 46],
    ];
    for (let i = 0; i < 4; i++) {
      const w = '東南西北'[seatWind(s, i) - EAST];
      const [x, y] = pos[i];
      this.layer.add(this.text(x, y, `${w} ${g.points[i]}`, 13, i === s.turn ? '#ffd23a' : '#ffffff'));
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
    const rw = 34;
    const rh = rw * (172 / 132);
    p.discards.forEach((d, i) => {
      const row = Math.min(3, Math.floor(i / 6));
      const col = i - row * 6 + (row === 3 ? 6 * 0 : 0);
      const x = -3 * rw + rw / 2 + (row === 3 ? i - 18 : col) * rw;
      const y = 104 + row * rh + rh / 2;
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
    const bw = 24;
    const n = p.hand.length;
    for (let i = 0; i < n; i++) c.add(this.tile(-((n - 1) * bw) / 2 + i * bw, 262, 'mj:back', bw - 1));
    // 鳴いた 牌
    this.drawMelds(c, p.melds, ((n - 1) * bw) / 2 + 40, 262, 26);
    // 名前・リーチ
    const nameT = this.text(-((n - 1) * bw) / 2 - 70, 262, SEAT_NAME[seat] + (p.riichi ? '\nリーチ' : ''), 16, seat === BOSS ? '#ff6a8a' : '#ffffff', 4);
    nameT.setRotation(-rot);
    c.add(nameT);
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
    const tw = 62;
    const th = tw * (172 / 132);
    const drawn = s.turn === 0 && s.drawn !== null ? s.drawn : null;
    const hand = drawn !== null ? p.hand.filter((t) => t !== drawn) : [...p.hand];
    hand.sort((a, b) => a - b);
    const all = drawn !== null ? [...hand, drawn] : hand;
    const meldW = p.melds.reduce((a, m) => a + m.tiles.length * 40 + 12, 0);
    const total = all.length * tw + (drawn !== null ? 14 : 0);
    const x0 = Math.min(W / 2 - total / 2 - meldW / 2, W - 30 - meldW - total);
    const y = H - th / 2 - 14;
    const o = this.wait.kind === 'turn' ? turnOptions(s) : null;
    const can = new Set(this.riichiMode ? o?.riichi ?? [] : o?.discards ?? []);
    all.forEach((t, i) => {
      const x = x0 + i * tw + tw / 2 + (t === drawn && i === all.length - 1 ? 14 : 0);
      const up = this.selected === t ? -18 : 0;
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
    this.drawMelds(mc, p.melds, W - 24 - meldW, y + 8, 40);
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

  /** HP バー(左上: 敵チーム・左下: あなた) */
  private drawHud(): void {
    const bar = (x: number, y: number, label: string, v: number, max: number, color: number) => {
      const w = 300;
      const g = this.add.graphics();
      g.fillStyle(0x16101c, 0.92).fillRoundedRect(x - 8, y - 30, w + 16, 58, 12);
      g.fillStyle(0x3a2a4a, 1).fillRoundedRect(x, y, w, 18, 9);
      g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(0, (w * v) / max), 18, 9);
      this.ui.add(g);
      this.ui.add(this.text(x + w / 2, y - 14, `${label}  ${v.toLocaleString()} / ${max.toLocaleString()}`, 15, '#ffffff'));
    };
    bar(20, 44, '敵チーム HP', this.hp.enemy, this.hp.enemyMax, 0xff4a6a);
    bar(20, H - 150, 'あなたの HP', this.hp.player, this.hp.playerMax, 0x3ad070);
    // もどる
    const back = this.text(this.W - 70, 34, '◀ やめる', 18, '#ffffff', 0).setInteractive({ useHandCursor: true });
    back.setBackgroundColor('#16101ccc').setPadding(12, 8, 12, 8);
    back.on('pointerup', () => this.quit());
    this.ui.add(back);
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
      if (o.chi.length > 1)
        o.chi.forEach((c, i) => {
          const x = this.W - 220 - i * 110;
          c.forEach((t, j) => this.ui.add(this.tile(x + j * 30, H - 250, texOf(t), 28)));
          this.ui.add(this.text(x + 15, H - 282, `チー${i + 1}`, 14, '#3ad070', 3));
        });
    }
    list.forEach(([label, color, f], i) => this.button(this.W - 90 - i * 150, H - 190, label, color, f));
    if (this.wait.kind === 'turn' && !list.length && !this.round.players[0].riichi && this.selected === null)
      this.ui.add(this.text(this.W / 2, H - 150, '捨てる 牌を 2回 タップ', 16, '#e8dcf4', 3));
    if (this.riichiMode) this.ui.add(this.text(this.W / 2, H - 150, 'リーチ: 光っている 牌を 2回 タップ', 16, '#ffd23a', 3));
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
    const panel = this.add.container(this.W / 2, H / 2).setDepth(80);
    panel.add(this.add.rectangle(0, 0, 820, 520, 0x16101c, 0.95).setStrokeStyle(5, 0xffd23a));
    const lines: string[] = [];
    let title = '';
    if (r.kind === 'win') {
      const w = r.wins[0];
      title = `${SEAT_NAME[w.seat]}の ${w.from === null ? 'ツモ' : 'ロン'}！`;
      for (const wn of r.wins) {
        const sc = wn.score;
        if (r.wins.length > 1) lines.push(`【${SEAT_NAME[wn.seat]}】`);
        lines.push(sc.yaku.map((y) => `${y.name} ${y.yakuman ? (y.yakuman > 1 ? 'ダブル役満' : '役満') : `${y.han}翻`}`).join('  '));
        if (sc.dora) lines.push(`ドラ ${sc.dora}`);
        lines.push(`${sc.yakuman ? sc.limit : `${sc.han}翻 ${sc.fu}符 ${sc.limit}`}  ${(wn.from === null ? wn.paid.reduce((a, b) => a + b, 0) : sc.ron).toLocaleString()}点`);
      }
      // アガった 手
      const wn = r.wins[0];
      const p = this.round.players[wn.seat];
      const hand = [...p.hand, ...(wn.from === null ? [] : [this.round.lastTile!.tile])];
      hand.forEach((t, i) => panel.add(this.tile(-((hand.length - 1) * 40) / 2 + i * 40, -170, texOf(t), 38)));
      if (this.round.players[wn.seat].riichi) {
        const ura = uraIndicators(this.round);
        panel.add(this.text(-300, -118, '裏ドラ表示', 14, '#ffb03a'));
        ura.forEach((k, i) => panel.add(this.tile(-230 + i * 28, -118, kindTex(k), 26)));
      }
    } else {
      title = r.reason === 'kyuushu' ? '九種九牌で 流局' : r.nagashi?.length ? `流し満貫！(${r.nagashi.map((n) => SEAT_NAME[n.seat]).join('・')})` : '流局';
      if (r.reason === 'exhaust') lines.push(`テンパイ: ${r.tenpai.map((t, i) => (t ? SEAT_NAME[i] : '')).filter(Boolean).join('・') || 'なし'}`);
    }
    panel.add(this.text(0, -226, title, 34, '#ffd23a', 6));
    panel.add(this.text(0, -40, lines.join('\n'), 18, '#ffffff').setWordWrapWidth(760));
    this.damageText(panel, d);
    this.redrawHudOnly();
    const res = stageResult(this.hp);
    const next = () => {
      panel.destroy();
      if (res) return this.finish(res);
      nextRound(this.mj);
      if (this.mj.over) return this.endHanchan();
      this.step();
    };
    const b = this.text(0, 210, res ? 'つぎへ' : 'つぎの 局へ', 26, '#16101c').setInteractive({ useHandCursor: true });
    b.setBackgroundColor('#ffd23a').setPadding(24, 10, 24, 10);
    b.on('pointerdown', () => {
      audio.se('next');
      next();
    });
    panel.add(b);
    if (d.toEnemy || d.toPlayer) audio.se(d.toEnemy ? 'mcHit' : 'punchHeavy');
  }

  private damageText(panel: Phaser.GameObjects.Container, d: Damage): void {
    if (d.toEnemy) {
      const t = this.text(0, 110, `敵チームに ${d.toEnemy.toLocaleString()} ダメージ！`, 40, '#ff6a8a', 7);
      panel.add(t);
      this.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    }
    if (d.toPlayer) {
      const t = this.text(0, d.toEnemy ? 160 : 110, `あなたに ${d.toPlayer.toLocaleString()} ダメージ…`, 34, '#9fe0ff', 6);
      panel.add(t);
      this.cameras.main.shake(260, 0.006);
    }
  }

  private redrawHudOnly(): void {
    this.ui.removeAll(true);
    this.drawHud();
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
    this.damageText(panel, d);
    this.redrawHudOnly();
    const res = stageResult(this.hp);
    const b = this.text(0, 160, res ? 'つぎへ' : 'つぎの 半荘へ', 26, '#16101c').setInteractive({ useHandCursor: true });
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
    const b = this.text(0, 80, 'もどる', 26, '#16101c').setInteractive({ useHandCursor: true });
    b.setBackgroundColor('#ffd23a').setPadding(24, 10, 24, 10);
    b.on('pointerdown', () => this.quit(true));
    panel.add(b);
    audio.se(res === 'clear' ? 'cheer' : 'back');
  }

  private quit(force = false): void {
    if (this.leaving) return;
    if (!force && !this.finished && !window.confirm('対局を やめて もどりますか？')) return;
    this.leaving = true;
    this.timer?.remove();
    audio.se('back');
    // 確認用ページ(麻雀だけ)では もう一度 対局から
    if ((window as { __MONZ_START?: string }).__MONZ_START === 'Mahjong') this.scene.restart();
    else this.scene.start('MinigameSelect');
  }

  /** 開発用: 今の 状態(テスト用) */
  get debugState(): { mj: GameState; hp: Hp; wait: Wait } {
    return { mj: this.mj, hp: this.hp, wait: this.wait };
  }
}

