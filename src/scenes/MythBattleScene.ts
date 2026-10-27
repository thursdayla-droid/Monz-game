import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { cpuAction, cpuReplacement, CPU_LABELS, type CpuLevel } from '../core/mythclash/cpu';
import { BATTLE_MODE, BATTLES_PER_FLOOR, TOWER_FLOORS, towerBattle, type MythMatch } from '../core/mythclash/modes';
import { newTowerRun } from './MythTowerScene';
import { MYTH_CARD_BACK } from '../ui/packBuy';
import { opponentFor } from '../core/mythclash/opponents';
import { opponentFaceTexture } from '../ui/opponentFace';
import { abilityOf } from '../core/mythclash/abilities';
import { card, RARITIES, type Element } from '../core/mythclash/cards';
import type { SeName } from '../audio/sfx';
import { coinTossFx, counterFx, impactFx, magicFx, slashFx, specialCutin } from '../ui/mythFx';
import { activeCard, createBattle, legalActions, replaceDowned, resolveRound, surrender, type BattleAction, type BattleEvent, type BattleState, type Side } from '../core/mythclash/engine';
import { battleUnlocked, deckOwned, newCollection } from '../core/mythclash/packs';
import { aiAction, randomDeck } from '../core/mythclash/sim';
import { eventsFor, viewFor, type BattleView } from '../core/mythclash/view';
import { describeAbility, describeMagicEffect } from '../core/mythclash/describe';
import { ELEMENT_COLORS } from '../ui/mythCardArt';
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
/** 相手の板で、顔の分だけ右へずらす */
const FACE_SHIFT = 76;
const ATTACK_COLOR = 0xff3a3a;
const DEFENSE_COLOR = 0x3a9dff;

/** 1ターンの秒数(企画者 2026-10-26) */
const TURN_SECONDS = 30;
const MAGIC_SE: Record<Element, SeName> = { 炎: 'mcFire', 水: 'mcWater', 雷: 'mcThunder', 自然: 'mcNature', 光: 'mcLight', 闇: 'mcDark', 無: 'mcMagic' };
/** 防御の見た目(色・マーク) */
const DEFENSE_LOOK: Record<string, { color: number; bg: string; icon: string }> = {
  guard: { color: 0x3a9dff, bg: '#1f5fc8', icon: '🛡' },
  magicGuard: { color: 0xb84aff, bg: '#7a2ac8', icon: '✨' },
  counter: { color: 0xff9a2a, bg: '#c86a10', icon: '⚡' },
};
const ACTION_LABELS: Record<string, string> = { normal: '通常攻撃', special: '必殺技', magic: '魔法', guard: '防御', counter: 'カウンター', magicGuard: '魔法防御' };
const STATUS_LABELS: Record<string, string> = { sleep: '睡眠', freeze: '凍結', poison: '毒', burn: '火傷', weaken: '攻撃ダウン', boost: '強化', shield: 'バリア' };
const cardKey = (id: number, hideMagic: boolean) => `mc:card:${id}${hideMagic ? ':h' : ''}`;

/**
 * MYTHCLASH のバトル画面(企画者のイメージ図 2026-10-26 をもとに)。相手はCPU。
 * - 攻撃側と防御側がわかりやすいように: 攻撃側のカードは赤く光って「ATTACK」、防御側は青く光って「DEFENSE」、まん中の矢印は攻撃の向き。
 *   下のボタンも、攻撃側なら 通常攻撃・必殺技・魔法、防御側なら 防御・魔法防御・カウンター
 * - 見せる情報は viewFor / eventsFor を通したものだけ(相手のまだ出ていないカード・使っていない魔法の属性は見せない)
 * - 自分のデッキはデッキ編成で選んだ3枚。どの戦いか(match)で相手が変わる(企画者 2026-10-27):
 *   ストーリー = その階の決まった相手(ざこ2戦 → ボス)。勝つと次の戦い、ボスに勝つと階クリア(報酬)。負けたら その階の1戦目から
 *   バトルモード = CPUの強さのレアからランダムな3枚。勝つとコインと経験値(負けは0)
 * 【仮】曲はタイトルと同じ
 */
export class MythBattleScene extends Phaser.Scene {
  private s!: BattleState;
  private view!: BattleView;
  private rng!: Rng;
  private busy = false;
  private auto = false;
  private ui?: Phaser.GameObjects.Container;
  private cardImg: Partial<Record<Side, Phaser.GameObjects.Image>> = {};
  private shownHp: Record<Side, number> = { 0: 0, 1: 0 };
  /**
   * HPバーの動き(企画者 2026-10-27: HPのゲージとダメージ量が分かりにくい)。
   * disp: いま見えているHP(数字とバー)。ghost: 減った分を白く残しておく所(少しおくれて追いつく)
   */
  private hpFx: Record<Side, { disp: number; ghost: number; on: boolean }> = { 0: { disp: 0, ghost: 0, on: false }, 1: { disp: 0, ghost: 0, on: false } };
  private hpBar: Partial<Record<Side, Phaser.GameObjects.Graphics>> = {};
  private hpText: Partial<Record<Side, Phaser.GameObjects.Text>> = {};
  private cardHpBar: Partial<Record<Side, { bar: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; x: number; y: number; w: number }>> = {};
  private message?: Phaser.GameObjects.Text;
  private autoBtn?: Phaser.GameObjects.Text;

