// Canvas renderer. A thin layer over game state: it never mutates the scene.
//
// Drawing is on demand: call invalidate() after any state change and one
// frame is drawn on the next animation frame. Draw passes run in order;
// later phases add passes (creatures, fold preview, fx) to PASSES instead of
// growing one big draw function.
//
// Effects (fold animation, creature clips, shake) are timed by render/fx.js;
// the renderer only paints the player's current state (see setFx).
// Creatures are painted on their layer by drawLayer (so they ride folds and
// sit under any layer stacked over them); the actor pass draws the one
// creature a clip is animating.

import { computeLayout, cellOrigin } from './layout.js';
import { getPalette, DEFAULT_PALETTE_ID } from './palette.js';
import { TILE, ITEM } from '../core/tiles.js';
import { CELL, EFFECT } from './preview.js';
import { drawCreature } from './creatures.js';

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
    fx: null, // fx player (render/fx.js): foldAnim, actor, shake
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
    /** Attach an fx player; its foldAnim/actor/shake are painted each frame. */
    setFx(fx) {
      r.fx = fx;
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

const PASSES = [drawBackground, drawBoardBase, drawTiles, drawFoldPreview, drawFoldAnim, drawActor, drawFlash];

function draw(r) {
  const { ctx } = r;
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  drawBackground(r, ctx); // the shake moves the board, not the backdrop
  const shake = r.fx && r.fx.shake;
  if (shake && shake.x) ctx.translate(shake.x, 0);
  for (let i = 1; i < PASSES.length; i++) PASSES[i](r, ctx);
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
  // Mid-fold, the moving stacks are drawn by drawFoldAnim, not here.
  const anim = r.fx && r.fx.foldAnim;
  const board = anim ? anim.base : r.scene.board;
  const lift = layerLift(L.cellSize);
  const skip = skipId(r);
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
        drawLayer(ctx, r.palette, layers[i], o.x, o.y - i * lift, L.cellSize, i === layers.length - 1, skip);
      }
      // Creatures under a stacked layer are pinned: show a ghost of them on
      // top with a paper clip (docs/04), so they never just vanish.
      for (let i = 0; i < layers.length - 1; i++) {
        const c = layers[i].creature;
        if (c && c.id !== skip) drawPinned(ctx, r.palette, c, o.x, o.y - (layers.length - 1) * lift, L.cellSize);
      }
    }
  }
}

// Fold preview (scene.preview from render/preview.js). Each state has a
// non-color cue too: leaving cells are dimmed with a dashed outline, landing
// cells show a ghost of the incoming sheet and the new stack height, overflow
// cells get a "!" badge and a cross, clipped cells a dotted outline. A
// landing that pins a creature shows a paper clip; one that void-drops it a
// dashed red outline and a "↓" badge; one that opens a lock a key badge.
function drawFoldPreview(r, ctx) {
  const L = r.layout;
  const pv = r.scene && r.scene.preview;
  if (!L || !pv) return;
  const board = r.scene.board;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
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
      if (pv.unlock && pv.unlock[i]) {
        // The fold stacks a key and a lock: the lock opens. Key badge.
        const bx = o.x + size * 0.78;
        const by = o.y + size * 0.78;
        ctx.fillStyle = p.tileFace;
        ctx.beginPath();
        ctx.arc(bx, by, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = lineW;
        ctx.stroke();
        drawKey(ctx, bx, by, size * 0.3, p.accent, p.glyph);
      }
      if (pv.effect[i] === EFFECT.PIN) drawClip(ctx, p, o.x + size * 0.06, o.y + size * 0.6, size);
      else if (pv.effect[i] === EFFECT.DROP) {
        outline(ctx, o.x, o.y, size, p.danger, lineW, [dash, dash / 2]);
        badge(ctx, p, o.x + size * 0.22, o.y + size * 0.78, size * 0.2, '↓', true);
      }
    }
  }
  drawCrease(ctx, p, L, pv, lineW);
}

