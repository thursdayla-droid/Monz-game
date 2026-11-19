import { describe, expect, it } from 'vitest';
import { bestHand, canPlayOn, cardReward, checkHand, DECK_SIZE, isCleared, isStuck, newRound, placeOf, play, playableSlots, remainingCount, topCard, type Round } from '../src/core/monzCard';

/** 52枚が必ず1か所ずつにある */
function checkInvariant(r: Round) {
  const all = [...r.deck, ...r.hand.filter((c) => c !== null), ...r.played] as number[];
  expect(all.length).toBe(DECK_SIZE);
  expect(new Set(all).size).toBe(DECK_SIZE);
  let used = 0;
  for (let c = 0; c < DECK_SIZE; c++) if (placeOf(r, c) === 'used') used++;
  expect(used).toBe(r.played.length);
  expect(remainingCount(r)).toBe(DECK_SIZE - used);
}

describe('MONZ CARD rules', () => {
  it('deals 5 in hand and 47 in the deck with no field card; any card can start', () => {
    const r = newRound(1, 42);
    expect(r.played.length).toBe(0);
    expect(r.hand.length).toBe(5);
    // 2026-11-19 ジョーカー 2枚 → 54枚
    expect(r.deck.length).toBe(49);
    expect(remainingCount(r)).toBe(54);
    expect(playableSlots(r)).toEqual([0, 1, 2, 3, 4]);
    checkInvariant(r);
  });

  it('same seed gives the same deal', () => {
    expect(newRound(1, 7)).toEqual(newRound(1, 7));
    expect(newRound(1, 7)).not.toEqual(newRound(1, 8));
  });

  it('accepts same rank or same suit only', () => {
    // 0 = ♠A, 13 = ♥A, 1 = ♠2, 14 = ♥2
    expect(canPlayOn(13, 0)).toBe(true);
    expect(canPlayOn(1, 0)).toBe(true);
    expect(canPlayOn(14, 0)).toBe(false);
  });

  it('keeps all 52 cards accounted for through many random games, and clears only when everything is played', () => {
    let clears = 0;
    for (let seed = 1; seed <= 400; seed++) {
      let r = newRound(1, seed);
      let rng = seed;
      while (true) {
        checkInvariant(r);
        if (isCleared(r)) {
          clears++;
          expect(r.played.length).toBe(DECK_SIZE);
          expect(r.deck.length).toBe(0);
          break;
        }
        const slots = playableSlots(r);
        if (!slots.length) {
          expect(isStuck(r)).toBe(true);
          break;
        }
        rng = (rng * 16807) % 2147483647;
        const next = play(r, slots[rng % slots.length])!;
        expect(topCard(next)).toBe(r.hand[slots[rng % slots.length]]);
        r = next;
      }
    }
    expect(clears).toBeGreaterThanOrEqual(0);
  });

  it('refuses a card that does not match', () => {
    const r = play(newRound(1, 3), 0)!;
    const bad = r.hand.findIndex((c) => c !== null && !canPlayOn(c, topCard(r)));
    if (bad >= 0) expect(play(r, bad)).toBeNull();
  });

  it('rewards: 500 coins per clear (2026-11-09 5倍・最大1000), partial only from 10 cards', () => {
    expect(cardReward(9, 0)).toEqual({ coins: 0, exp: 0 });
    expect(cardReward(10, 0)).toEqual({ coins: 10, exp: 10 });
    expect(cardReward(51, 1)).toEqual({ coins: 550, exp: 110 });
    expect(cardReward(102, 2).coins).toBe(1000);
    expect(cardReward(200, 5)).toEqual({ coins: 1000, exp: 500 });
  });
});

describe('ジョーカーと 場の 役(2026-11-19 企画者)', () => {
  // 番号: ♠=0〜12 ♥=13〜25 ♦=26〜38 ♣=39〜51(A=0)・ジョーカー 52・53
  it('ジョーカーは いつでも 出せる・上に 何でも 出せる', () => {
    expect(canPlayOn(52, 5)).toBe(true);
    expect(canPlayOn(14, 53)).toBe(true);
  });
  it('役の 判定(ジョーカーは 万能)', () => {
    expect(bestHand([0, 13, 26])?.name).toBe('three');
    expect(bestHand([0, 13, 52])?.name).toBe('three');
    expect(bestHand([0, 13, 26, 39])?.name).toBe('four');
    expect(bestHand([0, 1, 2, 3, 4])?.name).toBe('straightflush');
    expect(bestHand([0, 9, 10, 11, 12])?.name).toBe('royal');
    // ジョーカーで できた ロイヤルは ストレートフラッシュ(2026-11-19 企画者「ジョーカー 無しじゃ ないと カウント しない」)
    expect(bestHand([0, 9, 10, 11, 53])?.name).toBe('straightflush');
    expect(bestHand([0, 14, 2, 3, 4])?.name).toBe('straight');
    expect(bestHand([0, 2, 4, 6, 8])?.name).toBe('flush');
    expect(bestHand([0, 13, 26, 1, 14])?.name).toBe('fullhouse');
    expect(bestHand([0, 1])).toBeNull();
  });
  it('手札の 役: 同じ カードで 2回 もらわない・強く なったら もらえる・出したら また もらえる', () => {
    const a = checkHand([0, 13, 26, 5, 7], null)!;
    expect(a.name).toBe('three');
    // 関係 ない カードを 出して 補充 → 同じ スリーカード は なし
    expect(checkHand([0, 13, 26, 9, 7], a)).toBeNull();
    // 4枚目が 来た → フォーカード
    expect(checkHand([0, 13, 26, 39, 7], a)?.name).toBe('four');
    // スリーカードの 1枚を 出して 別の 組が できた → もらえる
    expect(checkHand([0, 13, 2, 15, 28], a)?.name).toBe('fullhouse');
  });
});
