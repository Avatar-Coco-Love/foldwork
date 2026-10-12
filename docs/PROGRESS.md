# Foldwork — Progress Log

**Start every new conversation here.** One PR per conversation keeps context
small. At the end of each conversation, update this file in the same PR.

## Next up
**Phase 1b: Drag-to-fold input + live preview.** `src/ui/input.js`: Pointer
Events drag that snaps to a crease (`{axis, index, side}`, side = where the
drag starts), keyboard crease selection, cancel by dragging off-board or tapping
cancel. Preview draws `validateFold()` output (per-cell heights, red overflow
cells, clipped cells). Confirm calls `foldWithUndo()`; undo calls `unfold()`.

## Phase checklist
Larger phases are split into PR-sized chunks so each conversation stays small.

- [x] **Phase 0** — Scaffolding (PR 1)
- [ ] **Phase 1** — Board and folding core
  - [x] 1a Fold logic + tests (`core/fold.js`) (PR 2)
  - [ ] 1b Drag-to-fold input + live preview (pointer + keyboard, `ui/input.js`)
  - [ ] 1c Fold animation + reduced-motion / speed setting (`render/fx.js`)
- [ ] **Phase 2** — Player, turns, combat
  - [ ] 2a Turn engine + event list, player move/bump/wait/HP
  - [ ] 2b Scrap Mite AI, pin/strand/void-drop, event playback
- [ ] **Phase 3** — Puzzle tiles, floors 1–3, tutorial hints, solver v1
  - [ ] 3a Keys, locks, plates, exit tiles
  - [ ] 3b Solver v1 + floor templates F1–3 + hints
- [ ] **Phase 4** — Run structure, relics (12+), spirits
- [ ] **Phase 5** — Full enemy roster, floors 4–8
- [ ] **Phase 6** — Great Crane boss, run summary
- [ ] **Phase 7** — Meta-progression, daily seed, persistence
- [ ] **Phase 8** — Audio and polish
- [ ] **Phase 9** — Playtesting, balance, manifest

## Log

### PR 1: Phase 0 scaffolding
- Repo structure per `05-tech-architecture.md`; `index.html`, `css/style.css`.
- `core/rng.js`: mulberry32, plain-data state `{seed, state}`, label-based
  `fork()` streams (independent of draw order), weighted pick, shuffle,
  UTC daily seed string. Reference values locked in tests.
- `core/tiles.js` (data-driven tile defs), `core/board.js` (layer stacks,
  accessors, `cloneBoard`).
- `render/layout.js`: pure layout math (portrait HUD top/bottom, landscape side
  panel, left-handed option, safe-area insets, `cellAtPoint` for input).
- `render/renderer.js`: on-demand redraw, DPR capped at 2, draw-pass list,
  per-tile painters with distinct symbols (floor crease, wall hatch, void ring),
  stacked layers drawn offset.
- `render/palette.js`: Paper, Night Ink, High Contrast; tokens also exported to
  CSS variables so DOM and canvas share colors.
- `ui/router.js`, `ui/screens.js` (title + floor stub), `ui/hud.js`, `ui/dom.js`.
- `tests/run.js` harness; `npm test` (30 tests). `npm start` dev server.
- Verified with headless Chromium on phone/tablet (both orientations) and desktop.

### PR 2: Phase 1a fold logic
- `core/fold.js`: crease `{axis: 'v'|'h', index, side: 'before'|'after'}`.
  Geometry lives in the `AXES` table (`lineCount`, `onFoldingSide`, `mirror`),
  so a diagonal axis is a new entry.
- `mirrorCell`, `foldMapping`, `creaseErrors`, `validateFold` (→ `{ok, reasons,
  perCellHeights, moves}`), pure `applyFold`, `createUndoSnapshot` / `unfold` /
  `foldWithUndo`.
- Rules decided: moved stacks keep their internal order (no paper flip) and go
  on top of the destination. Clipped cells keep their stack on their own cell.
  Vacated cells are `layers: []`, which gameplay treats as void (Phase 2).
- `applyFold(board, fold, { resolve })` is the Phase 2 hook for pin, strand and
  void drop. It receives `landings: [{from, to, baseHeight, count}]`.
- 14 new tests (44 total).

## Conventions worth remembering
- Dev URL params: `?screen=floor&size=7&seed=abc&palette=night-ink&demo=1`.
- New draw layers → add a pass to `PASSES` in `renderer.js`.
- New tile types → `TILE`/`TILE_DEFS` in `tiles.js` + a painter in `renderer.js`.
- New screens → `ui/screens.js`, register in `main.js`.
- New random streams → `fork(runRng, 'label')`; never use `Math.random` in logic.
- Fold geometry → add an entry to `AXES` in `fold.js`; creature effects of a
  fold → `resolve` hook, not inside `applyFold`.
- HUD sizes live only in `HUD_METRICS` (layout.js); CSS reads them as variables.
