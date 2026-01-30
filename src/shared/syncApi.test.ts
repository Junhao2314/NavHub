import { describe, expect, it, vi } from 'vitest';
import {
  handleApiSyncRequest,
  type KVNamespaceInterface,
  type R2BucketInterface,
  type SyncApiEnv,
} from '../../shared/syncApi';
import { getMainData, KV_MAIN_DATA_KEY } from '../../shared/syncApi/kv';
import {
  NAVHUB_SYNC_DATA_SCHEMA_VERSION,
  normalizeNavHubSyncData,
} from '../../shared/syncApi/navHubSyncData';

class MemoryKV implements KVNamespaceInterface {
  private readonly store = new Map<string, string>();

  async get(
    key: string,
    typeOrOptions:
      | 'text'
      | 'json'
      | 'arrayBuffer'
      | 'stream'
      | { type: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number } = 'text',
  ): Promise<any> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    const type = typeof typeOrOptions === 'string' ? typeOrOptions : typeOrOptions.type;
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
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
}

class CountingKV extends MemoryKV {
  readonly getCalls: string[] = [];
  readonly putCalls: string[] = [];
  readonly failPutsForKeys = new Set<string>();

  override async get(
    key: string,
    typeOrOptions:
      | 'text'
      | 'json'
      | 'arrayBuffer'
      | 'stream'
      | { type: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number } = 'text',
  ): Promise<any> {
    this.getCalls.push(key);
    return super.get(key, typeOrOptions);
  }

  override async put(
    key: string,
    value: string,
    _options?: { expirationTtl?: number },
  ): Promise<void> {
    this.putCalls.push(key);
    if (this.failPutsForKeys.has(key)) {
      throw new Error(`Simulated KV.put failure for ${key}`);
    }
    return super.put(key, value, _options);
  }
}

type R2PutOptionsLike = {
  onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } | Headers;
};

class MemoryR2 implements R2BucketInterface {
  private readonly store = new Map<string, { value: string; etag: string }>();
  private etagCounter = 0;
  onBeforeConditionalPut: ((key: string) => void) | null = null;

  async get(
    key: string,
  ): Promise<{ etag: string; json<T>(): Promise<T>; text(): Promise<string> } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      etag: entry.etag,
      json: async <T>() => JSON.parse(entry.value) as T,
      text: async () => entry.value,
    };
  }

  forcePut(key: string, value: string): { etag: string } {
    const etag = `etag-${++this.etagCounter}`;
    this.store.set(key, { value, etag });
    return { etag };
  }

  async put(
    key: string,
    value: string,
    options?: R2PutOptionsLike,
  ): Promise<{ etag: string } | null> {
    const onlyIf = options?.onlyIf;
    if (onlyIf && !(onlyIf instanceof Headers)) {
      if (onlyIf.etagMatches !== undefined) {
        this.onBeforeConditionalPut?.(key);
      }
    }

    const existing = this.store.get(key);
    if (onlyIf && !(onlyIf instanceof Headers)) {
      if (onlyIf.etagMatches !== undefined) {
        if (!existing) return null;
        if (existing.etag !== onlyIf.etagMatches) return null;
      }
      if (onlyIf.etagDoesNotMatch !== undefined) {
        if (onlyIf.etagDoesNotMatch === '*') {
          if (existing) return null;
        } else if (existing?.etag === onlyIf.etagDoesNotMatch) {
          return null;
        }
      }
    }

    return this.forcePut(key, value);
  }
}

describe('navHubSyncData schema migration', () => {
  it('adds schemaVersion when missing', () => {
    const input = {
      links: [],
      categories: [],
      meta: { updatedAt: 1, deviceId: 'device-1', version: 1 },
    };
    const normalized = normalizeNavHubSyncData(input);
    expect(normalized?.schemaVersion).toBe(NAVHUB_SYNC_DATA_SCHEMA_VERSION);
  });

  it('preserves higher schemaVersion values', () => {
    const input = {
      schemaVersion: 99,
      links: [],
      categories: [],
      meta: { updatedAt: 1, deviceId: 'device-1', version: 1 },
    };
    const normalized = normalizeNavHubSyncData(input);
    expect(normalized?.schemaVersion).toBe(99);
  });
});