// Fold animation (render/fx.js). Each moving stack scales by cos(angle)
// around the crease, so at angle π it is exactly mirrored onto its landing
// cell. It rises on an arc, floats, then settles onto the stack below; its
// shadow stays on the board. Shading by the angle sells the edge-on moment.
function drawFoldAnim(r, ctx) {
  const L = r.layout;
  const anim = r.fx && r.fx.foldAnim;
  if (!L || !anim) return;
  const p = r.palette;
  const f = anim.frame;
  const size = L.cellSize;
  const lift = layerLift(size);
  const c = f.cos;
  const vertical = anim.fold.axis === 'v';
  const crease = anim.fold.index * size + (vertical ? L.boardX : L.boardY);
  const rise = f.arc * size * 0.6 + f.hover * lift * 2;
  const sheets = anim.sheets;

  // Shadows first, flat on the board under the flying sheet.
  ctx.fillStyle = p.shadow;
  ctx.globalAlpha = Math.min(1, f.arc + f.hover * 0.5);
  for (let k = 0; k < sheets.length; k++) {
    const o = cellOrigin(L, sheets[k].col, sheets[k].row);
    const a = vertical ? crease + (o.x - crease) * c : crease + (o.y - crease) * c;
    const b = vertical ? crease + (o.x + size - crease) * c : crease + (o.y + size - crease) * c;
    const lo = Math.min(a, b);
    const len = Math.abs(b - a);
    const off = rise * 0.25;
    if (vertical) ctx.fillRect(lo + off, o.y + off, len, size);
    else ctx.fillRect(o.x + off, lo + off, size, len);
  }
  ctx.globalAlpha = 1;
  if (Math.abs(c) < 0.03) return; // edge-on: nothing visible

  // Paint order follows the visible rows: source order before the sheet
  // passes upright, landing order after (h folds reverse the rows).
  const forward = c >= 0;
  const shade = (1 - Math.abs(c)) * 0.45;
  const gap = layerGap(size);
  for (let n = 0; n < sheets.length; n++) {
    const s = sheets[forward ? n : sheets.length - 1 - n];
    const o = cellOrigin(L, s.col, s.row);
    const baseLift = f.stack * s.baseHeight * lift + rise;
    for (let i = 0; i < s.layers.length; i++) {
      const up = baseLift + i * lift;
      ctx.save();
      if (vertical) {
        ctx.translate(crease, -up);
        ctx.scale(c, 1);
        ctx.translate(-crease, 0);
      } else {
        ctx.translate(0, crease - up);
        ctx.scale(1, c);
        ctx.translate(0, -crease);
      }
      drawLayer(ctx, p, s.layers[i], o.x, o.y, size, i === s.layers.length - 1, null);
      if (shade > 0.01) {
        ctx.globalAlpha = shade;
        ctx.fillStyle = p.shadow;
        ctx.fillRect(o.x + gap, o.y + gap, size - gap * 2, size - gap * 2);
      }
      ctx.restore();
    }
  }
}

// Creature clip (render/playback.js): the animated creature is skipped by
// drawTiles and drawn here, between cells or fading out.
function drawActor(r, ctx) {
  const L = r.layout;
  const a = r.fx && r.fx.actor;
  if (!L || !a) return;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
  const gap = layerGap(size);
  const u = a.u;
  const from = cellOrigin(L, a.from.col, a.from.row);
  const to = cellOrigin(L, a.to.col, a.to.row);
  const fromY = from.y - a.fromLevel * lift;
  const toY = to.y - a.toLevel * lift;
  let x = from.x;
  let y = fromY;
  const opts = ACTOR_OPTS;
  opts.alpha = 1;
  opts.scale = 1;
  opts.rot = 0;
  if (a.kind === 'move') {
    const t = easeInOut(u);
    x = from.x + (to.x - from.x) * t;
    y = fromY + (toY - fromY) * t - Math.sin(Math.PI * u) * size * 0.12; // a little hop
  } else if (a.kind === 'bump') {
    const k = Math.sin(Math.PI * u) * 0.32; // lunge toward the target and back
    x = from.x + (to.x - from.x) * k;
    y = fromY + (to.y - from.y) * k;
  } else if (a.kind === 'hit') {
    drawHit(ctx, p, to.x, toY, size, u);
    return;
  } else if (a.kind === 'death') {
    opts.alpha = 1 - u;
    opts.scale = 1 - 0.5 * u;
    opts.rot = u * 0.8;
  } else if (a.kind === 'fall') {
    // Drops through the hole: shrinks toward the centre while spinning.
    opts.alpha = 1 - u * u;
    opts.scale = (1 - u) * (1 - u);
    opts.rot = u * 2.4;
    y += u * size * 0.08;
  }
  drawCreature(ctx, p, a.creature, x + gap, y + gap, size - gap * 2, opts);
}
const ACTOR_OPTS = { alpha: 1, scale: 1, rot: 0 };

