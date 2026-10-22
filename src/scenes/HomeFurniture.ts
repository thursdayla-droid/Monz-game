import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { FURNITURE_ART_READY, FURNITURE_TURN_LONG, NO_SHEAR_KINDS, NO_SHEAR_ITEMS, FURNITURE_TURN_WIDE, FURNITURE_TURN_ART_READY, furniture, furnitureKey, furnitureTurnFile, furnitureTurnKey, KIND_RULES } from '../core/furniture';
import type { Pt } from '../core/home';
import type { LifeRecord } from '../core/lifeSave';
import { canPlace, footRect, inRect, isWalkable, mainRegion, regionConnected, sizeLabel, sizeScale, sizeSteps, CARPET_SIZES, TURN_HEIGHT, TURN_LENGTH, type FloorItem } from '../core/roomLayout';
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
  /** カーペットの大きさ(0 小・1 中・2 大) */
  size: number;
  /** カーペットの実際の倍率(床に入るように小さくしたもの) */
  fit?: number;
  img: Phaser.GameObjects.Image;
}

/** 【仮】かたむけ具合(1 = タイルの線にぴったり)。強くかたむけると柱まで斜めになるので、少しひかえめにする */
// 企画者の指示(2026-10-22): はしに置くとゆがんで見えるので、形はあまり変えない(ひかえめに・上限つき)
const SHEAR_STRENGTH = 0.3;
/** カーペットを床に入れるために小さくするのは、選んだ大きさのこの割合まで(企画者の指示 2026-10-22: 奥で小さくなりすぎない)【仮】 */
const CARPET_MIN_FIT = 0.7;
/** かたむけの上限(上へ1進むと横へいくつずれるか) */
const SHEAR_MAX = 0.25;


