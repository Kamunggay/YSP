import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

export const exampleSlices = ['session', 'enrollment', 'mfa-recovery', 'chapter-context', 'membership', 'duty-grant', 'policy', 'provisioning', 'identity-disable', 'stage1'];

export function buildExamples(slice, exchanges) {
  assert.ok(exampleSlices.includes(slice), `unknown example slice: ${slice}`);
  assert.equal(new Set(exchanges.map(row => row.name)).size, exchanges.length, 'duplicate exchange names');
  return Object.fromEntries(exchanges.filter(row => Object.hasOwn(row.response, 'body')
    && (slice !== 'provisioning' || row.path.startsWith('/provider/'))).map(row => {
    // Preserve the existing documentation labels; response data is authored only
    // in the exchange. Bodyless results have no response-body example.
    const summary = slice === 'enrollment' ? 'Synthetic public fixture; not runtime security evidence'
      : slice === 'mfa-recovery' ? 'Public synthetic fixture, not executed security evidence'
        : slice === 'policy' ? `${row.name} (synthetic)` : row.name;
    return [row.name, { ...(slice === 'provisioning' ? {} : { summary }), value: row.response.body }];
  }));
}

export async function generateExamples({ check = false } = {}) {
  for (const slice of exampleSlices) {
    const exchanges = JSON.parse(await readFile(new URL(`./v1/${slice}-exchanges.json`, import.meta.url), 'utf8'));
    const output = `${JSON.stringify(buildExamples(slice, exchanges), null, 2)}\n`;
    const target = new URL(`./v1/${slice}-examples.json`, import.meta.url);
    if (check) assert.equal((await readFile(target, 'utf8')).replaceAll('\r\n', '\n'), output, `example drift: ${slice}; run npm run generate:fixtures`);
    else await writeFile(target, output);
  }
}
