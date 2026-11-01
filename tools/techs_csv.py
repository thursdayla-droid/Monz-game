"""
企画者(ChatGPT で作った)の技の表 data/monz_techs.csv → src/core/battle3d/techData.ts を作る。
使い方: python3 -I tools/techs_csv.py   (表を直したら、これを動かす)
表の書き方は docs/TECH_TYPES.md。
"""
import csv, json, os, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'data', 'monz_techs.csv')
out = os.path.join(root, 'src', 'core', 'battle3d', 'techData.ts')
COLS = ['種族', '技名', '型', '属性', '強さ', '覚えるレベル', '条件', '追加効果', '見た目のメモ']
KEYS = ['species', 'name', 'type', 'element', 'strength', 'level', 'condition', 'effect', 'memo']
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
        d['level'] = int(d['level'])
        rows.append(d)
body = ',\n'.join('  ' + json.dumps(d, ensure_ascii=False) for d in rows)
open(out, 'w', encoding='utf-8').write(
    '/**\n * 技の表(企画者が ChatGPT で作った data/monz_techs.csv から tools/techs_csv.py で作る。手で直さない)。\n * 表の書き方: docs/TECH_TYPES.md\n */\n'
    "import type { TechRow } from './techTable';\n\n"
    f'export const TECH_ROWS: TechRow[] = [\n{body},\n];\n')
print(len(rows), 'rows')
