"""MYTHCLASH のカード表(企画者の CSV)を、ゲーム用のデータ(src/core/mythclash/cardData.ts)に書き出す。
使い方: python3 -I tools/mythclash_cards.py
- CSV は design/mythclash/MYTHCLASH_100_cards_names_completed.csv(企画者から受け取ったまま。変えない)
- 値は書きかえない。列をそのまま写すだけ(HPは企画者決定 2026-10-26 で表の値を正式に使う。今後変わる可能性あり)
- ただし企画者が直すと決めた所だけ、下の PLANNER_FIXES で上書きする(CSV そのものは残す)
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design', 'mythclash', 'MYTHCLASH_100_cards_names_completed.csv')
OUT = os.path.join(ROOT, 'src', 'core', 'mythclash', 'cardData.ts')

COLS = {
    'カードNo': 'no', 'カード名': 'name', '名称確認状況': 'nameStatus', 'テーマ': 'theme', 'レアリティ': 'rarity',
    '本体属性': 'element', 'HP（暫定）': 'hp', '攻撃': 'atk', '防御': 'def', '魔力': 'mag', '素早さ': 'spd',
    '通常攻撃属性': 'normalElement', '必殺属性': 'specialElement', '魔法属性（暫定）': 'magicElement',
    '魔法名（仮）': 'magicName', '魔法補正値（暫定）': 'magicModifier', '魔法効果コード（旧）': 'magicEffectCode',
    '魔法効果説明（旧・要更新）': 'magicEffectOldText', '固有能力コード（暫定）': 'abilityCode', '備考': 'note',
}
# 企画者が決めた修正(日付つき)。CSV は受け取ったまま残し、ここで上書きする
PLANNER_FIXES = {
    56: {'theme': 'ダーク童話'},  # 2026-10-26: 血の女王はダーク童話
    3: {'name': '毒りんごの女王'},  # 2026-10-27: カードの絵に合わせて ひらがなに(企画者「Aで全部揃えよう」)
}

NUM = {'hp', 'atk', 'def', 'mag', 'spd', 'magicModifier'}

rows = []
with open(SRC, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        d = {}
        for jp, key in COLS.items():
            v = (r.get(jp) or '').strip()
            if key in NUM:
                d[key] = int(v)
            elif key == 'no':
                d[key] = int(v)
            elif key in ('abilityCode', 'note'):
                d[key] = v or None
            else:
                d[key] = v
        d.update(PLANNER_FIXES.get(d['no'], {}))
        rows.append(d)

body = ',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in rows)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// このファイルは tools/mythclash_cards.py が CSV から自動で作る。手で直さない(CSVを直してから作り直す)\n')
    f.write("import type { RawCard } from './cards';\n\n")
    f.write('export const RAW_CARDS: RawCard[] = [\n' + body + ',\n];\n')
print(len(rows), 'cards ->', OUT)
