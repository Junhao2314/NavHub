import { normalizeSyncMeta } from './normalize';
import type { NavHubSyncData } from './types';

/**
 * NavHubSyncData 的数据结构版本号。
 *
 * - v0：历史数据（未写入 schemaVersion）
 * - v1：引入 schemaVersion 字段（当前）
 */
export const NAVHUB_SYNC_DATA_SCHEMA_VERSION = 1;

type UnknownRecord = Record<string, unknown>;

const normalizeSchemaVersion = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : 0;
};

export const ensureNavHubSyncDataSchemaVersion = (value: unknown): number => {
  return Math.max(normalizeSchemaVersion(value), NAVHUB_SYNC_DATA_SCHEMA_VERSION);
};

const migrateNavHubSyncDataRecord = (value: UnknownRecord): UnknownRecord => {
  const fromVersion = normalizeSchemaVersion(value.schemaVersion);
  if (fromVersion >= NAVHUB_SYNC_DATA_SCHEMA_VERSION) return value;

  let migrated: UnknownRecord = { ...value };

  // v0 -> v1: 写入 schemaVersion 字段。
  if (fromVersion < 1) {
    migrated = { ...migrated, schemaVersion: 1 };
  }

  return migrated;
};

export const normalizeNavHubSyncData = (value: unknown): NavHubSyncData | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const migrated = migrateNavHubSyncDataRecord(value as UnknownRecord);
  const meta = normalizeSyncMeta((migrated as { meta?: unknown }).meta);

  return {
    ...migrated,
    schemaVersion: ensureNavHubSyncDataSchemaVersion(
      (migrated as { schemaVersion?: unknown }).schemaVersion,
    ),
    meta,
  } as NavHubSyncData;
};
