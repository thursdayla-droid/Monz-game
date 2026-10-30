import type * as Phaser from 'phaser';
import { abilityOf } from '../core/mythclash/abilities';
import { cardNo, type CardDefinition, type Element, type Rarity } from '../core/mythclash/cards';
import { assetUrl } from '../assetUrl';
import { roundRectPath, UI_FONT } from './paint';

/** MYTHCLASH のカードの大きさ(絵の座標。表示するときに縮める) */
export const MYTH_CARD_W = 300;
export const MYTH_CARD_H = 420;

export const RARITY_COLORS: Record<Rarity, { frame: string; light: string }> = {
  N: { frame: '#8a8f98', light: '#d7dbe2' },
  R: { frame: '#2f7fe0', light: '#9cc8ff' },
  SR: { frame: '#9b3ee0', light: '#d9a8ff' },
  UR: { frame: '#e0a82e', light: '#fff0a8' },
  SEC: { frame: '#c0182a', light: '#ffd23a' },
  LR: { frame: '#ff4a1a', light: '#ffe08a' },
};

export const ELEMENT_COLORS: Record<Element, string> = {
  炎: '#ff5a2a',
  水: '#2a9dff',
  雷: '#ffd23a',
  自然: '#3ec46a',
  光: '#fff2a8',
  闇: '#8a4ad8',
  無: '#b0b0b8',
};

/**
 * カードのおもて。【仮】100枚の絵が届くまでは、絵の所に属性の色と文字を出す。
 * 数字・名前・属性・魔法・特性はカード表のとおり(企画者決定 2026-10-26)
 * hideMagicElement: 対戦相手のカードで、まだ魔法を使っていないとき(魔法属性は使うまで見せない。確定ルール)。
 *   魔法の名前から属性がわかってしまうことがあるので、名前も「？？？」にする【仮】
 */
/**
 * 企画者のカードの絵(カード全体。企画者決定 2026-10-27: 文字まで入った絵をそのまま使う)。絵があるカードの番号。
 * 絵は design/mythclash/make_cards.py で作る(public/assets/mythclash/cards/NNN.webp・600×833)。届いたら番号を足す
 */
export const CARD_ART_IDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 101];
export const cardArtKey = (id: number) => `myth:cardart:${id}`;
export const cardArtFile = (id: number) => `assets/mythclash/cards/${String(id).padStart(3, '0')}.webp`;
const cardArt = new Map<number, CanvasImageSource>();

/**
 * 読みこんだカードの絵を drawMythCard で使えるようにする(カードを描く画面の create の最初で呼ぶ)。
 * 絵より先にプログラムの絵でカードを作ってしまっていたら、それを消して作り直させる
 */
export function useCardArt(scene: Phaser.Scene): void {
  for (const id of CARD_ART_IDS) {
    if (cardArt.has(id) || !scene.textures.exists(cardArtKey(id))) continue;
    cardArt.set(id, scene.textures.get(cardArtKey(id)).getSourceImage() as HTMLImageElement);
    removeDrawnCards(scene, id);
  }
}

/** その絵で描いたカード(バトルでかくした形も) */
function removeDrawnCards(scene: Phaser.Scene, id: number): void {
  for (const k of [`mc:card:${id}`, `mc:card:${id}:h`, `mc:card:${id}:a`, `mc:card:${id}:h:a`]) if (scene.textures.exists(k)) scene.textures.remove(k);
}

/**
 * カードの絵は、その画面で使う分だけ読む(企画者 2026-10-28: カードが100枚になっても iPhone で落ちないように)。
 * 読んだ絵は最近使った KEEP_ART 枚までは残す(バインダー2ページ分より多く)。それより古くて今使わない絵と、その絵で描いたカードはメモリから外す
 */
const KEEP_ART = 24;
const recentArt: number[] = [];

function forgetOldArt(scene: Phaser.Scene, want: Set<number>): void {
  for (const id of want) {
    const i = recentArt.indexOf(id);
    if (i >= 0) recentArt.splice(i, 1);
    recentArt.push(id);
  }
  while (recentArt.length > KEEP_ART) {
    const i = recentArt.findIndex((id) => !want.has(id));
    if (i < 0) break;
    const [id] = recentArt.splice(i, 1);
    cardArt.delete(id);
    if (scene.textures.exists(cardArtKey(id))) scene.textures.remove(cardArtKey(id));
    removeDrawnCards(scene, id);
  }
}

