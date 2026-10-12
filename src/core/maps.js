// Hand-written floor layouts. A map is a list of rows, one character per
// cell (whitespace is ignored, so rows can be spaced out for reading). Each
// character is looked up in MAP_LEGEND. Pure; no DOM.
//
//   .  floor        #  wall         o  void
//   L  lock         k  key on floor E  exit
//   1-3 plate (link 1-3)            a-c gate (link 1-3, a opens with 1)
//   @  player start (on floor)      m  Scrap Mite (on floor)
//   W  Paper Wasp (on floor)        B  Card Brute (on floor)
//   C  Creaseling (on floor)    J  Lockjaw (on floor)
//   S  Spore Bloom (on floor)
//   ?  enemy anchor (on floor): a spot a floor template may place an enemy
//
// parseMap(rows, { under }) → { board, player, enemies, anchors }, ready
// for createFloorState (anchors is extra data for core/floors.js).
// `rows` is the top layer, the one you see. `under` lists extra layer
// grids (same size), bottom first, laid beneath it: `_` adds nothing to
// that cell, any other symbol adds a layer, so a map can start with
// stacked paper. A 3-high stack can't take a landing or move onto a
// non-empty cell, which anchors a piece of the puzzle in place.

import { createBoard, createLayer, getCell } from './board.js';
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
  W: { tile: TILE.FLOOR, enemy: 'wasp' },
  B: { tile: TILE.FLOOR, enemy: 'brute' },
  C: { tile: TILE.FLOOR, enemy: 'creaseling' },
  J: { tile: TILE.FLOOR, enemy: 'lockjaw' },
  S: { tile: TILE.FLOOR, enemy: 'bloom' },
  '?': { tile: TILE.FLOOR, anchor: true },
  ...Object.fromEntries(Object.entries(PLATES).map(([ch, link]) => [ch, { tile: TILE.PLATE, link }])),
  ...Object.fromEntries(Object.entries(GATES).map(([ch, link]) => [ch, { tile: TILE.GATE, link }])),
});

export function parseMap(rows, { under = [], legend = MAP_LEGEND } = {}) {
  const grid = toGrid(rows);
  const h = grid.length;
  const w = h ? grid[0].length : 0;
  if (!h || grid.some((r) => r.length !== w)) throw new Error('Map rows must be non-empty and equal length');
  const lookup = (ch, col, row) => {
    const entry = legend[ch];
    if (!entry) throw new Error(`Unknown map symbol "${ch}" at ${col},${row}`);
    return entry;
  };
  const lower = under.map(toGrid);
  if (lower.some((g) => g.length !== h || g.some((r) => r.length !== w))) {
    throw new Error('Under grids must match the map size');
  }
  const board = createBoard(w, h);
  let player = null;
  const enemies = [];
  const anchors = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const below = lower.map((g) => g[row][col]).filter((ch) => ch !== '_');
      const top = lookup(grid[row][col], col, row);
      getCell(board, col, row).layers = [...below, grid[row][col]].map((ch) => {
        const entry = lookup(ch, col, row);
        const layer = createLayer(entry.tile);
        if (entry.item) layer.item = entry.item;
        if (entry.link != null) layer.link = entry.link;
        return layer;
      });
      if (top.player) player = { col, row };
      if (top.enemy) enemies.push({ kind: top.enemy, col, row });
      if (top.anchor) anchors.push({ col, row });
    }
  }
  return { board, player, enemies, anchors };
}

/** Rows as arrays of symbols (whitespace dropped). */
export function toGrid(rows) {
  return rows.map((r) => Array.from(r.replace(/\s+/g, '')));
}

/**
 * Map transforms for seeded variation (core/floors.js). Each maps a symbol
 * grid to a new one. Only mirrors and rotations, so the puzzle keeps its
 * shape; the solver re-checks every variant anyway (enemy tie-breaks are
 * not symmetric).
 */
export const MAP_TRANSFORMS = Object.freeze({
  id: (g) => g.map((r) => r.slice()),
  flipH: (g) => g.map((r) => r.slice().reverse()),
  flipV: (g) => g.slice().reverse().map((r) => r.slice()),
  rot180: (g) => g.slice().reverse().map((r) => r.slice().reverse()),
});

/** Apply a MAP_TRANSFORMS entry to map rows; returns rows (strings). */
export function transformRows(rows, transform) {
  const fn = MAP_TRANSFORMS[transform];
  if (!fn) throw new Error(`Unknown map transform: ${transform}`);
  return fn(toGrid(rows)).map((r) => r.join(' '));
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
