"""
誕生シーンの素材を、企画者の画像(design/birth/*.png)から切り出して public/assets/birth/ に書き出す。
- 絵は描き直さない。切り分け・縮小・形式の変換だけ。
- ドラゴンは「体・手前の翼・奥の翼」の3枚に分ける(羽ばたかせるため)。
  翼の付け根は体の側にも少し残し、翼を動かしてもすき間が見えないようにする。
- 籠は「籠の手前のふち」だけを別の絵にして、卵とMONZを籠の中に入れて見せる。
使い方: python3 design/birth/make_assets.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'birth')
LAYOUT = os.path.join(HERE, '..', '..', 'src', 'render', 'birthLayout.json')
# スマホで読み込みを軽くするため WebP にする(背景は少し圧縮、切り抜きは高画質)
BG_Q = 84
PART_Q = 90
os.makedirs(OUT, exist_ok=True)

DRAGON_SCALE = 0.6
# 手前の翼 / 奥の翼の範囲(元画像の座標)と、羽ばたきの中心
NEAR_WING = [(740, 0), (1536, 0), (1536, 450), (1300, 600), (1150, 645), (960, 605), (905, 560), (880, 420), (800, 390), (740, 380)]
FAR_WING = [(0, 250), (560, 250), (560, 440), (520, 540), (480, 620), (0, 620)]
NEAR_PIVOT = (900, 560)
FAR_PIVOT = (530, 520)
# 卵をつかむ前足のあたり(卵の中心をここに置く)
CLAW = (705, 880)
# 体の側に残す翼の付け根の半径(元画像の px)
OVERLAP = 90
# 籠の手前のふちの上の線(元画像の座標)
RIM = [(0, 960), (100, 1020), (200, 1052), (300, 1078), (400, 1092), (500, 1100), (550, 1092), (625, 1092), (700, 1100), (800, 1082), (900, 1050), (960, 1020), (1024, 990)]
RIM_TOP = 940
# 籠の中で卵・MONZの足元を置く位置(元画像の座標)
NEST = (512, 1075)


def poly_mask(size, pts, shift=(0, 0)):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x + shift[0], y + shift[1]) for x, y in pts], fill=255)
    return np.array(m) > 0


def dragon():
    im = Image.open(os.path.join(HERE, 'dragon.png')).convert('RGBA')
    a = np.array(im)
    size = im.size
    near = poly_mask(size, NEAR_WING)
    far = poly_mask(size, FAR_WING)
    # 体: 翼を抜く。ただし付け根(羽ばたきの中心のまわり)は体の側にも残す
    yy, xx = np.mgrid[0 : size[1], 0 : size[0]]
    def around(p):
        return (xx - p[0]) ** 2 + (yy - p[1]) ** 2 < OVERLAP**2
    body = ~(near | far) | (near & around(NEAR_PIVOT)) | (far & around(FAR_PIVOT))
    parts = {'body': body, 'wing_near': near, 'wing_far': far}
    w, h = round(size[0] * DRAGON_SCALE), round(size[1] * DRAGON_SCALE)
    for name, keep in parts.items():
        p = a.copy()
        p[..., 3] = np.where(keep, p[..., 3], 0)
        Image.fromarray(p).resize((w, h), Image.LANCZOS).save(os.path.join(OUT, f'dragon_{name}.webp'), quality=PART_Q, method=6)
    s = DRAGON_SCALE
    return {
        'w': w,
        'h': h,
        'nearPivot': [NEAR_PIVOT[0] * s, NEAR_PIVOT[1] * s],
        'farPivot': [FAR_PIVOT[0] * s, FAR_PIVOT[1] * s],
        'claw': [CLAW[0] * s, CLAW[1] * s],
    }


def egg():
    im = Image.open(os.path.join(HERE, 'egg.png')).convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    h = 440
    w = round(im.width * h / im.height)
    im.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, 'egg.webp'), quality=PART_Q, method=6)
    return {'w': w, 'h': h}


def basket():
    im = Image.open(os.path.join(HERE, 'basket.png')).convert('RGB')
    im.save(os.path.join(OUT, 'basket.webp'), quality=BG_Q, method=6)
    pts = RIM + [(1024, 1536), (0, 1536)]
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2))
    front = im.convert('RGBA')
    front.putalpha(m)
    front.crop((0, RIM_TOP, im.width, im.height)).save(os.path.join(OUT, 'basket_front.webp'), quality=BG_Q, method=6)
    return {'w': im.width, 'h': im.height, 'frontTop': RIM_TOP, 'nest': list(NEST)}


def sky():
    im = Image.open(os.path.join(HERE, 'sky.png')).convert('RGB')
    im.save(os.path.join(OUT, 'sky.webp'), quality=BG_Q, method=6)
    return {'w': im.width, 'h': im.height}


if __name__ == '__main__':
    for n in os.listdir(OUT):
        os.remove(os.path.join(OUT, n))
    info = {'dragon': dragon(), 'egg': egg(), 'basket': basket(), 'sky': sky()}
    with open(LAYOUT, 'w') as f:
        json.dump(info, f, indent=2)
    for n in sorted(os.listdir(OUT)):
        print(n, os.path.getsize(os.path.join(OUT, n)) // 1024, 'KB')