/** ids のカードの絵を読みこみの予定に入れる(scene の preload から呼ぶ。create で useCardArt)。入れた数を返す */
export function queueCardArt(scene: Phaser.Scene, ids: Iterable<number>): number {
  // ゲームの確認用ページにはカードの絵を入れていないので、読みにいかない(プログラムの絵のカードになる)
  const want = new Set(window.__MONZ_NO_CARD_ART ? [] : [...ids].filter((id) => CARD_ART_IDS.includes(id)));
  forgetOldArt(scene, want);
  let queued = 0;
  for (const id of want) {
    if (scene.textures.exists(cardArtKey(id))) continue;
    scene.load.image(cardArtKey(id), assetUrl(cardArtFile(id)));
    queued++;
  }
  return queued;
}

/** 画面を開いたあとで ids のカードの絵を読む(バインダー・デッキ編成のページをめくったとき)。そろったら done(読みおわる前に画面を出たら呼ばない) */
export function needCardArt(scene: Phaser.Scene, ids: Iterable<number>, done: () => void): void {
  const list = [...ids];
  if (window.__MONZ_NO_CARD_ART || list.every((id) => !CARD_ART_IDS.includes(id) || scene.textures.exists(cardArtKey(id)))) {
    queueCardArt(scene, list);
    useCardArt(scene);
    done();
    return;
  }
  // 次のフレームで読む(画面を開いた直後の create の中だと、Phaser が読みこみの予定を消してしまうため)
  scene.time.delayedCall(0, () => {
    queueCardArt(scene, list);
    scene.load.once('complete', () => {
      if (!scene.sys.isActive()) return;
      useCardArt(scene);
      done();
    });
    scene.load.start();
  });
}

/** 大きく見るときの絵(企画者の絵があれば、くっきりした大きい絵) */
export function cardZoomTexture(scene: Phaser.Scene, key: string): string {
  const m = /^mc:card:(\d+)$/.exec(key);
  return m && scene.textures.exists(cardArtKey(Number(m[1]))) ? cardArtKey(Number(m[1])) : key;
}

/** 企画者の絵のカード(相手がまだ魔法を使っていないときは、絵の魔法の名前・属性・説明を「？？？」でおおう) */
/**
 * 魔法・特性の欄の場所(1064×1478 の絵の座標 x0, y0, x1, y1)。相手のカードでかくすときに使う。
 * ふつうのカードは同じ並び。並びのちがうカード(No.101 Mr.CLASH)だけ書く
 */
const ART_ROWS: Record<number, { magic: [number, number, number, number]; ability: [number, number, number, number] }> = {
  101: { magic: [72, 1056, 996, 1194], ability: [72, 1198, 996, 1334] },
};
const DEFAULT_ROWS = { magic: [52, 1132, 1012, 1284], ability: [52, 1290, 1012, 1384] } as const;

/** 絵の座標の四角をおおって「？？？」 */
function coverRow(ctx: CanvasRenderingContext2D, [ax0, ay0, ax1, ay1]: readonly [number, number, number, number]): void {
  const w = MYTH_CARD_W;
  const h = MYTH_CARD_H;
  const x0 = (ax0 / 1064) * w;
  const y0 = (ay0 / 1478) * h;
  const bw = ((ax1 - ax0) / 1064) * w;
  const bh = ((ay1 - ay0) / 1478) * h;
  roundRectPath(ctx, x0, y0, bw, bh, 5);
  ctx.fillStyle = '#140c14';
  ctx.fill();
  ctx.strokeStyle = '#5a4a60';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `900 18px ${UI_FONT}`;
  ctx.fillStyle = '#b8a8c8';
  ctx.fillText('？？？', x0 + bw / 2, y0 + bh / 2 + 1);
}

function drawArtCard(ctx: CanvasRenderingContext2D, id: number, art: CanvasImageSource, hideMagicElement: boolean, hideAbility = false): void {
  const w = MYTH_CARD_W;
  const h = MYTH_CARD_H;
  ctx.save();
  roundRectPath(ctx, 0, 0, w, h, 14);
  ctx.clip();
  ctx.drawImage(art, 0, 0, w, h);
  ctx.restore();
  const rows = ART_ROWS[id] ?? DEFAULT_ROWS;
  // 魔法の名前・属性・説明は使うまで、特性は発動するまで「？？？」でおおう(企画者 2026-10-27・10-28)。「魔法」「特性」の文字ごと
  if (hideMagicElement) coverRow(ctx, rows.magic);
  if (hideAbility) coverRow(ctx, rows.ability);
}

