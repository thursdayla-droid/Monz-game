# BUNK系 素材

## 新しい基本の絵（2026-10-21 企画者決定）

基本の絵を `reference/bunk_main_v2.png`（企画者が作り直した絵・1254×1254）に変えました。BUNK の絵は全部これに合わせて作り直していく予定です（タイトルの絵は今のまま）。
- 背景を消して、前の絵と同じ大きさの画面（1278×1230）に、足元が前と同じ所にくるよう (12,3) ずらして置いた物を `public/assets/bunk/reference/bunk_hires_cutout.png` にした（ゲームの大きさ・位置・動きの数字をそのまま使うため）。
- パーツ分けは `reference/split.json`（前の絵の設定は `split_v1.json`）。前の絵にあった右の角はなく、丸い耳は体の一部。とさかは線で囲まれているので、色のかたまりで切り出した。
- 腕を下ろした姿（ふつう）も新しい絵 `reference/bunk_down_v2.png` にした（2026-10-21）。正面を向いているので、顔ではなく足元で位置をそろえた（(14,16) ずらす）。パーツ分けは `reference/pose_down/split.json`（目のパーツも入れて、反転したときの目の位置に使う）。
- 表情の顔（新しい絵）は `tools/build_bunk_faces_v2.py design/bunk/reference/pose_down/faces_v2.json` で作る。表情の絵は ふつうの絵と少しだけ大きさ・位置がちがうので、線が重なるように合わせてから、ちがう所（顔）だけ切り出す。
  - 2026-10-21：目を閉じた顔（`pose_down/v2_closed.png`）。届いた表情から `faces_v2.json` の faces と `bunkMotion.json` の faces.names に足す。
  - 新しい表情の顔は腕を下ろした姿（正面）に合わせているので、構えた姿ではまばたきしない。反応の顔を出すときは腕を下ろした姿になる（`facesOnlyDown`）。お世話画面の6つの姿は、とどくまで前の絵のまま。

以下は前の絵のときの記録。

## デザインの基準（最重要）

**BUNKのデザインの基準は、元の公式参考画像だけです。** 正式な基準は高画質版 `reference/bunk_original_hires.png`【確定・2026-10-18 企画者決定】。
形・色・顔・拳・模様・線は、この画像に合わせます。AIでキャラクター全体を描き直すことはしません。

| ファイル | 内容 | 状態 |
|---|---|---|
| `reference/bunk_original_hires.png` | 元の公式参考画像の高画質版（1278×1230。背景の市松模様は絵として描き込まれている） | 基準 |
| `public/assets/bunk/reference/bunk_hires_cutout.png` | 高画質版から背景だけを消したもの。本体の色は1ピクセルも変えていない | 【確定】企画者が元画像との一致を確認済み（2026-10-18） |
| `reference/bunk_original.jpg` | 最初にもらったカード画像（255×310・小さい） | 参考 |
| `public/assets/bunk/reference/bunk_cutout.png` | カード画像から背景だけを消したもの | 参考（今は使っていない） |

## パーツ分け（企画者の確認待ち）

`public/assets/bunk/parts/` に、高画質版の元画像から切り出した10パーツがあります（体・左右の拳・とさか・右の角・左右の目・口・左右の足）。
- 見えている部分は、元画像のピクセルをそのまま使っています。全パーツを重ねると、元画像と1ピクセルも違いません。
- 補ったのは、手前のパーツに隠れていた部分だけです（体の拳・目・口・とさかの下、右の角の付け根、右足の拳の下）。まわりの色をのばして埋めているので、大きく動かすと補った部分が見えます。
- `parts.json` に、各パーツの元画像での位置と重なり順（z が大きいほど手前）を書いています。
- 左の角は拳に隠れていて先しか見えないので、体の一部のままにしています。右肩の紫の角のような部分も、線で区切られていないので体の一部です。

パーツの境目が縮小表示で透けないよう、奥のパーツと接するふちに元画像のピクセルを2px重ねています（重ねても見た目は元画像と同じ）。

作り直すとき:
```
python3 tools/split_parts.py design/bunk/reference/split.json public/assets/bunk/parts 確認画像の出力先
```

## 腕を下ろした姿と表情（2026-10-19 企画者承認）

| ファイル | 内容 |
|---|---|
| `reference/pose_down/*.png` | 企画者がChatGPTで作った素材（腕を下ろした姿のふつう・目を閉じた・怒った・悲しい・喜んだ）。基準 |
| `reference/pose_down/pose_down.json` | 位置合わせ（下へ22px）と、顔の切り出し方の設定 |
| `public/assets/bunk/reference/bunk_down_cutout.png` | 腕を下ろした姿（背景を消して位置をそろえたもの） |
| `public/assets/bunk/down/` | 腕を下ろした姿のパーツ（体・左右の拳） |
| `public/assets/bunk/faces/` | 表情の顔（顔のまわりだけ。ふちはぼかしてある） |

作り直すとき:
```
python3 tools/build_bunk_faces.py design/bunk/reference/pose_down/pose_down.json
python3 tools/split_parts.py design/bunk/reference/pose_down/split.json public/assets/bunk/down 確認画像の出力先
```

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

## まぶたの黒い点を消した（2026-10-21 企画者の指示）

BUNK の左目（画面で左）のまぶた（上のクリーム色の所）に黒い丸い点があり、目が2つあるように見えたので消しました。
黒目は、まぶたのふちにある とがった黒目だけにします。点の所だけを、まわりのまぶたの色でうめています（ほかのピクセルは変えていません）。

消したファイル（`design/` の元画像はそのまま）:
- `public/assets/bunk/reference/bunk_hires_cutout.png`・`bunk_down_cutout.png`
- `public/assets/bunk/parts/eye_l.png`・`public/assets/bunk/down/body.png`
- `public/assets/bunk/poses/hungry.webp`・`sit.webp`・`look.webp`（見回す姿は、点が目のふちの線につながっていた）
- `public/assets/bunk/faces/angry.png`（怒った顔は、左右両方のまぶたに、まゆの線につながった点があった）
- `public/assets/title/title.png`（タイトルの絵の BUNK は、左右両方のまぶたに点があった）
- ほかの表情（喜ぶ・悲しい・目を閉じる）には点がなかった。

元画像からパーツや姿を作り直したときは、もう一度これを実行する:
```
python3 tools/remove_eyelid_dots.py public/assets/bunk/reference/bunk_hires_cutout.png 519,490
python3 tools/remove_eyelid_dots.py public/assets/bunk/reference/bunk_down_cutout.png 518,490
python3 tools/remove_eyelid_dots.py public/assets/bunk/parts/eye_l.png 135,100
python3 tools/remove_eyelid_dots.py public/assets/bunk/down/body.png 434,356
python3 tools/remove_eyelid_dots.py public/assets/bunk/poses/hungry.webp 207,165
python3 tools/remove_eyelid_dots.py public/assets/bunk/poses/sit.webp 236,179
python3 tools/remove_eyelid_dots.py public/assets/title/title.png 448,873 524,890
python3 tools/remove_eyelid_dots.py public/assets/bunk/poses/look.webp 142,151,10,7
python3 tools/remove_eyelid_dots.py public/assets/bunk/faces/angry.png 238,186,20,9 445,200,22,9
```
（`x,y,r,t` は、線につながった点の消し方。くわしくは tools/remove_eyelid_dots.py の説明）
