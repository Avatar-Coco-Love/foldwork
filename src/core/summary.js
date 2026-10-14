// Run summary (docs/04 screen 5, Phase 6c): what the summary screen shows
// for a run that is over, won or lost. Pure: the screen only lays it out.
//
// Rows (user's choice, 6c): spirit, floors cleared, HP, relics, seed;
// paper scraps (7a) when the screen passes them in, and (7b) the unlocks
// the banked scraps just made affordable; (7d) for a daily run, its day
// and whether it was the scored run or practice.

import { BOSS_FLOOR } from './run.js';
import { relicDef } from './relics.js';
import { spiritDef } from './spirits.js';
import { shopKind } from './unlocks.js';
import { dailyLabel } from './daily.js';

/** How a lost run ended, by the floor's defeat cause (core/turn.js). */
const LOSS_TEXT = {
  fall: (floor) => `You fell through the paper on floor ${floor}.`,
  hp: (floor) => `Out of HP on floor ${floor}.`,
};

/**
 * The summary of a run that is over (status 'won' or 'lost'):
 * { outcome, title, text, rows: [{ id, label, value, items? }] }.
 * `items` (relics, scraps) is a list of lines; `value` is its short form.
 * `scraps` is ctx.lastScraps ({ earned (core/scraps.js runScraps), total,
 * banked, affordable? (core/unlocks.js shop items) }), or null for no
 * scraps row.
 */
export function runSummary(run, scraps = null) {
  const won = run.status === 'won';
  const boss = run.lastFloor === BOSS_FLOOR;
  let title;
  let text;
  if (won) {
    title = boss ? 'The Crane falls' : 'Run complete';
    text = boss
      ? 'You folded the Great Crane out of the sky. The run is won.'
      : `You cleared all ${run.lastFloor} floors. The run is won.`;
  } else {
    title = 'Torn';
    const say = LOSS_TEXT[run.cause] || ((floor) => `The run ended on floor ${floor}.`);
    text = `${say(run.floor)}${boss && run.floor === BOSS_FLOOR ? ' The Great Crane holds its roost.' : ''}`;
  }
  const spirit = run.spirit ? spiritDef(run.spirit) : null;
  const relics = run.relics.map((id) => relicDef(id).name);
  return {
    outcome: won ? 'won' : 'lost',
    title,
    text,
    rows: [
      ...(run.daily ? [{ id: 'daily', label: 'Daily', value: `${dailyLabel(run.daily)} · ${run.practice ? 'practice' : 'scored run'}` }] : []),
      { id: 'spirit', label: 'Spirit', value: spirit ? `${spirit.glyph} ${spirit.name}` : 'None' },
      { id: 'floors', label: 'Floors cleared', value: `${run.cleared} / ${run.lastFloor}` },
      { id: 'hp', label: 'HP', value: `${won ? run.hp : 0} / ${run.maxHp}` },
      { id: 'relics', label: 'Relics', value: relics.length ? String(relics.length) : 'None', items: relics },
      ...(scraps ? [scrapsRow(scraps)] : []),
      ...(scraps && scraps.affordable && scraps.affordable.length ? [unlocksRow(scraps.affordable)] : []),
      { id: 'seed', label: 'Seed', value: run.seed },
    ],
  };
}

// "+27 (140 saved)": the run's scraps and the bank after it. The list
// shows how they were earned, then that total. A dev run shows what it
// would earn, not banked.
function scrapsRow({
  earned, total, banked, practice,
}) {
  if (practice) return { id: 'scraps', label: 'Paper scraps', value: 'None: practice run' };
  const value = banked ? `+${earned.total} (${total} saved)` : `+${earned.total} (dev run, not saved)`;
  const lines = earned.lines.map((l) => (l.count > 1 ? `${l.label}: ${l.count} × ${l.each} = ${l.amount}` : `${l.label}: ${l.amount}`));
  return { id: 'scraps', label: 'Paper scraps', value, items: lines.length ? [...lines, `Total: ${value}`] : [] };
}

// "2 ready": shop items the banked scraps just made affordable.
function unlocksRow(items) {
  const lines = items.map((it) => `${it.def.name} (${shopKind(it.kind)?.noun || it.kind}): ${it.cost} scraps`);
  return { id: 'unlocks', label: 'Now affordable', value: `${items.length} in Unlocks`, items: lines };
}
