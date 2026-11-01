# 3Dバトルのモデル

- `bunk_tripo_original.glb`：企画者がくれた BUNK の3Dモデル（Tripo で作成・2026-11-01）。元のまま残す（約100万頂点・16.9MB・骨なし・動きなし）。
- ゲームで使うのは軽くしたもの：`public/assets/battle3d/bunk.glb`（約4万三角形・絵は1024・webp・1.05MB）。見た目は元とほぼ同じ（比べた画像で確認）。
- 軽くする手順（gltf-transform 4.1.1。プロジェクトには入れず、作業用の場所で使う）:
  ```
  gltf-transform optimize bunk_tripo_original.glb bunk.glb --compress false --simplify-ratio 0.02 --simplify-error 0.002 --texture-size 1024 --texture-compress webp --instance false --join false --palette false
  ```
- 向き：前が +x、上が +y（ゲームと同じ）。高さ 約0.87 → ゲームでは 約1.55 に大きくする。
- 骨（関節）がないので、手足は別々に動かない。体全体を跳ねさせる・つぶす・かたむける・回す動きだけ。手足を動かすには、骨入れ（リギング）と動きのデータが必要。
