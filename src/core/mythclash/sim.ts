/**
 * MYTHCLASH の3対3シミュレーション(バランスを見るため)。Phaserに依存しない。
 * 乱数の種(seed)・試合数を決めれば、毎回同じ結果になる。
 *
 * かんたんなAI【暫定・バランス確認用。本番のCPUではない】:
 * - 攻撃側: 必殺が使えれば30%で必殺。それ以外は 魔力×(魔法の追加効果があれば1.3) と 攻撃 をくらべた重みで、魔法か通常攻撃
 *   自分のHPが30%以下で、控えにHPが60%以上のカードがいれば、20%で交代
 * - 防御側: 相手が必殺を使えれば30%でカウンター。相手の魔力が攻撃より高ければ魔法防御を多め。のこりは通常防御
 * - 戦闘不能のあとは、控えのうち番号が若い方を出す
 * 簡単にしたこと: 相手の未登場カードは読まない(AIは見えてよい情報だけで決める形にはまだしていない)
 */
import { CARDS, type Rarity } from './cards';
import { activeCard, createBattle, legalActions, resolveRound, type BattleAction, type BattleState, type Side } from './engine';
import { magicEffectOf } from './magic';
import { DEFAULT_RULES, type BattleRules } from './rules';
import { mulberry32, type Rng } from '../rng';

export function aiAction(s: BattleState, side: Side, rng: Rng): BattleAction {
  const legal = legalActions(s, side);
  const me = activeCard(s, side);
  const op = activeCard(s, side === 0 ? 1 : 0);
  const has = (a: BattleAction) => legal.some((l) => JSON.stringify(l) === JSON.stringify(a));
  const bench = s.teams[side].cards.findIndex((c, i) => i !== s.teams[side].active && !c.down && c.hp >= c.def.maxHp * 0.6);
  if (me.hp <= me.def.maxHp * 0.3 && bench >= 0 && rng() < 0.2 && has({ type: 'switch', to: bench })) return { type: 'switch', to: bench };
  if (side === s.attacker) {
    if (has({ type: 'attack', kind: 'special' }) && rng() < 0.3) return { type: 'attack', kind: 'special' };
    const effect = magicEffectOf(me.def.magic.effectCode).effect.kind !== 'none' ? 1.3 : 1;
    const wm = me.def.mag * effect;
    const wa = me.def.atk;
    const kind = rng() < wm / (wm + wa) ? 'magic' : 'normal';
    if (has({ type: 'attack', kind })) return { type: 'attack', kind };
    return legal[0];
  }
  const opSpecial = !op.specialLock;
  const r = rng();
  if (opSpecial && r < 0.3 && has({ type: 'defend', kind: 'counter' })) return { type: 'defend', kind: 'counter' };
  const magicLean = op.def.mag > op.def.atk ? 0.6 : 0.25;
  if (rng() < magicLean && has({ type: 'defend', kind: 'magicGuard' })) return { type: 'defend', kind: 'magicGuard' };
  return has({ type: 'defend', kind: 'guard' }) ? { type: 'defend', kind: 'guard' } : legal[0];
}

export interface SimReport {
  matches: number;
  seed: number;
  winRateA: number;
  draws: number;
  avgRounds: number;
  /** 8〜15ターンで決着した割合 */
  in8to15: number;
  over15: number;
  switchesPerMatch: number;
  /** 行動の選ばれた割合 */
  actionRate: Record<string, number>;
  /** 状態異常: 判定の回数と、付いた回数 */
  status: Record<string, { tries: number; applied: number }>;
}

/** 1試合 */
export function playMatch(a: number[], b: number[], seed: number, rules: BattleRules = DEFAULT_RULES, maxRounds = 200) {
  const { state } = createBattle(a, b, seed, rules);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const log: { actions: BattleAction[]; events: ReturnType<typeof resolveRound> }[] = [];
  while (state.winner === null && state.round <= maxRounds) {
    const actions: [BattleAction, BattleAction] = [aiAction(state, 0, rng), aiAction(state, 1, rng)];
    log.push({ actions, events: resolveRound(state, actions) });
  }
  return { state, log };
}

/** ランダムなデッキ(rarities を指定すると、そのレアの中から) */
export function randomDeck(rng: Rng, rarities?: Rarity[]): number[] {
  const pool = CARDS.filter((c) => !rarities || rarities.includes(c.rarity)).map((c) => c.id);
  const out: number[] = [];
  while (out.length < 3) {
    const id = pool[Math.floor(rng() * pool.length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function simulate(matches: number, seed: number, decks: (rng: Rng) => [number[], number[]] = (r) => [randomDeck(r), randomDeck(r)], rules: BattleRules = DEFAULT_RULES): SimReport {
  const rng = mulberry32(seed);
  let winsA = 0;
  let draws = 0;
  let rounds = 0;
  let in8to15 = 0;
  let over15 = 0;
  let switches = 0;
  const actions: Record<string, number> = {};
  let actionTotal = 0;
  const status: Record<string, { tries: number; applied: number }> = {};
  for (let m = 0; m < matches; m++) {
    const [a, b] = decks(rng);
    const { state, log } = playMatch(a, b, Math.floor(rng() * 2 ** 31), rules);
    if (state.winner === 0) winsA++;
    if (state.winner === 'draw') draws++;
    // ターンの数(前半と後半で1ターン。企画者 2026-10-26)
    const r = state.round;
    rounds += r;
    if (r >= 8 && r <= 15) in8to15++;
    if (r > 15) over15++;
    for (const { actions: acts, events } of log) {
      for (const act of acts) {
        const k = act.type === 'switch' ? 'switch' : act.kind;
        actions[k] = (actions[k] ?? 0) + 1;
        actionTotal++;
      }
      for (const e of events) {
        if (e.type === 'switch') switches++;
        if (e.type === 'status') {
          const st = (status[e.status] ??= { tries: 0, applied: 0 });
          st.tries++;
          if (e.applied) st.applied++;
        }
      }
    }
  }
  const actionRate: Record<string, number> = {};
  for (const [k, v] of Object.entries(actions)) actionRate[k] = v / actionTotal;
  return { matches, seed, winRateA: winsA / matches, draws, avgRounds: rounds / matches, in8to15: in8to15 / matches, over15: over15 / matches, switchesPerMatch: switches / matches, actionRate, status };
}
