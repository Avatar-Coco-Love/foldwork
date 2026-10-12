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
//   cleared(run)       → run     after each floor won, before the offer
//   offer(offer)       → offer   the offer's shape before it is rolled
//                                ({ count }; core/run.js rollOffer)
//
// Hooks return new values and never mutate. A run only stores relic ids, so
// run state stays plain data (saves, telemetry); effects come from this
// table. A relic that needs a new kind of effect in play adds a field to
// DEFAULT_RULES and reads it in turn.js, rather than code here reaching into
// the turn engine.
//
// Def fields: id, name, text (one line for the HUD and offers), group
// ('fold' | 'defense' | 'utility'), rarity ('common' | 'uncommon' | 'rare';
// its offer weight, RARITY_WEIGHTS), glyph (a short symbol for the relic
// tray and offer cards), hooks.
//
// Rarities are provisional until playtests (docs/OPEN-QUESTIONS.md).

import { DEFAULT_RULES } from './turn.js';
import { DEFAULT_MAX_STACK } from './board.js';

/** Offer weight per rarity: a common shows up 6× as often as a rare. */
export const RARITY_WEIGHTS = Object.freeze({ common: 6, uncommon: 3, rare: 1 });

const atLeast = (field, n) => (rules) => ({ ...rules, [field]: Math.max(rules[field], n) });

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
    hooks: { rules: atLeast('undoDepth', 2) },
  },
  'diagonal-crease': {
    id: 'diagonal-crease',
    name: 'Diagonal Crease',
    text: 'You can fold along diagonals.',
    group: 'fold',
    rarity: 'uncommon',
    glyph: '⟋',
    hooks: { rules: (rules) => ({ ...rules, diagonal: true }) },
  },

  // --- Defense ---
  'paper-heart': {
    id: 'paper-heart',
    name: 'Paper Heart',
    text: '+1 max HP, and heal 1.',
    group: 'defense',
    rarity: 'common',
    glyph: '♥+',
    hooks: {
      gain: (run) => ({ ...run, maxHp: run.maxHp + 1, hp: Math.min(run.maxHp + 1, run.hp + 1) }),
    },
  },
  laminate: {
    id: 'laminate',
    name: 'Laminate',
    text: 'Ignore the first hit on each floor.',
    group: 'defense',
    rarity: 'common',
    glyph: '▣',
    hooks: { rules: atLeast('wards', 1) },
  },
  'soft-landing': {
    id: 'soft-landing',
    name: 'Soft Landing',
    text: 'Once per run, survive walking into a void: stay put and take 1 damage.',
    group: 'defense',
    rarity: 'uncommon',
    glyph: '☂',
    hooks: { gain: (run) => ({ ...run, landings: (run.landings || 0) + 1 }) },
  },
  'folded-shield': {
    id: 'folded-shield',
    name: 'Folded Shield',
    text: 'After you fold, the next hit that turn is negated.',
    group: 'defense',
    rarity: 'uncommon',
    glyph: '◈',
    hooks: { rules: (rules) => ({ ...rules, foldGuard: true }) },
  },
  mender: {
    id: 'mender',
    name: 'Mender',
    text: 'Heal 1 HP after every 2 floors cleared.',
    group: 'defense',
    rarity: 'common',
    glyph: '✚',
    hooks: {
      cleared: (run) => (run.cleared % 2 === 0 ? { ...run, hp: Math.min(run.maxHp, run.hp + 1) } : run),
    },
  },

  // --- Utility ---
  'master-key': {
    id: 'master-key',
    name: 'Master Key',
    text: 'The first lock you walk into on each floor opens without a key.',
    group: 'utility',
    rarity: 'common',
    glyph: '⚿',
    hooks: { rules: atLeast('freeLocks', 1) },
  },
  'paper-cut': {
    id: 'paper-cut',
    name: 'Paper Cut',
    text: 'Your bumps deal +1 damage to enemies on stacked tiles.',
    group: 'utility',
    rarity: 'common',
    glyph: '✂',
    hooks: { rules: atLeast('stackBump', 1) },
  },
  'heavy-stamp': {
    id: 'heavy-stamp',
    name: 'Heavy Stamp',
    text: 'A pressure plate you step off stays pressed for 3 turns.',
    group: 'utility',
    rarity: 'uncommon',
    glyph: '⊥',
    hooks: { rules: atLeast('plateHold', 3) },
  },
  'origami-luck': {
    id: 'origami-luck',
    name: 'Origami Luck',
    text: 'Relic choices show 4 options instead of 3.',
    group: 'utility',
    rarity: 'rare',
    glyph: '✦',
    hooks: { offer: (offer) => ({ ...offer, count: Math.max(offer.count, 4) }) },
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
