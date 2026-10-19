"""
企画者のアイコン画像(design/home/icons.png・7つ横並び・背景透明)を1つずつ切り分けて
public/assets/home/icons/ に書き出す。絵は描き直さない(切り分け・縮小だけ)。
使い方: python3 design/home/make_icons.py
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'home', 'icons')
NAMES = ['food', 'minigame', 'pet', 'battle', 'shop', 'settings', 'coin']
SIZE = 256

im = Image.open(os.path.join(HERE, 'icons.png')).convert('RGBA')
a = np.array(im)
cols = (a[..., 3] > 20).any(0)
runs, start = [], None
for x, c in enumerate(cols):
    if c and start is None:
        start = x
    if not c and start is not None:
        runs.append((start, x))
        start = None
if start is not None:
    runs.append((start, len(cols)))
assert len(runs) == len(NAMES), runs
os.makedirs(OUT, exist_ok=True)
for name, (x0, x1) in zip(NAMES, runs):
    piece = im.crop((x0, 0, x1, im.height))
    piece = piece.crop(piece.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    side = max(piece.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(piece, ((side - piece.width) // 2, (side - piece.height) // 2))
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{name}.webp'), quality=90, method=6)
    print(name, piece.size)
