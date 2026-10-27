// Opt-in aggregates only: never record commands, arguments, URLs, bodies or identities.
import { after } from 'node:test';
import { performance } from 'node:perf_hooks';

const samples = new Map();
function record(category, start) {
  if (process.env.YSP_VERIFY_PROFILE !== '1') return;
  const values = samples.get(category) ?? [];
  values.push(performance.now() - start);
  samples.set(category, values);
}
export function measureSync(category, work) {
  const start = performance.now();
  try { return work(); } finally { record(category, start); }
}
export async function measure(category, work) {
  const start = performance.now();
  try { return await work(); } finally { record(category, start); }
}
after(() => {
  for (const [category, values] of samples) {
    values.sort((a, b) => a - b);
    console.log(`[verification-profile] ${category} count=${values.length} total_ms=${values.reduce((a, b) => a + b, 0).toFixed(1)} p50_ms=${values[Math.floor(values.length / 2)].toFixed(1)} max_ms=${values.at(-1).toFixed(1)}`);
  }
});
