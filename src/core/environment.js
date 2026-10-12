// Environment rules (docs/02 turn step 3): keys and locks, pressure plates
// and the gates they power. Pure functions over plain-data boards; no DOM.
// turn.js calls these from player actions, fold resolution and the
// `environment` turn phase.
//
// Rules (decided in Phase 3a, see docs/OPEN-QUESTIONS.md):
//   - Only the top layer is active: a plate is pressed while a creature
//     stands on its top layer, and a covered plate is never pressed.
//   - A gate is open while any plate with its link is pressed. Gates update
//     in the environment phase, after enemies act. A gate can't close on a
//     creature: it stays open until the cell is clear.
//   - A key opens a lock when the player walks into the lock carrying one,
//     or when a fold stacks a key's layer and a lock directly on each other
//     (either one on top). The key is used up and the lock becomes a door.
//     A key held by a creature (Lockjaw) counts as on its layer here.
//   - Heavy Stamp (rules.plateHold = n): a plate stays pressed for n turns
//     after its creature leaves (the turn it leaves counts). The plate layer
//     counts down in `layer.hold`; a covered plate is not pressed and keeps
//     its count.

import { tileDef, itemDef } from './tiles.js';

/** Link channel of a plate or gate layer. */
export const linkOf = (layer) => layer.link ?? 0;

/**
 * Links with at least one pressed plate: a creature on its top layer, or a
 * Heavy Stamp hold still counting down.
 */
export function pressedLinks(board) {
  const pressed = new Set();
  for (const cell of board.cells) {
    const top = cell.layers[cell.layers.length - 1];
    if (top && (top.creature || top.hold > 0) && tileDef(top.tile).plate) pressed.add(linkOf(top));
  }
  return pressed;
}

/**
 * Heavy Stamp countdown, after gates were synced (mutates `board`): a plate
 * with a creature on it is held for `turns` more turns; an empty one counts
 * down. Nothing happens with turns = 0.
 */
export function tickPlates(board, turns) {
  if (!(turns > 0)) return;
  for (const cell of board.cells) {
    const top = cell.layers[cell.layers.length - 1];
    if (!top || !tileDef(top.tile).plate) continue;
    if (top.creature) top.hold = turns;
    else if (top.hold > 0) top.hold -= 1;
  }
}

/**
 * Open or close every gate to match its link (mutates `board`). Gates at any
 * depth follow their plates, so a gate uncovered later is already right.
 * Calls emit({ type: 'gate', at, open, link }) for each change, if given.
 */
export function syncGates(board, emit = null) {
  const pressed = pressedLinks(board);
  board.cells.forEach((cell, i) => {
    for (const layer of cell.layers) {
      const def = tileDef(layer.tile);
      const link = linkOf(layer);
      let next = null;
      if (def.powered && pressed.has(link)) next = def.powered;
      else if (def.unpowered && !pressed.has(link) && !layer.creature) next = def.unpowered;
      if (!next) continue;
      layer.tile = next;
      if (emit) {
        const col = i % board.w;
        emit({ type: 'gate', at: { col, row: (i - col) / board.w }, open: tileDef(next).walkable, link });
      }
    }
  });
}

/** Whether a lock tile is still locked. */
export const isLocked = (layer) => !!layer && !!tileDef(layer.tile).unlocksTo;

/** Whether an item id opens locks. */
const opens = (item) => !!item && !!itemDef(item).opens;

/**
 * Whether a layer carries an item that opens locks: lying on it, or held
 * by the creature standing on it (a Lockjaw's key, core/creatures.js).
 */
export const holdsKey = (layer) => !!layer && (opens(layer.item) || (!!layer.creature && opens(layer.creature.item)));

/** Use up the key `layer` holds (holdsKey): the one on the paper first. */
export function spendKey(layer) {
  if (opens(layer.item)) layer.item = null;
  else layer.creature.item = null;
}

/** Turn a lock layer into its open form (mutates the layer). */
export function unlockLayer(layer) {
  layer.tile = tileDef(layer.tile).unlocksTo;
}

/**
 * Key delivery by fold: `lower` was the destination's top layer and `upper`
 * is the landed stack's top layer. Returns which of the two holds the lock
 * and which the key, or null when they don't meet.
 */
export function keyMeetsLock(lower, upper) {
  if (!lower || !upper) return null;
  if (isLocked(lower) && holdsKey(upper)) return { lock: lower, key: upper };
  if (isLocked(upper) && holdsKey(lower)) return { lock: upper, key: lower };
  return null;
}
