"""
MONZ CARD の企画者の絵を、ゲーム用に切り抜いて public/assets/minigame/ に書き出す。絵は描き直さない(切り抜き・縮小だけ)。
- card_title.png → card_title.webp(タイトル画面。そのまま全面)
- card_logo.png  → card_logo.webp(白い背景を消したロゴ)
- card_back.png  → card_back.webp(左のカード1枚)・card_deck.webp(右の山札)。灰色の背景を消す
- card_bg.png    → card_bg.webp(プレイ画面の背景。そのまま)
- card_clear_monz.png / card_over_monz.png → クリア・ゲームオーバーのキャラクター。描きこまれたチェック柄の背景を消す
使い方: python3 design/minigame/make_card_assets.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'minigame')


def cut_background(im: Image.Image, is_bg) -> Image.Image:
    """ふちからつながっている背景の色の所だけを透明にする"""
    a = np.asarray(im.convert('RGB')).astype(int)
    bg = is_bg(a)
    labels, _ = ndimage.label(bg)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    outside = np.isin(labels, list(border))
    alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())


def save(im: Image.Image, name: str, width: int) -> None:
    h = round(im.height * width / im.width)
    im.resize((width, h), Image.LANCZOS).save(os.path.join(OUT, name), quality=88, method=6)
    print(name, (width, h))


os.makedirs(OUT, exist_ok=True)
Image.open(os.path.join(HERE, 'card_title.png')).convert('RGB').save(os.path.join(OUT, 'card_title.webp'), quality=86, method=6)
print('card_title.webp')

white = lambda a: (a.min(2) > 225) & (a.max(2) - a.min(2) < 30)
save(cut_background(Image.open(os.path.join(HERE, 'card_logo.png')), white), 'card_logo.webp', 700)

grey = lambda a: (a.max(2) - a.min(2) < 14) & (a.mean(2) > 35) & (a.mean(2) < 110)
back = Image.open(os.path.join(HERE, 'card_back.png')).convert('RGB')
w = back.width
save(cut_background(back.crop((0, 0, w // 2, back.height)), grey), 'card_back.webp', 300)
save(cut_background(back.crop((w // 2, 0, w, back.height)), grey), 'card_deck.webp', 300)

Image.open(os.path.join(HERE, 'card_bg.png')).convert('RGB').save(os.path.join(OUT, 'card_bg.webp'), quality=84, method=6)
print('card_bg.webp')


def checker(a):
    """白と薄い灰色のチェック柄(色がほとんどなく明るい)"""
    return (a.max(2) - a.min(2) < 18) & (a.mean(2) > 200)


def cut_checker(path: str) -> Image.Image:
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    bg = checker(a)
    labels, n = ndimage.label(bg)
    sizes = ndimage.sum(np.ones_like(labels), labels, range(n + 1))
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    # 体に囲まれた大きな所は、チェック柄(白と灰色が混ざる)のときだけ消す。真っ白な所(目・×印・おばけ)は絵なので残す
    grey_tile = (a.mean(2) < 228)
    big = set()
    for i in range(1, n + 1):
        if sizes[i] > 3000 and i not in border:
            frac = grey_tile[labels == i].mean()
            if 0.2 < frac < 0.8:
                big.add(i)
    remove = np.isin(labels, list(border | big))
    keep = ~remove
    # 残った細かい点(チェック柄の切れはし)を消す
    labels2, _ = ndimage.label(keep)
    for i, sl in enumerate(ndimage.find_objects(labels2), start=1):
        if sl is not None and int((labels2[sl] == i).sum()) < 400:
            keep[sl][labels2[sl] == i] = False
    alpha = Image.fromarray(np.where(keep, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())


save(cut_checker(os.path.join(HERE, 'card_clear_monz.png')), 'card_clear_monz.webp', 520)
save(cut_checker(os.path.join(HERE, 'card_over_monz.png')), 'card_over_monz.webp', 560)
