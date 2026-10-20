import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 公開するゲームに入れないファイル(public/ にあっても dist/ から消す)。
 * - 開発用の画面(?compare の元画像比較・?parts のパーツ確認)だけで使う画像
 * - どこからも使っていない古い画像
 * 開発用の画面は、手元で動かす開発サーバー(npm run dev)では今までどおり使える。
 */
const DEV_ONLY_ASSETS = [
  'assets/bunk/reference/bunk_original_hires.png',
  'assets/bunk/reference/bunk_original.jpg',
  'assets/bunk/reference/bunk_cutout.png',
  'assets/bunk/parts/fill',
  'assets/bunk/down/fill',
];

function dropDevOnlyAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'monz-drop-dev-only-assets',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const p of DEV_ONLY_ASSETS) rmSync(join(outDir, p), { recursive: true, force: true });
    },
  };
}

// GitHub Pages では https://<user>.github.io/Monz-game/ 配下で公開されるため相対パスにする
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  plugins: [dropDevOnlyAssets()],
});
