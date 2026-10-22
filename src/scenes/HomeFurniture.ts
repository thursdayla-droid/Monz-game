import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { FURNITURE_ART_READY, FURNITURE_TURN_ART_READY, furniture, furnitureKey, furnitureTurnFile, furnitureTurnKey, KIND_RULES } from '../core/furniture';
import type { Pt } from '../core/home';
import type { LifeRecord } from '../core/lifeSave';
import { canPlace, footRect, inRect, isWalkable, TURN_HEIGHT, TURN_WIDTH, type FloorItem } from '../core/roomLayout';
import { canvasTextureOnce, UI_FONT } from '../ui/paint';
import { assetUrl } from '../assetUrl';

/** 部屋の絵の座標 ↔ 画面の座標(部屋の絵の大きさ k と、ずらし ox, oy) */
export interface RoomView {
  k: number;
  ox: number;
  oy: number;
}

interface Placed {
  uid: string;
  item: string;
  x: number;
  y: number;
  flip: boolean;
  /** 奥向き(左右の壁ぞいに、床の奥行きの線にそって置く) */
  turn: boolean;
  img: Phaser.GameObjects.Image;
}

/** 【仮】かたむけ具合(1 = タイルの線にぴったり)。強くかたむけると柱まで斜めになるので、少しひかえめにする */
// 企画者の指示(2026-10-22): はしに置くとゆがんで見えるので、形はあまり変えない(ひかえめに・上限つき)
const SHEAR_STRENGTH = 0.3;
/** かたむけの上限(上へ1進むと横へいくつずれるか) */
const SHEAR_MAX = 0.25;


/** 【仮】絵がまだない家具の見た目(シリーズの色の箱に名前) */
const PLACEHOLDER: Record<string, string> = { street: '#2a2230', pop: '#ffb3d1', cyber: '#14243f' };

/** 家具の絵を読み込む予定に入れる(お世話画面の preload から)。絵がない家具は【仮】の箱をその場で作る */
export function preloadFurniture(scene: Phaser.Scene, ids: string[]): void {
  for (const id of new Set(ids)) {
    const f = furniture(id);
    if (f && FURNITURE_ART_READY.includes(id) && !scene.textures.exists(furnitureKey(id))) scene.load.image(furnitureKey(id), assetUrl(f.file));
    if (FURNITURE_TURN_ART_READY.includes(id) && !scene.textures.exists(furnitureTurnKey(id))) scene.load.image(furnitureTurnKey(id), assetUrl(furnitureTurnFile(id)));
  }
}

