"""
BUNK のまぶた(目の上のクリーム色の所)に描かれている黒い点を消す(企画者の指示 2026-10-21「目が2つに見える」)。
点だけを、まわりのまぶたの色でうめる。ほかのピクセルは変えない。

使い方:
  python3 tools/remove_eyelid_dots.py 画像 x,y [x,y ...]
x,y は消す点のだいたいの位置(点の中か、すぐ近く)。まわりがクリーム色の、丸い黒い点だけを消す(違ったら何もしないで止まる)。

点が目のふちの線につながっているときは x,y,r,t と書く(半径 r の円の中で、線からはみ出した黒い所だけを消す)。
t は残す線の太さ(オレンジや背景から t ピクセルまでの黒は線として残す)。
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def remove(path: str, points: list[tuple[int, int]]) -> None:
    im = Image.open(path)
    mode = im.mode
    a = np.asarray(im.convert('RGBA')).astype(float)
    rgb, al = a[..., :3], a[..., 3]
    dark = (rgb.max(2) < 110) & (al > 128)
    cream = (rgb[..., 0] > 200) & (rgb[..., 1] > 185) & (rgb[..., 2] > 150) & (al > 128)
    lab, _ = ndimage.label(dark)
    mask = np.zeros(dark.shape, bool)
    # 目のまわり(オレンジ・背景など、黒でもクリーム色でもない所)からの距離。線の太さを測るのに使う
    # (小さなにじみの点は外とみなさない。大きなかたまりだけ)
    lab_o, _ = ndimage.label(~dark & ~cream)
    sizes = np.bincount(lab_o.ravel())
    big = sizes > 800
    big[0] = False
    outside = big[lab_o]
    dist_out = ndimage.distance_transform_edt(~outside)
    yy, xx = np.mgrid[0:dark.shape[0], 0:dark.shape[1]]
    for pt in points:
        if len(pt) == 4:
            # 線につながった点: 円の中の、線(外から t ピクセルまで)より内側の黒だけ
            x, y, r, t = pt
            blob = dark & ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) & (dist_out > t)
            if blob.sum() == 0 or cream[ndimage.binary_dilation(blob, iterations=3) & ~blob].mean() < 0.4:
                sys.exit(f'{path}: {x},{y} にまぶたの点が見つからない')
            keep_line = dark & (dist_out <= t)
            mask |= ndimage.binary_dilation(blob, iterations=3) & ((xx - x) ** 2 + (yy - y) ** 2 <= (r + 3) ** 2) & ~keep_line & ~outside
            continue
        x, y = pt
        # 点の中か、いちばん近い黒い所
        ys, xs = np.nonzero(lab[max(0, y - 12):y + 13, max(0, x - 12):x + 13])
        if len(ys) == 0:
            sys.exit(f'{path}: {x},{y} の近くに黒い点がない')
        d = (ys + max(0, y - 12) - y) ** 2 + (xs + max(0, x - 12) - x) ** 2
        k = np.argmin(d)
        comp = lab == lab[ys[k] + max(0, y - 12), xs[k] + max(0, x - 12)]
        area = comp.sum()
        ring = ndimage.binary_dilation(comp, iterations=4) & ~ndimage.binary_dilation(comp, iterations=1)
        if area > 4000 or cream[ring].mean() < 0.75:
            sys.exit(f'{path}: {x},{y} はまぶたの点ではなさそう(大きさ {area}・まわりのクリーム色 {cream[ring].mean():.2f})')
        # ふちのぼやけた所までふくめて消す
        mask |= ndimage.binary_dilation(comp, iterations=3)
    # 点のまわりだけを切り出して作業する(速くするため)
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = max(0, ys.min() - 6), ys.max() + 7, max(0, xs.min() - 6), xs.max() + 7
    sub_mask = mask[y0:y1, x0:x1]
    sub = rgb[y0:y1, x0:x1].copy()
    # うめるのに使うのは、まぶたの色(クリーム色)だけ(黒い線の色がにじまないように)
    valid = (cream[y0:y1, x0:x1] | sub_mask).astype(float)
    known = cream[y0:y1, x0:x1] & ~ndimage.binary_dilation(sub_mask, iterations=2)
    sub[~known] = 0
    dirs = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    # まわりの色を少しずつ広げてうめる
    for _ in range(200):
        if (known | ~sub_mask)[sub_mask | ndimage.binary_dilation(sub_mask, iterations=2) & cream[y0:y1, x0:x1]].all():
            break
        acc = np.zeros_like(sub)
        n = np.zeros(known.shape)
        for dy, dx in dirs:
            acc += np.roll(np.roll(sub * known[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(known, dy, 0), dx, 1)
        grow = (sub_mask | (ndimage.binary_dilation(sub_mask, iterations=2) & cream[y0:y1, x0:x1])) & ~known & (n > 0)
        sub[grow] = acc[grow] / n[grow][:, None]
        known = known | grow
    # うめた所を なめらかにする(まわりの色は変えずに、中だけ何度も平均する。十字のすじが出ないように)
    for _ in range(400):
        acc = np.zeros_like(sub)
        n = np.zeros(known.shape)
        for dy, dx in dirs:
            acc += np.roll(np.roll(sub * valid[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(valid, dy, 0), dx, 1)
        upd = sub_mask & (n > 0)
        sub[upd] = acc[upd] / n[upd][:, None]
    out = rgb.copy()
    out[y0:y1, x0:x1] = sub
    a[..., :3] = np.where(mask[..., None], out, rgb)
    res = Image.fromarray(a.round().clip(0, 255).astype(np.uint8), 'RGBA')
    if mode != 'RGBA':
        res = res.convert(mode)
    if path.endswith('.webp'):
        res.save(path, quality=92, method=6)
    else:
        res.save(path)
    print(path, 'けした点:', len(points), 'ピクセル:', int(mask.sum()))


if __name__ == '__main__':
    remove(sys.argv[1], [tuple(int(v) for v in p.split(',')) for p in sys.argv[2:]])
