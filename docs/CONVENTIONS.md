# Foldwork — Conventions

Where things go and the rules that keep saves, replays and the solver
working. Read this at the start of every conversation (after
`docs/PROGRESS.md`). Add a line when a PR creates a new seam.

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
