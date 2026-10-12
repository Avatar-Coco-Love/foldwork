# Open Questions

Design questions awaiting a decision. Add new ones as they come up; move them
to "Resolved" with the answer once decided.

## Open
These belong to later phases and get decided when that phase is built.
- Exact scrap costs and earn rates (Phase 7; tune in Phase 9).
- Relic rarities and offer weights (provisional since 4b; tune in Phase 9
  playtests). Weights common 6 / uncommon 3 / rare 1. Common: Extra Crease,
  Spring Crease, Paper Heart, Laminate, Mender, Master Key, Paper Cut.
  Uncommon: Thick Paper, Recycled Crease, Soft Landing, Folded Shield,
  Heavy Stamp. Rare: Origami Luck. The 11 relics not built yet get theirs
  when they arrive (aim: ~12/8/4 overall, docs/03).
- Telemetry start: collection is off (`TELEMETRY.collect: false`) until the
  first playtests have been watched; then deploy the Sheets collector and
  switch it on (docs/07).
- Great Crane balance and arena templates (Phase 6).
- Names and mechanics for the two later spirits (post-launch; ideas: Rabbit,
  Koi).
- Telemetry consent before a public launch: is "on by default, with an
  off switch and a short notice" right for the target regions, or should it
  be opt-in (a first-run prompt)? Where is the notice shown? The repo ships
  with no endpoint, so nothing is sent until this is decided and an
  endpoint is configured in `src/config.js`.

## Resolved
- Relic offers (4b): after every floor won except the last, pick 1 of 3
  (4 with Origami Luck), weighted by rarity, never a relic you own, never
  a repeat in one offer; seeded per floor (`offers-<n>`). There is no skip:
  a choice is required, unless the pool is empty. Rest (after floors 4
  and 7) heals 1 and can be taken at full HP (it says so on the card).
- Laminate / Folded Shield (4b): both negate a whole hit on the player.
  Folded Shield's guard lasts until the end of the turn the fold was made
  (the enemy phase right after it) and is used first; Laminate's ward is
  per floor. Undo restores both, like everything else.
- Soft Landing (4b): only a step into a void or empty cell is caught
  (stay put, 1 damage that can't be blocked; it can still tear you at 1
  HP). Being void-dropped by a fold isn't caught: there's no previous tile,
  and the fold preview already warns. One use per run, carried as
  `run.landings`.
- Master Key (4b): "opens automatically" means the first lock you walk
  into on each floor opens without a key. A carried key is used first.
  Fold delivery is unaffected.
- Mender (4b): heals 1 after every 2nd floor cleared (run.cleared even),
  before the offer.
- Paper Cut (4b): "stacked tile" = the target's cell has 2+ layers. Only
  the player's bumps.
- Heavy Stamp (4b): the plate stays pressed the turn you step off and the
  next 2 (3 turns in all). A creature standing on it keeps it topped up.
- Not built yet (need later systems): Echo Fold, Crease Trap, Pocket
  Fold, Sticky Tape, Sharp Edge (fold relics; timed effects), Wax Coat (needs the Wasp, Phase 5), Scout's Eye and
  Compass (render-side), Lucky Scrap (scraps, Phase 7), Rewind Charm.
- Telemetry hosting (4a): Google Sheets via an Apps Script web app for
  playtests (`tools/telemetry-sheets/`); a real database before launch.
- Run rules (4a, provisional, playtest them): HP carries between floors;
  healing comes from Paper Heart, Mender and rest (4b). Defeat ends the run
  (no more same-floor retry). Leaving mid-floor ends the run as
  `abandoned` until Phase 7 can save and resume runs.
- Spirits (4c, provisional): HP and perk per docs/03; all three can be
  picked until Phase 7 adds scrap unlock costs. Turtle's perk is Spring
  Crease's rule (undo 2 folds); Frog's is Diagonal Crease's. A relic the
  spirit already has is left out of its offers, so it never wastes a card.
  Fox's +1 charge stacks with Extra Crease. Dev runs (`?screen=floor`)
  start with no spirit (3 HP, no perk) unless `?spirit=` names one.
- Diagonal input (4c): a drag within 22.5° of a diagonal gives a diagonal
  crease (only when unlocked); the crease is still the drag's perpendicular
  bisector, snapped to the nearest line through cell centres. Keyboard: R
  turns the crease v → h → d → a; arrows push it. Hinge cells (on the
  line) can't start a drag-fold. Diagonal Crease relic: uncommon
  (provisional).
