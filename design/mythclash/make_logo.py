"""MYTHCLASH のロゴを、企画者の新しいロゴ(design/mythclash/logo.png)に差しかえた絵を作る(企画者 2026-10-26)。
使い方: python3 -I design/mythclash/make_logo.py  (このあと make_pack.py)
- 元の絵(title.png)はそのまま残す。差しかえた絵は title_logo.png
- パックは 2026-10-26 に新しいロゴ入りの絵をもらったので、ここでは作らない(make_pack.py。前のパックの絵は unused/)
- 新しいロゴを、前のロゴ(英字の所)にぴったり重ねる。下に少しだけ暗いかげを入れて、前のロゴのふちが見えないようにする
- 「ミスクラッシュ」の文字は消す(企画者 2026-10-26)。前のロゴの残る所(カタカナの帯など)は、まわりの絵からうめる(OpenCV の inpaint)
- ゲーム用のタイトル(public/assets/mythclash/title.webp)もここで作る
"""
import os
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
logo = Image.open(os.path.join(HERE, 'logo.png')).convert('RGBA')
logo = logo.crop(logo.getbbox())

# 前のロゴ(英字の所)の左はし・右はし・上(王冠の先)。絵の座標
PLACES = {
    # erase: 前のロゴの、新しいロゴで隠れない所(カタカナの帯・下のふち)。絵の座標の多角形
    'title': {'src': 'title.png', 'out': 'title_logo.png', 'x0': 55, 'x1': 800, 'y0': 532,
              'erase': [(40, 700), (815, 700), (815, 800), (700, 836), (560, 862), (330, 862), (220, 845), (40, 840)],
              # うめた所が目立たないように、ロゴの下にやわらかい暗いかげ(中心x, 中心y, 横の半径, 縦の半径, こさ)
              'plate': (427, 795, 500, 105, 0.95)},
}


def compose(name: str) -> Image.Image:
    p = PLACES[name]
    base = Image.open(os.path.join(HERE, p['src'])).convert('RGBA')
    w = p['x1'] - p['x0']
    h = round(logo.height * w / logo.width)
    lg = logo.resize((w, h), Image.LANCZOS)
    # 前のロゴの残る所を、まわりの絵からうめる(新しいロゴの形を少し太らせた所もいっしょに)
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).polygon(p['erase'], fill=255)
    cover = Image.new('L', base.size, 0)
    cover.paste(lg.split()[3].filter(ImageFilter.MaxFilter(21)), (p['x0'], p['y0']))
    mask = Image.fromarray(np.maximum(np.asarray(mask), np.asarray(cover)))
    rgb = cv2.cvtColor(np.asarray(base.convert('RGB')), cv2.COLOR_RGB2BGR)
    filled = cv2.inpaint(rgb, np.asarray(mask), 9, cv2.INPAINT_TELEA)
    base = Image.fromarray(cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)).convert('RGBA')
    cx, cy, rx, ry, k = p['plate']
    plate = Image.new('L', base.size, 0)
    ImageDraw.Draw(plate).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=int(255 * k))
    plate = plate.filter(ImageFilter.GaussianBlur(40))
    dark = Image.new('RGBA', base.size, (10, 3, 6, 0))
    dark.putalpha(plate)
    base.alpha_composite(dark)
    # かげ: ロゴの形を少し太らせて、ぼかす
    a = lg.split()[3].filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(6))
    shade = Image.new('RGBA', lg.size, (8, 2, 4, 0))
    shade.putalpha(a.point(lambda v: int(v * 0.85)))
    base.alpha_composite(shade, (p['x0'], p['y0']))
    base.alpha_composite(lg, (p['x0'], p['y0']))
    out = base.convert('RGB')
    out.save(os.path.join(HERE, p['out']))
    return out


title = compose('title')
dst = os.path.join(ROOT, 'public', 'assets', 'mythclash', 'title.webp')
title.save(dst, 'WEBP', quality=88, method=6)
print('ok', title.size, os.path.getsize(dst))
if len(sys.argv) > 1:
    title.crop((0, 450, 852, 900)).save(sys.argv[1] + '_t.png')
