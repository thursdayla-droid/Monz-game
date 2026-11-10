# MONZ 開発ルール（Claude Code向け）

企画者が最終決定権を持つ。

## 最初に読むもの（新しいセッション・会話が要約されたあと）
1. **`docs/SPEC.md`**：今の仕様・実装済み/未実装・素材の場所・今後の予定・いつもの手順（早見表）
2. 決定の記録：`docs/VISION.md`（全体）、`docs/ROOM_PLAN.md`（部屋・家具・ショップ）、`docs/PROPOSAL.md`（初期）
3. バトル：`docs/BATTLE.md`（アクションバトル。BUNKから作る）
4. カードゲーム：`docs/MYTHCLASH.md`（MYTHCLASH。バトルの計算は `src/core/mythclash/`、画面はまだ。`docs/CARD_BATTLE.md` は古い案）
5. 冒険：`docs/ADVENTURE.md`（2026-11-07〜。作る順番どおりに）
5.5 麻雀RPG（ミニゲーム④）：`docs/MAHJONG.md`（2026-11-08〜）
5.6 ROYAL JACKPOT（ミニゲーム⑤。旧 仮名 MONZ SLOT）：`docs/SLOT.md`（2026-11-10〜）
6. 進化：`docs/EVOLUTION.md`（2026-11-09〜 お世話画面の 姿だけ 作った）

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
- 作業ブランチは `claude/monz-game-development-pztk8y`。main への公開は企画者の許可が出てから（公開前に開発用ボタンを外す）。2026-11-08〜 友だちが公開テスト中なので、main（公開ページ）は更新しない。
- 企画者に見せるときは確認用ページ（`tools/build_preview.py`、Artifact）を更新する。絵を軽くするのはよいが、ゲーム画面の見た目（大きさ）は小さくしない。絵はページに埋め込む（別ファイルは iPhone のアプリで絵が出なかった。2026-10-28）。ページは15MBより小さくする。確認用ページは2つ（2026-10-29）：ゲーム（https://claude.ai/artifact/9qauCQZ9xmdERAFrzwkeLh、カードの絵なし）と MYTHCLASH（https://claude.ai/artifact/2RpHDeUoZMYJBa7ZWKm2gh、`--myth`）。カードを足したら MYTHCLASH のほうを更新する。3つめ（2026-11-01）：3Dバトル（https://claude.ai/artifact/Rv4aV9XjHP97Rrp5H5B1Sw、`--b3d`。仮の人形の3D試作）。4つめ（2026-11-04）：3Dバトル2（https://claude.ai/artifact/J54piu7PP8DddeJbYd4b7B、`--b3d2`。新しい5体 RIOT など。10体のモデルは1ページに入らないため）。5つめ（2026-11-05）：STREET KING（https://claude.ai/artifact/Vs5drxR7fhbEwFcu83unsu、`--story`。ストーリーの一枚絵・話と、1〜2章の敵10体〔第1形態〕のモデル。一枚絵を足したらこのページを更新する）。6つめ（2026-11-08）：麻雀RPG（https://claude.ai/artifact/K7BrHhevmkfxLc6s32eypH、`--mahjong`。牌の絵と音だけ。TAP TO START → 対局）。7つめ（2026-11-10）：MONZ SLOT（https://claude.ai/artifact/8JuDcyJnamVswcr76fmJtu、`--slot`。スロット画面から始まる・確認用の +10,000 コイン ボタン）。カード一覧のページ（`tools/build_cards_page.py`）は今は使わない。

## 技術
- 【必ず】画面は 全画面（2026-11-08 企画者「アプリで 販売する。基本 全画面が いい」）。新しい 画面・新しい 絵も すべて 全画面で 作る。たては src/ui/viewport.ts の fillTall で スマホの 形まで のばす。背景の 絵は 縦長 9:19.5（1080×2340）で 頼む（絵に ボタンを 描く 時は 横はばを 切らない）。ゲームは iPhone の 時計・電池の 帯の 下から（index.html）。
- Phaser 4 + TypeScript + Vite。テストは Vitest（`npm test`）、型チェックは `npm run typecheck`。
- `npm install` は `.npmrc` の legacy-peer-deps 前提。
- `src/core/` は Phaser に依存させない（テスト・将来のサーバー検証のため）。乱数は `mulberry32` で種から再現できるようにする。
- DNA の見た目の決め方を変えるときは `GENERATOR_VERSION` を上げ、既存個体の見た目が変わらないようにする。
- WebGL は `maxTextures: 1`（複数枚にすると一部の環境でパーツが欠けたため）。
- キャラクターの見た目の基準は元の公式参考画像。AIで全体を描き直さない。元画像のピクセルを切り出して使い、隠れていた部分だけを補う（`design/bunk/README.md`）。
- main への push で GitHub Pages に自動公開される（`.github/workflows/ci.yml`）。URL は https://thursdayla-droid.github.io/Monz-game/
