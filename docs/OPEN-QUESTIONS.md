# Open Questions

Design questions awaiting a decision. Add new ones as they come up; move them
to "Resolved" with the answer once decided.

## Open
- Exact scrap costs and earn rates.
- Relic rarity assignments.
- Great Crane balance and arena templates.
- Names and mechanics for the two later spirits (ideas: Rabbit, Koi).
- Touch "swipe to move" (docs/04) conflicts with drag-to-fold on the board.
  2a only supports tapping an adjacent tile. Should swipes be dropped, or
  should they mean something else (e.g. a swipe that starts on the player)?
- Void drop reading (2b, please confirm): docs/02 says "an enemy left on a
  void cell falls and dies", but creatures ride their layer, so the only way
  to end up on a void is a fold landing a stack whose top layer is a void on
  a creature's cell. 2b treats that as a void drop: the covered creature
  falls (the player too, which is defeat). Any other landing pins. The fold
  preview warns with a "↓" badge and the HUD says "a void lands on you".
- Mite tuning: 2 Mites deal 2 damage a turn against 3 HP, so waiting next to
  them is lethal fast. Dev floors scatter 2; revisit with real templates.
- Diagonal creases (relic): how are cells that sit on the crease diagonal
  handled, and what happens to non-square boards?

## Resolved
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