describe('syncApi history keys', () => {
  it('generates unique history keys even when Date.now is identical', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const fixedNow = 1710000000000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const baseData = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const makeRequest = () =>
      new Request('http://localhost/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: baseData, syncKind: 'manual' }),
      });

    const response1 = await handleApiSyncRequest(makeRequest(), env);
    const json1 = (await response1.json()) as any;
    const response2 = await handleApiSyncRequest(makeRequest(), env);
    const json2 = (await response2.json()) as any;

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
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseData, syncKind: 'manual' }),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(json.success).toBe(true);

    const timestamp = new Date(fixedNow).toISOString().replace(/[:.]/g, '-');
    const expectedPrefix = `ynav:backup:history-${timestamp}_`;
    expect(json.historyKey).toBe(`${expectedPrefix}80808080`);
    expect(kv.has(json.historyKey)).toBe(true);

    randomSpy.mockRestore();
    nowSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('skips sync history snapshots for auto sync by default', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const fixedNow = 1710000000000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const baseData = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseData }),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(json.success).toBe(true);
    expect(json.historyKey).toBe(null);
    expect(kv.has('ynav:sync_history_index')).toBe(false);

    const historyList = await kv.list({ prefix: 'ynav:backup:history-' });
    expect(historyList.keys).toHaveLength(0);

    nowSpy.mockRestore();
  });

  it('avoids KV.list when sync history index is complete', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv };

    const olderKey = 'ynav:backup:history-2024-01-01T00-00-00-000Z_aaaaaaaa';
    const newerKey = 'ynav:backup:history-2024-01-02T00-00-00-000Z_bbbbbbbb';

    await kv.put(
      olderKey,
      JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: 1, deviceId: 'd1', version: 1 },
      }),
    );
    await kv.put(
      newerKey,
      JSON.stringify({
        links: [],
        categories: [],
        meta: { updatedAt: 2, deviceId: 'd2', version: 2 },
      }),
    );

    // Complete index: should serve as listing source-of-truth without extra KV.list calls.
    await kv.put(
      'ynav:sync_history_index',
      JSON.stringify({
        version: 1,
        items: [
          { key: newerKey, meta: { updatedAt: 2, deviceId: 'd2', version: 2 } },
          { key: olderKey, meta: { updatedAt: 1, deviceId: 'd1', version: 1 } },
        ],
        sources: ['ynav', 'navhub'],
      }),
    );

    const listSpy = vi.spyOn(kv, 'list');

    const request = new Request('http://localhost/api/sync?action=backups', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(json.success).toBe(true);
    expect(listSpy).not.toHaveBeenCalled();
    const keys = (json.backups as Array<{ key: string }>).map((item) => item.key);
    expect(new Set(keys)).toEqual(new Set([olderKey, newerKey]));

    const timestamps = (json.backups as Array<{ timestamp: string }>).map((item) => item.timestamp);
    expect(timestamps.every((value) => !value.includes('_'))).toBe(true);
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
      await kv.put(
        legacyKeys[index],
        JSON.stringify({
          links: [],
          categories: [],
          meta: { updatedAt: day, deviceId: `d${day}`, version: day },
        }),
      );
    }

    await kv.put(
      'ynav:sync_history_index',
      JSON.stringify({
        version: 1,
        items: legacyKeys.map((key, index) => {
          const day = index + 1;
          return { key, meta: { updatedAt: day, deviceId: `d${day}`, version: day } };
        }),
        sources: ['ynav', 'navhub'],
      }),
    );

    const fixedNow = new Date('2024-02-01T00:00:00.000Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const baseData = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseData, syncKind: 'manual' }),
    });

    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

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
      await kv.put(
        legacyKeys[index],
        JSON.stringify({
          links: [],
          categories: [],
          meta: { updatedAt: day, deviceId: `d${day}`, version: day },
        }),
      );
    }

    const request = new Request('http://localhost/api/sync?action=backups', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

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

    const updatedIndex = (await kv.get('ynav:sync_history_index', 'json')) as any;
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
      await kv.put(
        key,
        JSON.stringify({
          links: [],
          categories: [],
          meta: { updatedAt: index + 1, deviceId: `d${index + 1}`, version: index + 1 },
        }),
      );
    }

    const newestKey = keys[keys.length - 1];

    const request = new Request('http://localhost/api/sync?action=backups', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(json.success).toBe(true);
    expect(json.backups).toHaveLength(20);

    const returnedKeys = (json.backups as Array<{ key: string }>).map((item) => item.key);
    expect(returnedKeys).toContain(newestKey);

    const remaining = await kv.list({ prefix: 'ynav:backup:history-' });
    expect(remaining.keys).toHaveLength(20);
    expect(remaining.keys.map((item) => item.name)).toContain(newestKey);
  });
});

