"""
絵の中の「ストーリーモード」の文字を消して「BLOOD TOWER」と書く(企画者 2026-11-01「ストーリーモードの文字を消して、Blood Towerに変更して」)。
make_tower.py・make_floor.py から使う。元の絵(tower.png・floor.png)は変えない。
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'


def erase(img: np.ndarray, box: tuple[int, int, int, int], bright: int) -> np.ndarray:
    """box(x0, y0, x1, y1)の中の明るい文字(とそのふち)を、まわりの色でうめる"""
    x0, y0, x1, y1 = box
    mask = np.zeros(img.shape[:2], np.uint8)
    mask[y0:y1, x0:x1] = (img[y0:y1, x0:x1].mean(axis=2) > bright).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=4)
    return cv2.cvtColor(cv2.inpaint(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, 9, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)


def write(img: np.ndarray, text: str, cx: int, cy: int, size: int, gold: bool) -> np.ndarray:
    """まん中(cx, cy)に文字。gold: 金色のグラデーション(タワーの題)・そうでなければ白"""
    im = Image.fromarray(img)
    font = ImageFont.truetype(FONT, size)
    d = ImageDraw.Draw(im)
    # 暗いふちと影
    d.text((cx + 3, cy + 4), text, font=font, anchor='mm', fill=(0, 0, 0), stroke_width=max(3, size // 12), stroke_fill=(0, 0, 0))
    d.text((cx, cy), text, font=font, anchor='mm', fill=(40, 16, 8), stroke_width=max(3, size // 12), stroke_fill=(40, 16, 8))
    if not gold:
        d.text((cx, cy), text, font=font, anchor='mm', fill=(255, 250, 240))
        return np.array(im)
    # 金色: 文字の形をマスクにして、上から下へ明るい金 → 濃い金
    w, h = im.size
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).text((cx, cy), text, font=font, anchor='mm', fill=255)
    grad = np.zeros((h, w, 3), np.uint8)
    top, bot = cy - size // 2, cy + size // 2
    for y in range(h):
        k = min(1, max(0, (y - top) / max(1, bot - top)))
        grad[y] = (np.array([255, 244, 200]) * (1 - k) + np.array([214, 150, 60]) * k).astype(np.uint8)
    im.paste(Image.fromarray(grad), (0, 0), m)
    return np.array(im)


def tower(img: np.ndarray) -> np.ndarray:
    img = erase(img, (240, 150, 700, 226), 110)
    return write(img, 'BLOOD TOWER', 470, 190, 60, True)


def floor(img: np.ndarray) -> np.ndarray:
    img = erase(img, (112, 54, 340, 100), 120)
    return write(img, 'BLOOD TOWER', 226, 78, 34, False)
