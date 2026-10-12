import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createBoard, createLayer, getCell, topLayer, stackHeight, cellIndex } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import {
  mirrorCell, foldMapping, validateFold, applyFold, createUndoSnapshot, unfold, foldWithUndo,
  creaseErrors, AXES, isDiagonal, axesFor,
} from '../src/core/fold.js';

// Board whose every base layer carries an item tagged with its origin cell.
function tagged(w, h, opts) {
  const b = createBoard(w, h, TILE.FLOOR, opts);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) getCell(b, col, row).layers[0].item = { id: `${col},${row}` };
  }
  return b;
}

const ids = (b, col, row) => getCell(b, col, row).layers.map((l) => l.item && l.item.id);

test('mirror v crease, before side (odd width, off-centre line)', () => {
  const b = createBoard(5, 5);
  const f = { axis: 'v', index: 2, side: 'before' };
  assert.deepEqual(mirrorCell(b, f, 0, 3), { col: 3, row: 3, clipped: false });
  assert.deepEqual(mirrorCell(b, f, 1, 0), { col: 2, row: 0, clipped: false });
  assert.equal(mirrorCell(b, f, 2, 0), null); // stationary side
  assert.equal(foldMapping(b, f).length, 10);
});

test('mirror v crease, after side clips cells past the far edge', () => {
  const b = createBoard(5, 5);
  const f = { axis: 'v', index: 2, side: 'after' };
  assert.deepEqual(mirrorCell(b, f, 2, 1), { col: 1, row: 1, clipped: false });
  assert.deepEqual(mirrorCell(b, f, 3, 1), { col: 0, row: 1, clipped: false });
  assert.deepEqual(mirrorCell(b, f, 4, 1), { col: -1, row: 1, clipped: true });
  assert.equal(mirrorCell(b, f, 1, 1), null);
});

test('mirror h crease, both sides', () => {
  const b = createBoard(5, 5);
  const top = { axis: 'h', index: 1, side: 'before' };
  assert.deepEqual(mirrorCell(b, top, 4, 0), { col: 4, row: 1, clipped: false });
  assert.equal(foldMapping(b, top).length, 5);
  const bottom = { axis: 'h', index: 1, side: 'after' };
  assert.deepEqual(mirrorCell(b, bottom, 2, 1), { col: 2, row: 0, clipped: false });
  assert.deepEqual(mirrorCell(b, bottom, 2, 2), { col: 2, row: -1, clipped: true });
  assert.equal(foldMapping(b, bottom).filter((m) => m.clipped).length, 15);
});

test('even width, centre crease: exact mirror, nothing clipped', () => {
  const b = createBoard(6, 6);
  for (const side of ['before', 'after']) {
    for (const axis of ['v', 'h']) {
      const moves = foldMapping(b, { axis, index: 3, side });
      assert.equal(moves.length, 18);
      assert.ok(moves.every((m) => !m.clipped));
    }
  }
  assert.deepEqual(mirrorCell(b, { axis: 'v', index: 3, side: 'before' }, 0, 2), { col: 5, row: 2, clipped: false });
  assert.deepEqual(mirrorCell(b, { axis: 'h', index: 3, side: 'after' }, 1, 5), { col: 1, row: 0, clipped: false });
});

test('malformed creases are reported, not thrown', () => {
  const b = createBoard(5, 5);
  assert.deepEqual(creaseErrors(b, { axis: 'v', index: 2, side: 'after' }), []);
  for (const f of [
    { axis: 'v', index: 0, side: 'before' },
    { axis: 'h', index: 5, side: 'before' },
    { axis: 'v', index: 1.5, side: 'before' },
    { axis: 'x', index: 1, side: 'before' },
    { axis: 'v', index: 1, side: 'left' },
    null,
  ]) {
    const r = validateFold(b, f);
    assert.equal(r.ok, false);
    assert.ok(r.reasons.length > 0);
    assert.equal(r.perCellHeights, null);
  }
  assert.throws(() => applyFold(b, { axis: 'v', index: 9, side: 'before' }), /bad-index/);
});

test('applyFold stacks the folding half onto its mirror and empties sources', () => {
  const b = tagged(5, 5);
  const n = applyFold(b, { axis: 'v', index: 2, side: 'before' });
  assert.deepEqual(ids(n, 3, 0), ['3,0', '0,0']);
  assert.deepEqual(ids(n, 2, 4), ['2,4', '1,4']);
  assert.deepEqual(ids(n, 0, 0), []);
  assert.deepEqual(ids(n, 4, 0), ['4,0']); // untouched
});

