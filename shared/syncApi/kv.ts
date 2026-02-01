import { normalizeNavHubSyncData } from './navHubSyncData';
import { normalizeSyncMeta } from './normalize';
import { sanitizeSensitiveData } from './sanitize';
import type {
  Env,
  NavHubSyncData,
  SyncHistoryIndex,
  SyncHistoryIndexItem,
  SyncHistoryKind,
  SyncMetadata,
} from './types';

export { normalizeSyncMeta } from './normalize';

/**
 * 同步存储策略
 *
 * - 主数据（navhub:data）:
 *   - 默认存 Cloudflare KV：简单但有 25MB 限制 + 最终一致性。
 *   - 推荐配置 R2：避免 25MB 限制，且可用 ETag 实现条件写（更可靠的乐观锁）。
 *
 * - 备份/同步记录（navhub:backup:*）:
 *   - 仍使用 KV + TTL，便于 list + 自动过期。
 */

// KV Key 常量
export const KV_MAIN_DATA_KEY = 'navhub:data';
export const KV_BACKUP_PREFIX = 'navhub:backup:';
export const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60;
const KV_SYNC_HISTORY_PREFIX = `${KV_BACKUP_PREFIX}history-`;
const MAX_SYNC_HISTORY = 20;
const KV_SYNC_HISTORY_INDEX_KEY = 'navhub:sync_history_index';
export const SYNC_HISTORY_INDEX_VERSION = 1;

// R2 object keys (when configured)
const R2_MAIN_DATA_KEY = 'navhub/data.json';

export const isBackupKey = (key: string): boolean => {
  return key.startsWith(KV_BACKUP_PREFIX);
};

export const isSyncHistoryKey = (key: string): boolean => {
  return key.startsWith(KV_SYNC_HISTORY_PREFIX);
};

const stripBackupPrefix = (key: string): string => {
  if (key.startsWith(KV_BACKUP_PREFIX)) return key.slice(KV_BACKUP_PREFIX.length);
  return key;
};

export const getBackupTimestampForDisplay = (key: string): string => {
  const stripped = stripBackupPrefix(key);
  if (!stripped.startsWith('history-')) return stripped;
  const underscoreIndex = stripped.indexOf('_');
  if (underscoreIndex === -1) return stripped;
  return stripped.slice(0, underscoreIndex);
};

const safeKvGetJson = async (env: Env, key: string): Promise<unknown> => {
  try {
    return (await env.NAVHUB_KV.get(key, { type: 'json', cacheTtl: 0 })) as unknown;
  } catch {
    return null;
  }
};

const getMainDataFromKv = async (env: Env): Promise<NavHubSyncData | null> => {
  return normalizeNavHubSyncData(await safeKvGetJson(env, KV_MAIN_DATA_KEY));
};

export const getMainData = async (env: Env): Promise<NavHubSyncData | null> => {
  const r2 = env.NAVHUB_R2;
  if (!r2) {
    return getMainDataFromKv(env);
  }

  // R2 模式：优先读 R2 主对象（更强一致性 + 避免 KV 25MB 限制）。
  const existing = await r2.get(R2_MAIN_DATA_KEY);
  if (existing) {
    try {
      const parsed = await existing.json<unknown>();
      const normalized = normalizeNavHubSyncData(parsed);
      if (normalized) return normalized;
    } catch {
      // ignore parse failures and fall back to KV
    }
  }

  const kvData = await getMainDataFromKv(env);
  if (!kvData) return null;

  // Best-effort copy to R2 so future reads/writes avoid KV limits & eventual consistency.
  // onlyIf.etagDoesNotMatch('*')：只在对象尚不存在时创建，避免覆盖并发写入的新数据。
  try {
    const payload = sanitizeSensitiveData(kvData);
    const created = await r2.put(R2_MAIN_DATA_KEY, JSON.stringify(payload), {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' },
    });
    if (!created) {
      const refreshed = await r2.get(R2_MAIN_DATA_KEY);
      if (refreshed) return refreshed.json<NavHubSyncData>();
    }
  } catch {
    // ignore R2 copy failures and fall back to KV
  }

  return kvData;
};

export const getMainDataWithEtag = async (
  env: Env,
): Promise<{ data: NavHubSyncData | null; etag?: string }> => {
  const r2 = env.NAVHUB_R2;
  if (!r2) {
    return { data: await getMainDataFromKv(env) };
  }

  // 与 getMainData 类似，但额外返回 etag：用于 handlePost 的条件写（etagMatches）。
  const existing = await r2.get(R2_MAIN_DATA_KEY);
  if (existing) {
    try {
      const parsed = await existing.json<unknown>();
      return { data: normalizeNavHubSyncData(parsed), etag: existing.etag };
    } catch {
      return { data: null, etag: existing.etag };
    }
  }

  const kvData = await getMainDataFromKv(env);
  if (!kvData) return { data: null };

  const payload = sanitizeSensitiveData(kvData);
  try {
    const created = await r2.put(R2_MAIN_DATA_KEY, JSON.stringify(payload), {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' },
    });
    if (created) {
      return { data: payload, etag: created.etag };
    }
  } catch {
    // ignore copy failures
  }

  const refreshed = await r2.get(R2_MAIN_DATA_KEY);
  if (refreshed) {
    return { data: await refreshed.json<NavHubSyncData>(), etag: refreshed.etag };
  }

  return { data: payload };
};

