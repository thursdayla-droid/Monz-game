import * as Phaser from 'phaser';
import { speciesName } from '../core/species';
import { audio } from '../audio/engine';
import { BunkBrain } from '../core/bunkBehavior';
import { HOME_ACTIONS, HOME_ACTION_LABELS, HOME_ACTION_READY, ALL_PLACES, HOME_LAYOUTS, clipPolygonX, insidePolygon, randomPointIn, savedHomePlace, type HomeAction, type HomePlace, type Pt } from '../core/home';
import { MonzLife } from '../core/life';
import { moodWord, NEEDS_RULES } from '../core/needs';
import { clearLife, LifeRecord, loadLife, saveLife } from '../core/lifeSave';
import { mulberry32 } from '../core/rng';
import { currentStats, LOVE_RULES, shownLove, STAT_KEYS, STAT_LABELS, STAT_MAX, type StatBlock, type StatKey } from '../core/stats';
import { clearSave, loadSave } from '../core/save';
import { BUNK_MOTION, BunkView, cutoutKey, TEST_PERSONALITY } from '../render/bunkView';
import { drawCoin, drawHeart, drawIcon, drawMeat, drawMeatImage, drawMenuButton, drawPanel } from '../ui/homeArt';
import { canvasTexture, canvasTextureOnce, drawPaper, UI_FONT } from '../ui/paint';
import { openSoundSettings } from '../ui/soundButton';
import { preloadPacks } from '../render/packs';
import { HomeFurniture, preloadFurniture, type RoomView } from './HomeFurniture';

const W = 720;
const H = 1280;
/** MONZの絵の高さ(大きさ1のとき)。ハートや吹き出しの位置に使う */
const MONZ_H = 1150;
/** 下のメニュー */
const MENU = { y: 1198, w: 111, h: 134, gap: 6 };
/** 画面の左右のはしから、MONZの足元までの最小の距離 */
const EDGE = 110;
/** BUNKの体の横はばの半分(大きさ1のとき・手袋の先まで) */
const BODY_HALF = 240;
/** 家具が奥で小さくなる度合い(MONZの何倍か。1 = MONZと同じ) */
const FURNITURE_PERSP = 0.55;
const DEPTH = { monz: 10, effect: 30, ui: 40, popup: 60 };

/** 企画者の部屋の絵(design/home/rooms/ → public/assets/home/rooms/)。_thumb は部屋を選ぶ画面の小さい絵 */
export const homeImageFile = (p: HomePlace, thumb = false) => `assets/home/rooms/${p}${thumb ? '_thumb' : ''}.webp`;
export const homeImageKey = (p: HomePlace, thumb = false) => `home:bg:${p}${thumb ? ':thumb' : ''}`;

/** 選んだお世話部屋。まだ選んでいなければ undefined(「どこで育てる？」の画面へ) */
export function homePlace(): HomePlace | undefined {
  return savedHomePlace(loadLife().place);
}
/** 企画者のアイコン(design/home/icons.png → design/home/make_icons.py で切り分け) */
/** 企画者のアイコンがあるもの(ステータスはまだないので仮の絵) */
export const HOME_ICONS = ['food', 'minigame', 'battle', 'shop', 'settings', 'coin'] as const;
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
  hungry: { height: 1.0 },
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
/** 手のカーソルの指先を、本物の指からどれだけずらして出すか(指に隠れないように上へ) */
const HAND_TIP_OFFSET: [number, number] = [-10, -150];
export const MEAT_FILE = 'meat.webp';

