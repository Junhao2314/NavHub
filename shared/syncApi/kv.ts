import { sanitizeSensitiveData } from './sanitize';
import type { Env, NavHubSyncData, SyncHistoryIndex, SyncHistoryIndexItem, SyncHistoryKind, SyncMetadata } from './types';

// KV Key 常量
export const KV_MAIN_DATA_KEY = 'ynav:data';
export const KV_BACKUP_PREFIX = 'ynav:backup:';
export const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60;
const KV_SYNC_HISTORY_PREFIX = `${KV_BACKUP_PREFIX}history-`;
const MAX_SYNC_HISTORY = 20;
const KV_SYNC_HISTORY_INDEX_KEY = 'ynav:sync_history_index';
const LEGACY_KV_SYNC_HISTORY_INDEX_KEY = 'navhub:sync_history_index';
export const SYNC_HISTORY_INDEX_VERSION = 1;
const SYNC_HISTORY_INDEX_SOURCES = ['ynav', 'navhub'];

// Legacy keys (backwards compatibility for older deployments)
const LEGACY_KV_MAIN_DATA_KEY = 'navhub:data';
const LEGACY_KV_BACKUP_PREFIX = 'navhub:backup:';
const LEGACY_KV_SYNC_HISTORY_PREFIX = `${LEGACY_KV_BACKUP_PREFIX}history-`;

export const isBackupKey = (key: string): boolean => {
    return key.startsWith(KV_BACKUP_PREFIX) || key.startsWith(LEGACY_KV_BACKUP_PREFIX);
};

export const isSyncHistoryKey = (key: string): boolean => {
    return key.startsWith(KV_SYNC_HISTORY_PREFIX) || key.startsWith(LEGACY_KV_SYNC_HISTORY_PREFIX);
};

const stripBackupPrefix = (key: string): string => {
    if (key.startsWith(KV_BACKUP_PREFIX)) return key.slice(KV_BACKUP_PREFIX.length);
    if (key.startsWith(LEGACY_KV_BACKUP_PREFIX)) return key.slice(LEGACY_KV_BACKUP_PREFIX.length);
    return key;
};

export const getBackupTimestampForDisplay = (key: string): string => {
    const stripped = stripBackupPrefix(key);
    if (!stripped.startsWith('history-')) return stripped;
    const underscoreIndex = stripped.indexOf('_');
    if (underscoreIndex === -1) return stripped;
    return stripped.slice(0, underscoreIndex);
};

export const getMainData = async (env: Env): Promise<NavHubSyncData | null> => {
    const current = await env.YNAV_KV.get(KV_MAIN_DATA_KEY, 'json') as NavHubSyncData | null;
    if (current) return current;

    const legacy = await env.YNAV_KV.get(LEGACY_KV_MAIN_DATA_KEY, 'json') as NavHubSyncData | null;
    if (!legacy) return null;

    // Write-through migration (best-effort)
    try {
        await env.YNAV_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(sanitizeSensitiveData(legacy)));
    } catch {
        // ignore migration failures
    }

    return legacy;
};

export const normalizeSyncKind = (value: unknown): SyncHistoryKind => {
    return value === 'manual' ? 'manual' : 'auto';
};

type CryptoLike = {
    getRandomValues?: (array: Uint8Array) => void;
    randomUUID?: () => string;
};

const bytesToHex = (bytes: Uint8Array): string => {
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};

const randomHex = (byteCount: number): string => {
    const normalizedByteCount = Number.isFinite(byteCount) ? Math.max(0, Math.floor(byteCount)) : 0;
    if (normalizedByteCount === 0) return '';

    const cryptoObj = (globalThis as unknown as { crypto?: CryptoLike }).crypto;
    if (cryptoObj) {
        if (typeof cryptoObj.getRandomValues === 'function') {
            const bytes = new Uint8Array(normalizedByteCount);
            cryptoObj.getRandomValues(bytes);
            return bytesToHex(bytes);
        }
        if (typeof cryptoObj.randomUUID === 'function') {
            const hexLength = normalizedByteCount * 2;
            let hex = '';
            // Fallback when `crypto.getRandomValues()` is unavailable: UUID v4 has fixed version/variant bits,
            // so the derived hex isn't perfectly uniform random; acceptable for best-effort suffixes (e.g., history keys).
            while (hex.length < hexLength) {
                hex += cryptoObj.randomUUID().replace(/-/g, '');
            }
            return hex.slice(0, hexLength);
        }
    }

    const bytes = new Uint8Array(normalizedByteCount);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
    }
    return bytesToHex(bytes);
};

