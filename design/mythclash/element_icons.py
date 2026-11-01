"""
属性のしるし(炎・水・自然・雷・光・闇・無)をプログラムで描く(企画者 2026-11-01)。
- 魔法の欄の闇のしるし(紫の目)が、ステータスの「魔」のしるしと同じ形なので、闇は三日月の形にする
- カードの属性を、絵の右下に しるし＋文字の札で入れる
make_cards.py から使う
"""
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
COLORS = {
    '炎': ((255, 214, 120), (232, 52, 30)),
    '水': ((160, 228, 255), (30, 120, 235)),
    '自然': ((200, 255, 150), (40, 160, 60)),
    '雷': ((255, 250, 170), (240, 180, 20)),
    '光': ((255, 255, 230), (245, 200, 80)),
    '闇': ((240, 190, 255), (150, 50, 220)),
    '無': ((240, 240, 245), (140, 140, 155)),
}
# 札のわくの色
FRAME = {'炎': (255, 90, 60), '水': (60, 170, 255), '自然': (90, 210, 110), '雷': (255, 215, 60), '光': (255, 230, 150), '闇': (190, 90, 255), '無': (180, 180, 190)}


def _shape(el: str, s: int) -> Image.Image:
    """しるしの形(白の L 画像。s×s)"""
    m = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(m)
    c = s / 2
    if el == '炎':
        # 下が丸く、上が細くのびてゆらめく炎
        d.ellipse((c - s * 0.30, s * 0.40, c + s * 0.30, s * 0.94), fill=255)
        pts = []
        for i in range(41):
            t = i / 40
            y = s * 0.70 - t * s * 0.64
            half = s * 0.30 * (1 - t) ** 0.9
            pts.append((c + s * 0.06 * math.sin(t * math.pi) + half, y))
        for i in range(40, -1, -1):
            t = i / 40
            y = s * 0.70 - t * s * 0.64
            half = s * 0.30 * (1 - t) ** 0.9
            pts.append((c + s * 0.06 * math.sin(t * math.pi) - half, y))
        d.polygon(pts, fill=255)
        # 左の小さな火
        d.polygon([(c - s * 0.30, s * 0.62), (c - s * 0.36, s * 0.32), (c - s * 0.12, s * 0.52)], fill=255)
        # 中の明るい所をくりぬく
        d.ellipse((c - s * 0.12, s * 0.62, c + s * 0.12, s * 0.86), fill=0)
        d.polygon([(c - s * 0.12, s * 0.74), (c + s * 0.02, s * 0.46), (c + s * 0.12, s * 0.74)], fill=0)
    elif el == '水':
        pts = [(c, s * 0.08)]
        for i in range(41):
            t = math.pi * (i / 40)
            pts.append((c + s * 0.30 * math.cos(math.pi - t), c + s * 0.18 + s * 0.30 * math.sin(math.pi - t) * -1 + s * 0.0))
        d.ellipse((c - s * 0.30, c - s * 0.04, c + s * 0.30, c + s * 0.40), fill=255)
        d.polygon([(c, s * 0.06), (c - s * 0.29, c + s * 0.12), (c + s * 0.29, c + s * 0.12)], fill=255)
    elif el == '自然':
        d.ellipse((c - s * 0.18, s * 0.12, c + s * 0.34, s * 0.80), fill=255)
        d.ellipse((c - s * 0.40, s * 0.20, c + s * 0.10, s * 0.88), fill=0)
        d.ellipse((c - s * 0.34, s * 0.12, c + s * 0.18, s * 0.80), fill=255)
        d.ellipse((c - s * 0.20, s * 0.30, c + s * 0.26, s * 0.88), fill=255)
        d.line((c - s * 0.30, s * 0.88, c + s * 0.18, s * 0.28), fill=0, width=max(2, s // 18))
    elif el == '雷':
        d.polygon([(c + s * 0.10, s * 0.06), (c - s * 0.26, c + s * 0.06), (c - s * 0.02, c + s * 0.06), (c - s * 0.12, s * 0.94), (c + s * 0.28, c - s * 0.08), (c + s * 0.02, c - s * 0.08)], fill=255)
    elif el == '光':
        for i in range(8):
            a = i * math.pi / 4
            w = 0.09
            d.polygon([(c + s * 0.47 * math.cos(a), c + s * 0.47 * math.sin(a)), (c + s * 0.24 * math.cos(a + w * 2), c + s * 0.24 * math.sin(a + w * 2)), (c + s * 0.24 * math.cos(a - w * 2), c + s * 0.24 * math.sin(a - w * 2))], fill=255)
        d.ellipse((c - s * 0.24, c - s * 0.24, c + s * 0.24, c + s * 0.24), fill=255)
    elif el == '闇':
        # 三日月と小さな星
        d.ellipse((c - s * 0.36, c - s * 0.36, c + s * 0.32, c + s * 0.36), fill=255)
        d.ellipse((c - s * 0.16, c - s * 0.46, c + s * 0.46, c + s * 0.24), fill=0)
        sx, sy, r = c + s * 0.26, c + s * 0.22, s * 0.13
        d.polygon([(sx, sy - r), (sx + r * 0.28, sy - r * 0.28), (sx + r, sy), (sx + r * 0.28, sy + r * 0.28), (sx, sy + r), (sx - r * 0.28, sy + r * 0.28), (sx - r, sy), (sx - r * 0.28, sy - r * 0.28)], fill=255)
    else:  # 無
        w = max(3, s // 9)
        d.ellipse((c - s * 0.36, c - s * 0.36, c + s * 0.36, c + s * 0.36), outline=255, width=w)
        d.ellipse((c - s * 0.12, c - s * 0.12, c + s * 0.12, c + s * 0.12), fill=255)
    return m


def icon(el: str, size: int) -> Image.Image:
    """光るしるし(RGBA)。上が明るく下が濃い色・ふちに光"""
    big = size * 4
    m = _shape(el, big).resize((size, size), Image.LANCZOS)
    hi, lo = COLORS[el]
    grad = Image.new('RGB', (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        k = y / max(1, size - 1)
        gd.line((0, y, size, y), fill=tuple(int(hi[i] * (1 - k) + lo[i] * k) for i in range(3)))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow = Image.new('RGBA', (size, size), lo + (0,))
    glow.putalpha(m.filter(ImageFilter.GaussianBlur(size / 14)).point(lambda v: int(v * 0.9)))
    out.alpha_composite(glow)
    body = grad.convert('RGBA')
    body.putalpha(m)
    out.alpha_composite(body)
    return out


def element_tag(el: str, h: int) -> Image.Image:
    """カードの属性の札: [しるし 文字]。黒い角丸の板に属性の色のふち(魔法の欄のしるしと同じ見た目)"""
    pad = h // 6
    font = ImageFont.truetype(FONT, int(h * 0.52))
    tw = font.getbbox(el)[2]
    w = pad * 3 + int(h * 0.78) + tw + pad
    sc = 3
    im = Image.new('RGBA', (w * sc, h * sc), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    fc = FRAME[el]
    d.rounded_rectangle((0, 0, w * sc - 1, h * sc - 1), radius=h * sc // 2, fill=(10, 6, 14, 230), outline=fc + (255,), width=max(3, h * sc // 16))
    im = im.resize((w, h), Image.LANCZOS)
    ic = icon(el, int(h * 0.78))
    im.alpha_composite(ic, (pad * 2 - pad // 2, (h - ic.height) // 2))
    d = ImageDraw.Draw(im)
    tx = pad * 2 + int(h * 0.78)
    d.text((tx, h // 2), el, font=font, anchor='lm', fill=tuple(min(255, int(v * 0.4 + 160)) for v in fc), stroke_width=max(1, h // 30), stroke_fill=(10, 6, 14))
    return im


if __name__ == '__main__':
    import sys
    sheet = Image.new('RGBA', (7 * 120, 260), (20, 12, 20, 255))
    for i, e in enumerate(COLORS):
        sheet.alpha_composite(icon(e, 100), (i * 120 + 10, 10))
        t = element_tag(e, 60)
        sheet.alpha_composite(t, (i * 120 + 2, 150))
    sheet.save(sys.argv[1])
