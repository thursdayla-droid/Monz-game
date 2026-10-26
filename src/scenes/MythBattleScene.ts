import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { abilityOf } from '../core/mythclash/abilities';
import { card, RARITIES, type Element } from '../core/mythclash/cards';
import type { SeName } from '../audio/sfx';
import { counterFx, impactFx, magicFx, slashFx, specialCutin } from '../ui/mythFx';
import { activeCard, createBattle, legalActions, replaceDowned, resolveRound, type BattleAction, type BattleEvent, type BattleState, type Side } from '../core/mythclash/engine';
import { battleUnlocked, newCollection } from '../core/mythclash/packs';
import { aiAction, randomDeck } from '../core/mythclash/sim';
import { eventsFor, viewFor, type BattleView } from '../core/mythclash/view';
import { halved, incomingEstimates } from '../core/mythclash/estimate';
import { mulberry32, newSeed, type Rng } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { drawMythCard, MYTH_CARD_H, MYTH_CARD_W } from '../ui/mythCardArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { showCardZoom } from '../ui/cardZoom';
import { fillSize, viewRatio, watchViewport } from '../ui/viewport';
import { MYTH_TITLE_IMAGE } from './MythTitleScene';

/**
 * 縦向き(企画者 2026-10-26: 縦でよい。相手が上・自分が下)。横は720のまま、縦の長さを画面の形に合わせる(全画面)。
 * 上から: 相手のHP → 相手の3枚 → 相手の場のカード → (TURN・攻撃の向きの矢印・残り秒数・メッセージ) → 自分の場のカード → 自分の3枚 → 自分のHP → ボタン
 */
const W = 720;
let H = 1280;
const PORTRAIT = { w: 720, h: 1280 };
const ME: Side = 0;
const CPU: Side = 1;
/** 相手の3枚の下と、自分の3枚の上(この間に場のカード2枚) */
const TOP = 228;
const bottomTop = () => H - 340;
const MID_GAP = 120;
const cardScale = () => Math.min(1, (bottomTop() - TOP - MID_GAP - 20) / 2 / MYTH_CARD_H);
const cardH = () => MYTH_CARD_H * cardScale();
const cardPos = (side: Side) => ({ x: W / 2, y: side === CPU ? TOP + 10 + cardH() / 2 : bottomTop() - 10 - cardH() / 2 });
const midY = () => (TOP + bottomTop()) / 2;
const THUMB_S = 0.26;
const thumbPos = (side: Side, i: number) => ({ x: W / 2 + (i - 1) * 112, y: side === CPU ? 162 : H - 276 });
/** 名前・HPの板(まん中の高さ) */
const panelY = (side: Side) => (side === CPU ? 56 : H - 166);
const ATTACK_COLOR = 0xff3a3a;
const DEFENSE_COLOR = 0x3a9dff;

/** 1ターンの秒数(企画者 2026-10-26) */
const TURN_SECONDS = 30;
const MAGIC_SE: Record<Element, SeName> = { 炎: 'mcFire', 水: 'mcWater', 雷: 'mcThunder', 自然: 'mcNature', 光: 'mcLight', 闇: 'mcDark', 無: 'mcMagic' };
const ACTION_LABELS: Record<string, string> = { normal: '通常攻撃', special: '必殺技', magic: '魔法', guard: '防御', counter: 'カウンター', magicGuard: '魔法防御' };
const STATUS_LABELS: Record<string, string> = { sleep: '睡眠', freeze: '凍結', poison: '毒', burn: '火傷', weaken: '攻撃ダウン', boost: '強化', shield: 'バリア' };
const cardKey = (id: number, hideMagic: boolean) => `mc:card:${id}${hideMagic ? ':h' : ''}`;

/**
 * MYTHCLASH のバトル画面(テストプレイ。企画者のイメージ図 2026-10-26 をもとに)。相手はCPU。
 * - 攻撃側と防御側がわかりやすいように: 攻撃側のカードは赤く光って「ATTACK」、防御側は青く光って「DEFENSE」、まん中の矢印は攻撃の向き。
 *   下のボタンも、攻撃側なら 通常攻撃・必殺技・魔法、防御側なら 防御・魔法防御・カウンター
 * - 見せる情報は viewFor / eventsFor を通したものだけ(相手のまだ出ていないカード・使っていない魔法の属性は見せない)
 * 【仮】デッキ: チーム編成ができるまで、持っているカードの中からレアの高い3枚(3種類なければ、テスト用にランダムな3枚)。相手もランダム。
 * 【仮】CPUのかしこさは、バランス確認用のかんたんなAI(sim.ts の aiAction)。曲はタイトルと同じ
 */
export class MythBattleScene extends Phaser.Scene {
  private s!: BattleState;
  private view!: BattleView;
  private rng!: Rng;
  private testDeck = false;
  private busy = false;
  private auto = false;
  private ui?: Phaser.GameObjects.Container;
  private cardImg: Partial<Record<Side, Phaser.GameObjects.Image>> = {};
  private shownHp: Record<Side, number> = { 0: 0, 1: 0 };
  private hpBar: Partial<Record<Side, Phaser.GameObjects.Graphics>> = {};
  private hpText: Partial<Record<Side, Phaser.GameObjects.Text>> = {};
  private cardHpBar: Partial<Record<Side, { bar: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; x: number; y: number; w: number }>> = {};
  private message?: Phaser.GameObjects.Text;
  private autoBtn?: Phaser.GameObjects.Text;