function textureFor(scene: Phaser.Scene, id: string): string {
  if (scene.textures.exists(furnitureKey(id))) return furnitureKey(id);
  const f = furniture(id);
  const key = `furniture:ph:${id}`;
  canvasTextureOnce(scene, key, 300, 150, (ctx) => {
    ctx.fillStyle = PLACEHOLDER[f?.series ?? 'street'];
    ctx.strokeStyle = '#16101c';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(6, 6, 288, 138, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = f?.series === 'pop' ? '#16101c' : '#ffffff';
    ctx.font = `900 40px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f ? KIND_RULES[f.kind].name : '?', 150, 78);
  });
  return key;
}

/**
 * お世話部屋の家具(置く・動かす・反転・しまう・保存)。企画者決定(2026-10-21)。
 * 家具は床の上だけに置ける。重ねて置けない。MONZの通り道はふさげない(src/core/roomLayout.ts)。
 * 手前にある物ほど前に描く(MONZも同じ決まり)。家具の後ろにMONZが入ると、家具を少し透かす。
 */
export class HomeFurniture {
  private items: Placed[] = [];
  editing = false;
  private selected?: Placed;
  private drag?: { dx: number; dy: number; lastX: number; lastY: number };
  private panel?: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly record: LifeRecord,
    private readonly room: RoomView,
    /** 家具を置ける床 */
    private readonly floor: Pt[],
    /** MONZが歩ける床(通り道を調べる) */
    private readonly walkFloor: Pt[],
    /** 奥行きによる大きさ(手前=1) */
    private readonly persp: (y: number) => number,
    /** 前後の重なりの順番(MONZと同じ決まり) */
    private readonly depthAt: (y: number) => number,
    /** もようがえの画面の下の帯の上の端 */
    private readonly panelTop: number,
    /** 床のタイルの線が集まる点(画面の座標) */
    private readonly vanish: Pt,
  ) {
    for (const p of record.snapshot.inventory.placed) {
      const [x, y] = this.toScreen(p.x, p.y);
      this.items.push({ uid: p.uid, item: p.item, x, y, flip: p.flip, turn: p.turn === true, img: this.makeImage(p.item) });
    }
    this.items.forEach((it) => this.layout(it));
  }

  private toScreen(x: number, y: number): Pt {
    return [this.room.ox + x * this.room.k, this.room.oy + y * this.room.k];
  }

  private toRoom(x: number, y: number): Pt {
    return [Math.round((x - this.room.ox) / this.room.k), Math.round((y - this.room.oy) / this.room.k)];
  }

  private makeImage(item: string): Phaser.GameObjects.Image {
    return this.scene.add.image(0, 0, textureFor(this.scene, item)).setOrigin(0.5, 1);
  }

  private floorItem(it: { item: string; x: number; y: number; turn?: boolean }): FloorItem {
    return { item: it.item, x: it.x, y: it.y, persp: this.persp(it.y), ...(it.turn ? { turn: true } : {}) };
  }

  /** 縦向きに置けるのは、縦向きの絵がある家具だけ */
  private canTurnAt(item: string): boolean {
    return this.scene.textures.exists(furnitureTurnKey(item));
  }

  /**
   * 床のタイルの線(奥の消える点 vanish に向かう線)に合わせて、家具の絵を斜めにかたむけた絵を作る(企画者の指示 2026-10-21)。
   * 絵は描き直さず、下のはしを止めたまま上へいくほど横へずらすだけ。かたむきは 0.05 きざみで作って使い回す
   */
  private shearedTexture(item: string, flip: boolean, x: number, y: number, turn = false): { key: string; ox: number; base: number } {
    // 縦向きの絵は、奥へのびる線がそのままタイルの線になるので、ぴったり(1倍)かたむける
    const src = turn ? furnitureTurnKey(item) : textureFor(this.scene, item);
    const raw = (this.vanish[0] - x) / Math.max(40, y - this.vanish[1]);
    const sh = Math.round(Phaser.Math.Clamp(raw * SHEAR_STRENGTH, -SHEAR_MAX, SHEAR_MAX) * 20) / 20;
    const img = this.scene.textures.get(src).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const r = Math.min(1, 480 / img.width);
    const w = Math.round(img.width * r);
    const h = Math.round(img.height * r);
    const off = sh < 0 ? -sh * h : 0;
    const key = `${src}:sh:${flip ? 1 : 0}:${sh.toFixed(2)}`;
    canvasTextureOnce(this.scene, key, w + Math.abs(sh) * h, h, (ctx) => {
      // x' = x + sh * (h - y) + off(下のはしはそのまま、上ほどずらす)
      ctx.setTransform(1, 0, -sh, 1, sh * h + off, 0);
      if (flip) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, w, h);
    });
    return { key, ox: (w / 2 + off) / (w + Math.abs(sh) * h), base: w };
  }

  /** 大きさ・向き・かたむき・重なりの順番を合わせる */
  private layout(it: Placed): void {
    const kind = furniture(it.item)?.kind ?? 'toy';
    const w = KIND_RULES[kind].width * this.persp(it.y) * (it.turn ? TURN_WIDTH : 1);
    const t = this.shearedTexture(it.item, it.turn ? false : it.flip, it.x, it.y, it.turn);
    if (it.img.texture.key !== t.key) it.img.setTexture(t.key);
    it.img.setOrigin(t.ox, 1).setPosition(it.x, it.y).setScale(w / t.base, (w / t.base) * (it.turn ? TURN_HEIGHT : 1));
    // カーペットはいつもMONZの下
    it.img.setDepth(isWalkable(it.item) ? this.depthAt(this.floor[0][1]) - 2 : this.depthAt(it.y));
  }

  /** MONZがその場所を歩けないか(家具の上)。MONZの体のはばの分だけ広めに見る */
  blocked = (p: Pt): boolean => this.items.some((it) => !isWalkable(it.item) && inRect(p, footRect(this.floorItem(it)), 30 * this.persp(it.y), 8));

  /** 毎フレーム: 家具の後ろにMONZがいたら、その家具を少し透かす */
  update(monz: { x: number; y: number; top: number; half: number }): void {
    for (const it of this.items) {
      if (isWalkable(it.item)) continue;
      const b = it.img.getBounds();
      const hide = it.y > monz.y && monz.x + monz.half > b.left && monz.x - monz.half < b.right && monz.top < b.bottom && monz.y > b.top;
      const target = hide ? 0.55 : 1;
      it.img.setAlpha(it.img.alpha + (target - it.img.alpha) * 0.2);
    }
  }

  // ---------------- もようがえ ----------------

  /** もようがえを始める。newItem: アイテムボックスから部屋に置く家具 */
  startEdit(newItem?: string): void {
    if (this.editing) return;
    this.editing = true;
    this.buildPanel();
    this.items.forEach((it) => it.img.setAlpha(1));
    if (newItem) this.addNew(newItem);
    this.scene.input.on('pointerdown', this.onDown, this);
    this.scene.input.on('pointermove', this.onMove, this);
    this.scene.input.on('pointerup', this.onUp, this);
    this.scene.input.on('pointerupoutside', this.onUp, this);
  }

  /** もようがえを終える(終わったら onEnd) */
  onEnd?: () => void;

  private endEdit(): void {
    this.select(undefined);
    this.editing = false;
    this.panel?.destroy();
    this.panel = undefined;
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    audio.se('select');
    this.onEnd?.();
  }

  private addNew(item: string): void {
    const spot = this.findSpot(item);
    if (!spot) {
      this.toast('置ける場所がありません');
      return;
    }
    const [rx, ry] = this.toRoom(spot[0], spot[1]);
    const uid = this.record.placeItem(item, rx, ry);
    if (!uid) return;
    const it: Placed = { uid, item, x: spot[0], y: spot[1], flip: false, turn: false, img: this.makeImage(item) };
    this.items.push(it);
    this.layout(it);
    this.select(it);
    audio.se('plop');
  }

  /** 置ける場所を、床のまん中から近い順に探す */
  private findSpot(item: string): Pt | null {
    const xs = this.floor.map((p) => p[0]);
    const ys = this.floor.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const tries: Pt[] = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 20) for (let x = Math.min(...xs); x <= Math.max(...xs); x += 20) tries.push([x, y]);
    tries.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    const others = this.items.map((o) => this.floorItem(o));
    return tries.find(([x, y]) => canPlace({ item, x, y, persp: this.persp(y) }, others, this.floor, this.walkFloor)) ?? null;
  }

  private valid(it: Placed, x: number, y: number, turn = it.turn): boolean {
    if (turn && !this.canTurnAt(it.item)) return false;
    const others = this.items.filter((o) => o !== it).map((o) => this.floorItem(o));
    return canPlace(this.floorItem({ item: it.item, x, y, turn }), others, this.floor, this.walkFloor);
  }

  private select(it: Placed | undefined): void {
    this.selected?.img.clearTint();
    this.selected = it;
    it?.img.setTint(0xfff1a8);
    this.refreshPanel();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.y >= this.panelTop) return;
    // いちばん手前にある家具から順に、触った所にあるか見る
    const hit = [...this.items].sort((a, b) => b.img.depth - a.img.depth).find((it) => it.img.getBounds().contains(p.x, p.y));
    this.select(hit);
    if (!hit) return;
    audio.se('tap');
    this.drag = { dx: p.x - hit.x, dy: p.y - hit.y, lastX: hit.x, lastY: hit.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const it = this.selected;
    if (!it || !this.drag || !p.isDown) return;
    const ys = this.floor.map((q) => q[1]);
    it.x = p.x - this.drag.dx;
    it.y = Phaser.Math.Clamp(p.y - this.drag.dy, Math.min(...ys), Math.max(...ys));
    this.layout(it);
    it.img.setTint(this.valid(it, it.x, it.y) ? 0xfff1a8 : 0xff6a6a);
  }

  private onUp(): void {
    const it = this.selected;
    const d = this.drag;
    this.drag = undefined;
    if (!it || !d) return;
    if (!this.valid(it, it.x, it.y)) {
      // 置けない場所: 元の場所にもどす
      it.x = d.lastX;
      it.y = d.lastY;
      this.layout(it);
      audio.se('back');
      this.toast('そこには置けません');
    } else {
      const [rx, ry] = this.toRoom(it.x, it.y);
      this.record.movePlaced(it.uid, rx, ry, it.flip, it.turn);
    }
    it.img.setTint(0xfff1a8);
  }

  /**
   * 「向き」: 横向き → 横向き(反転) → 縦向き の順に変える。
   * 縦向き(頭が奥・足が手前)は、縦向きの絵がある家具だけ。その場所で置けない向きは飛ばす
   */
  private flip(): void {
    const it = this.selected;
    if (!it) return;
    const order: [boolean, boolean][] = [
      [false, false],
      [false, true],
      [true, false],
    ];
    const now = Math.max(0, order.findIndex(([t, f]) => t === it.turn && (t || f === it.flip)));
    for (let k = 1; k < order.length; k++) {
      const [turn, flip] = order[(now + k) % order.length];
      if (!this.valid(it, it.x, it.y, turn)) continue;
      it.turn = turn;
      it.flip = flip;
      this.layout(it);
      const [rx, ry] = this.toRoom(it.x, it.y);
      this.record.movePlaced(it.uid, rx, ry, it.flip, it.turn);
      audio.se('tap');
      return;
    }
    this.toast('ここでは向きを変えられません');
  }

  private store(): void {
    const it = this.selected;
    if (!it) return;
    this.select(undefined);
    this.record.storePlaced(it.uid);
    this.items = this.items.filter((o) => o !== it);
    it.img.destroy();
    audio.se('back');
    this.toast('アイテムボックスにもどしました');
  }

  // ---------------- 下の帯(反転・しまう・おわる) ----------------

  private buttons: Phaser.GameObjects.Text[] = [];

  private buildPanel(): void {
    const s = this.scene;
    const W = s.scale.width;
    const H = s.scale.height;
    const c = s.add.container(0, 0).setDepth(70);
    const bg = s.add.rectangle(0, this.panelTop, W, H - this.panelTop, 0x16101c, 0.92).setOrigin(0, 0).setInteractive();
    const title = s.add.text(W / 2, this.panelTop + 26, 'もようがえ中：家具をさわって動かせます', { fontFamily: UI_FONT, fontSize: '24px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    const mk = (x: number, label: string, onTap: () => void, bgColor: string, color = '#16101c') =>
      s.add
        .text(x, this.panelTop + 92, label, { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color, backgroundColor: bgColor, padding: { x: 22, y: 10 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);
    this.buttons = [mk(W / 2 - 220, '向き', () => this.flip(), '#ffffff'), mk(W / 2, 'しまう', () => this.store(), '#ffffff'), mk(W / 2 + 220, 'おわる', () => this.endEdit(), '#ffd23a')];
    c.add([bg, title, ...this.buttons]);
    this.panel = c;
    this.refreshPanel();
  }

  private refreshPanel(): void {
    if (!this.buttons.length) return;
    const on = !!this.selected;
    this.buttons[0].setAlpha(on ? 1 : 0.4);
    this.buttons[1].setAlpha(on ? 1 : 0.4);
  }

  private toast(msg: string): void {
    const s = this.scene;
    const t = s.add
      .text(s.scale.width / 2, this.panelTop - 60, msg, { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(80);
    s.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  }
}