const buildHistoryKey = (now: number): string => {
    const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    return `${KV_SYNC_HISTORY_PREFIX}${timestamp}_${randomHex(4)}`;
};

const normalizeSyncMeta = (value: unknown): SyncMetadata => {
    const meta = value && typeof value === 'object' ? (value as Partial<SyncMetadata>) : {};
    return {
        updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
        deviceId: typeof meta.deviceId === 'string' && meta.deviceId ? meta.deviceId : 'unknown',
        version: typeof meta.version === 'number' ? meta.version : 0,
        browser: typeof meta.browser === 'string' ? meta.browser : undefined,
        os: typeof meta.os === 'string' ? meta.os : undefined,
        syncKind: meta.syncKind === 'manual' ? 'manual' : 'auto'
    };
};

const isSyncMetaComplete = (meta: SyncMetadata | undefined): boolean => {
    if (!meta) return false;
    if (meta.updatedAt <= 0) return false;
    if (meta.version <= 0) return false;
    return meta.deviceId !== 'unknown';
};

const isSameSyncMeta = (a: SyncMetadata, b: SyncMetadata): boolean => {
    return a.updatedAt === b.updatedAt
        && a.deviceId === b.deviceId
        && a.version === b.version
        && a.browser === b.browser
        && a.os === b.os
        && a.syncKind === b.syncKind;
};

const shouldWriteSyncHistoryIndex = (existing: SyncHistoryIndex | null, next: SyncHistoryIndex): boolean => {
    if (!existing) return true;
    if (existing.items.length !== next.items.length) return true;
    for (let idx = 0; idx < next.items.length; idx += 1) {
        const existingItem = existing.items[idx];
        const nextItem = next.items[idx];
        if (existingItem.key !== nextItem.key) return true;
        if (!isSameSyncMeta(existingItem.meta, nextItem.meta)) return true;
    }
    return false;
};

const compareSyncHistoryKeysDesc = (aKey: string, bKey: string): number => {
    const aSort = stripBackupPrefix(aKey);
    const bSort = stripBackupPrefix(bKey);
    const diff = bSort.localeCompare(aSort);
    if (diff !== 0) return diff;
    return bKey.localeCompare(aKey);
};

const hasAllSyncHistorySources = (index: SyncHistoryIndex): boolean => {
    const sources = index.sources;
    if (!Array.isArray(sources)) return false;
    return SYNC_HISTORY_INDEX_SOURCES.every((value) => sources.includes(value));
};

const parseSyncHistoryIndex = (value: unknown): SyncHistoryIndex | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { version?: unknown; items?: unknown; sources?: unknown };
    if (raw.version !== SYNC_HISTORY_INDEX_VERSION) return null;
    if (!Array.isArray(raw.items)) return null;

    const sources = Array.isArray(raw.sources)
        ? raw.sources.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : undefined;

    const items: SyncHistoryIndexItem[] = [];
    for (const item of raw.items) {
        if (!item || typeof item !== 'object') continue;
        const rawItem = item as { key?: unknown; meta?: unknown };
        if (typeof rawItem.key !== 'string') continue;
        if (!isSyncHistoryKey(rawItem.key)) continue;
        items.push({ key: rawItem.key, meta: normalizeSyncMeta(rawItem.meta) });
    }

    items.sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key));
    return { version: SYNC_HISTORY_INDEX_VERSION, items, sources };
};

