const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalize a user-provided URL string for opening in a new tab/window.
 *
 * - Adds `https://` when scheme is missing (keeps existing behavior in NavHub).
 * - Allows only `http:` and `https:` to prevent `javascript:`, `data:`, etc.
 */
export const normalizeHttpUrl = (input: string): string | null => {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith('/') && !trimmed.startsWith('//')) || trimmed.startsWith('?') || trimmed.startsWith('#')) return null;

  let candidate = trimmed;
  if (trimmed.startsWith('//')) {
    candidate = `https:${trimmed}`;
  } else if (!HAS_SCHEME_RE.test(trimmed)) {
    candidate = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;

  return candidate;
};
