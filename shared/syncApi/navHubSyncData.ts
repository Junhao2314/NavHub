import { normalizeSyncMeta } from './normalize';
import type { NavHubSyncData } from './types';

/**
 * NavHubSyncData schema version.
 *
 * Bump this value when the persisted sync payload structure changes.
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

export const normalizeNavHubSyncData = (value: unknown): NavHubSyncData | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as UnknownRecord;
  const meta = normalizeSyncMeta((record as { meta?: unknown }).meta);

  return {
    ...record,
    schemaVersion: ensureNavHubSyncDataSchemaVersion(
      (record as { schemaVersion?: unknown }).schemaVersion,
    ),
    meta,
  } as NavHubSyncData;
};
