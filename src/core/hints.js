// Tutorial hints (docs/04 tutorial). Data plus a pure trigger check; no DOM.
// Floor templates list the hint ids they use (core/floors.js); the floor
// screen shows matching hints one at a time, each once per player (seen
// ids are saved by ui/hintStore.js), and How to Play lists them all.
//
// A hint's `on` says when it appears:
//   'start'            when the floor starts
//   'event:<type>'     after an action whose events include <type>
//                      (core/turn.js event list); `who` narrows it to the
//                      player ('player') or anyone else ('other') by the
//                      event's id
//   'refuse:<reason>'  when an action is refused for <reason>
// Order in HINTS is the order How to Play lists them in.

export const HINTS = Object.freeze({
  'fold-drag': {
    title: 'Fold the floor',
    text: 'Drag across the board to fold it. The side you start on folds over the crease line. Keyboard: F, then arrows and Enter.',
    on: 'start',
  },
  'fold-bridge': {
    title: 'Bridge the gap',
    text: 'Paper folded over a void covers it, so you can walk across. Anything standing on folded paper rides along.',
    on: 'event:fold',
  },
  'undo': {
    title: 'Free undo',
    text: 'Undo Fold (U) takes back your latest fold and refunds its charge, until you take another action.',
    on: 'event:fold',
  },
  'mite-bump': {
    title: 'Scrap Mites',
    text: 'Mites step toward you every turn and bite for 1. Walk into one to hit it.',
    on: 'event:damage',
  },
  'plate-gate': {
    title: 'Plates and gates',
    text: 'A gate opens while someone stands on a plate with the same mark. It can\'t close on a creature standing in it.',
    on: 'start',
  },
  'thick-stack': {
    title: 'Thick card',
    text: 'A stack 3 sheets high is full: nothing can land on it, and it can only fold onto an empty cell.',
    on: 'start',
  },
  'pin': {
    title: 'Pinned',
    text: 'Paper folded onto a creature pins it underneath. It can\'t act or be hit until the paper moves away.',
    on: 'event:pin',
    who: 'other',
  },
  'pinned-self': {
    title: 'You\'re pinned',
    text: 'A fold covered you. You can\'t walk out from under it, but you can wait, fold again, or undo.',
    on: 'event:pin',
    who: 'player',
  },
  'key-lock': {
    title: 'Keys and locks',
    text: 'Walk onto a key to pick it up, then walk into a lock to open it.',
    on: 'start',
  },
  'wasp-sting': {
    title: 'Paper Wasps',
    text: 'A Wasp never moves, but stings you from up to 4 tiles away along its row or column (the dashed line). Walls, other creatures and taller stacks block the shot.',
    on: 'start',
  },
  'brute-heavy': {
    title: 'Card Brutes',
    text: 'Brutes have 3 HP and move every other turn (a "z" means it rests next turn). Too heavy to pin: no fold can land on one, except a void sheet that drops it.',
    on: 'start',
  },
  'creaseling-slide': {
    title: 'Creaselings',
    text: 'After every fold, a Creaseling slides up to 3 tiles along the crease toward you (the dashed arrow in the fold preview). Otherwise it steps like a Mite. Pick creases that send it the wrong way.',
    on: 'start',
  },
  'lockjaw-guard': {
    title: 'Lockjaws',
    text: 'A Lockjaw never moves and bites you on any tile next to it. It holds a key (shown at its feet) and drops it when it dies. Fold it onto a lock, or a lock onto it, to use its key without a fight.',
    on: 'start',
  },
  'bloom-spawn': {
    title: 'Spore Blooms',
    text: 'The number on a Bloom counts down the turns until a Scrap Mite sprouts next to it (the dashed ring). Pin it under a fold, or cut it off from you, and it stops counting.',
    on: 'start',
  },
  'key-fold': {
    title: 'Fold a key in',
    text: 'A fold that stacks a key straight onto a lock opens it too, no walking needed.',
    on: 'start',
  },
});

export function hintDef(id) {
  return HINTS[id] || null;
}

/**
 * Ids from `ids` that a trigger shows, skipping ones in `seen` (a Set).
 * trigger: { type: 'start' } | { type: 'events', events } |
 *          { type: 'refuse', reason }. `playerId` tells `who` apart.
 */
export function hintsFor(ids, trigger, seen, playerId = 'player', defs = HINTS) {
  return ids.filter((id) => {
    const def = defs[id];
    return def && !seen.has(id) && matches(def, trigger, playerId);
  });
}

function matches(def, trigger, playerId) {
  const [kind, arg] = def.on.split(':');
  if (kind === 'start') return trigger.type === 'start';
  if (kind === 'refuse') return trigger.type === 'refuse' && trigger.reason === arg;
  if (kind !== 'event' || trigger.type !== 'events') return false;
  return trigger.events.some((ev) => ev.type === arg && whoMatches(def.who, ev.id, playerId));
}

function whoMatches(who, id, playerId) {
  if (who === 'player') return id === playerId;
  if (who === 'other') return id !== playerId;
  return true;
}
