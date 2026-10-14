import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  computeLayout, cellAtPoint, cellOrigin, HUD_METRICS, sideWidth,
} from '../src/render/layout.js';

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

test('portrait reserve (hint card) moves the board up, never under it', () => {
  // Galaxy S-Ultra in Chrome: 412x780 CSS px with the address bar.
  const free = computeLayout({ viewW: 412, viewH: 780, cols: 7, rows: 7 });
  const card = 150;
  const L = computeLayout({ viewW: 412, viewH: 780, cols: 7, rows: 7, reserve: { bottom: card } });
  assert.ok(L.boardY + L.boardH <= 780 - HUD_METRICS.bottom - card - HUD_METRICS.boardPadding);
  assert.ok(L.boardY < free.boardY, 'board moved up');
  assert.equal(L.cellSize, free.cellSize, 'room to spare: same size');
  // Landscape keeps the card in the side panel: reserve is ignored.
  const land = computeLayout({ viewW: 915, viewH: 340, cols: 7, rows: 7 });
  assert.deepEqual(computeLayout({ viewW: 915, viewH: 340, cols: 7, rows: 7, reserve: { bottom: card } }), land);
});

test('landscape side panel widens into spare width, within its bounds', () => {
  assert.equal(sideWidth(915, 340), HUD_METRICS.sideMax);
  assert.equal(sideWidth(1024, 768), Math.max(HUD_METRICS.side, 1024 - 768));
  assert.equal(sideWidth(800, 700), HUD_METRICS.side);
  for (const [w, h] of [[915, 340], [568, 280], [1366, 1024], [1920, 960]]) {
    const L = computeLayout({ viewW: w, viewH: h, cols: 8, rows: 8 });
    assert.equal(L.side, sideWidth(w, h));
    assert.ok(L.boardX + L.boardW <= w - L.side, `${w}x${h} board clear of panel`);
    const lh = computeLayout({ viewW: w, viewH: h, cols: 8, rows: 8, leftHanded: true });
    assert.ok(lh.boardX >= lh.side, `${w}x${h} left-handed board clear of panel`);
  }
});
