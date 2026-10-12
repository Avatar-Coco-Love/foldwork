import assert from 'node:assert/strict';
import { test } from './harness.js';
import { dirForKey, isTap, dirToward } from '../src/ui/moveInput.js';

test('movement keys: arrows and WASD (either case)', () => {
  assert.equal(dirForKey('ArrowUp'), 'up');
  assert.equal(dirForKey('a'), 'left');
  assert.equal(dirForKey('D'), 'right');
  assert.equal(dirForKey('s'), 'down');
  assert.equal(dirForKey('f'), null);
  assert.equal(dirForKey(' '), null);
});

test('tap vs drag uses the fold gesture threshold (half a cell)', () => {
  const layout = { cellSize: 40 };
  assert.ok(isTap(layout, { x: 0, y: 0 }, { x: 10, y: 10 }));
  assert.ok(!isTap(layout, { x: 0, y: 0 }, { x: 20, y: 0 }));
});

test('tap direction only for orthogonally adjacent cells', () => {
  const p = { col: 2, row: 2 };
  assert.equal(dirToward(p, { col: 2, row: 1 }), 'up');
  assert.equal(dirToward(p, { col: 3, row: 2 }), 'right');
  assert.equal(dirToward(p, { col: 1, row: 2 }), 'left');
  assert.equal(dirToward(p, { col: 2, row: 3 }), 'down');
  assert.equal(dirToward(p, { col: 3, row: 3 }), null);
  assert.equal(dirToward(p, { col: 2, row: 0 }), null);
  assert.equal(dirToward(p, p), null);
  assert.equal(dirToward(null, p), null);
});
