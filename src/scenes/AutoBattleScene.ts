import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { AUTO_BATTLE } from '../core/autobattle/config';
import { attackStage, instinctFor, newAutoBattle, stepAutoBattle, type AutoBattle, type AutoEntrant, type AutoEvent, type AutoFighter } from '../core/autobattle/engine';
import { loadLife } from '../core/lifeSave';
import { mulberry32 } from '../core/rng';
import { SPECIES } from '../core/species';
import { addStats, autoGrowthAt, currentStats, speciesStats, STAT_KEYS, type StatBlock } from '../core/stats';
import { BUNK_MOTION } from '../render/bunkView';
import { preloadPacks } from '../render/packs';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { altTexture } from './BattleScene';

/** 横画面(バトルの間だけ)。ほかの画面は縦 */
const W = 1280;
const H = 720;
const PORTRAIT = { w: 720, h: 1280 };
const INK = '#16101c';
/** 【仮】BUNKの画面での大きさ(元画像1pxあたり) */
const FIGHTER_SCALE = 0.1;
/** 体の高さ(画面px。ガードの丸・星の位置) */
const BODY_H = 110;

interface PartsManifest {
  parts: Record<string, { x: number; y: number; w: number; h: number; z: number }>;
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/**
 * BUNKの見た目(オートバトル用)。元画像から切り出したパーツ(構えた姿)を並べて、拳・足・体の動きで形を作る。
 * 絵は描き直さない(旧バトルの見た目と同じ作り方)。【仮】専用ポーズの絵が届いたら差しかえる
 */
class AutoFighterView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly actor: Phaser.GameObjects.Container;
  private readonly parts = new Map<string, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  private readonly guard: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private flash = 0;
  private shake = 0;
  private walkT = 0;
  /** 倒れたときの時間(倒れる動き) */
  private downT = -1;

  constructor(scene: Phaser.Scene, alt: boolean) {
    const manifest = scene.cache.json.get('bunk:guard:manifest') as PartsManifest;
    const [ax, ay] = BUNK_MOTION.anchor;
    this.shadow = scene.add.ellipse(0, AUTO_BATTLE.arena.ground + 2, 120, 18, 0x000000, 0.35).setDepth(9);
    this.root = scene.add.container(0, AUTO_BATTLE.arena.ground).setDepth(10);
    this.body = scene.add.container(0, 0);
    this.actor = scene.add.container(0, 0);
    this.body.add(this.actor);
    this.root.add(this.body);
    for (const [name, p] of Object.entries(manifest.parts).sort((a, b) => a[1].z - b[1].z)) {
      const key = alt ? altTexture(scene, `bunk:guard:${name}`) : `bunk:guard:${name}`;
      const img = scene.add.image(p.x - ax + p.w / 2, p.y - ay + p.h / 2, key);
      this.actor.add(img);
      this.parts.set(name, { img, x: img.x, y: img.y });
    }
    this.actor.setScale(FIGHTER_SCALE);
    this.guard = scene.add.circle(0, -BODY_H / 2, 78, 0x4ec3ff, 0.3).setStrokeStyle(4, 0xbfeaff, 0.9).setVisible(false);
    this.root.add(this.guard);
  }

  hurt(damage: number): void {
    this.flash = 0.1;
    this.shake = 0.08 + damage * 0.01;
  }

