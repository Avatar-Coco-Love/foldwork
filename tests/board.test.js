import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  createBoard, inBounds, getCell, topLayer, stackHeight, cloneBoard, DEFAULT_MAX_STACK,
} from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';

test('creates a board with one floor layer per cell', () => {
  const b = createBoard(5, 6);
  assert.equal(b.w, 5);
  assert.equal(b.h, 6);
  assert.equal(b.cells.length, 30);
  assert.equal(b.maxStack, DEFAULT_MAX_STACK);
  for (const cell of b.cells) {
    assert.equal(cell.layers.length, 1);
    assert.equal(cell.layers[0].tile, TILE.FLOOR);
  }
});

test('fill function receives (col,row), row-major indexing', () => {
  const b = createBoard(3, 2, (c, r) => (c === 2 && r === 1 ? TILE.VOID : TILE.FLOOR));
  assert.equal(topLayer(b, 2, 1).tile, TILE.VOID);
  assert.equal(b.cells[5].layers[0].tile, TILE.VOID);
});

test('bounds and accessors', () => {
  const b = createBoard(5, 5);
  assert.ok(inBounds(b, 0, 0) && inBounds(b, 4, 4));
  assert.ok(!inBounds(b, -1, 0) && !inBounds(b, 5, 0) && !inBounds(b, 0, 5));
  assert.equal(getCell(b, 9, 9), null);
  assert.equal(topLayer(b, 9, 9), null);
  assert.equal(stackHeight(b, 1, 1), 1);
});

test('rejects invalid sizes and tiles', () => {
  assert.throws(() => createBoard(0, 5), RangeError);
  assert.throws(() => createBoard(5, 5, 'lava'));
});

test('clone is deep and serializable', () => {
  const b = createBoard(5, 5);
  b.cells[0].layers[0].creature = { id: 'mite', hp: 1 };
  const c = cloneBoard(b);
  c.cells[0].layers[0].creature.hp = 0;
  c.cells[1].layers.push({ ...c.cells[1].layers[0] });
  assert.equal(b.cells[0].layers[0].creature.hp, 1);
  assert.equal(stackHeight(b, 1, 0), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
});
