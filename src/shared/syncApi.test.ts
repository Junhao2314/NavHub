import { describe, expect, it, vi } from 'vitest';
import { handleApiSyncRequest, type KVNamespaceInterface, type SyncApiEnv } from '../../shared/syncApi';

class MemoryKV implements KVNamespaceInterface {
  private readonly store = new Map<string, string>();

  async get(key: string, type: 'text' | 'json' | 'arrayBuffer' | 'stream' = 'text'): Promise<any> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    list_complete?: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? '';
    const limit = typeof options?.limit === 'number' && Number.isFinite(options.limit)
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
      cursor: list_complete ? undefined : String(nextCursorIndex)
    };
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

describe('syncApi history keys', () => {
  it('generates unique history keys even when Date.now is identical', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const fixedNow = 1710000000000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const baseData = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 }
    };

    const makeRequest = () => new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseData })
    });

    const response1 = await handleApiSyncRequest(makeRequest(), env);
    const json1 = await response1.json() as any;
    const response2 = await handleApiSyncRequest(makeRequest(), env);
    const json2 = await response2.json() as any;

    expect(json1.success).toBe(true);
    expect(json2.success).toBe(true);

    const timestamp = new Date(fixedNow).toISOString().replace(/[:.]/g, '-');
    const expectedPrefix = `ynav:backup:history-${timestamp}_`;

    expect(String(json1.historyKey).startsWith(expectedPrefix)).toBe(true);
    expect(String(json2.historyKey).startsWith(expectedPrefix)).toBe(true);
    expect(json1.historyKey).not.toBe(json2.historyKey);

    expect(kv.has(json1.historyKey)).toBe(true);
    expect(kv.has(json2.historyKey)).toBe(true);

    nowSpy.mockRestore();
  });

  it('falls back to Math.random-derived bytes when crypto is unavailable', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const fixedNow = 1710000000000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    vi.stubGlobal('crypto', undefined);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const baseData = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 }
    };

    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseData })
    });

    const response = await handleApiSyncRequest(request, env);
    const json = await response.json() as any;

    expect(json.success).toBe(true);

    const timestamp = new Date(fixedNow).toISOString().replace(/[:.]/g, '-');
    const expectedPrefix = `ynav:backup:history-${timestamp}_`;
    expect(json.historyKey).toBe(`${expectedPrefix}80808080`);
    expect(kv.has(json.historyKey)).toBe(true);

    randomSpy.mockRestore();
    nowSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('self-heals a stale sync history index when listing backups', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const olderKey = 'ynav:backup:history-2024-01-01T00-00-00-000Z_aaaaaaaa';
    const newerKey = 'ynav:backup:history-2024-01-02T00-00-00-000Z_bbbbbbbb';

    await kv.put(olderKey, JSON.stringify({
      links: [],
      categories: [],
      meta: { updatedAt: 1, deviceId: 'd1', version: 1 }
    }));
    await kv.put(newerKey, JSON.stringify({
      links: [],
      categories: [],
      meta: { updatedAt: 2, deviceId: 'd2', version: 2 }
    }));

    // Stale index missing the older key.
    await kv.put('ynav:sync_history_index', JSON.stringify({
      version: 1,
      items: [{ key: newerKey, meta: { updatedAt: 2, deviceId: 'd2', version: 2 } }],
      sources: ['ynav', 'navhub']
    }));

    const request = new Request('http://localhost/api/sync?action=backups', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = await response.json() as any;

    expect(json.success).toBe(true);
    const keys = (json.backups as Array<{ key: string }>).map((item) => item.key);
    expect(new Set(keys)).toEqual(new Set([olderKey, newerKey]));

    const timestamps = (json.backups as Array<{ timestamp: string }>).map((item) => item.timestamp);
    expect(timestamps.every((value) => !value.includes('_'))).toBe(true);

    const updatedIndex = await kv.get('ynav:sync_history_index', 'json') as any;
    expect(updatedIndex.items).toHaveLength(2);
  });

  it('prunes legacy sync history keys when rotating history during sync', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const makeLegacyKey = (day: number) => {
      const dd = String(day).padStart(2, '0');
      const suffix = String(day).padStart(8, '0');
      return `navhub:backup:history-2024-01-${dd}T00-00-00-000Z_${suffix}`;
    };

    const legacyKeys = Array.from({ length: 20 }, (_, index) => makeLegacyKey(index + 1));
    for (let index = 0; index < legacyKeys.length; index += 1) {
      const day = index + 1;
      await kv.put(legacyKeys[index], JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: day, deviceId: `d${day}`, version: day }
      }));
    }

    await kv.put('ynav:sync_history_index', JSON.stringify({
      version: 1,
      items: legacyKeys.map((key, index) => {
        const day = index + 1;
        return { key, meta: { updatedAt: day, deviceId: `d${day}`, version: day } };
      }),
      sources: ['ynav', 'navhub']
    }));

    const fixedNow = new Date('2024-02-01T00:00:00.000Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const baseData = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 }
    };

    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseData })
    });

    const response = await handleApiSyncRequest(request, env);
    const json = await response.json() as any;

    expect(json.success).toBe(true);
    expect(typeof json.historyKey).toBe('string');
    expect(kv.has(json.historyKey)).toBe(true);

    expect(kv.has(legacyKeys[0])).toBe(false);
    expect(kv.has(legacyKeys[1])).toBe(true);

    const legacyList = await kv.list({ prefix: 'navhub:backup:history-' });
    expect(legacyList.keys).toHaveLength(19);

    nowSpy.mockRestore();
  });

  it('prunes legacy sync history keys when rebuilding index for backups listing', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const makeLegacyKey = (day: number) => {
      const dd = String(day).padStart(2, '0');
      const suffix = String(day).padStart(8, '0');
      return `navhub:backup:history-2024-01-${dd}T00-00-00-000Z_${suffix}`;
    };

    const legacyKeys = Array.from({ length: 25 }, (_, index) => makeLegacyKey(index + 1));
    for (let index = 0; index < legacyKeys.length; index += 1) {
      const day = index + 1;
      await kv.put(legacyKeys[index], JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: day, deviceId: `d${day}`, version: day }
      }));
    }

    const request = new Request('http://localhost/api/sync?action=backups', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = await response.json() as any;

    expect(json.success).toBe(true);
    expect(json.backups).toHaveLength(20);

    for (let index = 0; index < 5; index += 1) {
      expect(kv.has(legacyKeys[index])).toBe(false);
    }
    for (let index = 5; index < legacyKeys.length; index += 1) {
      expect(kv.has(legacyKeys[index])).toBe(true);
    }

    const legacyList = await kv.list({ prefix: 'navhub:backup:history-' });
    expect(legacyList.keys).toHaveLength(20);

    const updatedIndex = await kv.get('ynav:sync_history_index', 'json') as any;
    expect(updatedIndex.items).toHaveLength(20);
  });

  it('handles KV cursor pagination when rebuilding index for backups listing', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();
    const totalKeys = 1001;
    const keys: string[] = [];
    for (let index = 0; index < totalKeys; index += 1) {
      const timestamp = new Date(baseTime + index * 1000).toISOString().replace(/[:.]/g, '-');
      const suffix = String(index).padStart(8, '0');
      const key = `ynav:backup:history-${timestamp}_${suffix}`;
      keys.push(key);
      await kv.put(key, JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: index + 1, deviceId: `d${index + 1}`, version: index + 1 }
      }));
    }

    const newestKey = keys[keys.length - 1];

    const request = new Request('http://localhost/api/sync?action=backups', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = await response.json() as any;

    expect(json.success).toBe(true);
    expect(json.backups).toHaveLength(20);

    const returnedKeys = (json.backups as Array<{ key: string }>).map((item) => item.key);
    expect(returnedKeys).toContain(newestKey);

    const remaining = await kv.list({ prefix: 'ynav:backup:history-' });
    expect(remaining.keys).toHaveLength(20);
    expect(remaining.keys.map((item) => item.name)).toContain(newestKey);
  });
});

