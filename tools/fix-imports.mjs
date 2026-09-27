// 型チェックで「名前が見つからない」と言われたものを、定義しているファイルから import する（開発用の道具）
// 使い方: node tools/fix-imports.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
let out = '';
try { execSync('npx tsc --noEmit', { cwd: root, stdio: 'pipe' }); } catch (e) { out = e.stdout.toString(); }
const missing = [...out.matchAll(/^src[\\/](\w+)\.ts\(\d+,\d+\): error TS(?:2304|2552): Cannot find name '(\w+)'/gm)];
if (!missing.length) { console.log('足りない import はありません'); process.exit(0); }

// どのファイルが何を export しているか
const exportsOf = {};
// src と src/guns（銃）の中を見る
for (const sub of ['', 'guns']) {
  const d = path.join(src, sub);
  for (const f of fs.readdirSync(d).filter(f => f.endsWith('.ts'))) {
    const s = fs.readFileSync(path.join(d, f), 'utf8');
    for (const m of s.matchAll(/^export (?:const|let|function|class) (\w+)/gm)) exportsOf[m[1]] = exportsOf[m[1]] || (sub ? sub + '/' : '') + f.replace(/\.ts$/, '');
  }
}
const need = {};
for (const [, file, name] of missing) {
  const from = exportsOf[name];
  if (!from) { console.log(`見つからない: ${name}（${file}.ts）`); continue; }
  ((need[file] = need[file] || {})[from] = need[file][from] || new Set()).add(name);
}
for (const [file, froms] of Object.entries(need)) {
  const p = path.join(src, file + '.ts');
  let s = fs.readFileSync(p, 'utf8');
  for (const [from, names] of Object.entries(froms)) {
    const re = new RegExp(`import \\{ ([^}]*) \\} from '\\./${from.replace('/', '\\/')}';`);
    const m = s.match(re);
    if (m) {
      const all = new Set(m[1].split(',').map(x => x.trim()).filter(Boolean)); names.forEach(n => all.add(n));
      s = s.replace(m[0], `import { ${[...all].sort().join(', ')} } from './${from}';`);
    } else {
      const lines = s.split('\n'); const i = lines.findIndex(l => l.startsWith('import'));
      lines.splice(i < 0 ? 1 : i, 0, `import { ${[...names].sort().join(', ')} } from './${from}';`);
      s = lines.join('\n');
    }
    console.log(`${file}.ts ← ${from}: ${[...names].join(', ')}`);
  }
  fs.writeFileSync(p, s);
}
