// Runs every tests/*.test.js file. Usage: node tests/run.js [--fast] [filter]
// --fast skips SLOW_FILES (the floor proofs, ~2 min); run the full suite
// before every PR and whenever floors, the solver or turn rules change.
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { setFile, run } from './harness.js';

const SLOW_FILES = ['floors.test.js'];

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const filter = args.find((a) => !a.startsWith('--')) || '';
const dir = fileURLToPath(new URL('.', import.meta.url));
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !(fast && SLOW_FILES.includes(f)))
  .sort();
for (const file of files) {
  setFile(file);
  await import(pathToFileURL(join(dir, file)).href);
}
if (fast) console.log(`(--fast: skipped ${SLOW_FILES.join(', ')})`);
const ok = await run({ filter });
process.exit(ok ? 0 : 1);
