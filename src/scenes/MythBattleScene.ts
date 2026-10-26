import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { loadLife } from '../core/lifeSave';
import { abilityOf } from '../core/mythclash/abilities';
import { card, RARITIES } from '../core/mythclash/cards';
import { activeCard, createBattle, legalActions, resolveRound, type BattleAction, type BattleEvent, type BattleState, type Side } from '../core/mythclash/engine';
import { battleUnlocked, newCollection } from '../core/mythclash/packs';
import { aiAction, randomDeck } from '../core/mythclash/sim';
import { eventsFor, viewFor, type BattleView } from '../core/mythclash/view';
import { mulberry32, newSeed, type Rng } from '../core/rng';
import { preloadPacks } from '../render/packs';
import { drawMythCard, MYTH_CARD_H, MYTH_CARD_W } from '../ui/mythCardArt';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { MYTH_TITLE_IMAGE } from './MythTitleScene';

/** 横向き(iPhone を横にしたときの形)。企画者のイメージ図(2026-10-26)も横向き */
const W = 1560;
const H = 720;
const PORTRAIT = { w: 720, h: 1280 };
const ME: Side = 0;
const CPU: Side = 1;
const CARD_POS: Record<Side, { x: number; y: number }> = { 0: { x: 520, y: 340 }, 1: { x: 1040, y: 340 } };
const CARD_S = 0.82;
const THUMB_S = 0.3;
const THUMB_X: Record<Side, number> = { 0: 80, 1: W - 80 };
const THUMB_Y = [190, 330, 470];
const ATTACK_COLOR = 0xff3a3a;
const DEFENSE_COLOR = 0x3a9dff;

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
  private choosingSwitch = false;
  private ui?: Phaser.GameObjects.Container;
  private cardImg: Partial<Record<Side, Phaser.GameObjects.Image>> = {};
  private shownHp: Record<Side, number> = { 0: 0, 1: 0 };
  private hpBar: Partial<Record<Side, Phaser.GameObjects.Graphics>> = {};
  private hpText: Partial<Record<Side, Phaser.GameObjects.Text>> = {};
  private message?: Phaser.GameObjects.Text;
  private autoBtn?: Phaser.GameObjects.Text;

  constructor() {
    super('MythBattle');
  }

  init(): void {
    this.scale.setGameSize(W, H);
    this.busy = false;
    this.auto = false;
    this.choosingSwitch = false;
    this.cardImg = {};
    this.hpBar = {};
    this.hpText = {};
  }

  preload(): void {
    preloadPacks(this, ['mythclash']);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
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
    // タイトルの絵の闘技場の所を、暗くして背景にする【仮】
    if (this.textures.exists(MYTH_TITLE_IMAGE)) {
      const src = this.textures.get(MYTH_TITLE_IMAGE).getSourceImage() as HTMLImageElement;
      canvasTextureOnce(this, 'mb:bg', W, H, (ctx) => {
        const sh = (src.width * H) / W;
        ctx.drawImage(src, 0, 260, src.width, sh, 0, 0, W, H);
      });
      this.add.image(0, 0, 'mb:bg').setOrigin(0, 0);
    }
    this.add.rectangle(0, 0, W, H, 0x0a0408, 0.45).setOrigin(0, 0);
  }

  // ---------------- 画面を作る(見せてよい情報だけ) ----------------

  private render(): void {
    this.ui?.destroy();
    const ui = this.add.container(0, 0);
    this.ui = ui;
    const v = this.view;
    const attacking = v.attacking;
    // 上: 自分と相手の名前・HP
    for (const side of [ME, CPU]) {
      const cards = side === ME ? v.me : v.opponent;
      const act = cards.find((c) => !c.hidden && c.active);
      const left = side === ME;
      const px = left ? 150 : W - 150 - 500;
      const g = this.add.graphics();
      g.fillStyle(0x0a0408, 0.85).fillRoundedRect(px, 14, 500, 92, 14);
      g.lineStyle(3, left ? 0xc0182a : 0x2a6ad8, 1).strokeRoundedRect(px, 14, 500, 92, 14);
      ui.add(g);
      ui.add(this.text(left ? px + 20 : px + 480, 38, left ? 'あなた' : 'CPU', 22, '#b8a8c8', left ? 0 : 1));
      if (act && !act.hidden) ui.add(this.text(left ? px + 110 : px + 390, 38, act.name, 26, '#ffffff', left ? 0 : 1));
      const bar = this.add.graphics();
      const hpT = this.text(left ? px + 480 : px + 20, 71, '', 24, '#ffffff', left ? 1 : 0);
      this.hpBar[side] = bar;
      this.hpText[side] = hpT;
      ui.add([bar, hpT]);
      this.drawHp(side);
      // 横: チームの3枚
      cards.forEach((c, i) => {
        const x = THUMB_X[side];
        const y = THUMB_Y[i];
        const box = this.add.graphics();
        const on = !c.hidden && c.active;
        box.fillStyle(0x0a0408, 0.8).fillRoundedRect(x - 60, y - 66, 120, 132, 10);
        box.lineStyle(on ? 5 : 2, on ? 0xffd23a : 0x6a5a70, 1).strokeRoundedRect(x - 60, y - 66, 120, 132, 10);
        ui.add(box);
        if (c.hidden) {
          ui.add(this.text(x, y, '？？？', 26, '#8a7a90'));
          return;
        }
        const img = this.add.image(x, y - 6, this.cardTexture(c.id, side === CPU && !c.magicElement)).setScale(THUMB_S);
        if (c.down) img.setTint(0x444444);
        ui.add(img);
        const rate = c.hp / c.maxHp;
        const hb = this.add.graphics();
        hb.fillStyle(0x000000, 0.8).fillRect(x - 52, y + 52, 104, 9);
        hb.fillStyle(rate > 0.5 ? 0x4ade80 : rate > 0.25 ? 0xffd23a : 0xff4a4a, 1).fillRect(x - 52, y + 52, 104 * rate, 9);
        ui.add(hb);
        if (c.down) ui.add(this.text(x, y - 6, '戦闘不能', 20, '#ff6a6a'));
        // 交代: 自分の控えをさわる
        if (side === ME && !c.down && !c.active && this.choosingSwitch) {
          const ring = this.add.graphics();
          ring.lineStyle(6, 0x4ade80, 1).strokeRoundedRect(x - 64, y - 70, 128, 140, 12);
          this.tweens.add({ targets: ring, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
          const hit = this.add.zone(x, y, 128, 140).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => this.choose({ type: 'switch', to: i }));
          ui.add([ring, hit]);
        }
      });
    }
    // まん中: ターン
    const tg = this.add.graphics();
    tg.fillStyle(0x0a0408, 0.9).fillRoundedRect(W / 2 - 70, 10, 140, 100, 16);
    tg.lineStyle(3, 0xd8b060, 1).strokeRoundedRect(W / 2 - 70, 10, 140, 100, 16);
    ui.add([tg, this.text(W / 2, 34, 'TURN', 22, '#d8b060'), this.text(W / 2, 74, String(v.round), 44, '#ffffff')]);
    // 場のカード(攻撃側・防御側がわかるように)
    for (const side of [ME, CPU]) {
      const cards = side === ME ? v.me : v.opponent;
      const act = cards.find((c) => !c.hidden && c.active);
      if (!act || act.hidden) continue;
      const isAtk = (side === ME) === attacking;
      const { x, y } = CARD_POS[side];
      const col = isAtk ? ATTACK_COLOR : DEFENSE_COLOR;
      const glow = this.add.rectangle(x, y, MYTH_CARD_W * CARD_S + 26, MYTH_CARD_H * CARD_S + 26, col, 0.35).setStrokeStyle(5, col, 1);
      this.tweens.add({ targets: glow, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const img = this.add.image(x, y, this.cardTexture(act.id, side === CPU && !act.magicElement)).setScale(CARD_S * (isAtk ? 1.04 : 0.98));
      this.cardImg[side] = img;
      const tag = this.text(x, y - (MYTH_CARD_H * CARD_S) / 2 - 30, isAtk ? '⚔ ATTACK' : '🛡 DEFENSE', 30, '#ffffff').setBackgroundColor(isAtk ? '#c0182a' : '#1f5fc8').setPadding(16, 4, 16, 6);
      ui.add([glow, img, tag]);
      // 状態(眠り・毒など)は、カードの下に
      const st = this.s.teams[side].cards[this.s.teams[side].active];
      const marks = [act.skip && STATUS_LABELS[act.skip], act.dot && STATUS_LABELS[act.dot], st.shield > 0 && `バリア${st.shield}`, st.specialLock && side === ME && '必殺：次は使えない'].filter(Boolean) as string[];
      if (marks.length) ui.add(this.text(x, y + (MYTH_CARD_H * CARD_S) / 2 + 22, marks.join('・'), 22, '#ffd23a').setBackgroundColor('#0a0408cc').setPadding(10, 2, 10, 4));
    }
    // 攻撃の向きの矢印
    const dir = attacking ? 1 : -1;
    const arrow = this.text(W / 2, 330, dir > 0 ? '▶▶' : '◀◀', 64, attacking ? '#ff5a5a' : '#5aa8ff');
    this.tweens.add({ targets: arrow, x: W / 2 + dir * 18, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    ui.add(arrow);
    // メッセージ
    this.message = this.text(W / 2, 572, this.message?.text ?? '', 28, '#ffffff').setBackgroundColor('#0a0408cc').setPadding(18, 6, 18, 8);
    ui.add(this.message);
    this.buildButtons(ui);
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
    const all = [...kinds, { label: this.choosingSwitch ? 'やめる' : '交代', on: canSwitch }];
    const bw = asleep ? 420 : 250;
    const gap = 20;
    const total = all.length * bw + (all.length - 1) * gap;
    all.forEach((b, i) => {
      const x = W / 2 - total / 2 + bw / 2 + i * (bw + gap) - 60;
      const y = 660;
      const isSwitch = i === all.length - 1;
      const color = isSwitch ? 0x2a7a4a : attacking ? 0x8a1020 : 0x1a4a9a;
      const g = this.add.graphics();
      const enabled = b.on && !this.busy && this.s.winner === null;
      g.fillStyle(enabled ? color : 0x3a3040, 1).fillRoundedRect(x - bw / 2, y - 40, bw, 80, 12);
      g.lineStyle(3, enabled ? 0xd8b060 : 0x5a5060, 1).strokeRoundedRect(x - bw / 2, y - 40, bw, 80, 12);
      const t = this.text(x, y, b.label, b.label.length > 6 ? 22 : 30, enabled ? '#ffffff' : '#8a8090');
      ui.add([g, t]);
      if (!enabled) return;
      const hit = this.add.zone(x, y, bw, 80).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (isSwitch) {
          audio.se('tap');
          this.choosingSwitch = !this.choosingSwitch;
          if (this.choosingSwitch) this.say('交代するカードを えらんでね', '#7dffa0');
          this.render();
        } else if ('action' in b && b.action) this.choose(b.action);
      });
      ui.add(hit);
    });
    // AUTO(自動で選ぶ)
    this.autoBtn = this.text(W - 80, 660, 'AUTO', 26, this.auto ? '#16101c' : '#ffd23a').setBackgroundColor(this.auto ? '#ffd23a' : '#0a0408').setPadding(16, 14, 16, 16);
    this.autoBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.auto = !this.auto;
      audio.se('tap');
      this.render();
      if (this.auto && !this.busy) this.prompt();
    });
    ui.add(this.autoBtn);
  }

  /** 自分の番の案内(AUTOなら自動で選ぶ) */
  private prompt(): void {
    if (this.s.winner !== null) return;
    if (activeCard(this.s, ME).skip) this.say('眠って（凍って）いて動けない…', '#b8a8ff');
    else this.say(this.view.attacking ? 'あなたの攻撃！ 技をえらぼう' : '相手の攻撃！ 守り方をえらぼう', this.view.attacking ? '#ff8a8a' : '#8ac4ff');
    if (this.auto) this.time.delayedCall(500, () => this.auto && !this.busy && this.choose(aiAction(this.s, ME, this.rng)));
  }

  // ---------------- ターンを進める ----------------

  private choose(mine: BattleAction): void {
    if (this.busy || this.s.winner !== null) return;
    this.busy = true;
    this.choosingSwitch = false;
    audio.se('select');
    const theirs = aiAction(this.s, CPU, this.rng);
    const events = eventsFor(this.s, ME, resolveRound(this.s, [mine, theirs]));
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
      else this.prompt();
      return;
    }
    const e = events[i];
    const wait = this.show(e);
    this.time.delayedCall(wait, () => this.play(events, i + 1));
  }

  /** 出来事を1つ見せて、次まで待つ時間(ミリ秒)を返す */
  private show(e: BattleEvent): number {
    const who = (side: Side) => (side === ME ? 'あなた' : '相手');
    const name = (id: number) => card(id)?.name ?? '';
    switch (e.type) {
      case 'attack': {
        const img = this.cardImg[e.side];
        if (img) this.tweens.add({ targets: img, x: img.x + (e.side === ME ? 90 : -90), duration: 120, yoyo: true, ease: 'Cubic.easeOut' });
        this.say(`${name(e.id)}の ${ACTION_LABELS[e.kind]}！`, e.side === ME ? '#ff8a8a' : '#8ac4ff');
        audio.se(e.kind === 'special' ? 'punchHeavy' : e.kind === 'magic' ? 'sting' : 'punch');
        return 650;
      }
      case 'defend':
        this.say(`${who(e.side)}は ${ACTION_LABELS[e.kind]}`, '#d8d8ff');
        return 450;
      case 'counter':
        this.say(e.success ? 'カウンター成功！' : 'カウンター失敗…', e.success ? '#7dffa0' : '#ffb070');
        if (e.success) audio.se('guard');
        return 550;
      case 'damage': {
        this.shownHp[e.side] = Math.max(0, this.shownHp[e.side] - e.amount);
        this.drawHp(e.side);
        const img = this.cardImg[e.side];
        if (img) {
          this.tweens.add({ targets: img, angle: { from: -4, to: 4 }, duration: 50, yoyo: true, repeat: 2, onComplete: () => img.setAngle(0) });
          img.setTint(0xff7070);
          this.time.delayedCall(80, () => img.clearTint());
        }
        const p = CARD_POS[e.side];
        this.popup(p.x, p.y - 40, e.amount > 0 ? `-${e.amount}` : e.absorbed ? 'バリア！' : '0', e.source === 'dot' ? '#c070ff' : '#ff4a4a');
        if (e.absorbed > 0 && e.amount > 0) this.popup(p.x, p.y + 30, `バリア -${e.absorbed}`, '#8ac4ff');
        if (e.source === 'dot') this.say(`${name(e.id)}は 毒・火傷のダメージ`, '#c070ff');
        audio.se(e.amount >= 30 ? 'crackBig' : 'crack');
        this.cameras.main.shake(120, e.amount >= 30 ? 0.008 : 0.004);
        return 650;
      }
      case 'heal': {
        this.shownHp[e.side] = Math.min(activeCard(this.s, e.side).def.maxHp, this.shownHp[e.side] + e.amount);
        this.drawHp(e.side);
        const p = CARD_POS[e.side];
        this.popup(p.x, p.y - 40, `+${e.amount}`, '#4ade80');
        audio.se('happy');
        return 550;
      }
      case 'status':
        if (!e.applied) {
          this.say(`${STATUS_LABELS[e.status]}は 効かなかった`, '#b8a8c8');
          return 450;
        }
        this.say(`${name(e.id)}は ${STATUS_LABELS[e.status]}になった！`, '#ffd23a');
        this.popup(CARD_POS[e.side].x, CARD_POS[e.side].y + 60, STATUS_LABELS[e.status], '#ffd23a');
        audio.se('boing');
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

  private drawHp(side: Side): void {
    const bar = this.hpBar[side];
    if (!bar) return;
    const act = activeCard(this.s, side);
    // まだ見せていないカードのHPは出さない(相手の場のカードは出ているので見せてよい)
    const max = act.def.maxHp;
    const hp = this.shownHp[side];
    const left = side === ME;
    const px = left ? 150 : W - 150 - 500;
    bar.clear();
    // 自分は左から、相手は右から(真ん中を向く)
    const bx = left ? px + 20 : px + 140;
    bar.fillStyle(0x000000, 1).fillRoundedRect(bx, 58, 340, 26, 8);
    const rate = Math.max(0, Math.min(1, hp / max));
    bar.fillStyle(left ? 0xd83030 : 0x2a7ae8, 1).fillRoundedRect(left ? bx : bx + 340 * (1 - rate), 58, Math.max(1, 340 * rate), 26, 8);
    this.hpText[side]?.setText(`${hp} / ${max}`);
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
    const t = this.text(W / 2, 250, label, 110, win ? '#ffd23a' : w === 'draw' ? '#ffffff' : '#8ac4ff').setStroke('#16101c', 14).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    const sub = this.text(W / 2, 360, `${this.s.round - 1}ターンで決着`, 30, '#ffffff');
    const again = this.text(W / 2 - 170, 480, 'もう一度', 36, '#16101c').setBackgroundColor('#ffd23a').setPadding(28, 10, 28, 12).setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => this.scene.restart());
    const back = this.text(W / 2 + 170, 480, 'もどる', 36, '#ffffff').setBackgroundColor('#8a35e0').setPadding(28, 10, 28, 12).setInteractive({ useHandCursor: true });
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
