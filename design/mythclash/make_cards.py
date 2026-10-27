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
    # 特性が「ー」になっていた → カード表の「狩人の一矢」
    1: [(262, 1310, 330, 1352, '狩人の一矢', 268, 1334, 52, 'lm', 2)],
    # 名前の「檎」の字がちがっていた → 名前の行を まるごと同じ字体で書き直す(字の太さをそろえるため)
    3: [(280, 826, 792, 918, '毒林檎の女王', 535, 872, 86, 'mm', 2)],
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