// Hit burst: an expanding ring plus four spikes (shape cue, not just color).
function drawHit(ctx, p, x, y, size, u) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const rad = size * (0.2 + 0.3 * u);
  ctx.save();
  ctx.globalAlpha = 1 - u;
  ctx.strokeStyle = p.danger;
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2;
    ctx.moveTo(cx + Math.cos(ang) * rad * 1.1, cy + Math.sin(ang) * rad * 1.1);
    ctx.lineTo(cx + Math.cos(ang) * rad * 1.5, cy + Math.sin(ang) * rad * 1.5);
  }
  ctx.stroke();
  ctx.restore();
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Reduced-motion stand-in for the invalid shake: a brief outline around the
// board (the HUD status text carries the reason).
function drawFlash(r, ctx) {
  const L = r.layout;
  const shake = r.fx && r.fx.shake;
  if (!L || !shake || !shake.flash) return;
  const w = Math.max(3, Math.round(L.cellSize * 0.08));
  ctx.strokeStyle = r.palette.danger;
  ctx.lineWidth = w;
  ctx.setLineDash([w * 2, w]);
  ctx.strokeRect(L.boardX - w, L.boardY - w, L.boardW + w * 2, L.boardH + w * 2);
  ctx.setLineDash([]);
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
  [TILE.LOCK]: paintLock,
  [TILE.DOOR]: paintDoor,
  [TILE.PLATE]: paintPlate,
  [TILE.GATE]: paintGate,
  [TILE.GATE_OPEN]: paintGateOpen,
  [TILE.EXIT]: paintExit,
};

// Item painters, keyed by item id; drawn on the tile face under any creature.
const ITEM_PAINTERS = {
  [ITEM.KEY]: paintKeyItem,
};

function drawPinned(ctx, p, creature, x, y, size) {
  const gap = layerGap(size);
  ctx.save();
  ctx.globalAlpha = 0.4;
  drawCreature(ctx, p, creature, x + gap, y + gap, size - gap * 2, PINNED_OPTS);
  ctx.restore();
  drawClip(ctx, p, x + size * 0.76, y + size * 0.08, size);
}
const PINNED_OPTS = { alpha: 1, scale: 0.8, rot: 0, shadow: false };

// Paper clip glyph (pinned creatures, and pin cues in the fold preview):
// two nested rounded loops with their top-left corner at (cx, cy).
function drawClip(ctx, p, cx, cy, size) {
  const w = size * 0.14;
  const h = size * 0.3;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.lineCap = 'round';
  roundRect(ctx, cx, cy, w, h, w / 2);
  ctx.stroke();
  roundRect(ctx, cx + w * 0.25, cy + h * 0.15, w * 0.5, h * 0.6, w / 4);
  ctx.stroke();
}

/** Vertical offset per stacked layer. */
function layerLift(size) {
  return Math.max(2, Math.round(size * 0.06));
}

/** Inset of a tile face inside its cell. */
function layerGap(size) {
  return Math.max(1, Math.round(size * 0.04));
}

/** Id of the creature the actor pass is drawing instead, if any. */
function skipId(r) {
  const a = r.fx && r.fx.actor;
  return a && a.skip ? a.id : null;
}