  update(f: AutoFighter, t: number, dt: number): void {
    this.shake = Math.max(0, this.shake - dt);
    const jitter = this.shake > 0 ? (Math.random() - 0.5) * 10 : 0;
    this.root.setPosition(f.x + jitter, AUTO_BATTLE.arena.ground);
    this.shadow.setPosition(f.x, AUTO_BATTLE.arena.ground + 2);
    this.actor.scaleX = FIGHTER_SCALE * f.face;
    const set = (part: string, dx: number, dy: number, rot = 0, s = 1) => {
      const p = this.parts.get(part);
      if (p) p.img.setPosition(p.x + dx, p.y + dy).setRotation(rot).setScale(part.startsWith('eye') ? f.face * s : s, s);
    };
    for (const n of this.parts.keys()) set(n, 0, 0);
    let lean = 0;
    let step = 0;
    let y = 0;
    let sq = 0;
    const a = f.action;
    const stage = attackStage(f);
    // 構え: 小きざみにはずむ
    if (!a && f.stun <= 0 && !f.walking && f.hp > 0) {
      const bounce = Math.sin(t * 7.5 + f.side);
      y = -Math.abs(bounce) * 4;
      set('glove_r', 10 * bounce, -22 * bounce);
      set('glove_l', -8 * bounce, 22 * bounce);
    }
    // 歩く(前へ / 後ろへ)
    if (f.walking && !a) {
      this.walkT += dt * 13 * (f.walking > 0 ? 1 : -1);
      const s = Math.sin(this.walkT);
      set('foot_l', 70 * s, -Math.max(0, s) * 60);
      set('foot_r', -70 * s, -Math.max(0, -s) * 60);
      set('glove_r', 40 * s, -20);
      set('glove_l', -40 * s, -10);
      y = -Math.abs(s) * 8;
      lean = f.walking > 0 ? 6 : -4;
    }
    // 攻撃: ためて → 体ごと打ちこむ → もどる
    if (a?.kind === 'attack') {
      const d = AUTO_BATTLE.attacks[a.name];
      const windT = d.windup * (1 - AUTO_BATTLE.stat.windupCutAtMax * Math.min(1, f.stats.speed / 150));
      const windup = stage === 'windup' ? easeOut(a.t / windT) : 0;
      const strike = stage === 'active' ? 1 : stage === 'recovery' ? Math.max(0, 1 - (a.t - windT - d.active) / d.recovery) : 0;
      if (a.name === 'jab') {
        set('glove_r', -60 * windup + 330 * strike, -10 * windup - 30 * strike, 0, 1 + 0.1 * strike);
        set('glove_l', 30 * strike, 20 * strike);
        lean = -3 * windup + 6 * strike;
        step = 8 * strike;
      } else {
        set('glove_r', -200 * windup + 560 * strike, 10 * windup - 50 * strike, -0.15 * windup, 1 + 0.18 * strike);
        set('glove_l', -80 * windup + 120 * strike, 30 * strike);
        set('foot_r', 40 * strike, 0);
        set('foot_l', -60 * strike, 0);
        lean = -10 * windup + 14 * strike;
        step = -8 * windup + 24 * strike;
        sq = 0.07 * windup - 0.05 * strike;
      }
    }
    // ガード: 両手を前で固める
    if (a?.kind === 'guard') {
      set('glove_r', -120, -40);
      set('glove_l', 140, -20);
      sq = 0.06;
    }
    // 回避: 後ろへ飛びのく
    if (a?.kind === 'dodge') {
      const k = Math.min(1, a.t / AUTO_BATTLE.dodge.time);
      y = -Math.sin(k * Math.PI) * 40;
      lean = -14;
      set('foot_l', -40, -60);
      set('foot_r', 30, -50);
      set('glove_l', -60, -40);
      set('glove_r', 40, -60);
    }
    // ひるみ: のけぞる
    if (f.stun > 0 && f.hp > 0) {
      lean = -12;
      set('glove_l', -40, -60);
      set('glove_r', 40, -80);
      sq = 0.06;
    }
    // 倒れる(HP0)
    let rot = 0;
    if (f.hp <= 0) {
      if (this.downT < 0) this.downT = 0;
      this.downT += dt;
      const k = Math.min(1, this.downT / 0.45);
      rot = -78 * easeOut(k);
      // 足元を中心に倒すと頭が地面にめりこむので、倒れるほど少し持ち上げる
      y = -38 * easeOut(k);
      set('glove_l', -40, 120);
      set('glove_r', 40, 140);
    }
    this.body.setScale(1 + sq * 0.6, 1 - sq).setRotation(((rot + lean) * f.face * Math.PI) / 180);
    this.actor.setPosition(step * f.face, y);
    this.guard.setVisible(a?.kind === 'guard').setScale(1 + Math.sin(t * 20) * 0.02);
    this.flash = Math.max(0, this.flash - dt);
    for (const { img } of this.parts.values()) {
      if (this.flash > 0) {
        img.setTint(0xffffff);
        img.tintMode = Phaser.TintModes.FILL;
      } else {
        img.clearTint();
        img.tintMode = Phaser.TintModes.MULTIPLY;
      }
    }
    this.root.setAlpha(a?.kind === 'dodge' && a.t < AUTO_BATTLE.dodge.invincible ? 0.65 : 1);
  }
}

