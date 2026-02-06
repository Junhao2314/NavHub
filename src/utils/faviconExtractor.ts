import { normalizeHttpUrl } from './url';

const FAVICON_EXTRACTOR_BASE_URL = 'https://www.faviconextractor.com/favicon';

export const buildFaviconExtractorUrlFromHostname = (hostname: string): string => {
  const trimmed = hostname.trim();
  if (!trimmed) return '';
  return `${FAVICON_EXTRACTOR_BASE_URL}/${trimmed}?larger=true`;
};

export const getHostnameFromUrlInput = (input: string): string | null => {
  const normalized = normalizeHttpUrl(input);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
};

export const buildFaviconExtractorUrlFromUrlInput = (input: string): string | null => {
  const hostname = getHostnameFromUrlInput(input);
  if (!hostname) return null;
  const url = buildFaviconExtractorUrlFromHostname(hostname);
  return url || null;
};
