/**
 * 種族の表(data/monz_species.csv から tools/species_csv.py で作る。手で直さない)。10種族×3形態
 */
import type { RosterRow } from './roster';

export const ROSTER_ROWS: RosterRow[] = [
  {"species": "bunk", "form": 1, "name": "BUNK", "body": "丸い体", "element": "無", "favorite": "パワー", "memo": "力強く体ごとぶつかる【仮】"},
  {"species": "bunk", "form": 2, "name": "BUNKER", "body": "丸い体", "element": "無", "favorite": "パワー", "memo": "BUNK が Lv.30 で進化した姿（企画者の絵 design/bunk/evolution/bunker_form2.png）。読み：バンカー"},
  {"species": "bunk", "form": 3, "name": "BUNKLORD", "body": "丸い体", "element": "無", "favorite": "パワー", "memo": "BUNKER が Lv.60 で進化した姿（企画者の絵 design/bunk/evolution/bunklord_form3.png。元の絵は背景に市松模様が描きこまれていたので、背景だけ透明にした）。読み：バンクロード"},
  {"species": "mofu", "form": 1, "name": "MOFU", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "mofu", "form": 2, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "mofu", "form": 3, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "zipp", "form": 1, "name": "ZIPP", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "zipp", "form": 2, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "zipp", "form": 3, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "puni", "form": 1, "name": "PUNI", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "puni", "form": 2, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "puni", "form": 3, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "klak", "form": 1, "name": "KLAK", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "klak", "form": 2, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "klak", "form": 3, "name": "（未定）", "body": "（未定）", "element": "（未定）", "favorite": "（未定）", "memo": ""},
  {"species": "riot", "form": 1, "name": "RIOT", "body": "四つ足", "element": "炎", "favorite": "パワー", "memo": "たてがみのけもの。暴走・炎・爆発。読み：ライオット。名前は変わるかもしれない【仮】（2026-11-02 企画者の絵 design/species/riot/sheet_2026-11-02.png）"},
  {"species": "riot", "form": 2, "name": "RIOTER", "body": "四つ足", "element": "炎", "favorite": "パワー", "memo": "たてがみのけもの。暴走・炎・爆発。Lv.30 で進化。読み：ライオター。名前は変わるかもしれない【仮】"},
  {"species": "riot", "form": 3, "name": "RIOTLORD", "body": "四つ足", "element": "炎", "favorite": "パワー", "memo": "たてがみのけもの。暴走・炎・爆発。Lv.60 で進化。読み：ライオットロード。名前は変わるかもしれない【仮】"},
  {"species": "snek", "form": 1, "name": "SNEK", "body": "長い体", "element": "闇", "favorite": "スピード", "memo": "へび。闇・毒・奇襲。読み：スネック。名前は変わるかもしれない【仮】（2026-11-02 企画者の絵 design/species/snek/sheet_2026-11-02.png）"},
  {"species": "snek", "form": 2, "name": "SNEKER", "body": "長い体", "element": "闇", "favorite": "スピード", "memo": "へび。闇・毒・奇襲。Lv.30 で進化。読み：スネカー。名前は変わるかもしれない【仮】"},
  {"species": "snek", "form": 3, "name": "SNEKLAWS", "body": "長い体", "element": "闇", "favorite": "スピード", "memo": "へび。闇・毒・奇襲。Lv.60 で進化。読み：スネクロウズ。名前は変わるかもしれない【仮】"},
  {"species": "grit", "form": 1, "name": "GRIT", "body": "四つ足", "element": "無", "favorite": "タフネス", "memo": "ブルドッグのような けもの。重装甲・防御・重い攻撃。読み：グリット。名前は変わるかもしれない【仮】（2026-11-02 企画者の絵 design/species/grit/sheet_2026-11-02.png）"},
  {"species": "grit", "form": 2, "name": "GRITER", "body": "四つ足", "element": "無", "favorite": "タフネス", "memo": "ブルドッグのような けもの。重装甲・防御・重い攻撃。Lv.30 で進化。読み：グリッター。名前は変わるかもしれない【仮】"},
  {"species": "grit", "form": 3, "name": "GRITBULL", "body": "四つ足", "element": "無", "favorite": "タフネス", "memo": "ブルドッグのような けもの。重装甲・防御・重い攻撃。Lv.60 で進化。読み：グリットブル。名前は変わるかもしれない【仮】"},
  {"species": "vybe", "form": 1, "name": "VYBE", "body": "四つ足", "element": "雷", "favorite": "テクニック", "memo": "雷のけもの。雷・妨害・電磁。読み：ヴァイブ。名前は変わるかもしれない【仮】（2026-11-02 企画者の絵 design/species/vybe/sheet_2026-11-02.png）"},
  {"species": "vybe", "form": 2, "name": "VYBER", "body": "四つ足", "element": "雷", "favorite": "テクニック", "memo": "雷のけもの。雷・妨害・電磁。Lv.30 で進化。読み：ヴァイバー。名前は変わるかもしれない【仮】"},
  {"species": "vybe", "form": 3, "name": "VYBOLT", "body": "四つ足", "element": "雷", "favorite": "テクニック", "memo": "雷のけもの。雷・妨害・電磁。Lv.60 で進化。読み：ヴァイボルト。名前は変わるかもしれない【仮】"},
  {"species": "shellz", "form": 1, "name": "SHELLZ", "body": "四つ足", "element": "水", "favorite": "タフネス", "memo": "カメ（甲羅）。甲羅・水圧・はね返し。読み：シェルズ。名前は変わるかもしれない【仮】（2026-11-02 企画者の絵 design/species/shellz/sheet_2026-11-02.png）。絵は属性「地」→ 水にした（企画者 2026-11-02）"},
  {"species": "shellz", "form": 2, "name": "SHELLKER", "body": "四つ足", "element": "水", "favorite": "タフネス", "memo": "カメ（甲羅）。甲羅・水圧・はね返し。Lv.30 で進化。読み：シェルカー。名前は変わるかもしれない【仮】（絵の「SHEILKER」はまちがい → SHELLKER。企画者 2026-11-02）"},
  {"species": "shellz", "form": 3, "name": "SHELLBOSS", "body": "四つ足", "element": "水", "favorite": "タフネス", "memo": "カメ（甲羅）。甲羅・水圧・はね返し。Lv.60 で進化。読み：シェルボス。名前は変わるかもしれない【仮】"},
];
