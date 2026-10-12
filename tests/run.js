// Runs every tests/*.test.js file. Usage: node tests/run.js [filter]
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { setFile, run } from './harness.js';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith('.test.js')).sort();
for (const file of files) {
  setFile(file);
  await import(pathToFileURL(join(dir, file)).href);
}
const ok = await run({ filter: process.argv[2] || '' });
process.exit(ok ? 0 : 1);
