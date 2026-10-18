"""BUNK(元画像のパーツ)の動きの確認。ゲーム(src/core/bunkPose.ts)と同じ計算で姿を作り、
補った部分が見えてしまうか、パーツの間にすき間ができるかを調べる。

使い方: python3 tools/check_motion.py public/assets/bunk/parts src/render/bunkMotion.json 確認画像の出力先
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def breath(m, t):
    s = math.sin(t * math.pi * 2 / m["breath"]["period"])
    return 1 - m["breath"]["scaleX"] * s, 1 + m["breath"]["scaleY"] * s


def fist(m, name, t):
    f = m["fists"][name]
    a = math.sin(t * math.pi * 2 / f["period"] + f["phase"])
    return math.radians(f["angle"] * a), f["bob"] * a


def about(px, py, mat):
    """点(px,py)を中心に mat(2x2) をかける 3x3 行列"""
    a = np.eye(3)
    a[:2, :2] = mat
    a[:2, 2] = [px - mat[0, 0] * px - mat[0, 1] * py, py - mat[1, 0] * px - mat[1, 1] * py]
    return a


def part_matrix(m, man, name, t, eye_k):
    p = man["parts"][name]
    mat = np.eye(3)
    mat[:2, 2] = [p["x"], p["y"]]
    if name in m["still"]:
        return mat
    if name in m["fists"]:
        th, bob = fist(m, name, t)
        fx, fy = m["fists"][name]["pivot"]
        r = about(fx, fy, np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]]))
        r[1, 2] += bob
        mat = r @ mat
    if name in m["eyes"]:
        cx, cy = p["x"] + p["w"] / 2, p["y"] + p["h"] / 2
        mat = about(cx, cy, np.diag([1, eye_k])) @ mat
    sx, sy = breath(m, t)
    bx, by = m["breath"]["pivot"]
    return about(bx, by, np.diag([sx, sy])) @ mat


def warp(img, mat, size):
    inv = np.linalg.inv(mat)
    return np.array(img.transform(size, Image.AFFINE, tuple(inv[:2].ravel()), Image.BILINEAR)).astype(float) / 255


def render(m, man, imgs, fills, t, eye_k):
    size = (man["width"], man["height"])
    names = sorted(man["parts"], key=lambda n: man["parts"][n]["z"])
    color = np.zeros((size[1], size[0], 3))
    alpha = np.zeros((size[1], size[0]))
    top = np.full((size[1], size[0]), -1)
    shown_fill = np.zeros((size[1], size[0]), bool)
    for i, n in enumerate(names):
        mat = part_matrix(m, man, n, t, eye_k)
        im = warp(imgs[n], mat, size)
        a = im[..., 3]
        color = im[..., :3] * a[..., None] + color * (1 - a[..., None])
        alpha = a + alpha * (1 - a)
        opaque = a > 0.5
        top[opaque] = i
        shown_fill[opaque] = False
        if n in fills:
            fm = warp(fills[n], mat, size)[..., 3] > 0.5
            shown_fill |= opaque & fm
    return color, alpha, shown_fill, top, names


def main(parts_dir, motion_path, out_dir):
    man = json.load(open(os.path.join(parts_dir, "parts.json")))
    m = json.load(open(motion_path))
    imgs = {n: Image.open(os.path.join(parts_dir, f"{n}.png")).convert("RGBA") for n in man["parts"]}
    fills = {n: Image.open(os.path.join(parts_dir, "fill", f"{n}.png")).convert("RGBA")
             for n in man["parts"] if man["parts"][n]["filledPx"] > 0}
    os.makedirs(out_dir, exist_ok=True)

    _, rest_a, rest_fill, _, _ = render(m, man, imgs, fills, 0, 1)
    rest_solid = rest_a > 0.5
    rest_holes = int((ndi.binary_fill_holes(rest_solid) & ~rest_solid).sum())
    print("静止時に見えている補った部分:", int(rest_fill.sum()), "px")

    cycle = 12.0
    worst = (0, None)
    report = []
    for eye_k, label in ((1, "目を開いているとき"), (m["blink"]["closedScaleY"], "まばたきで目を閉じた瞬間")):
        max_fill = 0
        max_gap = 0
        for k in range(int(cycle * 5)):
            t = k / 5
            color, a, fill, top, names = render(m, man, imgs, fills, t, eye_k)
            solid = a > 0.5
            gaps = int((ndi.binary_fill_holes(solid) & ~solid).sum()) - rest_holes
            n_fill = int(fill.sum())
            max_gap = max(max_gap, gaps)
            if n_fill > max_fill:
                max_fill = n_fill
            if n_fill > worst[0] or (eye_k != 1 and k == 0):
                img = (np.clip(color * a[..., None] + (1 - a[..., None]), 0, 1) * 255).astype(np.uint8)
                img[fill] = (255, 0, 200)
                key = "blink" if eye_k != 1 else "move"
                Image.fromarray(img).save(os.path.join(out_dir, f"worst_{key}.png"))
                if eye_k == 1:
                    worst = (n_fill, t)
                by_part = {names[i]: int((fill & (top == i)).sum()) for i in range(len(names))}
                by_part = {k2: v for k2, v in by_part.items() if v}
                if eye_k == 1 or k == 0:
                    report.append((label, t, n_fill, by_part))
        print(f"{label}: 補った部分が見える最大 {max_fill} px(元画像px) / パーツの間のすき間 最大 {max_gap} px")
    for label, t, n, by in report[-2:]:
        print(f"  {label} {t:.1f}秒目: {n} px  内訳 {by}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
