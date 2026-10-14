// Paper scraps (docs/03 meta-progression, Phase 7a): what a finished run
// earns. Pure; no DOM. The meta store (core/meta.js) banks it.
//
// Rates (user's choice, 7a; tune in Phase 9): per floor cleared, per enemy
// killed by a fold (core/turn.js foldKills), and a bonus for beating the
// Great Crane. A lost run keeps everything it earned; only the boss bonus
// is out of reach.

import { BOSS_FLOOR } from './run.js';
import { runHooks } from './relics.js';

export const SCRAP_RATES = Object.freeze({ floor: 5, foldKill: 2, boss: 25 });

/**
 * The scraps a won or lost run earns: { lines: [{ id, label, count, each,
 * amount }], total }. Lines with nothing earned are left out. Relics with
 * a `scraps(earned, run)` hook (Lucky Scrap, not built yet) change the
 * result and may add a line of their own.
 */
export function runScraps(run, rates = SCRAP_RATES) {
  const bossWon = run.status === 'won' && run.lastFloor === BOSS_FLOOR;
  const lines = [
    { id: 'floors', label: 'Floors cleared', count: run.cleared || 0, each: rates.floor },
    { id: 'foldKills', label: 'Fold kills', count: run.foldKills || 0, each: rates.foldKill },
    { id: 'boss', label: 'Great Crane', count: bossWon ? 1 : 0, each: rates.boss },
  ]
    .map((line) => ({ ...line, amount: line.count * line.each }))
    .filter((line) => line.amount > 0);
  const earned = { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
  return runHooks(run.relics || [], 'scraps', earned, run);
}
