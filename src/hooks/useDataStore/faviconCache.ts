import type { LinkItem } from '../../types';
import { FAVICON_CACHE_KEY } from '../../utils/constants';
import { safeLocalStorageGetItem } from '../../utils/storage';

const FAVICON_EXTRACTOR_MARKER = 'faviconextractor.com';

export const readFaviconCache = (): Record<string, string> => {
  const stored = safeLocalStorageGetItem(FAVICON_CACHE_KEY);
  if (!stored) return {};

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const cache: Record<string, string> = {};
    for (const [hostname, iconUrl] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hostname === 'string' && typeof iconUrl === 'string' && iconUrl) {
        cache[hostname] = iconUrl;
      }
    }

    return cache;
  } catch {
    return {};
  }
};

export const hydrateLinksWithFaviconCache = (
  links: LinkItem[],
  cache: Record<string, string>,
): LinkItem[] => {
  let hasCacheEntries = false;
  for (const _hostname in cache) {
    hasCacheEntries = true;
    break;
  }
  if (!hasCacheEntries) return links;

  let didChange = false;

  const nextLinks = links.map((link) => {
    if (!link.url) return link;

    let hostname: string;
    try {
      hostname = new URL(link.url).hostname;
    } catch {
      return link;
    }

    const cachedIcon = cache[hostname];
    if (!cachedIcon) return link;

    const shouldReplace =
      !link.icon ||
      link.icon.includes(FAVICON_EXTRACTOR_MARKER) ||
      !cachedIcon.includes(FAVICON_EXTRACTOR_MARKER);

    if (!shouldReplace) return link;
    if (link.icon === cachedIcon) return link;

    didChange = true;
    return { ...link, icon: cachedIcon };
  });

  return didChange ? nextLinks : links;
};
