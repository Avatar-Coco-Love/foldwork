# Foldwork — Core Mechanics (Draft 1)

Status: draft based on decisions made so far. Items marked **[OPEN]** await design input.

## Board
- Square grid, per-floor size between 5x5 and 8x8. Small boards keep puzzles readable on phones.
- Each cell holds a **stack of layers** (see Layers). Floor 1 starts with one layer everywhere.
- Coordinates: (col,row), origin top-left.

## Tile types (v1)
| Tile | Behavior |
|---|---|
| Floor | Walkable. |
| Wall | Blocks movement. Folds like any tile (can be stacked). |
| Void | A hole. Entering it = fall (instant defeat for player; kills enemies). A non-void layer stacked over a void covers it and makes it walkable. |
| Key | An item lying on a layer. Picked up by walking on it, or "delivered" by a fold that stacks its layer and a Lock directly on each other (either on top). |
| Lock / Door | Opens when a key reaches it (walked into while carrying a key, or folded together with one). Blocks movement until opened. |
| Pressure plate | Triggers its linked target (v1: gates) while any creature or object occupies its top layer. |
| Gate | Blocks movement unless a plate with the same link is pressed. Updates in the environment step; can't close on a creature. |
| Exit | Reaching it ends the floor. May be locked behind a door or plate. |

Later (not v1): Ink hazards, Mirror tiles.

## Layers (overlap rule)
- A fold stacks tiles from the folded half onto the stationary half. Each cell can hold multiple layers.
- **Only the top layer is active.** Movement, hazards, keys, plates, and enemies all use the top layer.
- Layers below are preserved. Unfolding restores them exactly.
- Creatures travel with their layer. A creature on a folded tile ends up on the destination cell, on top.
- **Max stack height: 3 layers** (relics can raise it). A fold that would exceed 3 on any cell is invalid, and the preview shows it in red.

## Folding
- A fold is defined by a **crease line** along grid lines (horizontal, vertical in v1; diagonal via relic).
- Player drags across the board to preview a crease line. It snaps to the nearest valid grid line.
- The preview shows which side folds over which, and the resulting stack. Release to confirm; drag off-board or tap cancel to abort.
- The side that folds is the side the drag starts from, so each crease line offers two distinct outcomes depending on where the drag begins.
- Folds are mirrored over the crease. Tiles that would land off the board after mirroring are clipped (they stay under, not destroyed).
  - Clipped tiles stay on their own cell, unfolded and still active.
  - A moved stack keeps its internal order (no paper-style flip) and goes on top of the destination stack.
  - Cells emptied by a fold have no layers and behave as void.
- Each fold costs 1 **fold charge**. Charges are per floor (default 3, adjustable by floor and relics).
- Unfold: the most recent fold can be undone for free, and enemies do not act. Only the latest fold can be undone this way, and only before the player takes another action (move, attack, wait, or a new fold).
- A fold takes a turn: enemies act after it resolves.

## Turn order
1. Player acts (move, bump attack, fold, or wait).
2. Enemies act in a fixed order (top-to-bottom, left-to-right), each moving or attacking.
3. Environment resolves (plates, doors, hazards).
4. Check win/lose.

## Player
- 3 HP at start (relics can change this).
- Move 1 tile orthogonally.
- **Bump attack:** moving into an enemy deals 1 damage. No separate attack button.
- Wait action available (skip turn).

## Enemies and folds
- Enemies are creatures on tiles, so they fold with their tiles.
- **Crush:** if a fold lands a creature on a cell where another creature is on the top layer, the one moving in is placed on top; the one beneath is "pinned" (can't act, can't be attacked) until unfolded or until the top layer moves away. Relics can upgrade pinning into a true crush (see content doc). Heavy creatures (Card Brute) can't be pinned: a fold that would land on one is invalid, unless the landing sheet's top is a void, which drops it.
- **Strand:** an enemy folded onto a layer that's then stacked over a void or sealed area is cut off from the player.
- **Void drop:** an enemy left on a void cell falls and dies.
- Enemy roster and AI go in the content doc (next).

## Fail and win
- Lose: HP reaches 0, or player falls in a void.
- Win floor: reach the exit.
- Win run: defeat the boss floor.

## Seeded generation (high level)
- Each floor is built from a seeded puzzle template plus enemy and relic placement.
- Every generated floor must be validated solvable by an automated solver before it is shown. Details in the tech doc.
