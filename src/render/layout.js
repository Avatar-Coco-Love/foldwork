// Pure layout math: where the board and HUD go for a given viewport.
// No DOM access, so it is unit tested. The DOM HUD reads the same metrics
// (applied as CSS variables by main.js) so canvas and HUD always agree.

/** HUD band sizes in CSS pixels. 44px touch targets plus padding. */
export const HUD_METRICS = Object.freeze({
  top: 56, // portrait: status bar (HP, charges, floor)
  bottom: 76, // portrait: action bar (undo, wait, menu)
  side: 168, // landscape: side panel holding both (narrowest)
  sideMax: 300, // landscape: the panel widens into spare width up to this
  boardPadding: 12, // breathing room around the board
});

/**
 * Landscape side panel width: the minimum, widened into whatever width the
 * square-ish board can't use (phone landscape has plenty), so the hint card
 * and relic tray get room to read.
 */
export function sideWidth(viewW, viewH, insets) {
  const inset = insets || { top: 0, right: 0, bottom: 0, left: 0 };
  const w = viewW - inset.left - inset.right;
  const h = viewH - inset.top - inset.bottom;
  return Math.round(Math.min(HUD_METRICS.sideMax, Math.max(HUD_METRICS.side, w - h)));
}

/** Matches CSS `(orientation: landscape)`: strictly wider than tall. */
export function isLandscape(viewW, viewH) {
  return viewW > viewH;
}

/**
 * Compute the board rectangle in CSS pixels.
 * @param {object} p
 * @param {number} p.viewW, p.viewH   viewport size
 * @param {number} p.cols, p.rows     board size in cells
 * @param {{top,right,bottom,left}} [p.insets] safe-area insets
 * @param {boolean} [p.leftHanded]    landscape HUD on the left instead of right
 * @param {{top?,bottom?}} [p.reserve] portrait: extra room the HUD takes
 *   beyond its bars (the hint card above the action bar), so the board
 *   moves aside instead of being covered
 */
export function computeLayout({ viewW, viewH, cols, rows, insets, leftHanded = false, reserve }) {
  const inset = insets || { top: 0, right: 0, bottom: 0, left: 0 };
  const landscape = isLandscape(viewW, viewH);
  const pad = HUD_METRICS.boardPadding;

  // Free region for the board after insets and HUD bands.
  let x = inset.left;
  let y = inset.top;
  let w = viewW - inset.left - inset.right;
  let h = viewH - inset.top - inset.bottom;
  const side = landscape ? sideWidth(viewW, viewH, inset) : 0;
  if (landscape) {
    w -= side;
    if (leftHanded) x += side;
  } else {
    const top = HUD_METRICS.top + Math.max(0, (reserve && reserve.top) || 0);
    const bottom = HUD_METRICS.bottom + Math.max(0, (reserve && reserve.bottom) || 0);
    y += top;
    h -= top + bottom;
  }

  const availW = Math.max(0, w - pad * 2);
  const availH = Math.max(0, h - pad * 2);
  // Integer cell size keeps grid lines crisp.
  const cellSize = Math.max(1, Math.floor(Math.min(availW / cols, availH / rows)));
  const boardW = cellSize * cols;
  const boardH = cellSize * rows;

  return {
    landscape,
    side,
    cellSize,
    cols,
    rows,
    boardX: Math.round(x + (w - boardW) / 2),
    boardY: Math.round(y + (h - boardH) / 2),
    boardW,
    boardH,
    region: { x, y, w, h },
  };
}

/** Map a point in CSS pixels to a cell, or null if outside the board. */
export function cellAtPoint(layout, px, py) {
  const col = Math.floor((px - layout.boardX) / layout.cellSize);
  const row = Math.floor((py - layout.boardY) / layout.cellSize);
  if (col < 0 || row < 0 || col >= layout.cols || row >= layout.rows) return null;
  return { col, row };
}

/** Top-left of a cell in CSS pixels. */
export function cellOrigin(layout, col, row) {
  return { x: layout.boardX + col * layout.cellSize, y: layout.boardY + row * layout.cellSize };
}
