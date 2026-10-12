# Foldwork — Progress Log

**Start every new conversation here.** One PR per conversation keeps context
small. At the end of each conversation, update this file in the same PR.

## Next up
**Phase 6a: Great Crane, phase 1 (floor 9 arena).** Read docs/03 (Boss:
The Great Crane) and docs/02 (fold rules). Open questions to settle with
the user before building (log them in OPEN-QUESTIONS): how the Crane's
telegraphed crease is chosen (seeded? aimed at the player?), what its own
fold does to the player (pin, carry, void drop, like a player fold?),
whether the Crane is Heavy, and how a fold "drops it onto a void" for
damage instead of killing it. Then: a `crane` def (6 HP, three phases), an
AI that plans a crease every 2 turns and executes it on the next beat
(previewed like a player fold), a 7x7 arena template for floor 9, and a
`RUN_FLOORS` / `runLength()` change so the run ends on the boss. Suite
time is ~90 s on the current container (was ~67 s here before 5d); keep
boss proofs cheap (one arena, few variants).

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
- [ ] **Phase 6** — Great Crane boss, run summary
  - [ ] 6a Great Crane phase 1, telegraphed crease, floor 9 arena
  - [ ] 6b Crane phases 2–3 (minions, double creases, shrinking arena)
  - [ ] 6c Run summary and win/lose flow through the boss
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

## Conventions worth remembering
- Dev URL params: `?screen=offer&cleared=4`, `?spirit=frog`, `?screen=floor&floor=2&map=courier&size=7&seed=abc&palette=night-ink&demo=1&speed=slow&motion=on&charges=3&mites=2&relics=all&telemetry=console`.
- New draw layers → add a pass to `PASSES` in `renderer.js`.
- New tile types → `TILE`/`TILE_DEFS` in `tiles.js` + a painter in
  `TILE_PAINTERS` (`renderer.js`; painters get the layer). Items →
  `ITEM_DEFS` + `ITEM_PAINTERS`. Glyphs on tile faces use the `glyph` token.
- Environment rules (plates, gates, locks) → `core/environment.js`, run
  from the `environment` turn phase; fold-time tile rules go in
  `resolveFold` next to the creature rules.
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
  centring, foot line, `size` class); `tests/creatures.test.js` checks it.
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
- Settings: add fields to `DEFAULT_SETTINGS` + `normalizeSettings`.
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
  Turn phases get `(state, emit, { action })`.
  New per-creature counters must be primitives and go in `stateKey`
  (`creatureKey` in solver.js). Def flags `carry` (held item, dropped on
  death or fall) and `spawn` (`sprout` countdown, ai `spore`).
- Floor `needs` ids: `fold`, `key`, `plate`, `pin` (pin/strand/drop is
  the only clean way). Designing a template: sketch it, then run
  `checkFloor` and a 1 HP `solve` on each variant before adding it.
- Fold-time creature rules (pin, void drop) → `resolveFold` in `turn.js`;
  the per-cell rule is `coverEffect` (shared with the preview).
