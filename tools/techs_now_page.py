"""
今ゲームに入っている技の一覧ページ(企画者が これから作る種族を考えるため。2026-11-04)。
使い方:
  1) 技の数字を出す: tests に一時的なテストを置いて getTech の結果を JSON に書く(下の DUMP の説明)
  2) python3 -I tools/techs_now_page.py <技のJSON> <出す場所.html>
技の「うごき」の説明は、この中の STYLE_TEXT(animeConfig.ts の techStyle と同じ名前)。
"""
import html
import json
import sys

src, out = sys.argv[1], sys.argv[2]
rows = json.load(open(src, encoding='utf-8'))

SPECIES = {
    'bunk': ('BUNK', '力・体当たり', '炎・無',
             'パンチの連打(進化すると 前に出ながら・グローブから火の粉、さいごに 小さい火の玉)',
             'ぴょこぴょこ はねて歩く。体当たり・地面をたたく技が多い。主人公'),
    'mofu': ('MOFU', '回復・守り・ねむり', '自然・光',
             'ツルのムチ(中くらいの距離。MOFU 1発・MOFUR 2発・MOFUGARD 3発)',
             '回復・強化・吸収・自分の場(千花天幕)を持つ。ねばって勝つ'),
    'zipp': ('ZIPP', '雷・速さ・ジグザグ', '雷・光',
             '電撃ダッシュ(ボタンを押してためる → はなすと 前へ走る。ためるほど 遠く・強い)',
             'さっと走って ぴたっと止まる。よけるのが 速く遠い。突進・回転・弾は ジグザグ'),
    'puni': ('PUNI', '弾力・吸う・ぷにぷに', '自然・無',
             'ぷに玉(緑の玉を1発。進化すると 7m→10m→13m)',
             'ぽよん ぽよん と大きく はねて歩く。はねる弾・のびる体・はね返し・吸う'),
    'klak': ('KLAK', '罠・ねらい・はさみ', '無・光',
             'はさみトラップ(前に罠を置く。ふむと 動けない。待ち時間 長め。進化で 1つ→2つ→3つ置ける)',
             'カニのように 横向きに ちょこちょこ歩く。罠・照準・砲台・はさむ技'),
}

# とくべつな動き(techStyle の名前 → 説明)
STYLE_TEXT = {
    'vanishTackle': '一瞬 消えて(ちらちら)、相手の目の前に あらわれて 体当たり',
    'lowLeap': '低く 速く とんで 落ちる',
    'fan': '雷の針を いっせいに3本(扇の形)',
    'boltTrail': '一直線に走り、通ったあとの地面に 電気の線(ふむと しびれる)',
    'zapShield': '電気の膜。近くで攻撃した相手が しびれる(2回に1回)',
    'afterimage': 'しばらく よけるのが 速く遠く・待ち時間も短い。黄色い残像',
    'strike1': '相手の足もとに印 → 少しあとに 空から落雷(動けば よけられる)',
    'homing3': '体の3方向に 電光の矢 → 曲がって 1本ずつ 相手へ',
    'spiral': '相手のまわりを うずまきのように回りながら 近づく',
    'rail': 'ためる間 地面に 光の線 → その上を 光線が走る',
    'net': '相手の足もとに 電気の網(中にいると 遅くなる。稲妻が はしる)',
    'ghostRush': 'ZIPP の残像が 4方向から 順番に つっこむ',
    'multiPass': '相手を 4回 つきぬけて 走る(さいごが強い)',
    'strikeNet': '相手の足もと → まわり5か所へ 順番に 落雷',
    'stretch': 'その場から 体を にゅっと のばして つつく(遠い時は ぴょんと前へ)',
    'arc': '山なりに飛んで 地面で1回 はねる',
    'multiBounce': '小さく3回 はねながら 相手へ(着地のたびに 当たる)',
    'jellyBounce': 'ぷるぷるの膜。攻撃してきた相手を はね飛ばす',
    'skip': '水切りのように 低く 何回も はねる',
    'pull': '当てた相手を 自分のほうへ 引きよせる',
    'bigPress': '大きく ふくらんで 落ちる(当たる広さ 1.3倍)',
    'reflect': '弾を はね返す(はね返った弾は 自分のもの)',
    'droplets': '回りながら まわりへ しずくを 飛ばす',
    'stickyGoo': '緑の沼。はじめて ふむと べたっと くっついて 少し動けない',
    'tripleWave': '波の輪が 3つ(1つずつは 弱め)',
    'slip': '相手が つるつる すべる(4秒 止まれない・曲がれない)',
    'split': '大きな ぷにが いちばん上で 3つに 分かれて 追いかける',
    'tether': '触手で つないで 少しずつ 何回も 吸う(はなれる・柱で 切れる)',
    'elastic': 'しばらく 攻撃が強く、ふっとばす力 1.7倍',
    'inflate': '大きく ふくらんでから はじける(ためが長い)',
    'absorbCounter': '攻撃を 受け止めて ためる → はじけて 反撃(受けた数だけ 強い)',
    'soundRing': '音の輪が 飛ぶ',
    'sidestep': '横へ すっと動いてから 突進',
    'pinpoint': '赤い照準で ねらってから とても速い弾(ためが長い)',
    'miniTraps': '相手のまわりに 小さい罠を3つ(ふむと 動けない)',
    'snapThrow': 'はさみで3回 → さいごに 自分のうしろへ 投げ飛ばす(ガードできない)',
    'sweep': '赤い照準線で ねらう → 撃っている間も 光線が 相手を追う',
    'crackLine': 'はさみを たたきつけて 着地 → 前へ 地割れ(岩が3か所)',
    'clampCounter': 'はさみの盾。受けた時に 近くの相手を はさみ返す',
    'flankClamp': '相手のまわりを回って うしろから はさむ(少し動けない・ガードできない)',
    'cross': '相手の足もとに 十字の光るワイヤー(線の上だけ 遅くなる)',
    'stakes': '相手のまわり4か所と まん中に 照準 → いっせいに 光の杭',
    'bomb': '爆弾が 相手の近くまで ころがって 止まり、少しあとに 爆発',
    'shatter': '音波。防御ダウン + 守りの膜・ガードを こわす',
    'snipe': '長く ねらって 細く速い 光線',
    'trapChain': '相手までの線の上に 罠を3つ。1つ ふむと 全部 作動',
    'turrets': '相手のまわりに 小さな砲台が5つ → 順番に撃つ',
    'snipeArray': '照準が 相手を追いかけ、さいごに 止まって 集中砲撃',
}
# 種族の ふつうの動き(とくべつな名前がない技)
SPECIES_DEFAULT = {
    'zipp': {
        'rush': 'ジグザグに 曲がりながら 突進',
        'spin': '回りながら ジグザグに 進む',
        'combo': '1発ごとに 相手の右・左・正面へ 一瞬で 回りこむ',
        'shot': '左右に ぎざぎざ ゆれて 飛ぶ',
        'barrage': '左右に ぎざぎざ ゆれて 飛ぶ',
    },
}
KIND_LABEL = {
    'rush': '突進', 'spin': '回転', 'shot': '弾', 'barrage': '連射', 'beam': 'ビーム', 'quake': '衝撃波', 'drop': '落下',
    'field': '設置', 'combo': '連続攻撃', 'debuff': '弱体', 'pillar': '火柱', 'barrier': '守り', 'heal': '回復', 'buff': '強化', 'drain': '吸収',
}