export const putMainData = async (
  env: Env,
  data: NavHubSyncData,
  options?: { onlyIfEtagMatches?: string; onlyIfNotExists?: boolean },
): Promise<boolean> => {
  const r2 = env.NAVHUB_R2;
  if (r2) {
    const onlyIf = options?.onlyIfEtagMatches
      ? { etagMatches: options.onlyIfEtagMatches }
      : options?.onlyIfNotExists
        ? { etagDoesNotMatch: '*' }
        : undefined;

    const result = await r2.put(R2_MAIN_DATA_KEY, JSON.stringify(data), {
      ...(onlyIf ? { onlyIf } : {}),
      httpMetadata: { contentType: 'application/json' },
    });

    if (onlyIf) {
      // 条件写：result 为 null 表示前置条件不满足（并发写导致 etag 不一致）。
      return result !== null;
    }
    // 非条件写：约定总是返回 true（last-write-wins）。
    return true;
  }

  // KV 不支持原子条件写：即使传入 options，也只能执行覆盖写（best-effort optimistic locking 在上层完成）。
  await env.NAVHUB_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(data));
  return true;
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

const compareSyncHistoryKeysDesc = (aKey: string, bKey: string): number => {
  const aSort = stripBackupPrefix(aKey);
  const bSort = stripBackupPrefix(bKey);
  const diff = bSort.localeCompare(aSort);
  if (diff !== 0) return diff;
  return bKey.localeCompare(aKey);
};

const parseSyncHistoryIndex = (value: unknown): SyncHistoryIndex | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { version?: unknown; items?: unknown };
  if (raw.version !== SYNC_HISTORY_INDEX_VERSION) return null;
  if (!Array.isArray(raw.items)) return null;

  const items: SyncHistoryIndexItem[] = [];
  for (const item of raw.items) {
    if (!item || typeof item !== 'object') continue;
    const rawItem = item as { key?: unknown; meta?: unknown };
    if (typeof rawItem.key !== 'string') continue;
    if (!isSyncHistoryKey(rawItem.key)) continue;
    items.push({ key: rawItem.key, meta: normalizeSyncMeta(rawItem.meta) });
  }

  items.sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key));
  return { version: SYNC_HISTORY_INDEX_VERSION, items };
};

export const readSyncHistoryIndex = async (env: Env): Promise<SyncHistoryIndex | null> => {
  const raw = (await env.NAVHUB_KV.get(KV_SYNC_HISTORY_INDEX_KEY, 'json')) as unknown;
  return parseSyncHistoryIndex(raw);
};

const listAllKeys = async (
  env: Env,
  prefix: string,
): Promise<Array<{ name: string; expiration?: number }>> => {
  const keys: Array<{ name: string; expiration?: number }> = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  // KV.list 需要用 cursor 分页；这里设置一个很大的 page 上限 + 游标去重，防止极端情况下无限循环。
  for (let page = 0; page < 10000; page += 1) {
    const result = await env.NAVHUB_KV.list({ prefix, limit: 1000, cursor });
    if (Array.isArray(result?.keys)) {
      keys.push(...result.keys);
    }

    const listComplete = result?.list_complete === true;
    const nextCursor =
      typeof result?.cursor === 'string' && result.cursor ? result.cursor : undefined;
    if (listComplete || !nextCursor) break;

    if (seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return keys;
};

const writeSyncHistoryIndex = async (env: Env, index: SyncHistoryIndex): Promise<void> => {
  await env.NAVHUB_KV.put(KV_SYNC_HISTORY_INDEX_KEY, JSON.stringify(index));
};

const rebuildSyncHistoryIndex = async (env: Env): Promise<SyncHistoryIndex> => {
  // 兜底重建：当 index 丢失/损坏时，通过 list + 读取每个历史项的 meta 来重建。
  // 注意：KV.list 返回的顺序不保证按时间，因此需要手动排序并限制 MAX_SYNC_HISTORY。
  const keys = await listAllKeys(env, KV_SYNC_HISTORY_PREFIX);
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

  const items = await Promise.all(
    keep.map(async (key) => {
      try {
        const data = (await env.NAVHUB_KV.get(key.name, 'json')) as NavHubSyncData | null;
        return { key: key.name, meta: normalizeSyncMeta(data?.meta) };
      } catch {
        return { key: key.name, meta: normalizeSyncMeta(null) };
      }
    }),
  );

  const index: SyncHistoryIndex = {
    version: SYNC_HISTORY_INDEX_VERSION,
    items: items
      .filter((item) => isSyncHistoryKey(item.key))
      .sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key)),
  };

  await writeSyncHistoryIndex(env, index);
  await Promise.all(toDelete.map((key) => env.NAVHUB_KV.delete(key)));
  return index;
};

