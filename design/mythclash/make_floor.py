"""
ストーリーモードの「階に入ったときの画面」(企画者の新しい絵 floor.png 941x1672・2026-10-27。前の絵は unused/)を、ゲームで使う形にする。
- 背景 → public/assets/mythclash/floor.webp(「敵チーム」の文字だけ消す。「第　階層」の数字は空いていて、玉は光っていない。あなたのチームの枠の中は空)
- 部品 → public/assets/mythclash/floor_parts.webp: 光った玉(前の絵の1戦目の玉。まわりはとうめい)
絵そのものは描き直さない。
使い方: python3 -I design/mythclash/make_floor.py
"""
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public/assets/mythclash')

img = np.array(Image.open(os.path.join(HERE, 'floor.png')).convert('RGB'))
# 「敵チーム」の文字を消す(相手の名前「○○のチーム」を ゲームの中で書く。企画者 2026-10-27: 戦う前に どんな相手かわかるように)
x0, y0, x1, y1 = 400, 432, 546, 478
mask = np.zeros(img.shape[:2], np.uint8)
mask[y0:y1, x0:x1] = (img[y0:y1, x0:x1].mean(axis=2) > 140).astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=3)
img = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, 6, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
Image.fromarray(img).save(os.path.join(OUT, 'floor.webp'), 'WEBP', quality=80, method=6)

# 光った玉: 前の絵の1戦目の玉(中心 288,222)
old = np.array(Image.open(os.path.join(HERE, 'unused/floor_2026-10-27_old.png')).convert('RGB'))
cx, cy, r = 288, 222, 36
yy, xx = np.mgrid[-r:r, -r:r]
d = np.sqrt(xx**2 + yy**2)
orb = old[cy - r:cy + r, cx - r:cx + r].astype(float)
alpha = np.clip((r - d) / 10, 0, 1) * np.clip((orb.mean(axis=2) / 255 - 0.12) * 2.5, 0, 1)
Image.fromarray(np.dstack([orb, alpha * 255]).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'floor_parts.webp'), 'WEBP', quality=90, method=6)
print('ok')
