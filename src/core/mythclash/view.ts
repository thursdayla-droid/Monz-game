/**
 * MYTHCLASH の「見せてよい情報」だけを作る(企画者の決まり 2026-10-26・確定)。Phaserに依存しない。
 * - 自分のチームは全部見える
 * - 相手の、まだ一度も場に出ていないカードは「？？？」(名前・絵・属性・レアリティなども出さない)
 * - 一度出た相手のカードは、控えにもどっても公開のまま
 * - 相手の魔法属性は、そのカードが初めて魔法を使うまで出さない
 * 画面・ログ・対戦のやりとり・観戦・リプレイは、かならずこの関数を通した情報だけを使う(状態そのものを渡さない)
 */
import type { BattleEvent, BattleState, CardBattleState, Side } from './engine';

export interface VisibleCard {
  hidden: false;
  id: number;
  name: string;
  rarity: string;
  element: string;
  /** 魔法属性(相手のカードは、魔法を使うまで null) */
  magicElement: string | null;
  hp: number;
  maxHp: number;
  down: boolean;
  active: boolean;
  skip: 'sleep' | 'freeze' | null;
  dot: 'poison' | 'burn' | null;
}
export interface HiddenCard {
  hidden: true;
}

export interface BattleView {
  me: VisibleCard[];
  opponent: (VisibleCard | HiddenCard)[];
  /** 自分が攻撃側か(今のフェイズ) */
  attacking: boolean;
  round: number;
  /** 前半(1)・後半(2) */
  half: 1 | 2;
  winner: 'me' | 'opponent' | 'draw' | null;
}

function show(c: CardBattleState, active: boolean, ownTeam: boolean): VisibleCard {
  return {
    hidden: false,
    id: c.id,
    name: c.def.name,
    rarity: c.def.rarity,
    element: c.def.element,
    magicElement: ownTeam || c.magicRevealed ? c.def.magic.element : null,
    hp: c.hp,
    maxHp: c.def.maxHp,
    down: c.down,
    active,
    skip: c.skip,
    dot: c.dot,
  };
}

export function viewFor(s: BattleState, side: Side): BattleView {
  const me = s.teams[side];
  const op = s.teams[side === 0 ? 1 : 0];
  return {
    me: me.cards.map((c, i) => show(c, i === me.active, true)),
    opponent: op.cards.map((c, i) => (c.entered ? show(c, i === op.active, false) : { hidden: true as const })),
    attacking: s.attacker === side,
    round: s.round,
    half: s.half,
    winner: s.winner === null ? null : s.winner === 'draw' ? 'draw' : s.winner === side ? 'me' : 'opponent',
  };
}

/**
 * その側に見せてよい出来事だけにする。相手のまだ出ていないカードの番号が入った出来事は出さない
 * (出来事は、カードが場に出たあとにしか起きないが、念のため)
 */
export function eventsFor(s: BattleState, side: Side, events: BattleEvent[]): BattleEvent[] {
  const op: Side = side === 0 ? 1 : 0;
  const known = new Set(s.teams[op].cards.filter((c) => c.entered).map((c) => c.id));
  return events.filter((e) => {
    if (!('side' in e) || e.side !== op) return true;
    if ('id' in e && !known.has(e.id)) return false;
    if (e.type === 'switch' && (!known.has(e.from) || !known.has(e.to))) return false;
    return true;
  });
}