describe('syncApi env bindings', () => {
  it('accepts YNAV_WORKER_KV binding (alias)', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_WORKER_KV: kv };

    const request = new Request('http://localhost/api/sync', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = await response.json() as any;

    expect(json.success).toBe(true);
    expect(json.data).toBe(null);
  });
});

describe('syncApi auth + public sanitization', () => {
  it('treats X-Sync-Password with whitespace as admin', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const baseData = {
      links: [],
      categories: [],
      privateVault: 'vault-cipher',
      encryptedSensitiveConfig: 'v1.salt.iv.data',
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 }
    };

    const writeRequest = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Password': 'secret' },
      body: JSON.stringify({ data: baseData })
    });
    const writeResponse = await handleApiSyncRequest(writeRequest, env);
    const writeJson = await writeResponse.json() as any;
    expect(writeJson.success).toBe(true);

    const readRequest = new Request('http://localhost/api/sync', {
      method: 'GET',
      headers: { 'X-Sync-Password': '  secret  ' }
    });
    const readResponse = await handleApiSyncRequest(readRequest, env);
    const readJson = await readResponse.json() as any;

    expect(readJson.success).toBe(true);
    expect(readJson.role).toBe('admin');
    expect(readJson.data.privateVault).toBe('vault-cipher');
    expect(readJson.data.encryptedSensitiveConfig).toBe('v1.salt.iv.data');
  });

  it('removes privateVault and encryptedSensitiveConfig for public reads', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const baseData = {
      links: [],
      categories: [],
      aiConfig: { provider: 'gemini', apiKey: 'sk-live-123', model: 'gemini-2.5-flash' },
      privateVault: 'vault-cipher',
      privacyConfig: { groupEnabled: true, passwordEnabled: true },
      encryptedSensitiveConfig: 'v1.salt.iv.data',
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 }
    };

    const writeRequest = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Password': 'secret' },
      body: JSON.stringify({ data: baseData })
    });
    const writeResponse = await handleApiSyncRequest(writeRequest, env);
    const writeJson = await writeResponse.json() as any;
    expect(writeJson.success).toBe(true);

    const readRequest = new Request('http://localhost/api/sync', { method: 'GET' });
    const readResponse = await handleApiSyncRequest(readRequest, env);
    const readJson = await readResponse.json() as any;

    expect(readJson.success).toBe(true);
    expect(readJson.role).toBe('user');
    expect(readJson.data.privateVault).toBeUndefined();
    expect(readJson.data.privacyConfig).toBeUndefined();
    expect(readJson.data.encryptedSensitiveConfig).toBeUndefined();
    expect(readJson.data.aiConfig.apiKey).toBe('');
  });
});
