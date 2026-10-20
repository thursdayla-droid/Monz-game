"""
MONZ SLUGGER の企画者の絵を、ゲーム用に書き出す。絵は描き直さない(縮小だけ)。
- slugger_bg.png → slugger_bg.webp(球場の背景。画面の大きさ 720x1280 にそのまま合わせる)
使い方: python3 design/minigame/make_slugger_assets.py
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'minigame')

bg = Image.open(os.path.join(HERE, 'slugger_bg.png')).convert('RGB').resize((720, 1280), Image.LANCZOS)
bg.save(os.path.join(OUT, 'slugger_bg.webp'), quality=84, method=6)
print('slugger_bg.webp', bg.size)

# バッターロボット(企画者の絵 5ポーズ)。構えはもともと透明の背景、ほかは白い背景を消す。
# 絵ごとに大きさが少しちがうので、頭の幅(目で測った値)でそろえる。足元の位置(origin)を書き出す
import numpy as np  # noqa: E402

from cutout import cut_white  # noqa: E402

HEAD_W = {'idle': 640, 'swing': 540, 'hit': 560, 'homer': 540, 'whiff': 520}
TARGET_HEAD = 260
for name, head in HEAD_W.items():
    path = os.path.join(HERE, f'slug_batter_{name}.png')
    im = Image.open(path).convert('RGBA') if name == 'idle' else cut_white(path, shadow=True)
    box = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    im = im.crop(box)
    k = TARGET_HEAD / head
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 128)
    foot_y = ys.max()
    # 足元の横の位置: 下から4分の1の部分(両足が入る)のまん中
    low = ys > foot_y - (foot_y - ys.min()) * 0.25
    foot_x = xs[low].mean()
    im.save(os.path.join(OUT, f'slug_batter_{name}.webp'), quality=88, method=6)
    print(f"  {name}: {{ ox: {foot_x / im.width:.3f}, oy: {foot_y / im.height:.3f} }},  // {im.size}")

# ピッチャーロボット(企画者の絵 3ポーズ)。白い背景と足元の影を消し、頭の幅でそろえる
PITCHER_HEAD_W = {'ready': 480, 'windup': 460, 'throw': 440}
PITCHER_TARGET_HEAD = 130
for name, head in PITCHER_HEAD_W.items():
    im = cut_white(os.path.join(HERE, f'slug_pitcher_{name}.png'), shadow=True)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    k = PITCHER_TARGET_HEAD / head
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 128)
    foot_y = ys.max()
    low = ys > foot_y - (foot_y - ys.min()) * 0.25
    im.save(os.path.join(OUT, f'slug_pitcher_{name}.webp'), quality=88, method=6)
    print(f"  {name}: {{ ox: {xs[low].mean() / im.width:.3f}, oy: {foot_y / im.height:.3f} }},  // {im.size}")
