import assert from 'node:assert/strict';
import { test } from './harness.js';
import { buildFoldPreview, CELL, creaseSegment } from '../src/render/preview.js';
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

test('creaseSegment spans the board for every axis', () => {
  const b = createBoard(5, 5);
  const close = (seg, want) => {
    for (const k of Object.keys(want)) assert.ok(Math.abs(seg[k] - want[k]) < 1e-9, `${k}: ${seg[k]} vs ${want[k]}`);
  };
  const v = creaseSegment(b, { axis: 'v', index: 2, side: 'before' });
  close({ x: Math.min(v.x0, v.x1), y: Math.min(v.y0, v.y1), X: Math.max(v.x0, v.x1), Y: Math.max(v.y0, v.y1), nx: v.nx },
    { x: 2, y: 0, X: 2, Y: 5, nx: 1 });
  const d = creaseSegment(b, { axis: 'd', index: 4, side: 'before' }); // main diagonal, corner to corner
  close({ len: Math.hypot(d.x1 - d.x0, d.y1 - d.y0), slope: (d.y1 - d.y0) / (d.x1 - d.x0) }, { len: 5 * Math.SQRT2, slope: 1 });
  const a = creaseSegment(b, { axis: 'a', index: 1, side: 'after' }); // through (0,1) and (1,0) centres
  close({ sum: a.x0 + a.y0, sum1: a.x1 + a.y1, len: Math.hypot(a.x1 - a.x0, a.y1 - a.y0) }, { sum: 2, sum1: 2, len: 2 * Math.SQRT2 });
});
