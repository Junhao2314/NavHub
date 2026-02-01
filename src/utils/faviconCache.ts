/**
 * Favicon Cache Management Module
 * Favicon 缓存管理模块
 *
 * Manages favicon caching with support for distinguishing between
 * user-customized icons and auto-fetched icons.
 * 管理 favicon 缓存，支持区分用户自定义图标和自动获取的图标。
 *
 * Local Storage Keys / 本地存储键:
 * - FAVICON_CACHE_KEY: Complete favicon cache (Record<string, string>)
 *   完整的 favicon 缓存（主机名到图标 URL 的映射）
 * - FAVICON_CUSTOM_KEY: List of hostnames with user-customized icons (string[])
 *   用户自定义图标的主机名列表
 * - FAVICON_CUSTOM_META_KEY: Metadata for custom icons (hostname -> updatedAt)
 *   自定义图标的元数据（主机名 -> 更新时间）
 *
 * Requirements / 需求: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { CustomFaviconCache, FaviconCacheEntry } from '../types';
import { FAVICON_CACHE_KEY, FAVICON_CUSTOM_KEY, FAVICON_CUSTOM_META_KEY } from './constants';
import { safeLocalStorageSetItem } from './storage';

/**
 * Get the complete local favicon cache
 * 获取完整的本地 favicon 缓存
 *
 * @returns Record<string, string> - hostname to iconUrl mapping / 主机名到图标 URL 的映射
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
 * 获取用户自定义图标的主机名列表
 *
 * @returns string[] - array of hostnames that have custom icons / 拥有自定义图标的主机名数组
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

/**
 * Get custom icon metadata (hostname -> updatedAt timestamp)
 * 获取自定义图标元数据（主机名 -> 更新时间戳）
 */
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

/**
 * Save custom icon metadata to localStorage
 * 保存自定义图标元数据到 localStorage
 */
const saveCustomIconMeta = (meta: Record<string, number>): void => {
  safeLocalStorageSetItem(FAVICON_CUSTOM_META_KEY, JSON.stringify(meta));
};

/**
 * Save the list of custom hostnames to localStorage
 * 保存自定义主机名列表到 localStorage
 */
const saveCustomHostnames = (hostnames: string[]): void => {
  safeLocalStorageSetItem(FAVICON_CUSTOM_KEY, JSON.stringify(hostnames));
};

/**
 * Save the favicon cache to localStorage
 * 保存 favicon 缓存到 localStorage
 */
const saveLocalCache = (cache: Record<string, string>): void => {
  safeLocalStorageSetItem(FAVICON_CACHE_KEY, JSON.stringify(cache));
};

/**
 * Normalize updatedAt value to valid timestamp
 * 将 updatedAt 值标准化为有效时间戳
 */
const normalizeUpdatedAt = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
};

/**
 * Get user-customized icons as FaviconCacheEntry array
 * 获取用户自定义图标（FaviconCacheEntry 数组格式）
 *
 * Only returns entries where the user manually set the icon.
 * 仅返回用户手动设置的图标条目。
 *
 * Requirements / 需求: 3.1, 3.4 - Only sync user-customized icons / 仅同步用户自定义图标
 *
 * @returns FaviconCacheEntry[] - array of custom icon entries / 自定义图标条目数组
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
 * 为主机名设置图标
 *
 * Requirements / 需求: 3.2 - Mark icons as custom when user manually sets them
 * 当用户手动设置图标时标记为自定义
 *
 * @param hostname - The hostname (e.g., 'github.com') / 主机名（如 'github.com'）
 * @param iconUrl - The icon URL (can be data URL or external URL) / 图标 URL（可以是 data URL 或外部 URL）
 * @param isCustom - true if user manually set, false if auto-fetched / true 表示用户手动设置，false 表示自动获取
 */
export const setIcon = (hostname: string, iconUrl: string, isCustom: boolean): void => {
  // Update the main cache / 更新主缓存
  const cache = getLocalCache();
  cache[hostname] = iconUrl;
  saveLocalCache(cache);

  // Update the custom hostnames list / 更新自定义主机名列表
  const customHostnames = getCustomHostnames();
  const isInCustomList = customHostnames.includes(hostname);
  const meta = getCustomIconMeta();

  if (isCustom && !isInCustomList) {
    // Add to custom list / 添加到自定义列表
    customHostnames.push(hostname);
    saveCustomHostnames(customHostnames);
    meta[hostname] = Date.now();
    saveCustomIconMeta(meta);
  } else if (!isCustom && isInCustomList) {
    // Remove from custom list / 从自定义列表移除
    const filtered = customHostnames.filter((h) => h !== hostname);
    saveCustomHostnames(filtered);
    if (hostname in meta) {
      delete meta[hostname];
      saveCustomIconMeta(meta);
    }
  } else if (isCustom) {
    // Refresh the custom icon timestamp when updating an existing custom icon
    // 更新现有自定义图标时刷新时间戳
    meta[hostname] = Date.now();
    saveCustomIconMeta(meta);
  }
};

