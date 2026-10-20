import * as Phaser from 'phaser';
import { speciesName } from '../core/species';
import { audio } from '../audio/engine';
import { BunkBrain } from '../core/bunkBehavior';
import { HOME_ACTIONS, HOME_ACTION_LABELS, HOME_ACTION_READY, HOME_LAYOUTS, clipPolygonX, decideHomePlace, insidePolygon, type HomeAction, type HomePlace, type Pt } from '../core/home';
import { MonzLife } from '../core/life';
import { clearLife, LifeRecord, loadLife, saveLife } from '../core/lifeSave';
import { mulberry32 } from '../core/rng';
import { clearSave, loadSave } from '../core/save';
import { BUNK_MOTION, BunkView, cutoutKey, TEST_PERSONALITY } from '../render/bunkView';
import { drawCoin, drawGarage, drawHeart, drawIcon, drawMeat, drawMeatImage, drawMenuButton, drawPanel, drawRoom } from '../ui/homeArt';
import { canvasTexture, canvasTextureOnce, drawPaper, drawStreet, UI_FONT } from '../ui/paint';
import { openSoundSettings } from '../ui/soundButton';
import { preloadPacks } from '../render/packs';

const W = 720;
const H = 1280;
/** MONZの大きさ(部屋の奥 → 手前)。部屋全体が見渡せるよう小さめ */
const SCALE_BACK = 0.12;
const SCALE_FRONT = 0.165;
/** MONZの絵の高さ(大きさ1のとき)。ハートや吹き出しの位置に使う */
const MONZ_H = 1150;
/** 下のメニュー */
const MENU = { y: 1198, w: 111, h: 134, gap: 6 };
/** 画面の左右のはしから、MONZの足元までの最小の距離 */
const EDGE = 110;
const DEPTH = { monz: 10, effect: 30, ui: 40, popup: 60 };

/**
 * 企画者の背景画像(public/assets/home/)。届いていない場所は仮の絵(src/ui/homeArt.ts)を使う。
 */
export const HOME_IMAGES: Partial<Record<HomePlace, string>> = { alley: 'alley.webp', garage: 'garage.webp' };
export const homeImageKey = (p: HomePlace) => `home:bg:${p}`;

/** お世話画面の場所。いちばん最初に1回だけランダムで決めて保存し、そのあとはずっと同じ */
export function homePlace(): HomePlace {
  const life = loadLife();
  const place = decideHomePlace(mulberry32(Date.now() & 0xffffffff), life.place);
  if (life.place !== place) saveLife({ ...life, place });
  return place;
}
/** 企画者のアイコン(design/home/icons.png → design/home/make_icons.py で切り分け) */
export const HOME_ICONS = ['food', 'minigame', 'pet', 'battle', 'shop', 'settings', 'coin'] as const;
export const homeIconKey = (name: string) => `home:icon:${name}`;
/**
 * 企画者のBUNKの姿(design/bunk/poses/ → make_poses.py で切り抜き)。お世話画面の行動に合わせて出す。
 * height: 立っているBUNKの高さに対する大きさ。これらの姿は反転しない(目が入れかわらないように)。
 */
export const BUNK_POSE_IMAGES = {
  sit: { height: 0.82 },
  sleep: { height: 0.66 },
  stretch: { height: 1.12 },
  look: { height: 0.98 },
  hungry: { height: 1.02 },
  sleepy: { height: 1.0 },
} as const;
export type BunkPoseImage = keyof typeof BUNK_POSE_IMAGES;
export const bunkPoseKey = (name: string) => `bunk:pose:${name}`;

/** 企画者の肉の絵(design/home/meat.png → design/home/make_meat.py で切り抜き) */
export const MEAT_KEY = 'home:meatImage';
/** 企画者の手の絵(なでるときのカーソル)。HAND_TIP は人さし指の先の位置(絵の幅・高さに対する割合) */
export const HAND_KEY = 'home:handImage';
export const HAND_FILE = 'hand.webp';
const HAND_TIP: [number, number] = [0.25, 0.03];
export const MEAT_FILE = 'meat.webp';

