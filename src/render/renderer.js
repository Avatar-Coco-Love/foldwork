// Canvas renderer. A thin layer over game state: it never mutates the scene.
//
// Drawing is on demand: call invalidate() after any state change and one
// frame is drawn on the next animation frame. Draw passes run in order;
// later phases add passes (creatures, fold preview, fx) to PASSES instead of
// growing one big draw function.

import { computeLayout, cellOrigin } from './layout.js';
import { getPalette, DEFAULT_PALETTE_ID } from './palette.js';
import { TILE } from '../core/tiles.js';
import { CELL } from './preview.js';

const MAX_DPR = 2;

export function createRenderer(canvas, { paletteId = DEFAULT_PALETTE_ID } = {}) {
  const ctx = canvas.getContext('2d');
  const r = {
    canvas,
    ctx,
    dpr: 1,
    viewW: 0,
    viewH: 0,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    leftHanded: false,
    palette: getPalette(paletteId),
    scene: null, // { board, preview? } — extended by later phases
    layout: null,
    frameRequested: false,
  };

  function relayout() {
    if (!r.scene || !r.scene.board) {
      r.layout = null;
      return;
    }
    const { w, h } = r.scene.board;
    r.layout = computeLayout({
      viewW: r.viewW,
      viewH: r.viewH,
      cols: w,
      rows: h,
      insets: r.insets,
      leftHanded: r.leftHanded,
    });
  }

  function frame() {
    r.frameRequested = false;
    draw(r);
  }

  const api = {
    canvas,
    get layout() {
      return r.layout;
    },
    get palette() {
      return r.palette;
    },
    /** Request a redraw on the next animation frame (coalesced). */
    invalidate() {
      if (r.frameRequested) return;
      r.frameRequested = true;
      requestAnimationFrame(frame);
    },
    resize(viewW, viewH, insets) {
      r.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      r.viewW = viewW;
      r.viewH = viewH;
      if (insets) r.insets = insets;
      canvas.width = Math.round(viewW * r.dpr);
      canvas.height = Math.round(viewH * r.dpr);
      canvas.style.width = viewW + 'px';
      canvas.style.height = viewH + 'px';
      relayout();
      api.invalidate();
    },
    setScene(scene) {
      r.scene = scene;
      relayout();
      api.invalidate();
    },
    setPalette(id) {
      r.palette = getPalette(id);
      api.invalidate();
    },
    setLeftHanded(value) {
      r.leftHanded = !!value;
      relayout();
      api.invalidate();
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Draw passes

const PASSES = [drawBackground, drawBoardBase, drawTiles, drawFoldPreview];

function draw(r) {
  const { ctx } = r;
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  for (const pass of PASSES) pass(r, ctx);
}

function drawBackground(r, ctx) {
  ctx.fillStyle = r.palette.background;
  ctx.fillRect(0, 0, r.viewW, r.viewH);
}

function drawBoardBase(r, ctx) {
  const L = r.layout;
  if (!L) return;
  const p = r.palette;
  const m = Math.max(4, Math.round(L.cellSize * 0.08)); // board margin
  // Soft drop shadow, then the backing sheet.
  ctx.fillStyle = p.shadow;
  roundRect(ctx, L.boardX - m + 3, L.boardY - m + 5, L.boardW + m * 2, L.boardH + m * 2, m);
  ctx.fill();
  ctx.fillStyle = p.boardEdge;
  roundRect(ctx, L.boardX - m, L.boardY - m, L.boardW + m * 2, L.boardH + m * 2, m);
  ctx.fill();
}

function drawTiles(r, ctx) {
  const L = r.layout;
  if (!L) return;
  const board = r.scene.board;
  const lift = Math.max(2, Math.round(L.cellSize * 0.06)); // per-layer offset
  for (let row = 0; row < board.h; row++) {
    for (let col = 0; col < board.w; col++) {
      const { layers } = board.cells[row * board.w + col];
      const o = cellOrigin(L, col, row);
      if (!layers.length) {
        // Vacated by a fold: no paper left, which plays as a void.
        drawLayer(ctx, r.palette, EMPTY_CELL, o.x, o.y, L.cellSize, true);
        continue;
      }
      for (let i = 0; i < layers.length; i++) {
        drawLayer(ctx, r.palette, layers[i], o.x, o.y - i * lift, L.cellSize, i === layers.length - 1);
      }
    }
  }
}

// Fold preview (scene.preview from render/preview.js). Each state has a
// non-color cue too: leaving cells are dimmed with a dashed outline, landing
// cells show a ghost of the incoming sheet and the new stack height, overflow
// cells get a "!" badge and a cross, clipped cells a dotted outline.
function drawFoldPreview(r, ctx) {
  const L = r.layout;
  const pv = r.scene && r.scene.preview;
  if (!L || !pv) return;
  const board = r.scene.board;
  const p = r.palette;
  const size = L.cellSize;
  const lift = Math.max(2, Math.round(size * 0.06));
  const lineW = Math.max(2, Math.round(size * 0.06));
  const dash = Math.max(3, Math.round(size * 0.1));

  for (let i = 0; i < pv.state.length; i++) {
    const st = pv.state[i];
    if (st === CELL.NONE) continue;
    const col = i % board.w;
    const row = (i - col) / board.w;
    const o = cellOrigin(L, col, row);
    if (st === CELL.LEAVING) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = p.background;
      ctx.fillRect(o.x, o.y - lift, size, size + lift);
      ctx.globalAlpha = 1;
      outline(ctx, o.x, o.y, size, p.inkSoft, 1.5, [dash, dash]);
    } else if (st === CELL.CLIPPED) {
      outline(ctx, o.x, o.y, size, p.inkSoft, 1.5, [1.5, dash / 2]);
    } else {
      const src = board.cells[pv.source[i]].layers;
      const base = board.cells[i].layers.length;
      if (src.length) {
        ctx.globalAlpha = 0.6;
        drawLayer(ctx, p, src[src.length - 1], o.x, o.y - (base + src.length - 1) * lift, size, true);
        ctx.globalAlpha = 1;
      }
      const over = st === CELL.OVERFLOW;
      if (over) {
        outline(ctx, o.x, o.y, size, p.danger, lineW, null);
        ctx.strokeStyle = p.danger;
        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.moveTo(o.x + size * 0.2, o.y + size * 0.2);
        ctx.lineTo(o.x + size * 0.8, o.y + size * 0.8);
        ctx.moveTo(o.x + size * 0.8, o.y + size * 0.2);
        ctx.lineTo(o.x + size * 0.2, o.y + size * 0.8);
        ctx.stroke();
      }
      badge(ctx, p, o.x + size * 0.78, o.y + size * 0.22, size * 0.2,
        over ? `!${pv.heights[i]}` : String(pv.heights[i]), over);
    }
  }
  drawCrease(ctx, p, L, pv, lineW);
}

function drawCrease(ctx, p, L, pv, lineW) {
  const { axis, index, side } = pv.fold;
  const color = pv.ok ? p.accent : p.danger;
  const pos = index * L.cellSize;
  const x0 = axis === 'v' ? L.boardX + pos : L.boardX;
  const y0 = axis === 'v' ? L.boardY : L.boardY + pos;
  const x1 = axis === 'v' ? x0 : L.boardX + L.boardW;
  const y1 = axis === 'v' ? L.boardY + L.boardH : y0;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.setLineDash(pv.ok ? [] : [lineW * 3, lineW * 2]); // invalid: dashed
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  // Chevron on the folding side, pointing across the crease.
  const s = L.cellSize * 0.3;
  const dir = side === 'before' ? 1 : -1;
  const cx = axis === 'v' ? x0 - dir * s * 0.9 : (x0 + x1) / 2;
  const cy = axis === 'v' ? (y0 + y1) / 2 : y0 - dir * s * 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (axis === 'v') {
    ctx.moveTo(cx + dir * s * 0.5, cy);
    ctx.lineTo(cx - dir * s * 0.4, cy - s * 0.6);
    ctx.lineTo(cx - dir * s * 0.4, cy + s * 0.6);
  } else {
    ctx.moveTo(cx, cy + dir * s * 0.5);
    ctx.lineTo(cx - s * 0.6, cy - dir * s * 0.4);
    ctx.lineTo(cx + s * 0.6, cy - dir * s * 0.4);
  }
  ctx.closePath();
  ctx.fill();
}

function outline(ctx, x, y, size, color, width, dashPattern) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashPattern) ctx.setLineDash(dashPattern);
  ctx.strokeRect(x + width / 2, y + width / 2, size - width, size - width);
  if (dashPattern) ctx.setLineDash([]);
}

