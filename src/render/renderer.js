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
import { CELL, EFFECT, buildTelegraph, creaseSegment } from './preview.js';
import { drawCreature } from './creatures.js';
import { findCreature, stackHeight } from '../core/board.js';
import { creatureDef } from '../core/creatures.js';
import { actingEnemies, sightLanes, pendingSpawns } from '../core/enemies.js';

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
    scene: null, // { board, preview?, hint?, creases?, traps?, compass? } — extended by later phases
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

const PASSES = [drawBackground, drawBoardBase, drawTiles, drawTraps, drawCreaseMarks, drawSightLanes, drawSpawnMarks, drawTelegraph, drawFoldPreview, drawHintStep, drawFoldAnim, drawActor, drawFlash];

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
      // Compass: an exit under the paper shows as a small exit on top.
      if (r.scene.compass) {
        for (let i = 0; i < layers.length - 1; i++) {
          if (layers[i].tile === TILE.EXIT) drawBuriedExit(ctx, r.palette, layers[i], o.x, o.y - (layers.length - 1) * lift, L.cellSize);
        }
      }
    }
  }
}

// Compass: a dashed outline and a small copy of the exit tile in the top
// face's corner, for an exit buried under other layers.
function drawBuriedExit(ctx, p, layer, x, y, size) {
  const gap = layerGap(size);
  const dash = Math.max(3, Math.round(size * 0.1));
  outline(ctx, x + gap, y + gap, size - gap * 2, p.accent, Math.max(1.5, size * 0.04), [dash, dash / 2]);
  const s = size * 0.4;
  paintExit(ctx, p, x + size - s - gap * 2, y + gap * 2, s, true, layer);
}