/**
 * お世話画面(第1段階)。場所は「部屋・路地裏・ガレージ」から、いちばん最初に1回だけランダムで決まる。
 * MONZは床の上を自分で歩き回り、立ち止まったり、休んだり、眠ったりする(src/core/life.ts)。
 * 上: 名前・レベル【仮】・コイン。下: ごはん・ミニゲーム・なでる・バトル・ショップ・設定。
 */
export class HomeScene extends Phaser.Scene {
  private view?: BunkView;
  private life?: MonzLife;
  private shadow?: Phaser.GameObjects.Ellipse;
  private zText?: Phaser.GameObjects.Text;
  private floor: Pt[] = [];
  private yBack = 0;
  private yFront = 1;
  private t = 0;
  private busy = false;
  private record?: LifeRecord;
  private saveTimer = 0;
  private bubble?: Phaser.GameObjects.Image;
  /** 指でなでている途中(なぞった距離など)。null ならなでていない */
  private stroke: { x: number; y: number; dist: number; sinceTick: number; ticks: number; happy: number; angry: boolean } | null = null;
  private strokeHand?: Phaser.GameObjects.Image;
  /** 行動に合わせた姿の絵(座る・眠る・伸び・見渡す・お腹がすいた・眠い)。出している間は BunkView を隠す */
  private poseImg?: Phaser.GameObjects.Image;
  private shownPose: BunkPoseImage | null = null;
  place: HomePlace = 'room';

  constructor() {
    super('Home');
  }

  preload(): void {
    preloadPacks(this, ['bunk', 'home']);
  }

