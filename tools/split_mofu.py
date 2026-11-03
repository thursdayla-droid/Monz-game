"""MOFU(など)の お世話画面の絵をパーツに分ける(2026-11-03)。絵は描き直さない。

使い方: python3 tools/split_mofu.py design/species/mofu/split.json public/assets/mofu/parts 確認画像の出力先 src/render/mofuParts.json

- polygon(または ellipse と minY)の中の、元の絵のピクセルを、そのままそのパーツにする。
- 体(body)は、ほかのパーツを抜いた残り。抜いた所のうち体の内側だけを、まわりの色をのばして補う(cv2.inpaint)。
- 全パーツを重ねると、元の絵と同じになることを確かめる。
"""
import json, os, sys
import cv2
import numpy as np
from PIL import Image, ImageDraw


def main(cfg_path, out_dir, check_dir):
    cfg = json.load(open(cfg_path))
    src = np.array(Image.open(cfg['source']).convert('RGBA'))
    h, w = src.shape[:2]
    alpha = src[..., 3] > 0
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(check_dir, exist_ok=True)
    masks = {}
    for name, p in cfg['parts'].items():
        if name == 'body':
            continue
        m = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(m)
        if 'polygon' in p:
            d.polygon([tuple(v) for v in p['polygon']], fill=255)
        if 'ellipse' in p:
            cx, cy, rx, ry = p['ellipse']
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        mm = np.array(m) > 0
        if 'minY' in p:
            mm[: p['minY'], :] = False
        if 'maxY' in p:
            mm[p['maxY']:, :] = False
        masks[name] = mm & alpha
    taken = np.zeros((h, w), bool)
    for n, m in masks.items():
        if not cfg['parts'][n].get('copy'):
            taken |= m
    body = src.copy()
    body[taken] = 0
    # 補うのは、パーツごとに決めた円(fill)の中で、抜いた所だけ(体の外へは はみ出さない)
    filled = np.zeros((h, w), bool)
    hole = np.zeros((h, w), bool)
    yy, xx = np.mgrid[0:h, 0:w]
    for name, p in cfg['parts'].items():
        for cx, cy, r in p.get('fill', []):
            hole |= ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) & masks[name]
    if hole.any():
        rgb = cv2.cvtColor(src[..., :3].copy(), cv2.COLOR_RGB2BGR)
        rgb[taken] = 0
        paint = cv2.inpaint(rgb, hole.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA)
        paint = cv2.cvtColor(paint, cv2.COLOR_BGR2RGB)
        body[hole, :3] = paint[hole]
        body[hole, 3] = 255
        filled = hole
    out = {'width': w, 'height': h, 'parts': {}}
    def save(name, img, z):
        ys, xs = np.nonzero(img[..., 3])
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        Image.fromarray(img[y0:y1, x0:x1]).save(os.path.join(out_dir, f'{name}.webp'), 'WEBP', quality=72, method=6)
        p = cfg['parts'][name]
        out['parts'][name] = {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'z': z, **({'pivot': p['pivot']} if 'pivot' in p else {})}
    save('body', body, cfg['parts']['body']['z'])
    for name, m in masks.items():
        img = np.zeros_like(src)
        img[m] = src[m]
        save(name, img, cfg['parts'][name]['z'])
    json.dump(out, open(os.path.join(out_dir, 'parts.json'), 'w'), indent=1)
    if len(sys.argv) > 4:
        json.dump(out, open(sys.argv[4], 'w'), indent=1)
    # 確かめ: 重ねると元の絵と同じ
    comp = np.zeros_like(src)
    order = sorted(out['parts'], key=lambda n: out['parts'][n]['z'])
    canvas = Image.new('RGBA', (w, h))
    for n in order:
        p = out['parts'][n]
        canvas.alpha_composite(Image.open(os.path.join(out_dir, f'{n}.webp')).convert('RGBA'), (p['x'], p['y']))
    diff = np.abs(np.array(canvas).astype(int) - src.astype(int))[..., :3].max(2)
    vis = alpha & ~(filled & ~taken)
    bad = (diff > 24) & alpha & ~filled  # webp(圧縮)なので少しの色のちがいは許す
    print('重ねたときに ちがうピクセル:', int(bad.sum()))
    chk = Image.new('RGBA', (w, h), (200, 230, 200, 255))
    chk.alpha_composite(Image.fromarray(body))
    ov = np.zeros((h, w, 4), np.uint8)
    ov[filled] = [255, 0, 200, 150]
    chk.alpha_composite(Image.fromarray(ov))
    chk.convert('RGB').resize((w // 2, h // 2)).save(os.path.join(check_dir, 'mofu_body_fill.png'))
    canvas2 = Image.new('RGBA', (w, h), (200, 230, 200, 255))
    colors = {'tail': (255, 120, 0), 'antenna_l': (0, 160, 255), 'antenna_r': (0, 200, 120), 'lid_l': (255, 0, 0), 'lid_r': (255, 0, 0)}
    canvas2.alpha_composite(Image.fromarray(src))
    ov = np.zeros((h, w, 4), np.uint8)
    for n, m in masks.items():
        ov[m] = [*colors[n], 110]
    canvas2.alpha_composite(Image.fromarray(ov))
    canvas2.convert('RGB').resize((w // 2, h // 2)).save(os.path.join(check_dir, 'mofu_parts.png'))


if __name__ == '__main__':
    main(*sys.argv[1:4])
