"""確認用ページ(1つのHTMLに絵と曲を埋め込んだもの)を作る。企画者がiPhoneで遊んで確かめるためのページ。
使い方: rm -rf dist && npm run build && python3 -I tools/build_preview.py <出力先.html>
- 出力先のファイルがすでにあれば、その中の古いゲームを差しかえる(なければ下の HTML のひな形から作る)
- iPhone で開けるように 12MB くらいまでに収める(15MB をこえると開けなかった 2026-10-21)。圧縮は確認用ページだけ(ゲーム本体の素材はそのまま)
- 新しい素材のフォルダを足したら、下の paths にも足す
- MYTHCLASH の絵(public/assets/mythclash/ の全部)は埋め込まない。Artifact の絵の置き場(/_blob/...)にあげて、その場所を使う(tools/preview_blobs.py。2026-10-28)
"""
import base64, glob, io, json, os, sys
from PIL import Image
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
if not os.path.exists(out):
    open(out, 'w').write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>MONZ</title>'
                         '<style>html,body{margin:0;height:100%;background:#1b1024;overflow:hidden}#game{width:100%;height:100%}</style></head>'
                         '<body><div id="boot" style="color:#fff;font:20px sans-serif;text-align:center;padding-top:40vh">よみこみ中…</div><div id="game"></div>\n<script type="module"></script></body></html>')
js = open(glob.glob(root + '/dist/assets/index-*.js')[0]).read()
assert '</script' not in js
pub = root + '/public/'
paths = ['assets/title/title.png', 'assets/bunk/reference/bunk_hires_cutout.png', 'assets/bunk/reference/bunk_down_cutout.png']
for d in ['parts', 'down', 'faces']:
    paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + f'assets/bunk/{d}/*.png'))
paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/birth/*.webp') + glob.glob(pub + 'assets/home/*.webp') + glob.glob(pub + 'assets/home/icons/*.webp') + glob.glob(pub + 'assets/home/rooms/*.webp') + glob.glob(pub + 'assets/furniture/*.webp') + glob.glob(pub + 'assets/bunk/poses/*.webp') + glob.glob(pub + 'assets/minigame/*.webp'))
assets = {}
for p in paths:
    if p.endswith('.webp'):
        # 確認用ページの上限のため、大きい背景だけ少し圧縮しなおす(ゲーム本体はそのまま)
        data = open(pub + p, 'rb').read()
        if len(data) > 60_000:
            bb = io.BytesIO()
            Image.open(pub + p).save(bb, 'WEBP', quality=55, method=6)
            data = bb.getvalue()
        assets[p] = 'data:image/webp;base64,' + base64.b64encode(data).decode()
        continue
    b = io.BytesIO()
    # 確認用ページの大きさの上限のため、タイトルの絵と比較用の参考画像は少しだけ圧縮する(BUNKのパーツは劣化させない)
    lossy = p.startswith('assets/title/') or p.startswith('assets/bunk/reference/')
    # 2026-10-21: iPhone でページが開かなくなったので、確認用ページだけ BUNK のパーツ・顔も ほぼ劣化のない圧縮にする(ゲーム本体はそのまま)
    soft = p.startswith('assets/bunk/parts/') or p.startswith('assets/bunk/down/') or p.startswith('assets/bunk/faces/')
    if soft:
        Image.open(pub + p).convert('RGBA').save(b, 'WEBP', quality=92, alpha_quality=100, method=6)
    elif lossy:
        Image.open(pub + p).convert('RGBA').save(b, 'WEBP', quality=84 if p.startswith('assets/title/') else 78, method=6)
    else:
        Image.open(pub + p).convert('RGBA').save(b, 'WEBP', lossless=True, quality=100, method=4)
    assets[p] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
# まだ画面で使っていない曲は、確認用ページに入れない(ページの大きさの上限 16MB のため)。使う画面ができたら外す
BGM_NOT_YET: set[str] = set()
for p in sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/bgm/*.mp3') + glob.glob(pub + 'assets/se/**/*.mp3', recursive=True)):
    if p in BGM_NOT_YET:
        continue
    # 確認用ページの大きさの上限(16MB)のため、曲は軽く(モノラル20kbps・2026-10-26 に28k→24k→20kと下げた。22kHzでは実際は16kbpsになる)して埋め込む。ゲーム本体は元の音質のまま
    import subprocess, tempfile
    tmp = tempfile.mktemp(suffix='.mp3')
    # 効果音は短いので、確認用ページでも音質をあまり落とさない(48kbps)
    se = p.startswith('assets/se/')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', pub + p, '-c:a', 'libmp3lame', '-ac', '1', '-ar', '32000' if se else '22050', '-b:a', '48k' if se else '20k', tmp], check=True)
    assets[p] = 'data:audio/mpeg;base64,' + base64.b64encode(open(tmp, 'rb').read()).decode()
    os.remove(tmp)
# MYTHCLASH の絵は、Artifact の絵の置き場(/_blob/...)にあげた場所を使う(iPhone のアプリでは横に置いたファイルが読めなかった 2026-10-28)。
# あげていない・変わった絵は、下で一覧に出す(あげて tools/preview_blobs.py で覚えさせてから作りなおす)
sys.path.insert(0, os.path.join(root, 'tools'))
import preview_blobs
need_upload = []
for f in sorted(glob.glob(pub + 'assets/mythclash/**/*.webp', recursive=True)):
    rel = os.path.relpath(f, pub)
    url = preview_blobs.lookup('game', pub, rel)
    if url:
        assets[rel] = url
    else:
        need_upload.append('public/' + rel)
jsons = {p: json.load(open(pub + p)) for p in ['assets/bunk/parts/parts.json', 'assets/bunk/down/parts.json', 'assets/bunk/faces/faces.json']}
html = open(out).read()
start = html.index('<script>window.__MONZ_ASSETS') if '__MONZ_ASSETS' in html else html.index('<script type="module">')
html = html[:start] + '<script>window.__MONZ_ASSETS = ' + json.dumps(assets) + ';\nwindow.__MONZ_JSON = ' + json.dumps(jsons) + ';</script>\n' + \
    '<script type="module">\ndocument.getElementById(\'boot\')?.remove();\n' + js + '\n</script>\n'
open(out, 'w').write(html)
# MYTHCLASH の絵(カードはこれから100枚以上ふえる・対戦相手の顔・タワーなど)はページに入れず、ページの横に別のファイルとして置く
# (企画者 2026-10-28: 確認用ページの大きさが増え続けないように)。ゲームは assets/mythclash/... を読みにいく(埋め込みが無いと、その場所を読む)ので、
# 同じ場所に置いて Artifact の files で出す。ゲーム本体の絵をそのまま写す(圧縮しない)
import shutil
out_dir = os.path.dirname(os.path.abspath(out))
card_files = sorted(f for f in glob.glob(pub + 'assets/mythclash/**/*.webp', recursive=True))
for f in card_files:
    dst = os.path.join(out_dir, os.path.relpath(f, pub))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(f, dst)
print(round(len(html) / 1e6, 2), 'MB', len(assets), 'images', '+', len(card_files), 'MYTHCLASH files (assets/mythclash/)')
if need_upload:
    print('あげる絵(Artifact の asset。あげたら tools/preview_blobs.py game public ...):')
    for f in need_upload:
        print(' ', f)
