/**
 * Canonical ysp-opening-v1 / ysp-batch-v1 fixed-key-order UTF-8 JSON serializer and SHA-256 hasher.
 * Matches contracts/identity-record-evidence/v1/boundary.json & canonical-vectors.json bit-for-bit.
 */

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Validates that a JavaScript UTF-16 string contains zero unpaired surrogates.
 * TextEncoder silently replaces lone surrogates with U+FFFD, so validation must run first.
 */
export function assertValidUnicodeScalars(value: string): string {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) {
        throw new Error('INVALID_UNICODE_SURROGATE: Unpaired high UTF-16 surrogate rejected.');
      }
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('INVALID_UNICODE_SURROGATE: Unpaired low UTF-16 surrogate rejected.');
    }
  }
  return value;
}

function validateScalarTree(value: unknown): void {
  if (value === null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'string') {
    assertValidUnicodeScalars(value);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error('INVALID_CANONICAL_NUMBER: Only finite JSON integers are permitted.');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateScalarTree(item);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const val of Object.values(value as Record<string, unknown>)) {
      if (val === undefined) {
        throw new Error('INVALID_CANONICAL_OMISSION: Explicit nulls required; undefined forbidden.');
      }
      validateScalarTree(val);
    }
    return;
  }
  throw new Error('INVALID_CANONICAL_TYPE: Unsupported value in canonical JSON.');
}

/**
 * Encodes a fixed-key-order JSON value with zero whitespace, no BOM, unescaped slashes,
 * literal UTF-8 Unicode scalars, and strict lone-surrogate rejection.
 */
export function serializeFixedOrderJson(value: unknown): string {
  validateScalarTree(value);
  return JSON.stringify(value);
}

/**
 * Pure TypeScript synchronous SHA-256 returning 64 lowercase hexadecimal chars over UTF-8.
 */
export function sha256Hex(message: string): string {
  assertValidUnicodeScalars(message);
  const utf8 = new TextEncoder().encode(message);
  const bitLen = utf8.length * 8;
  const withOneLen = utf8.length + 1;
  const padZeroLen = (64 - ((withOneLen + 8) % 64)) % 64;
  const totalLen = withOneLen + padZeroLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(utf8);
  padded[utf8.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  const hash = [...SHA256_INIT];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const w16 = w[i - 16] ?? 0;
      const w7 = w[i - 7] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const ki = SHA256_K[i] ?? 0;
      const wi = w[i] ?? 0;
      const temp1 = (h + S1 + ch + ki + wi) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

/**
 * Normalizes a non-negative decimal string (up to 14 integer and 6 fractional digits)
 * to exactly 6 fractional places without converting to floating-point Number.
 */
export function normalizeSixDecimalQuantity(raw: string): string {
  const trimmed = raw.trim();
  if (!/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/.test(trimmed)) {
    return trimmed;
  }
  const [wholePart = '0', fracPart = ''] = trimmed.split('.');
  return `${wholePart}.${fracPart.padEnd(6, '0').slice(0, 6)}`;
}

export function numericIdCompare(a: string, b: string): number {
  const lenDiff = a.length - b.length;
  if (lenDiff !== 0) return lenDiff;
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalizeSortedValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSortedValue(item));
  }
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const val = source[key];
    if (val !== undefined) {
      sorted[key] = canonicalizeSortedValue(val);
    }
  }
  return sorted;
}

/**
 * Deterministic 64-character lowercase SHA-256 hex digest for general payloads / idempotency fingerprints.
 */
export function computeDeterministicHash(payload: unknown): string {
  const sorted = canonicalizeSortedValue(payload);
  validateScalarTree(sorted);
  return sha256Hex(JSON.stringify(sorted));
}

export interface CanonicalRecordRef {
  id: string;
  kind: string;
}

export interface CanonicalLineRef {
  chapter_id: string;
  record: CanonicalRecordRef;
  line_id: string;
  line_kind: string;
  variant_id: string;
}

export interface CanonicalOpeningMaterialInput {
  chapter_id: string;
  record: CanonicalRecordRef;
  cutoff_at: string;
  counted_at: string;
  purpose: string;
  policy_version_id: string;
  counters: ReadonlyArray<{
    user_id: string;
    is_regular_custodian: boolean;
  }>;
  lines: ReadonlyArray<{
    reference: CanonicalLineRef;
    location_id: string;
    custody_assignment_id: string;
    condition_code: string;
    counted_quantity: {
      value: string;
      quantity_scale: number;
    };
    unit_valuation: string;
    valuation_basis: string;
    restriction_version_id: string;
  }>;
}

