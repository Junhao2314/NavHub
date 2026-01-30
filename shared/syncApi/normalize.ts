import type { SyncMetadata } from './types';

export function normalizeSyncMeta(value: unknown): SyncMetadata {
  const meta = value && typeof value === 'object' ? (value as Partial<SyncMetadata>) : {};
  return {
    updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
    deviceId: typeof meta.deviceId === 'string' && meta.deviceId ? meta.deviceId : 'unknown',
    version: typeof meta.version === 'number' ? meta.version : 0,
    browser: typeof meta.browser === 'string' ? meta.browser : undefined,
    os: typeof meta.os === 'string' ? meta.os : undefined,
    syncKind: meta.syncKind === 'manual' ? 'manual' : 'auto',
  };
}
