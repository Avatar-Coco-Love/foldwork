// Floor templates and seeded generation (docs/03 floor progression, docs/05
// floor generation). Pure; no DOM.
//
// A template is plain data:
//   {
//     id, floor,      unique id; the floor number it is used on
//     weight,         pick weight among the floor's templates (default 1)
//     charges,        fold charges
//     rows,           parseMap rows (core/maps.js legend): the top layer
//     under,          optional layer grids beneath `rows`, bottom first
//                     (parseMap `under`); 3-high stacks pin the layout down
//     transforms,     MAP_TRANSFORMS ids a variant may use (default ['id'])
//     vary,           { symbol: [symbol, ...] }: each cell with that symbol
//                     becomes one of the choices (seeded, per cell)
//     enemies,        [{ kind, count }]: placed on `?` anchors (seeded);
//                     unused anchors stay plain floor
//     needs,          what the floor teaches, as NEEDS ids: without it the
//                     floor must be unsolvable ('fold', 'key', 'plate',
//                     'pin')
//     checkAtRuntime, solve each rolled variant before showing it (see below)
//     hints,          tutorial hint ids (core/hints.js) shown on this floor
//   }
//
// Validation (docs/05: every floor is proven solvable before it is shown).
// Variants are finite (transforms × choices × anchor picks), so the tests
// enumerate every variant of every template with allVariants() and prove
// each solvable and each `needs` essential. That is the "precomputed"
// route: generateFloor() can then hand out any variant without searching,
// which keeps floor start instant on phones. A template whose variants are
// too many to enumerate sets `checkAtRuntime`, and generateFloor() solves
// each roll (capped by RUNTIME_SOLVE) and rerolls up to MAX_ATTEMPTS times,
// falling back to the base layout.

import { parseMap, transformRows, toGrid } from './maps.js';
import { createFloorState } from './turn.js';
import { creatureDef } from './creatures.js';
import { solve } from './solver.js';
import { TILE, ITEM } from './tiles.js';
import { createRng, fork, pick, pickWeighted, nextInt, shuffle } from './rng.js';

export const MAX_ATTEMPTS = 6;

/** Solver caps for checking a floor while the player waits for it. */
export const RUNTIME_SOLVE = Object.freeze({ maxStates: 3000, maxTurns: 30 });

/** Layers `thick()` adds beneath a marked cell: 1 top + 2 = a 3-high stack. */
const THICK = 2;

