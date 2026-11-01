"""
N・R のカードのわくの色を、カードの属性の色にそろえる(企画者 2026-11-01「枠の色とマークは修正してください」)。
ChatGPT の絵は、わくの色(番号の札・名前の帯・下の帯などの色)が属性とちがうことがあるので、わくの部分だけ色を変える。
- 絵(カードの絵の窓)・数字の欄・魔法と特性の欄・レアの札は変えない
- わくに色がついている所: 色あい(H)だけを属性の色にする(明るさ・模様はそのまま)。無は色をぬく(灰色)
- わくが灰色のカード: 番号の札・名前の帯・下の帯の暗い所に、属性の色をのせる
SR 以上は、わく自体がレアの色(銀・金と虹・赤と黒)なので変えない
"""
import cv2
import numpy as np

# 属性の色(色あい 0〜180 の OpenCV の H)。None = 無(灰色)
ELEMENT_HUE = {'炎': 0, '水': 105, '自然': 62, '雷': 26, '光': 21, '闇': 134, '無': None}

# 1064×1478 のカードの座標
ART = (52, 125, 1012, 785)
SKIP = [
    (800, 0, 1064, 160),  # レアの札
    (0, 900, 1064, 1088),  # 数字の欄
    (58, 1092, 1006, 1384),  # 魔法・特性の欄
]
# わくが灰色のときに色をのせる所(番号の札・名前の帯・下の帯)
ACCENT = [(48, 34, 405, 122), (60, 795, 1004, 902), (170, 1392, 892, 1446)]


def frame_mask(h: int, w: int) -> np.ndarray:
    sx, sy = w / 1064, h / 1478
    m = np.ones((h, w), bool)
    for x0, y0, x1, y1 in [ART, *SKIP]:
        m[int(y0 * sy):int(y1 * sy), int(x0 * sx):int(x1 * sx)] = False
    return m


def recolor(img: np.ndarray, element: str) -> np.ndarray:
    """img: RGB。わくの色を属性の色にした新しい絵を返す"""
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV).astype(np.int32)
    target = ELEMENT_HUE.get(element)
    mask = frame_mask(h, w)
    colored = mask & (hsv[..., 1] > 50) & (hsv[..., 2] > 40)
    if target is None:
        hsv[..., 1] = np.where(colored, hsv[..., 1] // 8, hsv[..., 1])
    else:
        hsv[..., 0] = np.where(colored, target, hsv[..., 0])
        # わくが灰色(番号の札・下の帯に色がない)ときは、札・帯の暗い所に色をのせる
        sx, sy = w / 1064, h / 1478
        acc = np.zeros((h, w), bool)
        for x0, y0, x1, y1 in ACCENT:
            acc[int(y0 * sy):int(y1 * sy), int(x0 * sx):int(x1 * sx)] = True
        acc &= mask
        if (colored & acc).sum() < acc.sum() * 0.05:
            dark = acc & (hsv[..., 1] < 60) & (hsv[..., 2] > 10) & (hsv[..., 2] < 170)
            hsv[..., 0] = np.where(dark, target, hsv[..., 0])
            hsv[..., 1] = np.where(dark, 200, hsv[..., 1])
            hsv[..., 2] = np.where(dark, np.minimum(230, hsv[..., 2] * 16 // 10 + 18), hsv[..., 2])
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
