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
  private die?: Phaser.GameObjects.Text;
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

  /** 20マスの ジグザグ(4段 × 5マス)。左上が 1マス目、右下 or 左下が 20マス目 */
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
    const rows = 4;
    // スタートの ぶん 左を 少し あける
    const startW = Math.min(46, (bx1 - bx0) * 0.1);
    const cw = (bx1 - bx0 - startW) / cols;
    const rh = (by1 - by0) / rows;
    this.s = Math.min(cw, rh) * 0.78;
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
    g.lineStyle(Math.max(4, this.s * 0.14), 0x16101c, 0.9);
    g.beginPath();
    g.moveTo(this.cells[0].x, this.cells[0].y);
    for (const p of this.cells.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
    g.lineStyle(Math.max(2, this.s * 0.06), 0xffd23a, 0.7);
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
    // 上: ロゴ・のこり 回数・獲得コイン
    const logo = this.text(-w / 2 + 16, -h / 2 + head / 2 + 2, 'CROWN RUSH', Math.min(34, head * 0.62), '#ffd23a', 6).setOrigin(0, 0.5);
    logo.setShadow(0, 3, '#ff4ad8', 0, true, true);
    this.info = this.text(w / 2 - 14, -h / 2 + head / 2 + 2, '', Math.min(22, head * 0.42), '#ffffff', 4).setOrigin(1, 0.5);
    out.push(logo, this.info);
    // 右: ルーレット(1〜6)
    const dx = w / 2 - dieW / 2 - 10;
    const dy = by0 + (by1 - by0) / 2;
    const dg = this.scene.add.graphics();
    const dh = Math.min(by1 - by0, dieW * 1.15);
    dg.fillStyle(0x16101c, 1).fillRoundedRect(dx - dieW / 2, dy - dh / 2, dieW, dh, 18);
    dg.lineStyle(5, 0xffd23a, 1).strokeRoundedRect(dx - dieW / 2 + 4, dy - dh / 2 + 4, dieW - 8, dh - 8, 14);
    out.push(dg);
    out.push(this.text(dx, dy - dh / 2 + 20, 'ROULETTE', Math.min(18, dieW * 0.13), '#ff8ae0', 3));
    this.die = this.text(dx, dy + 8, '?', Math.min(dh * 0.55, dieW * 0.62), '#ffffff', 8);
    out.push(this.die);
    // アライグマR
    const cp = this.cells[st.pos];
    const ch = this.img(this.keys.chara, cp.x, cp.y - s * 0.35, s * 1.6);
    this.chara = ch ?? this.text(cp.x, cp.y - s * 0.3, '🦝', s * 0.8);
    out.push(this.chara);
    this.scene.tweens.add({ targets: this.chara, scaleY: this.chara.scaleY * 1.05, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.setInfo(st);
    return out;
  }

  setInfo(st: RushState): void {
    this.info?.setText(`のこり ${st.spins}回　+${st.total.toLocaleString()}`);
  }

  /** ルーレットが 回って 止まる(n = 先に 決めた 目) */
  rollDie(n: number, done: () => void): void {
    const t = this.die;
    if (!t) return done();
    let k = 0;
    const steps = 14;
    const tick = () => {
      k++;
      if (k >= steps) {
        t.setText(String(n)).setColor('#ffd23a');
        this.scene.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        this.scene.time.delayedCall(380, done);
        return;
      }
      t.setText(String(1 + ((k * 5 + n) % 6))).setColor('#ffffff');
      this.scene.time.delayedCall(40 + k * 9, tick);
    };
    tick();
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
      this.scene.tweens.add({ targets: c, x: p.x, y: p.y - this.s * 0.35, duration: dir > 0 ? 170 : 230, ease: 'Quad.easeOut', onComplete: next });
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
  banner(msg: string, color: string, size: number, ms = 1200): Phaser.GameObjects.Text {
    const t = this.text(0, 0, msg, size, color, 10);
    t.setShadow(0, 5, '#ff4ad8', 0, true, true);
    this.add(t);
    t.setScale(2.2);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    if (ms > 0) this.scene.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 300, onComplete: () => t.destroy() });
    return t;
  }

  /** 下に 小さな 帯(ボスの 報酬) */
  pop2(msg: string): void {
    const t = this.text(0, this.box.h * 0.3, msg, Math.min(40, this.box.h * 0.12), '#ffffff', 8);
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
    const im = this.img(this.keys.boss, bx, h * 0.04, size);
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
    out.push(this.text(rx, -h * 0.4, 'BOSS BATTLE', Math.min(30, h * 0.09), '#ffd23a', 6));
    this.hpIcons = [];
    for (let i = 0; i < BOSS_HP; i++) {
      const x = rx + (i - 1) * Math.min(70, w * 0.1);
      const ic = this.img(this.keys.crown, x, -h * 0.2, Math.min(60, h * 0.18)) ?? this.text(x, -h * 0.2, '♛', Math.min(50, h * 0.16), '#ffd23a', 4);
      if (i >= bo.hp) ic.setAlpha(0.2);
      this.hpIcons.push(ic);
      out.push(ic);
    }
    const rg = this.scene.add.graphics();
    const rw = Math.min(260, w * 0.38);
    const rhh = Math.min(90, h * 0.26);
    rg.fillStyle(0x16101c, 1).fillRoundedRect(rx - rw / 2, h * 0.02, rw, rhh, 16);
    rg.lineStyle(5, 0xff4ad8, 1).strokeRoundedRect(rx - rw / 2 + 4, h * 0.02 + 4, rw - 8, rhh - 8, 12);
    out.push(rg);
    this.roll = this.text(rx, h * 0.02 + rhh / 2, 'SPIN!', Math.min(48, rhh * 0.6), '#ffffff', 6);
    out.push(this.roll);
    this.info = this.text(rx, h * 0.4, '', Math.min(22, h * 0.07), '#ffffff', 4);
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
    if (!t) return done();
    let k = 0;
    const steps = 12;
    const tick = () => {
      k++;
      if (k >= steps) {
        t.setText(hit ? 'HIT!' : 'MISS').setColor(hit ? '#ffd23a' : '#9a8aaa');
        this.scene.tweens.add({ targets: t, scale: { from: 1.7, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        this.scene.time.delayedCall(300, done);
        return;
      }
      const on = (k + (hit ? 0 : 1)) % 2 === 0;
      t.setText(on ? 'HIT' : 'MISS').setColor(on ? '#ffffff' : '#c8b8d8');
      this.scene.time.delayedCall(50 + k * 12, tick);
    };
    tick();
  }

  /** HIT: ボスが ゆれて HP が へる */
  hit(st: RushState): void {
    const b = this.bossImg;
    if (b) this.scene.tweens.add({ targets: b, x: { from: b.x - 14, to: b.x }, duration: 60, repeat: 4, yoyo: true });
    const hp = st.boss?.hp ?? 0;
    const ic = this.hpIcons[hp];
    if (ic) this.scene.tweens.add({ targets: ic, alpha: 0.2, scale: (ic as Phaser.GameObjects.Image).scale * 1.4, duration: 260, yoyo: false });
    this.setBossInfo(st);
  }
}
