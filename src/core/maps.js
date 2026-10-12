// Hand-written floor layouts. A map is a list of rows, one character per
// cell (whitespace is ignored, so rows can be spaced out for reading). Each
// character is looked up in MAP_LEGEND. Pure; no DOM.
//
//   .  floor        #  wall         o  void
//   L  lock         k  key on floor E  exit
//   1-3 plate (link 1-3)            a-c gate (link 1-3, a opens with 1)
//   @  player start (on floor)      m  Scrap Mite (on floor)
//
// parseMap(rows) → { board, player, enemies }, ready for createFloorState.
// Templates in Phase 3b extend the legend (or add stacked layers) instead
// of growing this parser.

import { createBoard, getCell } from './board.js';
import { TILE, ITEM } from './tiles.js';

const PLATES = { 1: 1, 2: 2, 3: 3 };
const GATES = { a: 1, b: 2, c: 3 };

export const MAP_LEGEND = Object.freeze({
  '.': { tile: TILE.FLOOR },
  '#': { tile: TILE.WALL },
  o: { tile: TILE.VOID },
  L: { tile: TILE.LOCK },
  E: { tile: TILE.EXIT },
  k: { tile: TILE.FLOOR, item: ITEM.KEY },
  '@': { tile: TILE.FLOOR, player: true },
  m: { tile: TILE.FLOOR, enemy: 'mite' },
  ...Object.fromEntries(Object.entries(PLATES).map(([ch, link]) => [ch, { tile: TILE.PLATE, link }])),
  ...Object.fromEntries(Object.entries(GATES).map(([ch, link]) => [ch, { tile: TILE.GATE, link }])),
});

export function parseMap(rows, legend = MAP_LEGEND) {
  const grid = rows.map((r) => r.replace(/\s+/g, ''));
  const h = grid.length;
  const w = h ? grid[0].length : 0;
  if (!h || grid.some((r) => r.length !== w)) throw new Error('Map rows must be non-empty and equal length');
  const board = createBoard(w, h, (col, row) => {
    const entry = legend[grid[row][col]];
    if (!entry) throw new Error(`Unknown map symbol "${grid[row][col]}" at ${col},${row}`);
    return entry.tile;
  });
  let player = null;
  const enemies = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const entry = legend[grid[row][col]];
      const layer = getCell(board, col, row).layers[0];
      if (entry.item) layer.item = entry.item;
      if (entry.link != null) layer.link = entry.link;
      if (entry.player) player = { col, row };
      if (entry.enemy) enemies.push({ kind: entry.enemy, col, row });
    }
  }
  return { board, player, enemies };
}

/**
 * Hand-made dev floors until the Phase 3b templates (`?map=` picks one).
 * Each is { rows, charges }.
 */
export const DEV_MAPS = Object.freeze({
  // The exit sits behind a lock and a plate-powered gate: fetch the key,
  // hold the plate, or fold your way in.
  sandbox: {
    charges: 3,
    rows: [
      'E . # . . k',
      '. . a . # .',
      '# L # . # .',
      'o . . . 1 .',
      '. m . . . .',
      '. . @ . . .',
    ],
  },
  // Walk the key in, or fold row 3 up: the key lands on the lock and the
  // player rides through.
  courier: {
    charges: 1,
    rows: [
      '. . E . .',
      '. . . . .',
      '# # L # #',
      '. . k . .',
      '. . @ . .',
    ],
  },
});
