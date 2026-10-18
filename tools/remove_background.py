"""元画像から背景だけを消す(BUNK本体の色・線は1ピクセルも変えない)。

使い方:
  python3 tools/remove_background.py 元画像 出力.png [--checker] [x,y ...]

- --checker: 背景が灰色の市松模様(透明の見た目を絵として描き込んだもの)のとき

- 画像の外側から、背景の色(ピンク・クリーム色のカード、または灰色の市松模様)をたどって透明にする。
  黒い輪郭線で止まるので、輪郭の内側(おなか・白目など)は消えない。
- 線に囲まれた背景(足の間の床など)は、その中の1点を x,y で指定して消す。
- 背景を消したあと、いちばん大きいかたまり(本体)だけを残す。文字や枠は消える。
- 残したピクセルの色は元画像と同じ。最後にそれを確かめる。
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

NEIGHBORS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def flood(start, allowed, out):
    q = deque()
    for y, x in start:
        if allowed[y, x] and not out[y, x]:
            out[y, x] = True
            q.append((y, x))
    h, w = allowed.shape
    while q:
        y, x = q.popleft()
        for dy, dx in NEIGHBORS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and allowed[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))


def largest_component(mask):
    h, w = mask.shape
    best = None
    seen = np.zeros_like(mask)
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                comp = np.zeros_like(mask)
                flood([(y, x)], mask, comp)
                seen |= comp
                if best is None or comp.sum() > best.sum():
                    best = comp
    return best


def main(src, out, args):
    checker = '--checker' in args
    seeds = [a for a in args if a != '--checker']
    rgb = np.array(Image.open(src).convert("RGB"))
    h, w, _ = rgb.shape
    f = rgb.astype(float) / 255
    mx, mn = f.max(2), f.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    if checker:
        # 市松模様: 色みのない明るい灰色(白目やおなかはクリーム色なので含まない)
        spread = rgb.max(2).astype(int) - rgb.min(2).astype(int)
        passable = (spread <= 8) & (lum > 130)
    else:
        # カード: 明るく、ピンク寄りか色の薄いもの(オレンジ・紫・黒は含まない)
        passable = (lum > 110) & ((hue >= 300) | (hue <= 12) | (sat < 0.3))

    bg = np.zeros((h, w), bool)
    border = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    flood(border, passable, bg)
    for s in seeds:
        x, y = map(int, s.split(","))
        if not passable[y, x]:
            sys.exit(f"{s} は背景の色ではありません")
        flood([(y, x)], passable, bg)

    if checker:
        # 輪郭のすぐ外の、市松模様と混ざった灰色の点も背景にする(本体の色の点は残す)
        fringe = (spread <= 12) & (lum > 70)
        for _ in range(2):
            near = np.zeros_like(bg)
            near[1:] |= bg[:-1]; near[:-1] |= bg[1:]; near[:, 1:] |= bg[:, :-1]; near[:, :-1] |= bg[:, 1:]
            bg |= near & fringe

    body = largest_component(~bg)
    alpha = np.where(body, 255, 0).astype(np.uint8)
    Image.fromarray(np.dstack([rgb, alpha])).save(out, optimize=True)

    check = np.array(Image.open(out))
    assert (check[..., :3][body] == rgb[body]).all(), "本体の色が変わっています"
    ys, xs = np.nonzero(body)
    print(f"本体 {body.sum()} px / 範囲 x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()} / 色の変更 0 px")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