  constructor() {
    super('MythBattle');
  }

  /** デッキ編成で選んだ3枚(無ければ前に組んだデッキ) */
  private chosenDeck: number[] | null = null;
  /** どのモードの戦いか(無いときは確認用のバトル: 相手はランダム・CPU普通・報酬なし) */
  private match?: MythMatch;
  private level: CpuLevel = 'normal';
  /** このバトルの報酬の番号(バトルモード。2回もらわないように) */
  private battleRun = '';

  init(data: { deck?: number[] | null; match?: MythMatch }): void {
    this.chosenDeck = data?.deck ?? null;
    this.match = data?.match;
    this.clearBadges();
    this.fitSize();
    this.busy = false;
    this.auto = false;
    this.chooser = undefined;
    this.surrenderBox = undefined;
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
    audio.preloadSe(['mcSlash', 'mcSpecial', 'mcGuardOk', 'mcPoison', 'mcHeal', 'mcThunder', 'mcNature', 'mcFire', 'mcLight', 'mcDark', 'mcDrain', 'mcMagicGuardOk', 'mcBuff', 'mcWater', 'mcCounter', 'mcCutin', 'mcBurn', 'mcMagic', 'mcSelect']);
    this.drawBackground();
    const seed = newSeed();
    this.rng = mulberry32(seed ^ 0x5bd1e995);
    const deckRng = mulberry32(seed);
    const mine = this.pickMyDeck(deckRng);
    const m = this.match;
    const theirs = m?.mode === 'tower' ? [...towerBattle(m.floor, m.battle).deck] : randomDeck(deckRng, m?.mode === 'battle' ? BATTLE_MODE[m.level].rarities : undefined);
    this.level = m?.mode === 'tower' ? towerBattle(m.floor, m.battle).cpu : m?.mode === 'battle' ? m.level : 'normal';
    this.battleRun = `myth:battle:${seed.toString(36)}:${Date.now().toString(36)}`;
    const { state } = createBattle(mine, theirs, seed);
    this.s = state;
    for (const side of [ME, CPU]) this.shownHp[side] = activeCard(state, side).hp;
    this.view = viewFor(state, ME);
    this.render();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('mythclash');
    const intro = this.matchIntro();
    if (intro) this.banner(intro.main, intro.sub, intro.color);
    else this.say('バトル開始！', '#ffffff');
    this.time.delayedCall(intro ? 2600 : 900, () => this.prompt());
  }

