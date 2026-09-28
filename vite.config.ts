import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// build は dist/index.html の1ファイルにまとめる（ダブルクリックで遊べる）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { port: Number(process.env.PORT) || 5173 },
});
