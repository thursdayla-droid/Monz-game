# 使い方: python3 -I tools/cut_mahjong_sheet.py <シート.png> <名前の頭 m/p/s/z> <出力先> <枚数>
"""麻雀牌の シートを 1枚ずつに 切る。背景が 黒(透明でない)の 時は 牌の 形から 透明を 作る"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, prefix, outdir, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
im = Image.open(src).convert('RGBA')
a = np.array(im).astype(np.int32)
lum = a[..., :3].max(axis=2)
rgb = a[..., :3]
sat = rgb.max(axis=2) - rgb.min(axis=2)
light_bg = a[..., 3].min() == 255 and lum[:8, :8].mean() > 180
if light_bg:
    # 透明の 市松もようが 絵に 描きこまれている: ふちから つながった 白・灰色を 背景に する(黒い 輪郭で 止まる)
    cand = (lum > 170) & (sat < 25)
    lab0, _ = nd.label(cand)
    edge = set(np.unique(np.concatenate([lab0[0], lab0[-1], lab0[:, 0], lab0[:, -1]]))) - {0}
    bg = np.isin(lab0, list(edge))
    alpha = ~bg
    bright = nd.binary_erosion(alpha, iterations=6)
elif a[..., 3].min() == 255:
    bright = nd.binary_fill_holes(lum > 60)
    # 黒い 輪郭の 太さぶん ふくらませる
    alpha = nd.binary_dilation(bright, iterations=14)
else:
    alpha = a[..., 3] > 20
    bright = nd.binary_fill_holes(alpha & (lum > 60))
lab, cnt = nd.label(nd.binary_opening(bright, iterations=3))
objs = nd.find_objects(lab)
sizes = nd.sum(np.ones_like(lab), lab, range(1, cnt + 1))
idx = sorted(range(cnt), key=lambda i: -sizes[i])[:n]
boxes = [objs[i] for i in idx]
# 上から 段ごと、左から
boxes.sort(key=lambda b: (round(b[0].start / 200), b[1].start))
out = np.array(im)
out[..., 3] = np.where(alpha, 255, 0) if a[..., 3].min() == 255 else out[..., 3]
pad = 16
for i, b in enumerate(boxes):
    y0, y1, x0, x1 = b[0].start - pad, b[0].stop + pad, b[1].start - pad, b[1].stop + pad
    tile = Image.fromarray(out[max(0, y0):y1, max(0, x0):x1].astype(np.uint8), 'RGBA')
    tile = tile.crop(tile.getbbox())
    tile.save(f'{outdir}/{prefix}{i + 1}.png')
    print(prefix, i + 1, tile.size)