  /** デッキ編成で選んだ3枚(企画者 2026-10-26)。無ければ前に組んだデッキ・レアの高い3枚。3種類なければテスト用のランダム */
  private pickMyDeck(rng: Rng): number[] {
    const col = loadLife().mythclash ?? newCollection();
    if (this.chosenDeck && deckOwned(col, this.chosenDeck)) return [...this.chosenDeck];
    if (col.deck && deckOwned(col, col.deck)) return [...col.deck];
    // デッキ編成を通らずに開いたとき(確認用)だけ。ふつうは来ない
    if (!battleUnlocked(col)) return randomDeck(rng);
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
      // 相手の顔(企画者 2026-10-27: 戦っている時に相手の顔)。板の左はしに丸く出して、名前とHPは右へずらす
      const op = !mine && this.match ? opponentFor(this.match) : null;
      const lx = op ? 40 + FACE_SHIFT : 40;
      if (op) ui.add(this.add.image(20 + FACE_SHIFT / 2 + 6, top + 42, opponentFaceTexture(this, op, 40, this.isBoss())));
      ui.add(this.text(lx, top + 24, mine ? 'あなた' : op ? op.name : this.isBoss() ? 'BOSS' : 'CPU', 22, mine ? '#b8a8c8' : this.isBoss() ? '#ff5a5a' : '#ffd890', 0));
      if (act && !act.hidden) ui.add(this.text(lx + (op ? 150 : 90), top + 24, act.name, 26, '#ffffff', 0));
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
          // まだ出ていない相手のカードは、裏面(企画者の絵 2026-10-27)
          const back = this.add.image(x, y, MYTH_CARD_BACK);
          back.setScale(Math.min(92 / back.width, 120 / back.height));
          ui.add(back);
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
    ui.add([tg, this.text(58, my - 28, 'TURN', 18, '#d8b060'), this.text(58, my + 2, String(v.round), 32, '#ffffff'), this.text(58, my + 32, v.half === 1 ? '前半' : '後半', 18, '#ffd23a')]);
    // 降参(まん中の右、残り秒数の下)
    if (this.s.winner === null) {
      const giveUp = this.text(W - 62, my + 34, '🏳 降参', 20, '#ffffff').setBackgroundColor('#3a2a4acc').setPadding(10, 4, 10, 6).setInteractive({ useHandCursor: true });
      giveUp.on('pointerdown', () => this.confirmSurrender());
      ui.add(giveUp);
    }
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
      // 追加効果(毒・能力ダウンなど)は、カードの上に大きく(企画者 2026-10-26: 分かりにくいのでカードに表示)
      this.statusChips(ui, side, x, y);
      if (st.specialLock && side === ME) ui.add(this.text(sx, y - ch / 2 + 128, '必殺は次のターン\n使えない', 20, '#ffd23a', 0).setBackgroundColor('#0a0408cc').setPadding(8, 2, 8, 4));
    }
    this.buildInfo(ui);
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
   * 場のカードの左に、魔法と特性の説明(企画者 2026-10-26)。
   * 魔法: 自分のカードはいつも。相手のカードは、そのカードが一度魔法を使ったら(属性が公開されたら)。特性: 特性があるカードだけ
   * (前に作った「相手から受けるダメージの目安」は、企画者「いらない」で外した)
   */
  private buildInfo(ui: Phaser.GameObjects.Container): void {
    const v = this.view;
    for (const side of [ME, CPU]) {
      const c = (side === ME ? v.me : v.opponent).find((x) => !x.hidden && x.active);
      if (!c || c.hidden) continue;
      const def = card(c.id)!;
      const ab = abilityOf(def.abilityCode);
      const known = side === ME || !!c.magicElement;
      const p = cardPos(side);
      const x0 = 12;
      const w = W / 2 - (MYTH_CARD_W * cardScale()) / 2 - 24;
      const top = p.y - cardH() / 2 + 6;
      const box = this.add.container(0, 0);
      const g = this.add.graphics();
      box.add(g);
      let y = top + 12;
      const line = (s: string, size: number, color: string) => {
        const t = this.text(x0 + 10, y, s, size, color, 0).setOrigin(0, 0).setWordWrapWidth(w - 20, true).setAlign('left');
        box.add(t);
        y += t.height + 4;
      };
      line('魔法', 15, '#b8a8c8');
      if (known) {
        line(`${def.magic.name}`, 18, '#ffffff');
        line(`属性：${def.magic.element}`, 16, ELEMENT_COLORS[def.magic.element]);
        line(describeMagicEffect(def), 15, '#d8c8e8');
      } else line('？？？', 16, '#8a7a90');
      if (ab && ab.def.kind !== 'none' && ab.name) {
        y += 8;
        line('特性', 15, '#b8a8c8');
        line(ab.name, 18, '#ffd23a');
        line(describeAbility(ab), 15, '#d8c8e8');
      }
      const h = y - top + 8;
      g.fillStyle(0x0a0408, 0.82).fillRoundedRect(x0, top, w, h, 12);
      g.lineStyle(2, side === ME ? 0xc0182a : 0x2a6ad8, 1).strokeRoundedRect(x0, top, w, h, 12);
      ui.add(box);
    }
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
      // 攻撃のボタンは属性の色(企画者 2026-10-26): 通常攻撃・必殺技はカードの属性、魔法は魔法の属性。文字は変えない
      const me = activeCard(this.s, ME).def;
      const act = 'action' in b && b.action?.type === 'attack' ? b.action.kind : null;
      const el = act === 'magic' ? me.magic.element : act ? me.element : null;
      const color = isSwitch ? 0x2a7a4a : el ? Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[el]).color : attacking ? 0x8a1020 : 0x1a4a9a;
      const darkText = el === '光' || el === '雷' || el === '無';
      const g = this.add.graphics();
      const enabled = b.on && !this.busy && this.s.winner === null;
      g.fillStyle(enabled ? color : 0x3a3040, 1).fillRoundedRect(x - bw / 2, y - 40, bw, 80, 12);
      g.lineStyle(3, enabled ? 0xd8b060 : 0x5a5060, 1).strokeRoundedRect(x - bw / 2, y - 40, bw, 80, 12);
      const label = b.label;
      const t = this.text(x, y, label, label.length > 6 ? 20 : label.length > 4 ? 24 : 28, !enabled ? '#8a8090' : darkText ? '#16101c' : '#ffffff');
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
    else {
      const h = this.view.half === 1 ? '前半' : '後半';
      this.say(this.view.attacking ? `${h}：あなたの攻撃！ 技をえらぼう` : `${h}：相手の攻撃！ 守り方をえらぼう`, this.view.attacking ? '#ff8a8a' : '#8ac4ff');
    }
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
    this.timerText.setPosition(this.chooser ? W / 2 : W - 62, this.chooser ? H / 2 - 270 : midY() - 24).setVisible(true).setText(`⏱ ${this.timeLeft}`).setColor(low ? '#ff4a4a' : '#ffffff').setBackgroundColor(low ? '#3a0a10dd' : '#0a0408cc');
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
    // 行動を選んだときの音(企画者のファイル)
    audio.se('mcSelect');
    const theirs = cpuAction(this.s, CPU, this.level, this.rng);
    // 自分のカードが倒されたら、あとで選ぶ(相手はCPUの強さで選ぶ。強いCPUは相性のよいカード)
    const events = eventsFor(this.s, ME, resolveRound(this.s, [mine, theirs], (side, alive) => (side === ME ? null : cpuReplacement(this.s, side, this.level, alive))));
    this.render();
    this.play(events, 0);
  }

  /** 出来事を1つずつ見せる(HPの数字や絵は、出来事ごとに動かす) */
  private play(events: BattleEvent[], i: number): void {
    if (i >= events.length) {
      this.view = viewFor(this.s, ME);
      for (const side of [ME, CPU]) {
        this.shownHp[side] = activeCard(this.s, side).hp;
        // 動いている途中のHPバーは、そのまま最後まで動かす(値は同じになる)
      }
      this.busy = false;
      this.clearBadges();
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
        this.showAttack(e.side, e.kind, e.id);
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
        // 攻撃側の選んだ行動を先に、つぎに防御側(どちらも出したまま)
        {
          const a = later.find((x) => x.type === 'attack');
          if (a && a.type === 'attack') {
            this.showAttack(a.side, a.kind, a.id);
            this.say(`${who(a.side)}は ${ACTION_LABELS[a.kind]}！ ${who(e.side)}は ${ACTION_LABELS[e.kind]}`, '#ffffff');
            this.time.delayedCall(450, () => this.showDefense(e.side, e.kind));
            return 1250;
          }
        }
        this.say(`${who(e.side)}は ${ACTION_LABELS[e.kind]}`, '#d8d8ff');
        this.showDefense(e.side, e.kind);
        return 650;
      case 'counter':
        this.say(e.success ? 'カウンター成功！' : 'カウンター失敗…', e.success ? '#7dffa0' : '#ffb070');
        if (!e.success) {
          audio.se('knock');
          return 550;
        }
        audio.se('mcCounter');
        return counterFx(this, cardPos(e.side), cardPos(e.side === ME ? CPU : ME));
      case 'damage': {
        const before = this.shownHp[e.side];
        this.shownHp[e.side] = Math.max(0, before - e.amount);
        this.animateHp(e.side, before, this.shownHp[e.side]);
        const img = this.cardImg[e.side];
        if (img) {
          this.tweens.add({ targets: img, angle: { from: -4, to: 4 }, duration: 50, yoyo: true, repeat: 2, onComplete: () => img.setAngle(0) });
          img.setTint(0xff7070);
          this.time.delayedCall(80, () => img.clearTint());
        }
        // 防御で半分にしたとき(通常攻撃を防御・魔法を魔法防御)は「防御成功」の音。
        // 攻撃・必殺・魔法の当たる音は、攻撃したときの音(企画者のファイル)に入っているので、ここでは鳴らさない
        const d = this.roundDefense;
        const halved = d?.side === e.side && ((e.source === 'normal' && d.kind === 'guard') || (e.source === 'magic' && d.kind === 'magicGuard'));
        const dot = this.s.teams[e.side].cards.find((c) => c.id === e.id)?.dot;
        const note = e.source === 'dot' ? (dot === 'burn' ? '火傷' : '毒') : e.source === 'reflect' ? 'はね返し！' : halved ? (d?.kind === 'guard' ? '防御で半分' : '魔法防御で半分') : e.absorbed > 0 ? `バリアが ${e.absorbed} 防いだ` : undefined;
        this.damagePopup(e.side, e.amount > 0 ? `-${e.amount}` : '0', e.source === 'dot' ? '#d080ff' : e.amount >= 40 ? '#ff2a2a' : '#ff5a4a', note);
        if (e.source === 'dot') this.say(`${name(e.id)}は ${dot === 'burn' ? '火傷' : '毒'}のダメージ ${e.amount}`, '#c070ff');
        else this.say(`${name(e.id)}に ${e.amount} のダメージ！`, '#ff8a8a');
        if (d?.side === e.side && e.source === 'normal' && d.kind === 'guard') audio.se('mcGuardOk');
        else if (d?.side === e.side && e.source === 'magic' && d.kind === 'magicGuard') audio.se('mcMagicGuardOk');
        else if (e.amount > 0 && (e.source === 'reflect' || e.source === 'dot')) audio.se('mcHit', { pitch: Math.min(1.6, 0.8 + e.amount / 60) });
        this.cameras.main.shake(120, e.amount >= 30 ? 0.008 : 0.004);
        return 1000;
      }
      case 'coinToss': {
        const label: Record<string, string> = { sleep: '睡眠', freeze: '凍結', poison: '毒', burn: '火傷', weaken: '攻撃ダウン' };
        const what = label[e.effect] ?? '追加効果';
        this.say(`${what}が効くか… コイントス！`, '#ffd23a');
        return coinTossFx(this, W / 2, midY(), e.win, `${what}のコイントス`, () => audio.se('tap', { pitch: 1.6 }), (win) => audio.se(win ? 'select' : 'back'));
      }
      case 'effectBlocked':
        this.say(`魔法防御で 追加効果を防いだ！`, '#c8a8ff');
        this.damagePopup(e.side, '🛡', '#c8a8ff', '追加効果を防いだ');
        return 800;
      case 'heal': {
        const before = this.shownHp[e.side];
        this.shownHp[e.side] = Math.min(activeCard(this.s, e.side).def.maxHp, before + e.amount);
        this.animateHp(e.side, before, this.shownHp[e.side]);
        this.damagePopup(e.side, `+${e.amount}`, '#4ade80', e.source === 'drain' ? '吸収' : '回復');
        this.say(`${name(e.id)}の HPが ${e.amount} 回復`, '#7dffa0');
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
        // カードの上のチップを、すぐに出す
        {
          const busy = this.busy;
          this.render();
          this.busy = busy;
        }
        this.popup(cardPos(e.side).x, cardPos(e.side).y + 60, STATUS_LABELS[e.status], '#ffd23a');
        // 強化・バリアは「ステータス上昇」の音
        audio.se(e.status === 'poison' ? 'mcPoison' : e.status === 'burn' ? 'mcBurn' : e.status === 'boost' || e.status === 'shield' ? 'mcBuff' : 'boing');
        return 600;
      case 'skip':
        {
          const left = this.s.teams[e.side].cards.find((c) => c.id === e.id)?.skipLeft ?? 0;
          this.say(`${name(e.id)}は ${e.reason === 'sleep' ? '眠っていて' : '凍っていて'}動けない${left > 0 ? `（あと${left}回）` : '（次から動ける）'}`, '#b8a8ff');
          const busy = this.busy;
          this.render();
          this.busy = busy;
        }
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
        this.syncHp(e.side);
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
      case 'phase': {
        // 前半・後半の始まり(企画者 2026-10-26: 素早さが高い方が前半に攻撃)。前のフェイズの防御の札は消す
        this.clearBadges();
        this.roundDefense = undefined;
        this.view = viewFor(this.s, ME);
        const busy = this.busy;
        this.render();
        this.busy = busy;
        const mine = e.attacker === ME;
        const label = `TURN ${e.round} ${e.half === 1 ? '前半' : '後半'}`;
        const sub = e.half === 1 ? `${mine ? 'あなた' : '相手'}の方が速い！ ${mine ? 'あなた' : '相手'}から攻撃` : `${mine ? 'あなた' : '相手'}の攻撃`;
        const box = this.add.container(W / 2, midY()).setDepth(70);
        const bg = this.add.rectangle(0, 0, W, 130, 0x0a0408, 0.85).setStrokeStyle(4, mine ? ATTACK_COLOR : DEFENSE_COLOR, 1);
        box.add([bg, this.text(0, -22, label, 40, '#ffd23a'), this.text(0, 28, sub, 26, mine ? '#ff8a8a' : '#8ac4ff')]);
        box.setScale(1, 0);
        this.tweens.add({ targets: box, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
        this.tweens.add({ targets: box, alpha: 0, delay: 900, duration: 200, onComplete: () => box.destroy() });
        audio.se('whoosh');
        return 1100;
      }
    }
  }

  /** 場のカードに付いている効果を、カードの絵の上にチップで出す(見えている場のカードの効果は、相手にも見せてよい) */
  private statusChips(ui: Phaser.GameObjects.Container, side: Side, x: number, y: number): void {
    const c = this.s.teams[side].cards[this.s.teams[side].active];
    const p = (r: number) => `${Math.round(r * 100)}%`;
    const chips: [string, string][] = [];
    if (c.skip === 'sleep') chips.push([`💤 睡眠 あと${c.skipLeft}回`, '#6a4ad8']);
    if (c.skip === 'freeze') chips.push([`❄ 凍結 あと${c.skipLeft}回`, '#2aa8c8']);
    if (c.dot === 'poison') chips.push(['☠ 毒', '#8a2ac8']);
    if (c.dot === 'burn') chips.push(['🔥 火傷', '#d8501a']);
    if (c.weakenNormal > 0) chips.push([`⬇ 攻撃 −${p(c.weakenNormal)}`, '#c0182a']);
    if (c.weakenMagic > 0) chips.push([`⬇ 魔法 −${p(c.weakenMagic)}`, '#c0182a']);
    if (c.boostNormal > 0) chips.push([`⬆ 攻撃 +${p(c.boostNormal)}`, '#2a9a4a']);
    if (c.boostMagic > 0) chips.push([`⬆ 魔法 +${p(c.boostMagic)}`, '#2a9a4a']);
    if (c.shield > 0) chips.push([`🛡 バリア ${c.shield}`, '#1f5fc8']);
    if (!chips.length) return;
    // カードの絵の所(上の方)に、縦にならべる
    const top = y - cardH() / 2 + 60 * cardScale();
    chips.forEach(([label, bg], i) => {
      const t = this.text(x, top + 18 + i * 40, label, 24, '#ffffff').setBackgroundColor(bg).setPadding(14, 4, 14, 6).setStroke('#16101c', 4);
      this.tweens.add({ targets: t, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      ui.add(t);
    });
  }

  /** 選んだ行動の大きな札(攻撃側・防御側) */
  private badges: Partial<Record<Side, Phaser.GameObjects.Container>> = {};

  /**
   * 防御側が何を選んだか、場のカードの上に大きく出す(企画者 2026-10-26: 防御側が何を選んだか分かりにくい)。
   * そのターンの出来事が終わるまで出しておく
   */
  private clearBadges(): void {
    for (const b of Object.values(this.badges)) b?.destroy();
    this.badges = {};
  }

  /**
   * 攻撃側が何を選んだか、攻撃側のカードの上に大きく出す(企画者 2026-10-27: 攻撃側がどの行動を選んだか分かりにくい)。
   * 通常攻撃=赤、必殺技=金、魔法=魔法の属性の色。そのフェイズの出来事が終わるまで出しておく
   */
  private showAttack(side: Side, kind: string, id: number): void {
    if (this.badges[side]) return;
    const el = card(id)!.magic.element;
    const look =
      kind === 'magic'
        ? { color: Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[el]).color, bg: '#3a1a5a', icon: '🔮' }
        : kind === 'special'
          ? { color: 0xffb020, bg: '#b86a00', icon: '💥' }
          : { color: 0xff3a3a, bg: '#c0182a', icon: '⚔' };
    this.badge(side, look, kind === 'magic' ? `${look.icon} 魔法（${el}）` : `${look.icon} ${ACTION_LABELS[kind]}`);
    audio.se('whoosh');
  }

  private badge(side: Side, look: { color: number; bg: string; icon: string }, text: string): void {
    this.badges[side]?.destroy();
    const p = cardPos(side);
    const c = this.add.container(p.x, p.y).setDepth(45);
    const cw = MYTH_CARD_W * cardScale() + 30;
    const ch = cardH() + 30;
    const ring = this.add.rectangle(0, 0, cw, ch).setStrokeStyle(10, look.color, 1);
    const glow = this.add.rectangle(0, 0, cw, ch, look.color, 0.18);
    const label = this.text(0, 0, text, 40, '#ffffff').setBackgroundColor(look.bg).setPadding(22, 8, 22, 10).setStroke('#16101c', 6);
    c.add([glow, ring, label]);
    c.setScale(1.4).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: ring, alpha: 0.4, duration: 450, yoyo: true, repeat: -1 });
    this.badges[side] = c;
  }

  private showDefense(side: Side, kind: string): void {
    const look = DEFENSE_LOOK[kind] ?? DEFENSE_LOOK.guard;
    this.badge(side, look, `${look.icon} ${ACTION_LABELS[kind]}`);
    audio.se('guard');
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

  /** HPの色: 半分より多い=緑、半分以下=黄、4分の1以下=赤(上のバーも札の下のバーも同じ) */
  private hpColor(rate: number): number {
    return rate > 0.5 ? 0x4ade80 : rate > 0.25 ? 0xffd23a : 0xff4a4a;
  }

  /** HPバーを1本かく。減った分(ghost)は白く残る。10%ごとに目もり */
  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, hp: number, ghost: number, max: number): void {
    const r = Math.max(0, Math.min(1, hp / max));
    const gr = Math.max(r, Math.min(1, ghost / max));
    g.fillStyle(0x000000, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 8);
    g.fillStyle(0x2a2030, 1).fillRoundedRect(x, y, w, h, 6);
    if (gr > r) g.fillStyle(0xffffff, 0.9).fillRect(x + w * r, y, w * (gr - r), h);
    if (r > 0) {
      g.fillStyle(this.hpColor(r), 1).fillRoundedRect(x, y, Math.max(6, w * r), h, 6);
      // つや
      g.fillStyle(0xffffff, 0.25).fillRect(x + 3, y + 3, Math.max(0, w * r - 6), h * 0.3);
    }
    g.lineStyle(2, 0x000000, 0.5);
    for (let i = 1; i < 10; i++) g.lineBetween(x + (w * i) / 10, y, x + (w * i) / 10, y + h);
  }

  private drawHp(side: Side): void {
    const bar = this.hpBar[side];
    if (!bar) return;
    const act = activeCard(this.s, side);
    // まだ見せていないカードのHPは出さない(相手の場のカードは出ているので見せてよい)
    const max = act.def.maxHp;
    const fx = this.hpFx[side];
    const hp = fx.on ? Math.round(fx.disp) : this.shownHp[side];
    const ghost = fx.on ? fx.ghost : hp;
    const top = panelY(side) - 42;
    bar.clear();
    const shift = side === CPU && this.match ? FACE_SHIFT : 0;
    this.drawBar(bar, 40 + shift, top + 44, W - 250 - shift, 28, hp, ghost, max);
    this.hpText[side]?.setText(`${hp} / ${max}`).setFontSize(28);
    // 札の下の HP バー
    const cb = this.cardHpBar[side];
    if (cb) {
      cb.bar.clear();
      this.drawBar(cb.bar, cb.x, cb.y, cb.w, 18, hp, ghost, max);
      cb.text.setText(`HP ${hp} / ${max}`);
    }
  }

  /** HPを from から to へ動かす(減るときは、減った分が白く残ってから追いつく) */
  private animateHp(side: Side, from: number, to: number): void {
    const fx = this.hpFx[side];
    this.tweens.killTweensOf(fx);
    if (!fx.on) {
      fx.disp = from;
      fx.ghost = from;
    }
    fx.on = true;
    if (to > fx.ghost) fx.ghost = to;
    this.tweens.add({ targets: fx, disp: to, duration: 320, ease: 'Cubic.easeOut', onUpdate: () => this.drawHp(side) });
    this.tweens.add({ targets: fx, ghost: to, delay: 500, duration: 450, ease: 'Cubic.easeIn', onUpdate: () => this.drawHp(side), onComplete: () => { fx.on = false; this.drawHp(side); } });
  }

  /** HPの動きを止めて、今の値にそろえる(カードが入れかわったときなど) */
  private syncHp(side: Side): void {
    const fx = this.hpFx[side];
    this.tweens.killTweensOf(fx);
    fx.on = false;
  }

  /**
   * ダメージの数字(企画者 2026-10-27: 分かりにくい)。カードのまん中に大きく、はねて出て、しばらく残る。
   * note: 数字の下に出す説明(「防御で半分」など)
   */
  private damagePopup(side: Side, text: string, color: string, note?: string): void {
    const p = cardPos(side);
    // まん中は防御の札があるので、少し上に
    const c = this.add.container(p.x, p.y - cardH() * 0.28).setDepth(55);
    const num = this.text(0, 0, text, 96, color).setStroke('#16101c', 14);
    c.add(num);
    if (note) c.add(this.text(0, 66, note, 30, '#ffffff').setBackgroundColor('#16101ccc').setPadding(12, 4, 12, 6));
    c.setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: c.y - 40, alpha: 0, delay: 950, duration: 400, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  private popup(x: number, y: number, s: string, color: string): void {
    const t = this.text(x, y, s, 52, color).setStroke('#16101c', 10).setDepth(50);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private say(s: string, color: string): void {
    this.message?.setText(s).setColor(color);
  }

  /** 降参の確認(はい → すぐ負け) */
  private confirmSurrender(): void {
    if (this.s.winner !== null || this.surrenderBox) return;
    audio.se('tap');
    const box = this.add.container(0, 0).setDepth(600);
    this.surrenderBox = box;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 560, 300, 0x1c1320, 1).setStrokeStyle(5, 0xc0182a, 1);
    const title = this.text(W / 2, H / 2 - 80, '降参する？', 40, '#ffffff');
    const note = this.text(W / 2, H / 2 - 28, 'このバトルは負けになります', 22, '#d8c8e8');
    const yes = this.text(W / 2 - 120, H / 2 + 70, '降参する', 30, '#ffffff').setBackgroundColor('#c0182a').setPadding(22, 8, 22, 10).setInteractive({ useHandCursor: true });
    const no = this.text(W / 2 + 120, H / 2 + 70, 'つづける', 30, '#16101c').setBackgroundColor('#ffd23a').setPadding(22, 8, 22, 10).setInteractive({ useHandCursor: true });
    box.add([dim, panel, title, note, yes, no]);
    no.on('pointerdown', () => {
      audio.se('back');
      box.destroy();
      this.surrenderBox = undefined;
    });
    yes.on('pointerdown', () => {
      box.destroy();
      this.surrenderBox = undefined;
      if (this.s.winner !== null) return;
      // 時間・選ぶ画面・自動を止めて、負けにする(出来事を見せている途中でも、そこで終わり)
      this.stopTimer();
      this.chooser?.destroy();
      this.chooser = undefined;
      this.auto = false;
      this.time.removeAllEvents();
      this.tweens.killAll();
      surrender(this.s, ME);
      this.busy = false;
      this.clearBadges();
      this.view = viewFor(this.s, ME);
      this.render();
      this.showResult();
    });
  }

  private surrenderBox?: Phaser.GameObjects.Container;

  private isBoss(): boolean {
    return this.match?.mode === 'tower' && towerBattle(this.match.floor, this.match.battle).boss;
  }

  /** はじめに出す帯(何階の何戦目か・CPUの強さ) */
  private matchIntro(): { main: string; sub: string; color: string } | null {
    const m = this.match;
    if (!m) return null;
    if (m.mode === 'battle') return { main: `CPU ${CPU_LABELS[m.level]}`, sub: 'バトルモード', color: '#ffd23a' };
    const boss = towerBattle(m.floor, m.battle).boss;
    return boss ? { main: `${m.floor}階 ボス戦！`, sub: 'この階のボスがあらわれた！', color: '#ff5a5a' } : { main: `${m.floor}階 ${m.battle + 1}戦目`, sub: `ボスまで あと${BATTLES_PER_FLOOR - 1 - m.battle}戦`, color: '#ffd23a' };
  }

  /**
   * まん中の大きな帯(少しで消える)。相手がいるときは、相手の顔・肩書き・名前・ひとことも出す(企画者 2026-10-27)
   */
  private banner(main: string, sub: string, color: string): void {
    const op = this.match ? opponentFor(this.match) : null;
    const c = this.add.container(W / 2, midY()).setDepth(300);
    const col = Phaser.Display.Color.HexStringToColor(color).color;
    if (!op) {
      c.add([this.add.rectangle(0, 0, W, 170, 0x0a0408, 0.85).setStrokeStyle(4, col, 1), this.text(0, -26, main, 60, color).setStroke('#16101c', 10), this.text(0, 46, sub, 26, '#ffffff')]);
    } else {
      const boss = this.isBoss();
      c.add(this.add.rectangle(0, 0, W, 300, 0x0a0408, 0.9).setStrokeStyle(4, col, 1));
      c.add(this.text(0, -118, `${main}　${sub}`, 24, color).setStroke('#16101c', 6));
      const face = this.add.image(-W / 2 + 130, 18, opponentFaceTexture(this, op, 100, boss));
      c.add(face);
      c.add(this.text(-W / 2 + 250, -48, op.title, 24, '#d8c8b0', 0));
      c.add(this.text(-W / 2 + 250, 0, op.name, 50, boss ? '#ff6a4a' : '#ffd23a', 0).setStroke('#16101c', 8));
      c.add(this.text(-W / 2 + 250, 64, `「${op.line}」`, 24, '#ffffff', 0).setWordWrapWidth(W - 280, true));
      face.setScale(0.6);
      this.tweens.add({ targets: face, scale: 1, duration: 360, ease: 'Back.easeOut' });
    }
    c.setScale(1, 0.1);
    this.tweens.add({ targets: c, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: op ? 2300 : 1300, duration: 300, onComplete: () => c.destroy() });
  }

  /**
   * 結果。報酬(企画者 2026-10-27): バトルモードは勝ったときだけ。ストーリーはボスに勝って階をクリアしたとき(はじめては多く、クリアずみは2割)。
   * 負け・降参・引き分けは0。経験値はお世話しているMONZに入る
   */
  private showResult(): void {
    const w = this.s.winner;
    const win = w === ME;
    const m = this.match;
    const label = w === 'draw' ? 'DRAW' : win ? 'WIN!' : 'LOSE…';
    audio.se(win ? 'cheer' : 'back');
    const box = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const t = this.text(W / 2, H / 2 - 190, label, 110, win ? '#ffd23a' : w === 'draw' ? '#ffffff' : '#8ac4ff').setStroke('#16101c', 14).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    const sub = this.text(W / 2, H / 2 - 80, this.s.surrendered === ME ? '降参しました' : `${this.s.round}ターンで決着`, 30, '#ffffff');
    box.add([dim, t, sub]);
    const lines: [string, string][] = [];
    const buttons: [string, () => void][] = [];
    const deck = this.chosenDeck;
    if (m?.mode === 'tower') {
      const toTower = () => this.leave('MythTower');
      const boss = towerBattle(m.floor, m.battle).boss;
      if (win && !boss) {
        lines.push([`${m.floor}階 ${m.battle + 1}戦目 突破！ HPは全部もどるよ`, '#7dffa0']);
        buttons.push(['つぎへ', () => this.leave('MythFloor', { match: { ...m, battle: m.battle + 1 } })], ['やめる', toTower]);
      } else if (win) {
        const r = new LifeRecord(loadLife()).mythTowerClear(m.floor, m.runId);
        lines.push([`${m.floor}階 クリア！${r?.first ? '（はじめて！）' : ''}`, '#ffd23a']);
        if (r) lines.push([`コイン +${r.coins.toLocaleString()}　経験値 +${r.exp}`, '#ffffff']);
        if (m.floor < TOWER_FLOORS) buttons.push(['次の階へ', () => this.leave('MythFloor', { match: { mode: 'tower', floor: m.floor + 1, battle: 0, runId: newTowerRun(m.floor + 1) } })]);
        else lines.push(['タワーの てっぺんに着いた！', '#ffb070']);
        buttons.push(['もどる', toTower]);
      } else {
        lines.push([`${m.floor}階 の1戦目から やり直し`, '#ffb070']);
        buttons.push(['もう一度', () => this.leave('MythFloor', { match: { ...m, battle: 0, runId: newTowerRun(m.floor) } })], ['もどる', toTower]);
      }
    } else {
      if (win && m?.mode === 'battle') {
        const r = new LifeRecord(loadLife()).mythBattleWin(m.level, this.battleRun);
        if (r) lines.push([`コイン +${r.coins.toLocaleString()}　経験値 +${r.exp}`, '#ffffff']);
      }
      buttons.push(['もう一度', () => this.scene.restart({ deck, match: m })], ['もどる', () => (m ? this.leave('MythMode', { view: 'cpu' }) : this.leave())]);
    }
    const by = H / 2 + 60 + lines.length * 48;
    // 後ろの文字が透けないように、板をしく
    const plate = this.add.graphics();
    plate.fillStyle(0x16101c, 0.92).fillRoundedRect(40, H / 2 - 130, W - 80, by - H / 2 + 200, 24);
    plate.lineStyle(4, win ? 0xffd23a : 0x5a4a66, 1).strokeRoundedRect(40, H / 2 - 130, W - 80, by - H / 2 + 200, 24);
    box.addAt(plate, 1);
    lines.forEach(([s, color], i) => box.add(this.text(W / 2, H / 2 - 20 + i * 48, s, 30, color)));
    buttons.forEach(([s, fn], i) => {
      const first = i === 0;
      const b = this.text(W / 2 + (buttons.length === 1 ? 0 : i === 0 ? -150 : 150), by, s, 36, first ? '#16101c' : '#ffffff')
        .setBackgroundColor(first ? '#ffd23a' : '#8a35e0')
        .setPadding(28, 10, 28, 12)
        .setInteractive({ useHandCursor: true });
      b.once('pointerdown', fn);
      box.add(b);
    });
  }

  private leave(scene = 'MythTitle', data?: object): void {
    audio.se('back');
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }

  private cardTexture(id: number, hideMagic: boolean): string {
    return canvasTextureOnce(this, cardKey(id, hideMagic), MYTH_CARD_W, MYTH_CARD_H, (ctx) => drawMythCard(ctx, card(id)!, { hideMagicElement: hideMagic }));
  }

  private text(x: number, y: number, s: string, size: number, color: string, ox = 0.5): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(ox, 0.5);
  }
}
