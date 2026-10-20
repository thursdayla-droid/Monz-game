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