/**
 * お世話画面(第1段階)。部屋は「ストリート・ポップ・近未来」から、生まれた後にプレイヤーが選ぶ(RoomSelectScene)。
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
  /** 「最初から」を押した(画面を閉じるときに保存しない) */
  private resetting = false;
  private moodText?: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Image;
  /** 指でなでている途中(なぞった距離など)。null ならなでていない */
  private stroke: { x: number; y: number; dist: number; sinceTick: number; ticks: number; happy: number; angry: boolean; onMonz: boolean; follow: boolean } | null = null;
  private strokeHand?: Phaser.GameObjects.Image;
  /** 行動に合わせた姿の絵(座る・眠る・伸び・見渡す・お腹がすいた・眠い)。出している間は BunkView を隠す */
  private poseImg?: Phaser.GameObjects.Image;
  private shownPose: BunkPoseImage | null = null;
  place: HomePlace = 'street';
  /** アイテムボックスから「部屋に置く」で来たときの家具 */
  private pendingPlace?: string;
  private furniture?: HomeFurniture;
  private roomView: RoomView = { k: 1, ox: 0, oy: 0 };
  /** 家具を置ける床(画面の座標) */
  private furnitureFloor: Pt[] = [];
  private scaleRange: [number, number] = [0.09, 0.19];

  constructor() {
    super('Home');
  }

  init(data: { placeItem?: string }): void {
    this.pendingPlace = data?.placeItem;
    // Phaser は、次に data なしで開いたときも前の data を使うので、使ったら消しておく
    if (data) delete data.placeItem;
  }

  preload(): void {
    preloadPacks(this, ['bunk', 'home']);
    preloadFurniture(this, loadLife().inventory.owned);
  }

  create(): void {
    this.t = 0;
    this.busy = false;
    this.resetting = false;
    this.view = undefined;
    this.life = undefined;
    const monz = loadSave()?.firstMonz ?? 'bunk';
    const place = homePlace();
    if (!place) {
      // まだ部屋を選んでいない(生まれた直後など)
      this.scene.start('RoomSelect');
      return;
    }
    this.place = place;
    // 部屋を選ぶ画面で読んだ、ほかの部屋の絵はもう使わないので外す
    for (const p of ALL_PLACES) {
      if (this.textures.exists(homeImageKey(p, true))) this.textures.remove(homeImageKey(p, true));
      if (p !== place && this.textures.exists(homeImageKey(p))) this.textures.remove(homeImageKey(p));
    }
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
    const view = new BunkView(this, life.x, life.y, this.scaleRange[0]);
    view.still = false;
    this.view = view;
    this.poseImg = this.add.image(life.x, life.y, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
    // 指でなでる・タップ: 画面のどこを触ったかで判断する(MONZの体のあたりなら反応。座る・眠るなどの絵のときも同じ)
    // 手のカーソルは画面のどこを触っても出る(ボタン・上の表示の所は除く)。MONZが反応するのは、MONZを触ったときだけ
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || p.y < 170 || p.y > MENU.y - MENU.h / 2 - 14) return;
      this.startStroke(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveStroke(p));
    this.input.on('pointerup', () => this.endStroke());
    this.input.on('pointerupoutside', () => this.endStroke());
    this.zText = this.text(0, 0, 'z', 34, '#ffffff').setVisible(false);

    // 家具(企画者決定 2026-10-21)。MONZは家具をよけて歩く
    const layout0 = HOME_LAYOUTS[this.place];
    const ox0 = this.roomView.ox;
    // 家具の大きさと重なりの順番は、MONZの歩ける床より奥(壁ぎわ)でも遠近が合うように、範囲の外ものばして計算する
    const t = (y: number) => (y - this.yBack) / (this.yFront - this.yBack);
    const furn = new HomeFurniture(
      this,
      record,
      this.roomView,
      this.furnitureFloor,
      this.floor,
      // 企画者の指示(2026-10-22): 奥へ行くと小さくなるのは続けるが、小さくなりすぎないように(MONZより ひかえめに小さくする)
      (y) => (1 - (1 - Phaser.Math.Linear(this.scaleRange[0], this.scaleRange[1], t(y)) / this.scaleRange[1]) * FURNITURE_PERSP) * (layout0.furnitureScale ?? 1),
      (y) => DEPTH.monz + t(y),
      MENU.y - MENU.h / 2 - 14,
      [ox0 + layout0.vanish[0] * this.roomView.k, this.roomView.oy + layout0.vanish[1] * this.roomView.k],
    );
    this.furniture = furn;
    // BUNKの体の横はばの半分(手袋の先まで)。左右の家具に体がめりこまない
    furn.bodyHalf = (y) => BODY_HALF * this.scaleAt(y);
    life.blocked = furn.blocked;
    this.moveOutOfFurniture();
    furn.onEnd = () => {
      this.busy = false;
      this.moveOutOfFurniture();
    };

    this.buildTop(record.monz.name ?? speciesName(monz));
    this.buildMenu();
    this.buildTestButtons();
    if (this.pendingPlace) this.startEdit(this.pendingPlace);

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
      // 「最初から」で消したあとは保存しない(前のデータ・部屋が戻ってしまうため)
      if (!this.resetting) record.tick(0, Date.now(), true);
    });
  }

  /** 背景と、歩ける床の範囲(画面の座標にする) */
  private drawBackground(): void {
    const layout = HOME_LAYOUTS[this.place];
    this.scaleRange = layout.scale;
    const img = this.add.image(W / 2, H / 2, homeImageKey(this.place)).setDepth(-10);
    const w = img.width;
    const h = img.height;
    const k = layout.fit === 'contain' ? Math.min(W / w, H / h) : Math.max(W / w, H / h);
    img.setScale(k);
    const ox = (W - w * k) / 2;
    const oy = (H - h * k) / 2;
    const sx = w / layout.w;
    const sy = h / layout.h;
    // 絵が画面より横に広いときは、はみ出した所を歩かないようにする(体の半分ぶん内側まで)
    const mapped = layout.floor.map(([x, y]) => [ox + x * sx * k, oy + y * sy * k] as Pt);
    const edge = layout.edge ?? EDGE;
    this.floor = clipPolygonX(mapped, edge, W - edge);
    // 家具は、奥の壁・左右の壁のきわまで置ける(MONZが歩けない所にも)
    // 画面の外にははみ出さない(企画者の指示 2026-10-21)
    this.furnitureFloor = clipPolygonX(layout.furniture.map(([x, y]) => [ox + x * sx * k, oy + y * sy * k] as Pt), 4, W - 4);
    this.roomView = { k, ox, oy };
    this.yBack = Math.min(...this.floor.map((p) => p[1]));
    this.yFront = Math.max(...this.floor.map((p) => p[1]));
  }

  /** 奥(0)〜手前(1) */
  private depthOf(y: number): number {
    return Phaser.Math.Clamp((y - this.yBack) / (this.yFront - this.yBack), 0, 1);
  }

  private scaleAt(y: number): number {
    return Phaser.Math.Linear(this.scaleRange[0], this.scaleRange[1], this.depthOf(y));
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
    // 今の気分のひとこと(お腹・なでる・眠さ・機嫌で変わる)
    this.moodText = this.add.text(140, 98, moodWord(record.needs), { fontFamily: UI_FONT, fontSize: '20px', fontStyle: 'bold', color: ink });
    card.add(this.moodText);

    // コインのカード
    canvasTexture(this, 'home:coinCard', 252, 84, (ctx) => {
      drawPanel(ctx, 252, 84, 93);
      const coin = this.icon('coin');
      if (coin) ctx.drawImage(coin, 6, 4, 76, 76);
      else drawCoin(ctx, 44, 42, 27);
    });
    const coinCard = this.add.container(W - 16 - 126, 14 + 42).setDepth(DEPTH.ui);
    // アイテムボタン(企画者決定 2026-10-21: コインの下に小さく)。アイテムボックスを開く
    canvasTexture(this, 'home:itemButton', 150, 60, (ctx) => {
      drawPanel(ctx, 150, 60, 95);
      ctx.fillStyle = ink;
      ctx.font = `900 26px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('アイテム', 75, 31);
      ctx.textAlign = 'left';
    });
    this.add
      .image(W - 16 - 75, 14 + 84 + 10 + 30, 'home:itemButton')
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openItems('box'));
    // もようがえボタン(置いてある家具を動かす・しまう)
    canvasTexture(this, 'home:editButton', 150, 60, (ctx) => {
      drawPanel(ctx, 150, 60, 96);
      ctx.fillStyle = ink;
      ctx.font = `900 22px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('もようがえ', 75, 31);
      ctx.textAlign = 'left';
    });
    this.add
      .image(W - 16 - 75, 14 + 84 + 10 + 30 + 68, 'home:editButton')
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startEdit());
    coinCard.add(this.add.image(0, 0, 'home:coinCard'));
    const shown = { v: record.coins };
    const label = this.add.text(104, 2, shown.v.toLocaleString(), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '34px', color: ink }).setOrigin(1, 0.5);
    coinCard.add(label);
    // 増えたり減ったりしたときは、数字が動いて、札が少しはねる
    record.on((e) => {
      drawBar();
      lv.setText(`Lv. ${record.level}`);
      if (e.type === 'levelUp') {
        this.levelUp(e.level, e.gain);
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
  private levelUp(level: number, gain: StatBlock): void {
    audio.se('sting');
    const gains = STAT_KEYS.filter((k) => gain[k] > 0)
      .map((k) => `${STAT_LABELS[k]} +${gain[k]}`)
      .join('  ');
    const t = this.text(W / 2, 470, `LEVEL UP!\nLv. ${level}`, 64, '#ffd23a').setDepth(DEPTH.popup).setScale(0.3);
    const sub = this.text(W / 2, 590, `${gains}\nポイント +1`, 24, '#ffffff').setDepth(DEPTH.popup).setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, delay: 300, duration: 300 });
    this.tweens.add({ targets: sub, alpha: 0, delay: 2600, duration: 500, onComplete: () => sub.destroy() });
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 60, delay: 2600, duration: 500, onComplete: () => t.destroy() });
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
    button(260, '最初から', () => {
      // お世話画面のデータ(場所・コイン)も消して、場所を決め直す
      this.resetting = true;
      clearSave();
      clearLife();
      this.scene.start('Title');
    });
    button(302, '誕生をもう一度', () => {
      // 確認用: 部屋も選び直す(部屋の選択を消して、置いた家具はアイテムボックスへ)。画面を閉じるときの保存で戻らないようにする
      this.resetting = true;
      const life = this.record?.snapshot ?? loadLife();
      saveLife({ ...life, place: undefined, inventory: { ...life.inventory, placed: [] } });
      this.scene.start('Birth', { intro: true });
    });
    // 【仮】部屋を変えるのは、いずれショップでコインを使う(企画者決定)。ショップができるまでの確認用
    button(428, '部屋を選び直す', () => this.scene.start('RoomSelect'));
    button(344, '+1000コイン', () => this.record?.add(1000));
    // 時間を進めて、お腹がすいたり眠くなったりするのを確かめる
    button(386, '6時間すすめる', () => {
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
    else if (action === 'status') this.openStatus();
    else if (action === 'shop') this.openItems('shop');
    else if (action === 'minigame') {
      audio.se('next');
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MinigameSelect'));
    }
    else this.comingSoon(HOME_ACTION_LABELS[action]);
  }

  /** もようがえ(家具を置く・動かす)。MONZはそのあいだ止まる */
  private startEdit(newItem?: string): void {
    if (!this.furniture || this.furniture.editing) return;
    if (newItem === undefined && this.busy) return;
    this.busy = true;
    this.endStroke();
    this.furniture.startEdit(newItem);
  }

  /** 家具の上にMONZがいたら、近くの空いている床に移す */
  private moveOutOfFurniture(): void {
    const life = this.life;
    const furn = this.furniture;
    if (!life || !furn || !furn.blocked([life.x, life.y])) return;
    const rng = mulberry32((Date.now() >>> 5) & 0xffffffff);
    for (let i = 0; i < 200; i++) {
      const p = randomPointIn(rng, this.floor);
      if (!furn.blocked(p)) {
        [life.x, life.y] = p;
        return;
      }
    }
  }

  /** ショップ・アイテムボックス(ShopScene) */
  private openItems(mode: 'shop' | 'box'): void {
    if (this.busy) return;
    this.busy = true;
    audio.se('next');
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Shop', { mode }));
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

  /**
   * 手のカーソルの人さし指の先(画面の座標)。企画者の指示(2026-10-22): 当たりは指先のあたりだけ。
   * 手の絵は本物の指より上に出している(showStrokeHand)ので、その指先の所で判定する
   */
  private tipOf(x: number, y: number): Pt {
    return [x + HAND_TIP_OFFSET[0], y + HAND_TIP_OFFSET[1]];
  }

  /** 指先がMONZの体の上か(体の絵より少し内側。広すぎると、そばを触ってもなでたことになるため) */
  private onMonz(x: number, y: number): boolean {
    const life = this.life;
    if (!life) return false;
    const [tx, ty] = this.tipOf(x, y);
    const sc = this.scaleAt(life.y);
    return Math.abs(tx - life.x) < 430 * sc && ty < life.y - 40 * sc && ty > life.y - (MONZ_H - 80) * sc;
  }

  private startStroke(p: Phaser.Input.Pointer): void {
    if (this.busy || !this.life) return;
    if (this.strokeHand) this.tweens.killTweensOf(this.strokeHand);
    const onMonz = this.onMonz(p.x, p.y);
    // 床を押さえたら、BUNKが指を追いかけてくる(企画者決定 2026-10-22。眠い・機嫌が悪い・お腹がすいているときは来ない)
    const follow = !onMonz && this.life.follow(this.tipOf(p.x, p.y));
    this.stroke = { x: p.x, y: p.y, dist: 0, sinceTick: 0, ticks: 0, happy: 0, angry: false, onMonz, follow };
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
    if (s.follow) {
      // 指がBUNKの体の上に来たら(BUNKが追いついた・指をBUNKにのせた)、追いかけるのをやめて なでるに切りかえる
      if (this.onMonz(p.x, p.y)) {
        life.follow(null);
        s.follow = false;
        s.onMonz = true;
        s.dist = 0;
        s.sinceTick = 0;
      } else {
        life.follow(this.tipOf(p.x, p.y));
        return;
      }
    }
    // MONZの体の上をなぞっているときだけ数える
    if (!this.onMonz(p.x, p.y)) return;
    s.dist += d;
    s.sinceTick += d;
    if (s.sinceTick < HomeScene.STROKE_STEP) return;
    s.sinceTick = 0;
    s.ticks++;
    const kind = life.stroked(this.record?.touchFull ?? false);
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
    if (s?.follow) {
      this.life?.follow(null);
      this.hideStrokeHand();
      return;
    }
    if (!s || !this.life) {
      this.hideStrokeHand();
      return;
    }
    // ほとんど動かしていなければタップ: 手で「ちょん」とつついてから消す
    if (s.ticks === 0 && s.dist < 18) {
      this.pokeHand();
      if (s.onMonz) this.tapMonz();
      return;
    }
    this.hideStrokeHand();
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
    // 手の絵がまるごと指より上に見えるように(指先から下に手が描いてあるので、そのままだと本物の指に隠れる)
    if (useImage) this.strokeHand.setVisible(true).setAlpha(1).setPosition(x + HAND_TIP_OFFSET[0], y + HAND_TIP_OFFSET[1]).setAngle(wobble);
    else this.strokeHand.setVisible(true).setPosition(x + 16, y - 90).setAngle(180 + wobble);
  }

  private hideStrokeHand(): void {
    if (!this.strokeHand) return;
    this.tweens.killTweensOf(this.strokeHand);
    this.strokeHand.setVisible(false).setAlpha(1);
  }

  /** タップしたとき: 手が少しつつく動きをして、ふわっと消える */
  private pokeHand(): void {
    const h = this.strokeHand;
    if (!h) return;
    this.tweens.killTweensOf(h);
    h.setVisible(true).setAlpha(1);
    this.tweens.chain({
      targets: h,
      tweens: [
        { x: h.x + 6, y: h.y + 12, duration: 90, ease: 'Quad.easeOut' },
        { x: h.x, y: h.y, duration: 120, ease: 'Quad.easeIn' },
        { alpha: 0, duration: 260, delay: 250, onComplete: () => this.hideStrokeHand() },
      ],
    });
  }

  /** ごはん: 骨付き肉が落ちてきて、3口で食べる(かじった跡が増えて、最後は消える) */
  private feed(): void {
    const view = this.view!;
    const life = this.life!;
    const brain = life.body;
    this.busy = true;
    life.pause(6);
    audio.se('select');
    const s = this.scaleAt(life.y) / this.scaleRange[1];
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
        // お腹がいっぱい(ゲージ MAX)なら、食べずに怒る(企画者決定 2026-10-21)。経験値・愛もふえない
        if (this.record && this.record.needs.full >= NEEDS_RULES.gaugeMax) {
          this.time.delayedCall(250, () => {
            audio.se('angry');
            brain.reaction = { face: 'angry', kind: 'angry', left: 1.6, age: 0 };
            // 肉を押しのける
            this.tweens.add({ targets: bowl, x: bowl.x + side * 260 * s, y: bowl.y - 40, angle: side * 120, alpha: 0, duration: 520, ease: 'Cubic.easeOut', delay: 300, onComplete: () => bowl.destroy() });
            this.time.delayedCall(1700, () => (this.busy = false));
          });
          return;
        }
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

  /**
   * ステータス画面: 6種類(HP・パワー・タフネス・スピード・テクニック・愛)と、自由ポイントの振り分け。
   * 振り分けは、えらぶ → 確認(振り直しできません) → 決定。愛には振れない。
   */
  private openStatus(): void {
    const record = this.record;
    if (!record) return;
    this.busy = true;
    audio.se('select');
    const pw = 640;
    const ph = 900;
    const px = (W - pw) / 2;
    const py = 170;
    const ink = '#16101c';
    const layer = this.add.container(0, 0).setDepth(DEPTH.popup);
    const shade = this.add.rectangle(0, 0, W, H, 0x0d0614, 0.75).setOrigin(0, 0).setInteractive();
    canvasTextureOnce(this, 'home:statusPanel', pw, ph, (ctx) => drawPanel(ctx, pw, ph, 97));
    layer.add([shade, this.add.image(px, py, 'home:statusPanel').setOrigin(0, 0)]);
    const t = (x: number, y: number, s: string, size: number, color = ink, ox = 0) =>
      this.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color }).setOrigin(ox, 0);
    const content = this.add.container(0, 0);
    layer.add(content);
    const draw = () => {
      content.removeAll(true);
      const m = record.monz;
      const st = currentStats(m);
      content.add(this.add.image(px + 32, py + 30, 'home:portrait').setOrigin(0, 0));
      content.add(this.add.text(px + 166, py + 36, m.name ?? speciesName(m.species), { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '42px', color: ink }));
      content.add(t(px + 168, py + 94, `Lv. ${m.level}`, 30));
      const bar = this.add.graphics();
      bar.fillStyle(0x16101c, 1).fillRoundedRect(px + 290, py + 100, pw - 330, 26, 13);
      bar.fillStyle(0xd9c7a0, 1).fillRoundedRect(px + 295, py + 105, pw - 340, 16, 8);
      bar.fillStyle(0x2fa8ff, 1).fillRoundedRect(px + 295, py + 105, Math.max(16, (pw - 340) * record.expRate), 16, 8);
      content.add(bar);
      // ポイントの残り
      const pts = m.statPoints;
      content.add(t(px + 32, py + 168, pts > 0 ? `振り分けられるポイント：${pts}` : '振り分けられるポイント：なし', 28, pts > 0 ? '#c2410c' : '#5a4a66'));
      if (pts > 0) content.add(t(px + 32, py + 206, '＋をおすと 1 ずつ振り分けられます', 20, '#5a4a66'));
      // ゲージは数字そのまま: 通常ステータスは150、愛は100でいっぱい(企画者決定)
      // 6種類
      const rows: { label: string; value: number; max: number; key?: StatKey; color: number }[] = [
        ...STAT_KEYS.map((k, i) => ({ label: STAT_LABELS[k], value: st[k], max: STAT_MAX, key: k, color: [0xff4f5e, 0xff8a1f, 0x8a35e0, 0x2fa8ff, 0x2ed3c2][i] })),
        { label: '愛', value: shownLove(m.love), max: LOVE_RULES.max, color: 0xff4fa3 },
      ];
      rows.forEach((r, i) => {
        const y = py + 252 + i * 84;
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1).fillRoundedRect(px + 26, y, pw - 52, 70, 16);
        g.lineStyle(4, 0x16101c, 1).strokeRoundedRect(px + 26, y, pw - 52, 70, 16);
        g.fillStyle(r.color, 1).fillRoundedRect(px + 26, y, 20, 70, { tl: 16, bl: 16, tr: 0, br: 0 });
        content.add(g);
        content.add(t(px + 62, y + 18, r.label, 26));
        // 能力の横のゲージ
        const right = pw + px - (r.key && pts > 0 ? 130 : 46);
        const gx = px + 206;
        const gw = right - 76 - gx;
        const gauge = this.add.graphics();
        gauge.fillStyle(0x16101c, 1).fillRoundedRect(gx, y + 22, gw, 26, 13);
        gauge.fillStyle(0xe8dcc0, 1).fillRoundedRect(gx + 4, y + 26, gw - 8, 18, 9);
        const fill = Math.max(0, Math.min(1, r.value / r.max));
        // 長さは数字そのまま(最大でいっぱい)
        const fw = (gw - 8) * fill;
        if (fw > 0) gauge.fillStyle(r.color, 1).fillRoundedRect(gx + 4, y + 26, fw, 18, Math.min(9, fw / 2));
        content.add(gauge);
        content.add(t(right, y + 14, String(r.value), 34, ink, 1));
        if (r.key && pts > 0 && r.value < STAT_MAX) {
          const key = r.key;
          const plus = t(px + pw - 82, y + 9, '＋', 34, ink, 0.5).setBackgroundColor('#ffd23a').setPadding(14, 4, 14, 6).setInteractive({ useHandCursor: true });
          plus.on('pointerdown', () => confirm(key));
          content.add(plus);
        }
      });
      content.add(t(px + 32, py + 252 + 6 * 84 + 4, '愛はお世話で育ちます', 20, '#5a4a66'));
    };
    // 確認(振り直しはできない)
    const confirm = (key: StatKey) => {
      audio.se('tap');
      const box = this.add.container(0, 0);
      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0, 0).setInteractive();
      const g = this.add.graphics();
      g.fillStyle(0xfbf1dc, 1).fillRoundedRect(80, 470, W - 160, 330, 24);
      g.lineStyle(8, 0x16101c, 1).strokeRoundedRect(80, 470, W - 160, 330, 24);
      const msg = t(W / 2, 510, `${STAT_LABELS[key]}に 1\n振り分けますか？`, 36, ink, 0.5).setAlign('center');
      const warn = t(W / 2, 620, '振り直しはできません', 24, '#c2410c', 0.5);
      const yes = t(W / 2 + 110, 690, ' はい ', 34, ink, 0.5).setBackgroundColor('#ffd23a').setPadding(20, 8, 20, 10).setInteractive({ useHandCursor: true });
      const no = t(W / 2 - 110, 690, 'やめる', 34, '#ffffff', 0.5).setBackgroundColor('#8a35e0').setPadding(20, 8, 20, 10).setInteractive({ useHandCursor: true });
      box.add([dim, g, msg, warn, yes, no]);
      layer.add(box);
      yes.on('pointerdown', () => {
        if (record.allocate(key)) audio.se('select');
        box.destroy();
        draw();
      });
      no.on('pointerdown', () => {
        audio.se('back');
        box.destroy();
      });
    };
    draw();
    const close = t(W / 2, py + ph - 92, '  とじる  ', 38, ink, 0.5).setBackgroundColor('#ffd23a').setPadding(20, 10, 20, 12).setInteractive({ useHandCursor: true });
    layer.add(close);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 160 });
    close.on('pointerdown', () => {
      audio.se('back');
      layer.destroy();
      this.busy = false;
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
      const word = moodWord(record.needs);
      if (this.moodText && this.moodText.text !== word) this.moodText.setText(word);
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
    // 影(300x46)は、MONZの大きさ 0.165 のときの大きさ。MONZのすぐ後ろ(手前の家具には隠れる)
    this.shadow?.setPosition(life.x, life.y + 2).setScale(sc / 0.165).setDepth(DEPTH.monz + this.depthOf(life.y) - 0.001);
    if (this.furniture?.editing) life.pause(0.2);
    this.furniture?.update({ x: life.x, y: life.y, top: life.y - MONZ_H * sc, half: 330 * sc });
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
