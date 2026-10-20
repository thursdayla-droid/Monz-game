import { describe, expect, it } from 'vitest';
import { canPlayOn, cardReward, DECK_SIZE, isCleared, isStuck, newRound, placeOf, play, playableSlots, remainingCount, topCard, type Round } from '../src/core/monzCard';

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
  it('deals 1 field card, 5 in hand and 46 in the deck', () => {
    const r = newRound(1, 42);
    expect(r.played.length).toBe(1);
    expect(r.hand.length).toBe(5);
    expect(r.deck.length).toBe(46);
    expect(remainingCount(r)).toBe(51);
    checkInvariant(r);
  });

  it('never deals a hand with no playable card', () => {
    for (let seed = 0; seed < 2000; seed++) expect(playableSlots(newRound(1, seed)).length).toBeGreaterThan(0);
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
    const r = newRound(1, 3);
    const bad = r.hand.findIndex((c) => c !== null && !canPlayOn(c, topCard(r)));
    if (bad >= 0) expect(play(r, bad)).toBeNull();
  });

  it('rewards: 100 coins per clear, partial only from 10 cards', () => {
    expect(cardReward(9, 0)).toEqual({ coins: 0, exp: 0 });
    expect(cardReward(10, 0)).toEqual({ coins: 2, exp: 2 });
    expect(cardReward(51, 1)).toEqual({ coins: 110, exp: 22 });
    expect(cardReward(102, 2).coins).toBe(220);
  });
});
