// The app shell: every file the game loads, found by following index.html
// and the module imports from src/main.js (static imports and re-exports,
// dynamic import(), and new URL('...', import.meta.url) for workers).
// sw.js keeps a hand-written copy of this list (no build step);
// tests/offline.test.js checks the two match.
//
// Usage: node tools/shell-files.js   prints the list, and what sw.js lacks
// or has extra.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Reachable but not cached: the browser fetches the worker script itself to look for updates. */
export const NOT_SHELL = Object.freeze(['sw.js']);

const IMPORT_RES = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from '...', export { y } from '...'
  /\bimport\s*['"]([^'"]+)['"]/g, // import '...'
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, // import('...')
  /\bnew URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g, // workers, assets
];

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** Module specifiers a JS source refers to (relative ones only). */
export function moduleRefs(code) {
  const text = stripComments(code);
  const out = [];
  for (const re of IMPORT_RES) {
    for (const m of text.matchAll(re)) if (/^\.{1,2}\//.test(m[1])) out.push(m[1]);
  }
  return out;
}

/** Local files an HTML page links (src= / href=), skipping data: and other sites. */
export function htmlRefs(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const ref = m[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
    out.push(ref.split(/[?#]/)[0]);
  }
  return out;
}

/** Root-relative paths ('src/main.js') of everything index.html reaches. */
export function reachableFiles(root = ROOT) {
  const seen = new Set();
  const visit = (file) => {
    const rel = relative(root, file).split('\\').join('/');
    if (seen.has(rel)) return;
    if (!existsSync(file)) throw new Error(`Missing file referenced by the app: ${rel}`);
    seen.add(rel);
    if (!file.endsWith('.js')) return;
    for (const ref of moduleRefs(readFileSync(file, 'utf8'))) visit(normalize(join(dirname(file), ref)));
  };
  visit(join(root, 'index.html'));
  for (const ref of htmlRefs(readFileSync(join(root, 'index.html'), 'utf8'))) visit(normalize(join(root, ref)));
  return [...seen].filter((f) => !NOT_SHELL.includes(f)).sort();
}

/** The SHELL list written in sw.js. */
export function swShell(root = ROOT) {
  const code = readFileSync(join(root, 'sw.js'), 'utf8');
  const m = code.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!m) throw new Error('sw.js: no SHELL list');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = reachableFiles();
  console.log(files.map((f) => `  '${f}',`).join('\n'));
  try {
    const shell = new Set(swShell());
    const missing = files.filter((f) => !shell.has(f));
    const extra = [...shell].filter((f) => f !== './' && !files.includes(f));
    if (missing.length) console.log('\nsw.js SHELL lacks:', missing.join(', '));
    if (extra.length) console.log('\nsw.js SHELL has extra:', extra.join(', '));
  } catch (err) {
    console.log(`\n${err.message}`);
  }
}
