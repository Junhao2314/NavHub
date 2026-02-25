import { normalizeSyncMeta } from './normalize';
import type { NavHubSyncData } from './types';

/**
 * NavHubSyncData schema version.
 *
 * Bump this value when the persisted sync payload structure changes.
 */
export const NAVHUB_SYNC_DATA_SCHEMA_VERSION = 3;

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

const isValidCountdownRule = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as UnknownRecord;
  const kind = record.kind;

  if (kind === 'once') return true;

  if (kind === 'interval') {
    return (
      (record.unit === 'day' ||
        record.unit === 'week' ||
        record.unit === 'month' ||
        record.unit === 'year') &&
      typeof record.every === 'number' &&
      Number.isFinite(record.every) &&
      record.every >= 1
    );
  }

  if (kind === 'cron') {
    return typeof record.expression === 'string' && record.expression.trim().length > 0;
  }

  if (kind === 'lunarYearly') {
    return (
      typeof record.month === 'number' &&
      Number.isFinite(record.month) &&
      record.month >= 1 &&
      record.month <= 12 &&
      typeof record.day === 'number' &&
      Number.isFinite(record.day) &&
      record.day >= 1 &&
      record.day <= 30 &&
      (record.isLeapMonth === undefined || typeof record.isLeapMonth === 'boolean')
    );
  }

  if (kind === 'solarTermYearly') {
    return typeof record.term === 'string' && record.term.trim().length > 0;
  }

  return false;
};

const normalizeOptionalNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * 验证 CountdownItem 必须字段
 */
const isValidCountdownItem = (item: unknown): boolean => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const countdown = item as UnknownRecord;

  const targetDate = countdown.targetDate;
  const targetMs = typeof targetDate === 'string' ? new Date(targetDate).getTime() : NaN;

  const hasValidRecurrence = isValidCountdownRecurrence(countdown.recurrence);
  const hasValidRule = isValidCountdownRule(countdown.rule);

  return (
    typeof countdown.id === 'string' &&
    countdown.id.length > 0 &&
    typeof countdown.title === 'string' &&
    countdown.title.length > 0 &&
    typeof targetDate === 'string' &&
    Number.isFinite(targetMs) &&
    (hasValidRule || hasValidRecurrence) &&
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
    ? rawCountdowns.filter(isValidCountdownItem).map((item) => {
        const countdown = item as UnknownRecord;
        const normalized: UnknownRecord = { ...countdown };

        const linkedUrl = normalizeOptionalNonEmptyString(countdown.linkedUrl);
        if (linkedUrl) {
          normalized.linkedUrl = linkedUrl;
        } else {
          delete normalized.linkedUrl;
        }

        return normalized as unknown as NonNullable<NavHubSyncData['countdowns']>[number];
      })
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