- Spring Crease (4a): undo unwinds up to 2 consecutive folds, one per
  press; any other action ends the chain (docs/02's undo window).
- Recycled Crease (4a): refunds 1 charge per fold (not per enemy) when it
  pins, strands or void-drops an enemy. Pinning yourself doesn't count.
- Thick Paper (4a): max stack 4, which also lets folds land on templates'
  3-high "thick card". That's the relic's power; floors stay solvable,
  since more legal folds never remove a solution.
- Mite tuning (decided in 3b): stats unchanged (1 HP, bites for 1). Floors
  control the pressure instead: 1 Mite on F1, 2 on F2, 1–2 on F3, on
  template anchors (mostly across the void, so they reach you only after a
  fold). The solver proves every variant winnable with its Mites.
- Template "thick card" (3b): a 3-high stack is a full stack, so nothing
  can land on it and it can only fold onto an empty cell. Templates use it
  to keep an exit, gate or wall row in place so the floor teaches what it
  is meant to (e.g. F2's gate can't be folded over). It follows from the
  existing stack limit; no new rule.
- Tutorial hints (3b): one card at a time, shown once per player (saved),
  never blocking play. A hint from a newer event replaces the card on
  screen. How to Play lists all of them and can re-arm them.
- Floor progression before Phase 4: clearing a floor offers the next one;
  after floor 3 the run ends with a "Run complete" panel. Defeat offers a
  retry of the same floor (same seed) until Phase 4 adds run loss.
- Telemetry design (3b): fixed envelope with opaque `data`, and floors
  record their full action log so new questions are answered by replay,
  not by new events or backend changes (`docs/07-telemetry.md`).
- Void drop (confirmed in 3a): a fold that lands a stack whose top layer is
  a void on a creature's cell drops it (it falls; the player too, which is
  defeat). Any other landing pins. This is the docs/02 "enemy left on a void
  cell" case, since creatures otherwise ride their layer.
- Touch swipe to move (decided in 3a): dropped. On the board a drag is
  always a fold, so tap an adjacent tile to move (docs/04 updated). This
  keeps the fold gesture unambiguous and a short drag (under half a cell)
  already counts as a tap.
- Diagonal creases (decided in 3a, built with the relic in Phase 4): boards
  are always square (docs/02), so diagonals work on every board. A diagonal
  crease runs through cell centres (col - row = k, or col + row = k). Cells
  on the line are the hinge: they stay put and are not covered. Off-line
  cells mirror across it; any that land off-board are clipped, as usual.
- Keys are items on a layer (`layer.item`), not a tile, so they ride folds
  and anything (e.g. Lockjaw) can drop one. Walking onto a key picks it up.
  Keys are per floor and do not carry over.
- Walking into a lock with a key uses the key, opens the lock (it becomes an
  open door) and steps in, all in one turn. Without a key the move is
  refused and takes no turn.
- Fold delivery: a fold that stacks a key's layer and a lock directly on
  each other, in either order, opens the lock and uses the key. The fold
  preview shows a key badge and the HUD says "Ready: opens a lock".
- Plates press while a creature (player or enemy) stands on their top layer.
  A covered plate is never pressed. Plates power gates with the same link
  (shown by a matching shape: dot, triangle, square). Gates update in the
  environment phase, after enemies, so stepping on a plate opens its gate
  at the end of that turn. A gate can't close on a creature.
- Reaching the exit wins at once: enemies don't get a last turn. Only the
  top layer counts, so an exit buried under a fold is inactive.
- Enemies don't pick up keys, but they do press plates. Locks and closed
  gates block them like walls.
- A player covered by a fold is pinned (kept, decided in 2b): can't move,
  but can wait, fold or undo. Enemies can't attack a pinned player.
- A fold that leads to defeat (e.g. a void dropped on the player) can't be
  undone: defeat ends the floor at once (decided in 2b).
- Empty (vacated) cells are void for enemies too: an enemy stepping into one
  falls. Enemy AI never steps into a void or empty cell on its own.
- Strand = an enemy with no walkable path to the player (walls, voids and
  empty cells block; stack heights don't). It waits. A fold that cuts an
  enemy off emits a `strand` event (for relics like Recycled Crease).
- Stack order when folding: the moved stack keeps its internal order (bottom
  stays bottom) and goes on top of the destination. There is no paper-style
  flip. (Tech doc: "preserving internal order".)
- Clipped tiles (mirror lands off-board) stay on their own source cell,
  unfolded and still active.
- Cells emptied by a fold (`layers: []`) behave as void, and are drawn as void.
- Drag-to-fold: the crease is the midpoint of the drag (paper-like), snapped to
  the nearest grid line. Keyboard fold mode: F again flips the folding side.
- Free undo refunds the fold charge, since it restores the exact prior state.
  This is implemented with charges in Phase 2a.
- Undo restores the whole floor state from before the fold (board, charges,
  and anything enemies did after it), not only the board.
- The player walking into an empty (vacated) cell falls, the same as a void
  tile. Walking into a void on purpose is allowed (docs/02: instant defeat).
- Walls and the board edge refuse a move without using the turn. Bumping a
  creature uses the turn.
