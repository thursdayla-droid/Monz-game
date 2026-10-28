/**
 * 確認用のカード一覧ページ(tools/build_cards_page.py)が読む、全カードのデータを書き出す。
 * ゲーム本体のカードデータ(src/core/mythclash/)をそのまま読むだけで、変えない。
 * 使い方: tools/build_cards_page.py が rolldown でまとめて node で動かす(直接は使わない)
 */
import { abilityOf } from '../src/core/mythclash/abilities';
import { CARDS, SPECIAL_CARDS } from '../src/core/mythclash/cards';
import { describeAbility, describeMagicEffect } from '../src/core/mythclash/describe';
import { CARD_ART_IDS } from '../src/ui/mythCardArt';

const rows = [...CARDS, ...SPECIAL_CARDS].map((c) => {
  const ab = abilityOf(c.abilityCode);
  const hasAbility = !!ab && ab.def.kind !== 'none' && !!ab.name;
  return {
    no: c.id,
    name: c.name,
    rarity: c.rarity,
    theme: c.theme,
    element: c.element,
    hp: c.maxHp,
    atk: c.atk,
    def: c.def,
    mag: c.mag,
    spd: c.spd,
    magic: { name: c.magic.name, element: c.magic.element, text: describeMagicEffect(c) },
    ability: hasAbility ? { name: ab!.name, text: describeAbility(ab!) } : null,
    art: CARD_ART_IDS.includes(c.id),
  };
});
// 標準出力に JSON で出す(Node の型を入れずに使う)
(globalThis as unknown as { console: { log: (s: string) => void } }).console.log(JSON.stringify(rows));
