# MONZ（モンズ）

世界に1体だけの生命体を誕生させ、育て、オートバトルさせるスマホ向けWebゲーム。

- 遊ぶ: https://thursdayla-droid.github.io/Monz-game/ （BUNKの動きのテスト画面から始まる）
- 元画像との比較画面（開発用）: URLの最後に `?compare` を付ける
- デバッグ表示: URLの最後に `?debug=1` を付ける
- 表示がおかしいとき: URLの最後に `?canvas` を付けると別の描画方式で動く

## 現在の段階

**BUNKのパーツ組み立てテスト**（【仮】テスト版）: 元の公式参考画像をパーツに分けて組み立て、呼吸・まばたき・拳の小さな揺れを付けて確認する段階です。

> BUNKのデザインの基準は元の公式参考画像だけです（`design/bunk/README.md`）。AIでキャラクター全体を描き直すことはしません。

## 開発の流れ（iPhoneだけで行う）

1. Claude Code に依頼する → ブランチに変更がpushされる
2. GitHub の Actions タブでテストが通ったか確認する（緑のチェック）
3. Pull Request を「Merge」すると、数分で上のURLに反映される

## フォルダ構成

| 場所 | 中身 |
|---|---|
| `src/core/` | ゲームのルール（DNA・性格・反応・配色・BUNKの動きの計算）。画面に依存しない |
| `src/render/` | BUNKの組み立てと動き、鳴き声 |
| `src/scenes/` | 各画面（比較画面・パーツ組み立てテスト） |
| `public/assets/` | ゲームで使う画像。BUNKは `bunk/reference/`（元画像）と `bunk/parts/`（パーツ） |
| `design/` | 元画像と、パーツ分けの設定 |
| `tools/` | 背景を消す・パーツに分ける・動きを確かめるツール |
| `docs/` | 仕様・提案・決定事項 |
| `tests/` | 自動テスト |

## 元画像からキャラクターを作るとき

1. 元画像を `design/<系統名>/reference/` に置く
2. `tools/remove_background.py` で背景だけを消す（本体の色は変えない）
3. `design/<系統名>/reference/split.json` にパーツの分け方を書き、`tools/split_parts.py` で分ける
4. `tools/check_motion.py` で、動かしたときに補った部分が見えないか確かめる
