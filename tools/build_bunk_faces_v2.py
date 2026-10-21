"""BUNK の表情の顔を作る(新しい絵 2026-10-21〜)。絵は描き直さない(背景を消して、位置と大きさを合わせるだけ)。

使い方:
  python3 tools/build_bunk_faces_v2.py design/bunk/reference/pose_down/faces_v2.json

表情の絵は「腕を下ろしたふつう」と同じポーズで作ってもらうが、少しだけ大きさや位置がちがう。そこで:
1. 背景(市松模様)だけを消す(tools/remove_background.py と同じ処理)
2. 黒い線が いちばん重なるように、表情の絵を少しだけ拡大縮小・移動して、ふつうの絵に合わせる
3. ふつうの絵とちがう所(目・口など)だけを、顔の範囲(box)の中から ふちをぼかして切り出す
4. ゲームの画面(1278x1230)の位置に直して、public/assets/bunk/faces/<表情>.png と faces.json に書き出す
"""
import importlib.util
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("remove_background", os.path.join(ROOT, "tools", "remove_background.py"))
rb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rb)


def outline(a):
    g = (a[..., :3].astype(np.float32) @ [0.299, 0.587, 0.114]) * (a[..., 3] / 255)
    return cv2.GaussianBlur((g < 80).astype(np.float32), (0, 0), 3)


def warp(a, s, dx, dy, cx, cy, size):
    m = np.float32([[s, 0, dx + (1 - s) * cx], [0, s, dy + (1 - s) * cy]])
    return cv2.warpAffine(a, m, size, flags=cv2.INTER_LANCZOS4 if a.ndim == 3 else cv2.INTER_LINEAR)


def align(base, img):
    """img を base に合わせる拡大率と移動(線の重なりがいちばん多くなる所)"""
    h, w = base.shape[:2]
    cx, cy = w / 2, h / 2
    A, B = outline(base), outline(img)

    def err(s, dx, dy):
        return float(((warp(B, s, dx, dy, cx, cy, (w, h)) - A) ** 2)[::2, ::2].sum())

    best = min((err(s, dx, dy), s, dx, dy) for s in np.arange(0.94, 1.081, 0.01) for dx in range(-30, 31, 3) for dy in range(-30, 31, 3))
    _, s, dx, dy = best
    best = min((err(s2, dx2, dy2), s2, dx2, dy2) for s2 in np.arange(s - 0.01, s + 0.011, 0.0025) for dx2 in range(dx - 3, dx + 4) for dy2 in range(dy - 3, dy + 4))
    _, s, dx, dy = best
    return warp(img, s, dx, dy, cx, cy, (w, h)), (round(float(s), 4), int(dx), int(dy))


def main(config_path):
    cfg = json.load(open(config_path))
    src_dir = os.path.dirname(config_path)
    face_dir = os.path.join(ROOT, "public/assets/bunk/faces")
    cut_dir = os.path.join(src_dir, "cut_v2")
    os.makedirs(face_dir, exist_ok=True)
    os.makedirs(cut_dir, exist_ok=True)
    cw, ch = cfg["canvas"]
    ox, oy = cfg["place"]

    def cut(name, file):
        out = os.path.join(cut_dir, f"{name}.png")
        print(name, end=": ")
        rb.main(os.path.join(src_dir, file), out, ["--checker"])
        return np.array(Image.open(out).convert("RGBA"))

    base = cut("neutral", cfg["neutral"])
    f = cfg["face"]
    x0, y0, x1, y1 = f["box"]
    manifest_path = os.path.join(face_dir, "faces.json")
    manifest = json.load(open(manifest_path))["faces"] if cfg.get("keepOthers") and os.path.exists(manifest_path) else {}
    for name, file in cfg["faces"].items():
        img, how = align(base, cut(name, file))
        diff = np.abs(img[..., :3].astype(int) - base[..., :3].astype(int)).max(2) > f["diff"]
        m = np.zeros_like(diff)
        m[y0:y1, x0:x1] = diff[y0:y1, x0:x1]
        m = ndi.binary_opening(m, iterations=2)
        m = ndi.binary_fill_holes(ndi.binary_dilation(m, iterations=f["grow"]))
        soft = cv2.GaussianBlur(m.astype(np.float32), (0, 0), f["feather"])
        alpha = (soft * (img[..., 3] / 255.0) * 255).round().astype(np.uint8)
        layer = np.dstack([img[..., :3], alpha])
        ys, xs = np.nonzero(alpha)
        bx0, by0 = xs.min() // 2 * 2, ys.min() // 2 * 2
        bx1, by1 = -(-(xs.max() + 1) // 2) * 2, -(-(ys.max() + 1) // 2) * 2
        Image.fromarray(layer[by0:by1, bx0:bx1]).save(os.path.join(face_dir, f"{name}.png"), optimize=True)
        manifest[name] = {"x": int(bx0 + ox), "y": int(by0 + oy), "w": int(bx1 - bx0), "h": int(by1 - by0)}
        print(name, "合わせ方(拡大率, 横, 縦):", how, manifest[name])
    json.dump({"width": cw, "height": ch, "faces": manifest}, open(manifest_path, "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1])
