import * as Phaser from 'phaser';
import { BOSS_HP, RUSH_GOAL, type RushSquare, type RushState } from '../core/slot/crownRush';
import { UI_FONT } from '../ui/paint';

/**
 * CROWN RUSH の 液晶の 中の 表示(2026-11-19 企画者「スロットの 液晶内で 完結」「液晶の 外に はみ出さない」)。
 * 液晶の container(まん中が 0,0)に 入れる 物を 作る。動きは Phaser の tween(軽い もの だけ)。
 * 絵は 仮: マスは 色の 四角と スロットの 図柄・アライグマR は リーチの キャラの 絵・KING GORO は 仮の 絵(企画者の 絵が 届いたら 差しかえ)
 */
export interface RushKeys {
  coin?: string;
  chest?: string;
  diamond?: string;
  crown?: string;
  chara?: string;
  boss?: string;
  /** 企画者の ロゴ(2026-11-20) */
  logo?: string;
  /** ルーレットの 円盤(企画者の 絵。1 が 上・時計回りに 1〜6)。ボス用は HIT が 上・時計回りに HIT/MISS 交互 */
  wheel?: string;
  wheelBoss?: string;
  /** マスの 絵(2026-11-20 企画者)。ない マスは 色の 四角 */
  tiles?: Partial<Record<RushSquare, string>>;
  /** やられた 顔 */
  bossKo?: string;
}

const SQ_COLOR: Record<RushSquare, number> = {
  coin: 0xffb21a,
  chest: 0x9b5cff,
  extra: 0x2bd4ff,
  mystery: 0xff4ad8,
  diamond: 0x7de8ff,
  crown: 0xffd23a,
  trap: 0xff3b4f,
  boss: 0x5a0f1f,
};
const SQ_LABEL: Partial<Record<RushSquare, string>> = { extra: '+1', mystery: '?', trap: 'TRAP', boss: 'BOSS' };

type Obj = Phaser.GameObjects.GameObject;