function drawLayer(ctx, p, layer, x, y, size, isTop, skip) {
  const gap = layerGap(size);
  const s = size - gap * 2;
  const painter = TILE_PAINTERS[layer.tile] || paintFloor;
  painter(ctx, p, x + gap, y + gap, s, isTop, layer);
  const item = layer.item && ITEM_PAINTERS[layer.item];
  if (item) item(ctx, p, x + gap, y + gap, s, !!layer.creature);
  const c = layer.creature;
  if (c && c.id !== skip) drawCreature(ctx, p, c, x + gap, y + gap, s, null);
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

// Puzzle tiles. Each has its own symbol (padlock, open shackle, plate,
// bars, stairs) so none relies on color. Plates and gates also carry a link
// mark (dot, triangle, square, diamond) shared by the plate and the gates it
// powers.

function paintLock(ctx, p, x, y, s) {
  paintFloor(ctx, p, x, y, s);
  const rad = Math.max(2, s * 0.08);
  const w = Math.max(2, s * 0.08);
  ctx.strokeStyle = p.wallFace;
  ctx.lineWidth = w;
  roundRect(ctx, x + w / 2, y + w / 2, s - w, s - w, rad);
  ctx.stroke();
  drawPadlock(ctx, p, x + s / 2, y + s * 0.55, s * 0.5, false);
}

function paintDoor(ctx, p, x, y, s) {
  paintFloor(ctx, p, x, y, s);
  const w = Math.max(1, s * 0.04);
  ctx.strokeStyle = p.wallFace;
  ctx.lineWidth = w;
  ctx.setLineDash([w * 2, w * 2]);
  ctx.strokeRect(x + w * 2, y + w * 2, s - w * 4, s - w * 4);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.45;
  drawPadlock(ctx, p, x + s / 2, y + s * 0.58, s * 0.36, true);
  ctx.globalAlpha = 1;
}

function drawPadlock(ctx, p, cx, cy, size, open) {
  const bw = size * 0.7;
  const bh = size * 0.55;
  ctx.strokeStyle = p.glyph;
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  ctx.beginPath();
  // Shackle: closed sits in the body; open is lifted and swung aside.
  const sx = open ? cx + bw * 0.18 : cx;
  const sy = open ? cy - bh * 0.2 : cy;
  ctx.arc(sx, sy - bh * 0.5, bw * 0.3, Math.PI, 0);
  ctx.lineTo(sx + bw * 0.3, sy - bh * 0.45);
  ctx.moveTo(sx - bw * 0.3, sy - bh * 0.5);
  ctx.lineTo(sx - bw * 0.3, sy - bh * (open ? 0.6 : 0.45));
  ctx.stroke();
  ctx.fillStyle = p.glyph;
  roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, size * 0.08);
  ctx.fill();
  ctx.fillStyle = p.tileFace; // keyhole
  ctx.beginPath();
  ctx.arc(cx, cy - bh * 0.05, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - size * 0.03, cy - bh * 0.05, size * 0.06, bh * 0.3);
}

function paintPlate(ctx, p, x, y, s, isTop, layer) {
  paintFloor(ctx, p, x, y, s);
  const pressed = isTop && !!layer.creature;
  const inset = s * 0.18;
  const d = pressed ? 0 : Math.max(1, s * 0.05); // raised lip when up
  const w = s - inset * 2;
  ctx.fillStyle = p.tileEdge;
  roundRect(ctx, x + inset, y + inset + d, w, w, s * 0.06);
  ctx.fill();
  ctx.fillStyle = pressed ? p.tileEdge : p.tileFace;
  roundRect(ctx, x + inset, y + inset + (pressed ? d : 0), w, w, s * 0.06);
  ctx.fill();
  ctx.strokeStyle = p.glyph;
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.setLineDash(pressed ? [s * 0.06, s * 0.04] : []); // pressed: dashed rim
  ctx.stroke();
  ctx.setLineDash([]);
  drawLinkMark(ctx, p, x, y, s, layer);
}

