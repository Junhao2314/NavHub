const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const ensureSchemeForUrlParse = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (HAS_SCHEME_RE.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

/**
 * Normalize URL for comparison/deduplication.
 *
 * Notes:
 * - Drops scheme/query/hash (compares on hostname + path only)
 * - Removes leading `www.` and trailing slashes
 */
export const normalizeUrlForComparison = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(ensureSchemeForUrlParse(trimmed));
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
};

/**
 * Best-effort domain extraction for grouping.
 */
export const getDomainForComparison = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(ensureSchemeForUrlParse(trimmed));
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split(/[/?#]/, 1)[0];
  }
};
