import * as Phaser from 'phaser';

/**
 * 絵の メモリの 上限(2026-11-09 企画者「長く 遊ぶと 重くなる のを 解決したい」)。
 * 画面を 移るたびに 読んだ 絵が たまって いき、いろいろな 画面を 見ると 240MB を こえた(iPhone で 落ちる・止まる もと)。
 * → 画面が 変わったら、しばらく 使っていない 絵から メモリを 外して、合計を 上限より 小さく する。
 * 外した 絵は、また その 画面に 行った 時に 読みなおす(どの 画面も「絵が なければ 読む」作りに なっている)。
 * - 使った 時: どこかで「その 絵は ある？」(textures.exists) と 聞かれた 時・画面に 出ている 時
 * - 外さない: 今 画面に 出ている 絵・プログラムで 描いた 絵(読みなおせない)・Phaser の 絵・MYTHCLASH の カードの 絵(別に 管理)
 */
export const TEXTURE_BUDGET_BYTES = 150 * 1024 * 1024;

const lastUse = new Map<string, number>();
/** 今 外さない 絵の 名前の はじまり(画面が 開いている 間。数で 数える) */
const pinned = new Map<string, number>();

/**
 * その 画面が 開いている 間、名前が prefix で はじまる 絵を 外さない。もどす 関数を 返す。
 * 2026-11-12 企画者「公開してる ロイヤルジャックポット、リーチ・ステップアップ・マークが おかしい」:
 * スロットは 先に 読んだ 絵(まだ 出ていない 図柄・リーチの 絵)を あとで 使うので、ここで 外されて 仮の 絵に なっていた
 */
export function pinTextures(prefix: string): () => void {
  pinned.set(prefix, (pinned.get(prefix) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = (pinned.get(prefix) ?? 1) - 1;
    if (n > 0) pinned.set(prefix, n);
    else pinned.delete(prefix);
  };
}
let clock = 0;
let installed = false;

/** 絵の メモリ(だいたい。1点 4バイト) */
function bytesOf(t: Phaser.Textures.Texture): number {
  let n = 0;
  for (const s of t.source) n += (s.width || 0) * (s.height || 0) * 4;
  return n;
}

/** 読みなおせる 絵(ファイルから 読んだ 絵)か */
function reloadable(key: string, t: Phaser.Textures.Texture): boolean {
  if (key.startsWith('__') || key.startsWith('myth:cardart:')) return false;
  for (const p of pinned.keys()) if (key.startsWith(p)) return false;
  const img = t.source[0]?.image;
  return typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement;
}

/** 今 どこかの 画面に 出ている 絵 */
function inUse(game: Phaser.Game): Set<string> {
  const used = new Set<string>();
  const walk = (list: readonly Phaser.GameObjects.GameObject[]) => {
    for (const o of list) {
      const k = (o as Phaser.GameObjects.Image).texture?.key;
      if (k) used.add(k);
      const kids = (o as Phaser.GameObjects.Container).list;
      if (Array.isArray(kids)) walk(kids);
    }
  };
  for (const sc of game.scene.getScenes(false)) if (sc.sys.displayList) walk(sc.sys.displayList.list);
  return used;
}

/** 「その 絵は ある？」を 使った 時と して 覚える(読みこむ 前の たしかめ・使う 前の たしかめ) */
export function installTextureBudget(game: Phaser.Game): void {
  if (installed) return;
  installed = true;
  const tm = game.textures;
  const exists = tm.exists.bind(tm);
  tm.exists = (key: string) => {
    lastUse.set(key, ++clock);
    return exists(key);
  };
  tm.on(Phaser.Textures.Events.ADD, (key: string) => lastUse.set(key, ++clock));
  tm.on(Phaser.Textures.Events.REMOVE, (key: string) => lastUse.delete(key));
}

/** 上限を こえていたら、長く 使っていない 絵から 外す。外した 数を 返す */
export function trimTextures(game: Phaser.Game, budget = TEXTURE_BUDGET_BYTES): number {
  const tm = game.textures;
  const used = inUse(game);
  for (const k of used) lastUse.set(k, ++clock);
  let total = 0;
  const can: { key: string; bytes: number; at: number }[] = [];
  for (const key of tm.getTextureKeys()) {
    const t = tm.get(key);
    const b = bytesOf(t);
    total += b;
    if (reloadable(key, t) && !used.has(key)) can.push({ key, bytes: b, at: lastUse.get(key) ?? 0 });
  }
  can.sort((a, b) => a.at - b.at);
  let n = 0;
  for (const c of can) {
    if (total <= budget) break;
    tm.remove(c.key);
    total -= c.bytes;
    n++;
  }
  return n;
}