export function drawMythCard(ctx: CanvasRenderingContext2D, c: CardDefinition, opts: { hideMagicElement?: boolean; hideAbility?: boolean } = {}): void {
  const picture = cardArt.get(c.id);
  if (picture) {
    drawArtCard(ctx, c.id, picture, !!opts.hideMagicElement, !!opts.hideAbility);
    return;
  }
  const w = MYTH_CARD_W;
  const h = MYTH_CARD_H;
  const rc = RARITY_COLORS[c.rarity];
  const el = ELEMENT_COLORS[c.element];
  // わく
  roundRectPath(ctx, 0, 0, w, h, 20);
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (c.rarity === 'SEC') {
    ['#ff3a4a', '#ffd23a', '#3ee8ff', '#b84aff', '#ff3a4a'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  } else {
    g.addColorStop(0, rc.light);
    g.addColorStop(0.5, rc.frame);
    g.addColorStop(1, rc.light);
  }
  ctx.fillStyle = g;
  ctx.fill();
  roundRectPath(ctx, 10, 10, w - 20, h - 20, 14);
  ctx.fillStyle = '#16101c';
  ctx.fill();
  // 上: 番号・レア
  ctx.textBaseline = 'middle';
  ctx.font = `900 18px ${UI_FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(cardNo(c.id), 22, 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = c.rarity === 'SEC' ? '#ffd23a' : rc.light;
  ctx.font = `900 22px "Arial Black", Impact, sans-serif`;
  ctx.fillText(c.rarity, w - 22, 30);
  // 絵の所【仮】
  const art = { x: 20, y: 48, w: w - 40, h: 178 };
  roundRectPath(ctx, art.x, art.y, art.w, art.h, 10);
  const ag = ctx.createRadialGradient(w / 2, art.y + art.h / 2, 10, w / 2, art.y + art.h / 2, art.w * 0.7);
  ag.addColorStop(0, el);
  ag.addColorStop(1, '#16101c');
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `900 ${c.element.length > 1 ? 62 : 84}px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(c.element, w / 2, art.y + art.h / 2 + 4);
  ctx.font = `800 14px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(c.theme, w / 2, art.y + art.h - 14);
  // 名前
  ctx.fillStyle = '#ffffff';
  let size = 26;
  ctx.font = `900 ${size}px ${UI_FONT}`;
  while (ctx.measureText(c.name).width > w - 40 && size > 14) ctx.font = `900 ${--size}px ${UI_FONT}`;
  ctx.fillText(c.name, w / 2, 250);
  // 数字
  const stats: [string, number][] = [['HP', c.maxHp], ['攻', c.atk], ['防', c.def], ['魔', c.mag], ['速', c.spd]];
  const sw = (w - 40) / stats.length;
  stats.forEach(([k, v], i) => {
    const x = 20 + sw * i + sw / 2;
    ctx.font = `800 14px ${UI_FONT}`;
    ctx.fillStyle = '#b8a8c8';
    ctx.fillText(k, x, 282);
    ctx.font = `900 ${k === 'HP' ? 22 : 24}px "Arial Black", Impact, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(v), x, 306);
  });
  // 魔法・特性
  const line = (y: number, label: string, text: string, color: string) => {
    ctx.textAlign = 'left';
    ctx.font = `900 14px ${UI_FONT}`;
    ctx.fillStyle = color;
    ctx.fillText(label, 24, y);
    let s = 17;
    ctx.font = `800 ${s}px ${UI_FONT}`;
    while (ctx.measureText(text).width > w - 100 && s > 11) ctx.font = `800 ${--s}px ${UI_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 72, y);
  };
  if (opts.hideMagicElement) line(342, '魔法', '？？？', '#b8a8c8');
  else line(342, '魔法', `${c.magic.name}（${c.magic.element}）`, ELEMENT_COLORS[c.magic.element]);
  const ab = abilityOf(c.abilityCode);
  if (opts.hideAbility) line(372, '特性', '？？？', '#b8a8c8');
  else line(372, '特性', ab?.name ?? '—', '#ffd23a');
  ctx.textAlign = 'center';
}
