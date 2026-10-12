# Open Questions

Design questions awaiting a decision. Add new ones as they come up; move them
to "Resolved" with the answer once decided.

## Open
- Exact scrap costs and earn rates.
- Relic rarity assignments.
- Great Crane balance and arena templates.
- Names and mechanics for the two later spirits (ideas: Rabbit, Koi).
- Empty (vacated) cells act as void. Does that apply to the player only, to
  every creature, or does a creature riding the fold always land safely?
  Settle this in Phase 2 with void-drop.
- Diagonal creases (relic): how are cells that sit on the crease diagonal
  handled, and what happens to non-square boards?

## Resolved
- Stack order when folding: the moved stack keeps its internal order (bottom
  stays bottom) and goes on top of the destination. There is no paper-style
  flip. (Tech doc: "preserving internal order".)
- Clipped tiles (mirror lands off-board) stay on their own source cell,
  unfolded and still active.
- Cells emptied by a fold (`layers: []`) behave as void.