export const readSyncHistoryIndex = async (env: Env): Promise<SyncHistoryIndex | null> => {
    const current = await env.YNAV_KV.get(KV_SYNC_HISTORY_INDEX_KEY, 'json') as unknown;
    const parsedCurrent = parseSyncHistoryIndex(current);
    if (parsedCurrent) {
        if (hasAllSyncHistorySources(parsedCurrent)) return parsedCurrent;

        // Older index versions may not include legacy sources; self-heal once.
        try {
            const legacyRaw = await env.YNAV_KV.get(LEGACY_KV_SYNC_HISTORY_INDEX_KEY, 'json') as unknown;
            const parsedLegacy = parseSyncHistoryIndex(legacyRaw);
            if (parsedLegacy?.items?.length) {
                const mergedMap = new Map<string, SyncHistoryIndexItem>();
                for (const item of parsedCurrent.items) mergedMap.set(item.key, item);
                for (const item of parsedLegacy.items) mergedMap.set(item.key, item);
                const mergedItems = Array.from(mergedMap.values())
                    .filter((item) => isSyncHistoryKey(item.key))
                    .sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key))
                    .slice(0, MAX_SYNC_HISTORY);
                const mergedIndex: SyncHistoryIndex = { version: SYNC_HISTORY_INDEX_VERSION, items: mergedItems };
                await writeSyncHistoryIndex(env, mergedIndex);
                return { ...mergedIndex, sources: SYNC_HISTORY_INDEX_SOURCES };
            }
        } catch {
            // ignore legacy merge failures
        }

        try {
            return await rebuildSyncHistoryIndex(env);
        } catch {
            return parsedCurrent;
        }
    }

    const legacy = await env.YNAV_KV.get(LEGACY_KV_SYNC_HISTORY_INDEX_KEY, 'json') as unknown;
    const parsedLegacy = parseSyncHistoryIndex(legacy);
    if (parsedLegacy) {
        // Write-through migration to reduce future reads.
        try {
            await writeSyncHistoryIndex(env, parsedLegacy);
        } catch {
            // ignore migration failures
        }
        return { ...parsedLegacy, sources: SYNC_HISTORY_INDEX_SOURCES };
    }

    return null;
};

const listAllKeys = async (env: Env, prefix: string): Promise<Array<{ name: string; expiration?: number }>> => {
    const keys: Array<{ name: string; expiration?: number }> = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();

    for (let page = 0; page < 10000; page += 1) {
        const result = await env.YNAV_KV.list({ prefix, limit: 1000, cursor });
        if (Array.isArray(result?.keys)) {
            keys.push(...result.keys);
        }

        const listComplete = result?.list_complete === true;
        const nextCursor = typeof result?.cursor === 'string' && result.cursor ? result.cursor : undefined;
        if (listComplete || !nextCursor) break;

        if (seenCursors.has(nextCursor)) break;
        seenCursors.add(nextCursor);
        cursor = nextCursor;
    }

    return keys;
};

const writeSyncHistoryIndex = async (env: Env, index: SyncHistoryIndex): Promise<void> => {
    await env.YNAV_KV.put(KV_SYNC_HISTORY_INDEX_KEY, JSON.stringify({
        ...index,
        sources: SYNC_HISTORY_INDEX_SOURCES
    }));
};

const rebuildSyncHistoryIndex = async (env: Env): Promise<SyncHistoryIndex> => {
    const [currentKeys, legacyKeys] = await Promise.all([
        listAllKeys(env, KV_SYNC_HISTORY_PREFIX),
        listAllKeys(env, LEGACY_KV_SYNC_HISTORY_PREFIX)
    ]);
    const keys = [...currentKeys, ...legacyKeys];
    if (keys.length === 0) {
        const empty: SyncHistoryIndex = { version: SYNC_HISTORY_INDEX_VERSION, items: [] };
        await writeSyncHistoryIndex(env, empty);
        return empty;
    }

    const sorted = [...keys]
        .filter((key) => isSyncHistoryKey(key.name))
        .sort((a, b) => compareSyncHistoryKeysDesc(a.name, b.name));
    const keep = sorted.slice(0, MAX_SYNC_HISTORY);
    const toDelete = sorted
        .slice(MAX_SYNC_HISTORY)
        .map((key) => key.name)
        .filter(isSyncHistoryKey);

    const items = await Promise.all(keep.map(async (key) => {
        try {
            const data = await env.YNAV_KV.get(key.name, 'json') as NavHubSyncData | null;
            return { key: key.name, meta: normalizeSyncMeta(data?.meta) };
        } catch {
            return { key: key.name, meta: normalizeSyncMeta(null) };
        }
    }));

    const index: SyncHistoryIndex = {
        version: SYNC_HISTORY_INDEX_VERSION,
        items: items.filter((item) => isSyncHistoryKey(item.key)).sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key))
    };

    await writeSyncHistoryIndex(env, index);
    await Promise.all(toDelete.map((key) => env.YNAV_KV.delete(key)));
    return index;
};

