# Open Questions

Design questions awaiting a decision. Add new ones as they come up; move them
to "Resolved" with the answer once decided.

## Open
These belong to later phases and get decided when that phase is built.
- Exact scrap costs and earn rates (Phase 7; tune in Phase 9).
- Relic rarity assignments (Phase 4b, with offers). 4a gives provisional
  ones: Extra Crease and Spring Crease common, Thick Paper and Recycled
  Crease uncommon.
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
- Telemetry hosting (4a): Google Sheets via an Apps Script web app for
  playtests (`tools/telemetry-sheets/`); a real database before launch.
- Run rules (4a, provisional, playtest them): HP carries between floors,
  with no healing yet (rest/heal relics arrive in 4b). Defeat ends the run
  (no more same-floor retry). Leaving mid-floor ends the run as
  `abandoned` until Phase 7 can save and resume runs.
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