/** 今お世話しているMONZ(プレイヤーの相棒)を、バトルに出す形にする */
function partnerEntrant(): { entrant: AutoEntrant; level: number } {
  const life = loadLife();
  const m = life.monz.find((x) => x.uid === life.activeMonz) ?? life.monz[0];
  const stats = currentStats(m);
  const name = m.name || SPECIES[m.species]?.name || 'MONZ';
  return { entrant: { name, species: m.species, stats, instinct: instinctFor(m.species, stats) }, level: m.level };
}

/**
 * 【仮】相手: 色違いのBUNK(旧バトルと同じ。企画者の素材を使う)。相棒と同じレベルで、育て方はランダム
 */
function rivalEntrant(level: number, seed: number): AutoEntrant {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let stats: StatBlock = addStats(speciesStats('bunk').base, autoGrowthAt('bunk', `rival:${seed}`, level));
  // 自由ポイント(1レベル1つ)を、ランダムにかたよらせて振る(相手ごとに戦い方が変わるように)
  const fav = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)];
  const free = { hp: 0, power: 0, tough: 0, speed: 0, tech: 0 } as StatBlock;
  for (let i = 1; i < level; i++) free[rng() < 0.6 ? fav : STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)]]++;
  stats = addStats(stats, free);
  return { name: 'ライバル', species: 'bunk', stats, instinct: instinctFor('bunk', stats) };
}

/**
 * MONZ のオートバトル(企画者の指示書 2026-10-30)。第1段階: 相棒のMONZが自分で動いて、1対1で戦う。
 * プレイヤーは見守る(作戦サイン・応援・絆アクションは第3段階でここに足す)。報酬はまだ無い【仮】
 */
export class AutoBattleScene extends Phaser.Scene {
  private battle!: AutoBattle;
  private views: AutoFighterView[] = [];
  private t = 0;
  private acc = 0;
  private speed = 1;
  private leaving = false;
  private ended = false;
  private level = 1;
  private hud: { hp: Phaser.GameObjects.Graphics; hpText: Phaser.GameObjects.Text }[] = [];
  private timer!: Phaser.GameObjects.Text;
  private speedBtn!: Phaser.GameObjects.Text;
  private turnHint?: Phaser.GameObjects.Container;

  constructor() {
    super('AutoBattle');
  }

  init(): void {
    this.scale.setGameSize(W, H);
  }

