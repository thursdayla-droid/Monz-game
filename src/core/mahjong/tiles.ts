import { mulberry32 } from '../rng';

/**
 * 麻雀の 牌(2026-11-08 企画者 仕様書 Ver.1.0。docs/MAHJONG.md)。Phaser に 依存しない。
 *
 * 牌の 種類(kind) 0〜33:
 *   0〜8 萬子 1〜9 / 9〜17 筒子 1〜9 / 18〜26 索子 1〜9 / 27 東 28 南 29 西 30 北 / 31 白 32 發 33 中
 * 1枚 1枚(tile) 0〜135 = kind*4 + 何枚目(0〜3)。赤ドラは 5萬・5筒・5索の 0枚目(企画者 2026-11-08「赤ドラあり」。各1枚【仮】)
 */
export type Kind = number;
export type Tile = number;

export const KINDS = 34;
export const TILES = 136;
export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const HAKU = 31;
export const HATSU = 32;
export const CHUN = 33;

export const kindOf = (t: Tile): Kind => t >> 2;
export const suitOf = (k: Kind): 0 | 1 | 2 | 3 => (k < 27 ? ((k / 9) | 0) : 3) as 0 | 1 | 2 | 3;
export const numOf = (k: Kind): number => (k < 27 ? (k % 9) + 1 : 0);
export const isHonor = (k: Kind): boolean => k >= 27;
export const isTerminal = (k: Kind): boolean => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isYaochu = (k: Kind): boolean => isHonor(k) || isTerminal(k);
export const isWind = (k: Kind): boolean => k >= EAST && k <= NORTH;
export const isDragon = (k: Kind): boolean => k >= HAKU;

/** 赤ドラの 牌か(赤5を 何枚 使うかの 設定つき) */
export const RED_TILES: readonly Tile[] = [4 * 4, 13 * 4, 22 * 4];
export const isRed = (t: Tile, useRed = true): boolean => useRed && RED_TILES.includes(t);

/** ドラ表示牌 → ドラの 種類(9 の次は 1・北の 次は 東・中の 次は 白) */
export function doraOf(indicator: Kind): Kind {
  if (indicator < 27) return indicator - (indicator % 9) + ((indicator % 9) + 1) % 9;
  if (indicator <= NORTH) return EAST + ((indicator - EAST + 1) % 4);
  return HAKU + ((indicator - HAKU + 1) % 3);
}

/** 手牌(1枚ずつ)を 種類ごとの 枚数に */
export function toCounts(tiles: readonly Tile[]): number[] {
  const c = new Array<number>(KINDS).fill(0);
  for (const t of tiles) c[kindOf(t)]++;
  return c;
}

/** 文字で 牌を 書く(テスト用): "123m456p789s1122z" (z: 1東 2南 3西 4北 5白 6發 7中。0 は 赤5) */
export function parseKinds(s: string): Kind[] {
  const out: Kind[] = [];
  let buf: number[] = [];
  for (const ch of s.replace(/\s/g, '')) {
    if (/[0-9]/.test(ch)) buf.push(Number(ch));
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      if (base === undefined) throw new Error(`bad tile string ${s}`);
      for (const n of buf) out.push(base + (n === 0 ? 5 : n) - 1);
      buf = [];
    }
  }
  return out;
}

/** 文字から 1枚ずつの 牌に(同じ 種類は 0枚目から 順に。"0" は 赤5) */
export function parseTiles(s: string): Tile[] {
  const used = new Array<number>(KINDS).fill(0);
  const out: Tile[] = [];
  let buf: number[] = [];
  for (const ch of s.replace(/\s/g, '')) {
    if (/[0-9]/.test(ch)) buf.push(Number(ch));
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch]!;
      for (const n of buf) {
        const k = base + (n === 0 ? 5 : n) - 1;
        if (n === 0) out.push(k * 4);
        else {
          // 赤(0枚目)は さける
          const isFive = k < 27 && k % 9 === 4;
          const copy = used[k] + (isFive ? 1 : 0);
          used[k]++;
          out.push(k * 4 + copy);
        }
      }
      buf = [];
    }
  }
  return out;
}

const NAMES_Z = ['東', '南', '西', '北', '白', '發', '中'];
/** 牌の 名前(画面・テスト用) */
export function kindName(k: Kind): string {
  if (k >= 27) return NAMES_Z[k - 27];
  return `${numOf(k)}${['萬', '筒', '索'][suitOf(k)]}`;
}

/** 136枚を 種から まぜる(同じ 種なら 同じ 並び) */
export function shuffledWall(seed: number): Tile[] {
  const rng = mulberry32(seed);
  const w = Array.from({ length: TILES }, (_, i) => i);
  for (let i = w.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [w[i], w[j]] = [w[j], w[i]];
  }
  return w;
}
