"""
ストーリーモードの「階に入ったときの画面」(企画者の新しい絵 floor.png 941x1672・2026-10-27。前の絵は unused/)を、ゲームで使う形にする。
- 背景 → public/assets/mythclash/floor.webp(絵のまま。「第　階層」の数字は空いていて、玉は光っていない。あなたのチームの枠の中は空)
- 部品 → public/assets/mythclash/floor_parts.webp: 光った玉(前の絵の1戦目の玉。まわりはとうめい)
絵そのものは描き直さない。
使い方: python3 -I design/mythclash/make_floor.py
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public/assets/mythclash')

Image.open(os.path.join(HERE, 'floor.png')).convert('RGB').save(os.path.join(OUT, 'floor.webp'), 'WEBP', quality=80, method=6)

# 光った玉: 前の絵の1戦目の玉(中心 288,222)
old = np.array(Image.open(os.path.join(HERE, 'unused/floor_2026-10-27_old.png')).convert('RGB'))
cx, cy, r = 288, 222, 36
yy, xx = np.mgrid[-r:r, -r:r]
d = np.sqrt(xx**2 + yy**2)
orb = old[cy - r:cy + r, cx - r:cx + r].astype(float)
alpha = np.clip((r - d) / 10, 0, 1) * np.clip((orb.mean(axis=2) / 255 - 0.12) * 2.5, 0, 1)
Image.fromarray(np.dstack([orb, alpha * 255]).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'floor_parts.webp'), 'WEBP', quality=90, method=6)
print('ok')