test('clipped cells stay on their source cell, unfolded', () => {
  const b = tagged(5, 5);
  const n = applyFold(b, { axis: 'v', index: 2, side: 'after' });
  assert.deepEqual(ids(n, 4, 2), ['4,2']); // mirror would be col -1
  assert.deepEqual(ids(n, 0, 2), ['0,2', '3,2']);
  assert.deepEqual(ids(n, 1, 2), ['1,2', '2,2']);
  assert.deepEqual(ids(n, 2, 2), []);
  assert.deepEqual(ids(n, 3, 2), []);
});

test('stack limit: over-max cells are rejected with per-cell reasons', () => {
  const b = tagged(5, 5, { maxStack: 2 });
  getCell(b, 1, 0).layers.push(createLayer(TILE.WALL));
  const f = { axis: 'v', index: 1, side: 'before' };
  const r = validateFold(b, f);
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasons, [{ code: 'stack-overflow', col: 1, row: 0, height: 3, max: 2 }]);
  assert.equal(r.perCellHeights[cellIndex(b, 1, 0)], 3);
  assert.equal(r.perCellHeights[cellIndex(b, 1, 1)], 2);
  assert.equal(r.perCellHeights[cellIndex(b, 0, 0)], 0);
  assert.throws(() => applyFold(b, f), /stack-overflow/);
});

test('default max stack is 3: third fold onto the same column is rejected', () => {
  const b = tagged(6, 5);
  delete b.maxStack;
  let n = applyFold(b, { axis: 'v', index: 1, side: 'before' }); // col1 height 2
  n = applyFold(n, { axis: 'v', index: 2, side: 'after' }); // cols 2,3 → 1,0
  assert.equal(stackHeight(n, 1, 0), 3);
  assert.equal(validateFold(n, { axis: 'v', index: 2, side: 'after' }).ok, true); // cols 2,3 now empty
  const r = validateFold(n, { axis: 'v', index: 1, side: 'after' });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.every((x) => x.code === 'stack-overflow' && x.col === 0 && x.max === 3));
});

test('layers keep internal order; creatures and items ride with their layer', () => {
  const b = tagged(5, 5);
  const mite = { id: 'mite', hp: 1 };
  getCell(b, 0, 2).layers.push(createLayer(TILE.FLOOR, { creature: mite, item: { id: 'key' } }));
  const n = applyFold(b, { axis: 'v', index: 1, side: 'before' });
  assert.deepEqual(ids(n, 1, 2), ['1,2', '0,2', 'key']); // dest base, src bottom, src top
  assert.deepEqual(topLayer(n, 1, 2).creature, mite);
  assert.notEqual(topLayer(n, 1, 2).creature, mite); // copied, not shared
  assert.equal(stackHeight(n, 0, 2), 0);
});

test('applyFold never mutates its input', () => {
  const b = tagged(5, 5);
  getCell(b, 4, 3).layers[0].creature = { id: 'mite', hp: 1 };
  const before = JSON.stringify(b);
  validateFold(b, { axis: 'h', index: 2, side: 'after' });
  const n = applyFold(b, { axis: 'h', index: 2, side: 'after' });
  assert.equal(JSON.stringify(b), before);
  topLayer(n, 4, 0).creature.hp = 0; // row 3 mirrors onto row 0
  assert.equal(getCell(b, 4, 3).layers[0].creature.hp, 1);
});

test('apply + undo round trip restores the exact prior board', () => {
  const b = tagged(6, 6);
  getCell(b, 2, 3).layers[0].creature = { id: 'mite', hp: 1 };
  const original = structuredClone(b);
  const f = { axis: 'h', index: 4, side: 'after' };
  const { board: folded, undo } = foldWithUndo(b, f);
  assert.notDeepEqual(folded, original);
  assert.deepEqual(unfold(undo), original);
  assert.deepEqual(undo.fold, f);
  // Snapshot survives a save/load round trip and later mutation of the board.
  const snap = createUndoSnapshot(b, f);
  b.cells[0].layers = [];
  assert.deepEqual(unfold(JSON.parse(JSON.stringify(snap))), original);
});

