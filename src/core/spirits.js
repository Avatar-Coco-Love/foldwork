// Spirits (docs/03): the character a run starts as. Pure; no DOM.
//
// A spirit is data like a relic (core/relics.js) and uses the same hook
// points, so the turn engine never asks which spirit is playing:
//
//   gain(run)          → run     once, when the run starts (core/run.js)
//   setup(setup, run)  → setup   floor start, before the relics' setup hooks
//   rules(rules)       → rules   the floor's rule values (DEFAULT_RULES)
//
// Def fields: id, name, hp (starting max HP), perk (one line for the select
// screen), glyph (a short symbol shown with the name), covers (relic ids
// whose effect the spirit already has; they are left out of its offers),
// unlock ('starter', or left out for a shop spirit with its `cost` in
// paper scraps; core/unlocks.js), hooks. A saved run keeps its spirit
// whether or not it is unlocked: the lock is only on spirit select.

export const SPIRIT_DEFS = Object.freeze({
  fox: {
    id: 'fox',
    name: 'Fox',
    hp: 3,
    perk: 'Starts each floor with +1 fold charge.',
    glyph: '△',
    covers: [],
    unlock: 'starter',
    hooks: {
      setup: (setup) => ({ ...setup, charges: setup.charges + 1 }),
    },
  },
  frog: {
    id: 'frog',
    name: 'Frog',
    hp: 2,
    perk: 'Diagonal creases unlocked from the start.',
    glyph: '◇',
    cost: 30,
    covers: ['diagonal-crease'],
    hooks: {
      rules: (rules) => ({ ...rules, diagonal: true }),
    },
  },
  turtle: {
    id: 'turtle',
    name: 'Turtle',
    hp: 4,
    perk: 'Free undo can take back your last 2 folds.',
    glyph: '⬡',
    cost: 50,
    covers: ['spring-crease'],
    hooks: {
      rules: (rules) => ({ ...rules, undoDepth: Math.max(rules.undoDepth, 2) }),
    },
  },
});

export function spiritDef(id) {
  const def = SPIRIT_DEFS[id];
  if (!def) throw new Error(`Unknown spirit: ${id}`);
  return def;
}

export function isSpirit(id) {
  return Object.prototype.hasOwnProperty.call(SPIRIT_DEFS, id);
}

/** Run a spirit's `name` hook over `value` (no spirit or no hook: unchanged). */
export function spiritHook(id, name, value, ...args) {
  const hook = id ? spiritDef(id).hooks[name] : null;
  return hook ? hook(value, ...args) : value;
}