export function buildCanonicalOpeningMaterial(material: CanonicalOpeningMaterialInput) {
  const seenCounters = new Set<string>();
  const sortedCounters = [...material.counters]
    .sort((a, b) => numericIdCompare(a.user_id, b.user_id))
    .map((c) => {
      if (seenCounters.has(c.user_id)) {
        throw new Error(`DUPLICATE_COUNTER_ID: Duplicate counter user_id "${c.user_id}".`);
      }
      seenCounters.add(c.user_id);
      return {
        user_id: c.user_id,
        is_regular_custodian: c.is_regular_custodian,
      };
    });

  const seenLines = new Set<string>();
  const sortedLines = [...material.lines]
    .sort((a, b) => numericIdCompare(a.reference.line_id, b.reference.line_id))
    .map((l) => {
      if (seenLines.has(l.reference.line_id)) {
        throw new Error(`DUPLICATE_LINE_ID: Duplicate line_id "${l.reference.line_id}".`);
      }
      seenLines.add(l.reference.line_id);
      return {
        reference: {
          chapter_id: l.reference.chapter_id,
          record: {
            id: l.reference.record.id,
            kind: l.reference.record.kind,
          },
          line_id: l.reference.line_id,
          line_kind: l.reference.line_kind,
          variant_id: l.reference.variant_id,
        },
        location_id: l.location_id,
        custody_assignment_id: l.custody_assignment_id,
        condition_code: l.condition_code,
        counted_quantity: {
          value: normalizeSixDecimalQuantity(l.counted_quantity.value),
          quantity_scale: l.counted_quantity.quantity_scale,
        },
        unit_valuation: normalizeSixDecimalQuantity(l.unit_valuation),
        valuation_basis: l.valuation_basis,
        restriction_version_id: l.restriction_version_id,
      };
    });

  return {
    chapter_id: material.chapter_id,
    record: {
      id: material.record.id,
      kind: material.record.kind,
    },
    cutoff_at: material.cutoff_at,
    counted_at: material.counted_at,
    purpose: material.purpose,
    policy_version_id: material.policy_version_id,
    counters: sortedCounters,
    lines: sortedLines,
  };
}

export function serializeOpeningMaterialV1(material: CanonicalOpeningMaterialInput): string {
  return serializeFixedOrderJson(buildCanonicalOpeningMaterial(material));
}

export function computeOpeningMaterialHashV1(material: CanonicalOpeningMaterialInput): string {
  return sha256Hex(serializeOpeningMaterialV1(material));
}

export interface CanonicalRecipientInput {
  name: string;
  user_id: string | null;
  capacity: string;
}

export function serializeRecipientV1(recipient: CanonicalRecipientInput): string {
  return serializeFixedOrderJson({
    name: recipient.name,
    user_id: recipient.user_id,
    capacity: recipient.capacity,
  });
}

export function computeRecipientHashV1(recipient: CanonicalRecipientInput): string {
  return sha256Hex(serializeRecipientV1(recipient));
}

export interface CanonicalBatchSnapshotInput {
  chapter_id: string;
  record: CanonicalRecordRef;
  material_version: number;
  batch_id: string;
  recipient: CanonicalRecipientInput;
  lines: ReadonlyArray<{
    line: CanonicalLineRef;
    quantity: string;
  }>;
}

export function buildCanonicalBatchSnapshot(snapshot: CanonicalBatchSnapshotInput) {
  const seenLines = new Set<string>();
  const sortedLines = [...snapshot.lines]
    .sort((a, b) => numericIdCompare(a.line.line_id, b.line.line_id))
    .map((entry) => {
      if (seenLines.has(entry.line.line_id)) {
        throw new Error(`DUPLICATE_LINE_ID: Duplicate batch line_id "${entry.line.line_id}".`);
      }
      seenLines.add(entry.line.line_id);
      return {
        line: {
          chapter_id: entry.line.chapter_id,
          record: {
            id: entry.line.record.id,
            kind: entry.line.record.kind,
          },
          line_id: entry.line.line_id,
          line_kind: entry.line.line_kind,
          variant_id: entry.line.variant_id,
        },
        quantity: normalizeSixDecimalQuantity(entry.quantity),
      };
    });

  return {
    chapter_id: snapshot.chapter_id,
    record: {
      id: snapshot.record.id,
      kind: snapshot.record.kind,
    },
    material_version: snapshot.material_version,
    batch_id: snapshot.batch_id,
    recipient: {
      name: snapshot.recipient.name,
      user_id: snapshot.recipient.user_id,
      capacity: snapshot.recipient.capacity,
    },
    lines: sortedLines,
  };
}

export function serializeBatchSnapshotV1(snapshot: CanonicalBatchSnapshotInput): string {
  return serializeFixedOrderJson(buildCanonicalBatchSnapshot(snapshot));
}

export function computeBatchSnapshotHashV1(snapshot: CanonicalBatchSnapshotInput): string {
  return sha256Hex(serializeBatchSnapshotV1(snapshot));
}
