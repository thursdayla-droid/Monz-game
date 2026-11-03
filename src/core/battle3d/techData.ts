/**
 * 技の表(企画者が ChatGPT で作った data/monz_techs.csv から tools/techs_csv.py で作る。手で直さない)。
 * 表の書き方: docs/TECH_TYPES.md
 */
import type { TechRow } from './techTable';

export const TECH_ROWS: TechRow[] = [
  {"species": "bunk", "name": "バンクバッシュ", "type": "突進", "element": "無", "strength": "弱", "level": 1, "condition": "なし", "effect": "なし", "memo": "丸い体を低く構えて勢いよくぶつける"},
  {"species": "bunk", "name": "コロガン", "type": "回転", "element": "無", "strength": "弱", "level": 1, "condition": "なし", "effect": "ふらつき", "memo": "体を丸めて転がり相手にぶつかる"},
  {"species": "bunk", "name": "ドスンパクト", "type": "衝撃波", "element": "無", "strength": "中", "level": 10, "condition": "なし", "effect": "なし", "memo": "地面を強く踏みつけ円形の衝撃波を広げる"},
  {"species": "bunk", "name": "ハネツキラッシュ", "type": "連続攻撃", "element": "無", "strength": "中", "level": 20, "condition": "なし", "effect": "なし", "memo": "小刻みに跳ねながら体当たりを連続で繰り出す"},
  {"species": "bunk", "name": "ゴウリキクラッシュ", "type": "突進", "element": "炎", "strength": "強", "level": 25, "condition": "パワー寄り", "effect": "ふらつき", "memo": "全身に赤い炎をまとい一直線に激突する（2026-11-02 企画者「技炎少しほしい」で無→炎【仮】）"},
  {"species": "bunk", "name": "ガンジョウドーム", "type": "守り", "element": "無", "strength": "中", "level": 25, "condition": "タフネス寄り", "effect": "なし", "memo": "体を丸めて半透明の頑丈なドームを展開する"},
  {"species": "bunk", "name": "シュンソクスピン", "type": "回転", "element": "雷", "strength": "中", "level": 25, "condition": "スピード寄り", "effect": "まひ", "memo": "高速回転して稲妻の軌跡を残しながら突っ込む"},
  {"species": "bunk", "name": "ネライウチバースト", "type": "弾", "element": "光", "strength": "中", "level": 25, "condition": "テクニック寄り", "effect": "なし", "memo": "両手の間に光を圧縮して小さな光弾を放つ"},
  {"species": "bunk", "name": "バンクブレイカー", "type": "落下", "element": "無", "strength": "強", "level": 30, "condition": "第1進化", "effect": "ふらつき", "memo": "高く跳び上がり全体重を乗せて地面へ落下する"},
  {"species": "bunk", "name": "テンチゴウサイ", "type": "衝撃波", "element": "無", "strength": "大技", "level": 60, "condition": "第2進化", "effect": "ふらつき", "memo": "巨大な力をまとって地面に激突し広範囲へ衝撃波を放つ"},
  {"species": "bunk", "name": "ポンポンショット", "type": "弾", "element": "炎", "strength": "弱", "level": 5, "condition": "なし", "effect": "なし", "memo": "片方のグローブを前に出し、小さな火の玉を連発する（2026-11-02 企画者「技炎少しほしい」で無→炎【仮】）"},
  {"species": "bunk", "name": "バウンドプレス", "type": "落下", "element": "無", "strength": "中", "level": 15, "condition": "なし", "effect": "なし", "memo": "勢いよく跳び上がり体を丸めて相手の方向へ落下する（バンクブレイカーより控えめ）"},
  {"species": "bunk", "name": "ブレイクロア", "type": "弱体", "element": "無", "strength": "中", "level": 35, "condition": "なし", "effect": "攻撃ダウン", "memo": "大きく息を吸い込み、口元から紫の円形の音波を放つ（ダメージなし）"},
  {"species": "bunk", "name": "メガトンラッシュ", "type": "連続攻撃", "element": "無", "strength": "強", "level": 40, "condition": "なし", "effect": "なし", "memo": "両グローブで4連続攻撃。4発目は強力なフィニッシュで吹き飛ばす"},
  {"species": "bunk", "name": "グラビティプレス", "type": "設置", "element": "闇", "strength": "強", "level": 45, "condition": "なし", "effect": "遅くする", "memo": "地面に拳を叩きつけ、紫と黒の重力フィールド（魔法陣）を展開する"},
  {"species": "bunk", "name": "ギガントバースト", "type": "ビーム", "element": "光", "strength": "強", "level": 50, "condition": "なし", "effect": "なし", "memo": "両グローブの間に光の粒子を集め、太い光線を放つ（テンチゴウサイより控えめ）"},
  {"species": "bunk", "name": "レンゴクホウケン", "type": "火柱", "element": "炎", "strength": "大技", "level": 70, "condition": "第2進化", "effect": "なし", "memo": "自分の前の地面を拳でなぐり、使った時に相手がいた足もととそのまわり3か所から炎の柱が下から噴き出す（2026-11-02 企画者。名前も企画者。2026-11-02 企画者「大技にします」で 強→大技）"},
  {"species": "mofu", "name": "ふわころ", "type": "回転", "element": "自然", "strength": "弱", "level": 1, "condition": "なし", "effect": "なし", "memo": "毛玉のように丸まって転がる。通ったあとに綿毛が舞う（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "わたげだま", "type": "弾", "element": "自然", "strength": "弱", "level": 1, "condition": "なし", "effect": "なし", "memo": "口からふわふわの綿毛の玉。左右にゆれながら ゆっくり飛ぶ（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "もふガード", "type": "守り", "element": "無", "strength": "弱", "level": 5, "condition": "なし", "effect": "なし", "memo": "毛をぶわっとふくらませて体をつつむ白い毛のドーム（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "いやしのしずく", "type": "回復", "element": "光", "strength": "中", "level": 10, "condition": "なし", "effect": "なし", "memo": "頭の上に光のしずくが落ち、緑の光の輪が体に広がる(回復中は動けない)（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "わたげちらし", "type": "連射", "element": "自然", "strength": "中", "level": 15, "condition": "なし", "effect": "なし", "memo": "体をふるわせ、綿毛を扇の形にまき散らす（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "ふわりの風", "type": "衝撃波", "element": "自然", "strength": "中", "level": 20, "condition": "なし", "effect": "なし", "memo": "ふくらんでから一気にしぼみ、綿毛まじりの風の輪が広がる(跳ねない)（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "もふどっかん", "type": "落下", "element": "自然", "strength": "強", "level": 25, "condition": "パワー寄り", "effect": "ふらつき", "memo": "大きくふくらんで高く跳び、毛玉ごと落ちる。着地で花びらがはじける（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "わたぐもシェル", "type": "守り", "element": "自然", "strength": "中", "level": 25, "condition": "タフネス寄り", "effect": "なし", "memo": "雲のような綿を何枚も重ねたドーム。当たると綿がちぎれて舞う（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "ふわっとダッシュ", "type": "突進", "element": "自然", "strength": "中", "level": 25, "condition": "スピード寄り", "effect": "なし", "memo": "風に乗って地面をすべるように突っこむ。うしろに綿毛の帯（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "ねむりの綿雨", "type": "設置", "element": "自然", "strength": "中", "level": 25, "condition": "テクニック寄り", "effect": "ねむり", "memo": "相手の頭の上に小さな雲。綿毛の雨が降る円の中にいると眠くなる（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "めぐみの花冠", "type": "回復", "element": "光", "strength": "強", "level": 30, "condition": "第1進化", "effect": "なし", "memo": "頭に花の冠が咲き、花びらが降りそそいで回復（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "もりの息吹", "type": "強化", "element": "自然", "strength": "中", "level": 35, "condition": "なし", "effect": "なし", "memo": "深呼吸。緑の風が体をまわり毛が光る。しばらく受けるダメージが減る（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "わたぐもカーテン", "type": "守り", "element": "自然", "strength": "強", "level": 40, "condition": "なし", "effect": "なし", "memo": "前に綿雲の幕を張る(前からの弾・ビームを止める。横・うしろは通る)（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "いやしの根脈", "type": "吸収", "element": "自然", "strength": "強", "level": 45, "condition": "なし", "effect": "なし", "memo": "地面から光る根が相手の足もとへのび、力を吸って体へもどる（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "花嵐のゆりかご", "type": "弱体", "element": "自然", "strength": "強", "level": 50, "condition": "なし", "effect": "ねむり", "memo": "花びらの渦が相手をつつみ、ゆりかごのように ゆらして眠らせる（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "生命樹の抱擁", "type": "回復", "element": "光", "strength": "大技", "level": 60, "condition": "第2進化", "effect": "なし", "memo": "背中から光の大樹が生え、枝が体をつつんで大きく回復（2026-11-03 技リスト案から）"},
  {"species": "mofu", "name": "千花天幕", "type": "設置", "element": "自然", "strength": "大技", "level": 70, "condition": "第2進化", "effect": "なし", "memo": "地面一面に巨大な花と光の根が広がる。中にいる間 自分は回復・受けるダメージが減る（2026-11-03 技リスト案から）"},
];
