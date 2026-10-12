// Canvas renderer. A thin layer over game state: it never mutates the scene.
//
// Drawing is on demand: call invalidate() after any state change and one
// frame is drawn on the next animation frame. Draw passes run in order;
// later phases add passes (creatures, fold preview, fx) to PASSES instead of
// growing one big draw function.

import { computeLayout, cellOrigin } from './layout.js';
import { getPalette, DEFAULT_PALETTE_ID } from './palette.js';
import { TILE } from '../core/tiles.js';

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
    scene: null, // { board } — extended by later phases
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

const PASSES = [drawBackground, drawBoardBase, drawTiles];

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
      for (let i = 0; i < layers.length; i++) {
        drawLayer(ctx, r.palette, layers[i], o.x, o.y - i * lift, L.cellSize, i === layers.length - 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Tile painters, keyed by tile id. Each draws a distinct symbol so tile types
// are identifiable without color.

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
