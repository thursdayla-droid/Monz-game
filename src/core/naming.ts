/**
 * MONZの名前のきまり。Phaserに依存しない。
 * 企画者決定(2026-10-20): 名前は卵から生まれたときにつける。
 * 【仮】文字数は8文字まで。空なら種類の名前(BUNK など)。
 */
export const NAME_MAX = 8;

/** 入力された名前を整える(前後の空白・改行などを取り、長すぎたら切る)。空なら fallback */
export function cleanName(input: string, fallback: string): string {
  const s = input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(s).slice(0, NAME_MAX);
  return chars.length ? chars.join('').trim() : fallback;
}
