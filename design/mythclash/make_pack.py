"""MYTHCLASH のパックの絵(design/mythclash/pack.png・企画者の絵)の背景を消して、ゲーム用(public/assets/mythclash/pack.webp)にする。
使い方: python3 -I design/mythclash/make_pack.py
- 2026-10-26: 新しいパックの絵(新しいロゴ入り)に差しかえ。背景は透明ではなく、灰色と白のチェック柄が描いてあるので、
  外側につながっているチェック柄(明るい灰色・色が無い)だけを消す。パックの中の白い所(ロゴなど)は残す
- 前の絵は design/mythclash/unused/ に残した
- 大きさは変えない(まわりの余白だけ切る)
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
im = Image.open(os.path.join(HERE, 'pack.png')).convert('RGB')
a = np.asarray(im).astype(int)
checker = (a.min(2) > 165) & (a.max(2) - a.min(2) < 24)
labels, _ = ndimage.label(checker)
border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
keep = ~np.isin(labels, list(border))
# パック本体(いちばん大きいかたまり)だけを残す(チェック柄の切れはしを消す)。中の穴はうめる
labels2, n2 = ndimage.label(keep)
sizes = ndimage.sum(keep, labels2, range(1, n2 + 1))
keep = ndimage.binary_fill_holes(labels2 == (int(np.argmax(sizes)) + 1))
alpha = Image.fromarray(np.where(keep, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
out = im.convert('RGBA')
out.putalpha(alpha)
box = out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
out = out.crop(box)
os.makedirs(os.path.join(ROOT, 'public', 'assets', 'mythclash'), exist_ok=True)
dst = os.path.join(ROOT, 'public', 'assets', 'mythclash', 'pack.webp')
out.save(dst, 'WEBP', quality=88, alpha_quality=100, method=6)
print(out.size, box, os.path.getsize(dst), '->', dst)