  preload(): void {
    preloadPacks(this, ['bunk']);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.setGameSize(PORTRAIT.w, PORTRAIT.h));
    this.t = 0;
    this.acc = 0;
    this.leaving = false;
    this.ended = false;
    this.hud = [];
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const partner = partnerEntrant();
    this.level = partner.level;
    this.battle = newAutoBattle(partner.entrant, rivalEntrant(partner.level, seed), seed);
    this.drawBackground();
    this.views = [new AutoFighterView(this, false), new AutoFighterView(this, true)];
    this.views[0].root.setDepth(11);
    this.buildHud();
    this.buildTurnHint();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    audio.playBgm('dash');
    this.intro();
  }

  /** はじめの「たたかえ！」(少しのあいだ止めておく) */
  private intro(): void {
    this.ended = true;
    const t = this.text(W / 2, H / 2 - 40, 'READY…', 72, '#ffd23a').setDepth(80);
    this.time.delayedCall(900, () => {
      t.setText('FIGHT!');
      audio.se('whoosh');
      this.tweens.add({ targets: t, scale: 1.3, alpha: 0, delay: 350, duration: 400, onComplete: () => t.destroy() });
      this.ended = false;
    });
  }

  private buildTurnHint(): void {
    const c = this.add.container(W / 2, H / 2).setDepth(90);
    c.add([this.add.rectangle(0, 0, 620, 150, 0x16101c, 0.88).setStrokeStyle(4, 0xffd23a, 1), this.text(0, 0, 'スマホを 横にしてね', 44, '#ffd23a')]);
    this.turnHint = c;
  }

  private drawBackground(): void {
    // 【仮】背景: 夕方のアリーナの色の帯と地面
    canvasTextureOnce(this, 'autobattle:bg', W, H, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1a4e');
      g.addColorStop(0.55, '#7a3d6e');
      g.addColorStop(0.83, '#e08a5a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const ground = AUTO_BATTLE.arena.ground;
      const gg = ctx.createLinearGradient(0, ground, 0, H);
      gg.addColorStop(0, '#5a3a2a');
      gg.addColorStop(1, '#2a1a14');
      ctx.fillStyle = gg;
      ctx.fillRect(0, ground, W, H - ground);
      ctx.fillStyle = 'rgba(255,220,170,0.35)';
      ctx.fillRect(0, ground, W, 6);
    });
    this.add.image(0, 0, 'autobattle:bg').setOrigin(0, 0).setDepth(-10);
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = INK): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke, strokeThickness: Math.round(size * 0.18), align: 'center' })
      .setOrigin(0.5)
      .setDepth(50);
  }

  private buildHud(): void {
    const back = this.text(16, 30, '◀ もどる', 26).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    this.timer = this.text(W / 2, 40, '', 40, '#ffd23a');
    // 見るのを速くする(2倍)【仮】
    this.speedBtn = this.text(W - 70, 30, '×1', 26, '#ffffff').setInteractive({ useHandCursor: true });
    this.speedBtn.on('pointerdown', () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.speedBtn.setText(`×${this.speed}`);
      audio.se('tap');
    });
    this.battle.fighters.forEach((f, i) => {
      const x = i === 0 ? 24 : W - 24 - 360;
      const y = 62;
      const panel = this.add.graphics().setDepth(49);
      panel.fillStyle(0x16101c, 0.72).fillRoundedRect(x, y, 360, 86, 14);
      this.text(x + 16, y + 24, f.name, 24).setOrigin(0, 0.5);
      this.text(x + 344, y + 24, `Lv.${this.level}`, 22, '#ffd23a').setOrigin(1, 0.5);
      const hp = this.add.graphics().setDepth(50);
      const hpText = this.text(x + 344, y + 62, '', 18).setOrigin(1, 0.5);
      this.hud.push({ hp, hpText });
    });
  }

  private refreshHud(): void {
    this.battle.fighters.forEach((f, i) => {
      const h = this.hud[i];
      const x = i === 0 ? 24 : W - 24 - 360;
      const y = 62;
      const share = f.hp / f.maxHp;
      const st = f.stamina / AUTO_BATTLE.stamina.max;
      h.hp.clear();
      h.hp.fillStyle(0x3a2f45, 1).fillRoundedRect(x + 16, y + 48, 230, 16, 7);
      if (share > 0) h.hp.fillStyle(share > 0.5 ? 0x7be36b : share > 0.25 ? 0xffd23a : 0xff5a4e, 1).fillRoundedRect(x + 16, y + 48, Math.max(14, 230 * share), 16, 7);
      // スタミナ(細い線)
      h.hp.fillStyle(0x3a2f45, 1).fillRect(x + 16, y + 68, 230, 5);
      h.hp.fillStyle(0x7fd8ff, 1).fillRect(x + 16, y + 68, 230 * st, 5);
      h.hpText.setText(`HP ${f.hp}`);
    });
    const left = Math.max(0, AUTO_BATTLE.timeLimit - this.battle.t);
    this.timer.setText(String(Math.ceil(left)));
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    this.turnHint?.setVisible(this.scale.parentSize.width < this.scale.parentSize.height);
    if (!this.ended) {
      this.acc += dt * this.speed;
      const step = 1 / 60;
      while (this.acc >= step) {
        this.acc -= step;
        this.handle(stepAutoBattle(this.battle, step));
        if (this.battle.winner !== null) break;
      }
      if (this.battle.winner !== null) this.finish();
    }
    this.t += dt;
    this.battle.fighters.forEach((f, i) => this.views[i].update(f, this.t, dt));
    this.refreshHud();
  }

  /** 起きたことを、音・光・数字で見せる */
  private handle(events: AutoEvent[]): void {
    for (const e of events) {
      if (e.kind === 'swing') audio.se('whoosh', { pitch: e.name === 'strong' ? 0.8 : 1.15 });
      if (e.kind === 'hit') {
        const target = this.battle.fighters[e.target];
        this.views[e.target].hurt(e.damage);
        audio.se(e.name === 'strong' || e.crit ? 'punchHeavy' : 'punch', { pitch: 0.9 + e.damage * 0.02 });
        this.spark(target.x - target.face * 20, AUTO_BATTLE.arena.ground - BODY_H * 0.6, e.crit ? 0xffd23a : 0xffffff);
        this.popup(target.x, String(e.damage), e.crit ? '#ffd23a' : '#ffffff', e.crit ? 'かいしん！' : e.counter ? 'カウンター！' : '');
        if (e.name === 'strong' || e.crit) this.cameras.main.shake(120, 0.006);
      }
      if (e.kind === 'block') {
        const target = this.battle.fighters[e.target];
        audio.se('guard');
        this.popup(target.x, String(e.damage), '#9fdcff', 'ガード');
      }
      if (e.kind === 'dodge') {
        const f = this.battle.fighters[e.side];
        audio.se('hop', { pitch: 1.2 });
        this.popup(f.x, '', '#ffffff', 'かわした！');
      }
      if (e.kind === 'ko') {
        audio.se('koBlast');
        this.cameras.main.shake(260, 0.012);
      }
    }
  }

  private spark(x: number, y: number, color: number): void {
    const c = this.add.circle(x, y, 18, color, 0.95).setDepth(30);
    this.tweens.add({ targets: c, scale: 3, alpha: 0, duration: 220, onComplete: () => c.destroy() });
  }

  private popup(x: number, num: string, color: string, label: string): void {
    const y = AUTO_BATTLE.arena.ground - BODY_H - 30;
    const s = [label, num].filter(Boolean).join('\n');
    const t = this.text(x, y, s, label && !num ? 28 : 32, color).setDepth(60);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const w = this.battle.winner;
    const label = w === 'draw' ? 'ひきわけ' : w === 0 ? 'かち！' : 'まけ…';
    const color = w === 0 ? '#ffd23a' : w === 'draw' ? '#ffffff' : '#9fdcff';
    this.time.delayedCall(900, () => {
      audio.se(w === 0 ? 'cheer' : 'back');
      const c = this.add.container(W / 2, H / 2).setDepth(85);
      const bg = this.add.rectangle(0, 0, 640, 300, 0x16101c, 0.9).setStrokeStyle(5, 0xffd23a, 1);
      const title = this.text(0, -80, label, 72, color);
      const sub = this.text(0, -10, this.battle.t >= AUTO_BATTLE.timeLimit ? 'じかんぎれ' : `${Math.round(this.battle.t)}びょう`, 26, '#d8c8e8');
      const again = this.text(-140, 80, 'もう一度', 34, INK, '#ffd23a').setBackgroundColor('#ffd23a').setPadding(24, 8, 24, 10).setInteractive({ useHandCursor: true });
      again.on('pointerdown', () => this.scene.restart());
      const back = this.text(140, 80, 'もどる', 34, '#ffffff').setBackgroundColor('#3a2f45').setPadding(30, 8, 30, 10).setInteractive({ useHandCursor: true });
      back.on('pointerdown', () => this.leave());
      c.add([bg, title, sub, again, back]);
      c.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    });
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.se('back');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('BattleMenu'));
  }
}
