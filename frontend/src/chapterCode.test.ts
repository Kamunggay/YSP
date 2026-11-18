import { describe, expect, it } from 'vitest';
import { generateChapterCode } from './chapterCode';

describe('generateChapterCode', () => {
  const sampleDate = new Date(2026, 10, 16); // Nov 16, 2026 -> 111626

  it('derives YSP-C-111626 from "Youth Service Philippines - Cebu Chapter"', () => {
    expect(generateChapterCode('Youth Service Philippines - Cebu Chapter', sampleDate)).toBe('YSP-C-111626');
  });

  it('skips leading YSP org prefix when computing chapter initial', () => {
    expect(generateChapterCode('YSP Mandaue City', sampleDate)).toBe('YSP-M-111626');
    expect(generateChapterCode('YSP - Toledo Chapter', sampleDate)).toBe('YSP-T-111626');
  });

  it('handles standalone chapter names without org prefix', () => {
    expect(generateChapterCode('Cebu Chapter', sampleDate)).toBe('YSP-C-111626');
    expect(generateChapterCode('davao chapter', sampleDate)).toBe('YSP-D-111626');
  });

  it('returns empty string for blank or incomplete org-prefix-only input', () => {
    expect(generateChapterCode('   ', sampleDate)).toBe('');
    expect(generateChapterCode('YSP', sampleDate)).toBe('');
    expect(generateChapterCode('Youth Service Philippines - ', sampleDate)).toBe('');
  });

  it('produces codes valid for backend ChapterProvisioning validation', () => {
    const code = generateChapterCode('Youth Service Philippines - Cebu Chapter', sampleDate);
    expect(code).toMatch(/^[A-Z][A-Z0-9_-]{0,31}$/);
  });
});