  create(): void {
    this.t = 0;
    this.busy = false;
    const monz = loadSave()?.firstMonz ?? 'bunk';
    this.place = homePlace();
    this.drawBackground();

    // お腹・眠さ・機嫌。閉じていた間のぶんを、まとめて進める
    const record = new LifeRecord(loadLife());
    record.catchUp();
    this.record = record;
    this.saveTimer = 0;

    // MONZ(床の上を自分で動き回る)
    const brain = new BunkBrain(BUNK_MOTION.behavior, Date.now() & 0xffff, TEST_PERSONALITY);
    brain.jabDuration = BUNK_MOTION.poses.guard.jab?.duration ?? 0.34;
    const life = new MonzLife(brain, this.floor, mulberry32((Date.now() >>> 3) & 0xffffffff), (y) => this.depthOf(y), undefined, () => record.needs);
    this.life = life;
    this.shadow = this.add.ellipse(life.x, life.y, 300, 46, 0x000000, 0.28);
    const view = new BunkView(this, life.x, life.y, SCALE_BACK);
    view.still = false;
    this.view = view;
    this.poseImg = this.add.image(life.x, life.y, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
    // 指でなでる・タップ: 画面のどこを触ったかで判断する(MONZの体のあたりなら反応。座る・眠るなどの絵のときも同じ)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.onMonz(p.x, p.y)) this.startStroke(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveStroke(p));
    this.input.on('pointerup', () => this.endStroke());
    this.input.on('pointerupoutside', () => this.endStroke());
    this.zText = this.text(0, 0, 'z', 34, '#ffffff').setVisible(false);

    this.buildTop(speciesName(monz));
    this.buildMenu();
    this.buildTestButtons();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    audio.playBgm('home');
    // 画面を離れるときは保存。戻ってきたら、離れていた間のぶんを進める
    const onVisible = () => {
      if (document.hidden) record.tick(0, Date.now(), true);
      else record.catchUp();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisible);
      record.tick(0, Date.now(), true);
    });
  }

  /** 背景と、歩ける床の範囲(画面の座標にする) */
  private drawBackground(): void {
    const layout = HOME_LAYOUTS[this.place];
    const key = homeImageKey(this.place);
    let w = layout.w;
    let h = layout.h;
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, H / 2, key).setDepth(-10);
      w = img.width;
      h = img.height;
      img.setScale(Math.max(W / w, H / h));
    } else {
      const draw = { room: drawRoom, alley: drawStreet, garage: drawGarage }[this.place];
      canvasTexture(this, `home:draw:${this.place}`, W, H, (ctx) => draw(ctx, W, H));
      this.add.image(0, 0, `home:draw:${this.place}`).setOrigin(0, 0).setDepth(-10);
      w = W;
      h = H;
    }
    const k = Math.max(W / w, H / h);
    const ox = (W - w * k) / 2;
    const oy = (H - h * k) / 2;
    const sx = w / layout.w;
    const sy = h / layout.h;
    // 絵が画面より横に広いときは、はみ出した所を歩かないようにする(体の半分ぶん内側まで)
    this.floor = clipPolygonX(layout.floor.map(([x, y]) => [ox + x * sx * k, oy + y * sy * k] as Pt), EDGE, W - EDGE);
    this.yBack = Math.min(...this.floor.map((p) => p[1]));
    this.yFront = Math.max(...this.floor.map((p) => p[1]));
  }

  /** 奥(0)〜手前(1) */
  private depthOf(y: number): number {
    return Phaser.Math.Clamp((y - this.yBack) / (this.yFront - this.yBack), 0, 1);
  }

  private scaleAt(y: number): number {
    return Phaser.Math.Linear(SCALE_BACK, SCALE_FRONT, this.depthOf(y));
  }

  // ---------------- 上の表示 ----------------

  private buildTop(name: string): void {
    const record = this.record!;

    // 名前・レベルのカード
    canvasTexture(this, 'home:card', 430, 138, (ctx) => drawPanel(ctx, 430, 138, 91));
    const card = this.add.container(16, 14).setDepth(DEPTH.ui);
    card.add(this.add.image(0, 0, 'home:card').setOrigin(0, 0));
    // 顔(正式なBUNKの絵から切り抜く)
    canvasTexture(this, 'home:portrait', 116, 116, (ctx) => {
      const src = this.textures.get(cutoutKey('guard')).getSourceImage() as HTMLImageElement;
      const r = 54;
      ctx.save();
      ctx.beginPath();
      ctx.arc(58, 58, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23a';
      ctx.fill();
      ctx.clip();
      // 顔のあたり(元の絵の 1278x1230 のうち)
      const fx = 300;
      const fy = 210;
      const fs = 680;
      ctx.drawImage(src, (fx * src.width) / 1278, (fy * src.height) / 1230, (fs * src.width) / 1278, (fs * src.height) / 1230, 2, 6, 112, 112);
      ctx.restore();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#16101c';
      ctx.beginPath();
      ctx.arc(58, 58, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    card.add(this.add.image(14, 11, 'home:portrait').setOrigin(0, 0));
    const ink = '#16101c';
    card.add(this.add.text(140, 18, name, { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: ink }));
    // レベルと、次のレベルまでのゲージ(お世話で経験値がたまる)
    const lv = this.add.text(140, 62, `Lv. ${record.level}`, { fontFamily: UI_FONT, fontSize: '24px', fontStyle: '900', color: ink });
    card.add(lv);
    const bar = this.add.graphics();
    const drawBar = () => {
      bar.clear();
      bar.fillStyle(0x16101c, 1).fillRoundedRect(232, 66, 176, 22, 11);
      bar.fillStyle(0xd9c7a0, 1).fillRoundedRect(236, 70, 168, 14, 7);
      bar.fillStyle(0x2fa8ff, 1).fillRoundedRect(236, 70, Math.max(14, 168 * record.expRate), 14, 7);
    };
    drawBar();
    card.add(bar);
    // 【仮】ひとこと
    card.add(this.add.text(140, 98, '今日もよろしく！', { fontFamily: UI_FONT, fontSize: '20px', fontStyle: 'bold', color: ink }));

    // コインのカード
    canvasTexture(this, 'home:coinCard', 252, 84, (ctx) => {
      drawPanel(ctx, 252, 84, 93);
      const coin = this.icon('coin');
      if (coin) ctx.drawImage(coin, 6, 4, 76, 76);
      else drawCoin(ctx, 44, 42, 27);
    });
    const coinCard = this.add.container(W - 16 - 126, 14 + 42).setDepth(DEPTH.ui);
    coinCard.add(this.add.image(0, 0, 'home:coinCard'));
    const shown = { v: record.coins };
    const label = this.add.text(104, 2, shown.v.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: ink }).setOrigin(1, 0.5);
    coinCard.add(label);
    // 増えたり減ったりしたときは、数字が動いて、札が少しはねる
    record.on((e) => {
      drawBar();
      lv.setText(`Lv. ${record.level}`);
      if (e.type === 'levelUp') {
        this.levelUp(e.level);
        return;
      }
      const { coins, delta } = e;
      this.tweens.add({
        targets: shown,
        v: coins,
        duration: 500,
        ease: 'Cubic.easeOut',
        onUpdate: () => label.setText(Math.round(shown.v).toLocaleString()),
      });
      this.tweens.add({ targets: coinCard, scale: 1.12, duration: 110, yoyo: true, ease: 'Sine.easeOut' });
      const pop = this.text(coinCard.x + 20, coinCard.y + 50, `${delta > 0 ? '+' : ''}${delta}`, 30, delta > 0 ? '#ffd23a' : '#ff4fa3').setDepth(DEPTH.ui + 1);
      this.tweens.add({ targets: pop, y: pop.y + 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => pop.destroy() });
      audio.se(delta > 0 ? 'select' : 'back');
    });
  }

  /** 企画者のアイコン画像(読み込めていなければ undefined) */
  private icon(name: string, rawKey = false): CanvasImageSource | undefined {
    const key = rawKey ? name : homeIconKey(name);
    return this.textures.exists(key) ? (this.textures.get(key).getSourceImage() as CanvasImageSource) : undefined;
  }

  /** 今の行動に合う姿の絵(なければ null = ふつうのBUNKを動かす) */
  private poseFor(): BunkPoseImage | null {
    const life = this.life!;
    // 眠っているときは、なでられていても眠った姿のまま
    if (life.act === 'sleep' && this.textures.exists(bunkPoseKey('sleep'))) return 'sleep';
    if (life.isPaused || life.body.reaction?.kind === 'happy' || life.body.reaction?.kind === 'angry' || life.body.reaction?.kind === 'surprised') return null;
    const n = this.record?.needs;
    const has = (p: BunkPoseImage) => (this.textures.exists(bunkPoseKey(p)) ? p : null);
    switch (life.act) {
      case 'sleep':
        return has('sleep');
      case 'stretch':
        return has('stretch');
      case 'beg':
        return has('hungry');
      case 'look':
        // 見渡す: 横を向いた絵と、正面のBUNKを交互に
        return life.facing < 0 ? has('look') : null;
      case 'rest':
        if (n && n.mood < 0.3) return null;
        return n && n.sleepy > 0.6 ? has('sleepy') : has('sit');
      default:
        return null;
    }
  }

  private showPose(pose: BunkPoseImage | null, sc: number): void {
    const img = this.poseImg!;
    const life = this.life!;
    const view = this.view!;
    if (pose !== this.shownPose) {
      this.shownPose = pose;
      if (pose) {
        img.setTexture(bunkPoseKey(pose));
        // 切りかわるときに、少しだけふわっと
        img.setAlpha(0.4);
        this.tweens.add({ targets: img, alpha: 1, duration: 160 });
      }
    }
    // 見え方は毎回そろえる(何かの拍子にどちらも消えたままにならないように)
    img.setVisible(!!pose);
    view.setVisible(!pose);
    if (!pose) return;
    const target = BUNK_POSE_IMAGES[pose].height * MONZ_H * sc;
    const base = target / img.height;
    // ゆっくり呼吸(眠っているときはもっとゆっくり)。伸びは、ぐーっと上へ
    const period = pose === 'sleep' ? 3.2 : 2.2;
    const breath = 1 + 0.018 * Math.sin((this.t * Math.PI * 2) / period);
    const stretchUp = pose === 'stretch' ? 1 + 0.04 * Math.sin(Math.min(1, (this.t % 2.4) / 1.2) * Math.PI) : 1;
    img.setPosition(life.x, life.y + 4).setScale(base * (2 - breath), base * breath * stretchUp).setDepth(DEPTH.monz + this.depthOf(life.y));
  }

  /** 頭の上の吹き出し(肉の絵) */
  private showBubble(on: boolean): void {
    const life = this.life!;
    if (!this.bubble) {
      const meat = this.icon(MEAT_KEY, true);
      canvasTextureOnce(this, 'home:bubble', 150, 130, (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#16101c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(75, 56, 68, 50, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(52, 98);
        ctx.lineTo(40, 126);
        ctx.lineTo(74, 104);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(48, 92, 30, 12);
        if (meat) ctx.drawImage(meat, 22, 22, 106, 69);
      });
      this.bubble = this.add.image(0, 0, 'home:bubble').setOrigin(0.25, 1).setDepth(DEPTH.effect).setScale(0.75).setVisible(false);
    }
    const b = this.bubble;
    if (on && !b.visible) {
      b.setVisible(true).setScale(0.2);
      this.tweens.add({ targets: b, scale: 0.75, duration: 260, ease: 'Back.easeOut' });
    }
    if (!on) b.setVisible(false);
    if (on) b.setPosition(life.x + 30, life.y - MONZ_H * this.scaleAt(life.y) + 10 + Math.sin(this.t * 4) * 4);
  }

  /** 画面のまん中に短い知らせ(テスト用) */
  private toast(msg: string): void {
    const t = this.text(W / 2, 600, msg, 34, '#ffffff').setDepth(DEPTH.popup);
    this.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  }

  /** レベルアップの演出 */
  private levelUp(level: number): void {
    audio.se('sting');
    const t = this.text(W / 2, 470, `LEVEL UP!\nLv. ${level}`, 64, '#ffd23a').setDepth(DEPTH.popup).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 60, delay: 1800, duration: 500, onComplete: () => t.destroy() });
    this.hearts(3);
  }

  // ---------------- 下のメニュー ----------------

  private buildMenu(): void {
    // ボタンの下の暗い帯(背景とボタンを分ける)
    this.add.rectangle(0, MENU.y - MENU.h / 2 - 14, W, H, 0x16101c, 0.55).setOrigin(0, 0).setDepth(DEPTH.ui - 1);
    const total = HOME_ACTIONS.length * MENU.w + (HOME_ACTIONS.length - 1) * MENU.gap;
    HOME_ACTIONS.forEach((action, i) => {
      const key = `home:menu:${action}`;
      canvasTexture(this, key, MENU.w, MENU.h, (ctx) => drawMenuButton(ctx, MENU.w, MENU.h, action, HOME_ACTION_LABELS[action], HOME_ACTION_READY[action], 70 + i, this.icon(action)));
      const x = (W - total) / 2 + MENU.w / 2 + i * (MENU.w + MENU.gap);
      const btn = this.add.image(x, MENU.y, key).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scale: 0.9, duration: 70, yoyo: true });
        this.act(action);
      });
    });
  }

  /** 【テスト用】回答を消して質問からやり直す / 誕生の演出だけをもう一度 / コインを増やす */
  private buildTestButtons(): void {
    const button = (y: number, label: string, onTap: () => void) =>
      this.add
        .text(W - 16, y, label, { fontFamily: UI_FONT, fontSize: '20px', color: '#ffffff', backgroundColor: '#16101caa', padding: { x: 10, y: 6 } })
        .setOrigin(1, 0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);
    button(110, '最初から', () => {
      // お世話画面のデータ(場所・コイン)も消して、場所を決め直す
      clearSave();
      clearLife();
      this.scene.start('Title');
    });
    button(152, '誕生をもう一度', () => this.scene.start('Birth', { intro: true }));
    button(194, '+10コイン', () => this.record?.add(10));
    // 時間を進めて、お腹がすいたり眠くなったりするのを確かめる
    button(236, '6時間すすめる', () => {
      this.record?.advance(6);
      this.toast('6時間すすめました');
    });
  }

  private act(action: HomeAction): void {
    if (action === 'settings') {
      audio.se('tap');
      openSoundSettings(this);
      return;
    }
    if (this.busy) return;
    if (action === 'food') this.feed();
    else if (action === 'pet') this.petWithHand();
    else this.comingSoon(HOME_ACTION_LABELS[action]);
  }

  // ---------------- MONZとのふれあい ----------------

  /** MONZをタップ: 足を止めて、こっちを見る(眠っていたら起きて嫌がる。眠ければ、またすぐ眠る) */
  private tapMonz(): void {
    if (this.busy || !this.life) return;
    const kind = this.life.tapped();
    if (kind === 'angry') {
      this.record?.setAsleep(false);
      audio.se('angry');
    } else audio.se('surprised', { pitch: 1.3 });
  }

  // ---- 指でなぞってなでる ----
  /** なでた距離(px)がこれだけたまるたびに反応する */
  private static STROKE_STEP = 70;

  /** その場所がMONZの体のあたりか(少し広めに取って、指で触りやすくする) */
  private onMonz(x: number, y: number): boolean {
    const life = this.life;
    if (!life) return false;
    const sc = this.scaleAt(life.y);
    return Math.abs(x - life.x) < 620 * sc && y < life.y + 30 && y > life.y - MONZ_H * sc - 40;
  }

  private startStroke(p: Phaser.Input.Pointer): void {
    if (this.busy || !this.life) return;
    this.stroke = { x: p.x, y: p.y, dist: 0, sinceTick: 0, ticks: 0, happy: 0, angry: false };
    // 触ったらすぐ手を出す(指で隠れないよう、指の少し上に)
    this.showStrokeHand(p.x, p.y);
  }

  private moveStroke(p: Phaser.Input.Pointer): void {
    const s = this.stroke;
    const life = this.life;
    if (!s || !life || !p.isDown || s.angry) return;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    s.x = p.x;
    s.y = p.y;
    this.showStrokeHand(p.x, p.y);
    // MONZの体の上をなぞっているときだけ数える
    if (!this.onMonz(p.x, p.y)) return;
    s.dist += d;
    s.sinceTick += d;
    if (s.sinceTick < HomeScene.STROKE_STEP) return;
    s.sinceTick = 0;
    s.ticks++;
    const kind = life.stroked();
    if (kind === 'angry') {
      // 嫌がった: そこでやめる
      s.angry = true;
      audio.se('angry');
      this.hideStrokeHand();
      return;
    }
    s.happy++;
    audio.se('tap', { pitch: kind === 'asleep' ? 0.8 : 1.25 + Math.random() * 0.2 });
    // ときどきハート(眠っているときは小さく1つ)
    if (s.ticks % 3 === 0 && Math.random() < 0.6) {
      this.hearts(kind === 'asleep' ? 1 : 1 + Math.floor(Math.random() * 2));
      if (kind === 'happy' && Math.random() < 0.5) audio.se('happy');
    }
  }

  private endStroke(): void {
    const s = this.stroke;
    this.stroke = null;
    this.hideStrokeHand();
    if (!s || !this.life) return;
    // ほとんど動かしていなければタップ
    if (s.ticks === 0 && s.dist < 18) {
      this.tapMonz();
      return;
    }
    // なで終わり: 機嫌と経験値(1回のなでるにつき1回ぶん)
    if (s.ticks > 0) this.record?.pet(!s.angry && s.happy > 0);
  }

  private showStrokeHand(x: number, y: number): void {
    // 企画者の手の絵(指さしの手)。人さし指の先を、触った所の少し上に合わせる(本物の指で隠れないように)
    const useImage = this.textures.exists(HAND_KEY);
    if (!this.strokeHand) {
      if (useImage) {
        this.strokeHand = this.add.image(0, 0, HAND_KEY).setOrigin(HAND_TIP[0], HAND_TIP[1]).setDepth(DEPTH.effect).setScale(105 / 300);
      } else {
        canvasTextureOnce(this, 'home:hand', 220, 220, (ctx) => drawIcon(ctx, 'pet', 110, 116, 82));
        this.strokeHand = this.add.image(0, 0, 'home:hand').setDepth(DEPTH.effect).setScale(0.6);
      }
    }
    const wobble = Math.sin(this.t * 14) * 8;
    if (useImage) this.strokeHand.setVisible(true).setPosition(x - 4, y - 55).setAngle(wobble);
    else this.strokeHand.setVisible(true).setPosition(x + 16, y - 90).setAngle(180 + wobble);
  }

  private hideStrokeHand(): void {
    this.strokeHand?.setVisible(false);
  }

  /** ごはん: 骨付き肉が落ちてきて、3口で食べる(かじった跡が増えて、最後は消える) */
  private feed(): void {
    const view = this.view!;
    const life = this.life!;
    const brain = life.body;
    this.busy = true;
    life.pause(6);
    audio.se('select');
    const s = this.scaleAt(life.y) / SCALE_FRONT;
    // ごはんは骨付き肉(企画者の絵)。ひとくちごとに、かじった跡が増える。絵を読み込めなかったときは仮の絵
    const meat = this.icon(MEAT_KEY, true);
    for (let b = 0; b <= 3; b++) canvasTextureOnce(this, `home:meat${b}`, 220, meat ? 143 : 150, (ctx) => (meat ? drawMeatImage(ctx, meat, 220, 143, b) : drawMeat(ctx, b)));
    const side: 1 | -1 = insidePolygon([life.x + 150 * s * life.facing, life.y], this.floor) ? life.facing : life.facing === 1 ? -1 : 1;
    life.facing = side;
    const bx = life.x + 150 * s * side;
    const bowl = this.add.image(bx, life.y - 220, 'home:meat0').setOrigin(0.5, 0.85).setScale(0.62 * s).setDepth(DEPTH.monz + (side > 0 ? 1 : -1)).setAlpha(0);
    this.tweens.add({ targets: bowl, alpha: 1, duration: 120 });
    this.tweens.add({
      targets: bowl,
      y: life.y + 4,
      duration: 420,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        audio.se('plop');
        brain.reaction = { face: 'happy', kind: 'surprised', left: 0.6, age: 0 };
        for (let i = 0; i < 3; i++) {
          this.time.delayedCall(700 + i * 650, () => {
            audio.se('knock', { pitch: 1.6 + i * 0.15 });
            brain.reaction = { face: i % 2 ? 'closed' : 'happy', kind: 'calm', left: 0.4, age: 0 };
            bowl.setTexture(`home:meat${i + 1}`);
            const word = this.text(view.x + side * 70 * s, life.y - MONZ_H * this.scaleAt(life.y) - 10, 'もぐ', 34, '#ffffff').setDepth(DEPTH.effect);
            this.tweens.add({ targets: word, y: word.y - 50, alpha: 0, duration: 600, onComplete: () => word.destroy() });
          });
        }
        this.time.delayedCall(700 + 3 * 650, () => {
          this.tweens.add({ targets: bowl, alpha: 0, scale: bowl.scale * 0.6, duration: 320, onComplete: () => bowl.destroy() });
          audio.se('happy');
          this.record?.feed();
          brain.reaction = { face: 'happy', kind: 'happy', left: 1.6, age: 0 };
          this.hearts(3);
          this.time.delayedCall(1600, () => (this.busy = false));
        });
      },
    });
  }

  /** なでる: 手が出てきて頭をなでる(反応はタップのときと同じ) */
  private petWithHand(): void {
    const view = this.view!;
    const life = this.life!;
    this.busy = true;
    life.pause(3.5);
    const sc = this.scaleAt(life.y);
    canvasTextureOnce(this, 'home:hand', 220, 220, (ctx) => drawIcon(ctx, 'pet', 110, 116, 82));
    const headY = life.y - MONZ_H * sc;
    const hand = this.add.image(view.x, headY - 120, 'home:hand').setDepth(DEPTH.effect).setAlpha(0).setAngle(180).setScale(sc / SCALE_FRONT * 0.7);
    this.tweens.add({ targets: hand, alpha: 1, y: headY, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: hand,
      x: { from: view.x - 50, to: view.x + 50 },
      duration: 260,
      delay: 260,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onStart: () => audio.se('spray', { pitch: 0.5 }),
      onComplete: () => {
        const kind = life.petted();
        this.record?.pet(kind === 'happy');
        this.record?.setAsleep(false);
        audio.se(kind);
        if (kind === 'happy') this.hearts(3);
        this.tweens.add({ targets: hand, alpha: 0, y: headY - 100, duration: 240, onComplete: () => hand.destroy() });
        this.time.delayedCall(900, () => (this.busy = false));
      },
    });
  }

  /** 中身がまだないボタン: 「じゅんび中」を出す */
  private comingSoon(label: string): void {
    this.busy = true;
    audio.se('tap', { pitch: 0.8 });
    const key = `home:soon:${label}`;
    canvasTextureOnce(this, key, 520, 300, (ctx) => {
      const p = drawPaper(ctx, 520, 300, label.length);
      ctx.fillStyle = '#16101c';
      ctx.font = `900 46px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [`${label}は`, 'じゅんび中！'].forEach((l, i) => ctx.fillText(l, 260, p.y + p.h / 2 + (i - 0.5) * 60));
      ctx.textAlign = 'left';
    });
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0, 0).setDepth(DEPTH.popup).setInteractive();
    const card = this.add.image(W / 2, H * 0.45, key).setDepth(DEPTH.popup + 1).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    const close = () => {
      shade.destroy();
      this.tweens.add({ targets: card, scale: 0.6, alpha: 0, duration: 160, onComplete: () => card.destroy() });
      audio.se('back');
      this.busy = false;
    };
    this.time.delayedCall(250, () => shade.once('pointerdown', close));
  }

  private hearts(n: number): void {
    const life = this.life!;
    const sc = this.scaleAt(life.y);
    canvasTextureOnce(this, 'home:heart', 72, 66, (ctx) => drawHeart(ctx, 72, 66));
    for (let i = 0; i < n; i++) {
      const h = this.add.image(life.x + (i - (n - 1) / 2) * 50, life.y - MONZ_H * sc - 10, 'home:heart').setDepth(DEPTH.effect).setScale(0.25);
      this.tweens.add({ targets: h, scale: 0.6 + (i % 2) * 0.15, duration: 260, delay: i * 120, ease: 'Back.easeOut' });
      this.tweens.add({ targets: h, y: h.y - 120 - i * 16, alpha: 0, duration: 1200, delay: i * 120 + 200, onComplete: () => h.destroy() });
    }
  }

  private text(x: number, y: number, s: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: Math.round(size * 0.2), align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH.effect);
  }

  update(_time: number, delta: number): void {
    const view = this.view;
    const life = this.life;
    if (!view || !life) return;
    const dt = Math.min(delta / 1000, 0.1);
    this.t += dt;
    life.update(dt);
    // お腹・眠さ・機嫌を進める(保存は30秒ごと)。眠くなると自分で眠り、元気になると起きる
    const record = this.record;
    if (record) {
      this.saveTimer += dt;
      const save = this.saveTimer > 30;
      if (save) this.saveTimer = 0;
      record.tick(dt, Date.now(), save);
    }
    // 奥ほど小さく、手前にいるほど前に描く
    const sc = this.scaleAt(life.y);
    // 行動に合わせて、企画者の姿の絵に切りかえる
    const pose = this.poseFor();
    this.showPose(pose, sc);
    // お腹がすいてごはんを欲しがっているときは、頭の上に肉の吹き出し(お腹がすいた姿の絵には吹き出しが描いてあるので出さない)
    this.showBubble(life.act === 'beg' && !life.isPaused && pose !== 'hungry');
    // 左を向くときは反転する(目は反転しない。BunkView.mirrored)
    view.mirrored = life.facing < 0;
    view.setPosition(life.x, life.y).setScale(sc).setDepth(DEPTH.monz + this.depthOf(life.y));
    view.render(life.body, this.t);
    this.shadow?.setPosition(life.x, life.y + 2).setScale(sc / SCALE_FRONT).setDepth(DEPTH.monz - 1);
    const brain = life.body;
    // 眠っている姿の絵には「Z」が描いてあるので、そのときは出さない
    const sleeping = brain.activity === 'sleep' && !brain.switching && this.shownPose !== 'sleep';
    this.zText?.setVisible(sleeping);
    if (sleeping && this.zText) {
      const k = (this.t % 2) / 2;
      this.zText.setPosition(life.x + 60 + k * 30, life.y - MONZ_H * sc - k * 50).setAlpha(1 - k).setScale(0.7 + k * 0.6);
    }
  }
}
