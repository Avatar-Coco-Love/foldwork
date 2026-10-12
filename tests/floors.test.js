import assert from 'node:assert/strict';
import { test } from './harness.js';
import { parseMap, transformRows } from '../src/core/maps.js';
import { topLayer, stackHeight } from '../src/core/board.js';
import { TILE } from '../src/core/tiles.js';
import { createFloorState } from '../src/core/turn.js';
import { solve } from '../src/core/solver.js';
import { replay } from '../src/core/replay.js';
import { HINTS } from '../src/core/hints.js';
import {
  FLOOR_TEMPLATES, NEEDS, templateFloors, templatesFor, buildFloor, baseVariant, rollVariant,
  allVariants, checkFloor, generateFloor,
} from '../src/core/floors.js';
import { createRng } from '../src/core/rng.js';

// Generous caps: the tests are where every variant gets proven.
const PROOF = { maxStates: 20000, maxTurns: 40 };

test('parseMap: `under` grids stack layers beneath the top row symbols', () => {
  const { board, anchors } = parseMap(['E ?', '. @'], { under: [['. _', '_ _'], ['# _', '_ _']] });
  assert.equal(stackHeight(board, 0, 0), 3);
  assert.deepEqual(board.cells[0].layers.map((l) => l.tile), [TILE.FLOOR, TILE.WALL, TILE.EXIT]);
  assert.equal(stackHeight(board, 1, 0), 1);
  assert.deepEqual(anchors, [{ col: 1, row: 0 }]);
  assert.throws(() => parseMap(['. .'], { under: [['.']] }));
});

test('map transforms mirror and rotate rows', () => {
  const rows = ['a b', 'c d'].map((r) => r.replace(/[a-d]/g, (ch) => ({ a: 'E', b: '.', c: '#', d: '@' })[ch]));
  assert.deepEqual(transformRows(rows, 'flipH'), ['. E', '@ #']);
  assert.deepEqual(transformRows(rows, 'flipV'), ['# @', 'E .']);
  assert.deepEqual(transformRows(rows, 'rot180'), ['@ #', '. E']);
  assert.throws(() => transformRows(rows, 'spin'));
});

test('templates: well-formed data covering floors 1–3', () => {
  assert.deepEqual(templateFloors(), [1, 2, 3]);
  const ids = new Set();
  for (const t of FLOOR_TEMPLATES) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    for (const h of t.hints || []) assert.ok(HINTS[h], `${t.id}: unknown hint ${h}`);
    for (const n of t.needs || []) assert.ok(NEEDS[n], `${t.id}: unknown need ${n}`);
    const built = buildFloor(t);
    assert.ok(built.player, `${t.id}: no player start`);
    assert.ok(built.board.w >= 5 && built.board.w <= 8 && built.board.w === built.board.h, `${t.id}: board size`);
  }
  // docs/03: F1–2 are 5x5, F3 is 6x6.
  for (const t of templatesFor(1).concat(templatesFor(2))) assert.equal(buildFloor(t).board.w, 5);
  for (const t of templatesFor(3)) assert.equal(buildFloor(t).board.w, 6);
});

// docs/05: every floor shown must be solvable. Variants are finite, so this
// proves every one, and that each floor really needs what it teaches.
for (const template of FLOOR_TEMPLATES) {
  test(`template ${template.id}: every variant is solvable and needs ${(template.needs || []).join(' + ') || 'nothing'}`, () => {
    const variants = allVariants(template);
    assert.ok(variants.length >= 1);
    for (const v of variants) {
      const built = buildFloor(template, v);
      const check = checkFloor(built, PROOF);
      assert.ok(check.ok, `${template.id} ${JSON.stringify(v)}: ${check.reason}`);
      const result = replay(createFloorState(built), check.solution.actions);
      assert.equal(result.state.status, 'won');
    }
  });
}

test('variants: rolls are seeded and always among allVariants', () => {
  for (const t of FLOOR_TEMPLATES) {
    const all = allVariants(t).map((v) => JSON.stringify(v));
    for (let i = 0; i < 20; i++) {
      const a = rollVariant(t, createRng(`v${i}`));
      assert.deepEqual(a, rollVariant(t, createRng(`v${i}`)));
      // allVariants lists anchor sets in ascending order; rolls are shuffled
      const norm = { ...a, anchors: [...a.anchors].sort((x, y) => x - y) };
      assert.ok(all.includes(JSON.stringify(norm)), `${t.id}: ${JSON.stringify(a)}`);
    }
  }
});

test('buildFloor: variant picks, anchors and transform shape the board', () => {
  const t = FLOOR_TEMPLATES.find((x) => x.id === 'f3-vault');
  const base = buildFloor(t);
  assert.equal(topLayer(base.board, 0, 0).tile, TILE.FLOOR); // '%' → first choice
  assert.equal(base.enemies.length, 2);
  const walls = buildFloor(t, { transform: 'id', picks: [1, 1], anchors: [1, 0] });
  assert.equal(topLayer(walls.board, 0, 0).tile, TILE.WALL);
  assert.equal(topLayer(walls.board, 5, 0).tile, TILE.WALL);
  const flipped = buildFloor(t, { ...baseVariant(t), transform: 'flipH' });
  assert.equal(flipped.player.col, base.board.w - 1 - base.player.col);
  assert.equal(stackHeight(base.board, 0, 1), 3); // thick wall row
  assert.equal(stackHeight(base.board, 2, 1), 1); // the lock
});

test('generateFloor: same floor + seed gives the same floor; seeds vary it', () => {
  for (const n of templateFloors()) {
    const a = generateFloor(n, 'seed-1');
    assert.deepEqual(a, generateFloor(n, 'seed-1'));
    assert.equal(a.info.floor, n);
    assert.equal(a.info.checked, 'tested');
    assert.ok(createFloorState(a.setup));
  }
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const { info } = generateFloor(3, `s${i}`);
    seen.add(`${info.templateId}:${JSON.stringify(info.variant)}`);
  }
  assert.ok(seen.size > 4, `only ${seen.size} distinct floor 3s`);
  assert.throws(() => generateFloor(99, 'x'));
});

test('generateFloor: runtime-checked templates reroll and fall back', () => {
  // Every variant fails, so the base layout is used after MAX_ATTEMPTS.
  const bad = {
    id: 'test-bad', floor: 1, charges: 0, checkAtRuntime: true, transforms: ['id', 'flipH'],
    rows: ['E # .', '# # .', '. . @'],
  };
  const g = generateFloor(1, 'b', { templates: [bad] });
  assert.equal(g.info.checked, 'fallback');
  assert.equal(g.info.attempt, -1);
  assert.deepEqual(g.info.rejected, new Array(6).fill('unsolvable'));
  const good = { ...bad, id: 'test-good', rows: ['E . .', '# # .', '. . @'] };
  const ok = generateFloor(1, 'b', { templates: [good] });
  assert.equal(ok.info.checked, 'runtime');
  assert.equal(ok.info.attempt, 0);
});

test('checkFloor: a floor that does not need its tool is flagged', () => {
  const t = { id: 't', floor: 1, charges: 1, rows: ['E . .', '. . .', '. @ .'], needs: ['fold'] };
  const check = checkFloor(buildFloor(t), PROOF);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'needless:fold');
  assert.equal(solve(createFloorState(buildFloor(t))).solvable, true);
});
