import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createRun, finishFloor, BOSS_FLOOR } from '../src/core/run.js';
import { runSummary } from '../src/core/summary.js';

const row = (s, id) => s.rows.find((r) => r.id === id);
const won = (run) => ({ ...run, status: 'won', cleared: run.lastFloor, floor: run.lastFloor });

test('summary: a boss win names the Crane and lists the run', () => {
  const run = won({ ...createRun({ seed: 'abc123', spirit: 'fox', relics: ['laminate', 'mender'] }), lastFloor: BOSS_FLOOR, hp: 2 });
  const s = runSummary(run);
  assert.equal(s.outcome, 'won');
  assert.equal(s.title, 'The Crane falls');
  assert.deepEqual(s.rows.map((r) => r.id), ['spirit', 'floors', 'hp', 'relics', 'seed']);
  assert.match(row(s, 'spirit').value, /Fox/);
  assert.equal(row(s, 'floors').value, `${BOSS_FLOOR} / ${BOSS_FLOOR}`);
  assert.equal(row(s, 'hp').value, `2 / ${run.maxHp}`);
  assert.equal(row(s, 'relics').value, '2');
  assert.equal(row(s, 'relics').items.length, 2);
  assert.equal(row(s, 'seed').value, 'abc123');
});

test('summary: a short run (no boss floor) is a plain run complete', () => {
  const s = runSummary(won(createRun({ seed: 's', lastFloor: 3 })));
  assert.equal(s.title, 'Run complete');
  assert.match(s.text, /all 3 floors/);
  assert.equal(row(s, 'spirit').value, 'None');
  assert.equal(row(s, 'relics').value, 'None');
  assert.deepEqual(row(s, 'relics').items, []);
});

test('summary: a loss says where and how, with 0 HP', () => {
  const run = { ...createRun({ seed: 's', spirit: 'turtle', floor: 4, lastFloor: BOSS_FLOOR }), cleared: 3 };
  const lost = finishFloor(run, { status: 'lost', outcome: { cause: 'fall' } });
  const s = runSummary(lost);
  assert.equal(s.outcome, 'lost');
  assert.equal(s.title, 'Torn');
  assert.equal(s.text, 'You fell through the paper on floor 4.');
  assert.equal(row(s, 'floors').value, `3 / ${BOSS_FLOOR}`);
  assert.equal(row(s, 'hp').value, `0 / ${lost.maxHp}`);
  const atBoss = runSummary({ ...lost, floor: BOSS_FLOOR, cause: 'hp' });
  assert.match(atBoss.text, /^Out of HP on floor 9\. The Great Crane/);
});