export const FLOOR_TEMPLATES = Object.freeze([
  // Floor 1: folding basics. The void row cuts the board in two: fold one
  // half over it to bridge the gap, or ride the paper across. One Mite
  // waits on the far side.
  {
    id: 'f1-bridge',
    floor: 1,
    charges: 2,
    rows: [
      '? . E . ?',
      '. . . . .',
      'o o o o o',
      '. . . . .',
      '. . @ . .',
    ],
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'mite', count: 1 }],
    needs: ['fold'],
    hints: ['fold-drag', 'fold-bridge', 'mite-bump', 'undo'],
  },
  // Floor 2: pressure plates. The exit and its gate are thick card (3
  // high), so no fold can move them or cover the gate: the way in is
  // through the gate while the plate beside it is held. Cross the void
  // first. Two Mites to pin or squash.
  {
    id: 'f2-plate',
    floor: 2,
    charges: 2,
    rows: [
      'E a 1 . ?',
      '# # . . .',
      '. . . . .',
      'o o o o o',
      '? . @ . .',
    ],
    under: thick([
      'X X _ _ _',
      'X X _ _ _',
      '_ _ _ _ _',
      '_ _ _ _ _',
      '_ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'mite', count: 2 }],
    needs: ['fold', 'plate'],
    hints: ['plate-gate', 'thick-stack', 'pin', 'pinned-self'],
  },
  // Floor 2 (alternate): plates plus the Paper Wasp. The same thick exit
  // and gate, but a Wasp watches the way up. Walking straight in takes a
  // sting; a second fold that stacks paper across its line of fire (or
  // pins it) gets you through clean.
  {
    id: 'f2-wasp',
    floor: 2,
    charges: 2,
    rows: [
      'E a 1 . .',
      '# # . . ?',
      '. . . ? ?',
      'o o o o o',
      '. . @ . .',
    ],
    under: thick([
      'X X _ _ _',
      'X X _ _ _',
      '_ _ _ _ _',
      '_ _ _ _ _',
      '_ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'wasp', count: 1 }],
    needs: ['fold', 'plate'],
    hints: ['wasp-sting', 'plate-gate', 'thick-stack'],
  },
  // Floor 3: keys and locks. A thick wall with one lock splits the board.
  // Bridge the void to reach the key, then walk it to the lock.
  {
    id: 'f3-vault',
    floor: 3,
    charges: 2,
    rows: [
      '% . . E . %',
      '# # L # # #',
      '. . . . . .',
      'o o o o o o',
      '? . k . . ?',
      '. . . @ . .',
    ],
    under: thick([
      '_ _ _ _ _ _',
      'X X _ X X X',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    vary: { '%': ['.', '#'] },
    enemies: [{ kind: 'mite', count: 2 }],
    needs: ['fold', 'key'],
    hints: ['key-lock', 'thick-stack'],
  },
  // Floor 3 (alternate): the key is across the void at the top. Fold it
  // over to your side, then carry it down to the lock in the thick wall.
  {
    id: 'f3-ferry',
    floor: 3,
    charges: 2,
    rows: [
      'k . . . . ?',
      'o o o o o o',
      '. . . . # .',
      '? # . @ . .',
      '# # # # L #',
      '. E . . . .',
    ],
    under: thick([
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ X _ _ _ _',
      'X X X X _ X',
      '_ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'mite', count: 1 }],
    needs: ['fold', 'key'],
    hints: ['key-lock', 'key-fold', 'thick-stack'],
  },
  // Floor 3 (alternate): the Card Brute waits by the lock across the void.
  // The quick bridge (fold the bottom two rows up) would land on it, and
  // it's too heavy to pin, so the bridge takes two folds; then slip past
  // it while it rests.
  {
    id: 'f3-brute',
    floor: 3,
    charges: 2,
    rows: [
      '. . . E . .',
      '# # L # # #',
      '. ? . . ? .',
      'o o o o o o',
      '. . k . . .',
      '. . . @ . .',
    ],
    under: thick([
      '_ _ _ _ _ _',
      'X X _ X X X',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'brute', count: 1 }],
    needs: ['fold', 'key'],
    hints: ['brute-heavy', 'key-lock', 'thick-stack'],
  },
  // Floor 4: plate + key, with the Creaseling. The exit row is thick card:
  // exit, lock and gate in a line with the plate beside the gate. Cross
  // the void for the key, then hold the plate, slip through the gate and
  // unlock the exit. Every fold makes the Creaseling slide along the
  // crease toward you, so pick creases that leave it behind.
  {
    id: 'f4-relay',
    floor: 4,
    charges: 2,
    rows: [
      '? . . k . ?',
      '. . . . . .',
      'o o o o o o',
      '. . ? . . .',
      '# # # . . .',
      'E L a 1 @ .',
    ],
    under: thick([
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      'X X X _ _ _',
      'X X X _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'creaseling', count: 1 }],
    needs: ['fold', 'key', 'plate'],
    hints: ['creaseling-slide', 'plate-gate', 'key-lock', 'thick-stack'],
  },
  // Floor 4 (alternate): the order flips. The plate sits behind the lock,
  // so the key comes first: fetch it from the far corner, open the lock,
  // then stand on the plate and step through the gate to the exit.
  {
    id: 'f4-gatehouse',
    floor: 4,
    charges: 2,
    rows: [
      'k . . ? . .',
      '. . . . . ?',
      'o o o o o o',
      '. . ? . . .',
      '# # # # . .',
      'E a 1 L . @',
    ],
    under: thick([
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      'X X X X _ _',
      'X X X X _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'creaseling', count: 1 }],
    needs: ['fold', 'key', 'plate'],
    hints: ['creaseling-slide', 'key-lock', 'plate-gate', 'thick-stack'],
  },
  // Floor 5: pinning and stranding as the solution. The Wasp watches the
  // bottom row you have to cross, and the Creaseling waits by the bridge.
  // Step down, then fold row 4 onto row 5: you ride it, the paper pins the
  // Wasp, and the emptied row cuts the Creaseling off. Walk the row and
  // bridge the void with what's left.
  {
    id: 'f5-sweep',
    floor: 5,
    charges: 2,
    rows: [
      'E # # # # #',
      '. . . . . .',
      'o o o o o o',
      '. C . # . @',
      '. . . . . .',
      'W . . . . .',
    ],
    under: thick([
      'X X X X X X',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ X _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    needs: ['fold', 'pin'],
    hints: ['fold-enemies', 'pin', 'strand', 'wasp-sting', 'creaseling-slide', 'thick-stack'],
  },
  // Floor 5 (alternate): a crowd. A Mite and a Creaseling share your row,
  // a Wasp watches your side of the void and a Brute the far side. One
  // fold of row 4 down onto row 5 pins both row-mates, and the doubled
  // paper you ride stands taller than the Wasp, so it can't see you on
  // the walk to the bridge.
  {
    id: 'f5-press',
    floor: 5,
    charges: 3,
    rows: [
      'E # # # # #',
      '. . . . B .',
      'o o o o o o',
      '. . . W . .',
      '. . . . . .',
      '. m . . C @',
    ],
    under: thick([
      'X X X X X X',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
      '_ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    needs: ['fold', 'pin'],
    hints: ['fold-enemies', 'pin', 'brute-heavy', 'thick-stack'],
  },
  // Floor 6: guarded keys. The only key is the one the Lockjaw holds, and
  // it guards the far edge of the void. Walk over and it bites twice
  // before it dies; fold the void row up onto it instead and it drops
  // through, its key landing on the nearest free tile. Line up under it
  // before you fold and you land right by the key.
  {
    id: 'f6-drop',
    floor: 6,
    charges: 2,
    rows: [
      '. . . E . . .',
      '# # # L # # #',
      '? . . . . . ?',
      '. . . . . . .',
      '. J . . . . .',
      'o o o o o o o',
      '. . . . @ . .',
    ],
    under: thick([
      '_ _ _ _ _ _ _',
      'X X X _ X X X',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'mite', count: 1 }],
    needs: ['fold', 'key'],
    hints: ['lockjaw-guard', 'key-lock', 'thick-stack'],
  },
  // Floor 6 (alternate): two locks in a row, two Lockjaws, two keys. Both
  // guards stand on the void's far edge, so the right bridging fold drops
  // them both; then collect both keys while dealing with the Mite.
  {
    id: 'f6-twin',
    floor: 6,
    charges: 2,
    rows: [
      '# # # L E # #',
      '# # # L # # #',
      '? . . . . . ?',
      '. . . . . . .',
      '. J . . . J .',
      'o o o o o o o',
      '. . . @ . . .',
    ],
    under: thick([
      'X X X X X X X',
      'X X X _ X X X',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    enemies: [{ kind: 'mite', count: 1 }],
    needs: ['fold', 'key'],
    hints: ['lockjaw-guard', 'key-lock', 'thick-stack'],
  },
  // Floor 7: time pressure. You start in a pocket with a Spore Bloom, so
  // it counts down from the first turn, and its Mites follow you over the
  // bridge to the plate. The quick bridge (rows 5-6 up) takes a bite; fold
  // row 6 onto row 5 first and the doubled paper carries you clear on the
  // second fold. The Bloom stands still (no anchors): every extra Bloom
  // spot multiplies the proof time. `needs` lists only 'fold':
  // proving the plate essential means searching every line while Mites
  // keep spawning, which doesn't finish within the caps. The thick exit,
  // gate and wall keep the gate in place by construction.
  {
    id: 'f7-pocket',
    floor: 7,
    charges: 2,
    rows: [
      'E a 1 . . . .',
      '# # . . . . .',
      '. . . . . . .',
      'o o o o o o o',
      'o o o S . . .',
      'o o o . . . .',
      'o o o . . . @',
    ],
    under: thick([
      'X X X _ _ _ _',
      'X X _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    needs: ['fold'],
    hints: ['bloom-spawn', 'plate-gate', 'thick-stack'],
  },
  // Floor 8: everything at once, two charges. The F4 exit row (exit, lock,
  // gate, plate) is thick card across the void; the key sits behind a
  // pillar with a Mite on guard, a Wasp watches the far landing and a
  // Creaseling slides with every fold. The quick line takes two hits. The
  // clean one folds row 5 down onto row 6 (the key rides along), takes
  // the key, then bridges on the doubled paper, which stands taller than
  // the Wasp, so it can't see you climb up beside it.
  {
    id: 'f8-crossing',
    floor: 8,
    charges: 2,
    rows: [
      'E L a 1 # # #',
      '# # # . . . .',
      '. . . C . . W',
      'o o o o o o o',
      '. . . @ . # m',
      '. . . . . k .',
      '. . . . . . .',
    ],
    under: thick([
      'X X X _ X X X',
      'X X X _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ X _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    needs: ['fold', 'key', 'plate'],
    hints: ['fold-enemies', 'key-lock', 'plate-gate', 'thick-stack'],
  },
  // Floor 8 (alternate): two Lockjaws and a loose key, same exit row.
  // Weave round the near Lockjaw's bite to the key, then fold row 5 down
  // onto it: pinned, it can't bite while you cross it, and the doubled
  // row bridges the void on the second fold. The far Lockjaw's key is the
  // spare. Walking past either one costs a bite each.
  {
    id: 'f8-jaws',
    floor: 8,
    charges: 2,
    rows: [
      'E L a 1 # # #',
      '# # # . . . .',
      '. J # . . C .',
      'o o o o o o o',
      '. . . . . . .',
      '. . . . . @ .',
      '. . k . J . .',
    ],
    under: thick([
      'X X X _ X X X',
      'X X X _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
      '_ _ _ _ _ _ _',
    ]),
    transforms: ['id', 'flipH'],
    needs: ['fold', 'key', 'plate'],
    hints: ['fold-enemies', 'lockjaw-guard', 'key-lock', 'plate-gate'],
  },
]);

/**
 * `under` grids from one mask: each `X` cell gets THICK floor layers
 * beneath its top tile (`_` = none), so it stands 3 high.
 */
function thick(mask) {
  const grid = mask.map((r) => r.replace(/X/g, '.'));
  return Array.from({ length: THICK }, () => grid);
}

/**
 * What a floor teaches, as checks: each turns a built floor into the same
 * floor without that tool (or solver options that forbid it). If that
 * version can still be won, the tool isn't needed and the floor doesn't
 * teach it.
 */
export const NEEDS = Object.freeze({
  fold: (built) => ({ built, solveOpts: { noFolds: true } }),
  key: (built) => ({
    built: {
      ...withLayers(built, (l) => (l.item === ITEM.KEY ? { ...l, item: null } : l)),
      enemies: built.enemies.map((e) => (creatureDef(e.kind).carry === ITEM.KEY ? { ...e, item: null } : e)),
    },
  }),
  plate: (built) => ({ built: withLayers(built, (l) => (l.tile === TILE.PLATE ? { ...l, tile: TILE.FLOOR } : l)) }),
  // Pinning and stranding as the intended solution (docs/03 F5): with no
  // hit to spare, the floor can't be won without a fold that pins, strands
  // or void-drops an enemy.
  pin: (built) => ({ built: { ...built, hp: 1 }, solveOpts: { noPins: true } }),
});

function withLayers(built, fn) {
  const cells = built.board.cells.map((c) => ({ layers: c.layers.map(fn) }));
  return { ...built, board: { ...built.board, cells } };
}

/** Floors that have templates, in order. */
export function templateFloors() {
  return [...new Set(FLOOR_TEMPLATES.map((t) => t.floor))].sort((a, b) => a - b);
}

export function templatesFor(floor, templates = FLOOR_TEMPLATES) {
  return templates.filter((t) => t.floor === floor);
}

export function templateById(id) {
  return FLOOR_TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * Build one variant of a template. `variant` = { transform, picks, anchors }
 * fully describes it, so telemetry and tests can rebuild it; without one,
 * the base layout is built (no transform, first choices, first anchors).
 * Returns createFloorState() options plus { template, variant }.
 */
export function buildFloor(template, variant = baseVariant(template)) {
  const grid = toGrid(transformRows(template.rows, variant.transform));
  const under = (template.under || []).map((g) => transformRows(g, variant.transform));
  let n = 0;
  const rows = grid.map((r) => r.map((ch) => {
    const choices = template.vary && template.vary[ch];
    return choices ? choices[variant.picks[n++] ?? 0] : ch;
  }).join(' '));
  const parsed = parseMap(rows, { under });
  const enemies = [...parsed.enemies];
  let a = 0;
  for (const group of template.enemies || []) {
    for (let i = 0; i < group.count; i++) {
      const spot = parsed.anchors[variant.anchors[a++]];
      if (spot) enemies.push({ kind: group.kind, ...spot });
    }
  }
  return { board: parsed.board, player: parsed.player, enemies, charges: template.charges, template, variant };
}

/** The template's base variant (first choices, first anchors). */
export function baseVariant(template) {
  return {
    transform: 'id',
    picks: varyCounts(template, 'id').map(() => 0),
    anchors: Array.from({ length: Math.min(enemyCount(template), countAnchors(template)) }, (_, i) => i),
  };
}

/**
 * A seeded variant of a template. Anchors are listed group by group
 * (template.enemies order), ascending within a group, so every roll is one
 * of allVariants().
 */
export function rollVariant(template, rng) {
  const transform = pick(rng, template.transforms || ['id']);
  const picks = varyCounts(template, transform).map((n) => nextInt(rng, 0, n));
  const total = countAnchors(template);
  const order = shuffle(rng, Array.from({ length: total }, (_, i) => i));
  const anchors = [];
  for (const size of groupSizes(template)) anchors.push(...order.splice(0, size).sort((a, b) => a - b));
  return { transform, picks, anchors };
}

/**
 * Every variant of a template (transforms × choices × anchor picks), for
 * the tests that prove each one. Keep `vary` cells and anchors few so this
 * stays small.
 */
export function allVariants(template) {
  const out = [];
  const anchorSets = anchorAssignments(countAnchors(template), groupSizes(template));
  for (const transform of template.transforms || ['id']) {
    for (const picks of product(varyCounts(template, transform))) {
      for (const anchors of anchorSets) out.push({ transform, picks, anchors });
    }
  }
  return out;
}

/**
 * Check a built floor: solvable within the caps, and each of the
 * template's `needs` essential. Returns { ok, solution, reason }; reason is
 * 'unsolvable', 'capped' (not proven either way) or 'needless:<id>'.
 */
export function checkFloor(built, solveOpts = RUNTIME_SOLVE, { needs = true } = {}) {
  const solution = solve(createFloorState(built), solveOpts);
  if (!solution.solvable) return { ok: false, solution, reason: solution.capped ? 'capped' : 'unsolvable' };
  for (const id of needs ? built.template.needs || [] : []) {
    const without = NEEDS[id](built);
    const result = solve(createFloorState(without.built), { ...solveOpts, ...without.solveOpts });
    if (result.solvable || result.capped) return { ok: false, solution, reason: `needless:${id}` };
  }
  return { ok: true, solution, reason: null };
}

/**
 * Seeded floor for floor number `floor`: { setup, info }.
 *   setup  createFloorState() options
 *   info   plain data describing the floor (template id, variant, how it
 *          was checked) for the HUD, hints and telemetry
 * Same floor + seed → same floor on every device. `templates` defaults to
 * FLOOR_TEMPLATES (tests and later phases can pass their own pool).
 */
export function generateFloor(floor, seed, { solveOpts = RUNTIME_SOLVE, templates = FLOOR_TEMPLATES } = {}) {
  const options = templatesFor(floor, templates);
  if (!options.length) throw new Error(`No templates for floor ${floor}`);
  const rng = fork(createRng(seed), `floor-${floor}`);
  const template = pickWeighted(rng, options, (t) => t.weight ?? 1);
  const rejected = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = buildFloor(template, rollVariant(template, fork(rng, `variant-${attempt}`)));
    if (!template.checkAtRuntime) return finish(built, attempt, rejected, 'tested');
    const check = checkFloor(built, solveOpts, { needs: false });
    if (check.ok) return finish(built, attempt, rejected, 'runtime');
    rejected.push(check.reason);
  }
  return finish(buildFloor(template), -1, rejected, 'fallback');
}

function finish(built, attempt, rejected, checked) {
  const { template, variant, ...setup } = built;
  return {
    setup,
    info: {
      floor: template.floor,
      templateId: template.id,
      variant,
      attempt, // -1: every roll failed and the base layout was used
      rejected,
      checked, // 'tested' (proven by the test suite), 'runtime' or 'fallback'
      hints: template.hints || [],
    },
  };
}

/** Choice count per `vary` cell, in the transformed grid's reading order. */
function varyCounts(template, transform) {
  if (!template.vary) return [];
  const grid = toGrid(transformRows(template.rows, transform));
  return grid.flat().filter((ch) => template.vary[ch]).map((ch) => template.vary[ch].length);
}

function countAnchors(template) {
  return toGrid(template.rows).flat().filter((ch) => ch === '?').length;
}

function enemyCount(template) {
  return (template.enemies || []).reduce((n, g) => n + g.count, 0);
}

/**
 * How many anchors each enemy group takes, in template.enemies order;
 * groups past the last free anchor get fewer (or none).
 */
function groupSizes(template) {
  let left = countAnchors(template);
  return (template.enemies || []).map((g) => {
    const n = Math.min(g.count, left);
    left -= n;
    return n;
  });
}

/**
 * Every way to hand anchors to the groups: each group gets a set (listed
 * ascending) of the anchors earlier groups didn't take. With one group
 * this is just its combinations; with kinds mixed, which kind stands where
 * matters, so each split is its own variant.
 */
function anchorAssignments(n, sizes) {
  let out = [[]];
  for (const size of sizes) {
    out = out.flatMap((taken) => {
      const free = Array.from({ length: n }, (_, i) => i).filter((i) => !taken.includes(i));
      return combinations(free.length, size).map((c) => [...taken, ...c.map((i) => free[i])]);
    });
  }
  return out;
}

function product(counts) {
  let out = [[]];
  for (const n of counts) out = out.flatMap((p) => Array.from({ length: n }, (_, i) => [...p, i]));
  return out;
}

function combinations(n, k) {
  const size = Math.min(k, n);
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === size) {
      out.push(acc);
      return;
    }
    for (let i = start; i < n; i++) walk(i + 1, [...acc, i]);
  };
  walk(0, []);
  return out;
}
