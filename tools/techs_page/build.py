import csv, json, base64, io, html, sys
from PIL import Image
R = '/home/user/Monz-game/'
OUT = sys.argv[1]
rows = list(csv.DictReader(open(R+'data/monz_techs_draft.csv', encoding='utf-8-sig')))
det = {(r['種族'], r['技名']): r for r in csv.DictReader(open(R+'data/monz_techs_draft_detail.csv', encoding='utf-8-sig'))}
bunk = list(csv.DictReader(open(R+'data/monz_techs.csv', encoding='utf-8-sig')))
sys.path.insert(0, R+'tools')
import techs_draft as TD
data = {}
for b in bunk:
    d = TD.calc(b['型'], b['強さ'])
    data.setdefault('BUNK', []).append(dict(lv=int(b['覚えるレベル']), c=b['条件'], n=b['技名'], t=b['型'], e=b['属性'], s=b['強さ'], x=b['追加効果'], p=d['label'], cd=f"{d['cd']:.1f}", m=b['見た目のメモ'].split('（')[0], r=TD.range_text(b['型'], d), w=f"{d['windup']:.2f}"))
for r in rows:
    dd = det[(r['種族'], r['技名'])]
    data.setdefault(r['種族'], []).append(dict(lv=int(r['覚えるレベル']), c=r['条件'], n=r['技名'], t=r['型'], e=r['属性'], s=r['強さ'], x=r['追加効果'], p=r['威力'], cd=r['待ち時間'], m=r['見た目のメモ'], r=dd['射程'], w=dd['ため(出るまで)'].replace('秒','')))
for k in data: data[k].sort(key=lambda z: z['lv'])
style = {sp: TD.SPECIES[sp][0] for sp in TD.SPECIES}
style['BUNK'] = '力・体当たり（今のゲームの技。くらべるため）'
imgs = {}
for sp in ['riot','snek','grit','vybe','shellz']:
    im = Image.open(R+f'design/species/{sp}/sheet_2026-11-02.png').convert('RGB')
    im.thumbnail((720, 720))
    b = io.BytesIO(); im.save(b, 'WEBP', quality=72)
    imgs[sp.upper()] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
tables = open(R+'docs/techs_draft_tables.md', encoding='utf-8').read()
# comparison table rows
cmp = [l for l in tables.split('\n') if l.startswith('| ') and not l.startswith('| 種族') ]
cmp_rows = [[c.strip() for c in l.strip('|').split('|')] for l in cmp]
page = open('' + R + 'tools/techs_page/tpl.html', encoding='utf-8').read()
page = page.replace('/*DATA*/', 'const DATA=' + json.dumps(data, ensure_ascii=False) + ';const STYLE=' + json.dumps(style, ensure_ascii=False) + ';const IMG=' + json.dumps(imgs) + ';const CMP=' + json.dumps(cmp_rows, ensure_ascii=False) + ';')
open(OUT, 'w', encoding='utf-8').write(page)
print(len(page)//1024, 'KB')
