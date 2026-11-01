"""
企画者の種族の表 data/monz_species.csv(10種族×3形態)→ src/core/rosterData.ts を作る。
使い方: python3 -I tools/species_csv.py   (表を直したら、これを動かす)。書き方は docs/TECH_TYPES.md の「表1」
"""
import csv, json, os, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'data', 'monz_species.csv')
out = os.path.join(root, 'src', 'core', 'rosterData.ts')
COLS = ['種族', '形態', '名前', '体の形', '属性', '得意', 'メモ']
KEYS = ['species', 'form', 'name', 'body', 'element', 'favorite', 'memo']
rows = []
with open(src, encoding='utf-8-sig') as f:
    r = csv.reader(f)
    head = [h.strip() for h in next(r)]
    if head != COLS:
        sys.exit(f'見出しがちがいます: {head}')
    for line in r:
        if not any(x.strip() for x in line):
            continue
        d = dict(zip(KEYS, [x.strip() for x in line]))
        d['species'] = d['species'].lower()
        d['form'] = int(d['form'])
        rows.append(d)
body = ',\n'.join('  ' + json.dumps(d, ensure_ascii=False) for d in rows)
open(out, 'w', encoding='utf-8').write(
    '/**\n * 種族の表(data/monz_species.csv から tools/species_csv.py で作る。手で直さない)。10種族×3形態\n */\n'
    "import type { RosterRow } from './roster';\n\n"
    f'export const ROSTER_ROWS: RosterRow[] = [\n{body},\n];\n')
print(len(rows), 'rows')
