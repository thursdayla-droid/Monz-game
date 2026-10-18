"""BUNKの元画像(背景を消したもの)をパーツに分ける。絵は描き直さない。

使い方:
  python3 tools/split_parts.py design/bunk/reference/split.json 出力フォルダ 確認画像フォルダ

- 見えている部分は、元画像のピクセルをそのまま使う。
- 黒い線で囲まれた色のかたまり(regions の点)を、そのパーツにする。
  とさかのように体と線で区切られていない部分は、polygon の範囲の中の紫色だけを使う。
- 境目の黒い線は、近くにあるパーツのうち、いちばん手前のパーツに入れる。
- 手前のパーツに隠れている部分だけを補う(まわりの色をのばして埋める)。
  補うのは、見えている形の外側のふくらみの内側だけ。補った場所は確認画像に色を付けて示す。
- 最後に、全パーツを重ねると元画像と1ピクセルも違わないことを確かめる。
- 補った場所は fill/<パーツ名>.png に白で書き出す。
- 奥のパーツと接するふちには、元画像のピクセルを edgeOverlap px だけ重ねる(境目が透けないように)。
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def hue_sat(rgb):
    f = rgb / 255.0
    mx, mn = f.max(2), f.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    return hue, sat


def main(config_path, out_dir, check_dir):
    cfg = json.load(open(config_path))
    src = np.array(Image.open(cfg["source"]).convert("RGBA"))
    rgb = src[..., :3].astype(int)
    alpha = src[..., 3] > 0
    h, w = alpha.shape
    dark = (rgb @ [0.299, 0.587, 0.114] < cfg["darkLum"]) & alpha
    regions, _ = ndi.label(alpha & ~dark)
    dark_regions, _ = ndi.label(dark)
    hue, sat = hue_sat(rgb)
    purple = (hue > 255) & (hue < 335) & (sat > 0.2) & alpha & ~dark

    parts = cfg["parts"]
    names = sorted(parts, key=lambda n: parts[n]["z"])

    # 1. 色のかたまりをパーツに分ける
    core = {}
    for name, p in parts.items():
        m = np.zeros((h, w), bool)
        for x, y in p.get("regions", []):
            rid = regions[y, x]
            if rid == 0:
                sys.exit(f"{name}: ({x},{y}) は色のかたまりの上にありません")
            m |= regions == rid
        for x, y in p.get("darkSeeds", []):
            m |= dark_regions == dark_regions[y, x]
        if "polygon" in p:
            poly = Image.new("L", (w, h), 0)
            ImageDraw.Draw(poly).polygon([tuple(v) for v in p["polygon"]], fill=1)
            m |= (np.array(poly) > 0) & purple
        core[name] = m & ~dark if "darkSeeds" not in p else m
    taken = np.zeros((h, w), bool)
    for name in names:
        if name != "body":
            taken |= core[name]
    core["body"] = alpha & ~dark & ~taken

    # 2. 黒い線: 近くのパーツのうち、いちばん手前のパーツへ
    owner = np.full((h, w), -1, int)
    for i, name in enumerate(names):
        owner[core[name]] = i
    r = cfg["outlineRadius"]
    near_best = np.full((h, w), -1, int)
    nearest_dist = np.full((h, w), np.inf)
    nearest_part = np.full((h, w), -1, int)
    for i, name in enumerate(names):
        d = ndi.distance_transform_edt(~core[name])
        near_best[(d <= r)] = i  # names は奥→手前の順なので、後のほうが手前
        closer = d < nearest_dist
        nearest_dist[closer] = d[closer]
        nearest_part[closer] = i
    rest = alpha & (owner < 0)
    owner[rest] = np.where(near_best[rest] >= 0, near_best[rest], nearest_part[rest])
    # パーツの線の内側にある細かい色は、そのパーツに入れる
    for i, name in enumerate(names):
        if name != "body":
            filled = ndi.binary_fill_holes(owner == i) & alpha
            owner[filled & (owner < i)] = i
    masks = {name: owner == i for i, name in enumerate(names)}
    assert (owner[alpha] >= 0).all()

    # 3. 隠れている部分を補う
    layers = {}
    fill_masks = {}
    for i, name in enumerate(names):
        vis = masks[name]
        # 補うのは、手前のパーツに隠れている場所のうち、そのまわりで見えている形の
        # 「外側のふくらみ」の内側だけ(手前のパーツごとに、近く r px の形だけで決める)
        fill = np.zeros((h, w), bool)
        for j in range(i + 1, len(names)):
            cover = masks[names[j]]
            local = vis & (ndi.distance_transform_edt(~cover) <= cfg["fillLocal"])
            if local.sum() < 3:
                continue
            hull = np.zeros((h, w), np.uint8)
            cv2.fillPoly(hull, [cv2.convexHull(np.argwhere(local)[:, ::-1].astype(np.int32))], 1)
            fill |= cover & (hull > 0)
        layer = np.zeros((h, w, 4), np.uint8)
        layer[..., :3] = np.where(vis[..., None], rgb, 0)
        if fill.any():
            # まわりの色をのばして埋める。すぐ横の黒い線の色はのばさない(にじみ防止)
            img = np.where(vis[..., None], rgb, 0).astype(np.uint8)
            near = ndi.distance_transform_edt(~fill) <= cfg["fillIgnoreDark"]
            dim = (rgb @ [0.299, 0.587, 0.114] < 200) & (sat < 0.35)  # 黒い線と、線のふちの灰色っぽい色
            unknown = (fill | (vis & (dark | dim) & near)).astype(np.uint8)
            painted = cv2.inpaint(np.ascontiguousarray(img[..., ::-1]), unknown, 9, cv2.INPAINT_TELEA)[..., ::-1]
            layer[..., :3][fill] = painted[fill]
        layer[..., 3] = np.where(vis | fill, 255, 0)
        # 境目が縮小表示で透けないよう、奥のパーツと接するふちに元画像のピクセルを少し重ねる
        ring = ndi.binary_dilation(vis, iterations=cfg["edgeOverlap"]) & alpha & (owner < i)
        layer[ring] = src[ring]
        layers[name] = layer
        fill_masks[name] = fill

    # 4. 重ねて元画像と同じか確かめる
    comp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for name in names:
        comp.alpha_composite(Image.fromarray(layers[name]))
    comp = np.array(comp)
    diff = (comp[alpha][:, :3] != src[alpha][:, :3]).any(1).sum() + (comp[..., 3][~alpha] != 0).sum()
    print("重ねたときの元画像との違い:", int(diff), "px")
    assert diff == 0

    # 5. 書き出し(パーツごとに切り抜いて、元画像での位置を記録)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(check_dir, exist_ok=True)
    manifest = {"width": w, "height": h, "parts": {}}
    for name in names:
        ys, xs = np.nonzero(layers[name][..., 3])
        # 位置と大きさを偶数にそろえる(半分の大きさで表示したときにピクセルの位置がずれないように)
        x0, y0 = xs.min() // 2 * 2, ys.min() // 2 * 2
        x1, y1 = min(w, -(-(xs.max() + 1) // 2) * 2), min(h, -(-(ys.max() + 1) // 2) * 2)
        Image.fromarray(layers[name][y0:y1, x0:x1]).save(os.path.join(out_dir, f"{name}.png"), optimize=True)
        if fill_masks[name].any():
            # 補った場所(白)。ゲームの確認表示と、動いたときに見えるかの確認で使う
            fm = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
            fm[fill_masks[name][y0:y1, x0:x1]] = (255, 255, 255, 255)
            os.makedirs(os.path.join(out_dir, "fill"), exist_ok=True)
            Image.fromarray(fm).save(os.path.join(out_dir, "fill", f"{name}.png"), optimize=True)
        manifest["parts"][name] = {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0), "z": parts[name]["z"],
                                   "filledPx": int(fill_masks[name].sum())}
        print(name, manifest["parts"][name])
    json.dump(manifest, open(os.path.join(out_dir, "parts.json"), "w"), indent=2, ensure_ascii=False)

    # 確認画像: パーツの色分け / 補った場所
    rng = np.random.default_rng(3)
    colors = rng.integers(60, 255, (len(names), 3))
    vis_map = np.full((h, w, 3), 255, np.uint8)
    for i, name in enumerate(names):
        vis_map[masks[name]] = (0.45 * rgb[masks[name]] + 0.55 * colors[i]).astype(np.uint8)
    Image.fromarray(vis_map).save(os.path.join(check_dir, "parts_map.png"))
    for name in names:
        if fill_masks[name].any():
            lay = layers[name].copy()
            bg = np.full((h, w, 3), 255, np.uint8)
            a = lay[..., 3:] / 255.0
            out = (lay[..., :3] * a + bg * (1 - a)).astype(np.uint8)
            edge = fill_masks[name] & ~ndi.binary_erosion(fill_masks[name], iterations=3)
            out[edge] = (255, 0, 200)
            Image.fromarray(out).save(os.path.join(check_dir, f"fill_{name}.png"))


if __name__ == "__main__":
    main(*sys.argv[1:4])
