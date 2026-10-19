"""
企画者の肉の画像(design/home/meat.png・白い背景)から、外側の白だけを透明にして
public/assets/home/meat.webp に書き出す。絵は描き直さない(切り抜き・縮小だけ)。
外側の白は、画像のふちからつながっている白い所だけを消す(肉の中の白いつやは残す)。
使い方: python3 design/home/make_meat.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'home', 'meat.webp')

im = Image.open(os.path.join(HERE, 'meat.png')).convert('RGB')
a = np.asarray(im).astype(int)
white = (a.min(2) > 225) & (a.max(2) - a.min(2) < 30)
labels, _ = ndimage.label(white)
border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
outside = np.isin(labels, list(border))
alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
rgba = im.convert('RGBA')
rgba.putalpha(alpha)
rgba = rgba.crop(rgba.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
w = 440
rgba.resize((w, round(rgba.height * w / rgba.width)), Image.LANCZOS).save(OUT, quality=90, method=6)
print(rgba.size, '->', w)
