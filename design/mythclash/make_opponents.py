"""
対戦相手の顔の絵(企画者が ChatGPT で描いた絵。design/mythclash/opponents/<id>.png)を、ゲームで使う形にする(2026-10-27)。
- 顔のまわりを正方形に切り出して、384×384 にする → public/assets/mythclash/opponents/<id>.webp
  (ゲームでは丸く切り取って出す。src/ui/opponentFace.ts)
- 切り出す所(元の絵の座標 x0, y0, 一辺)は CROPS に書く。書いていない絵は、まん中より少し上を切り出す
- id: t<階>-<戦い>(t1-3 = 1階のボス)、b-weak / b-normal / b-strong(バトルモード)
絵そのものは描き直さない。
使い方: python3 -I design/mythclash/make_opponents.py
"""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'opponents')
OUT = os.path.join(ROOT, 'public/assets/mythclash/opponents')
SIZE = 384

CROPS = {
    't1-1': (270, 0, 860),
    't1-2': (170, 0, 860),
    't1-3': (220, 0, 820),
    't2-1': (210, 0, 860),
    't2-2': (230, 0, 860),
    't2-3': (220, 0, 860),
    't3-1': (220, 0, 860),
    't3-2': (230, 0, 860),
    't3-3': (290, 0, 900),
}

os.makedirs(OUT, exist_ok=True)
for path in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    oid = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path).convert('RGB')
    w, h = im.size
    if oid in CROPS:
        x0, y0, side = CROPS[oid]
    else:
        side = int(min(w, h) * 0.65)
        x0, y0 = (w - side) // 2, max(0, int(h * 0.3) - side // 2)
    x0 = max(0, min(w - side, x0))
    y0 = max(0, min(h - side, y0))
    im.crop((x0, y0, x0 + side, y0 + side)).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{oid}.webp'), 'WEBP', quality=82, method=6)
    print(oid, (x0, y0, side))