  constructor() {
    super('MythBattle');
  }

  init(): void {
    this.fitSize();
    this.busy = false;
    this.auto = false;
    this.chooser = undefined;
    this.timerText = undefined;
    this.timerEvent = undefined;
    this.cardImg = {};
    this.hpBar = {};
    this.hpText = {};
    this.cardHpBar = {};
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  /** 画面の形に合わせて縦の長さを決める(横は720のまま。縦が1280より短くはしない) */
  private fitSize(): void {
    H = fillSize(this, { w: W, h: 1280 }, { minRatio: 0.42, maxRatio: W / 1280 }).h;
    this.scale.setGameSize(W, H);
  }

  private bg?: Phaser.GameObjects.Container;
  private turnHint?: Phaser.GameObjects.Container;

  private onViewport(): void {
    this.fitSize();
    this.drawBackground();
    // 出来事を見せている間なら、終わったときに並べ直される(play の最後の render)
    if (!this.busy) this.render();
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    watchViewport(this, () => this.onViewport());
    audio.preloadSe(['mcSlash', 'mcSpecial', 'mcGuardOk', 'mcPoison', 'mcHeal', 'mcThunder', 'mcNature', 'mcFire', 'mcLight', 'mcDark', 'mcDrain', 'mcMagicGuardOk', 'mcBuff']);
    this.drawBackground();
    const seed = newSeed();
    this.rng = mulberry32(seed ^ 0x5bd1e995);
    const deckRng = mulberry32(seed);
    const mine = this.pickMyDeck(deckRng);
    const theirs = randomDeck(deckRng);
    const { state } = createBattle(mine, theirs, seed);
    this.s = state;
    for (const side of [ME, CPU]) this.shownHp[side] = activeCard(state, side).hp;
    this.view = viewFor(state, ME);
    this.render();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('mythclash');
    this.say(this.testDeck ? 'テストプレイ（仮のデッキ）　バトル開始！' : 'バトル開始！', '#ffffff');
    this.time.delayedCall(900, () => this.prompt());
  }

  /** 【仮】チーム編成ができるまで: 持っているカードのうちレアが高い3枚。3種類なければテスト用のランダム */
  private pickMyDeck(rng: Rng): number[] {
    const col = loadLife().mythclash ?? newCollection();
    if (!battleUnlocked(col)) {
      this.testDeck = true;
      return randomDeck(rng);
    }
    const rank = (id: number) => RARITIES.indexOf(card(id)!.rarity);
    return Object.keys(col.owned)
      .map(Number)
      .sort((a, b) => rank(b) - rank(a) || a - b)
      .slice(0, 3);
  }

  private drawBackground(): void {
    this.bg?.destroy();
    const bg = this.add.container(0, 0).setDepth(-10);
    this.bg = bg;
    // タイトルの絵の闘技場の所を、暗くして背景にする【仮】
    if (this.textures.exists(MYTH_TITLE_IMAGE)) {
      const src = this.textures.get(MYTH_TITLE_IMAGE).getSourceImage() as HTMLImageElement;
      const key = `mb:bg:${H}`;
      canvasTextureOnce(this, key, W, H, (ctx) => {
        // 暗い赤から黒へ。上にタイトルの絵のお城、下に闘技場の床をうすく(タイトルのボタンは出さない)
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2a0a12');
        g.addColorStop(0.5, '#120508');
        g.addColorStop(1, '#2a0a10');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const fade = (sy: number, sh: number, dy: number, dh: number, fromTop: boolean) => {
          const c = document.createElement('canvas');
          c.width = W;
          c.height = Math.round(dh);
          const cx = c.getContext('2d')!;
          cx.drawImage(src, 0, sy, src.width, sh, 0, 0, W, dh);
          cx.globalCompositeOperation = 'destination-in';
          const m = cx.createLinearGradient(0, 0, 0, dh);
          m.addColorStop(0, fromTop ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)');
          m.addColorStop(1, fromTop ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.9)');
          cx.fillStyle = m;
          cx.fillRect(0, 0, W, dh);
          ctx.drawImage(c, 0, dy);
        };
        fade(0, 500, 0, (500 * W) / src.width, true);
        const fh = (380 * W) / src.width;
        fade(src.height - 380, 380, H - fh, fh, false);
      });
      bg.add(this.add.image(0, 0, key).setOrigin(0, 0));
    }
    bg.add(this.add.rectangle(0, 0, W, H, 0x0a0408, 0.35).setOrigin(0, 0));
    // スマホが横のときは「縦にしてね」(そのままでも遊べる)
    this.turnHint?.destroy();
    this.turnHint = undefined;
    if (viewRatio(this) > 1) {
      const c = this.add.container(W / 2, H / 2).setDepth(400);
      c.add([this.add.rectangle(0, 0, 640, 150, 0x16101c, 0.9).setStrokeStyle(4, 0xffd23a, 1), this.text(0, 0, 'スマホを 縦にしてね', 44, '#ffd23a')]);
      this.tweens.add({ targets: c, alpha: 0, delay: 2500, duration: 500 });
      this.turnHint = c;
    }
  }

  // ---------------- 画面を作る(見せてよい情報だけ) ----------------

  private render(): void {
    this.ui?.destroy();
    this.cardHpBar = {};
    const ui = this.add.container(0, 0);
    this.ui = ui;
    const v = this.view;
    const attacking = v.attacking;
    // 名前・HP(相手は上、自分は下)
    for (const side of [ME, CPU]) {
      const cards = side === ME ? v.me : v.opponent;
      const act = cards.find((c) => !c.hidden && c.active);
      const mine = side === ME;
      const top = panelY(side) - 42;
      const g = this.add.graphics();
      g.fillStyle(0x0a0408, 0.85).fillRoundedRect(20, top, W - 40, 84, 14);
      g.lineStyle(3, mine ? 0xc0182a : 0x2a6ad8, 1).strokeRoundedRect(20, top, W - 40, 84, 14);
      ui.add(g);
      ui.add(this.text(40, top + 24, mine ? 'あなた' : 'CPU', 22, '#b8a8c8', 0));
      if (act && !act.hidden) ui.add(this.text(130, top + 24, act.name, 26, '#ffffff', 0));
      const bar = this.add.graphics();
      const hpT = this.text(W - 40, top + 58, '', 24, '#ffffff', 1);
      this.hpBar[side] = bar;
      this.hpText[side] = hpT;
      ui.add([bar, hpT]);
      this.drawHp(side);
      // チームの3枚(横にならべる)
      cards.forEach((c, i) => {
        const { x, y } = thumbPos(side, i);
        const box = this.add.graphics();
        const on = !c.hidden && c.active;
        box.fillStyle(0x0a0408, 0.8).fillRoundedRect(x - 50, y - 64, 100, 128, 10);
        box.lineStyle(on ? 5 : 2, on ? 0xffd23a : 0x6a5a70, 1).strokeRoundedRect(x - 50, y - 64, 100, 128, 10);
        ui.add(box);
        if (c.hidden) {
          ui.add(this.text(x, y, '？？？', 22, '#8a7a90'));
          return;
        }
        const img = this.add.image(x, y - 6, this.cardTexture(c.id, side === CPU && !c.magicElement)).setScale(THUMB_S);
        if (c.down) img.setTint(0x444444);
        ui.add(img);
        const rate = c.hp / c.maxHp;
        const hb = this.add.graphics();
        hb.fillStyle(0x000000, 0.8).fillRect(x - 42, y + 50, 84, 8);
        hb.fillStyle(rate > 0.5 ? 0x4ade80 : rate > 0.25 ? 0xffd23a : 0xff4a4a, 1).fillRect(x - 42, y + 50, 84 * rate, 8);
        ui.add(hb);
        if (c.down) ui.add(this.text(x, y - 6, '戦闘不能', 18, '#ff6a6a'));
        // さわると大きく見られる(自分の3枚と、相手の一度でも出たカード。企画者 2026-10-26)
        const zoom = this.add.zone(x, y, 100, 128).setInteractive({ useHandCursor: true });
        zoom.on('pointerdown', () => this.zoom(side, i));
        ui.add(zoom);
      });
    }
    // まん中の左: ターン
    const my = midY();
    const tg = this.add.graphics();
    tg.fillStyle(0x0a0408, 0.9).fillRoundedRect(12, my - 44, 92, 88, 14);
    tg.lineStyle(3, 0xd8b060, 1).strokeRoundedRect(12, my - 44, 92, 88, 14);
    ui.add([tg, this.text(58, my - 22, 'TURN', 20, '#d8b060'), this.text(58, my + 14, String(v.round), 38, '#ffffff')]);
    const cs = cardScale();
    const ch = cardH();
    // 場のカード(攻撃側・防御側がわかるように)
    for (const side of [ME, CPU]) {
      const cards = side === ME ? v.me : v.opponent;
      const act = cards.find((c) => !c.hidden && c.active);
      if (!act || act.hidden) continue;
      const isAtk = (side === ME) === attacking;
      const { x, y } = cardPos(side);
      const col = isAtk ? ATTACK_COLOR : DEFENSE_COLOR;
      const cw = MYTH_CARD_W * cs;
      const glow = this.add.rectangle(x, y, cw + 24, ch + 24, col, 0.35).setStrokeStyle(5, col, 1);
      this.tweens.add({ targets: glow, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const img = this.add.image(x, y, this.cardTexture(act.id, side === CPU && !act.magicElement)).setScale(cs * (isAtk ? 1.04 : 0.97));
      this.cardImg[side] = img;
      // 攻撃側・防御側の札は、カードの右に
      const sx = x + cw / 2 + 22;
      const tag = this.text(sx, y - ch / 2 + 26, isAtk ? '⚔ ATTACK' : '🛡 DEFENSE', 26, '#ffffff', 0).setBackgroundColor(isAtk ? '#c0182a' : '#1f5fc8').setPadding(12, 4, 12, 6);
      ui.add([glow, img, tag]);
      // 札の下にも HP バー(企画者 2026-10-26)
      const cbar = this.add.graphics();
      const chp = this.text(sx, y - ch / 2 + 92, '', 20, '#ffffff', 0);
      this.cardHpBar[side] = { bar: cbar, text: chp, x: sx, y: y - ch / 2 + 62, w: W - sx - 22 };
      ui.add([cbar, chp]);
      this.drawHp(side);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.zoom(side, this.s.teams[side].active));
      // 状態(眠り・毒など)は、札の下に
      const st = this.s.teams[side].cards[this.s.teams[side].active];
      const marks = [act.skip && STATUS_LABELS[act.skip], act.dot && STATUS_LABELS[act.dot], st.shield > 0 && `バリア${st.shield}`, st.specialLock && side === ME && '必殺は次のターン使えない'].filter(Boolean) as string[];
      if (marks.length) ui.add(this.text(sx, y - ch / 2 + 128, marks.join('\n'), 20, '#ffd23a', 0).setBackgroundColor('#0a0408cc').setPadding(8, 2, 8, 4).setWordWrapWidth(W - sx - 24, true));
    }
    this.buildEstimate(ui);
    // 攻撃の向きの矢印(自分の攻撃なら上へ、相手の攻撃なら下へ)
    const arrow = this.text(W / 2, my - 24, attacking ? '▲▲' : '▼▼', 46, attacking ? '#ff5a5a' : '#5aa8ff');
    this.tweens.add({ targets: arrow, y: my - 24 + (attacking ? -10 : 10), duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    ui.add(arrow);
    // メッセージ
    this.message = this.text(W / 2, my + 28, this.message?.text ?? '', 24, '#ffffff').setBackgroundColor('#0a0408cc').setPadding(14, 4, 14, 6);
    ui.add(this.message);
    this.buildButtons(ui);
  }

  /**
   * 左の空いている所に、相手の攻撃で受けるダメージの目安(企画者 2026-10-26)。
   * 通常攻撃・必殺技は相手のカードが出たらわかる。魔法は、相手のそのカードが一度使ったら次のターンからわかる
   */
  private buildEstimate(ui: Phaser.GameObjects.Container): void {
    // 出来事を見せている間は出さない(まだ見せていない、次に出てくるカードの目安が出てしまわないように)
    if (this.busy || this.s.winner !== null || this.s.pending?.length) return;
    const v = this.view;
    if (!v.opponent.some((c) => !c.hidden && c.active) || !v.me.some((c) => !c.hidden && c.active && !c.down)) return;
    const est = incomingEstimates(this.s, ME);
    const p = cardPos(CPU);
    const x0 = 12;
    const w = W / 2 - (MYTH_CARD_W * cardScale()) / 2 - 24;
    const top = p.y - cardH() / 2 + 6;
    const r = (d: { min: number; max: number }) => (d.min === d.max ? `${d.min}` : `${d.min}〜${d.max}`);
    const rows: [string, string, string][] = [
      ['通常攻撃', r(est.normal), `防御で ${r(halved(est.normal))}`],
      ['必殺技', est.specialLocked ? '次は来ない' : r(est.special), est.specialLocked ? '' : 'カウンターで はね返せる'],
      ['魔法', est.magic ? r(est.magic) : '？？？', est.magic ? `魔法防御で ${r(halved(est.magic))}` : '使われたらわかる'],
    ];
    const h = 44 + rows.length * 74;
    const g = this.add.graphics();
    g.fillStyle(0x0a0408, 0.82).fillRoundedRect(x0, top, w, h, 12);
    g.lineStyle(2, 0x2a6ad8, 1).strokeRoundedRect(x0, top, w, h, 12);
    ui.add([g, this.text(x0 + w / 2, top + 20, '相手から受ける目安', 18, '#8ac4ff')]);
    rows.forEach(([label, val, note], i) => {
      const y = top + 50 + i * 74;
      ui.add(this.text(x0 + 12, y, label, 18, '#b8a8c8', 0));
      ui.add(this.text(x0 + w - 12, y + 22, val, val.length > 6 ? 22 : 28, est.magic || i < 2 ? '#ffffff' : '#8a7a90', 1));
      if (note) ui.add(this.text(x0 + 12, y + 50, note, 15, '#a89ab8', 0));
    });
  }

  private buildButtons(ui: Phaser.GameObjects.Container): void {
    const legal = this.s.winner === null ? legalActions(this.s, ME) : [];
    const attacking = this.view.attacking;
    const asleep = !!activeCard(this.s, ME).skip;
    const kinds: { label: string; action?: BattleAction; on: boolean }[] = asleep
      ? [{ label: '動けない…（次へ）', action: legal[0], on: true }]
      : (attacking ? (['normal', 'special', 'magic'] as const).map((k) => ({ type: 'attack' as const, kind: k })) : (['guard', 'magicGuard', 'counter'] as const).map((k) => ({ type: 'defend' as const, kind: k }))).map((a) => ({
          label: ACTION_LABELS[a.kind],
          action: a as BattleAction,
          on: legal.some((l) => JSON.stringify(l) === JSON.stringify(a)),
        }));
    const canSwitch = legal.some((l) => l.type === 'switch');
    const all = [...kinds, { label: '交代', on: canSwitch }];
    const gap = 10;
    // AUTO の場所(右はし)を残して、横に入るように
    const bw = Math.min(asleep ? 280 : 150, (W - 130 - gap * (all.length - 1)) / all.length);
    const total = all.length * bw + (all.length - 1) * gap;
    all.forEach((b, i) => {
      const x = 16 + (W - 130 - total) / 2 + bw / 2 + i * (bw + gap);
      const y = H - 66;
      const isSwitch = i === all.length - 1;
      const color = isSwitch ? 0x2a7a4a : attacking ? 0x8a1020 : 0x1a4a9a;
      const g = this.add.graphics();
      const enabled = b.on && !this.busy && this.s.winner === null;
      g.fillStyle(enabled ? color : 0x3a3040, 1).fillRoundedRect(x - bw / 2, y - 40, bw, 80, 12);
      g.lineStyle(3, enabled ? 0xd8b060 : 0x5a5060, 1).strokeRoundedRect(x - bw / 2, y - 40, bw, 80, 12);
      const t = this.text(x, y, b.label, b.label.length > 6 ? 20 : b.label.length > 4 ? 24 : 28, enabled ? '#ffffff' : '#8a8090');
      ui.add([g, t]);
      if (!enabled) return;
      const hit = this.add.zone(x, y, bw, 80).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (isSwitch) this.openChooser('switch');
        else if ('action' in b && b.action) this.choose(b.action);
      });
      ui.add(hit);
    });
    // AUTO(自動で選ぶ)
    this.autoBtn = this.text(W - 58, H - 66, 'AUTO', 22, this.auto ? '#16101c' : '#ffd23a').setBackgroundColor(this.auto ? '#ffd23a' : '#0a0408').setPadding(16, 14, 16, 16);
    this.autoBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.auto = !this.auto;
      audio.se('tap');
      this.render();
      if (this.auto && !this.busy) this.prompt();
    });
    ui.add(this.autoBtn);
  }

