"""MYTHCLASH のパックの絵(design/mythclash/pack.png・企画者の絵)の黒い背景を消して、ゲーム用(public/assets/mythclash/pack.webp)にする。
使い方: python3 -I design/mythclash/make_pack.py
- 外側につながっている真っ黒な所だけ消す(パックの中の黒い模様は残す)。大きさは変えない(まわりの余白だけ切る)
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
im = Image.open(os.path.join(HERE, 'pack.png')).convert('RGB')
a = np.asarray(im).astype(int)
dark = a.max(2) < 26
labels, _ = ndimage.label(dark)
border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
bg = np.isin(labels, list(border))
alpha = Image.fromarray(((~bg) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
out = im.convert('RGBA')
out.putalpha(alpha)
box = out.getbbox()
out = out.crop(box)
os.makedirs(os.path.join(ROOT, 'public', 'assets', 'mythclash'), exist_ok=True)
dst = os.path.join(ROOT, 'public', 'assets', 'mythclash', 'pack.webp')
out.save(dst, 'WEBP', quality=88, alpha_quality=100, method=6)
print(out.size, box, os.path.getsize(dst), '->', dst)
