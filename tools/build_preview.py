"""確認用ページ(1つのHTMLに絵と曲を埋め込んだもの)を作る。企画者がiPhoneで遊んで確かめるためのページ。
使い方: rm -rf dist && npm run build && python3 -I tools/build_preview.py <出力先.html>
- 出力先のファイルがすでにあれば、その中の古いゲームを差しかえる(なければ下の HTML のひな形から作る)
- iPhone で開けるように 15MB より小さくする(15MB をこえると開けなかった 2026-10-21)。圧縮は確認用ページだけ(ゲーム本体の素材はそのまま)
- 新しい素材のフォルダを足したら、下の paths にも足す
- 確認用ページは2つ(企画者 2026-10-29「ミスクラッシュの確認用は分けて良い」。カードが100枚以上になっても15MBに収まるように):
  ・ゲームの確認用ページ: python3 -I tools/build_preview.py <出力先.html>
    MYTHCLASH のカードの絵だけ入れない(カードはプログラムの絵になる)。ほかは全部
  ・MYTHCLASH の確認用ページ: python3 -I tools/build_preview.py <出力先.html> --myth
    MYTHCLASH の絵・曲・効果音だけ。MYTHCLASH のタイトルから始まる(もどるの代わりに確認用のボタン)
"""
import base64, struct, glob, io, json, os, sys
from PIL import Image
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
MYTH = '--myth' in sys.argv[2:]
# 2026-11-08: 麻雀RPG の 確認用ページ(--mahjong)。牌の 絵と 音だけ。TAP TO START → 対局
MJ = '--mahjong' in sys.argv[2:]
# 2026-11-10: MONZ SLOT の 確認用ページ(--slot)。絵は ない(図柄は プログラムの 仮の 絵)。曲は main と 効果音だけ
SLOT = '--slot' in sys.argv[2:]
# 3Dオートバトルの確認用ページ(2026-11-01)。絵は入れない(仮の人形なので)。曲はバトルの1曲だけ
# 2026-11-05: STREET KING(ストーリー)の 確認用ページ(--story)。10種族の 第1形態の モデル + 一枚絵
STORY = '--story' in sys.argv[2:]
# 2026-11-24 9つめ: 冒険(--adv)。10種族の 第1形態の モデル + 敵の 絵。開くと 冒険から(STREET KING の ページが 15MB に 入らなくなったため)
RPG = '--rpg' in sys.argv[2:]
ADV = '--adv' in sys.argv[2:] or RPG
B3D = '--b3d' in sys.argv[2:] or '--b3d2' in sys.argv[2:] or STORY or ADV
# 2026-11-04: 10体の3Dモデルは 1ページ(15MB)に入らないので、新しい5体(RIOT など)は 2つめのページ(--b3d2)。相手の BUNK の3体は 両方に入れる
B3D2 = '--b3d2' in sys.argv[2:]
# 2026-11-15 8つめ: お世話の 姿(全種族の 姿・気持ちの 絵)。ゲームの ページに 入りきらないので、ミニゲームの 絵・曲を 外した ページ
CARE = '--care' in sys.argv[2:]
NEW5 = ('riot', 'rioter', 'riotrax', 'grit', 'gritter', 'gritbull', 'snek', 'sneker', 'snekxus', 'vybe', 'vyga', 'vygard', 'shellz', 'sheld', 'sheldozer')
if not os.path.exists(out):
    open(out, 'w').write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>' + ('STREET KING 確認用' if STORY else '擬人化RPG 試作' if RPG else '冒険 確認用' if ADV else '3Dバトル 確認用2' if B3D2 else '3Dバトル 確認用' if B3D else 'MYTHCLASH 確認用' if MYTH else 'ROYAL JACKPOT 確認用' if SLOT else 'お世話 確認用' if CARE else 'MONZ') + '</title>'
                         '<style>html,body{margin:0;height:100%;background:#1b1024;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}#game{width:100%;height:100%}</style></head>'
                         '<body><div id="boot" style="color:#fff;font:20px sans-serif;text-align:center;padding-top:40vh">よみこみ中…</div><div id="game"></div>\n<script type="module"></script></body></html>')