/**
 * Merge cloud favicon cache into local cache
 * 将云端 favicon 缓存合并到本地缓存
 *
 * Requirements / 需求:
 * - 3.3: Prefer custom entries when merging / 合并时优先使用自定义条目
 * - 3.5: Preserve local auto-fetched icons not in synced data / 保留未同步的本地自动获取图标
 *
 * @param cloudCache - The CustomFaviconCache from cloud sync / 来自云同步的 CustomFaviconCache
 */
export const mergeFromCloud = (cloudCache: CustomFaviconCache): void => {
  if (!cloudCache || !Array.isArray(cloudCache.entries)) {
    return;
  }

  const localCache = getLocalCache();
  const localCustomHostnames = getCustomHostnames();
  const meta = getCustomIconMeta();

  // Process cloud entries / 处理云端条目
  for (const entry of cloudCache.entries) {
    if (!entry.hostname || !entry.iconUrl) {
      continue;
    }

    // If cloud entry is not custom, we don't sync it (Requirement 3.4)
    // 如果云端条目不是自定义的，我们不同步它（需求 3.4）
    if (!entry.isCustom) {
      continue;
    }

    const hostname = entry.hostname;
    const cloudUpdatedAt = normalizeUpdatedAt(entry.updatedAt);
    const isLocalCustom = localCustomHostnames.includes(hostname);

    // Requirement 3.3: Prefer custom entries.
    // 需求 3.3：优先使用自定义条目
    // When both local and cloud are custom, resolve conflicts by updatedAt
    // 当本地和云端都是自定义时，通过 updatedAt 解决冲突
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
    // 云端是自定义的，本地是自动获取的（或缺失）- 优先使用云端自定义
    localCache[hostname] = entry.iconUrl;
    if (!isLocalCustom) {
      localCustomHostnames.push(hostname);
    }

    // Persist updatedAt from cloud so new devices keep stable timestamps.
    // 保留云端的 updatedAt，使新设备保持稳定的时间戳
    if (cloudUpdatedAt > 0) {
      meta[hostname] = cloudUpdatedAt;
    }
  }

  // Save updated cache and custom list / 保存更新后的缓存和自定义列表
  saveLocalCache(localCache);
  saveCustomHostnames(localCustomHostnames);
  saveCustomIconMeta(meta);
};

/**
 * Build the CustomFaviconCache for syncing to cloud
 * 构建用于同步到云端的 CustomFaviconCache
 *
 * Only includes user-customized icons.
 * 仅包含用户自定义图标。
 *
 * Requirements / 需求: 3.1, 3.4 - Only sync user-customized icons / 仅同步用户自定义图标
 *
 * @returns CustomFaviconCache - cache data ready for sync / 准备同步的缓存数据
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
 * 检查主机名是否有自定义图标
 *
 * @param hostname - The hostname to check / 要检查的主机名
 * @returns boolean - true if the hostname has a custom icon / 如果主机名有自定义图标则返回 true
 */
export const isCustomIcon = (hostname: string): boolean => {
  const customHostnames = getCustomHostnames();
  return customHostnames.includes(hostname);
};

/**
 * Remove an icon from the cache
 * 从缓存中移除图标
 *
 * @param hostname - The hostname to remove / 要移除的主机名
 */
export const removeIcon = (hostname: string): void => {
  // Remove from main cache / 从主缓存移除
  const cache = getLocalCache();
  delete cache[hostname];
  saveLocalCache(cache);

  // Remove from custom list if present / 如果存在则从自定义列表移除
  const customHostnames = getCustomHostnames();
  const filtered = customHostnames.filter((h) => h !== hostname);
  if (filtered.length !== customHostnames.length) {
    saveCustomHostnames(filtered);
  }

  // Remove from metadata / 从元数据移除
  const meta = getCustomIconMeta();
  if (hostname in meta) {
    delete meta[hostname];
    saveCustomIconMeta(meta);
  }
};

/**
 * Get icon URL for a hostname
 * 获取主机名的图标 URL
 *
 * @param hostname - The hostname to look up / 要查找的主机名
 * @returns string | undefined - The icon URL or undefined if not cached / 图标 URL，未缓存时返回 undefined
 */
export const getIcon = (hostname: string): string | undefined => {
  const cache = getLocalCache();
  return cache[hostname];
};
