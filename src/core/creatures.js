// Creature definitions. Data only, like tiles.js: behavior lives in the
// systems that read them (turn.js; enemy AI in enemies.js from Phase 2b).
// A creature instance is plain data stored on a layer:
//
//   Creature = { id, kind, hp, maxHp }
//
// It rides its layer, so folds move it for free.

export const CREATURE_DEFS = Object.freeze({
  player: { kind: 'player', name: 'You', team: 'player', hp: 3 },
});

export function creatureDef(kind) {
  const def = CREATURE_DEFS[kind];
  if (!def) throw new Error(`Unknown creature kind: ${kind}`);
  return def;
}

/** New creature of `kind`. `hp` overrides the definition (relics, spirits). */
export function createCreature(kind, { id = kind, hp } = {}) {
  const def = creatureDef(kind);
  const maxHp = hp ?? def.hp;
  return { id, kind, hp: maxHp, maxHp };
}
