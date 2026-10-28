"""
MYTHCLASH のカードの絵(企画者が ChatGPT で描いたカード全体の絵。design/mythclash/cards/NNN.png)を、ゲームで使う形にする(2026-10-27)。
- 企画者決定: カード全体(わく・数字・文字まで)を描いた絵を、そのままカードとして使う。数字や文字はカード表(cardData.ts)とくらべて確かめる
- 絵の文字がカード表とちがう所は、FIXES で直す(元の文字を消して書き入れる。企画者「Bで直して」2026-10-27)
- 600×833 にして → public/assets/mythclash/cards/NNN.webp
使い方: python3 -I design/mythclash/make_cards.py
"""
import glob
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'cards')
OUT = os.path.join(ROOT, 'public/assets/mythclash/cards')
SIZE = (600, 833)
FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'

# 直す所: カードNo → [(消す所 x0, y0, x1, y1, 書く文字, 文字の位置 x, 文字のまん中 y, 文字の大きさ, 位置の合わせ方, 太さ)]
# 位置の合わせ方: 'lm' = x が文字の左はし / 'mm' = x が文字のまん中
FIXES = {
    # No.001 は 企画者が描き直した絵(特性まで入っている)に差しかえた(2026-10-28)。前の絵と直し方(特性「ー」→「狩人の一矢」)は cards/unused/001_old.png
    # 特性が「ー」になっていた → カード表の「先駆けの牙」
    2: [(258, 1310, 326, 1356, '先駆けの牙', 268, 1333, 52, 'lm', 1)],
    # 特性が「ー」になっていた → カード表の「雷帝の威光」
    26: [
        (266, 1290, 336, 1336, '雷帝の威光', 272, 1313, 50, 'lm', 1),
        # 20%の弱化は50%の確率(コイントス)で効くので、説明に「（50%）」を足す(企画者「50%いれてほしい」2026-10-27)。消す所はなし(空の所を指定)
        (1040, 1220, 1041, 1221, '(50%)', 694, 1229, 37, 'lm', 1),
    ],
    # No.003 は 企画者が「毒りんごの女王」と書いた絵に差しかえた(2026-10-27)。前の絵と直し方は cards/unused/
    # 毒は50%の確率(コイントス)で付くので、説明に「(50%)」を足す(企画者「足して」2026-10-27。これからのカードも同じ)
    3: [(1040, 1220, 1041, 1221, '(50%)', 248, 1250, 37, 'lm', 1)],
    # No.101 Mr.CLASH(特別なカード): 30%の弱化も50%の確率で効くので「(50%)」を足す
    101: [(1040, 1220, 1041, 1221, '(50%)', 684, 1161, 36, 'lm', 0)],
}

os.makedirs(OUT, exist_ok=True)
for path in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    no = int(os.path.splitext(os.path.basename(path))[0])
    img = np.array(Image.open(path).convert('RGB'))
    for x0, y0, x1, y1, text, tx, ty, size, anchor, weight in FIXES.get(no, []):
        mask = np.zeros(img.shape[:2], np.uint8)
        reg = img[y0:y1, x0:x1]
        mask[y0:y1, x0:x1] = (reg.mean(axis=2) > 120).astype(np.uint8) * 255
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=3)
        img = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, 7, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
        im = Image.fromarray(img)
        d = ImageDraw.Draw(im)
        font = ImageFont.truetype(FONT, size)
        # 太字に見えるように、白いふちを足す。うしろに暗い影
        d.text((tx + 3, ty + 4), text, font=font, fill=(0, 0, 0), anchor=anchor, stroke_width=weight + 1, stroke_fill=(0, 0, 0))
        d.text((tx, ty), text, font=font, fill=(250, 248, 240), anchor=anchor, stroke_width=weight, stroke_fill=(250, 248, 240))
        img = np.array(im)
    Image.fromarray(img).resize(SIZE, Image.LANCZOS).save(os.path.join(OUT, f'{no:03d}.webp'), 'WEBP', quality=84, method=6)
    print(no)
