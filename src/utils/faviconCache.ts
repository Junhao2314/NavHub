import { CustomFaviconCache, FaviconCacheEntry } from '../types';
import { FAVICON_CACHE_KEY, FAVICON_CUSTOM_KEY, FAVICON_CUSTOM_META_KEY } from './constants';
import { safeLocalStorageSetItem } from './storage';

/**
 * Favicon Cache Management Module
 *
 * Manages favicon caching with support for distinguishing between
 * user-customized icons and auto-fetched icons.
 *
 * Local Storage Keys:
 * - FAVICON_CACHE_KEY: Complete favicon cache (Record<string, string>)
 * - FAVICON_CUSTOM_KEY: List of hostnames with user-customized icons (string[])
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

/**
 * Get the complete local favicon cache
 * Returns a mapping of hostname to icon URL
 *
 * @returns Record<string, string> - hostname to iconUrl mapping
 */
export const getLocalCache = (): Record<string, string> => {
  try {
    const cached = localStorage.getItem(FAVICON_CACHE_KEY);
    if (!cached) {
      return {};
    }
    const parsed = JSON.parse(cached);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
};

/**
 * Get the list of hostnames with user-customized icons
 *
 * @returns string[] - array of hostnames that have custom icons
 */
const getCustomHostnames = (): string[] => {
  try {
    const cached = localStorage.getItem(FAVICON_CUSTOM_KEY);
    if (!cached) {
      return [];
    }
    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
};

const getCustomIconMeta = (): Record<string, number> => {
  try {
    const cached = localStorage.getItem(FAVICON_CUSTOM_META_KEY);
    if (!cached) {
      return {};
    }
    const parsed = JSON.parse(cached);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const meta: Record<string, number> = {};
    for (const [hostname, updatedAt] of Object.entries(parsed)) {
      if (typeof hostname === 'string' && typeof updatedAt === 'number') {
        meta[hostname] = updatedAt;
      }
    }

    return meta;
  } catch {
    return {};
  }
};

const saveCustomIconMeta = (meta: Record<string, number>): void => {
  safeLocalStorageSetItem(FAVICON_CUSTOM_META_KEY, JSON.stringify(meta));
};

/**
 * Save the list of custom hostnames to localStorage
 */
const saveCustomHostnames = (hostnames: string[]): void => {
  safeLocalStorageSetItem(FAVICON_CUSTOM_KEY, JSON.stringify(hostnames));
};

/**
 * Save the favicon cache to localStorage
 */
const saveLocalCache = (cache: Record<string, string>): void => {
  safeLocalStorageSetItem(FAVICON_CACHE_KEY, JSON.stringify(cache));
};

const normalizeUpdatedAt = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
};

/**
 * Get user-customized icons as FaviconCacheEntry array
 * Only returns entries where the user manually set the icon
 *
 * Requirements: 3.1, 3.4 - Only sync user-customized icons
 *
 * @returns FaviconCacheEntry[] - array of custom icon entries
 */
export const getCustomIcons = (): FaviconCacheEntry[] => {
  const cache = getLocalCache();
  const customHostnames = getCustomHostnames();
  const meta = getCustomIconMeta();

  return customHostnames
    .filter((hostname) => hostname in cache)
    .map((hostname) => ({
      hostname,
      iconUrl: cache[hostname],
      isCustom: true,
      updatedAt: meta[hostname] ?? 0,
    }));
};

/**
 * Set an icon for a hostname
 *
 * Requirements: 3.2 - Mark icons as custom when user manually sets them
 *
 * @param hostname - The hostname (e.g., 'github.com')
 * @param iconUrl - The icon URL (can be data URL or external URL)
 * @param isCustom - true if user manually set, false if auto-fetched
 */
export const setIcon = (hostname: string, iconUrl: string, isCustom: boolean): void => {
  // Update the main cache
  const cache = getLocalCache();
  cache[hostname] = iconUrl;
  saveLocalCache(cache);

  // Update the custom hostnames list
  const customHostnames = getCustomHostnames();
  const isInCustomList = customHostnames.includes(hostname);
  const meta = getCustomIconMeta();

  if (isCustom && !isInCustomList) {
    // Add to custom list
    customHostnames.push(hostname);
    saveCustomHostnames(customHostnames);
    meta[hostname] = Date.now();
    saveCustomIconMeta(meta);
  } else if (!isCustom && isInCustomList) {
    // Remove from custom list
    const filtered = customHostnames.filter((h) => h !== hostname);
    saveCustomHostnames(filtered);
    if (hostname in meta) {
      delete meta[hostname];
      saveCustomIconMeta(meta);
    }
  } else if (isCustom) {
    // Refresh the custom icon timestamp when updating an existing custom icon
    meta[hostname] = Date.now();
    saveCustomIconMeta(meta);
  }
};

/**
 * Merge cloud favicon cache into local cache
 *
 * Requirements:
 * - 3.3: Prefer custom entries when merging
 * - 3.5: Preserve local auto-fetched icons not in synced data
 *
 * @param cloudCache - The CustomFaviconCache from cloud sync
 */
export const mergeFromCloud = (cloudCache: CustomFaviconCache): void => {
  if (!cloudCache || !Array.isArray(cloudCache.entries)) {
    return;
  }

  const localCache = getLocalCache();
  const localCustomHostnames = getCustomHostnames();
  const meta = getCustomIconMeta();

  // Process cloud entries
  for (const entry of cloudCache.entries) {
    if (!entry.hostname || !entry.iconUrl) {
      continue;
    }

    // If cloud entry is not custom, we don't sync it (Requirement 3.4)
    if (!entry.isCustom) {
      continue;
    }

    const hostname = entry.hostname;
    const cloudUpdatedAt = normalizeUpdatedAt(entry.updatedAt);
    const isLocalCustom = localCustomHostnames.includes(hostname);

    // Requirement 3.3: Prefer custom entries.
    // When both local and cloud are custom, resolve conflicts by updatedAt
    // to avoid losing offline edits (prefer newer, keep local on tie).
    if (isLocalCustom && hostname in localCache) {
      const localUpdatedAt = normalizeUpdatedAt(meta[hostname]);
      if (cloudUpdatedAt > localUpdatedAt) {
        localCache[hostname] = entry.iconUrl;
        if (cloudUpdatedAt > 0) {
          meta[hostname] = cloudUpdatedAt;
        }
      }
      continue;
    }

    // Cloud is custom, local is auto-fetched (or missing) - prefer cloud custom
    localCache[hostname] = entry.iconUrl;
    if (!isLocalCustom) {
      localCustomHostnames.push(hostname);
    }

    // Persist updatedAt from cloud so new devices keep stable timestamps.
    if (cloudUpdatedAt > 0) {
      meta[hostname] = cloudUpdatedAt;
    }
    // If cloud entry is not custom, we don't sync it (Requirement 3.4)
    // Local auto-fetched icons are preserved (Requirement 3.5)
  }

  // Save updated cache and custom list
  saveLocalCache(localCache);
  saveCustomHostnames(localCustomHostnames);
  saveCustomIconMeta(meta);
};

/**
 * Build the CustomFaviconCache for syncing to cloud
 * Only includes user-customized icons
 *
 * Requirements: 3.1, 3.4 - Only sync user-customized icons
 *
 * @returns CustomFaviconCache - cache data ready for sync
 */
export const buildSyncCache = (): CustomFaviconCache => {
  const customIcons = getCustomIcons();

  const updatedAt = customIcons.reduce((max, entry) => Math.max(max, entry.updatedAt), 0);

  return {
    entries: customIcons,
    updatedAt,
  };
};

/**
 * Check if a hostname has a custom icon
 *
 * @param hostname - The hostname to check
 * @returns boolean - true if the hostname has a custom icon
 */
export const isCustomIcon = (hostname: string): boolean => {
  const customHostnames = getCustomHostnames();
  return customHostnames.includes(hostname);
};

/**
 * Remove an icon from the cache
 *
 * @param hostname - The hostname to remove
 */
export const removeIcon = (hostname: string): void => {
  // Remove from main cache
  const cache = getLocalCache();
  delete cache[hostname];
  saveLocalCache(cache);

  // Remove from custom list if present
  const customHostnames = getCustomHostnames();
  const filtered = customHostnames.filter((h) => h !== hostname);
  if (filtered.length !== customHostnames.length) {
    saveCustomHostnames(filtered);
  }

  const meta = getCustomIconMeta();
  if (hostname in meta) {
    delete meta[hostname];
    saveCustomIconMeta(meta);
  }
};

/**
 * Get icon URL for a hostname
 *
 * @param hostname - The hostname to look up
 * @returns string | undefined - The icon URL or undefined if not cached
 */
export const getIcon = (hostname: string): string | undefined => {
  const cache = getLocalCache();
  return cache[hostname];
};
