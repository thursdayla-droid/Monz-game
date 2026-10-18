# MONZ（モンズ）

世界に1体だけの生命体を誕生させ、育て、オートバトルさせるスマホ向けWebゲーム。

- 遊ぶ（公開後）: https://thursdayla-droid.github.io/Monz/
- デバッグ表示: URLの最後に `?debug=1` を付ける
- 表示がおかしいとき: URLの最後に `?canvas` を付けると別の描画方式で動く

## 現在の段階

**試作0**: BUNK系のMONZがランダムに生まれ、呼吸・まばたき・歩く・眠る・なでると反応する様子を確認する画面。

> **BUNKの画像は【仮素材・未承認】です。** 企画者の承認前の試作用素材です（`design/bunk/README.md`）。

## 開発の流れ（iPhoneだけで行う）

1. Claude Code に依頼する → ブランチに変更がpushされる
2. GitHub の Actions タブでテストが通ったか確認する（緑のチェック）
3. Pull Request を「Merge」すると、数分で上のURLに反映される

## フォルダ構成

| 場所 | 中身 |
|---|---|
| `src/core/` | ゲームのルール（DNA・性格・反応・配色）。画面に依存しない |
| `src/render/` | MONZの組み立て・アニメーション・鳴き声 |
| `src/scenes/` | 各画面 |
| `public/assets/` | ゲームで使う画像（パーツ表から切り出したもの）。BUNKは【仮素材・未承認】 |
| `design/` | パーツ表の原画と、切り出し位置の設定 |
| `tools/` | パーツ表から画像を切り出すツール |
| `docs/` | 仕様・提案・決定事項 |
| `tests/` | 自動テスト |

## 新しいパーツ表を追加するとき

1. ChatGPTで透明背景のパーツ表(PNG)を作る
2. `design/<系統名>/parts-sheet.png` に置き、`parts-map.json` に各パーツのおおよその位置を書く
3. `python3 tools/extract_parts.py design/<系統名>/parts-map.json public/assets/<系統名>` で切り出す
