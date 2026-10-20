"""
DASH MONZ の企画者の絵を、ゲーム用に書き出す。絵は描き直さない(並べる・縮小だけ)。
- dash_bg.png → dash_bg.webp(背景)。元の絵と、左右反転した絵を横に並べて、横に流しても継ぎ目が出ないようにする
使い方: python3 design/minigame/make_dash_assets.py
"""
import os

import numpy as np
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'minigame')

bg = Image.open(os.path.join(HERE, 'dash_bg.png')).convert('RGB')
tile = Image.new('RGB', (bg.width * 2, bg.height))
tile.paste(bg, (0, 0))
tile.paste(ImageOps.mirror(bg), (bg.width, 0))
tile.save(os.path.join(OUT, 'dash_bg.webp'), quality=82, method=6)
print('dash_bg.webp', tile.size)

# 足場: 一番上の長い足場を「左はし・まん中・右はし」に切る(切る所は金具のまん中)。
# ゲームでは まん中 をくり返して、どんな長さの足場にも使う。3つを横に並べた1枚にする
SCALE = 0.45
TOP, BOTTOM = 110, 320
CUTS = {'left': (19, 287), 'mid': (287, 1308), 'right': (1483, 1756)}
pl = Image.open(os.path.join(HERE, 'dash_platform.png')).convert('RGBA')
parts = []
for name, (x0, x1) in CUTS.items():
    p = pl.crop((x0, TOP, x1, BOTTOM))
    parts.append((name, p.resize((round(p.width * SCALE), round(p.height * SCALE)), Image.LANCZOS)))
strip = Image.new('RGBA', (sum(p.width for _, p in parts) + 4 * len(parts), parts[0][1].height))
x = 0
for name, p in parts:
    strip.paste(p, (x, 0))
    print('platform', name, 'x', x, 'w', p.width, 'h', p.height)
    x += p.width + 4
strip.save(os.path.join(OUT, 'dash_platform.webp'), quality=88, method=6)

# トゲ: 透明の所を切りつめて縮小するだけ
sp = Image.open(os.path.join(HERE, 'dash_spike.png')).convert('RGBA')
sp = sp.crop(sp.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
sp.thumbnail((160, 160), Image.LANCZOS)
sp.save(os.path.join(OUT, 'dash_spike.webp'), quality=88, method=6)
print('dash_spike.webp', sp.size)

# 走るモンズ: 走る絵は白い背景を消す、ジャンプの絵は描きこまれたチェック柄を消す
from cutout import cut_checker, cut_white  # noqa: E402


def save_pose(im: Image.Image, name: str, width: int) -> None:
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    a = np.asarray(im).copy()
    a[..., 3] = np.where(a[..., 3] > 240, 255, a[..., 3])  # ほぼ不透明の所は不透明にする
    im = Image.fromarray(a)
    h = round(im.height * width / im.width)
    im.resize((width, h), Image.LANCZOS).save(os.path.join(OUT, name), quality=88, method=6)
    print(name, (width, h))


save_pose(cut_white(os.path.join(HERE, 'dash_run.png')), 'dash_run.webp', 360)
save_pose(cut_checker(os.path.join(HERE, 'dash_jump.png')), 'dash_jump.webp', 300)

# ロゴ: もともと背景が透明。透明の所を切りつめて縮小するだけ
lg = Image.open(os.path.join(HERE, 'dash_logo.png')).convert('RGBA')
lg = lg.crop(lg.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
h = round(lg.height * 680 / lg.width)
lg.resize((680, h), Image.LANCZOS).save(os.path.join(OUT, 'dash_logo.webp'), quality=88, method=6)
print('dash_logo.webp', (680, h))
