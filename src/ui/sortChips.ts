import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { CARD_SORT_LABELS, type CardSort } from '../core/mythclash/cards';
import { UI_FONT } from './paint';

/** 並びかえの選択(画面ごと。アプリを開いている間は覚えておく) */
export const cardSortChoice: Record<string, CardSort> = {};

/**
 * 「強い順・弱い順・No.順」のボタン(企画者 2026-10-26: バインダーと編成で並びかえ)。
 * 強い・弱いは総合値(cards.ts の cardPower)で比べる
 */
export function addSortChips(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, current: CardSort, onChange: (s: CardSort) => void): void {
  const keys: CardSort[] = ['strong', 'weak', 'no'];
  keys.forEach((k, i) => {
    const on = k === current;
    const t = scene.add
      .text(x + (i - 1) * 150, y, CARD_SORT_LABELS[k], { fontFamily: UI_FONT, fontSize: '24px', fontStyle: '900', color: on ? '#16101c' : '#ffffff' })
      .setOrigin(0.5)
      .setBackgroundColor(on ? '#ffd23a' : '#3a2a4a')
      .setPadding(18, 6, 18, 8);
    if (!on)
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        audio.se('tap');
        onChange(k);
      });
    layer.add(t);
  });
}
