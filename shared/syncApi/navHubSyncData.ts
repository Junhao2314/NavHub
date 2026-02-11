import { normalizeSyncMeta } from './normalize';
import type { NavHubSyncData } from './types';

/**
 * NavHubSyncData schema version.
 *
 * Bump this value when the persisted sync payload structure changes.
 */
export const NAVHUB_SYNC_DATA_SCHEMA_VERSION = 2;

type UnknownRecord = Record<string, unknown>;

const normalizeSchemaVersion = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : 0;
};

export const ensureNavHubSyncDataSchemaVersion = (value: unknown): number => {
  return Math.max(normalizeSchemaVersion(value), NAVHUB_SYNC_DATA_SCHEMA_VERSION);
};

/**
 * 验证 LinkItem 必须字段
 */
const isValidLinkItem = (item: unknown): boolean => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const link = item as UnknownRecord;
  return (
    typeof link.id === 'string' &&
    link.id.length > 0 &&
    typeof link.title === 'string' &&
    typeof link.url === 'string' &&
    typeof link.categoryId === 'string' &&
    typeof link.createdAt === 'number'
  );
};

/**
 * 验证 Category 必须字段
 */
const isValidCategory = (item: unknown): boolean => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const category = item as UnknownRecord;
  return (
    typeof category.id === 'string' &&
    category.id.length > 0 &&
    typeof category.name === 'string' &&
    typeof category.icon === 'string'
  );
};

const isValidCountdownRecurrence = (value: unknown): boolean => {
  return (
    value === 'once' ||
    value === 'daily' ||
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'yearly'
  );
};

/**
 * 验证 CountdownItem 必须字段
 */
const isValidCountdownItem = (item: unknown): boolean => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const countdown = item as UnknownRecord;

  const targetDate = countdown.targetDate;
  const targetMs = typeof targetDate === 'string' ? new Date(targetDate).getTime() : NaN;

  return (
    typeof countdown.id === 'string' &&
    countdown.id.length > 0 &&
    typeof countdown.title === 'string' &&
    countdown.title.length > 0 &&
    typeof targetDate === 'string' &&
    Number.isFinite(targetMs) &&
    isValidCountdownRecurrence(countdown.recurrence) &&
    typeof countdown.createdAt === 'number' &&
    Number.isFinite(countdown.createdAt)
  );
};

/**
 * 验证可选的字符串字段
 */
const normalizeOptionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

/**
 * 验证可选的对象字段（用于 searchConfig, aiConfig, siteSettings 等）
 */
const normalizeOptionalObject = <T>(value: unknown): T | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as T;
};

export const normalizeNavHubSyncData = (value: unknown): NavHubSyncData | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as UnknownRecord;

  // 验证 links 必须是数组
  const rawLinks = record.links;
  if (!Array.isArray(rawLinks)) return null;

  // 过滤无效的 link 项
  const links = rawLinks.filter(isValidLinkItem);

  // 验证 categories 必须是数组
  const rawCategories = record.categories;
  if (!Array.isArray(rawCategories)) return null;

  // 过滤无效的 category 项
  const categories = rawCategories.filter(isValidCategory);

  // countdowns 可选字段：允许空数组（表示清空）
  const rawCountdowns = record.countdowns;
  const countdowns = Array.isArray(rawCountdowns)
    ? rawCountdowns.filter(isValidCountdownItem)
    : undefined;

  // 规范化 meta
  const meta = normalizeSyncMeta(record.meta);

  return {
    schemaVersion: ensureNavHubSyncDataSchemaVersion(record.schemaVersion),
    links,
    categories,
    countdowns,
    meta,
    // 可选字段验证
    searchConfig: normalizeOptionalObject(record.searchConfig),
    aiConfig: normalizeOptionalObject(record.aiConfig),
    siteSettings: normalizeOptionalObject(record.siteSettings),
    privateVault: normalizeOptionalString(record.privateVault),
    privacyConfig: normalizeOptionalObject(record.privacyConfig),
    themeMode: normalizeOptionalString(record.themeMode) as NavHubSyncData['themeMode'],
    encryptedSensitiveConfig: normalizeOptionalString(record.encryptedSensitiveConfig),
    customFaviconCache: normalizeOptionalObject(record.customFaviconCache),
  };
};
