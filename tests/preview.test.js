import assert from 'node:assert/strict';
import { test } from './harness.js';
import { buildFoldPreview, CELL } from '../src/render/preview.js';
import { createBoard, createLayer, getCell, cellIndex } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';

test('preview marks leaving, landing and clipped cells with sources', () => {
  const b = createBoard(5, 5);
  const pv = buildFoldPreview(b, { axis: 'v', index: 2, side: 'after' });
  assert.equal(pv.ok, true);
  const i = (c, r) => cellIndex(b, c, r);
  assert.equal(pv.state[i(2, 0)], CELL.LEAVING);
  assert.equal(pv.state[i(4, 0)], CELL.CLIPPED);
  assert.equal(pv.state[i(1, 0)], CELL.LANDING);
  assert.equal(pv.source[i(1, 0)], i(2, 0));
  assert.equal(pv.source[i(4, 0)], -1);
  assert.equal(pv.heights[i(0, 3)], 2);
});

test('preview flags overflow cells and is null for malformed creases', () => {
  const b = createBoard(5, 5);
  getCell(b, 1, 1).layers.push(createLayer(TILE.WALL), createLayer());
  const pv = buildFoldPreview(b, { axis: 'v', index: 1, side: 'before' });
  assert.equal(pv.ok, false);
  assert.equal(pv.state[cellIndex(b, 1, 1)], CELL.OVERFLOW);
  assert.equal(pv.heights[cellIndex(b, 1, 1)], 4);
  assert.equal(buildFoldPreview(b, { axis: 'v', index: 0, side: 'before' }), null);
});

test('empty source cells do not mark a landing', () => {
  const b = createBoard(5, 5);
  getCell(b, 0, 0).layers = [];
  const pv = buildFoldPreview(b, { axis: 'v', index: 1, side: 'before' });
  assert.equal(pv.state[cellIndex(b, 1, 0)], CELL.NONE);
  assert.equal(pv.state[cellIndex(b, 0, 0)], CELL.LEAVING);
});