/** 【仮】絵がまだない家具の見た目(シリーズの色の箱に名前) */
const PLACEHOLDER: Record<string, string> = { street: '#2a2230', pop: '#ffb3d1', cyber: '#14243f', vip: '#1a1410' };

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
  /** 選んでいる家具の、さいごに置けていた場所と向き(置けない向きにしたまま終えたら、ここにもどす) */
  private good?: { x: number; y: number; turn: boolean; flip: boolean; size: number };
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
      this.items.push({ uid: p.uid, item: p.item, x, y, flip: p.flip, turn: p.turn === true, size: p.size ?? 0, img: this.makeImage(p.item) });
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

  private floorItem(it: { item: string; x: number; y: number; turn?: boolean; size?: number; fit?: number }): FloorItem {
    return { item: it.item, x: it.x, y: it.y, persp: this.persp(it.y), ...(it.turn ? { turn: true } : {}), ...(it.size ? { size: it.size } : {}), ...(it.fit ? { scale: it.fit } : {}) };
  }

  /** 縦向きに置けるのは、縦向きの絵がある家具だけ */
  private canTurnAt(item: string): boolean {
    return this.scene.textures.exists(furnitureTurnKey(item));
  }

  /**
   * 床のタイルの線(奥の消える点 vanish に向かう線)に合わせて、家具の絵を斜めにかたむけた絵を作る(企画者の指示 2026-10-21)。
   * 絵は描き直さず、下のはしを止めたまま上へいくほど横へずらすだけ。かたむきは 0.05 きざみで作って使い回す
   */
  private shearedTexture(item: string, flip: boolean, x: number, y: number, turn = false): { key: string; ox: number; base: number; baseH: number } {
    // 縦向きの絵は、奥へのびる線がそのままタイルの線になるので、ぴったり(1倍)かたむける
    const src = turn ? furnitureTurnKey(item) : textureFor(this.scene, item);
    const raw = (this.vanish[0] - x) / Math.max(40, y - this.vanish[1]);
    const upright = NO_SHEAR_KINDS.includes(furniture(item)?.kind ?? 'toy') || NO_SHEAR_ITEMS.includes(item);
    const sh = upright ? 0 : Math.round(Phaser.Math.Clamp(raw * SHEAR_STRENGTH, -SHEAR_MAX, SHEAR_MAX) * 20) / 20;
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
    return { key, ox: (w / 2 + off) / (w + Math.abs(sh) * h), base: w, baseH: h };
  }

  /** 大きさ・向き・かたむき・重なりの順番を合わせる */
  private layout(it: Placed): void {
    if (isWalkable(it.item)) it.fit = this.carpetFit(it, it.x, it.y) ?? it.fit ?? CARPET_SIZES[it.size];
    const kind = furniture(it.item)?.kind ?? 'toy';
    // テーブルなどの大きさ(カーペットは fit で決まる)
    const w = KIND_RULES[kind].width * this.persp(it.y) * (isWalkable(it.item) ? 1 : sizeScale(it.item, it.size));
    // 企画者の指示(2026-10-22): 向きは 横・横の反転・縦・縦の反転 の4つ。置く場所で勝手に反転しない
    const t = this.shearedTexture(it.item, it.flip, it.x, it.y, it.turn);
    if (it.img.texture.key !== t.key) it.img.setTexture(t.key);
    it.img.setOrigin(t.ox, 1).setPosition(it.x, it.y);
    if (it.turn) {
      const sy = (w * TURN_LENGTH * (FURNITURE_TURN_LONG[it.item] ?? 1) * (isWalkable(it.item) ? it.fit ?? 1 : 1)) / t.baseH;
      it.img.setScale((sy / TURN_HEIGHT) * (FURNITURE_TURN_WIDE[it.item] ?? 1), sy);
    } else it.img.setScale((w / t.base) * (isWalkable(it.item) ? it.fit ?? 1 : 1));
    // カーペットはいつもMONZと家具の下(大きいカーペットほど下)
    it.img.setDepth(isWalkable(it.item) ? this.depthAt(this.floor[0][1]) - 2 - it.size * 0.1 : this.depthAt(it.y));
  }

  /** MONZがその場所を歩けないか(家具の上)。MONZの体のはばの分だけ広めに見る */
  /** MONZの体の横はばの半分(足元の y での大きさ)。左右の家具に体がめりこまないように、これだけ離れて歩く */
  bodyHalf: (y: number) => number = (y) => 30 * this.persp(y);

  /** MONZがその場所を歩けないか(家具の上・家具のすぐ横)。企画者の指示(2026-10-22): 左右の家具に体がめりこまない */
  blocked = (p: Pt): boolean =>
    this.items.some((it) => {
      if (isWalkable(it.item)) return false;
      const r = footRect(this.floorItem(it));
      // 横は、見えている家具の絵のはしまで(床の上で占める広さより少し広い)
      const b = it.img.getBounds();
      const half = this.bodyHalf(p[1]);
      return inRect(p, { x0: Math.min(r.x0, b.left + 14), x1: Math.max(r.x1, b.right - 14), y0: r.y0, y1: r.y1 }, half, 8);
    });

  /**
   * 毎フレーム。企画者の指示(2026-10-22): MONZが近くを通っても家具は透かさない(前は後ろに入ると透かしていた)。
   * 呼ぶ所はそのまま残す(あとで家具ごとの動きを入れるとき用)
   */
  update(_monz: { x: number; y: number; top: number; half: number }): void {}

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
    const it: Placed = { uid, item, x: spot[0], y: spot[1], flip: false, turn: false, size: 0, img: this.makeImage(item) };
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
    if (isWalkable(it.item)) return this.carpetFit(it, x, y, turn) !== null;
    const others = this.items.filter((o) => o !== it).map((o) => this.floorItem(o));
    if (!canPlace(this.floorItem({ item: it.item, x, y, turn, size: it.size }), others, this.floor, this.walkFloor)) return false;
    // BUNKが実際に歩けるかでも確かめる(企画者の指示 2026-10-22: 家具の間を通れなくならないように)。
    // BUNKが通れないすきまで、床が分かれてしまう置き方はできない
    const saved = { x: it.x, y: it.y, turn: it.turn };
    Object.assign(it, { x, y, turn });
    this.layout(it);
    const ok = regionConnected(this.walkFloor, this.blocked, 12);
    Object.assign(it, saved);
    this.layout(it);
    return ok;
  }

  /** カーペットの、いちばん小さくしてよい倍率(選んだ大きさの8割まで。奥に行っても小さくなりすぎないように) */
  private carpetMin(it: Placed): number {
    return (CARPET_SIZES[it.size] ?? 1) * CARPET_MIN_FIT;
  }

  /** カーペットが、小さくなりすぎずに入るいちばん近い場所(なければ null)。奥へ行きすぎたら、手前へ寄せる */
  private nearestFullFit(it: Placed, x: number, y: number): Pt | null {
    const min = this.carpetMin(it);
    const others = this.items.filter((o) => o !== it).map((o) => this.floorItem(o));
    const ok = (px: number, py: number) => canPlace({ ...this.floorItem({ item: it.item, x: px, y: py, turn: it.turn }), scale: min }, others, this.floor, this.walkFloor);
    if (ok(x, y)) return [x, y];
    for (let r = 10; r <= 700; r += 10)
      for (let a = 0; a < 24; a++) {
        const px = x + Math.cos((a / 24) * Math.PI * 2) * r;
        const py = y + Math.sin((a / 24) * Math.PI * 2) * r;
        if (ok(px, py)) return [px, py];
      }
    return null;
  }

  /** カーペットがそこに入る倍率(選んだ大きさから、床に入るまで小さくする)。入らなければ null */
  private carpetFit(it: Placed, x: number, y: number, turn = it.turn): number | null {
    const others = this.items.filter((o) => o !== it).map((o) => this.floorItem(o));
    const ok = (k: number) => canPlace({ ...this.floorItem({ item: it.item, x, y, turn }), scale: k }, others, this.floor, this.walkFloor);
    const want: number = CARPET_SIZES[it.size] ?? 1;
    if (ok(want)) return want;
    let lo = Math.min(want, this.carpetMin(it));
    if (!ok(lo)) return null;
    let hi = want;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  private select(it: Placed | undefined): void {
    const was = this.selected;
    if (was && was !== it && this.good && !this.valid(was, was.x, was.y)) {
      // 置けない向きのまま ほかを選んだ・おわった: さいごに置けていた形にもどす
      Object.assign(was, this.good);
      this.layout(was);
    }
    if (it && it !== was) this.good = { x: it.x, y: it.y, turn: it.turn, flip: it.flip, size: it.size };
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
    // カーペットは、選んだ大きさのまま入るいちばん近い所に寄せる(奥に行っても小さくなりすぎないように。企画者の指示 2026-10-22)
    if (isWalkable(it.item)) {
      const near = this.nearestFullFit(it, it.x, it.y);
      if (near) [it.x, it.y] = near;
    }
    this.layout(it);
    it.img.setTint(this.valid(it, it.x, it.y) ? 0xfff1a8 : 0xff6a6a);
  }

  private onUp(): void {
    const it = this.selected;
    const d = this.drag;
    this.drag = undefined;
    if (!it || !d) return;
    if (!this.valid(it, it.x, it.y)) {
      // 置けない場所: 元の場所にもどす(元の場所でも今の向きでは置けないなら、さいごに置けていた形にもどす)
      it.x = d.lastX;
      it.y = d.lastY;
      if (!this.valid(it, it.x, it.y) && this.good) Object.assign(it, this.good);
      this.layout(it);
      audio.se('back');
      this.toast('そこには置けません');
    }
    if (this.valid(it, it.x, it.y)) this.save(it);
    it.img.setTint(0xfff1a8);
  }

  /**
   * 「向き」: 横向き → 横向き(反転) → 縦向き → 縦向き(反転) の順に変える(企画者の指示 2026-10-22)。
   * 縦向き(頭が奥・足が手前)は、縦向きの絵がある家具だけ。
   * 企画者の指示(2026-10-22): その場所で置けなくても向きは変えられる(赤くなる。置ける所まで動かせば置ける)
   */
  private flip(): void {
    const it = this.selected;
    if (!it) return;
    const order: [boolean, boolean][] = [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ];
    const now = Math.max(0, order.findIndex(([t, f]) => t === it.turn && f === it.flip));
    for (let k = 1; k < order.length; k++) {
      const [turn, flip] = order[(now + k) % order.length];
      if (turn && !this.canTurnAt(it.item)) continue;
      it.turn = turn;
      it.flip = flip;
      if (isWalkable(it.item)) {
        // カーペットは、その向きで入るいちばん近い所に寄せる
        const near = this.nearestFullFit(it, it.x, it.y);
        if (near) [it.x, it.y] = near;
      }
      this.layout(it);
      audio.se('tap');
      if (this.valid(it, it.x, it.y)) {
        this.save(it);
        it.img.setTint(0xfff1a8);
      } else {
        it.img.setTint(0xff6a6a);
        this.toast('このままでは置けません。動かしてね');
      }
      return;
    }
  }

  /** 今の場所と向きを記録する(置けているときだけ呼ぶ) */
  private save(it: Placed): void {
    const [rx, ry] = this.toRoom(it.x, it.y);
    this.record.movePlaced(it.uid, rx, ry, it.flip, it.turn);
    if (sizeSteps(it.item)) this.record.resizePlaced(it.uid, it.size);
    if (it === this.selected) this.good = { x: it.x, y: it.y, turn: it.turn, flip: it.flip, size: it.size };
  }

  /** MONZが歩ける床の、いちばん広い所にその点が入っているか(家具のすきまに閉じこめられていないか) */
  inMainFloor(p: Pt): boolean {
    return mainRegion(this.walkFloor, this.blocked, 12).contains(p);
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
    this.buttons = [
      mk(W / 2 - 255, '向き', () => this.flip(), '#ffffff'),
      mk(W / 2 - 85, '大きさ', () => this.resize(), '#ffffff'),
      mk(W / 2 + 85, 'しまう', () => this.store(), '#ffffff'),
      mk(W / 2 + 255, 'おわる', () => this.endEdit(), '#ffd23a'),
    ];
    c.add([bg, title, ...this.buttons]);
    this.panel = c;
    this.refreshPanel();
  }

  private refreshPanel(): void {
    if (!this.buttons.length) return;
    const on = !!this.selected;
    this.buttons[0].setAlpha(on ? 1 : 0.4);
    // 大きさを変えられるのはカーペットとテーブル
    this.buttons[1].setVisible(on && !!sizeSteps(this.selected!.item));
    this.buttons[2].setAlpha(on ? 1 : 0.4);
  }

  /** カーペットの大きさ: 小 → 中 → 大 → 小(企画者の指示 2026-10-22)。置けない大きさは飛ばす */
  private resize(): void {
    const it = this.selected;
    if (!it) return;
    const steps = sizeSteps(it.item);
    if (!steps) return;
    if (!isWalkable(it.item)) {
      // テーブル: ふつう ⇔ 大きめ(企画者の指示 2026-10-22)。置けない大きさでも変えられる(赤くなる。向きと同じ)
      it.size = (it.size + 1) % steps.length;
      this.layout(it);
      audio.se('tap');
      if (this.valid(it, it.x, it.y)) {
        this.save(it);
        it.img.setTint(0xfff1a8);
        this.toast(`大きさ：${sizeLabel(it.item, it.size)}`);
      } else {
        it.img.setTint(0xff6a6a);
        this.toast('このままでは置けません。動かしてね');
      }
      return;
    }
    const was = it.size;
    for (let k = 1; k <= CARPET_SIZES.length; k++) {
      it.size = (was + k) % CARPET_SIZES.length;
      if (this.valid(it, it.x, it.y)) break;
    }
    // 大きくして入らないときは、入る所まで少し動かす(小さくはしない)
    const near = this.nearestFullFit(it, it.x, it.y);
    if (near) [it.x, it.y] = near;
    this.layout(it);
    this.record.resizePlaced(it.uid, it.size);
    const [rx, ry] = this.toRoom(it.x, it.y);
    this.record.movePlaced(it.uid, rx, ry, it.flip, it.turn);
    audio.se('tap');
    this.toast(`大きさ：${sizeLabel(it.item, it.size)}`);
  }

  private lastToast?: Phaser.GameObjects.Text;

  /** 短いお知らせ(前のお知らせは消して、重ならないようにする) */
  private toast(msg: string): void {
    const s = this.scene;
    this.lastToast?.destroy();
    const t = s.add
      .text(s.scale.width / 2, this.panelTop - 60, msg, { fontFamily: UI_FONT, fontSize: '30px', fontStyle: '900', color: '#ffffff', stroke: '#16101c', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(80);
    this.lastToast = t;
    s.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  }
}