js = open(glob.glob(root + '/dist/assets/index-*.js')[0]).read()
assert '</script' not in js
pub = root + '/public/'
myth_paths = sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/mythclash/*.webp') + glob.glob(pub + 'assets/mythclash/opponents/*.webp'))
card_paths = sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/mythclash/cards/*.webp'))
if B3D:
    # 企画者の BUNK の3Dモデル(軽くしたもの)
    paths = sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/battle3d/*.glb') + glob.glob(pub + 'assets/battle3d/*.webp'))
    is_new = lambda p: os.path.basename(p)[:-4] in NEW5
    is_bunk = lambda p: os.path.basename(p).startswith('bunk') or p.endswith('.webp')
    FORM1 = ('bunk', 'mofu', 'zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz', 'crownor')
    if STORY or ADV:
        # 1〜2章(第1形態)の 10体 + 一枚絵。3章から(第2・最終形態)の モデルは 入らないので 仮の人形
        paths = [p for p in paths if p.endswith('.webp') or os.path.basename(p)[:-4] in FORM1]
        if STORY:
            paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/story/*.webp'))
            # 2026-11-25 冒険の 床・壁の 絵は 15MB に 入らないので 冒険の ページだけ(ここでは 前の 仮の 絵)
        else:
            # 2026-11-24 冒険の 敵の 絵(SLIME など)は 冒険の ページだけ
            paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/adventure/*.webp'))
            # 2026-11-26 擬人化RPG の 試作(--rpg): 企画者の BUNK 擬人化 モデル
            if RPG:
                # 擬人化RPG の ページは 擬人化の モデルだけ(MONZ の 3D モデルは 入れない。15MB に 入れるため)
                paths = [p for p in paths if not p.endswith('.glb')]
                paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/rpg/*.glb') + glob.glob(pub + 'assets/rpg/gear/*.glb') + glob.glob(pub + 'assets/rpg/fx/*.webp'))
    else:
        paths = [p for p in paths if (is_new(p) or is_bunk(p) or p.endswith(('crownie.glb', 'crownix.glb')))] if B3D2 else [p for p in paths if not is_new(p)]
        # 2026-11-06 CROWNOR は 15MB に 入らないので STREET KING の ページ(--story)だけ
        paths = [p for p in paths if not p.endswith('crownor.glb')]
        # 2026-11-09 CROWNIE(第1形態)の モデルは 2つめの ページ(--b3d2)だけ
        if not B3D2:
            paths = [p for p in paths if not p.endswith(('crownie.glb', 'crownix.glb'))]
        else:
            # 15MB に 入れるため、このページの BUNKLORD(相手の BUNK の 最終形態)は はずす(BUNKER で 代わり)
            # 2026-11-10 CROWNIX も 入れるので BUNKER(相手の BUNK の 第2形態)も はずす(このページでは 相手の BUNK の 第2・第3形態は 仮の 人形)
            paths = [p for p in paths if not p.endswith(('bunklord.glb', 'bunker.glb'))]
elif MYTH:
    paths = myth_paths + card_paths
elif SLOT:
    # 2026-11-10 企画者の 図柄の 絵
    paths = sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/slot/**/*.webp', recursive=True) + glob.glob(pub + 'assets/scratch/*.webp') + glob.glob(pub + 'assets/furniture/cyber_yukirobo.webp'))
elif MJ:
    paths = sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/mahjong/*.webp'))
    # 左右の キャラ(勇者 ZIPP・ボス RIOT・子分 SNEK／GRIT【仮】)
    paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/mahjong/chars/*.webp') + glob.glob(pub + 'assets/mahjong/bg/*.webp') + glob.glob(pub + 'assets/mahjong/story/*.webp'))
else:
    paths = ['assets/title/title_v2.webp', 'assets/bunk/reference/bunk_hires_cutout.png', 'assets/bunk/reference/bunk_down_cutout.png']
    for d in ['parts', 'down', 'faces']:
        paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + f'assets/bunk/{d}/*.png'))
    paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/birth/*.webp') + glob.glob(pub + 'assets/home/*.webp') + glob.glob(pub + 'assets/home/icons/*.webp') + glob.glob(pub + 'assets/home/rooms/*.webp') + glob.glob(pub + 'assets/furniture/*.webp') + glob.glob(pub + 'assets/bunk/poses/*.webp') + glob.glob(pub + 'assets/minigame/*.webp') + glob.glob(pub + 'assets/mofu/*.webp') + glob.glob(pub + 'assets/mofu/parts/*.webp') + glob.glob(pub + 'assets/scratch/*.webp') + glob.glob(pub + 'assets/slot/sym_*.webp'))
    # 2026-11-15 お世話の 姿の 絵(BUNK 以外)は お世話の ページ(--care)だけ。そのページには ミニゲームの 絵を 入れない
    # (15MB に 入れるため MYTHCLASH の 絵は MYTHCLASH の ページ(--myth)だけに)
    if CARE:
        paths = [p for p in paths if not p.startswith('assets/minigame/')]
        paths += sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/poses/*/*.webp'))
