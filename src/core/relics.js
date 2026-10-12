// Relics (docs/03): data plus hooks. Pure; no DOM.
//
// A relic is a plain object in RELIC_DEFS. What it does is a set of hooks,
// each a pure function the run or the floor calls at a fixed point:
//
//   gain(run)          → run     once, when the relic is taken (core/run.js)
//   setup(setup, run)  → setup   floor start: createFloorState() options
//                                (charges, board.maxStack, hp, ...)
//   rules(rules)       → rules   the turn engine's rule values for the floor
//                                (DEFAULT_RULES in core/turn.js)
//
// Hooks return new values and never mutate. A run only stores relic ids, so
// run state stays plain data (saves, telemetry); effects come from this
// table. A relic that needs a new kind of effect in play adds a field to
// DEFAULT_RULES and reads it in turn.js, rather than code here reaching into
// the turn engine.
//
// Def fields: id, name, text (one line for the HUD and offers), group
// ('fold' | 'defense' | 'utility'), rarity ('common' | 'uncommon' | 'rare';
// offer weight, 4b), glyph (a short symbol for the relic tray), hooks.

import { DEFAULT_RULES } from './turn.js';
import { DEFAULT_MAX_STACK } from './board.js';

export const RELIC_DEFS = Object.freeze({
  'extra-crease': {
    id: 'extra-crease',
    name: 'Extra Crease',
    text: '+1 fold charge on every floor.',
    group: 'fold',
    rarity: 'common',
    glyph: '+1',
    hooks: {
      setup: (setup) => ({ ...setup, charges: setup.charges + 1 }),
    },
  },
  'thick-paper': {
    id: 'thick-paper',
    name: 'Thick Paper',
    text: 'Stacks can be one layer taller.',
    group: 'fold',
    rarity: 'uncommon',
    glyph: '≡',
    hooks: {
      setup: (setup) => ({
        ...setup,
        board: { ...setup.board, maxStack: (setup.board.maxStack ?? DEFAULT_MAX_STACK) + 1 },
      }),
    },
  },
  'recycled-crease': {
    id: 'recycled-crease',
    name: 'Recycled Crease',
    text: 'A fold that pins, strands or drops an enemy refunds its charge.',
    group: 'fold',
    rarity: 'uncommon',
    glyph: '♻',
    hooks: {
      rules: (rules) => ({ ...rules, foldRefund: Math.max(rules.foldRefund, 1) }),
    },
  },
  'spring-crease': {
    id: 'spring-crease',
    name: 'Spring Crease',
    text: 'Free undo can take back your last 2 folds.',
    group: 'fold',
    rarity: 'common',
    glyph: '↶2',
    hooks: {
      rules: (rules) => ({ ...rules, undoDepth: Math.max(rules.undoDepth, 2) }),
    },
  },
});

export function relicDef(id) {
  const def = RELIC_DEFS[id];
  if (!def) throw new Error(`Unknown relic: ${id}`);
  return def;
}

export function isRelic(id) {
  return Object.prototype.hasOwnProperty.call(RELIC_DEFS, id);
}

/** Run each relic's `name` hook over `value`, in the order they were taken. */
export function runHooks(relics, name, value, ...args) {
  let out = value;
  for (const id of relics) {
    const hook = relicDef(id).hooks[name];
    if (hook) out = hook(out, ...args);
  }
  return out;
}

/** The turn engine's rule values with these relics. */
export function rulesFor(relics) {
  return runHooks(relics, 'rules', { ...DEFAULT_RULES });
}

/**
 * createFloorState() options for a floor played with these relics: the
 * `setup` hooks, then the rules. `run` is passed to hooks that need it.
 */
export function applyRelics(setup, relics, run = null) {
  const out = runHooks(relics, 'setup', setup, run);
  return { ...out, rules: rulesFor(relics) };
}
