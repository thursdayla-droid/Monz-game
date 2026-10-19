"""BUNK(元画像のパーツ)の動きの確認。ゲーム(src/core/bunkPose.ts / src/render/bunkView.ts)と同じ計算で
姿を作り、補った部分が見えてしまうか、パーツの間にすき間ができるかを調べる。
体ぜんたいの動き(跳ねる・傾く・ゆれる)はパーツどうしの位置が変わらないので、ここでは調べない。

使い方: python3 tools/check_motion.py src/render/bunkMotion.json <guard|down> 確認画像の出力先
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCALE = 0.5  # 計算を速くするため半分の大きさで調べる(結果は元画像pxに直して出す)


def breath(m, t):
    s = math.sin(t * math.pi * 2 / m["breath"]["period"])
    return 1 - m["breath"]["scaleX"] * s, 1 + m["breath"]["scaleY"] * s


def about(px, py, mat):
    """点(px,py)を中心に mat(2x2) をかける 3x3 行列"""
    a = np.eye(3)
    a[:2, :2] = mat
    a[:2, 2] = [px - mat[0, 0] * px - mat[0, 1] * py, py - mat[1, 0] * px - mat[1, 1] * py]
    return a


def part_matrix(m, pose, man, name, t, swing, jab):
    pm = m["poses"][pose]
    p = man["parts"][name]
    mat = np.eye(3)
    mat[:2, 2] = [p["x"], p["y"]]
    if name not in pm["still"]:
        f = pm["fists"].get(name)
        if f:
            a = math.sin(t * math.pi * 2 / f["period"] + f["phase"])
            side = 1 if f["pivot"][0] < m["anchor"][0] else -1
            th = math.radians(f["angle"] * a + side * swing)
            fx, fy = f["pivot"]
            r = about(fx, fy, np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]]))
            r[1, 2] += f["bob"] * a
            j = pm.get("jab")
            if j and j["part"] == name and jab:
                r = about(fx, fy, np.diag([1 + j["scale"] * jab] * 2)) @ r
                r[:2, 2] += [j["dx"] * jab, j["dy"] * jab]
            mat = r @ mat
        sx, sy = breath(m, t)
        bx, by = m["breath"]["pivot"]
        mat = about(bx, by, np.diag([sx, sy])) @ mat
    return np.diag([SCALE, SCALE, 1]) @ mat


def warp(img, mat, size):
    inv = np.linalg.inv(mat)
    return np.array(img.transform(size, Image.AFFINE, tuple(inv[:2].ravel()), Image.BILINEAR)).astype(float) / 255


def render(m, pose, man, imgs, fills, t, swing=0, jab=0):
    size = (round(man["width"] * SCALE), round(man["height"] * SCALE))
    names = sorted(man["parts"], key=lambda n: man["parts"][n]["z"])
    color = np.zeros((size[1], size[0], 3))
    alpha = np.zeros((size[1], size[0]))
    shown_fill = np.zeros((size[1], size[0]), bool)
    owner = np.full((size[1], size[0]), -1)
    for i, n in enumerate(names):
        mat = part_matrix(m, pose, man, n, t, swing, jab)
        im = warp(imgs[n], mat, size)
        a = im[..., 3]
        color = im[..., :3] * a[..., None] + color * (1 - a[..., None])
        alpha = a + alpha * (1 - a)
        opaque = a > 0.5
        shown_fill[opaque] = False
        owner[opaque] = i
        if n in fills:
            shown_fill |= opaque & (warp(fills[n], mat, size)[..., 3] > 0.5)
    return color, alpha, shown_fill, owner, names


def main(motion_path, pose, out_dir):
    m = json.load(open(motion_path))
    b = m["behavior"]
    d = os.path.join(ROOT, "public", m["poses"][pose]["dir"])
    man = json.load(open(os.path.join(d, "parts.json")))
    imgs = {n: Image.open(os.path.join(d, f"{n}.png")).convert("RGBA") for n in man["parts"]}
    fills = {n: Image.open(os.path.join(d, "fill", f"{n}.png")).convert("RGBA") for n in man["parts"] if man["parts"][n]["filledPx"] > 0}
    os.makedirs(out_dir, exist_ok=True)
    px = 1 / SCALE ** 2

    _, rest_a, rest_fill, _, _ = render(m, pose, man, imgs, fills, 0)
    rest_solid = rest_a > 0.5
    rest_holes = int((ndi.binary_fill_holes(rest_solid) & ~rest_solid).sum())
    base_fill = int(rest_fill.sum())

    cases = [("待っているとき(呼吸・拳の揺れ)", [(k * 0.4, 0, 0) for k in range(30)])]
    if pose == "down":
        cases.append(("歩いているとき(拳を振る)", [(k * 0.13, math.sin(k * 0.13 * math.pi / b["hopPeriod"]) * b["walkSwing"], 0) for k in range(30)]))
    if m["poses"][pose].get("jab"):
        cases.append(("拳を突き出したとき", [(k * 0.7, 0, j) for k in range(4) for j in (0.5, 1.0)]))
    for label, samples in cases:
        worst = (-1, None)
        max_gap = 0
        for t, swing, jab in samples:
            color, a, fill, owner, names = render(m, pose, man, imgs, fills, t, swing, jab)
            solid = a > 0.5
            max_gap = max(max_gap, int((ndi.binary_fill_holes(solid) & ~solid).sum()) - rest_holes)
            n = int(fill.sum()) - base_fill
            if n > worst[0]:
                img = (np.clip(color * a[..., None] + (1 - a[..., None]), 0, 1) * 255).astype(np.uint8)
                img[fill] = (255, 0, 200)
                worst = (n, t, img, {names[i]: int((fill & (owner == i)).sum() * px) for i in range(len(names)) if (fill & (owner == i)).any()})
        key = {"待っているとき(呼吸・拳の揺れ)": "idle", "歩いているとき(拳を振る)": "walk", "拳を突き出したとき": "jab"}[label]
        Image.fromarray(worst[2]).save(os.path.join(out_dir, f"{pose}_{key}.png"))
        print(f"{pose} {label}: 補った部分が見える最大 {int(max(worst[0], 0) * px)} px(元画像px, {worst[1]:.1f}秒目) "
              f"/ すき間 最大 {int(max(max_gap, 0) * px)} px / 内訳 {worst[3]}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