describe('syncApi legacy main-data migration', () => {
  it('caches legacy misses to avoid repeated reads', async () => {
    const kv = new CountingKV();
    const env = { YNAV_KV: kv } as any;

    expect(await getMainData(env)).toBe(null);
    expect(await getMainData(env)).toBe(null);

    expect(kv.getCalls.filter((key) => key === 'navhub:data')).toHaveLength(1);
    expect(kv.getCalls.filter((key) => key === KV_MAIN_DATA_KEY)).toHaveLength(2);
  });

  it('caches legacy value and avoids repeated write-through attempts when KV.put fails', async () => {
    const kv = new CountingKV();
    kv.failPutsForKeys.add(KV_MAIN_DATA_KEY);

    const legacy = {
      links: [],
      categories: [],
      meta: {
        updatedAt: 1,
        deviceId: 'legacy-device',
        version: 1,
        browser: undefined,
        os: undefined,
        syncKind: 'auto',
      },
    };
    await kv.put('navhub:data', JSON.stringify(legacy));

    const env = { YNAV_KV: kv } as any;

    const expected = { ...legacy, schemaVersion: NAVHUB_SYNC_DATA_SCHEMA_VERSION };
    expect(await getMainData(env)).toEqual(expected);
    expect(await getMainData(env)).toEqual(expected);

    expect(kv.getCalls.filter((key) => key === 'navhub:data')).toHaveLength(1);
    expect(kv.putCalls.filter((key) => key === KV_MAIN_DATA_KEY)).toHaveLength(1);
  });
});

describe('syncApi env bindings', () => {
  it('accepts YNAV_WORKER_KV binding (alias)', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_WORKER_KV: kv };

    const request = new Request('http://localhost/api/sync', { method: 'GET' });
    const response = await handleApiSyncRequest(request, env);
    const json = (await response.json()) as any;

    expect(json.success).toBe(true);
    expect(json.data).toBe(null);
  });
});

describe('syncApi R2 main-data store', () => {
  it('detects race via R2 etag conditional write (returns conflict)', async () => {
    const kv = new MemoryKV();
    const r2 = new MemoryR2();
    const env: SyncApiEnv = { YNAV_KV: kv, YNAV_R2: r2 };

    const baseDataV1 = {
      links: [],
      categories: [],
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const firstWrite = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: baseDataV1, expectedVersion: 0 }),
    });
    const firstResponse = await handleApiSyncRequest(firstWrite, env);
    const firstJson = (await firstResponse.json()) as any;
    expect(firstJson.success).toBe(true);
    expect(firstJson.data.meta.version).toBe(1);

    // Next write: expectedVersion matches what we just read, but simulate another writer updating between GET and PUT.
    r2.onBeforeConditionalPut = (key) => {
      // Simulate a concurrent update that bumps version to 2.
      const concurrent = {
        links: [{ id: 'x', title: 'concurrent', url: 'https://example.com' }],
        categories: [],
        meta: { updatedAt: Date.now(), deviceId: 'device-2', version: 2 },
      };
      r2.forcePut(key, JSON.stringify(concurrent));
    };

    const secondWrite = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          links: [{ id: 'y', title: 'client', url: 'https://example.com' }],
          categories: [],
          meta: { updatedAt: 0, deviceId: 'device-1', version: 1 },
        },
        expectedVersion: 1,
      }),
    });
    const secondResponse = await handleApiSyncRequest(secondWrite, env);
    const secondJson = (await secondResponse.json()) as any;

    expect(secondResponse.status).toBe(409);
    expect(secondJson.conflict).toBe(true);
    expect(secondJson.data?.meta?.version).toBe(2);
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
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const writeRequest = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Password': 'secret' },
      body: JSON.stringify({ data: baseData }),
    });
    const writeResponse = await handleApiSyncRequest(writeRequest, env);
    const writeJson = (await writeResponse.json()) as any;
    expect(writeJson.success).toBe(true);

    const readRequest = new Request('http://localhost/api/sync', {
      method: 'GET',
      headers: { 'X-Sync-Password': '  secret  ' },
    });
    const readResponse = await handleApiSyncRequest(readRequest, env);
    const readJson = (await readResponse.json()) as any;

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
      meta: { updatedAt: 0, deviceId: 'device-1', version: 0 },
    };

    const writeRequest = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Password': 'secret' },
      body: JSON.stringify({ data: baseData }),
    });
    const writeResponse = await handleApiSyncRequest(writeRequest, env);
    const writeJson = (await writeResponse.json()) as any;
    expect(writeJson.success).toBe(true);

    const readRequest = new Request('http://localhost/api/sync', { method: 'GET' });
    const readResponse = await handleApiSyncRequest(readRequest, env);
    const readJson = (await readResponse.json()) as any;

    expect(readJson.success).toBe(true);
    expect(readJson.role).toBe('user');
    expect(readJson.data.privateVault).toBeUndefined();
    expect(readJson.data.privacyConfig).toBeUndefined();
    expect(readJson.data.encryptedSensitiveConfig).toBeUndefined();
    expect(readJson.data.aiConfig.apiKey).toBe('');
  });
});

