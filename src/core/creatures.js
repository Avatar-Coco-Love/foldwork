// Creature definitions. Data only, like tiles.js: behavior lives in the
// systems that read them (turn.js; enemy AI in enemies.js).
// A creature instance is plain data stored on a layer:
//
//   Creature = { id, kind, hp, maxHp }
//
// It rides its layer, so folds move it for free.
//
// Def fields: kind, name, team ('player' | 'enemy'), hp, and for enemies
// attack (damage per hit), ai (a key of ENEMY_AI in enemies.js), and
// optionally:
//   pace   acts once every `pace` turns (default 1). Instances count down
//          in `rest` (turns left to sit out; it starts at pace - 1, so a
//          slow enemy sits out its first turn). The counter ticks every
//          enemy phase, stranded or not.
//   heavy  can't be pinned: no fold may land on it, unless the landing
//          sheet's top is a hole, which drops it (core/fold.js validateFold)
//   range  how far a ranged attacker sees along its row and column
//   fixed  never moves on its own, so a fold can't strand it (it still
//          rides its layer)
//   slide  after the player folds, slides up to this many tiles along the
//          crease toward the player instead of stepping (ai 'creep')

export const CREATURE_DEFS = Object.freeze({
  player: { kind: 'player', name: 'You', team: 'player', hp: 3 },
  // docs/03: moves 1 tile toward the player each turn; bumps for 1.
  mite: { kind: 'mite', name: 'Scrap Mite', team: 'enemy', hp: 1, attack: 1, ai: 'chase' },
  // Stationary; stings the player in a clear line (row or column) within 4.
  wasp: { kind: 'wasp', name: 'Paper Wasp', team: 'enemy', hp: 1, attack: 1, ai: 'sting', range: 4, fixed: true },
  // Moves every other turn toward the player; hits for 1. Too heavy to pin.
  brute: { kind: 'brute', name: 'Card Brute', team: 'enemy', hp: 3, attack: 1, ai: 'chase', pace: 2, heavy: true },
  // After a fold, slides up to 3 tiles along the crease toward the player;
  // otherwise moves like a Mite.
  creaseling: { kind: 'creaseling', name: 'Creaseling', team: 'enemy', hp: 2, attack: 1, ai: 'creep', slide: 3 },
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
  const creature = { id, kind, hp: Math.min(hp ?? max, max), maxHp: max };
  if (def.pace > 1) creature.rest = def.pace - 1;
  return creature;
}

/** Whether a creature can't be pinned (CREATURE_DEFS `heavy`). */
export function isHeavy(creature) {
  if (!creature) return false;
  const def = CREATURE_DEFS[creature.kind];
  return !!def && !!def.heavy;
}

/** Whether a creature is on the enemy team (unknown kinds are not). */
export function isEnemy(creature) {
  if (!creature) return false;
  const def = CREATURE_DEFS[creature.kind];
  return !!def && def.team === 'enemy';
}