export const ensureSyncHistoryIndexForListing = async (env: Env): Promise<SyncHistoryIndex> => {
  // 用于"备份列表/同步记录列表"的快速路径：
  // - 先读已有 index（包含 key + meta 的摘要），避免每次 listing 都拉取所有历史对象。
  const existingIndex = await readSyncHistoryIndex(env);
  if (existingIndex) {
    return existingIndex;
  }

  // index 缺失，进入 list 路径做兜底重建。
  const keys = (await listAllKeys(env, KV_SYNC_HISTORY_PREFIX))
    .filter((key) => isSyncHistoryKey(key.name))
    .sort((a, b) => compareSyncHistoryKeysDesc(a.name, b.name));

  const keep = keys.slice(0, MAX_SYNC_HISTORY);
  const toDelete = keys
    .slice(MAX_SYNC_HISTORY)
    .map((key) => key.name)
    .filter(isSyncHistoryKey);

  const items = await Promise.all(
    keep.map(async (key) => {
      try {
        const data = (await env.NAVHUB_KV.get(key.name, 'json')) as NavHubSyncData | null;
        return { key: key.name, meta: normalizeSyncMeta(data?.meta) };
      } catch {
        return { key: key.name, meta: normalizeSyncMeta(null) };
      }
    }),
  );

  const nextIndex: SyncHistoryIndex = {
    version: SYNC_HISTORY_INDEX_VERSION,
    items: items
      .filter((item) => isSyncHistoryKey(item.key))
      .sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key)),
  };

  await writeSyncHistoryIndex(env, nextIndex);
  await Promise.all(toDelete.map((key) => env.NAVHUB_KV.delete(key)));
  return nextIndex;
};

const updateSyncHistoryIndex = async (
  env: Env,
  backupKey: string,
  meta: SyncMetadata,
): Promise<void> => {
  // 写入新同步记录后，把它置顶到 index，并裁剪到 MAX_SYNC_HISTORY；溢出的旧记录会从 KV 中删除。
  const normalizedMeta = normalizeSyncMeta(meta);
  let index = await readSyncHistoryIndex(env);
  if (!index) {
    index = await rebuildSyncHistoryIndex(env);
  }

  const nextItems = [
    { key: backupKey, meta: normalizedMeta },
    ...index.items.filter((item) => item.key !== backupKey),
  ]
    .filter((item) => isSyncHistoryKey(item.key))
    .sort((a, b) => compareSyncHistoryKeysDesc(a.key, b.key));

  const kept = nextItems.slice(0, MAX_SYNC_HISTORY);
  const toDelete = nextItems
    .slice(MAX_SYNC_HISTORY)
    .map((item) => item.key)
    .filter(isSyncHistoryKey);

  await writeSyncHistoryIndex(env, { version: SYNC_HISTORY_INDEX_VERSION, items: kept });
  await Promise.all(toDelete.map((key) => env.NAVHUB_KV.delete(key)));
};

export const removeFromSyncHistoryIndex = async (env: Env, backupKey: string): Promise<void> => {
  const index = await readSyncHistoryIndex(env);
  if (!index) return;
  const nextItems = index.items.filter((item) => item.key !== backupKey);
  if (nextItems.length === index.items.length) return;
  await writeSyncHistoryIndex(env, { version: SYNC_HISTORY_INDEX_VERSION, items: nextItems });
};

export const removeFromSyncHistoryIndexWithIndex = async (
  env: Env,
  backupKey: string,
  index: SyncHistoryIndex,
): Promise<void> => {
  const nextItems = index.items.filter((item) => item.key !== backupKey);
  if (nextItems.length === index.items.length) return;
  await writeSyncHistoryIndex(env, { version: SYNC_HISTORY_INDEX_VERSION, items: nextItems });
};

export const saveSyncHistory = async (
  env: Env,
  data: NavHubSyncData,
  kind: SyncHistoryKind,
): Promise<string> => {
  const meta = normalizeSyncMeta(data.meta);
  const key = buildHistoryKey(meta.updatedAt || Date.now());
  const payload: NavHubSyncData = sanitizeSensitiveData({
    ...data,
    meta: {
      ...meta,
      syncKind: kind,
    },
  });
  await env.NAVHUB_KV.put(key, JSON.stringify(payload), {
    // 备份/历史默认保留 30 天（过期自动清理，可降低 KV Storage & 避免删除失败导致的残留）。
    expirationTtl: BACKUP_TTL_SECONDS,
  });
  try {
    await updateSyncHistoryIndex(env, key, payload.meta);
  } catch {
    // Best-effort: keep API working even if index update fails.
  }
  return key;
};
