# Foldwork — Progress Log

**Start every new conversation here.** One PR per conversation keeps context
small. At the end of each conversation, update this file in the same PR.

## Next up
**Phase 3a: keys, locks, plates, exit tiles.** Add the tiles to
`TILE`/`TILE_DEFS` (`core/tiles.js`) with painters, fill the `environment`
entry of `TURN_PHASES` (plates are pressed by any creature on the top layer,
docs/02), deliver keys by walking or folding onto a lock (the `landings`
captured in `runFold` / `resolveFold`), and add the win outcome (reach the
exit) next to defeat in `runOutcome` + a victory panel. Confirm the void-drop
reading in `docs/OPEN-QUESTIONS.md` first.

## Phase checklist
Larger phases are split into PR-sized chunks so each conversation stays small.

- [x] **Phase 0** — Scaffolding (PR 1)
- [x] **Phase 1** — Board and folding core
  - [x] 1a Fold logic + tests (`core/fold.js`) (PR 2)
  - [x] 1b Drag-to-fold input + live preview (pointer + keyboard, `ui/input.js`) (PR 3)
  - [x] 1c Fold animation + reduced-motion / speed setting (`render/fx.js`) (PR 4)
- [x] **Phase 2** — Player, turns, combat
  - [x] 2a Turn engine + event list, player move/bump/wait/HP (PR 5)
  - [x] 2b Scrap Mite AI, pin/strand/void-drop, event playback (PR 6)
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

### PR 5: Phase 2a turn engine + player
- `core/turn.js`: floor state `{board, turn, charges, maxCharges, status,
  outcome, undo}`. States are values: `act(state, action)` works on a copy
  and returns `{ok, state, events, reason}`. A rejected action (wall, edge,
  invalid fold, no charges) takes no turn and changes nothing.
- Actions live in the `ACTIONS` table (move, wait, fold), plus undo. After a
  turn-taking action, `TURN_PHASES` runs in order: `enemies` (2b) and
  `environment` (3a) are empty stubs, then `outcome`.
- The player is a creature on a layer (`core/creatures.js`, 3 HP), so folds
  carry it for free. Move is 1 orthogonal step and can climb stacks. Walking
  into a creature bumps it for 1 instead (`damageAt`; 0 HP removes it).
  Walking into a void tile or an empty cell is a fall, which is defeat.
- Fold charges: default 3, `?charges=` dev param. A fold costs 1. The undo
  snapshot is the whole prior state, so undo refunds the charge (and will also
  revert the enemy phase). It is only available until the next accepted
  action, and not after defeat.
- A player covered by a fold is "pinned": it can't move but can wait, fold,
  or undo (see open questions). The renderer shows covered creatures as a
  ghost with a paper clip on top of the stack.
- Events: move, bump, damage, death, fall, wait, fold, unfold, defeat. With
  `{snapshots: true}`, each event carries the board right after it.
- `render/playback.js`: pure `buildClips(startBoard, events, motion)` makes one
  clip per visible event, each showing the board before it. `createPlayback`
  sequences them on the fx player. `fx.playActor` adds creature clips (move
  hop, bump lunge, hit burst, death fade, fall spin) next to `playFold`.
  Reduced motion gives no clips, so the board just jumps.
- `render/creatures.js`: data-driven polygon shapes (`CREATURE_SHAPES`),
  shared painter, HP pips for multi-HP enemies. Unknown kinds get a labelled
  fallback token.
- Input: arrows/WASD move, Space waits, tap an adjacent tile to move or bump
  (`ui/moveInput.js`, pure). During playback, folds can't start
  (`input.setBusy`), but one tap or key is buffered (the latest wins) and runs
  when playback ends.
- HUD: hearts and charge icons (filled = left, hollow dashed = spent, plus
  aria labels), a message line for refusals, a Wait button (Cancel takes its
  place while previewing), and a defeat panel with Retry / Menu.
- 33 new tests (98 total). Verified in headless Chromium: desktop keyboard
  (moves, buffered move, fold, undo refund, charges running out), phone touch
  (tap moves, drag fold with the player riding the sheet, tap buffered during
  the fold, fall into a void → defeat → Retry), landscape + Night Ink +
  reduced motion. No console errors.

### PR 6: Phase 2b Scrap Mite, pin / strand / void drop
- Decided: the pinned-player rule stays, and a fold that causes defeat can't
  be undone. Empty cells are void for enemies too.
- `core/creatures.js`: `mite` def (team enemy, 1 HP, attack 1, ai 'chase'),
  `isEnemy`. `DIRS` and `isFooting` moved to `core/board.js` (`turn.js`
  re-exports `DIRS`).
- `core/enemies.js` (pure): AI only plans (`wait` / `move` / `bump`);
  `turn.js` applies the plan. `reachField` is a BFS from the player over
  footing cells (creatures don't block, stacks climb freely). The Mite takes
  a shortest step, closing the longer axis gap first, skips occupied cells,
  bumps only an unpinned player, and waits when stranded. `actingEnemies`
  gives the docs/02 order (row-major, pinned excluded). `ENEMY_AI` table for
  new behaviors. `scatterEnemies` is the seeded dev placement.
- `core/turn.js`: `createFloorState({ enemies })`; the `enemies` phase runs
  each enemy once and stops on defeat. `stepCreature` is the shared step
  (player and enemies; empty cell / void → `fall`). `fall` now clears a
  creature at any depth.
- Fold effects: `runFold` captures `landings`, emits `fold`, then
  `resolveFold(s, landings, emit)` pins whoever was covered (`pin` event), or
  void-drops them (`fall`) when the new top layer is a hole. Then it compares
  `enemiesInReach` before/after and emits `strand`. `coverEffect` is the
  shared pure rule.
- Preview: `EFFECT` per landing cell + `pv.player`. A pin shows a paper clip;
  a drop shows a dashed red outline and a "↓" badge. The HUD status warns
  when the fold pins or drops the player.
- `render/creatures.js`: Mite shape (squat hexagon, spiky legs, feelers).
  Enemy move/bump/fall reuse the existing clips; pin and strand have none
  (the board already shows the pinned ghost).
- Floor screen: dev floors scatter 2 Mites (`?mites=` param, `fork(seed,
  'enemies')`) at least 3 steps from the start.
- 24 new tests (122 total). Verified in headless Chromium: mites approach and
  double-bump to defeat, Retry, keyboard pin preview + confirm (pinned ghost
  with clip, mite stops acting), phone + Night Ink demo board. No console
  errors.

## Conventions worth remembering
- Dev URL params: `?screen=floor&size=7&seed=abc&palette=night-ink&demo=1&speed=slow&motion=on&charges=3&mites=2`.
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
- Player actions → `ACTIONS` in `turn.js`; per-turn systems → `TURN_PHASES`.
  Logic emits events; anything visible needs a case in `clipFor`
  (`render/playback.js`).
- Creature kinds → `CREATURE_DEFS` (`core/creatures.js`) + a shape in
  `CREATURE_SHAPES` (`render/creatures.js`). Damage goes through `damageAt`,
  falls through `fall`, steps through `stepCreature`.
- Enemy behaviors → `ENEMY_AI` in `core/enemies.js` (plans only, never
  mutates); name the key in the def's `ai`.
- Fold-time creature rules (pin, void drop) → `resolveFold` in `turn.js`;
  the per-cell rule is `coverEffect` (shared with the preview).
