const ORG_PREFIX_PATTERN = /^(?:youth\s+service\s+philippines|y\.?\s*s\.?\s*p\.?)(?=$|[\s\-–—:,|()/])/i;
const LEADING_SEPARATORS_PATTERN = /^[\s\-–—:,|()/]+/;

/**
 * Derives a canonical Chapter Code (`YSP-<FIRST_LETTER>-<MMDDYY>`) from the
 * entered Chapter Name and creation date (e.g. "Youth Service Philippines - Cebu Chapter"
 * on 2026-11-16 -> "YSP-C-111626").
 */
export function generateChapterCode(chapterName: string, createdAt: Date = new Date()): string {
  const trimmed = chapterName.trim();
  if (!trimmed) return '';

  const withoutOrgPrefix = trimmed.replace(ORG_PREFIX_PATTERN, '').replace(LEADING_SEPARATORS_PATTERN, '');
  const isPureOrgPrefix = withoutOrgPrefix === '' && ORG_PREFIX_PATTERN.test(trimmed);
  if (isPureOrgPrefix) return '';

  const target = withoutOrgPrefix || trimmed;
  const letterMatch = target.match(/[A-Za-z]/) ?? target.match(/[A-Za-z0-9]/);
  if (!letterMatch) return '';

  const initial = letterMatch[0].toUpperCase();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  const year = String(createdAt.getFullYear()).slice(-2);

  return `YSP-${initial}-${month}${day}${year}`;
}