function badge(ctx, p, cx, cy, rad, text, danger) {
  ctx.fillStyle = danger ? p.danger : p.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.tileFace;
  ctx.font = `700 ${Math.round(rad * (text.length > 1 ? 1.1 : 1.4))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
}

// ---------------------------------------------------------------------------
// Tile painters, keyed by tile id. Each draws a distinct symbol so tile types
// are identifiable without color.

const EMPTY_CELL = Object.freeze({ tile: TILE.VOID });

const TILE_PAINTERS = {
  [TILE.FLOOR]: paintFloor,
  [TILE.WALL]: paintWall,
  [TILE.VOID]: paintVoid,
};

function drawLayer(ctx, p, layer, x, y, size, isTop) {
  const gap = Math.max(1, Math.round(size * 0.04));
  const s = size - gap * 2;
  const painter = TILE_PAINTERS[layer.tile] || paintFloor;
  painter(ctx, p, x + gap, y + gap, s, isTop);
}

function paintFloor(ctx, p, x, y, s) {
  const rad = Math.max(2, s * 0.08);
  ctx.fillStyle = p.tileEdge;
  roundRect(ctx, x, y + 2, s, s, rad);
  ctx.fill();
  ctx.fillStyle = p.tileFace;
  roundRect(ctx, x, y, s, s, rad);
  ctx.fill();
  // A faint diagonal crease: the "paper" read.
  ctx.strokeStyle = p.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y + s * 0.8);
  ctx.lineTo(x + s * 0.8, y + s * 0.2);
  ctx.stroke();
}

function paintWall(ctx, p, x, y, s) {
  const rad = Math.max(2, s * 0.08);
  ctx.fillStyle = p.boardEdge;
  roundRect(ctx, x, y + 3, s, s, rad);
  ctx.fill();
  ctx.fillStyle = p.wallFace;
  roundRect(ctx, x, y, s, s, rad);
  ctx.fill();
  // Hatch pattern symbol.
  ctx.save();
  roundRect(ctx, x, y, s, s, rad);
  ctx.clip();
  ctx.strokeStyle = p.tileFace;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  for (let k = -s; k < s; k += s / 4) {
    ctx.moveTo(x + k, y + s);
    ctx.lineTo(x + k + s, y);
  }
  ctx.stroke();
  ctx.restore();
}

function paintVoid(ctx, p, x, y, s) {
  const rad = Math.max(2, s * 0.08);
  ctx.fillStyle = p.voidFace;
  roundRect(ctx, x, y, s, s, rad);
  ctx.fill();
  // Concentric ring symbol.
  ctx.strokeStyle = p.inkSoft;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