assets = {}
for p in paths:
    if p.endswith('.glb'):
        # 2026-11-01: モデルの中の絵(テクスチャ)を data: にする。GLB の中の絵は blob で読まれ、iPhone のアプリで止められるため
        raw = open(pub + p, 'rb').read()
        jlen = struct.unpack('<I', raw[12:16])[0]
        gj = json.loads(raw[20:20 + jlen])
        blen = struct.unpack('<I', raw[20 + jlen:24 + jlen])[0]
        binc = raw[28 + jlen:28 + jlen + blen]
        for im in gj.get('images', []):
            if 'bufferView' in im:
                bv = gj['bufferViews'][im.pop('bufferView')]
                data = binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
                # 2026-11-03: 15体のモデルで上限(15MB)をこえるので、確認用ページだけ モデルの絵を 512 にする(ゲーム本体はそのまま)
                try:
                    pim = Image.open(io.BytesIO(data))
                    # 2026-11-04: 2つめのページ(新しい5体)は 15体 + BUNK で 上限をこえるので 400 に
                    lim = 400 if B3D2 else 512
                    if max(pim.size) > lim:
                        pim.thumbnail((lim, lim), Image.LANCZOS)
                        bb = io.BytesIO()
                        # 2026-11-24 STREET KING の ページが 冒険の しかけで 15MB を こえた → 74
                        pim.save(bb, 'WEBP', quality=70 if B3D2 else 74 if STORY else 82, method=6)
                        data = bb.getvalue()
                        im['mimeType'] = 'image/webp'
                except Exception:
                    pass
                im['uri'] = f"data:{im.pop('mimeType', 'image/webp')};base64," + base64.b64encode(data).decode()
        gjs = json.dumps(gj, separators=(',', ':')).encode()
        gjs += b' ' * ((4 - len(gjs) % 4) % 4)
        body = struct.pack('<I4s', len(gjs), b'JSON') + gjs + struct.pack('<I4s', len(binc), b'BIN\x00') + binc
        out_glb = struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body
        assets[p] = 'data:model/gltf-binary;base64,' + base64.b64encode(out_glb).decode()
        continue
    if p.endswith('.webp'):
        # 確認用ページの上限のため、大きい背景だけ少し圧縮しなおす(ゲーム本体はそのまま)
        data = open(pub + p, 'rb').read()
        if p.startswith('assets/mythclash/cards/'):
            # 企画者のカードの絵(最大100枚)は、確認用ページでは 300×417 に小さくする(大きく見たときに少しぼける。ゲーム本体はそのまま)
            bb = io.BytesIO()
            Image.open(pub + p).resize((300, 417), Image.LANCZOS).save(bb, 'WEBP', quality=72, method=6)
            data = bb.getvalue()
        elif p.startswith('assets/story/') and Image.open(pub + p).width > 1100:
            # (2026-11-07 ボタン・カーソルなど 小さい絵は そのまま)
            # 2026-11-05 STREET KING の 一枚絵(30枚まで 増える): 確認用ページでは 横1024 に(画面いっぱいに 出すのは 同じ。少し ぼける。ゲーム本体は そのまま)
            bb = io.BytesIO()
            im = Image.open(pub + p)
            im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS).save(bb, "WEBP", quality=28, method=6)
            data = bb.getvalue()
        elif p.startswith('assets/slot/jackpot/'):
            # 2026-11-17 大当たりの 絵(液晶に 出す): 確認用ページでは 横 800 に(15MB に 入れるため。ゲーム本体は そのまま)
            bb = io.BytesIO()
            im = Image.open(pub + p)
            # 2026-11-20 CROWN RUSH の マスの 絵で スロットの ページが こえた → スロットの ページは 34
            im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS).save(bb, 'WEBP', quality=34 if SLOT else 40, method=6)
            data = bb.getvalue()
        elif SLOT and p.startswith('assets/slot/reach/'):
            # 2026-11-17 リーチの 絵が ふえて 15MB を こえた: スロットの 確認用ページでは 横 800 に(ゲーム本体は そのまま)
            bb = io.BytesIO()
            im = Image.open(pub + p)
            if im.width > 800:
                im = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
            # 2026-11-20 CROWN RUSH の 絵で また こえた → 33
            # 2026-11-21 ナンパリーチの 絵で こえた → 横 720・25
            if im.width > 720: im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
            im.convert('RGB').save(bb, 'WEBP', quality=25, method=6)
            data = bb.getvalue()
        elif p.startswith('assets/scratch/board_'):
            # スクラッチの 板: 確認用ページでは 横 300 に
            bb = io.BytesIO()
            im = Image.open(pub + p)
            im.thumbnail((300, 520))
            im.save(bb, 'WEBP', quality=45, method=6)
            data = bb.getvalue()
        elif p.startswith('assets/scratch/') or (not SLOT and p.startswith('assets/slot/sym_')):
            # 2026-11-17 スクラッチの 券・マーク: 確認用ページでは 小さく(ゲーム本体は そのまま)
            bb = io.BytesIO()
            im = Image.open(pub + p)
            im.thumbnail((128, 128))
            im.save(bb, 'WEBP', quality=45, method=6)
            data = bb.getvalue()
        elif p.startswith('assets/poses/'):
            # 2026-11-15 お世話の 姿の 絵(10種族×6枚): 確認用ページでは 高さ 260 に(画面では 小さく 出すので 見た目の 大きさは 同じ。ゲーム本体は そのまま)
            bb = io.BytesIO()
            im = Image.open(pub + p)
            # 2026-11-22 姿が ふえて 15MB を こえた → 34・高さ 220
            im.resize((round(im.width * 220 / im.height), 220), Image.LANCZOS).save(bb, 'WEBP', quality=34, method=6)
            data = bb.getvalue()
        elif p.startswith('assets/mythclash/opponents/'):
            # 対戦相手の顔(33人分)は、確認用ページでは 160×160 に小さくする(画面では丸く小さく出すので見た目はほぼ同じ)
            bb = io.BytesIO()
            Image.open(pub + p).resize((160, 160), Image.LANCZOS).save(bb, 'WEBP', quality=62 if MYTH else 52, method=6)
            data = bb.getvalue()
        # 2026-10-27: 対戦相手の顔の分をあけるため、少し小さい絵も圧縮しなおす。
        # 2026-10-28: MYTHCLASH の絵をまたページに入れた(別ファイルは iPhone のアプリで読めなかった。企画者「戻そう」)ので、30KBより大きい絵を quality 42 に(カード・顔は 52、タイトルの絵は 72)
        # 2026-11-01: 3Dバトルの道具(Three.js)でプログラムが大きくなったので、ゲームの確認用ページは quality 38 に(15MB 未満にするため)
        # 2026-10-29: MYTHCLASH の確認用ページは分けたので、MYTHCLASH の絵は 60KBより大きいものを quality 55 に(前のとおり)
        elif len(data) > (60_000 if MYTH else 30_000):
            bb = io.BytesIO()
            # 2026-11-03: MOFU の絵を足して15MBをこえたので、ゲームの確認用ページは quality 34 に
            # 2026-11-19: MONZ CARD の ジョーカーの 絵と 役の 表で 15MB を こえたので 32 に
            Image.open(pub + p).save(bb, 'WEBP', quality=55 if MYTH else 32, method=6)
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
        Image.open(pub + p).convert('RGBA').save(b, 'WEBP', quality=72 if p.startswith('assets/title/') else 78, method=6)
    else:
        Image.open(pub + p).convert('RGBA').save(b, 'WEBP', lossless=True, quality=100, method=4)
    assets[p] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