test('folded board is JSON-serializable', () => {
  const b = tagged(5, 5);
  getCell(b, 0, 0).layers[0].creature = { id: 'mite', hp: 1 };
  const n = applyFold(b, { axis: 'v', index: 2, side: 'before' });
  assert.deepEqual(JSON.parse(JSON.stringify(n)), n);
});

test('resolve hook receives the new board and landings', () => {
  const b = tagged(5, 5);
  let seen = null;
  const n = applyFold(b, { axis: 'h', index: 1, side: 'before' }, {
    resolve: (board, landings) => { seen = landings; board.resolved = true; return board; },
  });
  assert.equal(n.resolved, true);
  assert.equal(b.resolved, undefined);
  assert.equal(seen.length, 5);
  assert.deepEqual(seen[0], { from: { col: 0, row: 0 }, to: { col: 0, row: 1 }, baseHeight: 1, count: 1 });
});

test('diagonal "d" crease (col - row = k) mirrors across the line; the line is the hinge', () => {
  const b = createBoard(5, 5);
  assert.equal(AXES.d.lineCount(b), 7);
  const main = { axis: 'd', index: 4, side: 'before' }; // k = 0
  assert.deepEqual(mirrorCell(b, main, 0, 1), { col: 1, row: 0, clipped: false });
  assert.deepEqual(mirrorCell(b, main, 1, 4), { col: 4, row: 1, clipped: false });
  assert.equal(mirrorCell(b, main, 2, 2), null); // hinge
  assert.equal(mirrorCell(b, main, 3, 1), null); // stationary side
  assert.equal(foldMapping(b, main).length, 10);
  const off = { axis: 'd', index: 5, side: 'after' }; // k = 1
  assert.deepEqual(mirrorCell(b, off, 4, 0), { col: 1, row: 3, clipped: false });
  assert.deepEqual(mirrorCell(b, off, 2, 0), { col: 1, row: 1, clipped: false });
  assert.equal(mirrorCell(b, off, 3, 2), null); // hinge
  const clip = { axis: 'd', index: 6, side: 'before' }; // k = 2
  assert.deepEqual(mirrorCell(b, clip, 0, 4), { col: 6, row: -2, clipped: true });
});

test('diagonal "a" crease (col + row = k) mirrors across the line', () => {
  const b = createBoard(5, 5);
  const anti = { axis: 'a', index: 4, side: 'before' };
  assert.deepEqual(mirrorCell(b, anti, 0, 0), { col: 4, row: 4, clipped: false });
  assert.deepEqual(mirrorCell(b, anti, 1, 2), { col: 2, row: 3, clipped: false });
  assert.equal(mirrorCell(b, anti, 0, 4), null); // hinge
  assert.equal(mirrorCell(b, anti, 4, 4), null); // stationary side
  const corner = { axis: 'a', index: 1, side: 'after' };
  assert.deepEqual(mirrorCell(b, corner, 4, 4), { col: -3, row: -3, clipped: true });
  assert.deepEqual(mirrorCell(b, corner, 1, 1), { col: 0, row: 0, clipped: false });
  assert.equal(creaseErrors(b, { axis: 'a', index: 8, side: 'after' })[0].code, 'bad-index');
  assert.equal(creaseErrors(b, { axis: 'd', index: 0, side: 'after' })[0].code, 'bad-index');
});

test('applyFold on a diagonal leaves hinge stacks in place', () => {
  const b = tagged(4, 4);
  const n = applyFold(b, { axis: 'd', index: 3, side: 'before' }); // main diagonal
  for (let i = 0; i < 4; i++) assert.deepEqual(ids(n, i, i), [`${i},${i}`]);
  assert.deepEqual(ids(n, 1, 0), ['1,0', '0,1']);
  assert.deepEqual(ids(n, 0, 3), []);
  const heights = validateFold(b, { axis: 'a', index: 3, side: 'after' }).perCellHeights;
  assert.equal(heights.reduce((s, h) => s + h, 0), 16);
  assert.equal(heights[cellIndex(b, 3, 0)], 1); // hinge
});

test('diagonal axes are flagged and filtered', () => {
  assert.equal(isDiagonal({ axis: 'd', index: 1, side: 'before' }), true);
  assert.equal(isDiagonal({ axis: 'v', index: 1, side: 'before' }), false);
  assert.deepEqual(axesFor(), ['v', 'h']);
  assert.deepEqual(axesFor({ diagonal: true }), ['v', 'h', 'd', 'a']);
});
