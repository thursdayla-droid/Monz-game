# MONZ 開発ルール（Claude Code向け）

企画者が最終決定権を持つ。仕様の正本は `docs/PROPOSAL.md`（確定/未確定の区別あり）。

## 守ること
- 確定仕様と未確定仕様を区別する。未確定のものはコード中に【未確定】【仮】と書く。
- ミニゲームの種類・ルール、街の内容は企画者が決める。勝手に実装しない（差し込み口だけ作るのはよい）。
- 新しい仕様を追加する前に企画者へ確認する。各フェーズは企画者の承認後に進める。
- 既存作品（ポケモン等）に似たキャラクターを作らない。
- 企画者はiPhoneのみで作業する。説明は日本語・専門用語を避けて短く。PCでの操作を前提にした手順を出さない。
- 使うサービスは Claude Code・ChatGPT・GitHub のみ。費用がかかるものは事前に確認する。

## 技術
- Phaser 4 + TypeScript + Vite。テストは Vitest（`npm test`）、型チェックは `npm run typecheck`。
- `npm install` は `.npmrc` の legacy-peer-deps 前提。
- `src/core/` は Phaser に依存させない（テスト・将来のサーバー検証のため）。乱数は `mulberry32` で種から再現できるようにする。
- DNA の見た目の決め方を変えるときは `GENERATOR_VERSION` を上げ、既存個体の見た目が変わらないようにする。
- WebGL は `maxTextures: 1`（複数枚にすると一部の環境でパーツが欠けたため）。
- キャラクターの見た目の基準は元の公式参考画像。AIで全体を描き直さない。元画像のピクセルを切り出して使い、隠れていた部分だけを補う（`design/bunk/README.md`）。
- main への push で GitHub Pages に自動公開される（`.github/workflows/ci.yml`）。URL は https://thursdayla-droid.github.io/Monz-game/
