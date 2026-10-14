// Board: a grid of cells, each holding a stack of layers (bottom → top).
// All state is plain serializable data so it can be saved, cloned for fold
// previews, and searched by the solver. No DOM access in this module.
//
//   Board = { w, h, maxStack, cells: Cell[] }   (cells indexed row-major)
//   Cell  = { layers: Layer[] }                 (layers[length-1] is the top)
//   Layer = { tile, creature, item, flags, hinge? }
//     hinge: the crease that last moved it (core/fold.js hingeKey)

import { TILE, tileDef } from './tiles.js';

export const DEFAULT_MAX_STACK = 3;
export const MIN_BOARD_SIZE = 5;
export const MAX_BOARD_SIZE = 8;

export function createLayer(tile = TILE.FLOOR, extra = {}) {
  tileDef(tile); // validate
  return { tile, creature: null, item: null, flags: 0, ...extra };
}

/**
 * Create a board. `fill` is a tile id, or a function (col, row) => tile id
 * for building test layouts.
 */
export function createBoard(w, h, fill = TILE.FLOOR, { maxStack = DEFAULT_MAX_STACK } = {}) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    throw new RangeError(`Invalid board size ${w}x${h}`);
  }
  const cells = new Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const tile = typeof fill === 'function' ? fill(col, row) : fill;
      cells[row * w + col] = { layers: [createLayer(tile)] };
    }
  }
  return { w, h, maxStack, cells };
}

/** Orthogonal steps, in the fixed order used wherever a tie needs breaking. */
export const DIRS = Object.freeze({
  up: Object.freeze({ dc: 0, dr: -1 }),
  down: Object.freeze({ dc: 0, dr: 1 }),
  left: Object.freeze({ dc: -1, dr: 0 }),
  right: Object.freeze({ dc: 1, dr: 0 }),
});

/** A layer a creature can stand on: walkable and not a hole. */
export function isFooting(layer) {
  if (!layer) return false;
  const def = tileDef(layer.tile);
  return def.walkable && !def.hole;
}

export function inBounds(board, col, row) {
  return col >= 0 && row >= 0 && col < board.w && row < board.h;
}

export function cellIndex(board, col, row) {
  return row * board.w + col;
}

export function getCell(board, col, row) {
  return inBounds(board, col, row) ? board.cells[cellIndex(board, col, row)] : null;
}

/** The active (top) layer of a cell, or null if out of bounds or empty. */
export function topLayer(board, col, row) {
  const cell = getCell(board, col, row);
  return cell && cell.layers.length ? cell.layers[cell.layers.length - 1] : null;
}

export function stackHeight(board, col, row) {
  const cell = getCell(board, col, row);
  return cell ? cell.layers.length : 0;
}

/**
 * Deep copy. A hand-written copy instead of structuredClone, which is ~20x
 * slower on these tiny objects and dominated solver time. It relies on the
 * data model: layer fields are primitives except `creature`, whose fields
 * are primitives too. Keep it that way (or extend this copy) when adding
 * fields.
 */
export function cloneBoard(board) {
  const cells = new Array(board.cells.length);
  for (let i = 0; i < cells.length; i++) {
    const src = board.cells[i].layers;
    const layers = new Array(src.length);
    for (let d = 0; d < src.length; d++) {
      const l = src[d];
      layers[d] = l.creature ? { ...l, creature: { ...l.creature } } : { ...l };
    }
    cells[i] = { layers };
  }
  return { ...board, cells };
}

/**
 * Locate a creature by id. Returns { col, row, depth, top, creature } where
 * depth is its layer index and top says it is on the active (top) layer, or
 * null if it is not on the board. Boards are tiny, so a scan is fine.
 */
export function findCreature(board, id) {
  for (let i = 0; i < board.cells.length; i++) {
    const layers = board.cells[i].layers;
    for (let depth = 0; depth < layers.length; depth++) {
      const creature = layers[depth].creature;
      if (creature && creature.id === id) {
        const col = i % board.w;
        return { col, row: (i - col) / board.w, depth, top: depth === layers.length - 1, creature };
      }
    }
  }
  return null;
}
