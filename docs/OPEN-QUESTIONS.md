# Open Questions

Design questions awaiting a decision. Add new ones as they come up; move them
to "Resolved" with the answer once decided.

## Open
- Exact scrap costs and earn rates.
- Relic rarity assignments.
- Great Crane balance and arena templates.
- Names and mechanics for the two later spirits (ideas: Rabbit, Koi).
- Empty (vacated) cells act as void. For the player this is now decided (see
  Resolved). Do enemies that step into an empty cell fall too? A creature
  riding a fold always moves with its layer, so it is never left on an empty
  cell. Settle this in Phase 2b with void drop.
- A fold can stack paper over the player. For now (2a) the player is then
  "pinned": can't move, but can wait, fold or undo. Is that the intended rule?
  Should such folds be invalid, or should the player ride up to the top
  instead? Folds move whole stacks, so the covering layer never leaves on its
  own, which makes this a soft-lock unless the player undoes or folds the
  stack again.
- Touch "swipe to move" (docs/04) conflicts with drag-to-fold on the board.
  2a only supports tapping an adjacent tile. Should swipes be dropped, or
  should they mean something else (e.g. a swipe that starts on the player)?
- Can a fold that leads to defeat be undone? In 2a, no: defeat ends the floor
  at once. (A fold can't cause defeat until enemies act in 2b.)
- Diagonal creases (relic): how are cells that sit on the crease diagonal
  handled, and what happens to non-square boards?

## Resolved
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
