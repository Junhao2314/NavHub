import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleApiSyncRequest,
  type KVNamespaceInterface,
  type SyncApiEnv,
} from '../../shared/syncApi';
import { KV_MAIN_DATA_KEY, SYNC_HISTORY_INDEX_VERSION } from '../../shared/syncApi/kv';

class MemoryKV implements KVNamespaceInterface {
  private readonly store = new Map<string, string>();
  readonly stats = { reads: 0, writes: 0, deletes: 0, lists: 0 };

  async get(
    key: string,
    typeOrOptions:
      | 'text'
      | 'json'
      | 'arrayBuffer'
      | 'stream'
      | { type: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number } = 'text',
  ): Promise<any> {
    this.stats.reads += 1;
    const value = this.store.get(key);
    if (value === undefined) return null;
    const type = typeof typeOrOptions === 'string' ? typeOrOptions : typeOrOptions.type;
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    this.stats.writes += 1;
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.stats.deletes += 1;
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    list_complete?: boolean;
    cursor?: string;
  }> {
    this.stats.lists += 1;
    const prefix = options?.prefix ?? '';
    const limit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit)
        ? Math.max(0, Math.floor(options.limit))
        : 1000;
    const cursor = typeof options?.cursor === 'string' ? options.cursor : '';
    const startIndex = cursor ? Number.parseInt(cursor, 10) : 0;
    const resolvedStartIndex = Number.isFinite(startIndex) && startIndex > 0 ? startIndex : 0;

    const matching = Array.from(this.store.keys())
      .filter((name) => (prefix ? name.startsWith(prefix) : true))
      .sort((a, b) => a.localeCompare(b));

    const paged = matching.slice(resolvedStartIndex, resolvedStartIndex + limit);
    const nextCursorIndex = resolvedStartIndex + limit;
    const list_complete = nextCursorIndex >= matching.length;

    return {
      keys: paged.map((name) => ({ name })),
      list_complete,
      cursor: list_complete ? undefined : String(nextCursorIndex),
    };
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  getStoredValue(key: string): string | undefined {
    return this.store.get(key);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('syncApi backup endpoints', () => {
  it('creates snapshot backup and can read it back', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const createRequest = new Request('http://localhost/api/sync?action=backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          links: [],
          categories: [],
          aiConfig: { provider: 'openai', apiKey: 'should-clear', model: 'x' },
          meta: { updatedAt: 123, deviceId: 'device-1', version: 1 },
        },
      }),
    });

    const createResponse = await handleApiSyncRequest(createRequest, env);
    const createJson = (await createResponse.json()) as any;

    expect(createResponse.status).toBe(200);
    expect(createJson.success).toBe(true);
    expect(createJson.backupKey).toBe('ynav:backup:2025-01-01T00-00-00-000Z');

    const getRequest = new Request(
      `http://localhost/api/sync?action=backup&backupKey=${encodeURIComponent(createJson.backupKey)}`,
      {
        method: 'GET',
      },
    );
    const getResponse = await handleApiSyncRequest(getRequest, env);
    const getJson = (await getResponse.json()) as any;

