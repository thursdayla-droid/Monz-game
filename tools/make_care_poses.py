"""
企画者の お世話用の 姿の 絵(design/species/<種族>/poses/<姿>.png)を、ゲーム用に 切り抜いて
public/assets/poses/<種族>/<姿>.webp と poses.json に 書き出す(2026-11-15〜。BUNK は design/bunk/poses/make_poses.py)。
絵は 描き直さない(背景を 消す・縮小する だけ)。
- 背景が 本当に 透明な 絵は そのまま
- 背景が 白(や チェック柄)の 絵は、ふちから つながっている 色の ない 明るい所 だけを 消す(黒い線に 囲まれた 所は 消さない)
高さ: 基準の 姿(ふだんの お世話の 絵と 同じ 姿)を、ふだんの 絵の 高さに そろえ、ほかの 姿は その 比で 決める。
使い方: python3 tools/make_care_poses.py <種族> <基準の姿> <ふだんの絵の高さ(立っているBUNK=1)>
  例: python3 tools/make_care_poses.py mofu sit 1.04
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
NAMES = ['sit', 'sleep', 'stretch', 'look', 'hungry', 'sleepy', 'happy', 'angry', 'cry', 'surprised']
HEIGHT = 520  # ゲームで 使う 高さ(px)。お世話画面では 小さく 出すので 十分


def remove_light_bg(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(int)
    sat = a.max(2) - a.min(2)
    val = a.mean(2)
    light = (sat < 28) & (val > 110)
    labels, _ = ndimage.label(light)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    keep = ~np.isin(labels, list(border))
    labels2, _ = ndimage.label(keep)
    for i, sl in enumerate(ndimage.find_objects(labels2), start=1):
        if sl is not None and int((labels2[sl] == i).sum()) < 250:
            keep[sl][labels2[sl] == i] = False
    out = im.convert('RGBA')
    out.putalpha(Image.fromarray(np.where(keep, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
    return out


def main() -> None:
    sp, ref, ref_h = sys.argv[1], sys.argv[2], float(sys.argv[3])
    src = os.path.join(ROOT, 'design', 'species', sp, 'poses')
    out = os.path.join(ROOT, 'public', 'assets', 'poses', sp)
    os.makedirs(out, exist_ok=True)
    cut: dict[str, Image.Image] = {}
    for name in NAMES:
        p = os.path.join(src, f'{name}.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p)
        has_alpha = im.mode == 'RGBA' and (np.asarray(im)[..., 3] < 10).mean() > 0.1
        rgba = im.convert('RGBA') if has_alpha else remove_light_bg(im)
        cut[name] = rgba.crop(rgba.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    base = cut[ref].height
    info = {}
    for name, rgba in cut.items():
        w = round(rgba.width * HEIGHT / rgba.height)
        rgba.resize((w, HEIGHT), Image.LANCZOS).save(os.path.join(out, f'{name}.webp'), quality=90, method=6)
        info[name] = {'w': w, 'h': HEIGHT, 'height': round(ref_h * rgba.height / base, 3)}
        print(sp, name, info[name])
    with open(os.path.join(out, 'poses.json'), 'w') as f:
        json.dump(info, f, indent=2)


if __name__ == '__main__':
    main()