# まだ画面で使っていない曲は、確認用ページに入れない(ページの大きさの上限 16MB のため)。使う画面ができたら外す
BGM_NOT_YET: set[str] = set()
for p in sorted(os.path.relpath(f, pub) for f in glob.glob(pub + 'assets/bgm/*.mp3') + glob.glob(pub + 'assets/se/**/*.mp3', recursive=True)):
    # MYTHCLASH の確認用ページには、MYTHCLASH の曲と効果音だけ
    if MJ and not (p.startswith('assets/se/') or p.endswith('mahjong.mp3')):
        continue
    if SLOT and not (p.startswith('assets/se/') or p.endswith(('/slot.mp3', '/slot_bonus.mp3', '/slot_jackpot.mp3', '/slot_jackpot2.mp3'))):
        continue
    # 2026-11-15 ゲームの ページは 15MB に 入れるため、べつの 確認用ページが ある 遊び(麻雀・スロット・MYTHCLASH)の 曲は 入れない
    if not (MJ or SLOT or MYTH or B3D) and p.startswith('assets/bgm/') and any(k in p for k in ('mahjong', 'slot', 'mythclash') + (('dash', 'slugger', 'card', 'battle') if CARE else ())):
        continue
    if p in BGM_NOT_YET or (MYTH and 'mythclash' not in p) or (B3D and 'battle' not in p and not (STORY and 'ending' in p) and not p.startswith('assets/se/')) or (B3D and not STORY and p.endswith(('battle2.mp3', 'battle3.mp3'))):
        continue
    # 確認用ページの大きさの上限(16MB)のため、曲は軽く(モノラル20kbps・2026-10-26 に28k→24k→20kと下げた。22kHzでは実際は16kbpsになる)して埋め込む。ゲーム本体は元の音質のまま
    # 2026-11-04: 戦闘BGM が増えて ゲームのページが 15MB をこえたので、ゲームのページだけ 16k
    import subprocess, tempfile
    tmp = tempfile.mktemp(suffix='.mp3')
    # 2026-11-07: STREET KING のページが 15MB をこえたので、エンディング曲だけ 12k
    # 効果音は短いので、確認用ページでも音質をあまり落とさない(48kbps)
    # 2026-11-09: 麻雀クエストの ページは 軽いので 曲も 64kbps(企画者の 対戦BGM)
    se = p.startswith('assets/se/')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', pub + p, '-c:a', 'libmp3lame', '-ac', '1', '-ar', '32000' if se or MJ or SLOT else ('16000' if (STORY and 'ending' in p) else '22050' if (B3D or MYTH) else '16000'), '-b:a', '48k' if se else ('64k' if MJ else '32k' if SLOT else '12k' if (STORY and 'ending' in p) else '20k' if (B3D or MYTH) else '12k'), tmp], check=True)
    assets[p] = 'data:audio/mpeg;base64,' + base64.b64encode(open(tmp, 'rb').read()).decode()
    os.remove(tmp)
