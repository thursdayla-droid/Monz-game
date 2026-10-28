"""
確認用の「MYTHCLASH カード一覧」ページを作る(企画者 2026-10-28: 全カードを確認できる仕組み。カードが増えてもページが重くならないように)。
- ページ本体(index.html)にはカードのデータ(文字だけ)を入れる。絵は入れない
- カードの絵は別のファイル: cards/NNN.webp(大きく見る用)と cards/thumb/NNN.webp(一覧の小さい絵)
  ページは見ているページ(10枚)の小さい絵だけを読み、さわったカードの大きい絵だけを読む
- ゲーム本体のカードデータと絵は読むだけ(変えない)
使い方: python3 -I tools/build_cards_page.py <出力先のフォルダ>
  → <フォルダ>/index.html・cards/・cards/thumb/ ができる。Artifact は index.html を本体、cards/ を files で出す
"""
import glob
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
os.makedirs(os.path.join(out, 'cards', 'thumb'), exist_ok=True)

# ゲーム本体のカードデータを読む(tools/card_index.ts を rolldown でまとめて node で動かす)
bundle = os.path.join(out, '.card_index.mjs')
subprocess.run(['npx', 'rolldown', os.path.join(root, 'tools/card_index.ts'), '--file', bundle, '--format', 'esm', '--platform', 'node'], cwd=root, check=True, capture_output=True)
cards = json.loads(subprocess.run(['node', bundle], check=True, capture_output=True, text=True).stdout)
os.remove(bundle)

# 絵: ゲーム本体の絵(600×833)をそのまま大きい絵に、一覧用は 240×333 に小さくする
src = os.path.join(root, 'public/assets/mythclash/cards')
for c in cards:
    if not c['art']:
        continue
    name = f"{c['no']:03d}.webp"
    shutil.copyfile(os.path.join(src, name), os.path.join(out, 'cards', name))
    Image.open(os.path.join(src, name)).resize((240, 333), Image.LANCZOS).save(os.path.join(out, 'cards', 'thumb', name), 'WEBP', quality=72, method=6)

html = open(os.path.join(root, 'tools/cards_page.html'), encoding='utf-8').read()
data = json.dumps(cards, ensure_ascii=False).replace('</', '<\\/')
html = html.replace('/*CARDS_JSON*/[]', data)
# Artifact の絵の置き場(/_blob/...)にあげた絵の場所(tools/preview_blobs.py。2026-10-28)。あげていない・変わった絵は一覧に出す
sys.path.insert(0, os.path.join(root, 'tools'))
import preview_blobs
blobs = {}
need_upload = []
for c in cards:
    if not c['art']:
        continue
    for rel in (f"cards/{c['no']:03d}.webp", f"cards/thumb/{c['no']:03d}.webp"):
        url = preview_blobs.lookup('cards', out, rel)
        if url:
            blobs[rel] = url
        else:
            need_upload.append(rel)
html = html.replace('/*BLOBS_JSON*/{}', json.dumps(blobs))
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)
n = sum(1 for c in cards if c['art'])
print(f'{len(cards)} cards, {n} with art, page {round(len(html) / 1e3)} KB')
if need_upload:
    print('あげる絵(Artifact の asset。あげたら tools/preview_blobs.py cards <出力フォルダ> ...):')
    for f in need_upload:
        print(' ', f)
