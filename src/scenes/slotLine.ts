import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import type { SeName } from '../audio/sfx';
import { UI_FONT } from '../ui/paint';
import { tierText, type LcdBox } from './slotFx';

/**
 * ROYAL JACKPOT「グループLINEリーチ」(2026-11-13 企画者の 指示書)。
 * 友だちの グループLINEで 飲み会の 参加者を 募集 → 3人 参加で 大当たり。
 * - 当たり・ハズレは 先に 決まっている(planShow)。この 画面は 見せ方だけ(結果を 変えない)
 * - 会話は buildLineScript で 毎回 作る(だれが 何番目に 返すかは 毎回 ちがう。2026-11-14 企画者「返信する 順番は 任せます」)。
 *   断る 理由は LINE_REFUSE(企画者が 作る。届くまで【仮】)
 * - 見た目は【仮】(LINE 風の 画面を 図形で 描く)。アイコン・音は LINE_ICON・LINE_SE で 差しかえ られる
 * 2026-11-14 企画者「パンダYで いいけど、ヒヨコGに して」
 */

/** 1件の メッセージ */
export interface LineMsg {
  /** 'me' = プレイヤー(緑の 吹き出し・右)。ほかは キャラの id(LINE_ICON) */
  from: 'me' | LineChara;
  text: string;
  /** 「入力中…」を 見せる 長さ(ms。me は 0) */
  typingMs: number;
  /** この メッセージの あと 次まで 待つ(ms) */
  waitMs: number;
  /** 参加(「ノ」) */
  join?: boolean;
}

export type LineChara = 'usagik' | 'kangarooh' | 'kyonk' | 'panday' | 'hiyokoj';

/** キャラの 名前と アイコン(slot:chara:<id> の 絵。差しかえる 時は ここ) */
export const LINE_ICON: Record<LineChara, { name: string; key: string }> = {
  usagik: { name: 'うさぎK', key: 'slot:chara:usagik' },
  kangarooh: { name: 'カンガルーH', key: 'slot:chara:kangarooh' },
  kyonk: { name: 'キョンK', key: 'slot:chara:kyonk' },
  panday: { name: 'パンダY', key: 'slot:chara:panday' },
  hiyokoj: { name: 'ヒヨコG', key: 'slot:chara:hiyokoj' },
};

/** 効果音(【仮】ゲームの 合成音。差しかえる 時は ここ) */
export const LINE_SE: { notify: SeName; send: SeName; join: SeName; down: SeName; climax: SeName } = {
  notify: 'plop',
  send: 'tap',
  join: 'mcSelect',
  down: 'back',
  climax: 'koBlast',
};

/** 液晶の 下はしから 王冠ランプの 上まで(吹き出しを ここより 下に 置かない) */
export const LINE_LAMP_ROOM = 70;

/** 何人で 成立か */
export const LINE_NEED = 3;

/** 最初に 自分が 送る 文 */
export const LINE_ASK = '今日飲める人います？\n3人以上なら🍺';
/** 参加の 返事 */
export const LINE_JOIN = 'ノ';
/**
 * 断る 理由(キャラごと。いくつか あれば 毎回 どれか)。
 * 2026-11-14 企画者「みんな 断る 理由を 作る」→ 届いたら ここを 置きかえる。【仮】と ある ものは 仮
 */
export const LINE_REFUSE: Record<LineChara, string[]> = {
  usagik: ['タイフェスだからパス'],
  // 「ヤキン」= 夜勤
  panday: ['ヤキン'],
  kangarooh: ['ラーメン屋の行列なう【仮】'],
  kyonk: ['今日は先約ある【仮】'],
  hiyokoj: ['打ちっぱなし行く【仮】'],
};

/** だれが 何番目に 返すか・参加か を 決めて 会話を 作る(当たり: 3人目の「ノ」で おわる / ハズレ: 2人の まま おわる) */
export function buildLineScript(win: boolean, rng: () => number): LineMsg[] {
  const members = shuffle(Object.keys(LINE_ICON) as LineChara[], rng);
  // 当たり: 参加 3人(さいごの 1人が 3人目)。その 前に 1人 断って 期待を 下げる
  // ハズレ: 参加 2人(たまに 1人)。さいごの 1人が 断る(「あと1人！」の あと)
  const joins = win ? 3 : rng() < 0.8 ? 2 : 1;
  const last = members[4];
  const beforeLast = members[3];
  const first3 = members.slice(0, 3);
  const joinSet = new Set<LineChara>();
  if (win) {
    // さいごは 参加・その 前は 断る・はじめの 3人の うち 2人 参加
    joinSet.add(last);
    for (const m of shuffle(first3, rng).slice(0, 2)) joinSet.add(m);
  } else {
    for (const m of shuffle(first3, rng).slice(0, joins)) joinSet.add(m);
  }
  void beforeLast;
  const msgs: LineMsg[] = [{ from: 'me', text: LINE_ASK, typingMs: 0, waitMs: 1100 }];
  members.forEach((m, i) => {
    const join = joinSet.has(m);
    const reasons = LINE_REFUSE[m];
    msgs.push({
      from: m,
      text: join ? LINE_JOIN : reasons[Math.floor(rng() * reasons.length)].replace('【仮】', ''),
      typingMs: i === 4 ? 2600 : 1100 + Math.round(rng() * 500),
      waitMs: i === 4 ? 0 : 1300 + Math.round(rng() * 400),
      join,
    });
  });
  return msgs;
}

