import { describe, expect, it } from 'vitest';
import {
  handleApiSyncRequest,
  type KVNamespaceInterface,
  type SyncApiEnv,
} from '../../shared/syncApi';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const defer = <T>(): Deferred<T> => {
  let resolve: (value: T) => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
};

class ControlledKV implements KVNamespaceInterface {
  private readonly immediateJsonByKey = new Map<string, unknown>();
  private readonly deferredJsonByKey = new Map<string, Deferred<unknown>>();

  readonly backupGetsStarted: string[] = [];

  setImmediateJson(key: string, value: unknown): void {
    this.immediateJsonByKey.set(key, value);
  }

  setDeferredJson(key: string, deferred: Deferred<unknown>): void {
    this.deferredJsonByKey.set(key, deferred);
  }

  async get(
    key: string,
    typeOrOptions:
      | 'text'
      | 'json'
      | 'arrayBuffer'
      | 'stream'
      | { type: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number } = 'text',
  ): Promise<any> {
    const type = typeof typeOrOptions === 'string' ? typeOrOptions : typeOrOptions.type;
    if (type !== 'json') return null;

    if (this.immediateJsonByKey.has(key)) {
      return this.immediateJsonByKey.get(key) ?? null;
    }

    const deferred = this.deferredJsonByKey.get(key);
    if (deferred) {
      if (key.startsWith('navhub:backup:')) {
        this.backupGetsStarted.push(key);
      }
      return deferred.promise;
    }

    return null;
  }

  async put(_key: string, _value: string, _options?: { expirationTtl?: number }): Promise<void> {}

  async delete(_key: string): Promise<void> {}

  async list(_options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    list_complete?: boolean;
    cursor?: string;
  }> {
    return { keys: [], list_complete: true };
  }
}

describe('syncApi GET fallback to sync history', () => {
  it('starts multiple backup reads in parallel and returns the newest valid candidate', async () => {
    const kv = new ControlledKV();
    const env: SyncApiEnv = { NAVHUB_KV: kv, SYNC_PASSWORD: 'secret' };

    const key0 = 'navhub:backup:history-2024-01-03T00-00-00-000Z_00000000';
    const key1 = 'navhub:backup:history-2024-01-02T00-00-00-000Z_00000001';
    const key2 = 'navhub:backup:history-2024-01-01T00-00-00-000Z_00000002';

    kv.setImmediateJson('navhub:sync_history_index', {
      version: 1,
      items: [
        { key: key0, meta: { updatedAt: 3, deviceId: 'd0', version: 3 } },
        { key: key1, meta: { updatedAt: 2, deviceId: 'd1', version: 2 } },
        { key: key2, meta: { updatedAt: 1, deviceId: 'd2', version: 1 } },
      ],
    });

    const d0 = defer<unknown>();
    const d1 = defer<unknown>();
    const d2 = defer<unknown>();
    kv.setDeferredJson(key0, d0);
    kv.setDeferredJson(key1, d1);
    kv.setDeferredJson(key2, d2);

    const request = new Request('http://localhost/api/sync', { method: 'GET' });
    const responsePromise = handleApiSyncRequest(request, env);

    for (let tick = 0; tick < 25; tick += 1) {
      if (kv.backupGetsStarted.length > 1) break;
      await Promise.resolve();
    }

    expect(kv.backupGetsStarted.length).toBeGreaterThan(1);

    d1.resolve({
      links: [],
      categories: [],
      meta: { updatedAt: 2, deviceId: 'd1', version: 2 },
    });
    d0.resolve(null);
    d2.resolve(null);

    const response = await responsePromise;
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.fallback).toBe(true);
    expect(json.role).toBe('user');
    expect(json.data.meta.version).toBe(2);
  });
});
