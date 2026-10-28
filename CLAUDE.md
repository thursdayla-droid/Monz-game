# MONZ 開発ルール（Claude Code向け）

企画者が最終決定権を持つ。

## 最初に読むもの（新しいセッション・会話が要約されたあと）
1. **`docs/SPEC.md`**：今の仕様・実装済み/未実装・素材の場所・今後の予定・いつもの手順（早見表）
2. 決定の記録：`docs/VISION.md`（全体）、`docs/ROOM_PLAN.md`（部屋・家具・ショップ）、`docs/PROPOSAL.md`（初期）
3. バトル：`docs/BATTLE.md`（アクションバトル。BUNKから作る）
4. カードゲーム：`docs/MYTHCLASH.md`（MYTHCLASH。バトルの計算は `src/core/mythclash/`、画面はまだ。`docs/CARD_BATTLE.md` は古い案）
5. まだ作らない仕様：`docs/EVOLUTION.md`（進化）

## 守ること
- 確定仕様と未確定仕様を区別する。未確定のものはコード中に【未確定】【仮】と書く。
- ミニゲームの種類・ルール、街の内容は企画者が決める。勝手に実装しない（差し込み口だけ作るのはよい）。
- 新しい仕様を追加する前に企画者へ確認する。各フェーズは企画者の承認後に進める。
- 既存作品（ポケモン等）に似たキャラクターを作らない。
- 企画者はiPhoneのみで作業する。説明は日本語・専門用語を避けて短く。PCでの操作を前提にした手順を出さない。
- 使うサービスは Claude Code・ChatGPT・GitHub のみ。費用がかかるものは事前に確認する。
- 説明は必ず日本語（英語で返さない）。ゲーム画面の英語（STREET ROOM など）はよい。
- ミニゲームの遊び方の説明に報酬（コイン・経験値の決まり）を書かない。
- VIP ROOM（4つめの部屋）は、引越し券を買うまで画面のどこにも出さない（名前・枠・？？？・鍵マークも）。
- 既存のゲームデータ・コード・企画者の絵を消したり初期化したりしない。使わなくなった絵は `unused/` などに移して残す。保存データの形を変えるときは古いデータが読めるようにする（`migrateLife`）。
- 決まったことは日付つきで `docs/VISION.md` か `docs/ROOM_PLAN.md` に書き、`docs/SPEC.md` も直す。
- 作業ブランチは `claude/monz-game-development-pztk8y`。main への公開は企画者の許可が出てから（公開前に開発用ボタンを外す）。
- 企画者に見せるときは確認用ページ（`tools/build_preview.py`、Artifact）を更新する。絵を軽くするのはよいが、ゲーム画面の見た目（大きさ）は小さくしない。MYTHCLASH の絵はページに埋め込まず別ファイルで出す。カードを足したらカード一覧（`tools/build_cards_page.py`、別の Artifact）も更新する（手順は `docs/SPEC.md` の10）。

## 技術
- Phaser 4 + TypeScript + Vite。テストは Vitest（`npm test`）、型チェックは `npm run typecheck`。
- `npm install` は `.npmrc` の legacy-peer-deps 前提。
- `src/core/` は Phaser に依存させない（テスト・将来のサーバー検証のため）。乱数は `mulberry32` で種から再現できるようにする。
- DNA の見た目の決め方を変えるときは `GENERATOR_VERSION` を上げ、既存個体の見た目が変わらないようにする。
- WebGL は `maxTextures: 1`（複数枚にすると一部の環境でパーツが欠けたため）。
- キャラクターの見た目の基準は元の公式参考画像。AIで全体を描き直さない。元画像のピクセルを切り出して使い、隠れていた部分だけを補う（`design/bunk/README.md`）。
- main への push で GitHub Pages に自動公開される（`.github/workflows/ci.yml`）。URL は https://thursdayla-droid.github.io/Monz-game/
