import { it } from 'vitest';
import { BETS, simulate, theory } from '../src/core/slot/slot';

// MONZ SLOT の 払い戻し率しらべ(仕様書 11。100万回転 × BET 3種)。ふだんは 走らない: SLOT=出力先 npx vitest run tests/slot.sim.test.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env: Record<string, string | undefined> = (globalThis as any).process?.env ?? {};
const OUT = env.SLOT;
const N = Number(env.SLOT_N ?? 1_000_000);

it.skipIf(!OUT)('slot: 100万回転 × BET 10/50/100', async () => {
  const { writeFileSync } = await import(/* @vite-ignore */ 'node:' + 'fs');
  const t = theory();
  // 同じ 種で 回す → BET ごとの ちがいは 四捨五入 だけ
  const same = BETS.map((b) => simulate(b, N, 2026));
  // ちがう 種でも(ぶれの 確認)
  const other = BETS.map((b, i) => simulate(b, N, 9000 + i));
  writeFileSync(OUT!, JSON.stringify({ theory: t, same, other }, null, 1));
}, 600_000);
