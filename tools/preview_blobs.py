"""
確認用ページ(Artifact)にあげた絵の置き場所(/_blob/...)を覚えておく(2026-10-28)。
iPhone の Claude アプリでは、ページの横に置いた別のファイル(assets/mythclash/...)が読めなかった。
Artifact の「絵の置き場」(assets)にあげた絵は /_blob/<id> で、どの見え方でも読める。
- tools/preview_blobs.json: {"game": {ファイルの場所: {"url", "sha256"}}, "cards": {...}}
  game: ゲームの確認用ページ(public/ からの場所)/ cards: カード一覧のページ(出力フォルダからの場所)
- 絵が変わったら(sha256 がちがう)あげなおしが要る。build_preview.py・build_cards_page.py が、あげなおしの要る絵を出す
使い方(あげたあと): python3 -I tools/preview_blobs.py <game|cards> <ファイルのある元のフォルダ> <場所>=<url> ...
"""
import hashlib
import json
import os
import sys

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'preview_blobs.json')


def load() -> dict:
    return json.load(open(FILE)) if os.path.exists(FILE) else {'game': {}, 'cards': {}}


def sha(path: str) -> str:
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def lookup(kind: str, base: str, rel: str):
    """あげてあって中身も同じなら url。ちがえば None"""
    e = load().get(kind, {}).get(rel)
    return e['url'] if e and e['sha256'] == sha(os.path.join(base, rel)) else None


if __name__ == '__main__':
    kind, base = sys.argv[1], sys.argv[2]
    data = load()
    for arg in sys.argv[3:]:
        rel, url = arg.split('=', 1)
        data.setdefault(kind, {})[rel] = {'url': url, 'sha256': sha(os.path.join(base, rel))}
    json.dump(data, open(FILE, 'w'), indent=1, sort_keys=True)
    print(len(data.get(kind, {})), kind)
