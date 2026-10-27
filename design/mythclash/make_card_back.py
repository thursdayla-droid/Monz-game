"""
MYTHCLASH のカードの裏面(企画者の絵 card_back.png 2026-10-27)を、ゲームで使う形にする。
- 絵のまわりのチェック柄(とうめいの見本の模様。本当のとうめいではない)を消して、角の丸いカードの形に切り抜く
  → public/assets/mythclash/card_back.webp(300×420 のカードと同じ縦横の割合にはしない。絵の割合のまま)
絵そのものは描き直さない。
使い方: python3 -I design/mythclash/make_card_back.py
"""
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public/assets/mythclash')

im = Image.open(os.path.join(HERE, 'card_back.png')).convert('RGB')
a = np.array(im).astype(int)
# チェック柄は 白と うすい灰色(色がない・明るい)。それ以外がカード
card = ~((a.mean(axis=2) > 200) & ((a.max(axis=2) - a.min(axis=2)) < 18))
rows = np.nonzero(card.mean(axis=1) > 0.5)[0]
cols = np.nonzero(card.mean(axis=0) > 0.5)[0]
x0, x1, y0, y1 = cols[0], cols[-1] + 1, rows[0], rows[-1] + 1
print('card', x0, y0, x1, y1)
crop = im.crop((x0, y0, x1, y1)).convert('RGBA')
w, h = crop.size
# 角の丸いマスク(なめらかにするため4倍で描いて縮める)
s = 4
m = Image.new('L', (w * s, h * s), 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, w * s - 1, h * s - 1), radius=34 * s, fill=255)
crop.putalpha(m.resize((w, h), Image.LANCZOS))
out = crop.resize((round(w * 420 / h), 420), Image.LANCZOS)
out.save(os.path.join(OUT, 'card_back.webp'), 'WEBP', quality=85, method=6)
print('size', out.size)