function paintGate(ctx, p, x, y, s, isTop, layer) {
  paintFloor(ctx, p, x, y, s);
  const w = Math.max(2, s * 0.08);
  ctx.fillStyle = p.glyph;
  ctx.fillRect(x + s * 0.1, y + s * 0.12, s * 0.8, w); // top rail
  ctx.fillRect(x + s * 0.1, y + s * 0.88 - w, s * 0.8, w); // bottom rail
  for (let k = 0; k < 4; k++) ctx.fillRect(x + s * (0.2 + k * 0.2) - w / 2, y + s * 0.12, w, s * 0.76);
  drawLinkMark(ctx, p, x, y, s, layer);
}

function paintGateOpen(ctx, p, x, y, s, isTop, layer) {
  paintFloor(ctx, p, x, y, s);
  const w = Math.max(2, s * 0.08);
  ctx.fillStyle = p.glyph;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + s * 0.1, y + s * 0.12, s * 0.8, w); // bars retracted into the top rail
  for (let k = 0; k < 4; k++) ctx.fillRect(x + s * (0.2 + k * 0.2) - w / 2, y + s * 0.12, w, s * 0.12);
  ctx.globalAlpha = 1;
  drawLinkMark(ctx, p, x, y, s, layer);
}

function paintExit(ctx, p, x, y, s) {
  paintFloor(ctx, p, x, y, s);
  // Stairs: three steps rising to the right, filled with the accent and
  // outlined in ink. Centred on the face (0.2–0.8 both ways).
  const x0 = x + s * 0.2;
  const yb = y + s * 0.8;
  const step = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(x0, yb);
  for (let k = 0; k < 3; k++) {
    ctx.lineTo(x0 + k * step, yb - (k + 1) * step);
    ctx.lineTo(x0 + (k + 1) * step, yb - (k + 1) * step);
  }
  ctx.lineTo(x0 + 3 * step, yb);
  ctx.closePath();
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.strokeStyle = p.glyph;
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// Link marks: a small shape in the top-left corner, one per link channel.
function drawLinkMark(ctx, p, x, y, s, layer) {
  const link = (layer && layer.link) || 0;
  const r = s * 0.08;
  const cx = x + s * 0.13;
  const cy = y + s * 0.13;
  ctx.fillStyle = p.accent;
  ctx.strokeStyle = p.glyph;
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  const shape = link % 4;
  if (shape === 1) ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (shape === 2) {
    ctx.moveTo(cx, cy - r * 1.1);
    ctx.lineTo(cx + r * 1.1, cy + r * 0.9);
    ctx.lineTo(cx - r * 1.1, cy + r * 0.9);
  } else if (shape === 3) ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.moveTo(cx, cy - r * 1.2);
    ctx.lineTo(cx + r * 1.2, cy);
    ctx.lineTo(cx, cy + r * 1.2);
    ctx.lineTo(cx - r * 1.2, cy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Key item: centered, or tucked in a corner when a creature stands on it.
function paintKeyItem(ctx, p, x, y, s, crowded) {
  const size = crowded ? s * 0.32 : s * 0.6;
  const cx = crowded ? x + s * 0.8 : x + s / 2;
  const cy = crowded ? y + s * 0.2 : y + s / 2;
  drawKey(ctx, cx, cy, size, p.accent, p.glyph);
}

// A key glyph centered on (cx, cy), `size` across: ring bow, shaft, teeth.
// It spans cx ± 0.42 size, so it sits in the middle of whatever holds it.
function drawKey(ctx, cx, cy, size, fill, stroke) {
  const r = size * 0.2;
  const bx = cx - size * 0.22;
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.rect(bx + r * 0.8, cy - size * 0.06, size * 0.48, size * 0.12); // shaft
  ctx.rect(cx + size * 0.24, cy + size * 0.06, size * 0.08, size * 0.14); // teeth
  ctx.rect(cx + size * 0.1, cy + size * 0.06, size * 0.08, size * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = stroke;
  ctx.arc(bx, cy, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
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