describe('syncApi auth attempts', () => {
  const sha256Hex = async (value: string): Promise<string> => {
    const encoder = new TextEncoder();
    const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (cryptoObj?.subtle?.digest) {
      const digest = await cryptoObj.subtle.digest('SHA-256', encoder.encode(value));
      const bytes = new Uint8Array(digest);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: FNV-1a 32-bit (should rarely happen in this test runtime)
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  it('clears failed attempt counter after a successful login', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const clientIp = '1.2.3.4';
    const attemptKey = `ynav:auth_attempt:sha256:${await sha256Hex(clientIp)}`;

    const wrongLoginRequest = new Request('http://localhost/api/sync?action=login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Password': 'wrong',
        'X-Forwarded-For': clientIp,
      },
      body: JSON.stringify({ deviceId: 'device-1' }),
    });
    const wrongLoginResponse = await handleApiSyncRequest(wrongLoginRequest, env);
    const wrongLoginJson = (await wrongLoginResponse.json()) as any;

    expect(wrongLoginResponse.status).toBe(401);
    expect(wrongLoginJson.remainingAttempts).toBe(4);
    expect(kv.has(attemptKey)).toBe(true);

    const successfulLoginRequest = new Request('http://localhost/api/sync?action=login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Password': 'secret',
        'X-Forwarded-For': clientIp,
      },
      body: JSON.stringify({ deviceId: 'device-1' }),
    });
    const successfulLoginResponse = await handleApiSyncRequest(successfulLoginRequest, env);
    const successfulLoginJson = (await successfulLoginResponse.json()) as any;

    expect(successfulLoginJson.success).toBe(true);
    expect(kv.has(attemptKey)).toBe(false);

    const wrongAgainRequest = new Request('http://localhost/api/sync?action=login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Password': 'wrong',
        'X-Forwarded-For': clientIp,
      },
      body: JSON.stringify({ deviceId: 'device-1' }),
    });
    const wrongAgainResponse = await handleApiSyncRequest(wrongAgainRequest, env);
    const wrongAgainJson = (await wrongAgainResponse.json()) as any;

    expect(wrongAgainResponse.status).toBe(401);
    expect(wrongAgainJson.remainingAttempts).toBe(4);
  });

  it('clears failed attempt counter after a successful auth check', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const clientIp = '3.4.5.6';
    const attemptKey = `ynav:auth_attempt:sha256:${await sha256Hex(clientIp)}`;

    const wrongAuthRequest = new Request('http://localhost/api/sync?action=auth', {
      method: 'GET',
      headers: {
        'X-Sync-Password': 'wrong',
        'X-Forwarded-For': clientIp,
      },
    });
    const wrongAuthResponse = await handleApiSyncRequest(wrongAuthRequest, env);
    const wrongAuthJson = (await wrongAuthResponse.json()) as any;

    expect(wrongAuthResponse.status).toBe(401);
    expect(wrongAuthJson.remainingAttempts).toBe(4);
    expect(kv.has(attemptKey)).toBe(true);

    const successfulAuthRequest = new Request('http://localhost/api/sync?action=auth', {
      method: 'GET',
      headers: {
        'X-Sync-Password': 'secret',
        'X-Forwarded-For': clientIp,
      },
    });
    const successfulAuthResponse = await handleApiSyncRequest(successfulAuthRequest, env);
    const successfulAuthJson = (await successfulAuthResponse.json()) as any;

    expect(successfulAuthJson.success).toBe(true);
    expect(kv.has(attemptKey)).toBe(false);

    const wrongAgainRequest = new Request('http://localhost/api/sync?action=auth', {
      method: 'GET',
      headers: {
        'X-Sync-Password': 'wrong',
        'X-Forwarded-For': clientIp,
      },
    });
    const wrongAgainResponse = await handleApiSyncRequest(wrongAgainRequest, env);
    const wrongAgainJson = (await wrongAgainResponse.json()) as any;

    expect(wrongAgainResponse.status).toBe(401);
    expect(wrongAgainJson.remainingAttempts).toBe(4);
  });

  it('clears legacy auth attempt records after a successful login', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const clientIp = '2.3.4.5';
    const rawAttemptKey = `ynav:auth_attempt:${clientIp}`;
    const rawLegacyAttemptKey = `navhub:auth_attempt:${clientIp}`;

    const now = Date.now();
    await kv.put(rawAttemptKey, JSON.stringify({ failedCount: 3, lockedUntil: 0, updatedAt: now }));
    await kv.put(
      rawLegacyAttemptKey,
      JSON.stringify({ failedCount: 2, lockedUntil: 0, updatedAt: now }),
    );

    const successfulLoginRequest = new Request('http://localhost/api/sync?action=login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Password': 'secret',
        'X-Forwarded-For': clientIp,
      },
      body: JSON.stringify({ deviceId: 'device-1' }),
    });
    const successfulLoginResponse = await handleApiSyncRequest(successfulLoginRequest, env);
    const successfulLoginJson = (await successfulLoginResponse.json()) as any;

    expect(successfulLoginJson.success).toBe(true);
    expect(kv.has(rawAttemptKey)).toBe(false);
    expect(kv.has(rawLegacyAttemptKey)).toBe(false);
  });

  it('migrates legacy lockout records to the new attempt key (avoids repeated legacy reads)', async () => {
    const kv = new CountingKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const clientIp = '9.9.9.9';
    const attemptKey = `ynav:auth_attempt:sha256:${await sha256Hex(clientIp)}`;
    const rawLegacyAttemptKey = `navhub:auth_attempt:${clientIp}`;

    const now = Date.now();
    await kv.put(
      rawLegacyAttemptKey,
      JSON.stringify({
        failedCount: 5,
        lockedUntil: now + 60 * 1000,
        updatedAt: now,
      }),
    );

    const makeWrongLogin = () =>
      new Request('http://localhost/api/sync?action=login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Password': 'wrong',
          'X-Forwarded-For': clientIp,
        },
        body: JSON.stringify({ deviceId: 'device-1' }),
      });

    const firstResponse = await handleApiSyncRequest(makeWrongLogin(), env);
    expect(firstResponse.status).toBe(429);
    expect(kv.has(attemptKey)).toBe(true);

    const secondResponse = await handleApiSyncRequest(makeWrongLogin(), env);
    expect(secondResponse.status).toBe(429);

    expect(kv.getCalls.filter((key) => key === rawLegacyAttemptKey)).toHaveLength(1);
  });
});

describe('syncApi invalid JSON bodies', () => {
  it('returns 400 for invalid JSON in POST /api/sync', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Password': 'secret',
      },
      body: '{',
    });

    const response = await handleApiSyncRequest(request, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: '无效的 JSON 请求体' });
  });

  it('returns 400 for invalid JSON in POST /api/sync?action=backup', async () => {
    const kv = new MemoryKV();
    const env: SyncApiEnv = { YNAV_KV: kv, SYNC_PASSWORD: 'secret' };

    const request = new Request('http://localhost/api/sync?action=backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Password': 'secret',
      },
      body: '{',
    });

    const response = await handleApiSyncRequest(request, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: '无效的 JSON 请求体' });
  });
});