jsons = {p: json.load(open(pub + p)) for p in ['assets/bunk/parts/parts.json', 'assets/bunk/down/parts.json', 'assets/bunk/faces/faces.json']}
html = open(out).read()
start = html.index('<script>window.__MONZ_ASSETS') if '__MONZ_ASSETS' in html else html.index('<script type="module">')
# MYTHCLASH の確認用ページは MYTHCLASH のタイトルから。ゲームの確認用ページはカードの絵を読みにいかない(入れていないので)
flags = "window.__MONZ_START = 'Adventure'; window.__MONZ_NO_CARD_ART = true;" + (" window.__MONZ_RPG = true;" if RPG else "") if ADV else "window.__MONZ_START = 'SlotTitle'; window.__MONZ_NO_CARD_ART = true;" if SLOT else "window.__MONZ_START = 'MahjongQuest'; window.__MONZ_NO_CARD_ART = true;" if MJ else "window.__MONZ_START = 'RumbleMode'; window.__MONZ_NO_CARD_ART = true;" if B3D else "window.__MONZ_START = 'MythTitle';" if MYTH else 'window.__MONZ_NO_CARD_ART = true;'
html = html[:start] + '<script>window.__MONZ_ASSETS = ' + json.dumps(assets) + ';\nwindow.__MONZ_JSON = ' + json.dumps(jsons) + ';\n' + flags + '</script>\n' + \
    '<script type="module">\ndocument.getElementById(\'boot\')?.remove();\n' + js + '\n</script>\n'
open(out, 'w').write(html)
print(round(len(html) / 1e6, 2), 'MB', len(assets), 'images')
