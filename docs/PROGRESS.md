# Foldwork — Progress Log

**Start every new conversation here.** One PR per conversation keeps context
small. At the end of each conversation, update this file in the same PR.

## Next up
**Phase 2a: Turn engine + event list, player move/bump/wait/HP.** `core/turn.js`
runs the player action and returns an event list; move the floor screen's
`{board, undo}` into it, add fold charges (undo refunds) and HP. The renderer
plays the events back (the fold event reuses `buildFoldAnim` + `fx.playFold`).
Add the one-action input buffer during animations (spec 04) here, since that
is when there are actions worth queueing.

## Phase checklist
Larger phases are split into PR-sized chunks so each conversation stays small.

- [x] **Phase 0** — Scaffolding (PR 1)
- [x] **Phase 1** — Board and folding core
  - [x] 1a Fold logic + tests (`core/fold.js`) (PR 2)
  - [x] 1b Drag-to-fold input + live preview (pointer + keyboard, `ui/input.js`) (PR 3)
  - [x] 1c Fold animation + reduced-motion / speed setting (`render/fx.js`) (PR 4)
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

### PR 3: Phase 1b drag-to-fold input + live preview
- `ui/foldGesture.js` (pure): the drag crease is the perpendicular bisector of
  the drag (paper-like), snapped and clamped to an interior line. The dominant
  direction picks the axis, and the start cell is always on the folding side.
  Drags under 0.5 cell are taps. Keyboard: `defaultCrease`, `stepCrease`.
- `ui/input.js` (DOM): Pointer Events with capture. Release confirms; dragging
  more than 0.6 cell off the board, right click, Esc or the HUD Cancel button
  (pointerdown, so a second finger works) aborts. Keyboard: F enters fold mode,
  arrows/WASD move the crease, F flips the side, Enter confirms, Esc cancels,
  U/Z undo. `setEnabled()` is ready for 1c animations.
- `render/preview.js` (pure): `buildFoldPreview` turns `validateFold` into
  typed arrays (leaving / landing / overflow / clipped + source cell). It is
  built per crease change, not per frame.
- `renderer.js` `drawFoldPreview` pass. Each state has a non-color cue:
  - leaving: dimmed with a dashed outline
  - landing: ghost of the incoming sheet plus a height badge
  - overflow: red outline, ✕ and an "!n" badge
  - clipped: dotted outline
  - crease: solid when valid, dashed when invalid, with a chevron on the
    folding side
- Empty (vacated) cells are painted as void.
- HUD: Undo Fold (only the latest fold), Cancel (only while previewing), and
  live fold status text. A CSS shake plays on an invalid release (off under
  reduced motion).
- The floor screen holds `{board, undo, preview}` for now; 2a moves it into the
  turn engine. There are no fold charges yet.
- 10 new tests (54 total). Verified in headless Chromium: phone touch drag,
  off-board cancel, undo button; desktop mouse drag, keyboard mode,
  invalid-release shake, right-click cancel, U undo. No console errors.

### PR 4: Phase 1c fold animation + motion settings
- `render/fx.js`: pure `buildFoldAnim(boardBefore, fold)` → `{fold, base,
  sheets}` (base = board minus moving stacks; each sheet lands on `to` above
  `baseHeight`), `foldFrame(u)` (angle 0→π over the first 75%, then a settle
  drop; writes into a reused object), `shakeOffset`, `foldDurationMs`
  (400ms / speed, 0 under reduced motion). `createFxPlayer` is the rAF driver;
  the renderer only paints `fx.foldAnim` / `fx.shake` (`renderer.setFx`).
- Renderer: `drawFoldAnim` scales each moving stack by cos(angle) around the
  crease (exact mirror at π), lifts it on an arc with a ground shadow, and
  shades it as it turns edge-on. `drawTiles` draws `anim.base` mid-fold. The
  shake translates every pass except the background. Under reduced motion the
  invalid cue is a static dashed outline instead of a shake.
- Logic never waits on animation: the board is already folded/unfolded when
  playback starts. Input is disabled during it and the Undo button greys out.
  Undo plays the same anim in reverse (from the undo snapshot).
- `ui/settings.js`: `foldwork.settings` (versioned, try/catch, per-field
  reset on bad data). Animation speed Slow/Normal/Fast (0.7/1/1.6×), reduced
  motion System/On/Off. Title screen cycles both until the Phase 7 settings
  screen. `html.reduce-motion` mirrors the setting for CSS. The CSS shake is
  gone.
- Dev URL params `?speed=` and `?motion=` override for the session only.
- 11 new tests (65 total). Verified in headless Chromium with a frozen clock
  (frame-by-frame), phone + desktop, keyboard and mouse folds, undo reverse,
  reduced-motion instant fold, settings persistence. No console errors.

## Conventions worth remembering
- Dev URL params: `?screen=floor&size=7&seed=abc&palette=night-ink&demo=1&speed=slow&motion=on`.
- New draw layers → add a pass to `PASSES` in `renderer.js`.
- New tile types → `TILE`/`TILE_DEFS` in `tiles.js` + a painter in `renderer.js`.
- New screens → `ui/screens.js`, register in `main.js`.
- New random streams → `fork(runRng, 'label')`; never use `Math.random` in logic.
- Fold geometry → add an entry to `AXES` in `fold.js`; creature effects of a
  fold → `resolve` hook, not inside `applyFold`.
- Fold preview visuals → `CELL` states in `render/preview.js` + `drawFoldPreview`.
- Animations: model + timing in `render/fx.js`, painting in a renderer pass
  reading `r.fx`; durations always go through `ctx.motion()` (speed + reduced
  motion), and logic state is final before playback starts.
- Settings: add fields to `DEFAULT_SETTINGS` + `normalizeSettings`.
- HUD sizes live only in `HUD_METRICS` (layout.js); CSS reads them as variables.
