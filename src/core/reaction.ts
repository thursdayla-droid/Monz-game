import type { Personality } from './dna';
import type { Rng } from './rng';

export type Emotion = 'neutral' | 'happy' | 'angry' | 'sleepy' | 'surprised';

/**
 * なでられた(タップされた)ときの反応。性格で確率が変わる。
 * 【提案】数値は仮。なでて喜ぶ子も嫌がる子もいる、という指示書4章の例を表現する。
 */
export function reactToPet(p: Personality, rng: Rng): Emotion {
  const like = p.sociability * 0.6 + p.clinginess * 0.8 + 10;
  const dislike = (100 - p.sociability) * 0.4 + p.competitiveness * 0.3 + p.caution * 0.2;
  const surprise = p.caution * 0.25;
  const r = rng() * (like + dislike + surprise);
  if (r < like) return 'happy';
  if (r < like + dislike) return 'angry';
  return 'surprised';
}

export type IdleAction = 'idle' | 'walk' | 'sleep';

/** ホームでの自律行動の選び方(ユーティリティAIの最小形)。 */
export function chooseIdleAction(p: Personality, energy: number, rng: Rng): IdleAction {
  const weights: Record<IdleAction, number> = {
    walk: p.curiosity * 0.8 + p.bravery * 0.3 + energy * 0.3,
    idle: p.caution * 0.6 + p.focus * 0.3 + 20,
    sleep: Math.max(0, 60 - energy) * 1.5,
  };
  const entries = Object.entries(weights) as [IdleAction, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [a, w] of entries) {
    r -= w;
    if (r < 0) return a;
  }
  return 'idle';
}
