"""企画者の家具の絵(design/furniture/<シリーズ>_<種類>.png・白い背景)を切り抜いて、ゲーム用にする。
使い方: python3 design/furniture/make_furniture.py [名前 ...](名前を書くと、その絵だけ作り直す)
- 白い背景(ふちからつながっている白)だけを透明にする。絵は描き直さない
- 余白を切って、横幅 MAX_W までに縮め、public/assets/furniture/<名前>.webp に書き出す
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'design', 'minigame'))
from cutout import cut_white  # noqa: E402
from PIL import Image  # noqa: E402
import numpy as np  # noqa: E402
from scipy import ndimage  # noqa: E402

MAX_W = 640
OUT = os.path.join(ROOT, 'public', 'assets', 'furniture')

# 線に囲まれていても、向こうが見えるすきま(テーブルの天板と下の段の間・脚の間など)。
# 元の絵の中の範囲(上, 下, 左, 右)。この中に収まっている真っ白な所だけ透明にする(天板の白い模様などは残す)
# 企画者の指示(2026-10-22): テーブルの1段目と2段目の間の白い所は、後ろが見えるように
HOLES = {
    'vip_table': [(440, 560, 240, 720), (440, 560, 1040, 1540)],
    'street_table': [(560, 660, 150, 240), (560, 650, 1310, 1390)],
    'pop_table': [(500, 610, 180, 270), (500, 610, 1500, 1590)],
    'cyber_table': [(460, 560, 210, 290), (460, 560, 1490, 1560)],
    'cyber_table_turn': [(980, 1090, 200, 260), (980, 1090, 760, 830)],
}


def cut_holes(im: Image.Image, boxes) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(int)
    white = (a.min(2) > 243) & (a.max(2) - a.min(2) < 10)
    labels, _ = ndimage.label(white)
    alpha = np.asarray(im.getchannel('A')).copy()
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is None:
            continue
        for y0, y1, x0, x1 in boxes:
            if sl[0].start >= y0 and sl[0].stop <= y1 and sl[1].start >= x0 and sl[1].stop <= x1:
                # ふちを少し広げて、白いにじみが残らないようにする
                hole = ndimage.binary_dilation(labels == i, iterations=2)
                alpha[hole] = 0
    out = im.copy()
    out.putalpha(Image.fromarray(alpha))
    return out


os.makedirs(OUT, exist_ok=True)
only = set(sys.argv[1:])
for path in sorted(glob.glob(os.path.join(HERE, '*.png'))):
    name = os.path.splitext(os.path.basename(path))[0]
    if only and name not in only:
        continue
    im = cut_white(path)
    if name in HOLES:
        im = cut_holes(im, HOLES[name])
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, f'{name}.webp'), quality=90, method=6)
    print(name, im.size)
