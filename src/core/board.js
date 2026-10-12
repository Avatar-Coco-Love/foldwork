// Board: a grid of cells, each holding a stack of layers (bottom → top).
// All state is plain serializable data so it can be saved, cloned for fold
// previews, and searched by the solver. No DOM access in this module.
//
//   Board = { w, h, maxStack, cells: Cell[] }   (cells indexed row-major)
//   Cell  = { layers: Layer[] }                 (layers[length-1] is the top)
//   Layer = { tile, creature, item, flags }

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

/** Deep copy. Boards hold only plain data, so structuredClone is exact. */
export function cloneBoard(board) {
  return structuredClone(board);
}