  /** 自分の番の案内(AUTOなら自動で選ぶ)。1ターン30秒(企画者 2026-10-26) */
  private prompt(): void {
    if (this.s.winner !== null || this.busy) return;
    if (activeCard(this.s, ME).skip) this.say('眠って（凍って）いて動けない…', '#b8a8ff');
    else this.say(this.view.attacking ? 'あなたの攻撃！ 技をえらぼう' : '相手の攻撃！ 守り方をえらぼう', this.view.attacking ? '#ff8a8a' : '#8ac4ff');
    if (this.auto) this.time.delayedCall(500, () => this.auto && !this.busy && !this.chooser && this.choose(aiAction(this.s, ME, this.rng)));
    else this.startTimer(() => this.timeUp());
  }

  // ---------------- 1ターン30秒 ----------------

  private timerText?: Phaser.GameObjects.Text;
  private timerEvent?: Phaser.Time.TimerEvent;
  private timeLeft = TURN_SECONDS;

  /** 時間を数える。0になったら onEnd */
  private startTimer(onEnd: () => void): void {
    this.stopTimer();
    this.timeLeft = TURN_SECONDS;
    this.showTimer();
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: TURN_SECONDS - 1,
      callback: () => {
        this.timeLeft--;
        this.showTimer();
        if (this.timeLeft <= 5 && this.timeLeft > 0) audio.se('beep');
        if (this.timeLeft <= 0) {
          this.stopTimer();
          onEnd();
        }
      },
    });
  }

  private stopTimer(): void {
    this.timerEvent?.remove();
    this.timerEvent = undefined;
    this.timerText?.setVisible(false);
  }

  private showTimer(): void {
    if (!this.timerText) this.timerText = this.text(W - 62, midY(), '', 30, '#ffffff').setDepth(350).setPadding(14, 4, 14, 6);
    const low = this.timeLeft <= 10;
    // カードを選んでいるときは、選ぶ画面の上に出す
    this.timerText.setPosition(this.chooser ? W / 2 : W - 62, this.chooser ? H / 2 - 270 : midY() - 4).setVisible(true).setText(`⏱ ${this.timeLeft}`).setColor(low ? '#ff4a4a' : '#ffffff').setBackgroundColor(low ? '#3a0a10dd' : '#0a0408cc');
  }

  /** 【仮】時間切れ: 攻撃側なら通常攻撃、防御側なら防御(眠っていれば「動けない」) */
  private timeUp(): void {
    if (this.busy || this.s.winner !== null) return;
    this.chooser?.destroy();
    this.chooser = undefined;
    const legal = legalActions(this.s, ME);
    const want: BattleAction = this.view.attacking ? { type: 'attack', kind: 'normal' } : { type: 'defend', kind: 'guard' };
    this.say('時間切れ！', '#ff6a6a');
    this.choose(legal.some((l) => JSON.stringify(l) === JSON.stringify(want)) ? want : legal[0]);
  }

  // ---------------- カードを選ぶ(交代・倒されたあと) ----------------

  private chooser?: Phaser.GameObjects.Container;
  /** このターンの防御(防御成功の音を鳴らすため) */
  private roundDefense?: { side: Side; kind: string };

  /**
   * 控えのカードを大きく並べて選ぶ(企画者 2026-10-26: 倒されたときと、自分で交代するときはカードを選びたい)。
   * switch: 自分で交代(やめられる)。down: 倒されたあと(必ず選ぶ。時間切れなら控えの若い番号)
   */
  private openChooser(mode: 'switch' | 'down'): void {
    if (this.chooser || (mode === 'switch' && this.busy)) return;
    audio.se('tap');
    const team = this.s.teams[ME];
    const options = team.cards.map((c, i) => ({ c, i })).filter(({ c, i }) => !c.down && i !== team.active);
    if (!options.length) return;
    const box = this.add.container(0, 0).setDepth(300);
    this.chooser = box;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
    box.add([dim, this.text(W / 2, H / 2 - 330, mode === 'down' ? '次に出すカードを えらんでね' : '交代するカードを えらんでね', 40, mode === 'down' ? '#ff8a8a' : '#7dffa0')]);
    const s = 1.0;
    options.forEach(({ c, i }, k) => {
      const x = W / 2 + (k - (options.length - 1) / 2) * (MYTH_CARD_W * s * 0.9 + 40);
      const y = H / 2;
      const img = this.add.image(x, y, this.cardTexture(c.id, false)).setScale(s * 0.8);
      this.tweens.add({ targets: img, scale: s * 0.9, duration: 180, ease: 'Back.easeOut' });
      const hp = this.text(x, y + (MYTH_CARD_H * s * 0.9) / 2 + 26, `HP ${c.hp} / ${c.def.maxHp}${c.skip ? '・' + STATUS_LABELS[c.skip] : ''}${c.dot ? '・' + STATUS_LABELS[c.dot] : ''}`, 26, '#ffffff');
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.chosen(mode, i));
      box.add([img, hp]);
    });
    if (mode === 'switch') {
      const cancel = this.text(W / 2, H / 2 + 300, 'やめる', 32, '#ffffff').setBackgroundColor('#8a35e0').setPadding(28, 8, 28, 10).setInteractive({ useHandCursor: true });
      cancel.on('pointerdown', () => {
        audio.se('back');
        box.destroy();
        this.chooser = undefined;
      });
      box.add(cancel);
    } else {
      this.startTimer(() => this.chosen('down', options[0].i));
      if (this.auto) this.time.delayedCall(600, () => this.chooser === box && this.chosen('down', options[0].i));
    }
  }

  private chosen(mode: 'switch' | 'down', index: number): void {
    this.chooser?.destroy();
    this.chooser = undefined;
    if (mode === 'switch') {
      this.choose({ type: 'switch', to: index });
      return;
    }
    // 倒されたあと: 選んだカードを出して、次のターンへ
    this.stopTimer();
    audio.se('select');
    this.busy = true;
    this.play(eventsFor(this.s, ME, replaceDowned(this.s, ME, index)), 0);
  }

  // ---------------- ターンを進める ----------------

  private choose(mine: BattleAction): void {
    if (this.busy || this.s.winner !== null) return;
    this.busy = true;
    this.stopTimer();
    this.roundDefense = undefined;
    audio.se('select');
    const theirs = aiAction(this.s, CPU, this.rng);
    // 自分のカードが倒されたら、あとで選ぶ(相手は控えの若い番号)
    const events = eventsFor(this.s, ME, resolveRound(this.s, [mine, theirs], (side) => (side === ME ? null : undefined)));
    this.render();
    this.play(events, 0);
  }

  /** 出来事を1つずつ見せる(HPの数字や絵は、出来事ごとに動かす) */
  private play(events: BattleEvent[], i: number): void {
    if (i >= events.length) {
      this.view = viewFor(this.s, ME);
      for (const side of [ME, CPU]) this.shownHp[side] = activeCard(this.s, side).hp;
      this.busy = false;
      this.render();
      if (this.s.winner !== null) this.showResult();
      else if (this.s.pending?.includes(ME)) this.openChooser('down');
      else this.prompt();
      return;
    }
    const e = events[i];
    const wait = this.show(e, events.slice(i + 1));
    this.time.delayedCall(wait, () => this.play(events, i + 1));
  }

  /** 出来事を1つ見せて、次まで待つ時間(ミリ秒)を返す */
  private show(e: BattleEvent, later: BattleEvent[]): number {
    const who = (side: Side) => (side === ME ? 'あなた' : '相手');
    const name = (id: number) => card(id)?.name ?? '';
    switch (e.type) {
      case 'attack': {
        const img = this.cardImg[e.side];
        const from = cardPos(e.side);
        const to = cardPos(e.side === ME ? CPU : ME);
        const lunge = () => img && this.tweens.add({ targets: img, y: img.y + (e.side === ME ? -80 : 80), duration: 120, yoyo: true, ease: 'Cubic.easeOut' });
        this.say(`${name(e.id)}の ${ACTION_LABELS[e.kind]}！`, e.side === ME ? '#ff8a8a' : '#8ac4ff');
        if (e.kind === 'magic') {
          // 属性ごとの魔法の演出と音(雷なら相手に雷が落ちる。企画者 2026-10-26)
          const el = card(e.id)!.magic.element;
          audio.se(MAGIC_SE[el]);
          return magicFx(this, el, from, to) + 100;
        }
        if (e.kind === 'special') {
          // 必殺技: カットイン → 体当たり → 大きな当たり(カウンターされたら、当たりはカウンターの演出で)
          const countered = later.some((x) => x.type === 'counter' && x.success);
          audio.se('mcCutin');
          const cut = specialCutin(this, this.cardTexture(e.id, e.side === CPU && !this.s.teams[CPU].cards[this.s.teams[CPU].active].magicRevealed), name(e.id), e.side === ME);
          this.time.delayedCall(cut - 150, () => {
            lunge();
            audio.se('mcSpecial');
            if (!countered) this.time.delayedCall(380, () => impactFx(this, to, 0xff5a3a, true));
          });
          return cut + 600;
        }
        lunge();
        audio.se('mcSlash');
        this.time.delayedCall(60, () => slashFx(this, to));
        return 700;
      }
      case 'defend':
        this.roundDefense = { side: e.side, kind: e.kind };
        this.say(`${who(e.side)}は ${ACTION_LABELS[e.kind]}`, '#d8d8ff');
        return 450;
      case 'counter':
        this.say(e.success ? 'カウンター成功！' : 'カウンター失敗…', e.success ? '#7dffa0' : '#ffb070');
        if (!e.success) {
          audio.se('knock');
          return 550;
        }
        audio.se('mcCounter');
        return counterFx(this, cardPos(e.side), cardPos(e.side === ME ? CPU : ME));
      case 'damage': {
        this.shownHp[e.side] = Math.max(0, this.shownHp[e.side] - e.amount);
        this.drawHp(e.side);
        const img = this.cardImg[e.side];
        if (img) {
          this.tweens.add({ targets: img, angle: { from: -4, to: 4 }, duration: 50, yoyo: true, repeat: 2, onComplete: () => img.setAngle(0) });
          img.setTint(0xff7070);
          this.time.delayedCall(80, () => img.clearTint());
        }
        const p = cardPos(e.side);
        this.popup(p.x, p.y - 40, e.amount > 0 ? `-${e.amount}` : e.absorbed ? 'バリア！' : '0', e.source === 'dot' ? '#c070ff' : '#ff4a4a');
        if (e.absorbed > 0 && e.amount > 0) this.popup(p.x, p.y + 30, `バリア -${e.absorbed}`, '#8ac4ff');
        if (e.source === 'dot') this.say(`${name(e.id)}は 毒・火傷のダメージ`, '#c070ff');
        // 防御で半分にしたとき(通常攻撃を防御・魔法を魔法防御)は「防御成功」の音。
        // 攻撃・必殺・魔法の当たる音は、攻撃したときの音(企画者のファイル)に入っているので、ここでは鳴らさない
        const d = this.roundDefense;
        if (d?.side === e.side && e.source === 'normal' && d.kind === 'guard') audio.se('mcGuardOk');
        else if (d?.side === e.side && e.source === 'magic' && d.kind === 'magicGuard') audio.se('mcMagicGuardOk');
        else if (e.amount > 0 && (e.source === 'reflect' || e.source === 'dot')) audio.se('mcHit', { pitch: Math.min(1.6, 0.8 + e.amount / 60) });
        this.cameras.main.shake(120, e.amount >= 30 ? 0.008 : 0.004);
        return 650;
      }
      case 'heal': {
        this.shownHp[e.side] = Math.min(activeCard(this.s, e.side).def.maxHp, this.shownHp[e.side] + e.amount);
        this.drawHp(e.side);
        const p = cardPos(e.side);
        this.popup(p.x, p.y - 40, `+${e.amount}`, '#4ade80');
        // HP吸収の魔法は吸収の音、それ以外の回復は回復の音
        audio.se(e.source === 'drain' ? 'mcDrain' : 'mcHeal');
        return 550;
      }
      case 'status':
        if (!e.applied) {
          this.say(`${STATUS_LABELS[e.status]}は 効かなかった`, '#b8a8c8');
          return 450;
        }
        this.say(`${name(e.id)}は ${STATUS_LABELS[e.status]}になった！`, '#ffd23a');
        this.popup(cardPos(e.side).x, cardPos(e.side).y + 60, STATUS_LABELS[e.status], '#ffd23a');
        // 強化・バリアは「ステータス上昇」の音
        audio.se(e.status === 'poison' ? 'mcPoison' : e.status === 'boost' || e.status === 'shield' ? 'mcBuff' : 'boing');
        return 600;
      case 'skip':
        this.say(`${name(e.id)}は ${e.reason === 'sleep' ? '眠っていて' : '凍っていて'}動けない`, '#b8a8ff');
        return 650;
      case 'ability':
        this.say(`特性「${abilityOf(e.code)?.name ?? ''}」！`, '#ffd23a');
        audio.se('sting');
        return 650;
      case 'endure':
        this.say(`${name(e.id)}は 踏みとどまった！`, '#ffd23a');
        return 650;
      case 'magicReveal':
        this.say(`魔法の属性は「${e.element}」`, '#d8b0ff');
        return 500;
      case 'down': {
        const img = this.cardImg[e.side];
        if (img) this.tweens.add({ targets: img, alpha: 0.25, angle: e.side === ME ? -10 : 10, y: img.y + 30, duration: 400 });
        this.say(`${name(e.id)}は 戦闘不能！`, '#ff6a6a');
        audio.se('koBlast');
        return 900;
      }
      case 'switch':
      case 'enter': {
        // 入れかわったカードを出す(相手のカードも、ここで場に出たので見せてよい)
        this.view = viewFor(this.s, ME);
        const id = e.type === 'switch' ? e.to : e.id;
        this.shownHp[e.side] = this.s.teams[e.side].cards.find((c) => c.id === id)?.hp ?? this.shownHp[e.side];
        const busy = this.busy;
        this.render();
        this.busy = busy;
        this.say(`${who(e.side)}は ${name(id)}を 出した`, '#ffffff');
        audio.se('whoosh');
        const img = this.cardImg[e.side];
        if (img) {
          img.setAlpha(0).setY(img.y - 40);
          this.tweens.add({ targets: img, alpha: 1, y: img.y + 40, duration: 260, ease: 'Back.easeOut' });
        }
        return 700;
      }
      case 'end':
        return 300;
    }
  }

  /** カードを大きく見る。見せてよいカードだけ(相手のまだ出ていないカードは出さない) */
  private zoom(side: Side, index: number): void {
    const v = viewFor(this.s, ME);
    const c = (side === ME ? v.me : v.opponent)[index];
    if (!c || c.hidden) return;
    const st = this.s.teams[side].cards[index];
    // 出来事を見せている間は、まだ見せていないHPを出さないように、場のカードは見えているHPにする
    const hp = this.busy && index === this.s.teams[side].active ? this.shownHp[side] : c.hp;
    const marks = [c.down && '戦闘不能', c.skip && STATUS_LABELS[c.skip], c.dot && STATUS_LABELS[c.dot], st.shield > 0 && `バリア${st.shield}`].filter(Boolean);
    showCardZoom(this, this.cardTexture(c.id, side === CPU && !c.magicElement), [`HP ${hp} / ${c.maxHp}`, ...(marks.length ? [marks.join('・')] : [])]);
  }

  private drawHp(side: Side): void {
    const bar = this.hpBar[side];
    if (!bar) return;
    const act = activeCard(this.s, side);
    // まだ見せていないカードのHPは出さない(相手の場のカードは出ているので見せてよい)
    const max = act.def.maxHp;
    const hp = this.shownHp[side];
    const mine = side === ME;
    const top = panelY(side) - 42;
    const bx = 40;
    const bw = W - 240;
    bar.clear();
    bar.fillStyle(0x000000, 1).fillRoundedRect(bx, top + 46, bw, 24, 8);
    const rate = Math.max(0, Math.min(1, hp / max));
    bar.fillStyle(mine ? 0xd83030 : 0x2a7ae8, 1).fillRoundedRect(bx, top + 46, Math.max(1, bw * rate), 24, 8);
    this.hpText[side]?.setText(`${hp} / ${max}`);
    // 札の下の HP バー
    const cb = this.cardHpBar[side];
    if (cb) {
      cb.bar.clear();
      cb.bar.fillStyle(0x000000, 1).fillRoundedRect(cb.x, cb.y, cb.w, 16, 6);
      cb.bar.fillStyle(rate > 0.5 ? 0x4ade80 : rate > 0.25 ? 0xffd23a : 0xff4a4a, 1).fillRoundedRect(cb.x, cb.y, Math.max(1, cb.w * rate), 16, 6);
      cb.text.setText(`HP ${hp} / ${max}`);
    }
  }

  private popup(x: number, y: number, s: string, color: string): void {
    const t = this.text(x, y, s, 52, color).setStroke('#16101c', 10).setDepth(50);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private say(s: string, color: string): void {
    this.message?.setText(s).setColor(color);
  }

  private showResult(): void {
    const w = this.s.winner;
    const win = w === ME;
    const label = w === 'draw' ? 'DRAW' : win ? 'WIN!' : 'LOSE…';
    audio.se(win ? 'cheer' : 'back');
    const box = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const t = this.text(W / 2, H / 2 - 150, label, 110, win ? '#ffd23a' : w === 'draw' ? '#ffffff' : '#8ac4ff').setStroke('#16101c', 14).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    const sub = this.text(W / 2, H / 2 - 40, `${this.s.round - 1}ターンで決着`, 30, '#ffffff');
    const again = this.text(W / 2 - 150, H / 2 + 80, 'もう一度', 36, '#16101c').setBackgroundColor('#ffd23a').setPadding(28, 10, 28, 12).setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => this.scene.restart());
    const back = this.text(W / 2 + 150, H / 2 + 80, 'もどる', 36, '#ffffff').setBackgroundColor('#8a35e0').setPadding(28, 10, 28, 12).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    box.add([dim, t, sub, again, back]);
  }

  private leave(): void {
    audio.se('back');
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MythTitle'));
  }

  private cardTexture(id: number, hideMagic: boolean): string {
    return canvasTextureOnce(this, cardKey(id, hideMagic), MYTH_CARD_W, MYTH_CARD_H, (ctx) => drawMythCard(ctx, card(id)!, { hideMagicElement: hideMagic }));
  }

  private text(x: number, y: number, s: string, size: number, color: string, ox = 0.5): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(ox, 0.5);
  }
}
