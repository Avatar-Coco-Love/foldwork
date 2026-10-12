// Replays recorded floors from telemetry and checks they come out the same.
// Usage: node tools/replay-check.js telemetry-data/events-*.ndjson
//
// This is the pattern for answering new questions from old data: rebuild
// the floor from its floor.end event (seed, template, variant), replay the
// action log through the real rules (core/replay.js), and measure whatever
// you like on the states along the way. Logs from a different LOGIC_VERSION
// are skipped, since the rules they were played under have changed.
import { readFileSync } from 'node:fs';
import { templateById, buildFloor } from '../src/core/floors.js';
import { createFloorState } from '../src/core/turn.js';
import { replay } from '../src/core/replay.js';
import { LOGIC_VERSION } from '../src/config.js';

export function checkFloorEnd(ev) {
  const d = ev.data;
  if (ev.logic !== LOGIC_VERSION) return { skip: `logic v${ev.logic}` };
  const template = d.source === 'template' && templateById(d.templateId);
  if (!template || !d.variant) return { skip: 'not a template floor' };
  if (d.overrides) return { skip: 'dev overrides' };
  const start = createFloorState(buildFloor(template, d.variant));
  const { state, refused } = replay(start, d.log.map((entry) => entry[1]));
  const loggedRefused = d.log.flatMap((entry, i) => (entry.length > 3 ? [i] : []));
  const outcome = state.status === 'playing' ? 'abandoned' : state.status;
  const problems = [];
  if (outcome !== d.outcome) problems.push(`outcome ${outcome} ≠ logged ${d.outcome}`);
  if (state.turn !== d.turn) problems.push(`turn ${state.turn} ≠ logged ${d.turn}`);
  if (refused.join() !== loggedRefused.join()) problems.push(`refused [${refused}] ≠ logged [${loggedRefused}]`);
  return { ok: problems.length === 0, problems, state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let ok = 0;
  let bad = 0;
  let skipped = 0;
  for (const file of process.argv.slice(2)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line);
      if (ev.type !== 'floor.end') continue;
      const r = checkFloorEnd(ev);
      if (r.skip) skipped++;
      else if (r.ok) ok++;
      else {
        bad++;
        console.log(`✗ ${ev.id} floor ${ev.data.floor} (${ev.data.templateId}): ${r.problems.join('; ')}`);
      }
    }
  }
  console.log(`${ok} replayed identically, ${bad} differ, ${skipped} skipped`);
  process.exit(bad ? 1 : 0);
}
