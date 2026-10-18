# BUNK系 素材

## デザインの基準（最重要）

**BUNKのデザインの基準は、元の公式参考画像だけです。** 今は高画質版 `reference/bunk_original_hires.png` を使います。
形・色・顔・拳・模様・線は、この画像に合わせます。AIでキャラクター全体を描き直すことはしません。

| ファイル | 内容 | 状態 |
|---|---|---|
| `reference/bunk_original_hires.png` | 元の公式参考画像の高画質版（1278×1230。背景の市松模様は絵として描き込まれている） | 基準 |
| `public/assets/bunk/reference/bunk_hires_cutout.png` | 高画質版から背景だけを消したもの。本体の色は1ピクセルも変えていない | 企画者の確認待ち |
| `reference/bunk_original.jpg` | 最初にもらったカード画像（255×310・小さい） | 参考 |
| `public/assets/bunk/reference/bunk_cutout.png` | カード画像から背景だけを消したもの | 参考（今は使っていない） |
| `parts-sheet.png` と `public/assets/bunk/*.png` | ChatGPTで作ったパーツ分けの画像と、そこから切り出したパーツ | **使わない**（元画像と形が違うため、正式素材にしない） |

## 背景を消し直すとき

```
python3 tools/remove_background.py design/bunk/reference/bunk_original_hires.png public/assets/bunk/reference/bunk_hires_cutout.png --checker 867,273
python3 tools/remove_background.py design/bunk/reference/bunk_original.jpg public/assets/bunk/reference/bunk_cutout.png 125,241
```

最後の数字は、線に囲まれた背景の位置です（高画質版は右の角の輪の内側、カード画像は足の間の床）。そこも背景として消します。

## 今後のパーツ分けの方針（企画者の確認後に行う）
- 元画像で見えている部分は、できるだけそのまま切り出す。
- 拳の裏など、隠れている部分だけを補う。
- 元画像から忠実に切り出すのが難しいときは、別のキャラクターを作らずに、その理由を企画者に説明する。
