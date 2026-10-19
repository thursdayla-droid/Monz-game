"""BUNKの「腕を下ろしたポーズ」と表情の素材を作る。絵は描き直さない。

使い方:
  python3 tools/build_bunk_faces.py design/bunk/reference/pose_down/pose_down.json

1. 各画像の背景(市松模様)だけを消す(tools/remove_background.py と同じ処理)
2. 元画像(構え)と顔の位置がそろうよう、全体を shift だけずらす(拡大縮小はしない)
   → public/assets/bunk/reference/bunk_down_cutout.png など
3. 表情の画像から、ふつうの顔と違う部分(顔のまわり)だけを、ふちをぼかして切り出す
   → public/assets/bunk/faces/<表情>.png と faces.json(元画像での位置)
   顔は「構え」と「腕を下ろした」の両方のポーズで、ふつうの顔の上に重ねて使う。
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


def main(config_path):
    cfg = json.load(open(config_path))
    src_dir = os.path.dirname(config_path)
    ref_dir = os.path.join(ROOT, "public/assets/bunk/reference")
    face_dir = os.path.join(ROOT, "public/assets/bunk/faces")
    os.makedirs(face_dir, exist_ok=True)
    dx, dy = cfg["shift"]

    imgs = {}
    for name, s in cfg["sources"].items():
        out = os.path.join(src_dir, "cut", f"{name}.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        print(name, end=": ")
        rb.main(os.path.join(src_dir, s["file"]), out, ["--checker", *s["seeds"]])
        a = np.array(Image.open(out).convert("RGBA"))
        shifted = np.zeros_like(a)
        h, w = a.shape[:2]
        shifted[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = a[max(-dy, 0):h - max(dy, 0), max(-dx, 0):w - max(dx, 0)]
        assert (shifted[..., 3] > 0).sum() == (a[..., 3] > 0).sum(), "ずらしたときに絵がはみ出しました"
        imgs[name] = shifted
    Image.fromarray(imgs["neutral"]).save(os.path.join(ref_dir, "bunk_down_cutout.png"), optimize=True)

    f = cfg["face"]
    x0, y0, x1, y1 = f["box"]
    base = imgs["neutral"].astype(int)
    manifest = {}
    for name, img in imgs.items():
        if name == "neutral":
            continue
        diff = np.abs(img[..., :3].astype(int) - base[..., :3]).max(2) > f["diff"]
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
        manifest[name] = {"x": int(bx0), "y": int(by0), "w": int(bx1 - bx0), "h": int(by1 - by0)}
        print(name, manifest[name])
    json.dump({"width": int(base.shape[1]), "height": int(base.shape[0]), "faces": manifest},
              open(os.path.join(face_dir, "faces.json"), "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1])
