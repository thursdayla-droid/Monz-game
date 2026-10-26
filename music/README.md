# 曲の受け取り口

企画者が用意した曲（mp3 / m4a / wav。ゲームではどの端末でも鳴るよう mp3 にそろえる）をここに置く。
Claude Code が、音量をそろえてから `public/assets/bgm/` に入れ、`src/audio/bgmFiles.ts` に登録する。

| 使う場面 | ファイル | ゲーム用 |
| --- | --- | --- |
| タイトル・質問・誕生（メイン） | main_California_Sunset_Groove.m4a | public/assets/bgm/main.mp3 |
| お世話画面（ホーム） | home_Smooth_Minimal_Groove.m4a | public/assets/bgm/home.mp3 |
| MONZ CARD | card_Ten-Second_Timer.m4a | public/assets/bgm/card.mp3 |
| DASH MONZ | dash.m4a | public/assets/bgm/dash.mp3 |
| MONZ SLUGGER | slugger_Diamond_Glory.m4a | public/assets/bgm/slugger.mp3 |
| MYTHCLASH | mythclash_Shadowy_Contour.m4a | public/assets/bgm/mythclash.mp3 |
| MYTHCLASH パック開封 | mythclash_pack.m4a | public/assets/bgm/mythclash_pack.mp3 |

- 歌・ラップなし（インスト）。
- アプリで公開してよい（商用利用できる）曲だけを使う。

## 効果音（2026-10-26〜）
企画者の効果音は `music/se/`（受け取ったまま）。ゲーム用は音の大きさをそろえて（-15 LUFS）`public/assets/se/` に入れ、`src/audio/seFiles.ts` に登録する。

| 使う場面 | ファイル | ゲームの中の名前 |
| --- | --- | --- |
| MYTHCLASH 通常攻撃 | se/mythclash/attack.mp3 | mcSlash |
| MYTHCLASH 必殺技 | se/mythclash/special.mp3 | mcSpecial |
| MYTHCLASH 攻撃を防御で受けた（防御成功） | se/mythclash/guard_success.mp3 | mcGuardOk |
| MYTHCLASH 毒 | se/mythclash/poison.mp3 | mcPoison |
| MYTHCLASH 回復 | se/mythclash/heal.mp3 | mcHeal |
| MYTHCLASH 雷の魔法 | se/mythclash/magic_thunder.mp3 | mcThunder |
| MYTHCLASH 自然の魔法 | se/mythclash/magic_nature.mp3 | mcNature |
| MYTHCLASH 炎の魔法 | se/mythclash/magic_fire.mp3 | mcFire |
| MYTHCLASH 光の魔法 | se/mythclash/magic_light.mp3 | mcLight |
| MYTHCLASH 闇の魔法 | se/mythclash/magic_dark.mp3 | mcDark |
| MYTHCLASH HP吸収の魔法 | se/mythclash/drain.mp3 | mcDrain |
| MYTHCLASH 魔法防御成功 | se/mythclash/magic_guard_success.mp3 | mcMagicGuardOk |
| MYTHCLASH ステータス上昇（強化・バリア） | se/mythclash/buff.mp3 | mcBuff |
| MYTHCLASH 水の魔法 | se/mythclash/magic_water.mp3 | mcWater |
| MYTHCLASH カウンター成功（必殺と同じ音） | se/mythclash/special.mp3 | mcCounter |
| MYTHCLASH 必殺技のカットイン | se/mythclash/cutin.mp3 | mcCutin |
| MYTHCLASH 火傷 | se/mythclash/burn.mp3 | mcBurn |
