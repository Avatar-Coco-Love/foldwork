# Foldwork — Technical Architecture

## Stack
- Vanilla JS (ES modules), HTML, CSS. Canvas 2D rendering. Web Audio for sound. No frameworks, no bundler required.
- Static hosting only (GitHub Pages works). Serve over HTTP for ES modules; a tiny `dev-server.js` (Node, no dependencies) is acceptable.
- No external assets. System font stack only.

## Suggested structure
```
/index.html
/css/style.css
/src/
  main.js            // bootstrap, screen router
  core/
    rng.js           // seeded RNG (e.g. mulberry32), splittable streams
    board.js         // grid, layer stacks, tile and creature data
    fold.js          // crease validation, fold application, undo snapshot
    turn.js          // turn loop: player action, enemy phase, environment
    enemies.js       // enemy definitions + AI
    boss.js          // Great Crane logic
    relics.js        // relic definitions + hooks
    spirits.js
    floors.js        // floor templates + variation
    solver.js        // solvability validator for generated floors
    run.js           // run state, relic offers, floor progression
    meta.js          // paper scraps, unlocks, persistence
  render/
    renderer.js      // board and layer drawing
    creatures.js     // vector creature drawing routines
    fx.js            // fold animation, particles, shake
    palette.js
  ui/
    hud.js, screens.js, input.js
  audio/
    sfx.js, ambient.js
/tests/              // plain-node tests for core logic
/docs/               // these spec files
```

## Core data model
- `Board`: `{ w, h, cells[] }`. Each cell: `{ layers: Layer[] }` (max 3 by default).
- `Layer`: `{ tile: TileType, creature?: Creature, item?: Item, flags }`.
- Creatures live on layers, so folding moves them with their tile.
- All state is plain serializable data (no class instances with hidden state) for save/load and for solver cloning.

## Fold algorithm (summary)
1. Input: crease line (axis + index or diagonal), folding side.
2. Compute the mirror mapping for every cell on the folding side to its destination.
3. Validate: destination stack height ≤ max; destination in bounds (clipped tiles remain under, not destroyed).
4. Apply: push mapped layers on top of destination stacks (preserving internal order), remove from source cells.
5. Resolve creature interactions (pin, strand, void drop).
6. Store an undo snapshot (copy of board + relevant state) for the free undo.
- Fold application must be pure: `applyFold(boardState, fold) -> newState` so preview, solver, and AI can all call it.

## Turn engine
- `turn.js` runs the player action, then the enemy phase in fixed order, then environment, then win/lose checks. It returns an event list (moves, hits, folds, falls, triggers) that the renderer plays back as animations. Logic completes instantly; animation is purely presentational.

## Floor generation
- Floors are built from handcrafted templates: board layout, key/door/plate relationships, and anchor spots for enemies and relics.
- Seeded variation: mirror/rotate the template, jitter enemy placement among allowed anchors, vary void and wall positions within template-defined options.
- **Solver:** a BFS/IDDFS search over (board state, player position, charges) that confirms at least one solution exists within fold charges. Reject and reroll variations that fail. Cap search depth for performance, and precompute validated variants if needed.
- Daily seed: seed derived from the UTC date (`YYYY-MM-DD`), so everyone gets the same run.

## Persistence
- `localStorage` keys: `foldwork.meta` (scraps, unlocks), `foldwork.settings`, `foldwork.run` (in-progress run snapshot, saved after each floor and each turn).
- Version the save format and migrate or reset gracefully on mismatch.
- All reads and writes wrapped in try/catch with in-memory fallback.

## Rendering and performance
- Redraw only when needed (state change, animation, or input preview) via `requestAnimationFrame`.
- Offscreen canvases for static layers (paper grain, tile faces) rebuilt on resize.
- Device pixel ratio capped at 2 on high-density screens.
- Avoid per-frame allocations in hot paths.

## Testing
- Plain Node tests (no framework needed, or a tiny assert harness) covering: fold validation, stacking, pin/strand/void rules, undo, enemy AI, relic hooks, solver on all templates, RNG determinism.
- Add a CI-style script `npm test` or `node tests/run.js` that runs everything.

## Browser targets
- Latest Chrome, Safari (iOS and macOS), Firefox, Edge. Touch-first behavior verified on a phone-sized viewport and a tablet-sized viewport.
- Add the web app manifest and meta tags so it can be added to a home screen. A service worker for offline caching is optional in a later phase.
