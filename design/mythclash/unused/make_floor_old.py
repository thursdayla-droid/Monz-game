# 前の「階の画面」の絵(floor_2026-10-27_old.png)用。企画者の新しい絵に差しかえたので、もう使わない(2026-10-27)
"""
ストーリーモードの「階に入ったときの画面」(企画者の絵 floor.png 2026-10-27)を、ゲームで使う形にする。
- 背景 → public/assets/mythclash/floor.webp
  - 「第1階層」の「1」を消す(何階かは ゲームの中で書く)
  - 1戦目の光った玉を、2戦目と同じ灰色の玉にする(今の戦いの玉は ゲームの中で重ねる)
  - 「あなたのチーム」の3つの枠の中(見本の絵と属性のマーク)を暗くする(自分のデッキのカードを ゲームの中で入れる)
- 部品 → public/assets/mythclash/floor_parts.webp: 光った玉(1戦目の玉。まわりはとうめい)
絵そのものは描き直さない。元の絵のピクセルを使う。
使い方: python3 -I design/mythclash/make_floor.py
"""
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = HERE  # 前の絵用。もう使わない

DIGIT = (378, 120, 424, 186)
NODES = [(288, 222), (425, 222), (562, 218)]
ORB_R = 36
SLOTS = [(62, 1086, 276, 1366), (315, 1090, 532, 1370), (568, 1085, 785, 1365)]

img = np.array(Image.open(os.path.join(HERE, 'floor_2026-10-27_old.png')).convert('RGB'))
out = img.copy()

# 光った玉を取り出す(まわりはぼかしてとうめいに)
cx, cy = NODES[0]
yy, xx = np.mgrid[-ORB_R:ORB_R, -ORB_R:ORB_R]
d = np.sqrt(xx**2 + yy**2)
alpha = np.clip((ORB_R - d) / 10, 0, 1)
orb = img[cy - ORB_R:cy + ORB_R, cx - ORB_R:cx + ORB_R].astype(float)
# 光っていない所(暗い線)は、すけるように
lum = orb.mean(axis=2) / 255
alpha = alpha * np.clip((lum - 0.12) * 2.5, 0, 1)
orb_rgba = np.dstack([orb, alpha * 255]).astype(np.uint8)

# 1戦目の玉を、2戦目の玉(灰色)にする
nx, ny = NODES[1]
patch = img[ny - ORB_R:ny + ORB_R, nx - ORB_R:nx + ORB_R].astype(float)
a = np.clip((ORB_R - d) / 8, 0, 1)[..., None]
region = out[cy - ORB_R:cy + ORB_R, cx - ORB_R:cx + ORB_R].astype(float)
out[cy - ORB_R:cy + ORB_R, cx - ORB_R:cx + ORB_R] = (patch * a + region * (1 - a)).astype(np.uint8)

# 「1」を消す(金色の所)
x0, y0, x1, y1 = DIGIT
mask = np.zeros(img.shape[:2], np.uint8)
reg = img[y0:y1, x0:x1].astype(int)
gold = (reg[..., 0] > 120) & (reg[..., 0] - reg[..., 2] > 40)
mask[y0:y1, x0:x1] = gold.astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=3)
out = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(out, cv2.COLOR_RGB2BGR), mask, 6, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)

# チームの枠の中を暗く(上は少し赤く)
for x0, y0, x1, y1 in SLOTS:
    h = y1 - y0
    g = np.linspace(0, 1, h)[:, None, None]
    col = np.array([46, 12, 14]) * (1 - g) + np.array([14, 6, 8]) * g
    base = out[y0:y1, x0:x1].astype(float)
    out[y0:y1, x0:x1] = (col * 0.92 + base * 0.08).astype(np.uint8)

Image.fromarray(out).save(os.path.join(OUT, 'floor.webp'), 'WEBP', quality=80, method=6)
Image.fromarray(orb_rgba, 'RGBA').save(os.path.join(OUT, 'floor_parts.webp'), 'WEBP', quality=90, method=6)
print('ok')
