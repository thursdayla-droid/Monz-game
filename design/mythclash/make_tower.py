"""
ストーリーモード(タワー)の絵を、ゲームで使う形にする(企画者の新しい絵 tower.png 941x1672・2026-10-27。前の絵は unused/)。
- 背景 → public/assets/mythclash/tower.webp(絵のまま。札は全部 暗い色で、鍵・光は描いていない)
- 部品 → public/assets/mythclash/tower_parts.webp(横にならべた1枚):
  鍵マーク(前の絵の鍵。背景はとうめい)・1階〜9階の「光った札」(元の札の色を金色にしたもの)
  部品の位置は、このとき出る数字を MythTowerScene の FRAMES に書く
絵そのものは描き直さない。元の絵のピクセルを使い、色を変えるだけ。
使い方: python3 -I design/mythclash/make_tower.py
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public/assets/mythclash')

# 各階の札(絵の座標 x0, y0, x1, y1)
PLATES = {
    10: (375, 420, 575, 505),
    9: (377, 515, 573, 600),
    8: (376, 613, 574, 698),
    7: (375, 712, 575, 798),
    6: (374, 810, 576, 898),
    5: (372, 910, 578, 998),
    4: (370, 1010, 580, 1100),
    3: (368, 1112, 582, 1200),
    2: (366, 1212, 584, 1302),
    1: (364, 1312, 586, 1405),
}

img = np.array(Image.open(os.path.join(HERE, 'tower.png')).convert('RGB'))
Image.fromarray(img).save(os.path.join(OUT, 'tower.webp'), 'WEBP', quality=80, method=6)

# 鍵マーク: 前の絵(unused/)の5階の鍵。明るさを そのまま不透明度にする
old = np.array(Image.open(os.path.join(HERE, 'unused/tower_2026-10-27_old.png')).convert('RGB'))
x0, y0, x1, y1 = 335, 1045, 535, 1135
cx = (x0 + x1) // 2
reg = old[y0 + 12:y1 - 12, cx + 25:x1 - 14].astype(int)
m = (reg.mean(axis=2) > 95) & ((reg.max(axis=2) - reg.min(axis=2)) < 60)
ys, xs = np.nonzero(m)
pad = 6
ly0, ly1 = max(0, ys.min() - pad), ys.max() + 1 + pad
lx0, lx1 = max(0, xs.min() - pad), xs.max() + 1 + pad
lock_rgb = reg[ly0:ly1, lx0:lx1].astype(float)
alpha = np.clip((lock_rgb.mean(axis=2) - 45) / 70, 0, 1)
lock = np.dstack([lock_rgb, alpha * 255]).astype(np.uint8)


def lit(f: int) -> np.ndarray:
    """札を金色に光らせる(暗い所はあたたかい色で暗いまま、明るい所(わく・文字)ほど金色に)"""
    x0, y0, x1, y1 = PLATES[f]
    p = img[y0:y1, x0:x1].astype(float) / 255
    l = p.mean(axis=2, keepdims=True)
    gold = np.array([1.0, 0.80, 0.42])
    out = np.clip(p * np.array([1.25, 0.95, 0.65]) + gold * np.clip(l - 0.25, 0, 1) * 2.4, 0, 1)
    return np.dstack([out * 255, np.full(l.shape, 255.0)]).astype(np.uint8)


parts = {'lock': lock}
for f in range(1, 10):
    parts[f'lit{f}'] = lit(f)

gap = 2
w = sum(p.shape[1] + gap for p in parts.values())
h = max(p.shape[0] for p in parts.values())
sheet = np.zeros((h, w, 4), np.uint8)
frames = {}
x = 0
for k, p in parts.items():
    sheet[:p.shape[0], x:x + p.shape[1]] = p
    frames[k] = [x, 0, p.shape[1], p.shape[0]]
    x += p.shape[1] + gap
Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'tower_parts.webp'), 'WEBP', quality=85, method=6)
print(json.dumps({'plates': {str(k): v for k, v in PLATES.items()}, 'frames': frames}))