    expect(getResponse.status).toBe(200);
    expect(getJson.success).toBe(true);
    expect(getJson.data.aiConfig.apiKey).toBe('');
    expect(getJson.data.meta.deviceId).toBe('device-1');
  });

  it('returns 400 when creating backup without data', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const request = new Request('http://localhost/api/sync?action=backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('restores backup, creates rollback, and increments version', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-01T12:00:00.000Z'));

    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const existing = {
      links: [{ id: 'a', title: 'old', url: 'https://old.example', categoryId: 'c', createdAt: 1 }],
      categories: [{ id: 'c', name: 'Cat', icon: 'Folder' }],
      aiConfig: { provider: 'openai', apiKey: 'old-secret', model: 'x' },
      meta: { updatedAt: 111, deviceId: 'old-device', version: 5, syncKind: 'auto' },
    };
    await kv.put(KV_MAIN_DATA_KEY, JSON.stringify(existing));

    const backupKey = 'ynav:backup:2025-01-15T00-00-00-000Z';
    const backupData = {
      links: [{ id: 'b', title: 'new', url: 'https://new.example', categoryId: 'c', createdAt: 2 }],
      categories: [{ id: 'c', name: 'Cat', icon: 'Folder' }],
      aiConfig: { provider: 'openai', apiKey: 'backup-secret', model: 'y' },
      meta: {
        updatedAt: 222,
        deviceId: 'backup-device',
        version: 1,
        browser: 'Chrome',
        os: 'macOS',
      },
    };
    await kv.put(backupKey, JSON.stringify(backupData));

    const restoreRequest = new Request('http://localhost/api/sync?action=restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupKey, deviceId: 'restore-device' }),
    });
    const restoreResponse = await handleApiSyncRequest(restoreRequest, env);
    const restoreJson = (await restoreResponse.json()) as any;

    expect(restoreResponse.status).toBe(200);
    expect(restoreJson.success).toBe(true);
    expect(restoreJson.rollbackKey).toBe('ynav:backup:rollback-2025-02-01T12-00-00-000Z');
    expect(restoreJson.data.meta.deviceId).toBe('restore-device');
    expect(restoreJson.data.meta.updatedAt).toBe(new Date('2025-02-01T12:00:00.000Z').getTime());
    expect(restoreJson.data.meta.version).toBe(6);
    expect(restoreJson.data.meta.syncKind).toBe('manual');
    expect(restoreJson.data.aiConfig.apiKey).toBe('');

    const rollbackGet = new Request(
      `http://localhost/api/sync?action=backup&key=${encodeURIComponent(restoreJson.rollbackKey)}`,
    );
    const rollbackResponse = await handleApiSyncRequest(rollbackGet, env);
    const rollbackJson = (await rollbackResponse.json()) as any;

    expect(rollbackResponse.status).toBe(200);
    expect(rollbackJson.success).toBe(true);
    expect(rollbackJson.data.meta.version).toBe(5);
    expect(rollbackJson.data.meta.deviceId).toBe('restore-device');

    const mainGet = new Request('http://localhost/api/sync', { method: 'GET' });
    const mainResponse = await handleApiSyncRequest(mainGet, env);
    const mainJson = (await mainResponse.json()) as any;

    expect(mainResponse.status).toBe(200);
    expect(mainJson.success).toBe(true);
    expect(mainJson.data.meta.version).toBe(6);
    expect(mainJson.data.links?.[0]?.title).toBe('new');
  });

  it('prevents deleting current sync-history record', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const current = {
      links: [],
      categories: [],
      meta: { updatedAt: 1, deviceId: 'device-1', version: 3 },
    };
    await kv.put(KV_MAIN_DATA_KEY, JSON.stringify(current));

    const historyKey = 'ynav:backup:history-2025-01-01T00-00-00-000Z_deadbeef';
    await kv.put(
      historyKey,
      JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: 1, deviceId: 'device-1', version: 3 },
      }),
    );

    const request = new Request('http://localhost/api/sync?action=backup', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupKey: historyKey }),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(kv.has(historyKey)).toBe(true);
  });

  it('deletes a sync-history record using index without reading the record body', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    await kv.put(
      KV_MAIN_DATA_KEY,
      JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: 1, deviceId: 'device-1', version: 5 },
      }),
    );

    const historyKey = 'ynav:backup:history-2025-01-01T00-00-00-000Z_deadbeef';
    await kv.put(
      historyKey,
      JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: 1, deviceId: 'device-1', version: 4 },
      }),
    );

    await kv.put(
      'ynav:sync_history_index',
      JSON.stringify({
        version: SYNC_HISTORY_INDEX_VERSION,
        sources: ['ynav', 'navhub'],
        items: [{ key: historyKey, meta: { updatedAt: 1, deviceId: 'device-1', version: 4 } }],
      }),
    );

    const request = new Request('http://localhost/api/sync?action=backup', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupKey: historyKey }),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(kv.has(historyKey)).toBe(false);
    expect(kv.stats.reads).toBe(2);

    const storedIndexRaw = kv.getStoredValue('ynav:sync_history_index');
    expect(storedIndexRaw).toBeTruthy();
    const storedIndex = JSON.parse(storedIndexRaw as string) as any;
    expect(storedIndex.items).toEqual([]);
  });

  it('deletes a non-history backup record', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const backupKey = 'ynav:backup:2025-01-02T00-00-00-000Z';
    await kv.put(
      backupKey,
      JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: 1, deviceId: 'device-1', version: 1 },
      }),
    );

    const request = new Request('http://localhost/api/sync?action=backup', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupKey }),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(kv.has(backupKey)).toBe(false);
    expect(kv.stats.reads).toBe(0);
  });

  it('returns 400 for invalid backupKey in get-backup', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const request = new Request(
      'http://localhost/api/sync?action=backup&backupKey=not-a-backup-key',
      {
        method: 'GET',
      },
    );
    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
