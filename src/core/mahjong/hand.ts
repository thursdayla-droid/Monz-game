import { KINDS, type Kind, isYaochu } from './tiles';

/**
 * 手牌の 形を 見る(アガリの 形・テンパイ・待ち・シャンテン数)。
 * counts: 種類ごとの 枚数(鳴いた 面子は 入れない)。meldCount: 鳴いた・カンした 面子の 数
 */

export interface Group {
  type: 'seq' | 'trip';
  /** 順子は いちばん 小さい 牌・刻子は その 牌 */
  kind: Kind;
}
export interface Decomp {
  pair: Kind;
  groups: Group[];
}

const YAOCHU: Kind[] = Array.from({ length: KINDS }, (_, k) => k).filter(isYaochu);

/** ふつうの アガリ形(4面子1雀頭)の 分け方を 全部 */
export function decompose(counts: readonly number[]): Decomp[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total % 3 !== 2) return [];
  const need = (total - 2) / 3;
  const c = [...counts];
  const out: Decomp[] = [];
  const groups: Group[] = [];
  const rec = (i: number): void => {
    while (i < KINDS && c[i] === 0) i++;
    if (i >= KINDS) {
      if (groups.length === need) out.push({ pair: -1, groups: [...groups] });
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      groups.push({ type: 'trip', kind: i });
      rec(i);
      groups.pop();
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      groups.push({ type: 'seq', kind: i });
      rec(i);
      groups.pop();
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
  };
  for (let p = 0; p < KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const before = out.length;
    rec(0);
    for (let j = before; j < out.length; j++) out[j].pair = p;
    c[p] += 2;
  }
  // 同じ 分け方を 1つに(刻子3つ ⇔ 順子3つ など 別に 数える ため そのまま。完全に 同じ ものだけ 消す)
  const seen = new Set<string>();
  return out.filter((d) => {
    const key = `${d.pair}|${d.groups.map((g) => `${g.type[0]}${g.kind}`).sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const isChiitoi = (c: readonly number[]): boolean => c.reduce((a, b) => a + b, 0) === 14 && c.filter((n) => n === 2).length === 7;
export const isKokushi = (c: readonly number[]): boolean =>
  c.reduce((a, b) => a + b, 0) === 14 && YAOCHU.every((k) => c[k] >= 1) && YAOCHU.some((k) => c[k] === 2);

/** アガリの 形か(ふつう・七対子・国士無双) */
export function isAgari(counts: readonly number[], meldCount = 0): boolean {
  if (meldCount === 0 && (isChiitoi(counts) || isKokushi(counts))) return true;
  let total = 0;
  for (let k = 0; k < KINDS; k++) total += counts[k];
  if (total % 3 !== 2) return false;
  const c = counts.slice();
  for (let p = 0; p < KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    if (allSets(c)) return true;
    c[p] += 2;
  }
  return false;
}

/** 雀頭を ぬいた 残りが 全部 面子に なるか(刻子を 先に とる やり方で よい) */
function allSets(counts: number[]): boolean {
  const c = counts.slice();
  for (let i = 0; i < KINDS; i++) {
    if (c[i] >= 3) c[i] -= 3;
    if (c[i] === 0) continue;
    if (i >= 27 || i % 9 > 6) return false;
    const n = c[i];
    if (c[i + 1] < n || c[i + 2] < n) return false;
    c[i] = 0;
    c[i + 1] -= n;
    c[i + 2] -= n;
  }
  return true;
}

/** 1つの 色(9種類)で とれる 面子・塔子・雀頭の 組み合わせ(多い ほうだけ 残す)。同じ 形は 覚えておく */
type Part = [m: number, t: number, p: number];
const partMemo = new Map<string, Part[]>();
function suitParts(c: number[], honor: boolean): Part[] {
  const key = (honor ? 'z' : 's') + c.join('');
  const hit = partMemo.get(key);
  if (hit) return hit;
  const found = new Map<string, Part>();
  const n = c.length;
  const rec = (i: number, m: number, t: number, p: number): void => {
    while (i < n && c[i] === 0) i++;
    if (i >= n) {
      found.set(`${m},${t},${p}`, [m, t, p]);
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      rec(i, m + 1, t, p);
      c[i] += 3;
    }
    if (!honor && i <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      rec(i, m + 1, t, p);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!p) rec(i, m, t, 1);
      rec(i, m, t + 1, p);
      c[i] += 2;
    }
    if (!honor && i <= 7 && c[i + 1]) {
      c[i]--;
      c[i + 1]--;
      rec(i, m, t + 1, p);
      c[i]++;
      c[i + 1]++;
    }
    if (!honor && i <= 6 && c[i + 2]) {
      c[i]--;
      c[i + 2]--;
      rec(i, m, t + 1, p);
      c[i]++;
      c[i + 2]++;
    }
    c[i]--;
    rec(i + (c[i] === 0 ? 1 : 0), m, t, p);
    c[i]++;
  };
  rec(0, 0, 0, 0);
  // ほかより 全部 少ない ものは いらない
  const all = [...found.values()];
  const keep = all.filter((a) => !all.some((b) => b !== a && b[0] >= a[0] && b[0] + b[1] >= a[0] + a[1] && b[2] >= a[2] && (b[0] > a[0] || b[0] + b[1] > a[0] + a[1] || b[2] > a[2])));
  partMemo.set(key, keep);
  return keep;
}

/** ふつうの 形の シャンテン数(-1 = アガリ・0 = テンパイ) */
function standardShanten(counts: readonly number[], meldCount: number): number {
  const parts = [suitParts(counts.slice(0, 9), false), suitParts(counts.slice(9, 18), false), suitParts(counts.slice(18, 27), false), suitParts(counts.slice(27, 34), true)];
  let best = 8;
  const rec = (i: number, m: number, t: number, p: number): void => {
    if (i === 4) {
      const mm = m + meldCount;
      const tt = Math.min(t, 4 - mm);
      best = Math.min(best, 8 - 2 * mm - tt - p);
      return;
    }
    for (const [a, b, c] of parts[i]) if (p + c <= 1) rec(i + 1, m + a, t + b, p + c);
  };
  rec(0, 0, 0, 0);
  return best;
}

/** シャンテン数(七対子・国士は 鳴いていない 時だけ)。13枚でも 14枚でも よい */
export function shanten(counts: readonly number[], meldCount = 0): number {
  let s = standardShanten(counts, meldCount);
  if (meldCount === 0) {
    const pairs = counts.filter((n) => n >= 2).length;
    const kinds = counts.filter((n) => n >= 1).length;
    s = Math.min(s, 6 - pairs + Math.max(0, 7 - kinds));
    const yk = YAOCHU.filter((k) => counts[k] >= 1).length;
    const yp = YAOCHU.some((k) => counts[k] >= 2) ? 1 : 0;
    s = Math.min(s, 13 - yk - yp);
  }
  return s;
}

/**
 * 待ち(13枚・3n+1 枚の 手で、来れば アガリの 形になる 牌の 種類)。
 * 自分の 手で 4枚 全部 使っている 牌は 待ちに 入れない
 */
export function waits(counts: readonly number[], meldCount = 0): Kind[] {
  const out: Kind[] = [];
  const c = [...counts];
  for (let k = 0; k < KINDS; k++) {
    if (c[k] >= 4) continue;
    // 持っている 牌か その となり(2つ先まで)で なければ 待ちに ならない(七対子・国士は 別に 見る)
    const near = c[k] > 0 || (k < 27 && ((k % 9 >= 1 && c[k - 1] > 0) || (k % 9 >= 2 && c[k - 2] > 0) || (k % 9 <= 7 && c[k + 1] > 0) || (k % 9 <= 6 && c[k + 2] > 0)));
    if (!near && !(meldCount === 0 && isYaochu(k))) continue;
    c[k]++;
    if (isAgari(c, meldCount)) out.push(k);
    c[k]--;
  }
  return out;
}
