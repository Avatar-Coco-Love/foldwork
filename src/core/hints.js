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
//                      event's id, and `match` (plain fields) to events
//                      whose fields equal those values
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
    text: 'Undo (U) takes back your latest fold and refunds its charge, until you take another action.',
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
  'fold-enemies': {
    title: 'Fold, don\'t fight',
    text: 'Paper folded onto an enemy pins it. A fold that cuts off its path strands it, and it can\'t reach you. Look for a fold that does both.',
    on: 'start',
  },
  'strand': {
    title: 'Stranded',
    text: 'That enemy has no path to you now, so it waits where it is. Folding paper back across the gap frees it.',
    on: 'event:strand',
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
    text: 'A Wasp never moves, but stings you from up to 4 tiles away along its row or column (the dashed line). Walls, other creatures and taller stacks in between block the shot; standing up high won\'t hide you.',
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
    text: 'A Lockjaw never moves. Step next to it and its jaws open: still next to it after your next move, it bites. Walk on past, or fold a void onto it to drop it through: its key (shown at its feet) lands on the nearest free tile. Folding it onto a lock, or a lock onto it, uses the key too.',
    on: 'start',
  },
  'bloom-spawn': {
    title: 'Spore Blooms',
    text: 'The number on a Bloom counts down the turns until a Scrap Mite sprouts next to it (the dashed ring). Pin it under a fold, or cut it off from you, and it stops counting.',
    on: 'start',
  },
  'crane-telegraph': {
    title: 'The Great Crane',
    text: 'The Crane folds the floor too. Each time it marks a crease (the dashed line and hatched tiles), it folds that strip on its next turn. Only folds hurt it: drop a void on it. Bumping it just makes it fly off.',
    on: 'start',
  },
  'crane-swat': {
    title: 'Swatted',
    text: 'The Crane\'s fold landed on you: 1 damage, and you were knocked to the nearest open tile. Step off the hatched tiles before it folds, or fold first to change what its crease will move.',
    on: 'event:swat',
  },
  'crane-minions': {
    title: 'Paper minions',
    text: 'Hurt, the Crane calls Scrap Mites: one now, and one with each fold it makes, up to two at a time. Mites standing on a strip it folds ride along with it.',
    on: 'event:spawn',
  },
  'crane-double': {
    title: 'Two creases',
    text: 'Badly torn, the Crane marks two creases at once. It folds 1, then 2, on its next turn; the second is aimed at the floor as the first leaves it. A beat of its folds hurts you once at most.',
    on: 'event:mark',
    match: { n: 2 },
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
  return trigger.events.some((ev) => ev.type === arg && whoMatches(def.who, ev.id, playerId) && fieldsMatch(def.match, ev));
}

function fieldsMatch(match, ev) {
  if (!match) return true;
  for (const key in match) if (ev[key] !== match[key]) return false;
  return true;
}

function whoMatches(who, id, playerId) {
  if (who === 'player') return id === playerId;
  if (who === 'other') return id !== playerId;
  return true;
}
