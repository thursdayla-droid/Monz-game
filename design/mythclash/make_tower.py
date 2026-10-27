"""
ストーリーモード(タワー)の絵を、ゲームで使う形にする(企画者の絵 tower.png 2026-10-27)。
- 3階〜9階の札にかいてある鍵マークを消した背景 → public/assets/mythclash/tower.webp
  (鍵は進み具合で出したり消したりするので、ゲームの中で重ねる)
- 部品 → public/assets/mythclash/tower_parts.webp(横にならべた1枚):
  鍵マーク(背景はとうめい)・3階〜9階の「光った札」(金色)・2階の「暗い札」(まだ行けないとき)
  部品の位置は tower_parts.json
絵そのものは描き直さない。元の絵のピクセルを使い、色を変えるだけ。
使い方: python3 -I design/mythclash/make_tower.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public/assets/mythclash')

# 各階の札(絵の座標 x0, y0, x1, y1)
PLATES = {
    10: (335, 475, 535, 550),
    9: (345, 580, 525, 665),
    8: (342, 695, 528, 780),
    7: (340, 810, 530, 900),
    6: (338, 927, 532, 1018),
    5: (335, 1045, 535, 1135),
    4: (332, 1165, 538, 1258),
    3: (330, 1285, 542, 1380),
    2: (318, 1405, 555, 1505),
    1: (315, 1525, 560, 1635),
}

src = Image.open(os.path.join(HERE, 'tower.png')).convert('RGB')
img = np.array(src)


def lock_mask(f: int) -> np.ndarray:
    """札の右の方の、明るい灰色(鍵)の所"""
    x0, y0, x1, y1 = PLATES[f]
    m = np.zeros(img.shape[:2], np.uint8)
    cx = (x0 + x1) // 2
    reg = img[y0 + 12:y1 - 12, cx + 25:x1 - 14].astype(int)
    lum = reg.mean(axis=2)
    sat = reg.max(axis=2) - reg.min(axis=2)
    m[y0 + 12:y1 - 12, cx + 25:x1 - 14] = ((lum > 95) & (sat < 60)).astype(np.uint8) * 255
    return cv2.dilate(m, np.ones((5, 5), np.uint8), iterations=2)


# 鍵マークを取り出す(5階の鍵。明るさをそのまま不透明度にする)
x0, y0, x1, y1 = PLATES[5]
m5 = lock_mask(5)
ys, xs = np.nonzero(m5)
lx0, ly0, lx1, ly1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
lock_rgb = img[ly0:ly1, lx0:lx1].astype(float)
lum = lock_rgb.mean(axis=2)
alpha = np.clip((lum - 45) / 70, 0, 1) * (m5[ly0:ly1, lx0:lx1] > 0)
lock = np.dstack([lock_rgb, alpha * 255]).astype(np.uint8)

# 3〜9階の鍵を消す
mask = np.zeros(img.shape[:2], np.uint8)
for f in range(3, 10):
    mask |= lock_mask(f)
clean = cv2.inpaint(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, 7, cv2.INPAINT_TELEA)
clean = cv2.cvtColor(clean, cv2.COLOR_BGR2RGB)
Image.fromarray(clean).save(os.path.join(OUT, 'tower.webp'), 'WEBP', quality=80, method=6)


def lit(f: int) -> np.ndarray:
    """札を金色に光らせる(明るい所ほど金色に。文字は白っぽい金)"""
    x0, y0, x1, y1 = PLATES[f]
    p = clean[y0:y1, x0:x1].astype(float) / 255
    l = p.mean(axis=2, keepdims=True)
    gold = np.array([1.0, 0.80, 0.42])
    # 暗い所はあたたかい色で暗いまま、明るい所(わく・文字)ほど金色に
    out = np.clip(p * np.array([1.25, 0.95, 0.65]) + gold * np.clip(l - 0.25, 0, 1) * 2.4, 0, 1)
    return np.dstack([out * 255, np.full(l.shape, 255.0)]).astype(np.uint8)


def dim(f: int) -> np.ndarray:
    """札を暗く(色をぬいて暗く)"""
    x0, y0, x1, y1 = PLATES[f]
    p = clean[y0:y1, x0:x1].astype(float)
    g = p.mean(axis=2, keepdims=True)
    out = (p * 0.15 + g * 0.85) * 0.45
    return np.dstack([out, np.full(g.shape, 255.0)]).astype(np.uint8)


parts = {'lock': lock}
for f in range(3, 10):
    parts[f'lit{f}'] = lit(f)
parts['dim2'] = dim(2)

# 横にならべて1枚に
pad = 2
w = sum(p.shape[1] + pad for p in parts.values())
h = max(p.shape[0] for p in parts.values())
sheet = np.zeros((h, w, 4), np.uint8)
frames = {}
x = 0
for k, p in parts.items():
    sheet[:p.shape[0], x:x + p.shape[1]] = p
    frames[k] = [x, 0, p.shape[1], p.shape[0]]
    x += p.shape[1] + pad
Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'tower_parts.webp'), 'WEBP', quality=85, method=6)
info = {'plates': {str(k): v for k, v in PLATES.items()}, 'frames': frames}
print(json.dumps(info))
