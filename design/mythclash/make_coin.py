"""
コイントスのコインの表面(企画者の絵 coin_front.png 2026-10-27)を、ゲームで使う形にする。
- まわりのチェック柄(とうめいの見本の模様。本当のとうめいではない)を消す:
  外側からつながっている「白・うすい灰色」の所だけを消し、いちばん大きいかたまり(コイン)を残す
- 256×256 → public/assets/mythclash/coin_front.webp
絵そのものは描き直さない。
使い方: python3 -I design/mythclash/make_coin.py
"""
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public/assets/mythclash')

im = Image.open(os.path.join(HERE, 'coin_front.png')).convert('RGB')
a = np.array(im).astype(int)
checker = ((a.mean(axis=2) > 185) & ((a.max(axis=2) - a.min(axis=2)) < 22)).astype(np.uint8)
# 外側からつながったチェック柄だけ(コインの中の白い光は残す)
h, w = checker.shape
n, lab = cv2.connectedComponents(checker, connectivity=4)
outside = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(outside))
fg = (~bg).astype(np.uint8)
# いちばん大きいかたまり + 穴うめ
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
mask = (lab == big).astype(np.uint8) * 255
cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
mask = np.zeros_like(mask)
cv2.drawContours(mask, cnts, -1, 255, -1)
mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)
mask = cv2.GaussianBlur(mask, (5, 5), 0)
ys, xs = np.nonzero(mask > 10)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
rgba = np.dstack([a.astype(np.uint8), mask])
out = Image.fromarray(rgba, 'RGBA').crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)).resize((256, 256), Image.LANCZOS)
out.save(os.path.join(OUT, 'coin_front.webp'), 'WEBP', quality=88, method=6)
print('ok', side)
