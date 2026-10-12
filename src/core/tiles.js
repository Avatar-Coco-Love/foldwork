// Tile type definitions. Data only: behavior lives in the systems that read
// these flags (movement, folding, environment). New tile types are added here.

export const TILE = Object.freeze({
  FLOOR: 'floor',
  WALL: 'wall',
  VOID: 'void',
});

export const TILE_DEFS = Object.freeze({
  [TILE.FLOOR]: { id: TILE.FLOOR, name: 'Floor', walkable: true, hole: false },
  [TILE.WALL]: { id: TILE.WALL, name: 'Wall', walkable: false, hole: false },
  [TILE.VOID]: { id: TILE.VOID, name: 'Void', walkable: true, hole: true },
});

export function tileDef(id) {
  const def = TILE_DEFS[id];
  if (!def) throw new Error(`Unknown tile type: ${id}`);
  return def;
}