def power_text(r):
    k = r['kind']
    p = r['power']
    if k == 'heal':
        return f'HP{p:g}%回復'
    if k == 'buff':
        return f'+{p:g}%'
    if k == 'field':
        return f'{p:g}/秒'
    if k in ('barrier', 'debuff') or p == 0:
        return '—'
    if k == 'barrage':
        return f'{p:g}×3'
    return f'{p:g}'


def move_text(r):
    st = r['style']
    if st and st in STYLE_TEXT:
        return STYLE_TEXT[st], True
    d = SPECIES_DEFAULT.get(r['species'], {}).get(r['kind'])
    memo = r['memo'].split('（')[0]
    if d:
        return d, True
    return memo, False


def cond_text(r):
    c = r['condition']
    if c == 'なし':
        return ''
    return {'第1進化': '進化1', '第2進化': '進化2'}.get(c, c)


ELEM_CLASS = {'炎': 'fire', '水': 'water', '自然': 'nature', '雷': 'thunder', '光': 'light', '闇': 'dark', '無': 'none'}
STR_CLASS = {'弱': 's1', '中': 's2', '強': 's3', '大技': 's4'}

sections = []
nav = []
for sp, (name, role, elems, jab, walk) in SPECIES.items():
    rs = sorted([r for r in rows if r['species'] == sp], key=lambda r: (r['level'], r['condition'] != 'なし'))
    nav.append(f'<a href="#{sp}">{name}</a>')
    items = []
    for r in rs:
        txt, special = move_text(r)
        eff = r['effect'] if r['effect'] != 'なし' else ''
        cond = cond_text(r)
        items.append(
            f'<li class="mv">'
            f'<div class="lv"><b>{r["level"]}</b>{f"<small>{html.escape(cond)}</small>" if cond else ""}</div>'
            f'<div class="body"><div class="top"><span class="nm">{html.escape(r["name"])}</span>'
            f'<span class="el {ELEM_CLASS.get(r["element"], "none")}">{html.escape(r["element"])}</span>'
            f'<span class="ty">{html.escape(KIND_LABEL.get(r["kind"], r["type"]))}</span>'
            f'<span class="st {STR_CLASS.get(r["strength"], "s1")}">{html.escape(r["strength"])}</span></div>'
            f'<p class="do{" sp" if special else ""}">{html.escape(txt)}</p>'
            f'<div class="nums"><span>威力 <b>{power_text(r)}</b></span><span>待ち <b>{r["cd"]:g}秒</b></span>{f"<span>追加 <b>{html.escape(eff)}</b></span>" if eff else ""}</div>'
            f'</div></li>'
        )
    sections.append(
        f'<section id="{sp}"><header class="sh"><h2>{name}</h2><p class="role">{html.escape(role)}<span>属性 {html.escape(elems)}</span></p></header>'
        f'<dl class="facts"><div><dt>通常攻撃</dt><dd>{html.escape(jab)}</dd></div><div><dt>動き方・らしさ</dt><dd>{html.escape(walk)}</dd></div></dl>'
        f'<ol class="list">{"".join(items)}</ol></section>'
    )

page = open(__file__.replace('techs_now_page.py', 'techs_now_tpl.html'), encoding='utf-8').read()
page = page.replace('<!--NAV-->', ''.join(nav)).replace('<!--SECTIONS-->', ''.join(sections)).replace('<!--COUNT-->', str(len(rows)))
open(out, 'w', encoding='utf-8').write(page)
print(len(rows), 'moves', len(page) // 1024, 'KB')
