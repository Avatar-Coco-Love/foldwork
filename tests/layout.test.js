import assert from 'node:assert/strict';
import { test } from './harness.js';
import { computeLayout, cellAtPoint, cellOrigin, HUD_METRICS } from '../src/render/layout.js';

const VIEWPORTS = {
  phonePortrait: [390, 844],
  phoneLandscape: [844, 390],
  tabletPortrait: [820, 1180],
  tabletLandscape: [1180, 820],
  desktop: [1440, 900],
  tinyPhone: [320, 568],
};

for (const [name, [viewW, viewH]] of Object.entries(VIEWPORTS)) {
  for (const n of [5, 8]) {
    test(`${name} ${n}x${n}: board fits, is square and centered in free region`, () => {
      const L = computeLayout({ viewW, viewH, cols: n, rows: n });
      assert.equal(L.boardW, L.boardH);
      assert.ok(L.boardX >= 0 && L.boardY >= 0);
      assert.ok(L.boardX + L.boardW <= viewW && L.boardY + L.boardH <= viewH);
      const { region } = L;
      assert.ok(L.boardX >= region.x && L.boardX + L.boardW <= region.x + region.w);
      assert.ok(L.boardY >= region.y && L.boardY + L.boardH <= region.y + region.h);
      assert.ok(L.cellSize >= 30, `cells too small: ${L.cellSize}`);
    });
  }
}

test('portrait reserves top/bottom HUD; landscape reserves side panel', () => {
  const p = computeLayout({ viewW: 390, viewH: 844, cols: 5, rows: 5 });
  assert.equal(p.landscape, false);
  assert.ok(p.boardY >= HUD_METRICS.top);
  const l = computeLayout({ viewW: 844, viewH: 390, cols: 5, rows: 5 });
  assert.equal(l.landscape, true);
  assert.ok(l.boardX + l.boardW <= 844 - HUD_METRICS.side);
  const lh = computeLayout({ viewW: 844, viewH: 390, cols: 5, rows: 5, leftHanded: true });
  assert.ok(lh.boardX >= HUD_METRICS.side);
});

test('safe-area insets shrink the free region', () => {
  const insets = { top: 47, right: 0, bottom: 34, left: 0 };
  const L = computeLayout({ viewW: 390, viewH: 844, cols: 5, rows: 5, insets });
  assert.ok(L.boardY >= 47 + HUD_METRICS.top);
  assert.ok(L.boardY + L.boardH <= 844 - 34 - HUD_METRICS.bottom);
});

test('cellAtPoint round-trips with cellOrigin', () => {
  const L = computeLayout({ viewW: 800, viewH: 600, cols: 6, rows: 6 });
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const o = cellOrigin(L, col, row);
      assert.deepEqual(cellAtPoint(L, o.x + L.cellSize / 2, o.y + L.cellSize / 2), { col, row });
    }
  }
  assert.equal(cellAtPoint(L, L.boardX - 1, L.boardY), null);
  assert.equal(cellAtPoint(L, L.boardX + L.boardW, L.boardY), null);
});
