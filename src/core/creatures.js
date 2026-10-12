// Creature definitions. Data only, like tiles.js: behavior lives in the
// systems that read them (turn.js; enemy AI in enemies.js).
// A creature instance is plain data stored on a layer:
//
//   Creature = { id, kind, hp, maxHp }
//
// It rides its layer, so folds move it for free.
//
// Def fields: kind, name, team ('player' | 'enemy'), hp, and for enemies
// attack (bump damage) and ai (a key of ENEMY_AI in enemies.js).

export const CREATURE_DEFS = Object.freeze({
  player: { kind: 'player', name: 'You', team: 'player', hp: 3 },
  // docs/03: moves 1 tile toward the player each turn; bumps for 1.
  mite: { kind: 'mite', name: 'Scrap Mite', team: 'enemy', hp: 1, attack: 1, ai: 'chase' },
});

export function creatureDef(kind) {
  const def = CREATURE_DEFS[kind];
  if (!def) throw new Error(`Unknown creature kind: ${kind}`);
  return def;
}

/**
 * New creature of `kind`. `maxHp` overrides the definition (relics,
 * spirits) and `hp` starts it below full (HP carried between floors).
 * Passing only `hp` sets both, as before.
 */
export function createCreature(kind, { id = kind, hp, maxHp } = {}) {
  const def = creatureDef(kind);
  const max = maxHp ?? hp ?? def.hp;
  return { id, kind, hp: Math.min(hp ?? max, max), maxHp: max };
}

/** Whether a creature is on the enemy team (unknown kinds are not). */
export function isEnemy(creature) {
  if (!creature) return false;
  const def = CREATURE_DEFS[creature.kind];
  return !!def && def.team === 'enemy';
}
