import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// build は dist/index.html の1ファイルにまとめる（ダブルクリックで遊べる）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  // いつも 5173 番（番号が変わると設定や将棋の続きが別々に保存されてしまうので、ずらさない）
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
});
