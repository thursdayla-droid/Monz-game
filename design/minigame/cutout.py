"""ミニゲームの絵の切り抜きで共通に使う関数"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def checker(a):
    """白と薄い灰色のチェック柄(色がほとんどなく明るい)"""
    return (a.max(2) - a.min(2) < 18) & (a.mean(2) > 200)


def cut_checker(path: str) -> Image.Image:
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    bg = checker(a)
    labels, n = ndimage.label(bg)
    sizes = ndimage.sum(np.ones_like(labels), labels, range(n + 1))
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    # 体に囲まれた大きな所は、チェック柄(白と灰色が混ざる)のときだけ消す。真っ白な所(目・×印・おばけ)は絵なので残す
    grey_tile = (a.mean(2) < 228)
    big = set()
    for i in range(1, n + 1):
        if sizes[i] > 3000 and i not in border:
            frac = grey_tile[labels == i].mean()
            if 0.2 < frac < 0.8:
                big.add(i)
    remove = np.isin(labels, list(border | big))
    keep = ~remove
    # 残った細かい点(チェック柄の切れはし)を消す
    labels2, _ = ndimage.label(keep)
    for i, sl in enumerate(ndimage.find_objects(labels2), start=1):
        if sl is not None and int((labels2[sl] == i).sum()) < 400:
            keep[sl][labels2[sl] == i] = False
    alpha = Image.fromarray(np.where(keep, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
