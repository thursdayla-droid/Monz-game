"""企画者の家具の絵(design/furniture/<シリーズ>_<種類>.png・白い背景)を切り抜いて、ゲーム用にする。
使い方: python3 design/furniture/make_furniture.py
- 白い背景(ふちからつながっている白)だけを透明にする。絵は描き直さない
- 余白を切って、横幅 MAX_W までに縮め、public/assets/furniture/<名前>.webp に書き出す
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'design', 'minigame'))
from cutout import cut_white  # noqa: E402
from PIL import Image  # noqa: E402

MAX_W = 640
OUT = os.path.join(ROOT, 'public', 'assets', 'furniture')

os.makedirs(OUT, exist_ok=True)
for path in sorted(glob.glob(os.path.join(HERE, '*.png'))):
    name = os.path.splitext(os.path.basename(path))[0]
    im = cut_white(path)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, f'{name}.webp'), quality=90, method=6)
    print(name, im.size)