// Crease Trap spikes (scene.traps, core/turn.js): a row of small triangles
// along the bottom of each spiked cell's top face, so it reads by shape.
function drawTraps(r, ctx) {
  const L = r.layout;
  const traps = r.scene && r.scene.traps;
  if (!L || !traps || !traps.length || (r.fx && r.fx.foldAnim)) return;
  const board = r.scene.board;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
  ctx.save();
  ctx.fillStyle = p.danger;
  ctx.strokeStyle = p.tileFace;
  ctx.lineWidth = 1;
  for (const trap of traps) {
    for (const c of trap.cells) {
      const level = Math.max(0, stackHeight(board, c.col, c.row) - 1);
      const o = cellOrigin(L, c.col, c.row);
      const y = o.y - level * lift + size * 0.86;
      const w = size / 5;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const x = o.x + size * 0.1 + k * w;
        ctx.moveTo(x, y);
        ctx.lineTo(x + w / 2, y - size * 0.16);
        ctx.lineTo(x + w, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Ranged enemies' lines of fire (core/enemies.js sightLanes): a dashed line
// from the shooter through every cell it can hit, ending in a short bar,
// so the threat reads by shape. Lanes are cached per board object (the
// renderer redraws every frame during animations).
function drawSightLanes(r, ctx) {
  const L = r.layout;
  if (!L || (r.fx && r.fx.foldAnim)) return;
  const board = r.scene.board;
  if (!r.lanes || r.lanes.board !== board) r.lanes = { board, list: shooterLanes(board) };
  const list = r.lanes.list;
  if (!list.length) return;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
  ctx.save();
  ctx.strokeStyle = p.danger;
  ctx.lineWidth = Math.max(1.5, size * 0.04);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.75;
  for (const { from, end, level } of list) {
    const a = cellOrigin(L, from.col, from.row);
    const b = cellOrigin(L, end.col, end.row);
    const ax = a.x + size / 2;
    const ay = a.y + size / 2 - level * lift;
    const bx = b.x + size / 2;
    const by = b.y + size / 2 - level * lift;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    ctx.setLineDash([size * 0.08, size * 0.12]);
    ctx.beginPath();
    ctx.moveTo(ax + ux * size * 0.4, ay + uy * size * 0.4);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); // end bar across the lane
    ctx.moveTo(bx - uy * size * 0.15, by + ux * size * 0.15);
    ctx.lineTo(bx + uy * size * 0.15, by - ux * size * 0.15);
    ctx.stroke();
  }
  ctx.restore();
}

// Where spawners spawn at the end of this turn (core/enemies.js
// spawnSpot): a dashed ring with a small sprout cross on each cell where a
// Spore Bloom whose count reads 1 will put its Mite. Cached per board.
function drawSpawnMarks(r, ctx) {
  const L = r.layout;
  if (!L || (r.fx && r.fx.foldAnim)) return;
  const board = r.scene.board;
  if (!r.spawns || r.spawns.board !== board) r.spawns = { board, list: pendingSpawns(board, 'player') };
  const list = r.spawns.list;
  if (!list.length) return;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
  ctx.save();
  ctx.strokeStyle = p.danger;
  ctx.lineWidth = Math.max(1.5, size * 0.04);
  ctx.lineCap = 'round';
  for (const at of list) {
    const level = Math.max(0, stackHeight(board, at.col, at.row) - 1);
    const o = cellOrigin(L, at.col, at.row);
    const cx = o.x + size / 2;
    const cy = o.y + size / 2 - level * lift;
    ctx.setLineDash([size * 0.07, size * 0.07]);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy);
    ctx.lineTo(cx + size * 0.1, cy);
    ctx.moveTo(cx, cy - size * 0.1);
    ctx.lineTo(cx, cy + size * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

// The Great Crane's marked crease (render/preview.js buildTelegraph): a
// dashed danger line with its chevron, diagonal hatching on every cell the
// fold lands on and a "!" badge on the player if it covers them. A mark
// that would fizzle is drawn grey. Two marks at once (phase 3) carry a
// numbered badge at the line's start for their fold order, so the order
// reads without color. Cached per board; faded while the player previews
// a fold of their own.
function drawTelegraph(r, ctx) {
  const L = r.layout;
  if (!L || (r.fx && r.fx.foldAnim)) return;
  const board = r.scene.board;
  if (!r.marks || r.marks.board !== board) r.marks = { board, list: buildTelegraph(board) };
  const list = r.marks.list;
  if (!list.length) return;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
  const lineW = Math.max(2, Math.round(size * 0.06));
  ctx.save();
  if (r.scene.preview) ctx.globalAlpha = 0.45;
  for (const t of list) {
    const color = t.fizzle ? p.inkSoft : p.danger;
    const pv = t.pv;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.03);
    for (let i = 0; i < pv.state.length; i++) {
      if (pv.state[i] === CELL.NONE || pv.state[i] === CELL.LEAVING || pv.state[i] === CELL.CLIPPED) continue;
      const col = i % board.w;
      const row = (i - col) / board.w;
      const level = Math.max(0, board.cells[i].layers.length - 1);
      const o = cellOrigin(L, col, row);
      hatch(ctx, o.x, o.y - level * lift, size, size * 0.2);
    }
    drawCrease(ctx, p, L, pv, lineW, { color, dashed: true });
    const seg = t.of > 1 ? creaseSegment(board, t.fold) : null;
    if (seg) {
      const rad = Math.max(8, size * 0.17);
      const dx = seg.x1 - seg.x0;
      const dy = seg.y1 - seg.y0;
      const len = Math.hypot(dx, dy) || 1;
      const along = Math.min(0.5, rad * 1.4 / (len * size));
      badge(ctx, p, L.boardX + (seg.x0 + dx * along) * size, L.boardY + (seg.y0 + dy * along) * size, rad, String(t.n), !t.fizzle);
    }
    if (t.hits) {
      const me = findCreature(board, 'player');
      if (me) {
        const o = cellOrigin(L, me.col, me.row);
        const level = Math.max(0, board.cells[me.row * board.w + me.col].layers.length - 1);
        badge(ctx, p, o.x + size * 0.78, o.y + size * 0.22 - level * lift, size * 0.2, '!', true);
      }
    }
  }
  ctx.restore();
}

// Crease marks (playtest P4a): every player fold still in effect leaves a
// thin ink line where it was made and a numbered square tag near the
// line's start, so the order reads without color. scene.creases is
// [{ n, line, slot }] (line: preview.js creaseSegment; slot: how many
// earlier marks share the line, so their badges sit side by side). Hidden
// while a fold animates, since the paper is mid-air.
function drawCreaseMarks(r, ctx) {
  const L = r.layout;
  const marks = r.scene && r.scene.creases;
  if (!L || !marks || !marks.length || (r.fx && r.fx.foldAnim)) return;
  const p = r.palette;
  const size = L.cellSize;
  const lineW = Math.max(1, Math.round(size * 0.035));
  const rad = Math.max(7, size * 0.15);
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = lineW;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  for (const m of marks) {
    ctx.moveTo(L.boardX + m.line.x0 * size, L.boardY + m.line.y0 * size);
    ctx.lineTo(L.boardX + m.line.x1 * size, L.boardY + m.line.y1 * size);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  for (const m of marks) {
    const { x0, y0, x1, y1 } = m.line;
    const len = Math.hypot(x1 - x0, y1 - y0) * size || 1;
    const along = rad * 1.3 + m.slot * rad * 2.3;
    const t = Math.min(along, len / 2) / len;
    const cx = L.boardX + (x0 + (x1 - x0) * t) * size;
    const cy = L.boardY + (y0 + (y1 - y0) * t) * size;
    creaseTag(ctx, p, cx, cy, rad, String(m.n));
  }
  ctx.restore();
}

// A crease number: a light square tag with an ink outline, so it is not
// mistaken for the preview's round stack-height badges.
function creaseTag(ctx, p, cx, cy, rad, text) {
  ctx.fillStyle = p.tileFace;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = Math.max(1.5, rad * 0.18);
  roundRect(ctx, cx - rad, cy - rad, rad * 2, rad * 2, rad * 0.35);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.font = `700 ${Math.round(rad * (text.length > 1 ? 1.1 : 1.35))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
}

// The Hint button's next step (scene.hint, render/preview.js buildHintMark):
// a fold is its crease, dashed, with an arrow showing which way to drag; a
// move is an arrow from the player; a wait is a dashed ring with "…".
// Shape cues, so it never relies on color. Hidden while the player
// previews a fold of their own.
function drawHintStep(r, ctx) {
  const L = r.layout;
  const mark = r.scene && r.scene.hint;
  if (!L || !mark || r.scene.preview || (r.fx && r.fx.foldAnim)) return;
  const board = r.scene.board;
  const p = r.palette;
  const size = L.cellSize;
  const lift = layerLift(size);
  const lineW = Math.max(2, Math.round(size * 0.06));
  const centre = (c) => {
    const o = cellOrigin(L, c.col, c.row);
    const level = Math.max(0, stackHeight(board, c.col, c.row) - 1);
    return { x: o.x + size / 2, y: o.y + size / 2 - level * lift };
  };
  ctx.save();
  if (mark.kind === 'fold') drawCrease(ctx, p, L, mark.pv, lineW, { color: p.accent, dashed: true });
  if (mark.kind === 'wait') {
    const c = centre(mark.at);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = lineW;
    ctx.setLineDash([lineW * 2, lineW * 1.5]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, size * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    badge(ctx, p, c.x + size * 0.32, c.y - size * 0.32, size * 0.17, '…', false);
  } else {
    const a = centre(mark.from);
    const b = centre(mark.to);
    drawArrow(ctx, a.x, a.y, b.x, b.y, lineW * 1.4, p.accent, p.tileFace);
  }
  ctx.restore();
}

// An arrow with a contrasting outline, so it reads on any tile.
function drawArrow(ctx, x0, y0, x1, y1, w, color, edge) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const head = w * 3;
  const ex = x1 - ux * head;
  const ey = y1 - uy * head;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(ex, ey);
    ctx.moveTo(x1, y1);
    ctx.lineTo(ex - uy * head * 0.7, ey + ux * head * 0.7);
    ctx.lineTo(ex + uy * head * 0.7, ey - ux * head * 0.7);
    ctx.closePath();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = edge;
  ctx.lineWidth = w + 4;
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  path();
  ctx.stroke();
  ctx.fill();
}

// Diagonal hatching across one cell, clipped to it.
function hatch(ctx, x, y, size, gap) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.beginPath();
  for (let d = gap / 2; d < size * 2; d += gap) {
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d - size, y + size);
  }
  ctx.stroke();
  ctx.restore();
}

// Every non-empty lane of every unpinned ranged enemy: { from, end, level }.
function shooterLanes(board) {
  const out = [];
  for (const id of actingEnemies(board)) {
    const me = findCreature(board, id);
    const range = creatureDef(me.creature.kind).range;
    if (!range) continue;
    const level = board.cells[me.row * board.w + me.col].layers.length - 1;
    for (const lane of sightLanes(board, me, range)) {
      if (lane.length) out.push({ from: { col: me.col, row: me.row }, end: lane[lane.length - 1], level });
    }
  }
  return out;
}

// Fold preview (scene.preview from render/preview.js). Each state has a
// non-color cue too: leaving cells are dimmed with a dashed outline, landing
// cells show a ghost of the incoming sheet and the new stack height, overflow
// cells get a "!" badge and a cross, clipped cells a dotted outline. A cell
// holding a creature too heavy to pin gets the cross and a "!" badge. A
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
      const heavy = st === CELL.HEAVY;
      const over = st === CELL.OVERFLOW || heavy;
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
        heavy ? '!' : over ? `!${pv.heights[i]}` : String(pv.heights[i]), over);
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
  drawSlides(ctx, p, L, pv, lineW);
  drawScout(ctx, p, L, pv, lineW);
  drawCrease(ctx, p, L, pv, lineW);
}

// Scout's Eye (pv.scout, render/preview.js scoutPreview): each enemy's next
// action after the fold. A step is a thin dashed arrow; an attack a solid
// arrow with a "!" badge on its target; a spawn a dashed ring with "+";
// opening jaws a "!" badge on the Lockjaw. Shapes, not color, tell them apart.
function drawScout(ctx, p, L, pv, lineW) {
  if (!pv.scout || !pv.scout.length) return;
  const size = L.cellSize;
  const lift = layerLift(size);
  const centre = (c) => {
    const o = cellOrigin(L, c.col, c.row);
    const level = Math.max(0, pv.heights[c.row * L.cols + c.col] - 1);
    return { x: o.x + size / 2, y: o.y + size / 2 - level * lift };
  };
  ctx.save();
  for (const s of pv.scout) {
    const a = centre(s.from);
    const b = centre(s.to);
    if (s.kind === 'move' || s.kind === 'attack') {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const start = { x: a.x + ux * size * 0.28, y: a.y + uy * size * 0.28 };
      const end = { x: b.x - ux * size * 0.18, y: b.y - uy * size * 0.18 };
      if (s.kind === 'move') ctx.setLineDash([size * 0.06, size * 0.06]);
      drawArrow(ctx, start.x, start.y, end.x, end.y, Math.max(2, lineW * 0.7), p.danger, p.tileFace);
      ctx.setLineDash([]);
      if (s.kind === 'attack') badge(ctx, p, b.x + size * 0.28, b.y - size * 0.28, size * 0.15, '!', true);
    } else if (s.kind === 'spawn') {
      ctx.strokeStyle = p.danger;
      ctx.lineWidth = lineW * 0.7;
      ctx.setLineDash([size * 0.06, size * 0.06]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      badge(ctx, p, b.x, b.y, size * 0.13, '+', true);
    } else {
      badge(ctx, p, b.x + size * 0.28, b.y - size * 0.28, size * 0.15, '!', true);
    }
  }
  ctx.restore();
}

// Creaseling slides the fold would cause (pv.slides): a dashed arrow from
// where it ends up after the fold to where it will glide, at the stack
// heights after the fold, plus a dashed ring on the landing cell. Read by
// shape, not color.
function drawSlides(ctx, p, L, pv, lineW) {
  if (!pv.slides || !pv.slides.length) return;
  const size = L.cellSize;
  const lift = layerLift(size);
  const centre = (c) => {
    const o = cellOrigin(L, c.col, c.row);
    const level = Math.max(0, pv.heights[c.row * L.cols + c.col] - 1);
    return { x: o.x + size / 2, y: o.y + size / 2 - level * lift };
  };
  ctx.save();
  ctx.strokeStyle = p.danger;
  ctx.fillStyle = p.danger;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  for (const s of pv.slides) {
    const a = centre(s.from);
    const b = centre(s.to);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const head = size * 0.22;
    ctx.setLineDash([size * 0.1, size * 0.08]);
    ctx.beginPath();
    ctx.moveTo(a.x + ux * size * 0.3, a.y + uy * size * 0.3);
    ctx.lineTo(b.x - ux * head, b.y - uy * head);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); // arrowhead
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * head - uy * head * 0.6, b.y - uy * head + ux * head * 0.6);
    ctx.lineTo(b.x - ux * head + uy * head * 0.6, b.y - uy * head - ux * head * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([size * 0.06, size * 0.06]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// Fold animation (render/fx.js). Each moving stack scales by cos(angle)
// across the crease (along its normal, so diagonals work the same way), so
// at angle π it is exactly mirrored onto its landing cell. It rises on an
// arc, floats, then settles onto the stack below; its shadow stays on the
// board. Shading by the angle sells the edge-on moment.
function drawFoldAnim(r, ctx) {
  const L = r.layout;
  const anim = r.fx && r.fx.foldAnim;
  if (!L || !anim || !anim.line) return;
  const p = r.palette;
  const f = anim.frame;
  const size = L.cellSize;
  const lift = layerLift(size);
  const c = f.cos;
  // p' = p + (c - 1)(n·p - o)n: squash across the line n·p = o (CSS px).
  const { nx, ny } = anim.line;
  const lineAt = anim.line.offset * size + nx * L.boardX + ny * L.boardY;
  const k = c - 1;
  const ta = 1 + k * nx * nx;
  const tb = k * nx * ny;
  const td = 1 + k * ny * ny;
  const te = -k * lineAt * nx;
  const tf = -k * lineAt * ny;
  const rise = f.arc * size * 0.6 + f.hover * lift * 2;
  const sheets = anim.sheets;

  // Shadows first, flat on the board under the flying sheet.
  ctx.fillStyle = p.shadow;
  ctx.globalAlpha = Math.min(1, f.arc + f.hover * 0.5);
  const off = rise * 0.25;
  for (let n = 0; n < sheets.length; n++) {
    const so = cellOrigin(L, sheets[n].col, sheets[n].row);
    ctx.save();
    ctx.translate(off, off);
    ctx.transform(ta, tb, tb, td, te, tf);
    ctx.fillRect(so.x, so.y, size, size);
    ctx.restore();
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
      ctx.translate(0, -up);
      ctx.transform(ta, tb, tb, td, te, tf);
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
  } else if (a.kind === 'flee') {
    const t = easeInOut(u); // a high, fast arc: it flies
    x = from.x + (to.x - from.x) * t;
    y = fromY + (toY - fromY) * t - Math.sin(Math.PI * u) * size * 0.6;
  } else if (a.kind === 'slide') {
    const t = easeInOut(u); // a flat glide: no hop
    x = from.x + (to.x - from.x) * t;
    y = fromY + (toY - fromY) * t;
  } else if (a.kind === 'bump') {
    const k = Math.sin(Math.PI * u) * 0.32; // lunge toward the target and back
    x = from.x + (to.x - from.x) * k;
    y = fromY + (to.y - from.y) * k;
  } else if (a.kind === 'hit') {
    drawHit(ctx, p, to.x, toY, size, u);
    return;
  } else if (a.kind === 'shoot') {
    drawDart(ctx, p, from.x + size / 2, fromY + size / 2, to.x + size / 2, toY + size / 2, size, easeInOut(u));
    return;
  } else if (a.kind === 'drop') {
    const t = easeInOut(u);
    const kx = from.x + (to.x - from.x) * t + size / 2;
    const ky = fromY + (toY - fromY) * t + size / 2 - Math.sin(Math.PI * u) * size * 0.25;
    drawKey(ctx, kx, ky, size * 0.5, p.accent, p.glyph);
    return;
  } else if (a.kind === 'spawn') {
    const t = easeInOut(u);
    x = from.x + (to.x - from.x) * t;
    y = fromY + (toY - fromY) * t - Math.sin(Math.PI * u) * size * 0.2;
    opts.alpha = Math.min(1, u * 2);
    opts.scale = 0.3 + 0.7 * t;
  } else if (a.kind === 'jaws') {
    opts.scale = 1 + Math.sin(Math.PI * u) * 0.12;
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

// A sting dart: a slim ink triangle flying from (x0, y0) to (x1, y1).
function drawDart(ctx, p, x0, y0, x1, y1, size, t) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const x = x0 + (x1 - x0) * t;
  const y = y0 + (y1 - y0) * t;
  const l = size * 0.22;
  const w = size * 0.06;
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.moveTo(x + ux * l * 0.5, y + uy * l * 0.5);
  ctx.lineTo(x - ux * l * 0.5 - uy * w, y - uy * l * 0.5 + ux * w);
  ctx.lineTo(x - ux * l * 0.5 + uy * w, y - uy * l * 0.5 - ux * w);
  ctx.closePath();
  ctx.fill();
}

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

// The crease line and its chevron. `style` overrides the color and dash
// (the Crane's telegraph); by default it reads the preview's validity.
function drawCrease(ctx, p, L, pv, lineW, style = null) {
  const ln = pv.line;
  if (!ln) return;
  const size = L.cellSize;
  const color = style ? style.color : pv.ok ? p.accent : p.danger;
  const dashed = style ? style.dashed : !pv.ok;
  const x0 = L.boardX + ln.x0 * size;
  const y0 = L.boardY + ln.y0 * size;
  const x1 = L.boardX + ln.x1 * size;
  const y1 = L.boardY + ln.y1 * size;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.setLineDash(dashed ? [lineW * 3, lineW * 2] : []); // invalid or telegraph: dashed
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  // Chevron on the folding side, pointing across the crease (along u).
  const s = size * 0.3;
  const dir = pv.fold.side === 'before' ? 1 : -1;
  const ux = ln.nx * dir;
  const uy = ln.ny * dir;
  const cx = (x0 + x1) / 2 - ux * s * 0.9;
  const cy = (y0 + y1) / 2 - uy * s * 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + ux * s * 0.5, cy + uy * s * 0.5);
  ctx.lineTo(cx - ux * s * 0.4 + uy * s * 0.6, cy - uy * s * 0.4 - ux * s * 0.6);
  ctx.lineTo(cx - ux * s * 0.4 - uy * s * 0.6, cy - uy * s * 0.4 + ux * s * 0.6);
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
  drawCarried(ctx, p, creature, x + gap, y + gap, size - gap * 2);
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
  if (c && c.id !== skip) {
    drawCreature(ctx, p, c, x + gap, y + gap, s, null);
    drawCarried(ctx, p, c, x + gap, y + gap, s);
    if (c.stuck > 0) drawTape(ctx, p, c.stuck, x + gap, y + gap, s);
  }
}

// Sticky Tape: a strip of tape across the creature's top corner, with the
// turns it stays stuck in a badge.
function drawTape(ctx, p, turns, x, y, s) {
  ctx.save();
  ctx.translate(x + s * 0.3, y + s * 0.22);
  ctx.rotate(-Math.PI / 4);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = p.tileEdge;
  ctx.fillRect(-s * 0.32, -s * 0.08, s * 0.64, s * 0.16);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(-s * 0.32, -s * 0.08, s * 0.64, s * 0.16);
  ctx.restore();
  badge(ctx, p, x + s * 0.82, y + s * 0.18, s * 0.14, String(turns), false);
}

// An item a creature holds (Lockjaw's key, core/creatures.js `carry`): a
// small copy of the item in the tile's bottom-left corner.
function drawCarried(ctx, p, creature, x, y, s) {
  if (creature.item === ITEM.KEY) drawKey(ctx, x + s * 0.2, y + s * 0.8, s * 0.32, p.accent, p.glyph);
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
