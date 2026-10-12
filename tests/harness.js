// Tiny test harness: test(name, fn) registers a test; run() executes them.
// Assertions use node:assert/strict.

const tests = [];
let currentFile = '';

export function setFile(name) {
  currentFile = name;
}

export function test(name, fn) {
  tests.push({ file: currentFile, name, fn });
}

export async function run({ filter = '' } = {}) {
  let passed = 0;
  const failures = [];
  for (const t of tests) {
    const label = `${t.file} › ${t.name}`;
    if (filter && !label.includes(filter)) continue;
    try {
      await t.fn();
      passed++;
    } catch (err) {
      failures.push({ label, err });
      console.log(`  ✗ ${label}`);
    }
  }
  for (const { label, err } of failures) {
    console.log(`\n✗ ${label}\n${err && err.stack ? err.stack : err}`);
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  return failures.length === 0;
}
