"""
カードの絵に、属性のしるしを入れる(企画者 2026-11-01)。make_cards.py から使う。
- dark_magic: 魔法の欄の闇のしるし(紫の目)は、ステータスの「魔」のしるしと同じ形なので、三日月に差しかえる
- element_tag: カードの属性がわかるように、絵の右下に しるし＋文字の札を入れる
座標は 1064×1478 の絵のもの
"""
import cv2
import numpy as np
from PIL import Image

import element_icons


def _magenta(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
    return ((hsv[..., 0] > 118) & (hsv[..., 0] < 172) & (hsv[..., 1] > 70) & (hsv[..., 2] > 110)) | ((hsv[..., 1] < 50) & (hsv[..., 2] > 200))


def dark_magic(img: np.ndarray) -> np.ndarray:
    """img: 1064×1478 の RGB。魔法の欄の「闇」の字の左にある しるしを、三日月にかえる"""
    # 「闇」の字(右がわの明るい紫のかたまり)をさがす
    X0, Y0, X1, Y1 = 860, 1085, 1000, 1205
    m = _magenta(img[Y0:Y1, X0:X1]).astype(np.uint8)
    n, _, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((5, 5), np.uint8)))
    best = max((i for i in range(1, n) if 20 < st[i][2] < 80 and 20 < st[i][3] < 80), key=lambda i: st[i][4], default=None)
    if best is None:
        return img
    kx, ky, kw, kh = X0 + st[best][0], Y0 + st[best][1], st[best][2], st[best][3]
    cy = ky + kh // 2
    # 札のわく(字の左がわ): 横の線(上と下)と、左のたての線をさがす
    bx0, by0, bx1, by1 = kx - int(kh * 3.0), cy - int(kh * 1.5), kx - 4, cy + int(kh * 1.5)
    reg = img[by0:by1, bx0:bx1]
    hsv = cv2.cvtColor(reg, cv2.COLOR_RGB2HSV)
    pm = ((hsv[..., 0] > 110) & (hsv[..., 0] < 175) & (hsv[..., 1] > 60) & (hsv[..., 2] > 80)).astype(np.uint8)
    hl = cv2.morphologyEx(pm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (int(kh * 1.2), 1)))
    vl = cv2.morphologyEx(pm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, int(kh * 0.5))))
    mid = cy - by0
    rows = np.where(hl.any(axis=1))[0]
    top = max([r for r in rows if r < mid - kh * 0.6], default=int(mid - kh * 0.95))
    bot = min([r for r in rows if r > mid + kh * 0.6], default=int(mid + kh * 0.95))
    band = vl[max(0, top):bot]
    cols = np.where(band.any(axis=0))[0]
    left = min([c for c in cols if c < reg.shape[1] - kh * 1.9], default=int(reg.shape[1] - kh * 2.4))
    # わくの内がわ(しるしのある所)を、札の中の暗い色でぬる(わくの線から少しはなす)
    x0, x1, y0, y1 = left + 7, reg.shape[1] - 2, top + 6, bot - 5
    inner = reg[y0:y1, x0:x1].reshape(-1, 3)
    dark = inner[inner.sum(axis=1) < 90]
    bg = np.median(dark, axis=0) if len(dark) else np.array([12, 6, 16])
    out = img.copy()
    sub = out[by0:by1, bx0:bx1]
    paint = np.zeros(reg.shape[:2], np.float32)
    paint[y0:y1, x0:x1] = 1
    paint = cv2.GaussianBlur(paint, (5, 5), 0)[..., None]
    sub[:] = (sub * (1 - paint) + bg * paint).astype(np.uint8)
    ix0, ix1, iy0, iy1 = x0, x1, y0, y1
    size = int(min(y1 - y0, kh * 1.45))
    cx, cy2 = bx0 + (x0 + x1) // 2, by0 + (y0 + y1) // 2
    # 三日月をおく(もとのしるしと同じくらいの大きさ)
    ic = element_icons.icon('闇', size)
    im = Image.fromarray(out).convert('RGBA')
    im.alpha_composite(ic, (int(cx) - size // 2, int(cy2) - size // 2))
    return np.array(im.convert('RGB'))


def element_tag(img: np.ndarray, element: str) -> np.ndarray:
    """絵の窓の左上(番号の札の下)に、カードの属性の札(しるし＋文字)"""
    tag = element_icons.element_tag(element, 104)
    im = Image.fromarray(img).convert('RGBA')
    im.alpha_composite(tag, (60, 130))
    return np.array(im.convert('RGB'))
