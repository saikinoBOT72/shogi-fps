// 非公開リポジトリ shogi-fps-sfx の game/ にある音を public/sfx/ へコピーする（public/sfx/ は公開リポジトリに入れない）
// 場所は SFX_DIR（ビルド用）か、となりのフォルダ ../shogi-fps-sfx。見つからなければ何もしない（音は合成音のまま鳴る）
import fs from 'fs';
import path from 'path';
const root = path.resolve(import.meta.dirname, '..');
const src = path.resolve(process.env.SFX_DIR || path.join(root, '..', 'shogi-fps-sfx'), 'game');
const dst = path.join(root, 'public', 'sfx');
fs.rmSync(dst, { recursive: true, force: true });
if (!fs.existsSync(src)) { console.log('[sfx] 音の置き場が見つからないので合成音のまま:', src); process.exit(0); }
const files = fs.readdirSync(src).filter(f => /\.(ogg|mp3|m4a|wav)$/i.test(f));
fs.mkdirSync(dst, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dst, f));
fs.writeFileSync(path.join(dst, 'list.json'), JSON.stringify(files));
console.log(`[sfx] ${files.length} 個の音をコピー`);