export const ensureSyncHistoryIndexForListing = async (env: Env): Promise<SyncHistoryIndex> => {
    const existingIndex = await readSyncHistoryIndex(env);
    const existingMetaByKey = new Map<string, SyncMetadata>();
    for (const item of existingIndex?.items || []) {
        existingMetaByKey.set(item.key, normalizeSyncMeta(item.meta));
    }

    const [currentKeys, legacyKeys] = await Promise.all([
        listAllKeys(env, KV_SYNC_HISTORY_PREFIX),
        listAllKeys(env, LEGACY_KV_SYNC_HISTORY_PREFIX)
    ]);

    const keys = [...currentKeys, ...legacyKeys]
        .filter((key) => isSyncHistoryKey(key.name))
        .sort((a, b) => compareSyncHistoryKeysDesc(a.name, b.name));

    const keep = keys.slice(0, MAX_SYNC_HISTORY);
    const toDelete = keys
        .slice(MAX_SYNC_HISTORY)
        .map((key) => key.name)
        .filter(isSyncHistoryKey);

    const items = await Promise.all(keep.map(async (key) => {
        const cachedMeta = existingMetaByKey.get(key.name);
        if (cachedMeta && isSyncMetaComplete(cachedMeta)) {
            return { key: key.name, meta: cachedMeta };
        }

        try {
            const data = await env.YNAV_KV.get(key.name, 'json') as NavHubSyncData | null;
            return { key: key.name, meta: normalizeSyncMeta(data?.meta ?? cachedMeta) };
        } catch {
            return { key: key.name, meta: normalizeSyncMeta(cachedMeta) };
        }
    }));

    const nextIndex: SyncHistoryIndex = {
        version: SYNC_HISTORY_INDEX_VERSION,
        items: items
            .filter((item) => isSyncHistoryKey(item.key))
            .sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key))
    };

    if (shouldWriteSyncHistoryIndex(existingIndex, nextIndex)) {
        await writeSyncHistoryIndex(env, nextIndex);
    }

    await Promise.all(toDelete.map((key) => env.YNAV_KV.delete(key)));
    return { ...nextIndex, sources: SYNC_HISTORY_INDEX_SOURCES };
};

const updateSyncHistoryIndex = async (env: Env, backupKey: string, meta: SyncMetadata): Promise<void> => {
    const normalizedMeta = normalizeSyncMeta(meta);
    let index = await readSyncHistoryIndex(env);
    if (!index) {
        index = await rebuildSyncHistoryIndex(env);
    }

    const nextItems = [
        { key: backupKey, meta: normalizedMeta },
        ...index.items.filter((item) => item.key !== backupKey)
    ]
        .filter((item) => isSyncHistoryKey(item.key))
        .sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key));

    const kept = nextItems.slice(0, MAX_SYNC_HISTORY);
    const toDelete = nextItems
        .slice(MAX_SYNC_HISTORY)
        .map((item) => item.key)
        .filter(isSyncHistoryKey);

    await writeSyncHistoryIndex(env, { version: SYNC_HISTORY_INDEX_VERSION, items: kept });
    await Promise.all(toDelete.map((key) => env.YNAV_KV.delete(key)));
};

export const removeFromSyncHistoryIndex = async (env: Env, backupKey: string): Promise<void> => {
    const index = await readSyncHistoryIndex(env);
    if (!index) return;
    const nextItems = index.items.filter((item) => item.key !== backupKey);
    if (nextItems.length === index.items.length) return;
    await writeSyncHistoryIndex(env, { version: SYNC_HISTORY_INDEX_VERSION, items: nextItems });
};

export const saveSyncHistory = async (env: Env, data: NavHubSyncData, kind: SyncHistoryKind): Promise<string> => {
    const key = buildHistoryKey(data.meta?.updatedAt || Date.now());
    const payload: NavHubSyncData = sanitizeSensitiveData({
        ...data,
        meta: {
            ...data.meta,
            syncKind: kind
        }
    });
    await env.YNAV_KV.put(key, JSON.stringify(payload));
    try {
        await updateSyncHistoryIndex(env, key, payload.meta);
    } catch {
        // Best-effort: keep API working even if index update fails.
    }
    return key;
};
