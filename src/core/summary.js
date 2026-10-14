// Run summary (docs/04 screen 5, Phase 6c): what the summary screen shows
// for a run that is over, won or lost. Pure: the screen only lays it out.
//
// Rows (user's choice, 6c): spirit, floors cleared, HP, relics, seed.
// Scraps and unlocks join in Phase 7.

import { BOSS_FLOOR } from './run.js';
import { relicDef } from './relics.js';
import { spiritDef } from './spirits.js';

/** How a lost run ended, by the floor's defeat cause (core/turn.js). */
const LOSS_TEXT = {
  fall: (floor) => `You fell through the paper on floor ${floor}.`,
  hp: (floor) => `Out of HP on floor ${floor}.`,
};

/**
 * The summary of a run that is over (status 'won' or 'lost'):
 * { outcome, title, text, rows: [{ id, label, value, items? }] }.
 * `items` (relics) is a list of names; `value` is its short form.
 */
export function runSummary(run) {
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
      { id: 'spirit', label: 'Spirit', value: spirit ? `${spirit.glyph} ${spirit.name}` : 'None' },
      { id: 'floors', label: 'Floors cleared', value: `${run.cleared} / ${run.lastFloor}` },
      { id: 'hp', label: 'HP', value: `${won ? run.hp : 0} / ${run.maxHp}` },
      { id: 'relics', label: 'Relics', value: relics.length ? String(relics.length) : 'None', items: relics },
      { id: 'seed', label: 'Seed', value: run.seed },
    ],
  };
}
