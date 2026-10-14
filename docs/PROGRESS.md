# Foldwork — Progress Log

**Start every new conversation here.** One PR per conversation keeps context
small. At the end of each conversation, update this file in the same PR.

## Next up
**Phase 7d: daily seed mode** (same run on every device) and its title
row. Read docs/03 and docs/04 for the daily seed, OPEN-QUESTIONS
"Unlocks shop" (daily runs offer every relic, like challenge runs) and
the save-code notes in `core/saveCode.js` (daily seeds take a new code
version). Ask how a daily seed is named and whether a day allows one
attempt or many.

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
- [x] **Phase 3** — Puzzle tiles, floors 1–3, tutorial hints, solver v1
  - [x] 3a Keys, locks, plates, exit tiles (PR 7)
  - [x] 3b Solver v1 + floor templates F1–3 + hints + telemetry (PR 8)
- [x] **Phase 4** — Run structure, relics (12+), spirits
  - [x] 4a Run state, floor progression, relic hooks + fold relics (PR 9)
  - [x] 4b Relic offers screen, defense + utility relics (PR 10)
  - [x] 4c Spirits (Fox, Frog, Turtle) + spirit select, diagonal creases (PR 11)
- [x] **Phase 5** — Full enemy roster, floors 4–8
  - [x] 5a Paper Wasp + Card Brute, Wax Coat, F2/F3 templates (PR 12)
  - [x] 5b Creaseling + F4 templates (PR 13)
  - [x] 5c Lockjaw + Spore Bloom, F6/F7 templates (PR 14)
  - [x] 5d Floors 5 and 8 (mixes) (PR 15)
