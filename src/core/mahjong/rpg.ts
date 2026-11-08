import type { RoundResult } from './round';

/**
 * 麻雀の アガリ点 → HP ダメージ(2026-11-08 企画者 仕様書 Ver.1.0 の 4)。
 * 麻雀の 点数と HP は 別に 持つ。ここは 麻雀の 結果を 受けとって ダメージを 出すだけ。
 * 本場・供託の 点は ダメージに 入れない(アガリの 点だけ)【仮：仕様書「積み棒・供託は エンジン設計時に 整理」】
 */
export const PLAYER_SEAT = 0;

export interface Damage {
  /** 敵チームへの ダメージ */
  toEnemy: number;
  /** プレイヤーへの ダメージ */
  toPlayer: number;
  /** どの アガリから か(演出用) */
  hits: { winner: number; from: number | null; amount: number; target: 'enemy' | 'player' }[];
}

export function damageOf(r: RoundResult, bossSeat: number): Damage {
  const d: Damage = { toEnemy: 0, toPlayer: 0, hits: [] };
  if (r.kind !== 'win') {
    // 流し満貫【仮：ツモと 同じ ように ダメージに する】
    for (const n of r.nagashi ?? []) {
      if (n.seat === PLAYER_SEAT) {
        const amount = n.paid.reduce((a, b) => a + b, 0);
        d.toEnemy += amount;
        d.hits.push({ winner: n.seat, from: null, amount, target: 'enemy' });
      } else if (n.paid[PLAYER_SEAT] > 0) {
        d.toPlayer += n.paid[PLAYER_SEAT];
        d.hits.push({ winner: n.seat, from: null, amount: n.paid[PLAYER_SEAT], target: 'player' });
      }
    }
    return d;
  }
  for (const w of r.wins) {
    if (w.seat === PLAYER_SEAT) {
      let amount: number;
      if (w.from === null) amount = w.paid.reduce((a, b) => a + b, 0); // ツモ: 3人の 支払いの 合計(50%なし)
      else amount = w.from === bossSeat ? w.score.ron : Math.floor(w.score.ron * 0.5); // 子分から ロンは 半分
      d.toEnemy += amount;
      d.hits.push({ winner: w.seat, from: w.from, amount, target: 'enemy' });
    } else if (w.from === null || w.from === PLAYER_SEAT) {
      // CPU の ツモ: プレイヤーが 払う 点 / CPU の ロン(プレイヤーから): アガリ点 100%
      const amount = w.paid[PLAYER_SEAT];
      if (amount > 0) {
        d.toPlayer += amount;
        d.hits.push({ winner: w.seat, from: w.from, amount, target: 'player' });
      }
    }
    // CPU どうしの ロンは ダメージなし【暫定 企画者 仕様書】
  }
  return d;
}

export interface Hp {
  player: number;
  playerMax: number;
  enemy: number;
  enemyMax: number;
}

/** HP を 減らす(0 より 下は 0) */
export function applyDamage(hp: Hp, d: Damage): Hp {
  return { ...hp, player: Math.max(0, hp.player - d.toPlayer), enemy: Math.max(0, hp.enemy - d.toEnemy) };
}
export const stageResult = (hp: Hp): 'clear' | 'lose' | null => (hp.enemy <= 0 ? 'clear' : hp.player <= 0 ? 'lose' : null);
