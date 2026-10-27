import { run } from 'node:test';
import { spec } from 'node:test/reporters';

const [file, pattern] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node scripts/run-http-tests.mjs <test-file> [name-pattern]');
  process.exitCode = 1;
} else {
  const results = run({ files: [file], testNamePatterns: pattern ? [new RegExp(pattern)] : undefined,
    timeout: 60000, concurrency: 1 });
  let selected = 0;
  results.on('test:summary', summary => {
    // The parent runner reports a successful file as one test even when its filter
    // matched nothing. Count actual tests from the child file's summary instead.
    if (summary.file) selected += summary.counts.tests - summary.counts.skipped;
    if (!summary.success) process.exitCode = 1;
  });
  results.compose(spec()).pipe(process.stdout);
  results.on('end', () => {
    if (selected === 0) {
      console.log('No tests matched; check the test name pattern.');
      process.exitCode = 1;
    }
  });
}
