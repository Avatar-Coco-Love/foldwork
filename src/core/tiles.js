// Tile type definitions. Data only: behavior lives in the systems that read
// these flags (movement, folding, environment). New tile types are added here.
//
// Def fields:
//   walkable   creatures can stand on it
//   hole       standing on it is a fall (void)
//   unlocksTo  a lock: a key turns it into this tile (core/environment.js)
//   plate      pressed while a creature stands on it (top layer only)
//   powered    a closed gate: becomes this tile while its link is pressed
//   unpowered  an open gate: becomes this tile when its link is released
//   exit       reaching it wins the floor
//
// Plates and gates carry a `link` on their layer (a small integer, default
// 0): a gate is open while any plate with the same link is pressed.

export const TILE = Object.freeze({
  FLOOR: 'floor',
  WALL: 'wall',
  VOID: 'void',
  LOCK: 'lock',
  DOOR: 'door', // an unlocked lock
  PLATE: 'plate',
  GATE: 'gate',
  GATE_OPEN: 'gate-open',
  EXIT: 'exit',
});

export const TILE_DEFS = Object.freeze({
  [TILE.FLOOR]: { id: TILE.FLOOR, name: 'Floor', walkable: true, hole: false },
  [TILE.WALL]: { id: TILE.WALL, name: 'Wall', walkable: false, hole: false },
  [TILE.VOID]: { id: TILE.VOID, name: 'Void', walkable: true, hole: true },
  [TILE.LOCK]: { id: TILE.LOCK, name: 'Lock', walkable: false, hole: false, unlocksTo: TILE.DOOR },
  [TILE.DOOR]: { id: TILE.DOOR, name: 'Open door', walkable: true, hole: false },
  [TILE.PLATE]: { id: TILE.PLATE, name: 'Pressure plate', walkable: true, hole: false, plate: true },
  [TILE.GATE]: { id: TILE.GATE, name: 'Gate', walkable: false, hole: false, powered: TILE.GATE_OPEN },
  [TILE.GATE_OPEN]: { id: TILE.GATE_OPEN, name: 'Open gate', walkable: true, hole: false, unpowered: TILE.GATE },
  [TILE.EXIT]: { id: TILE.EXIT, name: 'Exit', walkable: true, hole: false, exit: true },
});

export function tileDef(id) {
  const def = TILE_DEFS[id];
  if (!def) throw new Error(`Unknown tile type: ${id}`);
  return def;
}

// Items lie on a layer (`layer.item`) and ride it through folds like
// creatures do. Keys are items rather than tiles so anything can drop one
// (Lockjaw, docs/03) without replacing the tile underneath.
//
// Def fields:
//   pickup   the player collects it by stepping on it (counted in
//            FloorState.keys for keys)
//   opens    meeting a lock via a fold opens it (core/environment.js)

export const ITEM = Object.freeze({
  KEY: 'key',
});

export const ITEM_DEFS = Object.freeze({
  [ITEM.KEY]: { id: ITEM.KEY, name: 'Key', pickup: true, opens: true },
});

export function itemDef(id) {
  const def = ITEM_DEFS[id];
  if (!def) throw new Error(`Unknown item: ${id}`);
  return def;
}