export class RushView {
  private chara?: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  private info?: Phaser.GameObjects.Text;
  private cells: { x: number; y: number }[] = [];
  private s = 40;
  private bossImg?: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  private hpIcons: Phaser.GameObjects.GameObject[] = [];
  private roll?: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private box: { w: number; h: number },
    private keys: RushKeys,
    private add: (o: Obj) => void,
  ) {}

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 0): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${Math.round(size)}px`, fontStyle: '900', color, stroke: '#16101c', strokeThickness: stroke, align: 'center' }).setOrigin(0.5);
  }

  private img(key: string | undefined, x: number, y: number, size: number): Phaser.GameObjects.Image | null {
    if (!key || !this.scene.textures.exists(key)) return null;
    const im = this.scene.add.image(x, y, key);
    im.setScale(size / Math.max(im.width, im.height));
    return im;
  }

  // ---------------- すごろく ----------------

  /** 15マスの ジグザグ(3段 × 5マス。2026-11-20)。左上が 1マス目、右下が 15マス目 */
  board(st: RushState): Obj[] {
    const { w, h } = this.box;
    const out: Obj[] = [];
    const head = Math.max(30, h * 0.16);
    const dieW = Math.min(150, w * 0.22);
    // 盤の 場所(左)
    const bx0 = -w / 2 + 14;
    const bx1 = w / 2 - dieW - 18;
    const by0 = -h / 2 + head + 6;
    const by1 = h / 2 - 10;
    const cols = 5;
    const rows = 3;
    // スタートの ぶん 左を 少し あける
    const startW = Math.min(46, (bx1 - bx0) * 0.1);
    const cw = (bx1 - bx0 - startW) / cols;
    const rh = (by1 - by0) / rows;
    // 2026-11-20 企画者「どっちに 進むか 分かりづらい」→ マスを 少し 小さく して 間に 道と 矢印
    this.s = Math.min(cw * 0.74, rh * 0.8);
    this.cells = [];
    // 0 = スタート(1マス目の 左)
    this.cells.push({ x: bx0 + startW / 2, y: by0 + rh / 2 });
    for (let i = 0; i < RUSH_GOAL; i++) {
      const r = Math.floor(i / cols);
      const c0 = i % cols;
      const c = r % 2 === 0 ? c0 : cols - 1 - c0;
      this.cells.push({ x: bx0 + startW + cw * c + cw / 2, y: by0 + rh * r + rh / 2 });
    }
    // 道
    const g = this.scene.add.graphics();
    g.lineStyle(Math.max(8, this.s * 0.34), 0x16101c, 0.95);
    g.beginPath();
    g.moveTo(this.cells[0].x, this.cells[0].y);
    for (const p of this.cells.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
    g.lineStyle(Math.max(5, this.s * 0.22), 0xffd23a, 0.95);
    g.beginPath();
    g.moveTo(this.cells[0].x, this.cells[0].y);
    for (const p of this.cells.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
    out.push(g);
    const s = this.s;
    const sq = this.scene.add.graphics();
    out.push(sq);
    out.push(this.text(this.cells[0].x, this.cells[0].y, 'GO', s * 0.34, '#ffffff', 4));
    st.board.forEach((k, i) => {
      const p = this.cells[i + 1];
      const big = k === 'boss' ? 1.18 : 1;
      const tile = this.img(this.keys.tiles?.[k], p.x, p.y, s * big * 1.05);
      if (tile) {
        out.push(tile);
        if (k !== 'boss') out.push(this.text(p.x - s * 0.36, p.y - s * 0.38, String(i + 1), s * 0.26, '#ffffff', 4));
        return;
      }
      sq.fillStyle(0x16101c, 1).fillRoundedRect(p.x - (s * big) / 2 - 3, p.y - (s * big) / 2 - 3, s * big + 6, s * big + 6, s * 0.22);
      sq.fillStyle(SQ_COLOR[k], 1).fillRoundedRect(p.x - (s * big) / 2, p.y - (s * big) / 2, s * big, s * big, s * 0.2);
      const icon = k === 'coin' ? this.keys.coin : k === 'chest' ? this.keys.chest : k === 'diamond' ? this.keys.diamond : k === 'crown' ? this.keys.crown : k === 'boss' ? this.keys.boss : undefined;
      const im = this.img(icon, p.x, p.y, s * (k === 'boss' ? 1.05 : 0.8));
      if (im) out.push(im);
      const label = SQ_LABEL[k];
      if (label && !(k === 'boss' && im)) out.push(this.text(p.x, p.y, label, s * (label.length > 2 ? 0.26 : 0.46), k === 'trap' || k === 'boss' ? '#ffffff' : '#16101c', k === 'trap' || k === 'boss' ? 3 : 0));
      // マスの 番号(小さく)
      out.push(this.text(p.x - s * 0.32, p.y - s * 0.34, String(i + 1), s * 0.2, '#ffffff', 3));
    });
    // マスと マスの 間に 進む 向きの 矢印(マスより 前)
    const ar = this.scene.add.graphics();
    for (let i = 0; i < this.cells.length - 1; i++) {
      const p0 = this.cells[i];
      const p1 = this.cells[i + 1];
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const L = Math.max(9, s * 0.2);
      const pt = (dx: number, dy: number) => ({ x: mx + Math.cos(ang) * dx - Math.sin(ang) * dy, y: my + Math.sin(ang) * dx + Math.cos(ang) * dy });
      const a1 = pt(L, 0);
      const a2 = pt(-L * 0.7, -L * 0.85);
      const a3 = pt(-L * 0.7, L * 0.85);
      ar.fillStyle(0x16101c, 1).fillTriangle(pt(L + 4, 0).x, pt(L + 4, 0).y, pt(-L * 0.7 - 3, -L * 0.85 - 4).x, pt(-L * 0.7 - 3, -L * 0.85 - 4).y, pt(-L * 0.7 - 3, L * 0.85 + 4).x, pt(-L * 0.7 - 3, L * 0.85 + 4).y);
      ar.fillStyle(0xff4ad8, 1).fillTriangle(a1.x, a1.y, a2.x, a2.y, a3.x, a3.y);
    }
    out.push(ar);
    this.scene.tweens.add({ targets: ar, alpha: { from: 1, to: 0.55 }, duration: 600, yoyo: true, repeat: -1 });
    // 上: ロゴ・のこり 回数・獲得コイン
    let logo: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.keys.logo && this.scene.textures.exists(this.keys.logo)) {
      logo = this.scene.add.image(-w / 2 + 10, -h / 2 + head / 2 + 2, this.keys.logo).setOrigin(0, 0.5);
      logo.setScale((head * 1.5) / logo.height);
    } else {
      logo = this.text(-w / 2 + 16, -h / 2 + head / 2 + 2, 'CROWN RUSH', Math.min(34, head * 0.62), '#ffd23a', 6).setOrigin(0, 0.5);
      logo.setShadow(0, 3, '#ff4ad8', 0, true, true);
    }
    this.info = this.text(w / 2 - 14, -h / 2 + head / 2 + 2, '', Math.min(22, head * 0.42), '#ffffff', 4).setOrigin(1, 0.5);
    out.push(logo, this.info);
    // 右: ルーレット(1〜6 の 円盤。2026-11-20 企画者)
    const dx = w / 2 - dieW / 2 - 10;
    const dy = by0 + (by1 - by0) / 2 + 6;
    const wr = Math.min(dieW / 2, (by1 - by0) / 2 - 6);
    out.push(...this.makeWheel(dx, dy, wr, ['1', '2', '3', '4', '5', '6'], [0x9b5cff, 0xff4ad8, 0xffb21a, 0x2bd4ff, 0x7a2ad0, 0xff3b4f], this.keys.wheel));
    this.modText = this.text(dx, dy + wr + 2, '', Math.min(20, wr * 0.3), '#7de8ff', 5).setOrigin(0.5, 0);
    out.push(this.modText);
    // アライグマR
    const cp = this.cells[st.pos];
    const ch = this.img(this.keys.chara, cp.x, cp.y - s * 0.2, s * 1.15);
    this.chara = ch ?? this.text(cp.x, cp.y - s * 0.3, '🦝', s * 0.8);
    out.push(this.chara);
    this.scene.tweens.add({ targets: this.chara, scaleY: this.chara.scaleY * 1.05, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.setInfo(st);
    return out;
  }

  setInfo(st: RushState): void {
    this.info?.setText(`のこり ${st.spins}回　+${st.total.toLocaleString()}`);
    const m = st.mod ?? 0;
    this.modText?.setText(m > 0 ? '次の 目 +1' : m < 0 ? '次の 目 −1' : '');
  }

  private wheel?: Phaser.GameObjects.Container;
  private modText?: Phaser.GameObjects.Text;

  /** 円盤(6つに 分けた・上に 矢印)。art が ある 時は 企画者の 絵 */
  private makeWheel(x: number, y: number, r: number, labels: string[], colors: number[], art?: string): Obj[] {
    const c = this.scene.add.container(x, y);
    const n = labels.length;
    const step = (Math.PI * 2) / n;
    const im = this.img(art, 0, 0, r * 2);
    if (im) c.add(im);
    else {
      const g = this.scene.add.graphics();
      g.fillStyle(0x16101c, 1).fillCircle(0, 0, r + 4);
      labels.forEach((_, k) => {
        const a0 = -Math.PI / 2 + (k - 0.5) * step;
        g.fillStyle(colors[k % colors.length], 1).slice(0, 0, r, a0, a0 + step, false).fillPath();
        g.lineStyle(2, 0x16101c, 1).slice(0, 0, r, a0, a0 + step, false).strokePath();
      });
      g.fillStyle(0xffd23a, 1).fillCircle(0, 0, r * 0.16);
      g.lineStyle(3, 0x16101c, 1).strokeCircle(0, 0, r * 0.16);
      c.add(g);
      labels.forEach((t, k) => {
        const a = -Math.PI / 2 + k * step;
        const long = t.length > 2;
        const tx = this.text(Math.cos(a) * r * (long ? 0.6 : 0.64), Math.sin(a) * r * (long ? 0.6 : 0.64), t, r * (long ? 0.2 : 0.36), '#ffffff', long ? 4 : 5);
        tx.setRotation(a + Math.PI / 2);
        c.add(tx);
      });
    }
    this.wheel = c;
    // 上の 矢印(止まった 所)
    const p = this.scene.add.graphics();
    p.fillStyle(0x16101c, 1).fillTriangle(x - r * 0.24, y - r - 10, x + r * 0.24, y - r - 10, x, y - r + r * 0.26);
    p.fillStyle(0xffd23a, 1).fillTriangle(x - r * 0.16, y - r - 6, x + r * 0.16, y - r - 6, x, y - r + r * 0.16);
    return [c, p];
  }

  /** 円盤を 回して k 番目(0〜5)を 上で 止める */
  private spinWheel(k: number, n: number, done: () => void): void {
    const c = this.wheel;
    if (!c) return done();
    const stepDeg = 360 / n;
    const now = c.angle;
    const jitter = (Math.random() - 0.5) * stepDeg * 0.5;
    let target = -k * stepDeg + jitter;
    while (target > now - 360 * 4) target -= 360;
    this.scene.tweens.addCounter({
      from: now,
      to: target,
      duration: 1500,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => c.setAngle(tw.getValue() ?? 0),
      onComplete: () => this.scene.time.delayedCall(250, done),
    });
  }

  /** ルーレットが 回って 止まる(n = 先に 決めた 目・mod = ミステリーの +1/−1) */
  rollDie(n: number, mod: number, done: () => void): void {
    this.spinWheel(n - 1, 6, () => {
      if (!mod) return done();
      const m = this.modText;
      m?.setText(`${n} ${mod > 0 ? '+' : '−'} 1 = ${Math.max(0, n + mod)}`).setColor('#ffd23a');
      if (m) this.scene.tweens.add({ targets: m, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      this.scene.time.delayedCall(700, () => {
        m?.setColor('#7de8ff');
        done();
      });
    });
  }

  /** 1マスずつ 進む(とちゅうの マスの 効果は なし) */
  walk(from: number, to: number, done: () => void): void {
    const c = this.chara;
    if (!c) return done();
    const dir = to >= from ? 1 : -1;
    let i = from;
    const next = () => {
      if (i === to) return done();
      i += dir;
      const p = this.cells[i];
      this.scene.tweens.add({ targets: c, x: p.x, y: p.y - this.s * 0.2, duration: dir > 0 ? 170 : 230, ease: 'Quad.easeOut', onComplete: next });
      this.scene.tweens.add({ targets: c, angle: { from: -8, to: 8 }, duration: 85, yoyo: true });
    };
    next();
  }

  /** マスの 上に 文字(+50・+1回 など) */
  pop(pos: number, msg: string, color: string): void {
    const p = this.cells[pos];
    const t = this.text(p.x, p.y - this.s * 0.6, msg, Math.max(20, this.s * 0.5), color, 6);
    this.add(t);
    t.setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: t.y - this.s * 0.6, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  /** 液晶の まん中に 大きな 文字 */
  banner(msg: string, color: string, size: number, ms = 1200, x = 0, y = 0): Phaser.GameObjects.Text {
    const t = this.text(x, y, msg, size, color, 10);
    t.setShadow(0, 5, '#ff4ad8', 0, true, true);
    this.add(t);
    t.setScale(2.2);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    if (ms > 0) this.scene.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 300, onComplete: () => t.destroy() });
    return t;
  }

  /** 下に 小さな 帯(ボスの 報酬) */
  pop2(msg: string): void {
    // やられた 顔(左)が 見える ように 右に
    const t = this.text(this.box.w * 0.22, this.box.h * 0.2, msg, Math.min(34, this.box.h * 0.11), '#ffffff', 8);
    this.add(t);
    t.setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  // ---------------- ボス戦 ----------------

  boss(st: RushState): Obj[] {
    const { w, h } = this.box;
    const out: Obj[] = [];
    const bo = st.boss!;
    // 左: KING GORO(仮の 絵)
    const bx = -w * 0.2;
    const size = Math.min(h * 0.7, w * 0.42);
    const im = this.img(this.keys.boss, bx, h * 0.02, size * 1.15);
    if (im) this.bossImg = im;
    else {
      // 仮: 黒い ゴリラの 顔(丸) + 王冠
      const c = this.scene.add.container(bx, h * 0.06);
      const g = this.scene.add.graphics();
      const r = size * 0.36;
      g.fillStyle(0x16101c, 1).fillCircle(0, 0, r + 6);
      g.fillStyle(0x3a2a3a, 1).fillCircle(0, 0, r);
      g.fillStyle(0x8a6a6a, 1).fillEllipse(0, r * 0.25, r * 1.1, r * 0.8);
      g.fillStyle(0xffffff, 1).fillCircle(-r * 0.32, -r * 0.18, r * 0.14).fillCircle(r * 0.32, -r * 0.18, r * 0.14);
      g.fillStyle(0xff3b4f, 1).fillCircle(-r * 0.32, -r * 0.18, r * 0.07).fillCircle(r * 0.32, -r * 0.18, r * 0.07);
      g.fillStyle(0x16101c, 1).fillRect(-r * 0.3, r * 0.38, r * 0.6, r * 0.1);
      c.add(g);
      const crown = this.img(this.keys.crown, 0, -r * 1.05, r * 1.1);
      if (crown) c.add(crown);
      this.bossImg = c;
    }
    out.push(this.bossImg);
    const name = this.text(bx, h / 2 - 22, 'KING GORO', Math.min(28, h * 0.09), '#ff4f5e', 6);
    out.push(name);
    // 右: HP(王冠 3個)・のこり・HIT/MISS
    const rx = w * 0.24;
    out.push(this.text(rx, -h * 0.42, 'BOSS BATTLE', Math.min(28, h * 0.085), '#ffd23a', 6));
    this.hpIcons = [];
    for (let i = 0; i < BOSS_HP; i++) {
      const x = rx + (i - 1) * Math.min(56, w * 0.08);
      const ic = this.img(this.keys.crown, x, -h * 0.28, Math.min(48, h * 0.13)) ?? this.text(x, -h * 0.28, '♛', Math.min(40, h * 0.12), '#ffd23a', 4);
      if (i >= bo.hp) ic.setAlpha(0.2);
      this.hpIcons.push(ic);
      out.push(ic);
    }
    // HIT / MISS の 円盤(当たり 3・ハズレ 3 が 交互。2026-11-20 企画者)
    // 2026-11-20 企画者「ボスの 時の ルーレット もう少し 大きく」
    const wr = Math.min(h * 0.28, w * 0.17);
    const wy = h * 0.11;
    out.push(...this.makeWheel(rx, wy, wr, ['HIT', 'MISS', 'HIT', 'MISS', 'HIT', 'MISS'], [0xffd23a, 0x3a2a4a], this.keys.wheelBoss));
    // 結果は 円盤の 上に 大きく
    this.roll = this.text(rx, wy, '', Math.min(44, h * 0.14), '#ffffff', 8);
    out.push(this.roll);
    this.info = this.text(rx, h * 0.455, '', Math.min(18, h * 0.055), '#ffffff', 4);
    out.push(this.info);
    this.setBossInfo(st);
    return out;
  }

  setBossInfo(st: RushState): void {
    const bo = st.boss;
    if (bo) this.info?.setText(`のこり ${bo.left}回　+${st.total.toLocaleString()}`);
  }

  /** HIT / MISS の ルーレット(hit = 先に 決めた 結果) */
  rollHit(hit: boolean, done: () => void): void {
    const t = this.roll;
    // HIT は 0・2・4、MISS は 1・3・5 の どれか
    const k = (hit ? 0 : 1) + 2 * Math.floor(Math.random() * 3);
    t?.setText('');
    this.spinWheel(k, 6, () => {
      t?.setText(hit ? 'HIT!' : 'MISS').setColor(hit ? '#ffd23a' : '#9a8aaa');
      if (t) this.scene.tweens.add({ targets: t, scale: { from: 1.7, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      this.scene.time.delayedCall(300, done);
    });
  }

  /** HIT: ボスが ゆれて HP が へる */
  /** 撃破: やられた 顔に かえる */
  ko(): void {
    const b = this.bossImg;
    if (!(b instanceof Phaser.GameObjects.Image) || !this.keys.bossKo || !this.scene.textures.exists(this.keys.bossKo)) return;
    const size = Math.max(b.displayWidth, b.displayHeight);
    b.setTexture(this.keys.bossKo);
    b.setScale(size / Math.max(b.width, b.height));
    this.scene.tweens.add({ targets: b, angle: { from: -10, to: 10 }, duration: 160, yoyo: true, repeat: 3 });
  }

  hit(st: RushState): void {
    const b = this.bossImg;
    if (b) this.scene.tweens.add({ targets: b, x: { from: b.x - 14, to: b.x }, duration: 60, repeat: 4, yoyo: true });
    const hp = st.boss?.hp ?? 0;
    const ic = this.hpIcons[hp];
    if (ic) this.scene.tweens.add({ targets: ic, alpha: 0.2, scale: (ic as Phaser.GameObjects.Image).scale * 1.4, duration: 260, yoyo: false });
    this.setBossInfo(st);
  }
}