function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** さいごの 返事の あと(当たり: 止まる → 金の 吹き出し → 3人参加！！ → 飲み会成立！！ / ハズレ: 不成立)の 長さ */
export const LINE_CLIMAX_MS = 3200;

/** 会話 ぜんぶの 長さ(ms) */
export function lineScriptMs(script: readonly LineMsg[]): number {
  return LINE_INTRO_MS + script.reduce((a, m) => a + m.typingMs + m.waitMs, 0) + LINE_CLIMAX_MS;
}

/** 最初の「3人 集まれば 当たり確定！」を 見せる 長さ(2026-11-14 企画者) */
export const LINE_INTRO_MS = 1800;
/** 最初に 出す 文(2026-11-14 企画者「最初に 3人 集まれば 当たり確定って 出そうか」) */
export const LINE_INTRO = '3人集まれば\n当たり確定！';

const txt = (scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string, stroke = 0, strokeColor = '#16101c') =>
  scene.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${Math.round(size)}px`, fontStyle: '900', color, stroke: strokeColor, strokeThickness: stroke, align: 'left', lineSpacing: 2 });

/**
 * 液晶に グループLINEを 流す。lcd は 液晶の 入れ物(まん中が 0,0)。
 * かかる 時間は lineScriptMs(script)。さいごに 3人 そろったら「3人参加！！」「飲み会成立！！」まで 出す(大当たりの 絵は 呼んだ 側)
 */
export function playLineReach(scene: Phaser.Scene, lcd: Phaser.GameObjects.Container, box: LcdBox, script: readonly LineMsg[]): void {
  const w = box.w - 6;
  const h = box.h - 6;
  const L = -w / 2;
  const T = -h / 2;
  lcd.removeAll(true);
  const root = scene.add.container(0, 0);
  lcd.add(root);
  // 背景(LINE の トーク画面 風の 青)・上の 帯(グループ名・参加の 数)
  root.add(scene.add.rectangle(0, 0, w, h, 0x8aa4c8));
  const headH = Math.max(34, h * 0.13);
  root.add(scene.add.rectangle(0, T + headH / 2, w, headH, 0x262a36));
  const fs = Math.max(18, Math.min(32, h * 0.088));
  root.add(txt(scene, L + 14, T + headH / 2, '〈  飲み会🍺 (6)', fs * 0.9, '#ffffff').setOrigin(0, 0.5));
  const count = txt(scene, -L - 14, T + headH / 2, `参加 0/${LINE_NEED}`, fs * 0.9, '#ffd23a', 4).setOrigin(1, 0.5);
  root.add(count);
  // 吹き出しの 置き場(上の 帯の 下〜 下はし)
  const chat = scene.add.container(0, 0);
  root.add(chat);
  const top = T + headH + 6;
  // 左下の 王冠ランプに かからない 高さまで
  const bottom = -T - Math.max(8, LINE_LAMP_ROOM);
  let cursor = top + 4;
  const pad = 8;
  const icon = Math.max(26, fs * 1.7);
  const maxBubbleW = w * 0.62;
  let joined = 0;

  /** 吹き出しを 1つ 作る(まだ 置かない)。高さを 返す */
  const bubble = (m: LineMsg, typing: boolean): { node: Phaser.GameObjects.Container; height: number; body: Phaser.GameObjects.Graphics; draw: (fill: number) => void } => {
    const node = scene.add.container(0, 0);
    const mine = m.from === 'me';
    const label = typing ? '・・・' : m.text;
    const t = txt(scene, 0, 0, label, fs, '#16101c').setWordWrapWidth(maxBubbleW - pad * 2, true);
    const bw = t.width + pad * 2;
    const bh = t.height + pad * 1.4;
    const body = scene.add.graphics();
    const draw = (fill: number) => {
      body.clear();
      body.fillStyle(fill, 1).fillRoundedRect(0, 0, bw, bh, Math.min(14, bh / 2));
    };
    draw(mine ? 0x8de055 : 0xffffff);
    let nameH = 0;
    if (mine) {
      const x0 = -L - 12 - bw;
      body.setPosition(x0, 0);
      t.setPosition(x0 + pad, pad * 0.7);
      const read = txt(scene, x0 - 6, bh, '既読 5', fs * 0.55, '#eef2f8').setOrigin(1, 1);
      node.add([body, t, read]);
    } else {
      const who = LINE_ICON[m.from as LineChara];
      const ix = L + 12;
      const bx = ix + icon + 8;
      nameH = fs * 0.75;
      const nm = txt(scene, bx + 2, 0, who.name, fs * 0.6, '#ffffff').setOrigin(0, 0);
      body.setPosition(bx, nameH);
      t.setPosition(bx + pad, nameH + pad * 0.7);
      // アイコン(キャラの 絵の 上の 方を 四角く 切る)
      const ring = scene.add.circle(ix + icon / 2, icon / 2, icon / 2 + 2, 0xffffff);
      node.add([ring]);
      if (scene.textures.exists(who.key)) {
        const im = scene.add.image(ix + icon / 2, icon / 2, who.key);
        const side = Math.min(im.width, im.height * 0.5);
        im.setCrop((im.width - side) / 2, im.height * 0.02, side, side);
        const k = icon / side;
        im.setScale(k);
        im.setY(icon / 2 + (im.height / 2 - (im.height * 0.02 + side / 2)) * k);
        node.add(im);
      }
      node.add([nm, body, t]);
      if (typing) scene.tweens.add({ targets: t, alpha: 0.3, duration: 360, yoyo: true, repeat: -1 });
    }
    return { node, height: Math.max(mine ? 0 : icon, nameH + bh), body, draw };
  };

  /** 下に 足す。はみ出す 時は 前の 吹き出しを 上へ 送る(上の 帯より 上に 出た ものは 消す) */
  const push = (b: { node: Phaser.GameObjects.Container; height: number }) => {
    const gap = 10;
    const need = cursor + b.height - bottom;
    if (need > 0) {
      for (const n of chat.list as Phaser.GameObjects.Container[]) {
        n.y -= need;
        if (n.y < top - 2) n.setVisible(false);
      }
      cursor -= need;
    }
    b.node.setY(cursor);
    b.node.setAlpha(0);
    chat.add(b.node);
    scene.tweens.add({ targets: b.node, alpha: 1, duration: 160 });
    cursor += b.height + gap;
  };

  // 2026-11-14 企画者「リーチ中 今 何人か わからない」→ 液晶の 右下に 今の 人数(大きく)
  const big = txt(scene, -L - 14, -T - 10, '0人', fs * 1.9, '#ffd23a', 7).setOrigin(1, 1);
  const bigLabel = txt(scene, -L - 14 - big.width - 8, -T - 16, '参加', fs * 0.85, '#ffffff', 5).setOrigin(1, 1);
  root.add([scene.add.rectangle(-L - 6, -T - 4, big.width + bigLabel.width + 44, big.height + 6, 0x16101c, 0.6).setOrigin(1, 1), bigLabel, big]);
  const paintBig = (down: boolean) => {
    big.setText(`${joined}人`);
    bigLabel.setX(-L - 14 - big.width - 8);
    big.setColor(down ? '#9aa4b8' : joined >= LINE_NEED ? '#ffd23a' : joined >= LINE_NEED - 1 ? '#ff5a7a' : '#ffd23a');
    if (down) scene.tweens.add({ targets: big, x: big.x + 5, duration: 50, yoyo: true, repeat: 3 });
    else scene.tweens.add({ targets: big, scale: { from: 1.6, to: 1 }, duration: 280, ease: 'Back.easeOut' });
  };

  const setCount = (down = false) => {
    paintBig(down);
    count.setText(joined >= LINE_NEED - 1 && joined < LINE_NEED ? `参加 ${joined}/${LINE_NEED}  あと1人！` : `参加 ${joined}/${LINE_NEED}`);
    if (down) {
      count.setColor('#9aa4b8');
      scene.tweens.add({ targets: count, x: count.x + 4, duration: 50, yoyo: true, repeat: 3 });
      scene.time.delayedCall(700, () => count.active && count.setColor('#ffd23a'));
    } else {
      count.setColor(joined >= LINE_NEED - 1 ? '#ff5a7a' : '#ffd23a');
      scene.tweens.add({ targets: count, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    }
  };

  // 最初に「3人 集まれば 当たり確定！」(帯で 出して 消える)
  const introBand = scene.add.rectangle(0, 0, w, h * 0.5, 0x16101c, 0.88);
  const intro = tierText(scene, 0, 0, LINE_INTRO, Math.min(60, h * 0.15), 'gold').setAlign('center').setScale(0.3);
  root.add([introBand, intro]);
  scene.tweens.add({ targets: intro, scale: 1, duration: 320, ease: 'Back.easeOut' });
  audio.se('mcCutin');
  scene.tweens.add({ targets: [introBand, intro], alpha: 0, duration: 300, delay: LINE_INTRO_MS - 300, onComplete: () => (introBand.destroy(), intro.destroy()) });

  let t = LINE_INTRO_MS;
  script.forEach((m, i) => {
    const last = i === script.length - 1;
    if (m.typingMs > 0) {
      let typing: ReturnType<typeof bubble> | undefined;
      scene.time.delayedCall(t, () => {
        if (!root.active) return;
        typing = bubble(m, true);
        push(typing);
      });
      t += m.typingMs;
      scene.time.delayedCall(t, () => {
        if (!root.active || !typing) return;
        // 入力中を 消して 同じ 場所に 本当の 文
        cursor = typing.node.y;
        typing.node.destroy();
        show(m, last);
      });
    } else {
      scene.time.delayedCall(t, () => root.active && show(m, last));
    }
    t += m.waitMs;
  });

  function show(m: LineMsg, last: boolean): void {
    const b = bubble(m, false);
    push(b);
    audio.se(m.from === 'me' ? LINE_SE.send : LINE_SE.notify, { pitch: m.from === 'me' ? 1.2 : 1.6 });
    if (m.join) {
      joined++;
      audio.se(LINE_SE.join, { pitch: 1 + joined * 0.15 });
      setCount();
    } else if (m.from !== 'me' && joined > 0) {
      // 「ヤキン」など 不参加: いったん 期待を 下げる
      audio.se(LINE_SE.down, { pitch: 0.7 });
      setCount(true);
    }
    if (last && joined >= LINE_NEED) climax(b);
    else if (last) loseEnd();
  }

  /** 3人目: 止まる → 吹き出しが 金に 光る → 3人参加！！ → 飲み会成立！！ */
  function climax(b: ReturnType<typeof bubble>): void {
    scene.tweens.pauseAll();
    scene.time.delayedCall(380, () => {
      scene.tweens.resumeAll();
      if (!root.active) return;
      b.draw(0xffd23a);
      const glow = scene.add.rectangle(0, 0, w, h, 0xffd23a, 0.5);
      root.add(glow);
      scene.tweens.add({ targets: glow, alpha: 0, duration: 500 });
      scene.cameras.main.flash(260, 255, 230, 140);
      scene.cameras.main.shake(300, 0.006);
      audio.se(LINE_SE.climax);
      const dim = scene.add.rectangle(0, 0, w, h, 0x16101c, 0);
      root.add(dim);
      scene.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 300, delay: 500 });
      const a = tierText(scene, 0, -h * 0.12, '3人参加！！', Math.min(72, h * 0.2), 'gold').setScale(0.2).setAlpha(0);
      const c = tierText(scene, 0, h * 0.16, '飲み会成立！！', Math.min(64, h * 0.17), 'rainbow').setScale(0.2).setAlpha(0);
      root.add([a, c]);
      scene.tweens.add({ targets: a, scale: 1, alpha: 1, duration: 360, delay: 700, ease: 'Back.easeOut', onStart: () => audio.se('mcCutin') });
      scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 360, delay: 1500, ease: 'Back.easeOut', onStart: () => audio.se('cheer') });
    });
  }

  /** ハズレ: さいごの 人も 断る → 灰色に なって「飲み会 不成立…」 */
  function loseEnd(): void {
    scene.time.delayedCall(500, () => {
      if (!root.active) return;
      const dim = scene.add.rectangle(0, 0, w, h, 0x16101c, 0);
      root.add(dim);
      scene.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 400 });
      const a = txt(scene, 0, -h * 0.1, `参加 ${joined}人…`, Math.min(56, h * 0.15), '#c8c0d8', 8).setOrigin(0.5).setAlpha(0);
      const c = txt(scene, 0, h * 0.14, '飲み会 不成立…', Math.min(52, h * 0.14), '#9aa4b8', 8).setOrigin(0.5).setAlpha(0);
      root.add([a, c]);
      scene.tweens.add({ targets: a, alpha: 1, duration: 300, delay: 400 });
      scene.tweens.add({ targets: c, alpha: 1, y: c.y + 6, duration: 400, delay: 1000, onStart: () => audio.se(LINE_SE.down, { pitch: 0.6 }) });
    });
  }
}
