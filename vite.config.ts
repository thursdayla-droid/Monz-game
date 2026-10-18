import { defineConfig } from 'vite';

// GitHub Pages では https://<user>.github.io/Monz/ 配下で公開されるため相対パスにする
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
