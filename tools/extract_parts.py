"""パーツ表(透明PNG)から各パーツを切り出す。

使い方: python3 tools/extract_parts.py design/bunk/parts-map.json public/assets/bunk
parts-map.json の座標に重なる「ひとかたまりの絵」を探し、名前ごとにPNGで保存する。
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

PAD = 4


def label(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1
                lab[y, x] = n
                q = deque([(y, x)])
                while q:
                    cy, cx = q.popleft()
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
    return lab


def main(map_path, out_dir):
    spec = json.load(open(map_path))
    sheet = np.array(Image.open(os.path.join(os.path.dirname(map_path), spec["sheet"])).convert("RGBA"))
    alpha = sheet[:, :, 3]
    lab = label(alpha > 40)
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for name, points in spec["parts"].items():
        ids = {int(lab[y, x]) for x, y in points}
        if 0 in ids:
            sys.exit(f"{name}: 座標 {points} が絵の上にありません")
        sel = np.isin(lab, list(ids))
        # かたまりの周囲の半透明な縁も含める
        ys, xs = np.nonzero(sel)
        y0, y1 = max(ys.min() - PAD, 0), min(ys.max() + PAD + 1, sheet.shape[0])
        x0, x1 = max(xs.min() - PAD, 0), min(xs.max() + PAD + 1, sheet.shape[1])
        crop = sheet[y0:y1, x0:x1].copy()
        others = (lab[y0:y1, x0:x1] > 0) & ~sel[y0:y1, x0:x1]
        crop[others] = 0
        crop[crop[:, :, 3] <= 40] = 0
        Image.fromarray(crop).save(os.path.join(out_dir, f"{name}.png"), optimize=True)
        manifest[name] = {"w": int(x1 - x0), "h": int(y1 - y0)}
        print(name, manifest[name])
    json.dump(manifest, open(os.path.join(out_dir, "parts.json"), "w"), indent=2)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
