"""MYTHCLASH のロゴを、企画者の新しいロゴ(design/mythclash/logo.png)に差しかえた絵を作る(企画者 2026-10-26)。
使い方: python3 -I design/mythclash/make_logo.py  (このあと make_pack.py)
- 元の絵(title.png・pack.png)はそのまま残す。差しかえた絵は title_logo.png・pack_logo.png
- 新しいロゴを、前のロゴ(英字の所)にぴったり重ねる。下に少しだけ暗いかげを入れて、前のロゴのふちが見えないようにする
- 「ミスクラッシュ」の文字は、新しいロゴに無いので、前の絵のまま残る【仮】(消すかは企画者に確認)
- ゲーム用のタイトル(public/assets/mythclash/title.webp)もここで作る
"""
import os
import sys
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
logo = Image.open(os.path.join(HERE, 'logo.png')).convert('RGBA')
logo = logo.crop(logo.getbbox())

# 前のロゴ(英字の所)の左はし・右はし・上(王冠の先)。絵の座標
PLACES = {
    'title': {'src': 'title.png', 'out': 'title_logo.png', 'x0': 55, 'x1': 800, 'y0': 532},
    'pack': {'src': 'pack.png', 'out': 'pack_logo.png', 'x0': 190, 'x1': 838, 'y0': 668},
}


def compose(name: str) -> Image.Image:
    p = PLACES[name]
    base = Image.open(os.path.join(HERE, p['src'])).convert('RGBA')
    w = p['x1'] - p['x0']
    h = round(logo.height * w / logo.width)
    lg = logo.resize((w, h), Image.LANCZOS)
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
compose('pack')
dst = os.path.join(ROOT, 'public', 'assets', 'mythclash', 'title.webp')
title.save(dst, 'WEBP', quality=88, method=6)
print('ok', title.size, os.path.getsize(dst))
if len(sys.argv) > 1:
    title.crop((0, 450, 852, 900)).save(sys.argv[1] + '_t.png')
    Image.open(os.path.join(HERE, 'pack_logo.png')).crop((120, 560, 900, 1020)).save(sys.argv[1] + '_p.png')
