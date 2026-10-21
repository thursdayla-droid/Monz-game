"""
企画者のBUNKの姿の画像(design/bunk/poses/*.png)を、ゲーム用に切り抜いて public/assets/bunk/poses/ に書き出す。
絵は描き直さない(背景を消す・縮小するだけ)。
- 背景が本当に透明な画像は、そのまま使う
- 背景に「透明を表すチェック柄」が描きこまれている画像は、ふちからつながっている灰色の所(と、体に囲まれた大きな灰色の所)を消す
使い方: python3 design/bunk/poses/make_poses.py [姿の名前 ...](名前を書いたらその姿だけ作り直す)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'public', 'assets', 'bunk', 'poses')
NAMES = ['sit', 'sleep', 'stretch', 'look', 'hungry', 'sleepy']
# ゲームで使う高さ(px)。お世話画面では小さく出すので十分
HEIGHT = 520


# 2026-10-21 からの新しい絵(チェック柄が明るい灰色と白)。remove_checker_v2 で切り抜く
NEW_ART = {'hungry', 'look', 'sit'}


def remove_checker_v2(im: Image.Image) -> Image.Image:
    """ふちからつながっている、色のない明るい所(灰色と白のチェック柄)だけを消す。
    黒い線に囲まれた所(吹き出しの白・歯・目)は消さない。最後に、ちいさな消し残りを消す"""
    a = np.asarray(im.convert('RGB')).astype(int)
    sat = a.max(2) - a.min(2)
    val = a.mean(2)
    light = (sat < 28) & (val > 110)
    labels, _ = ndimage.label(light)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    bg = np.isin(labels, list(border))
    keep = ~bg
    labels2, _ = ndimage.label(keep)
    for i, sl in enumerate(ndimage.find_objects(labels2), start=1):
        if sl is not None and int((labels2[sl] == i).sum()) < 250:
            keep[sl][labels2[sl] == i] = False
    out = im.convert('RGBA')
    out.putalpha(Image.fromarray(np.where(keep, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
    return out


def remove_checker(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(int)
    sat = a.max(2) - a.min(2)
    val = a.mean(2)
    grey = (sat < 28) & (val > 70) & (val < 215)
    labels, n = ndimage.label(grey)
    sizes = ndimage.sum(np.ones_like(labels), labels, range(n + 1))
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    # ふちにつながる灰色 + 体に囲まれた大きな灰色(腕と体のすき間など)
    big = {i for i in range(1, n + 1) if sizes[i] > 1500}
    bg = np.isin(labels, list(border | big))
    # 消した所のまわりの細かいチェック柄の残りも消す
    bg = ndimage.binary_closing(bg, iterations=2) & (grey | bg)
    keep = ~bg
    # 残った細かい点・ふちの細い線を消す(絵の部分=キャラクター・Zの文字・吹き出しだけ残す)
    labels2, n2 = ndimage.label(keep)
    h, w = keep.shape
    for i, sl in enumerate(ndimage.find_objects(labels2), start=1):
        if sl is None:
            continue
        ys, xs = sl
        size = int((labels2[sl] == i).sum())
        touches = ys.start == 0 or xs.start == 0 or ys.stop == h or xs.stop == w
        thin = min(ys.stop - ys.start, xs.stop - xs.start) < 8
        if size < 250 or touches or thin:
            keep[sl][labels2[sl] == i] = False
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    out = im.convert('RGBA')
    out.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8)))
    return out


os.makedirs(OUT, exist_ok=True)
info_path = os.path.join(OUT, 'poses.json')
info = json.load(open(info_path)) if os.path.exists(info_path) else {}
for name in sys.argv[1:] or NAMES:
    im = Image.open(os.path.join(HERE, f'{name}.png'))
    has_alpha = im.mode == 'RGBA' and (np.asarray(im)[..., 3] < 10).mean() > 0.1
    rgba = im.convert('RGBA') if has_alpha else remove_checker_v2(im) if name in NEW_ART else remove_checker(im)
    rgba = rgba.crop(rgba.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    w = round(rgba.width * HEIGHT / rgba.height)
    rgba.resize((w, HEIGHT), Image.LANCZOS).save(os.path.join(OUT, f'{name}.webp'), quality=90, method=6)
    info[name] = {'w': w, 'h': HEIGHT}
    print(name, 'alpha' if has_alpha else 'checker removed', (w, HEIGHT))
with open(info_path, 'w') as f:
    json.dump(info, f, indent=2)
