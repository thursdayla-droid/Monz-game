// 公開用に作ったゲーム(dist/)の大きさを、種類別・大きい順に表示する。
// 使い方: npm run size(作り直してから表示) / node tools/size-report.mjs(今の dist を表示)
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push({ path: relative(root, p), size: st.size });
  }
};
walk(root);
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const kb = (n) => `${Math.round(n / 1024)} KB`;
const total = files.reduce((s, f) => s + f.size, 0);
console.log(`\n合計: ${mb(total)}(${files.length} ファイル)\n`);

const groups = new Map();
for (const f of files) {
  const parts = f.path.split('/');
  const key = parts[0] === 'assets' && parts.length > 2 ? `assets/${parts[1]}` : parts[0] === 'assets' ? 'プログラム' : parts[0];
  groups.set(key, (groups.get(key) ?? 0) + f.size);
}
console.log('種類別:');
for (const [k, v] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`  ${mb(v).padStart(9)}  ${k}`);

console.log('\n大きいファイル 上位15件:');
for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 15)) console.log(`  ${kb(f.size).padStart(8)}  ${f.path}`);
console.log('');