- [x] **Playtest round 1** — fixes from the first playtests (user's
  priority, before 6b; decisions in OPEN-QUESTIONS "Playtest round 1")
  - [x] P1 Save and continue runs, Share button on the title (PR 19)
  - [x] P2 Restart Floor, Hint button (nudge, next step, can't-win notice) (PR 20)
  - [x] P3 Menus: title with icon corners (Share, Back to Projects),
    Settings screen (options move off the title), pause menu from the HUD,
    share-sheet fix (OPEN-QUESTIONS "Menu redesign") (PR 21)
  - [x] P3 follow-up: phone/browser Back button = in-game Back (PR 22)
  - [x] P4a Fold history: numbered crease marks, optional tap-to-confirm
    folds (a Settings row) (PR 23)
  - [x] P4b Fold history: list (pause menu) with peek and rewind (PR 24)
  - [x] P5 Lockjaw bite warning + tip rewrite; HP economy (rest heals 2,
    +1 HP for a floor cleared without damage); re-prove every floor (PR 25)
  - [x] P6 Save code (move a run between devices, in Settings > Data),
    Challenge-a-friend link (PR 26)
- [x] **Phase 6** — Great Crane boss, run summary
  - [x] 6a Great Crane phase 1, telegraphed crease, floor 9 arena
    - [x] core rules: crane def, aimed strip crease, swat, drop, flee (PR 17)
    - [x] arena template, stored-line proof, run to floor 9, telegraph render (PR 18)
  - [x] 6b Crane phases 2–3 (minions, double creases, shrinking arena) (PR 27)
  - [x] 6c Run summary and win/lose flow through the boss (PR 28)
- [ ] **Phase 7** — Meta-progression, daily seed, persistence
  - [x] 7a Paper scraps: earned per run, shown on the summary, banked in
    meta (PR 29)
  - [x] 7b Unlocks shop: relics, spirits (Frog, Turtle), palettes; title
    Unlocks row (PR 30)
  - [x] 7c Remaining relics (9, to 24 total) with rarities and unlock
    flags (PR 31)
  - [ ] 7d Daily seed mode (same run on every device) + title row
  - [ ] 7e Stats & History screen; Settings > Data Reset progress;
    unlock/daily telemetry
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

### PR 7: Phase 3a keys, locks, plates, gates, exit
- Open questions settled (see `docs/OPEN-QUESTIONS.md`): void-drop reading
  confirmed; touch swipe-to-move dropped (docs/04 updated); diagonal crease
  rule set for Phase 4.
- `core/tiles.js`: new tiles `lock`, `door` (an unlocked lock), `plate`,
  `gate`, `gate-open`, `exit`, with data flags (`unlocksTo`, `plate`,
  `powered`/`unpowered`, `exit`). Keys are items (`ITEM`/`ITEM_DEFS`) on
  `layer.item`. Plates and gates carry `layer.link`.
- `core/environment.js` (pure): `pressedLinks`, `syncGates` (gates at any
  depth follow their link, can't close on a creature), `keyMeetsLock`,
  `unlockLayer`.
- `core/turn.js`: `FloorState.keys`. Move picks up keys, opens a lock with
  a key and steps in (no key: refused as `locked`, no turn), refuses a shut
  gate as `gate-closed`, and wins at once on an exit. `resolveFold` opens a
  lock when a fold stacks it directly with a key (either order). The
  `environment` phase runs `syncGates`. `runOutcome` also checks the exit.
  New events: `pickup`, `unlock`, `gate`, `victory`.
- `core/maps.js`: `parseMap(rows)` for ASCII layouts (legend in the file)
  and `DEV_MAPS` (`sandbox`, `courier`). New Run now plays the sandbox;
  `?map=` picks a map, `?size=`/`?demo=1` still give the old open board.
- Preview: `unlock` / `unlocks` per landing; the board shows a key badge
  and the HUD says "Ready: opens a lock".
- Renderer: painters get the layer; padlock, open-shackle door, plate
  (raised / pressed with a dashed rim), barred gate / retracted bars,
  stairs exit, key item, and link marks (dot, triangle, square) on plates
  and gates. New `glyph` palette token: ink that reads on tile faces in
  every palette.
- HUD: key counter (hidden at 0); `notify(text, { info })` so environment
  notes aren't shown as refusals; victory panel (Play again / Menu).
- 14 new tests (136 total), including both dev maps being winnable.
  Verified in headless Chromium: phone portrait, desktop (Paper, Night
  Ink, High Contrast), key route to victory by keyboard, plate opening the
  gate, mouse drag fold delivering the key on `?map=courier`. No console
  errors.

### PR 8: Phase 3b solver, floor templates, hints, telemetry
- `core/solver.js`: BFS over `act()` (states are values), deduped by
  `stateKey` (board, keys, charges; not turn or undo). Returns the
  shortest line plus `explored` / `capped`. `noFolds` checks a floor needs
  folding. `cloneBoard` is now a hand copy instead of structuredClone
  (~6× faster; it was 80% of solver time). Layer fields must stay
  primitives, plus a flat `creature`.
- `core/replay.js`: compact action codes (`u d l r w z`, folds `fh3a`) and
  `replay()`. The basis for telemetry analysis now and saves in Phase 7.
- `core/maps.js`: `?` enemy anchors, `under` grids (layers beneath the
  visible row, so maps can start stacked), `MAP_TRANSFORMS` (id, flipH,
  flipV, rot180).
- `core/floors.js`: data templates (`rows`, `under`, `transforms`, `vary`,
  `enemies` on anchors, `charges`, `needs`, `hints`). F1 `f1-bridge`
  (bridge the void), F2 `f2-plate` (thick exit + gate: hold the plate), F3
  `f3-vault` (bridge, key, lock in a thick wall) and `f3-ferry` (fold the
  key across the void). `generateFloor(n, seed)` is seeded per floor.
  Validation: tests enumerate every variant (18 now) and prove each
  solvable and each `needs` essential (the "precomputed" route, so floor
  start is instant); `checkAtRuntime` templates solve + reroll + fall back.
  Par lines today: F1 2 turns, F2 6, F3 8 or 16–17, 1–2 folds.
- Mite tuning settled (no stat change; see OPEN-QUESTIONS). docs/03 also
  introduces the Paper Wasp (F2) and Card Brute (F3); they arrive with the
  Phase 5 roster, and their templates get added then.
- `core/hints.js` + `ui/hintStore.js`: 10 hints with triggers (`start`,
  `event:<type>` with `who`, `refuse:<reason>`), shown once per player as a
  non-blocking HUD card ("Got it"); newer triggers replace the card. New
  How to Play screen lists them all and can re-arm them.
- Floor screen: plays template floors (dev `?map=`, `?size=`, `?demo=1`
  still work; `?floor=` picks the floor). Win → Next floor; after F3 a
  Run complete panel. New Run picks a fresh seed (unless `?seed=`).
- Telemetry (`docs/07-telemetry.md`): fixed envelope + opaque `data`, so
  the backend never changes for new events. Persisted offline queue,
  batches, `sendBeacon` on page hide, error capture, input source per
  action. `floor.end` carries the full action log, so any later question
  is a replay (`tools/replay-check.js` verifies logs replay identically).
  `tools/telemetry-collector.js` is a zero-dependency reference backend.
  `src/config.js` holds the endpoint (empty: nothing is sent), versions.
  Title screen toggle "Share play data" (setting `telemetry`).
- 32 new tests (168 total; ~14 s, mostly the template proofs). Verified in
  headless Chromium: floors 1→3 won by keyboard on desktop via the solver
  lines, events landing in the local collector and all 6 logged floors
  replaying identically; phone portrait touch fold on F2 with hint cards;
  How to Play. No console errors.

### PR 9: Phase 4a run state, relic hooks, fold relics
- `core/run.js`: plain-data `RunState` (seed, floor, lastFloor, hp/maxHp,
  relics, cleared, status, cause). `createRun`, `addRelic`,
  `floorSetupFor(run, setup)`, `finishFloor(run, floorState)`, `runTag`.
  `runLength()` = templated floors, capped at 8 (3 until Phase 5).
- `core/relics.js`: `RELIC_DEFS` with hooks `gain(run)`, `setup(setup)`,
  `rules(rules)`; `applyRelics`, `rulesFor`. Fold relics: Extra Crease,
  Thick Paper, Recycled Crease, Spring Crease (provisional rarities).
- `core/turn.js`: `FloorState.rules` (`DEFAULT_RULES`: `undoDepth`,
  `foldRefund`) is the hook point relics write to. Undo can chain back
  `undoDepth` consecutive folds; `refund` event. `createFloorState` takes
  `hp` and `maxHp` separately (HP carries between floors).
- Floor screen: run floors use the run's relics + HP; win → next floor
  (HP shown), last floor → Run complete; defeat ends the run (no retry);
  Menu mid-floor ends it as abandoned. Dev floors keep Retry / Play again.
  HUD: `Floor n/N` and a relic tray (glyph chips, tooltip + aria label).
  Dev `?relics=id,id|all`; `?screen=floor&floor=n` starts the run there.
- Telemetry: **collection is off** (`TELEMETRY.collect: false`): nothing
  recorded, queued or stored, "Share play data" hidden; `?telemetry=console`
  and a localhost collector still work. Floor tag gains `loadout`;
  `run.start`/`run.end` carry the run tag (won / lost / abandoned).
  `tools/telemetry-sheets/Code.gs`: Google Sheets + Apps Script collector
  (setup in docs/07); `tools/sheet-to-ndjson.js` reads its CSV export and
  `replay-check` accepts `.csv` and replays with the loadout.
- Art alignment: size/alignment guide for creature art (bounds, centring,
  foot line, size classes) in docs/04, enforced by
  `tests/creatures.test.js`; player figure rescaled to the foot line; exit
  stairs, key and gate bars centred. Remaining items (stack lift into the
  row above, landscape board margins) are logged for the Phase 8 audit.
- 20 new tests (188 total). Verified in headless Chromium: phone run with
  all relics (tray, Floor 2/3, +1 charge), F3 and desktop courier art,
  run loss → Torn → New run with one run.end; no storage writes besides
  hints with telemetry off. No console errors.

### PR 10: Phase 4b relic offers, defense + utility relics
- `core/run.js`: `rollOffer(run, floor)` (seeded `fork(seed,
  'offers-<n>')`, `RARITY_WEIGHTS` common 6 / uncommon 3 / rare 1, no
  owned relics, no repeats, `rest` after floors 4 and 7), `takeOffer(run,
  choice)` (relic id, `'rest'` heals 1, null only when nothing is offered;
  anything else is refused). `finishFloor` runs `cleared` hooks and sets
  `run.offer` on every win but the last. Run also carries `landings`
  (Soft Landing). `RUN_VERSION` 2.
- `core/relics.js`: new hooks `cleared(run)` and `offer({count})`. 9 new
  relics, 13 in all: Paper Heart, Laminate, Soft Landing, Folded Shield,
  Mender (defense); Master Key, Paper Cut, Heavy Stamp, Origami Luck
  (utility). Rarities provisional (OPEN-QUESTIONS).
- `core/turn.js`: `DEFAULT_RULES` gains `wards`, `foldGuard`, `freeLocks`,
  `stackBump`, `plateHold`. `FloorState.uses` holds limited effects
  (`wards`, `freeLocks`, `landings`, `guard`); undo restores it. Hits on
  the player go through `blockHit` (guard, then ward; `block` event).
  `stepCreature` catches a player's fall with a landing (`catch` event,
  1 unblockable damage) and returns false when the player stayed put.
  Master Key unlocks emit `unlock` with `by: 'master-key'`.
- `core/environment.js`: `tickPlates(board, turns)` after `syncGates`;
  a plate's `layer.hold` keeps it pressed (Heavy Stamp). The solver's
  `stateKey` includes `uses` and plate holds.
- Offer screen (`offerScreen`, route `offer`): replaces the "Next floor"
  panel. One card per relic (glyph, name, rarity and group written out,
  text; rarity also in the border style: solid / double / accent ring),
  dashed Rest card, number keys 1–4, 44px+ targets, Menu abandons the run.
  Dev: `?screen=offer&cleared=4` (rest shows on 4 and 7).
- HUD notes for block, catch and Master Key; `catch` plays a lunge clip.
- Telemetry: `relic.offer` / `relic.pick` (docs/07); floor `loadout` gains
  `landings`. Collection still off.
- 17 new tests (205 total). Verified in headless Chromium: desktop run
  F1→F3 by keyboard with offers picked by number key (cards match the
  seeded roll, tray grows, Run complete), phone portrait Night Ink offer
  with Rest (tap → next floor), phone landscape High Contrast with Origami
  Luck (5 cards). No console errors.

### PR 11: Phase 4c spirits, spirit select, diagonal creases
- `core/spirits.js`: `SPIRIT_DEFS` (Fox 3 HP +1 charge per floor, Frog 2 HP
  diagonal creases, Turtle 4 HP undo 2 folds). Same hook points as relics
  (`gain`, `setup`, `rules`) plus `hp` and `covers` (relics the perk
  already gives; `rollOffer` leaves them out). `createRun({ spirit })`
  takes its HP; `floorSetupFor` runs the spirit's hooks before the
  relics'. `spirit: null` (dev runs, tests) keeps 3 HP and no perk.
- Diagonal creases (`core/fold.js`): `AXES.d` (col - row = k, "\\") and
  `AXES.a` (col + row = k, `/`), through cell centres; cells on the line
  are the hinge. AXES entries gained `normal`, `offset` and `diagonal`, so
  input and rendering work for any axis; `isDiagonal`, `axesFor`. Gated by
  `DEFAULT_RULES.diagonal`: `foldCheck` refuses with `no-diagonal`, the
  solver only tries diagonals when the floor allows them. Replay codes
  `fd4b`, `fa3a`. New relic Diagonal Crease (uncommon; 14 relics).
- Input: a drag within 22.5° of 45° gives a diagonal crease when unlocked
  (`creaseFromDrag(…, { diagonal })`, same bisector + snap model).
  Keyboard: R turns the crease v → h → d → a, arrows push it along its
  normal. `createFoldInput({ foldOptions })`.
- Rendering: `creaseSegment` (preview.js, pure) clips any crease to the
  board; preview and fold anim carry it as `line`. `drawCrease` and
  `drawFoldAnim` now squash along the crease normal with one affine
  transform, so diagonal folds animate like the others.
- Spirit select screen (`spiritScreen`, route `spirit`): New Run → pick
  (cards with HP written out + hearts, perk, number keys 1–3, Esc/Back)
  → floor 1. The HUD tray shows the spirit chip first. Dev `?spirit=`.
- Telemetry: `spirit.pick`; floor `loadout` gains `spirit` (replays rebuild
  the perk). Collection still off.
- 14 new tests (219 total). Verified in headless Chromium: desktop New Run
  → Frog by key, keyboard R through both diagonals, mouse diagonal drag
  preview, mid-fold frame and landing bridging the void, undo; phone
  portrait spirit select tap → Turtle (4 hearts, tray chip). No console
  errors.

### PR 12: Phase 5a Paper Wasp, Card Brute, Wax Coat
- Decided (OPEN-QUESTIONS): the Brute is **Heavy**. A fold can't land on
  its cell (refused, no turn or charge) unless the landing stack's top is
  a hole, which drops it. Also logged: Brute pace, Wasp line of fire,
  Wax Coat order, mixed-kind template variants. docs/02 and docs/03
  updated to match.
- `core/creatures.js`: `wasp` (1 HP, ai `sting`, `range` 4, `fixed`) and
  `brute` (3 HP, ai `chase`, `pace` 2, `heavy`). New def flags: `pace`
  (instances count down `rest`; starts at pace - 1, so a Brute rests
  first), `heavy`, `range`, `fixed` (never stranded). `isHeavy`.
- `core/fold.js`: `validateFold` adds `{ code: 'heavy', col, row, kind }`,
  so the preview, `act()` and the solver all refuse it.
  `coverEffect` returns `'heavy'` there (no pin cue).
- `core/enemies.js`: `sightLanes(board, from, range)` (pure, shared with
  the renderer) and the `sting` AI (plan `shoot`). `enemiesInReach` skips
  fixed enemies.
- `core/turn.js`: the enemy phase handles `pace` / `rest` and `shoot`
  (event `shoot`, then damage through `damageAt`). New rule `waxCoat`:
  a sting on the player emits `block` with `by: 'wax'` before guard or
  ward. The solver's `stateKey` includes `rest`.
- Relic Wax Coat (defense, common; 15 relics). Map symbols `W` and `B`.
- Templates: `f2-wasp` (the F2 plate shell with a Wasp on 3 anchors:
  shortest line 6 turns with 1 sting; a 2-fold line takes none) and
  `f3-brute` (the one-fold bridge would land on the Brute, so it takes
  two folds; 9 turns). Tests prove every variant has a no-damage line.
  Variants with several enemy groups now split anchors per group
  (`anchorAssignments`); rolls are listed per group, ascending.
- Hints `wasp-sting`, `brute-heavy`. HUD: "Too heavy: a Card Brute can't
  be pinned", Wax Coat note.
- Render: Wasp (swept wings, striped stinger) and Brute (boxy golem, full
  height) shapes; a "z" on a resting creature; `drawSightLanes` pass
  (dashed lane plus end bar, cached per board); `CELL.HEAVY` preview
  (cross plus "!" badge); `shoot` clip (a dart flies to the target).
- 16 new tests (235 total, ~17 s). Verified in headless Chromium: phone
  portrait F2 Wasp with lanes and hint card, desktop F3 Brute with the
  rest marker and the Heavy preview refusal. No console errors.

### PR 13: Phase 5b Creaseling, F4 templates
- Decided with the user (OPEN-QUESTIONS): after the player folds, the
  Creaseling slides **instead of** stepping, in its enemy-phase slot, up
  to 3 tiles in its own lane **parallel to the crease** (diagonals too),
  toward the player. It stops before anything that isn't free footing,
  any creature and the player's cell, and **never hits**. Level with the
  player, or blocked at once, it steps like a Mite. The fold preview shows
  each slide. Also logged: stranded still slides, pinned doesn't, riding
  the fold slides from where it lands.
- `core/creatures.js`: `creaseling` (2 HP, ai `creep`, new def flag
  `slide: 3`). Map symbol `C`.
- `core/enemies.js`: `slidePath(board, from, fold, target, max)` (pure;
  the lane comes from the crease's `AXES` normal, so a new axis needs no
  change here) and the `creep` AI (plan `slide` with `path`, else
  `planChase`). Plan ctx gains `fold`.
- `core/turn.js`: `TURN_PHASES` get a third argument `{ action }` (the
  player's action this turn); the enemy phase passes the fold to the AI
  and applies `slide` plans (event `slide` with `from`, `to`, `path`).
- Templates (6x6, 2 charges, needs fold + key + plate): `f4-relay`
  (thick exit row `E L a 1`: key across the void, hold the plate, slip
  through the gate, unlock; 9–10 turns, 1–2 folds) and `f4-gatehouse`
  (`E a 1 L`: the plate is behind the lock, so key first; 18–20 turns).
  Each has a no-damage line on every variant. The solver found two
  cheeses while designing (thick exit cells folded onto emptied cells, or
  a mirrored E/L pair); both layouts keep the exit on the player's side
  with 2 charges. `runLength()` is now 4, so F4 ends the run (no offer,
  so no rest yet).
- Hint `creaseling-slide`. Render: Creaseling shape (pleated zigzag body,
  ink crease, folded tip head; medium), `slide` clip (a flat glide, 240
  ms), preview pass `drawSlides` (dashed arrow plus a dashed ring at the
  landing cell, at the post-fold stack height). `slidePreview(state,
  fold)` (render/preview.js) plays the real turn with `act()` and keeps
  the slide events, so the preview is exact; `foldPreview` in screens.js
  attaches it as `pv.slides`.
- 13 new tests (248 total). Suite time is now ~31 s (was ~17 s): most
  of it is the F4 proofs and their no-damage checks. Verified in headless
  Chromium: desktop F4 gatehouse (keyboard crease, slide arrow, hint card),
  phone portrait Night Ink F4 relay (the Creaseling rides a fold then
  slides; a pinning fold shows no arrow). No console errors.

### PR 14: Phase 5c Lockjaw, Spore Bloom, F6/F7 templates
- Settled with the user first (OPEN-QUESTIONS): `runLength()` stops at
  the first floor without a template (still 4: F5 is missing; dev
  `?floor=6` / `7` plays them outside the run); a Lockjaw that falls
  drops its key on the nearest free footing; a Bloom with no walkable
  path to the player (or pinned) doesn't count down; spawns go to the
  free neighbour closest to the player, ties in DIRS order.
- `core/creatures.js`: `lockjaw` (2 HP, ai `guard`, `fixed`, new def flag
  `carry: 'key'` → instance `item`) and `bloom` (2 HP, ai `spore`,
  `fixed`, new def flag `spawn: { kind: 'mite', every: 3 }` → instance
  counter `sprout`). Map symbols `J`, `S`.
- `core/enemies.js`: `guard` AI (bump an orthogonal neighbour), `spore`
  AI with `spawnSpot(board, from, field)` (pure) and `pendingSpawns`
  (the cells Blooms fill this turn; the renderer marks them).
- `core/turn.js`: the enemy phase ticks `sprout` (paused while stranded)
  and applies `spawn` plans (event `spawn`; spawns are named
  `${bloomId}-t${turn}` and act from the next turn). Carriers drop their
  item on death or fall (`dropItem`, `nearestFreeFooting`; event `drop`
  with `from`, `at`). A fold that stacks a carried key and a lock opens it
  (`holdsKey` / `spendKey` in environment.js). `createFloorState` enemies
  take `item` (null strips a carried key; `NEEDS.key` uses it).
- Solver: `stateKey` now keys creatures by kind (ids don't change what
  happens next, and spawn ids hold the turn), includes `item` and
  `sprout`, and is built as one short string. The search skips a state
  reached again with no more player HP (dominance), and `act()` rejects
  unplayable folds before copying the state (`ACTIONS.fold.check`).
- Templates (7x7): `f6-drop` (fold the void row up onto the Lockjaw; its
  key pops out), `f6-twin` (two locks, two Lockjaws, one bridging fold
  drops both; 14 turns), `f7-pocket` (start beside a Bloom; the quick
  bridge takes a bite, a row-6-onto-row-5 fold first then a second fold
  gets you clear; `needs` only `fold`, see OPEN-QUESTIONS). Every
  variant has a no-damage line; that check now lives in the template
  proof test and skips the extra search when the shortest line took no
  hit.
- Hints `lockjaw-guard`, `bloom-spawn`. Render: Lockjaw (jaw with
  teeth) and Spore Bloom (paper flower in a cup) shapes, a carried-key
  badge at the creature's feet, a countdown ring on the Bloom (solid at 1),
  pass `drawSpawnMarks` (dashed ring plus cross where the next Mite
  sprouts), clips `spawn` (pops out of the Bloom) and `drop` (the key
  hops out).
- 12 new tests in `tests/guards.test.js` (259 total). Suite time ~53 s
  (was ~31 s): the F6/F7 proofs. Verified in headless Chromium: desktop
  F6 drop fold by mouse drag (drop arrow in the preview, key on the
  nearest tile after), phone portrait F7 in Paper and Night Ink
  (countdown, spawn ring, hint card). No console errors.

### PR 15: Phase 5d Floors 5 and 8
- New need `pin` (`NEEDS` in floors.js): with no hit to spare (HP 1) and
  no fold that pins, strands or void-drops an enemy, the floor can't be
  won. That's how F5 proves "pinning and stranding as the intended
  solution". Solver option `noPins` skips such folds; `isPinEvent`
  (solver.js) is the shared test.
- Templates (designed with a throwaway random-layout search that used the
  solver as the judge; not committed):
  - `f5-sweep` (6x6, 2 charges): one fold of row 4 onto row 5 pins the
    Wasp watching the bottom row and strands the Creaseling; then bridge.
  - `f5-press` (6x6, 3 charges): Mite, Creaseling, Wasp and Brute; one
    fold pins both row-mates, and the doubled paper you ride stands taller
    than the Wasp, so it can't see you.
  - `f8-crossing` (7x7, 2 charges, fold + key + plate): F4's thick exit
    row (`E L a 1`) across the void; Mite, Wasp, Creaseling. The shortest
    line takes two hits; the clean one is 20 turns.
  - `f8-jaws` (same exit row): two Lockjaws, a Creaseling and a loose key;
    pin the near Lockjaw under the fold that becomes your bridge.
  Every variant is proven solvable, needing what it lists, with a
  no-damage line. `runLength()` is now 8: a full run is F1–F8 (rest after
  F4 and F7).
- Hints `fold-enemies` (F5/F8 start) and `strand` (on a strand event).
- Fixed a 5c regression: `drawRest` (the Brute's "z") was deleted, so any
  floor with a resting Brute threw while drawing. A new test paints every
  creature kind with its markers on a stub canvas.
- The Frog proof in `spirits.test.js` now searches straight folds at the
  Frog's HP (a subset of its moves) except on floor 1: diagonal search on
  7x7 floors ran past 40000 states.
- 6 new tests (265 total). Suite ~90 s here (baseline before this PR
  ~67 s on the same container; PR 14 noted ~53 s elsewhere). Most of the
  increase is `f8-jaws` (~10 s) and `f8-crossing` (~6 s). Verified in
  headless Chromium: phone and desktop F5/F8 in Paper and Night Ink,
  mouse-drag fold on `f5-sweep` (pin preview, Wasp pinned, Pinned hint).
  No console errors.

### PR 16: Share image (link preview)
- `share.png` (1200x630) + og/twitter meta tags in `index.html`, so a
  shared link shows a card. It's the one raster file in the repo: og:image
  can't be drawn at runtime. The game never loads it (rule 1 still holds
  for play). It's drawn in code by `tools/share-image.html` from the
  game's palette and creature shapes; `node tools/share-image.js`
  (Playwright, dev server running) regenerates it.
- Foldwork card added to the projects page (avatar-coco-love.github.io).

### PR 17: Phase 6a (part 1) Great Crane core rules
- Settled with the user (OPEN-QUESTIONS "Great Crane core rules"). The
  first draft (always ride its own half, perch on phase loss) was trivial
  in the solver: its first fold collapsed the arena. The user took the
  fix: strip creases and flee after every hit.
- `core/boss.js` (pure): `chooseCrease` (aimed strip crease), `planCrane`
  (ai `crane`: plan `mark` or `crease`), `markCode` / `markFold` (the
  mark is a primitive string on the creature, e.g. `h3a`), `phaseOf`,
  `fleeSpot`, `isBoss`.
- `core/creatures.js`: `crane` (6 HP, `fixed`, def flag `boss: { phases,
  drop }`). Map symbol `G`. Solver `stateKey` includes `mark`.
- `core/turn.js`: enemy phase applies `mark` (event `mark`) and `crease`
  (`bossFold`: fizzle when invalid, else the fold with `by`, then
  `resolveFold(..., { swat })`). `swatPlayer`, `flee` (event `flee`),
  `bossDrop` (a boss `fall` deals `boss.drop`); a boss death wins the
  floor (`victory` cause `boss`). A pinned boss loses its mark.
- Render: Crane shape (large origami crane), `flee` clip (high arc),
  `swat` reuses the move clip; HUD notes for swat, fizzle and flee. The
  Crane isn't on any floor yet.
- 10 new tests in `tests/boss.test.js`.

### PR 18: Phase 6a (part 2) floor 9 arena, Crane on screen
- Rule change (user's choice, OPEN-QUESTIONS "Great Crane bumps"): the
  draft arena was winnable with no folds, even at 1 HP. Now a bump only
  startles the Crane (def `boss.bump: 0`, `startle` in turn.js); only void
  drops hurt it. Also: a fold that wins the floor stops resolving (no
  "won" floor with the player dropped). `LOGIC_VERSION` 2.
- `f9-crane` template (7x7, 6 charges, `needs: ['fold']`, no exit) with
  a stored `line` field: `checkFloor` replays it instead of solving
  (`replayLine`). Tests: line wins at 1 HP, a broken line fails, no-fold
  search can't win. Run and Frog tests use the line for that floor.
- `BOSS_FLOOR` (9): `runLength()` runs to it, so runs end on the boss;
  `runPanel` has a boss win panel (6c does the full summary).
- Telegraph: `bossMarks`, `bossIds` (boss.js), `buildTelegraph` and
  `bossForecast` (preview.js); renderer pass `drawTelegraph` (dashed
  line + chevron, hatched landing cells, "!" on a covered player, grey if
  it would fizzle; faded under the player's own preview). The fold status
  adds what the Crane's fold will then do (swat / fizzle / miss / pinned /
  dropped). Hints `crane-telegraph`, `crane-swat`.
- Checked in headless Chromium, phone (390x844) and desktop (1280x800).

### PR 19: Playtest P1 save and continue, Share button
- Playtest feedback round 1 (OPEN-QUESTIONS "Playtest round 1"): the
  user's plan is P1 to P5 in the checklist, before Phase 6b.
- `core/save.js` (pure): `Save = { v, logic, at, runId, run, floor }`,
  where `floor` is `{ floor, templateId, variant, actions }`: how the
  floor was built plus its accepted action codes, not a board. Small at
  any floor length. `parseSave` rejects other save/run versions and
  finished runs. `resumeFloor` replays the log when the floor still
  matches (same floor, template, variant, `LOGIC_VERSION`) and it leaves
  the floor in play; otherwise the floor starts over (the run is kept,
  notice "This floor changed in an update").
- `ui/saveStore.js`: one save under `foldwork.run` (docs/05), every access
  guarded; blocked storage keeps it in memory for the session.
- Saved after every accepted action, at floor start, and between floors
  (run with its relic offer). A finished floor is settled into the run
  the moment the action lands (`persist` in the floor screen), so closing
  the tab mid-animation can't undo a defeat. Run over: save cleared.
- Menu mid-floor or on the relic offer keeps the run. Title: **Continue
  Run** (with "Floor 4 of 9 · Fox · 2/3 HP · 1 relic") goes back to the
  floor (replayed) or the offer. **New Run** with a save asks first
  ("Keep my run" / "Start new run"); the old run ends only when a spirit
  is picked, so Back from spirit select keeps it.
- Runs started with dev URL params (`DEV_RUN_PARAMS` in main.js) never
  save or clear the save.
- `ui/share.js`: **Share Foldwork** on the title opens the share sheet
  (`navigator.share`), else copies the link ("Link copied!"), else shows
  it in a box. The link is index.html's `og:url`.
- Title menu scrolls on short screens (phone landscape).
- Telemetry (docs/07): `run.resume`, `share`; floor.end outcome `left`;
  `resumedFrom` on floor.start/end, which `tools/replay-check.js`
  replays first.
- 11 new tests (291 total). Checked in headless Chromium (phone): play,
  Menu, reload, Continue to the same board; win, Menu on the offer,
  Continue to the offer; New Run confirm, Keep, Back; defeat clears the
  save at once; Share copies the link; landscape title scrolls. No
  console errors.

## Conventions worth remembering
- Dev URL params: `?screen=offer&cleared=4`, `?spirit=frog`, `?screen=floor&floor=2&map=courier&size=7&seed=abc&palette=night-ink&demo=1&speed=slow&motion=on&charges=3&mites=2&relics=all&telemetry=console`.
- New draw layers → add a pass to `PASSES` in `renderer.js`.
- New tile types → `TILE`/`TILE_DEFS` in `tiles.js` + a painter in
  `TILE_PAINTERS` (`renderer.js`; painters get the layer). Items →
  `ITEM_DEFS` + `ITEM_PAINTERS`. Glyphs on tile faces use the `glyph` token.
- Environment rules (plates, gates, locks) → `core/environment.js`, run
  from the `environment` turn phase; fold-time tile rules go in
  `resolveFold` next to the creature rules.
- Anything a floor needs to rebuild after Continue must come from the
  run seed, the template + variant, or the action log (`core/save.js`).
  New action types need a code in `core/replay.js`, or saves lose them.
- Hand-made layouts → `parseMap` rows (`core/maps.js`); new symbols go in
  `MAP_LEGEND`.
- Floors → a template in `FLOOR_TEMPLATES` (`core/floors.js`). `npm test`
  proves every variant; keep `vary` cells and anchors few. List what it
  teaches in `needs` (add a check to `NEEDS` for a new tool). Use thick
  (3-high) stacks to stop folds from bypassing the lesson.
- Tutorial hints → `HINTS` (`core/hints.js`) + the template's `hints`.
- Telemetry → `ctx.telemetry.track(type, data)`; never change the backend.
  Collection is gated by `TELEMETRY.collect` in `src/config.js`.
- Spirits → `SPIRIT_DEFS` in `core/spirits.js` (hooks `gain`, `setup`,
  `rules`; `covers` hides redundant relics from offers).
- Relics → `RELIC_DEFS` in `core/relics.js` (hooks `gain`, `setup`,
  `rules`, `cleared`, `offer`) with a `rarity` from `RARITY_WEIGHTS`. A
  new in-play effect adds a `DEFAULT_RULES` field read by `turn.js`;
  limited-use effects count down in `FloorState.uses` (add it to the
  solver's `stateKey`). Run-wide state → `core/run.js`; floors get it
  through `floorSetupFor` and hand it back in `finishFloor`.
- Creature art follows the guide in `render/creatures.js` (bounds,
  centring, foot line, `size` class); `tests/creatures.test.js` checks it,
  poses included (Shape `poses`, picked by `partsFor`).
  Changed `data` shape → bump `dv`. Rule change that alters replays →
  bump `LOGIC_VERSION` (`src/config.js`). New actions → a code in
  `core/replay.js`.
- New screens → `ui/screens.js`, register in `main.js`.
- New random streams → `fork(runRng, 'label')`; never use `Math.random` in logic.
- Fold geometry → add an entry to `AXES` in `fold.js`; creature effects of a
  fold → `resolve` hook, not inside `applyFold`.
- Fold preview visuals → `CELL` states in `render/preview.js` + `drawFoldPreview`.
- Animations: model + timing in `render/fx.js`, painting in a renderer pass
  reading `r.fx`; durations always go through `ctx.motion()` (speed + reduced
  motion), and logic state is final before playback starts.
- Settings: a choice field goes in `DEFAULT_SETTINGS` + `CHOICES` (`ui/settings.js`), its row in `SETTINGS_GROUPS`; side effects in `applySettings` (main.js). Title rows → `TITLE_ROWS` (`ui/screens.js`).
- HUD sizes live only in `HUD_METRICS` (layout.js); CSS reads them as variables.
- Player actions → `ACTIONS` in `turn.js`; per-turn systems → `TURN_PHASES`.
  Logic emits events; anything visible needs a case in `clipFor`
  (`render/playback.js`).
- Creature kinds → `CREATURE_DEFS` (`core/creatures.js`) + a shape in
  `CREATURE_SHAPES` (`render/creatures.js`). Damage goes through `damageAt`,
  falls through `fall`, steps through `stepCreature`.
- Enemy behaviors → `ENEMY_AI` in `core/enemies.js` (plans only, never
  mutates); name the key in the def's `ai`. Plan ctx: `{ field, player,
  fold }` (`fold`: this turn's crease, or null). Def flags: `pace` (slow,
  counts `rest`), `heavy` (can't be pinned), `range` (ranged lanes via
  `sightLanes`, drawn by `drawSightLanes`), `fixed` (never stranded),
  `slide` (fold-aware glide via `slidePath`; previewed by `slidePreview`).
  Turn phases get `(state, emit, { action })`. Def flag `warn` (a
  guard opens its `jaws` a turn before it bites; plan `jaws`).
  New per-creature counters must be primitives and go in `stateKey`
  (`creatureKey` in solver.js). Def flags `carry` (held item, dropped on
  death or fall) and `spawn` (`sprout` countdown, ai `spore`).
- Floor `needs` ids: `fold`, `key`, `plate`, `pin` (pin/strand/drop is
  the only clean way). Designing a template: sketch it, then run
  `checkFloor` and a 1 HP `solve` on each variant before adding it.
- A template too big to solve carries a stored `line` (replay codes);
  `checkFloor` replays it. Keep it to one variant.
- Bosses → def flag `boss` + `core/boss.js`; a boss's own fold goes
  through `bossFold` (turn.js), so pins, drops and swats share the rules.
- Fold-time creature rules (pin, void drop) → `resolveFold` in `turn.js`;
  the per-cell rule is `coverEffect` (shared with the preview).

### PR 20: Playtest P2 Restart Floor and Hint button; menu plan
- Planned the user's menu redesign as P3 (OPEN-QUESTIONS "Menu
  redesign"); old P3-P5 are now P4-P6. Back to Projects goes to
  `https://avatar-coco-love.github.io/`; feedback waits for telemetry.
- Every template has a `tip` (the boss too); `generateFloor` info carries
  `tip` and `search` (false for stored-line floors: the boss).
- `core/hintLine.js` (pure): `findLine` (clean line first via the new
  solver option `noDamage`, then any; else `stuck` or `unknown` when
  capped), `lineKeys` / `nextStep` walk a known line without a new
  search, including after undoing back onto it.
- `ui/hintWorker.js` (module worker) + `ui/hintSearch.js`: one search at
  a time, a new one stops the old worker; main-thread fallback where
  module workers fail.
- Floor screen: Hint (H) shows the tip, then "Next step" (marked on the
  board: dashed crease plus a drag arrow, a move arrow, or a dashed ring
  for wait), or "This floor can't be won from here" with Undo / Restart
  floor. Cleared by the next action. Restart (R) asks, then remounts the
  floor fresh (floor-start HP and charges, empty log). HUD bar: Undo,
  Wait, Hint, Restart, Menu; short landscape screens use two columns and
  a scrolling hint card.
- Hint count per floor: in the save (`floor.hints`), kept through
  Restart, added to `run.hints[floor]` when the floor ends (6c summary).
  Telemetry `hint.ask` {level, count, turn}; `floor.end` outcome
  `restart` (replay-check treats it like `left`).
- Worst step search from a floor's start (node, desktop): 2.5 s on F7,
  under 1 s elsewhere; the search starts when the tip shows.
- 7 new tests (298 total). Checked in headless Chromium: phone portrait
  (tip, step arrow, restart dialog, Esc, restart), desktop F7 step via
  keyboard, landscape boss (tip only), a 0-charge F1 ("can't be won").
  No console errors.

### PR 21: Playtest P3 menus (title, Settings, pause menu, share fix)
- Title: `TITLE_ROWS` (`ui/screens.js`, `{ id, label, show, note, go }`):
  Continue Run (with a save; its summary under it), New Run, How to
  Play, Settings. The first row shown is primary. Corner icons (44px,
  aria-label, line art via `svgIcon` in `ui/dom.js`): Back to Projects
  (a link to `PROJECTS_URL`) and Share.
- Share: `shareData(url)` is `{ title, url }` only (no text, so Android
  shows a link share, not "Sharing text"). Copied: a "Link copied" toast
  under the icon; neither works: the link box shows there instead.
  Favicon: an inline SVG data URI in `index.html` (a sheet with a folded
  corner and a dashed crease). Still to check on the user's Android phone.
- Settings (`settingsScreen`, `settingsPanel`): built from
  `SETTINGS_GROUPS` (`ui/settings.js`). A row is a choice (`key`, cycles
  through `choicesFor(key)`) or an action (`action`), with an optional
  `show(ctx)` and `note`; empty groups hide. Display: Palette, Text size
  (new, Normal / Large: `--text-scale` on every font size), Animation,
  Reduced motion, Left-handed layout (new: landscape side panel on the
  left, `data-left-handed` + `renderer.setLeftHanded`). Gameplay: Show
  tutorial hints again (moved off How to Play). Data: Share play data
  (only when offered). About: version, credits.
- Settings fields `palette`, `textSize`, `hand`. The palette is saved
  now (it reset every visit); `?palette=` still overrides for a session.
  `applySettings` in main.js applies them all. Fixed: a saved "Share
  play data: Off" was ignored on load.
- Pause menu (HUD Menu, or Esc once a fold preview has cancelled):
  Resume, Restart Floor, How to Play, Settings, Abandon Run (run floors;
  asks first, ends the run and clears the save), Save & Quit to Title
  ("Quit to Title" on unsaved floors). Board input is off while it is
  open. How to Play and Settings open over the board (`hud.showSheet`),
  so the floor isn't torn down; Back returns to the pause menu. Restart
  moved off the HUD bar (R still works): Undo, Wait, Hint, Menu.
- 4 new tests (302 total). Checked in headless Chromium: phone portrait
  (title rows, Settings changes saved and applied, Esc back, pause menu,
  Settings over the board and back, Esc resume, Abandon Run clears the
  save, Esc order with a keyboard fold preview, dev floor menu) and
  phone landscape (left-handed panel, Save & Quit, Continue). No console
  errors.

### PR 22: Playtest P3 follow-up, phone Back button
- `ui/backButton.js`: the browser / phone Back button acts as the in-game
  Back. Off the title screen one guard history entry is pushed; Back pops
  it, an Esc keydown goes to the open dialog (or focus), and the guard is
  pushed again. Every Back button already answers Esc, so no screen
  changed. On the floor: Back opens the pause menu, Back again resumes;
  from a sheet (Settings, How to Play) it returns to the pause menu. On
  the title screen the guard is dropped, so Back leaves the page as usual.
- Checked in headless Chromium (menus, spirit pick, floor, pause sheets,
  Quit to Title then Back leaves). 302 tests pass.

### PR 23: Playtest P4a crease marks and tap-to-confirm folds
- `core/foldHistory.js` `foldsInEffect(log)`: the player's folds still in
  effect, from the floor's action log (a fold pushes, an undo pops):
  `{ fold, n, at }`. P4b's strip and rewind build on it.
- Crease marks: `render/preview.js` `buildCreaseMarks` (line + slot per
  fold, rebuilt only when the log grows) and the renderer pass
  `drawCreaseMarks` (thin ink line, numbered square tag near the line's
  start, side by side when folds share a line; hidden mid-animation).
  Square tags so they don't read as the preview's round height badges.
- Tap to confirm folds (Settings, Gameplay, off by default): a released
  drag on a valid crease is held (`input.js` pending state) with its
  preview up; the HUD shows Cancel and a Fold button (in Hint's place).
  Fold or Enter plays it; Cancel, Esc, phone Back or a tap on the board
  drops it. F on a held fold hands it to keyboard fold mode. Invalid
  drags are refused at once, as before. Any action dispatched drops a
  held fold.
- 2 new tests (304 total). Checked in headless Chromium (phone
  portrait, open 5x5 dev board): marks 1-3 appear and undo removes the
  latest; hold, Fold button, Enter, tap/Esc/Back drop. No console errors.

### PR 24: Playtest P4b fold history list, peek and rewind
- Pause menu row "Fold history" (between How to Play and Settings) opens
  a full-screen sheet: the folds still in effect, numbered like the
  crease tags (number in a square tag + a text description from
  `core/foldHistory.js` `foldText`, e.g. "Top 2 rows folded down"),
  rows 56px+ tall. With none, a "No folds yet" note.
- Tap a row to peek (`hud.showPeek`): the board just before that fold,
  the fold preview drawn on it (dashed outline on the paper it moved,
  landing badges, crease and arrow), earlier crease marks, and the
  meters as they were then. Title and buttons cover only the HUD (status
  bar + action bar in portrait, the side panel in landscape), so the
  board stays in view; the hint card hides under it.
- "Rewind to here": `core/foldHistory.js` `rewindTo(start, log, at)`
  replays the first `at` actions from the floor's start (null if out of
  range or no longer replayable). The saved log is cut; telemetry logs
  `x<n>` (`core/replay.js` replays it: keep the first n accepted
  actions), a `floor.rewind` event and a `rewinds` count. Free, keeps
  the Hint count, not a restart (user's choice).
- Back / Esc / phone Back: peek → list → pause menu. Opening the list
  finishes any running playback first, so its last frame can't replace
  the peek.
- Phone landscape: panels over the board (pause menu now 7 rows) lay
  buttons out in two columns and scroll instead of clipping.
- 4 new tests (308 total). Checked in headless Chromium, phone portrait
  and landscape, on the open 5x5 dev board: empty note, two folds
  listed, peek, phone Back to the list, rewind leaves fold 1 only. No
  console errors.

### PR 25: Playtest P5 Lockjaw bite warning, HP economy
- Lockjaw (def flag `warn`, instance `jaws`): you come next to it and it
  opens its jaws instead of biting (event `jaws`, `open: true`); still
  next to it in the next enemy phase, it bites, and keeps biting while
  you stay. Not next to it, the jaws shut (`open: false`); pinned, they
  shut too. A fight now costs one bite (was two). Solver `creatureKey`
  includes `jaws`. `LOGIC_VERSION` 3 (old floor saves restart, as
  designed).
- Render: open-mouth pose (Shape `poses.open`, `partsFor`) plus a "!"
  tag in the top-left corner (`drawWarn`); playback clip `jaws` (a short
  pulse in the new pose).
- Hint `lockjaw-guard` and the F6/F8 tips rewritten: jaws open as a
  warning, keep moving, or drop it into a void.
- HP: rest heals 2 (`REST_HEAL`); a floor won with HP not below its
  start heals `CLEAN_HEAL` 1, capped at max, before the relics'
  `cleared` hooks. `run.clean` says so on the floor-cleared panel and
  the offer screen ("No damage taken: +1 HP."). docs/03 updated.
- Re-proved every floor: all template proofs (needs, no-damage lines,
  the boss's stored line) pass unchanged.
- Dev map `?map=jaws` (a Lockjaw guarding the lock's key).
- 4 new tests, 3 updated (312 total). Checked in headless Chromium
  (phone portrait, `?map=jaws`): step next to it, jaws open with "!",
  step diagonal, jaws shut, no damage. No console errors.

### PR 26: Playtest P6 save code, Challenge-a-friend link
- `core/saveCode.js`: `encodeSaveCode(run)` / `decodeSaveCode(text)`. A
  bit-packed run at the start of its floor (layout in the file header),
  Crockford base32 in groups of four after `FW-`, CRC-10 check, version
  nibble. Spirits and relics are stored by their place in `CODE_SPIRITS`
  / `CODE_RELICS` (append only; a test checks every def is listed). A
  waiting offer is one bit: `rollOffer` gives it back from the seed.
  Reading forgives case, spaces, dashes, O/I/L and a missing prefix;
  refusals carry a reason (`empty`, `format`, `check`, `version`,
  `data`). Only runs on a plain number seed have a code (`isCodeSeed`).
- Settings > Data > **Save code** (action row): a screen from the title
  (`savecode` route: copy the code, load one; loading over a saved run
  asks), a sheet from the pause menu's Settings (copy only).
  `ctx.loadRun` ends the run in progress as abandoned, saves the loaded
  one under a new run id and goes to its floor or offer.
- **Challenge a friend** (pause menu, runs on a code seed): a sheet with
  the link (`?challenge=<seed>`, `ui/share.js` `challengeUrl`) in a box
  and Share link (share sheet, else copy). Opening the link puts a "You've
  been challenged" card first on the title; Accept (asks over a saved
  run) goes to spirit select, which starts the run on that seed; Accept
  or Not now drops it from the address bar (`ctx.clearChallenge`).
  `challenge` is not a dev param, so these runs save.
- Telemetry: `run.load` (new), `run.start.challenge`, `share.what`,
  `session.start.entry.challenge` (docs/07).
- 11 new tests (323 total). Checked in headless Chromium (phone
  portrait): pause → Challenge a friend → link copied; Save code in a
  run; title Settings: a bad code's message, then the copied code
  (lowercase) loads after the confirm; a challenge link in a fresh
  browser shows the card, and the run it starts has the sender's seed.
  No console errors.

### PR 27: Phase 6b Great Crane phases 2-3
- Settled with the user (OPEN-QUESTIONS "Great Crane phases 2-3"). Def
  `boss.spawn: { phase: 2, kind: 'mite', cap: 2 }` and `boss.double: 3`.
- `core/boss.js`: mark codes hold several creases (`marksCode`,
  `markFolds`: 'h6a+v2b'); `chooseCreases` (the second on the board the
  first leaves, `needMoves`), `creaseCount`, `spawnsNow`,
  `enteredSpawnPhase`, `minionSpot`, `minionCount`. `bossMarks` entries
  carry `n` / `of`. Plans are `{ type: 'mark' | 'crease', folds }`.
- `core/turn.js`: `bossCreases` folds them in order (the boss is found
  again after each fold, since applyFold copies the board), one swat
  damage per beat (`resolveFold` `hurt`, returns whether it swatted),
  `bossSpawn` (per fold, and on phase entry from `bossDrop`). Spawns made
  during the player's action wait a turn (`s.fresh`). Fix: an enemy
  pinned or dropped earlier in the enemy phase doesn't act (a boss fold
  dropping a Mite crashed it). Event `mark` carries `n`.
  `LOGIC_VERSION` 4.
- `f9-crane`: 7 charges, new stored line (10 turns, 7 folds, wins at 1
  HP); beam search with 6 found none.
- Telegraph: the second crease is previewed on the board the first
  leaves; numbered badges 1/2 when two are marked. Hints
  `crane-minions` (first spawn), `crane-double` (hint `match` field: the
  second mark event).
- 10 new tests (`tests/bossPhases.test.js`; 333 total). Checked in
  headless Chromium (phone 390x844, desktop 1280x800) from a seeded save
  mid-line: phase 2 single mark, phase 3 double mark with badges, Mites
  on the board. No console errors.

### PR 28: Phase 6c run summary
- Settled with the user (OPEN-QUESTIONS "Run summary").
- `core/summary.js`: pure `runSummary(run)` → `{outcome, title, text,
  rows}` for a won or lost run: "The Crane falls" (boss floor), "Run
  complete" (a shorter run), "Torn" (fell / out of HP on floor n, with a
  line when it was the Crane's floor). Rows: spirit, floors cleared, HP,
  relics (a list), seed.
- The last floor's end panel is now short (title, line, "Run summary")
  and leads to the new `summary` screen (`summaryScreen`): the rows as a
  `dl`, New run, Retry this seed, Challenge a friend (the pause menu's
  sheet, shown in place; Esc/Back returns), Menu. Esc is Menu.
- `ctx.lastRun`: `endRun` keeps a won or lost run for the summary.
  Retry this seed opens spirit select with `{ retry: seed }` (a "Same
  seed" note; Back returns to the summary); `startRun({ retry })`.
- Telemetry: `run.start.retry`; `share` also from the summary (docs/07).
- 3 new tests (`tests/summary.test.js`; 336 total). Checked in headless
  Chromium (phone 390x844 and 844x390) on a seeded loss: end panel →
  summary → Challenge a friend → Esc back → Retry this seed → spirit
  select → Back to the summary → Esc to the title. Landscape scrolls. No
  console errors.

### PR 29: Phase 7a paper scraps
- Rates settled with the user (OPEN-QUESTIONS "Paper scraps", docs/03):
  5 per floor cleared, 2 per fold kill, 25 for the Crane; lost runs keep
  theirs; abandoned runs earn none; dev-param runs never bank. Shop costs
  (7b) settled too. Phase 7 split into 7a-7e above.
- `core/turn.js`: `FloorState.foldKills`, enemies (not the player, not
  the boss) that fell or died from the player's own fold; undo takes it
  back. `core/run.js`: `run.foldKills` summed by `finishFloor` (won or
  lost; older saves read as 0).
- `core/scraps.js`: pure `runScraps(run)` → `{ lines, total }`
  (`SCRAP_RATES`); a relic `scraps` hook for Lucky Scrap later.
- `core/meta.js` (`{ v, scraps, earned, runs }`, `parseMeta`,
  `bankScraps`) and `ui/metaStore.js` (`foldwork.meta`, guarded, memory
  fallback). `ctx.meta`; `endRun` banks a won or lost run once and sets
  `ctx.lastScraps`.
- Summary: a "Paper scraps" row (breakdown, then "Total: +n (bank
  saved)"); `runSummary(run, scraps)`.
- Save code v2 carries fold kills (6 bits, cap 63); v1 codes still read
  (0 kills). Codes are one character longer.
- Telemetry: `run.end.foldKills`, `run.end.scraps` (docs/07).
- 11 new tests (`tests/scraps.test.js`; 347 total). Checked in headless Chromium
  (390x844): a saved run continued and lost by walking into a void → the
  summary shows the breakdown and `foldwork.meta` grows. No console
  errors.

### PR 30: Phase 7b unlocks shop
- Decisions (user's, OPEN-QUESTIONS "Unlocks shop"): 12 starter relics
  (the 8 built commons, Soft Landing, Folded Shield; Sharp Edge and
  Compass when built), the other 12 in the shop; Paper, Night Ink and
  High Contrast stay free, two new 50-scrap palettes (Kraft, Blueprint);
  challenge runs offer every relic.
- Built to grow (user's ask: many updates and expansions to come):
  `core/unlocks.js` builds the shop from the content tables
  (`SHOP_KINDS`: spirits, relics, palettes). A def's `unlock` is
  `'starter'`, `'shop'` (the default, so new content is for sale unless
  marked) or `'reward'` (granted by `grantUnlock`, shown with
  `unlockText`); cost is `def.cost` or the kind's default (relics by
  rarity). A new kind is one `SHOP_KINDS` entry plus, optionally, a card
  look in `ui/unlocks.js` `CARDS`.
- `core/meta.js`: `unlocks: { [kind]: [ids] }`, only what was bought or
  granted (starters never stored, so the starter set can grow). `parseMeta`
  now keeps unknown fields, kinds and ids (a newer build's, or removed
  content) and keeps a newer version number instead of resetting, with a
  `META_MIGRATIONS` table for future shape changes. Before, any other
  version reset the meta.
- `core/run.js`: `run.pool` (owned relic ids at the start, or
  `RELIC_POOL_ALL`); `rollOffer` draws from it in `RELIC_DEFS` order.
  Saves from before have no pool and offer every relic, as they did.
  Challenge runs (and a retry of one) use every relic; normal runs and
  retries use your unlocks.
- Save code v3: one bit for an open pool. An own-pool code (and every
  v1/v2 code) takes the loading device's unlocks. v2 codes still read
  (test with a real v2 code).
- UI: Unlocks screen (`ui/unlocks.js`): scrap bank, sections, two-press
  buy (Buy, then Confirm; Esc cancels), Owned/In use/Use for palettes,
  "🔒 cost · need n more" for locked items (words and marks, not color).
  Title row "Unlocks" with the bank and "n ready to unlock". Spirit
  select shows locked spirits (dashed, lock and cost); picking one opens
  the shop, whose Back returns to spirit select. Run summary gets a "Now
  affordable" row and an Unlocks button when banking made something
  affordable. Settings > Palette offers owned palettes only, with "More
  palettes in Unlocks."; an unowned saved palette shows the default.
- Dev: `?unlocks=all` owns everything for the session (a dev-run param:
  nothing saved or banked).
- `RARITY_NAMES`/`GROUP_NAMES` moved to `core/relics.js` (offers and the
  shop share them).
- 12 new tests (`tests/unlocks.test.js`; 359 total): starters, costs, every item
  priced, buying, grants, newly affordable, meta forward compatibility,
  run pools and old saves, save code v3 and a real v2 code, palette
  tokens and contrast. Checked in headless Chromium (390x844, 844x390):
  title → Unlocks → buy Frog (two presses) → buy and use Blueprint → Esc
  → spirit select (Turtle locked → shop → Back) → a Frog run saved with
  the starter pool. Floors in Kraft and Blueprint read clearly. No
  console errors, no sideways scroll.

### PR 31: Phase 7c, the last 9 relics (24 in all)
- Rarities 12/8/4 (user's choices; OPEN-QUESTIONS "Relic rarities").
  Sharp Edge and Compass are starters (12 starters); the other 7 are
  shop relics. All 9 ids appended to `CODE_RELICS`.
- New turn rules (`DEFAULT_RULES`): `pinDamage` (Sharp Edge),
  `tapeTurns` (Sticky Tape), `trapTurns` (Crease Trap), `echoFolds`
  (Echo Fold), `pocket` (Pocket Fold), and render-only `scout` and
  `compass`. FloorState gains `traps`, `prev` (Rewind Charm's one step
  back), `uses.echo` and `uses.rewinds`; creatures can carry `stuck`.
- Sticky Tape as designed could never trigger (folds move whole stacks,
  so nothing is ever uncovered); user's call: undo of a fold that pinned
  enemies leaves them stuck 2 turns and keeps the charge spent.
- Pocket Fold: `fold.pocket` lane (`core/fold.js`), action code
  `f<axis><index><side>p<lane>`, a HUD toggle and key P; drags fold the
  start cell's lane, keyboard fold mode moves the lane.
- Rewind Charm: action `takeback` (code `k`), run-wide `run.rewinds`
  (save code version 4 adds it; older codes read 0). A loss it can take
  back is saved as in play and offered again on Continue; the pause
  menu has a row while it is usable. Taking back drops the free undo
  (so no use comes back through it).
- Crease Trap edges (`creaseEdge`) are drawn as spikes; trap kills count
  as fold kills. Scout's Eye draws each enemy's next action in the fold
  preview (`scoutPreview`); none for an Echo Fold, which takes no turn.
  Compass draws a buried exit on top. Lucky Scrap adds its own summary
  line (+50%, rounded down).
- Tests: `tests/relics7c.test.js`; two unlock tests updated for the new
  starters and the 40-scrap commons.

