import { createHash } from 'node:crypto';

// Compare JSON meaning independently of object key order or checkout line endings.
export function jsonDigest(value) {
  function ordered(entry) {
    if (Array.isArray(entry)) return entry.map(ordered);
    if (entry !== null && typeof entry === 'object') {
      return Object.fromEntries(Object.keys(entry).sort().map(key => [key, ordered(entry[key])]));
    }
    return entry;
  }
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}
