"""
DASH MONZ の企画者の絵を、ゲーム用に書き出す。絵は描き直さない(並べる・縮小だけ)。
- dash_bg.png → dash_bg.webp(背景)。元の絵と、左右反転した絵を横に並べて、横に流しても継ぎ目が出ないようにする
使い方: python3 design/minigame/make_dash_assets.py
"""
import os

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'minigame')

bg = Image.open(os.path.join(HERE, 'dash_bg.png')).convert('RGB')
tile = Image.new('RGB', (bg.width * 2, bg.height))
tile.paste(bg, (0, 0))
tile.paste(ImageOps.mirror(bg), (bg.width, 0))
tile.save(os.path.join(OUT, 'dash_bg.webp'), quality=82, method=6)
print('dash_bg.webp', tile.size)
