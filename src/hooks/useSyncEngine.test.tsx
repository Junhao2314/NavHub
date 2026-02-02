import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NAVHUB_SYNC_DATA_SCHEMA_VERSION,
  normalizeNavHubSyncData,
} from '../../shared/syncApi/navHubSyncData';
import { SYNC_API_ENDPOINT, SYNC_DEBOUNCE_MS, SYNC_META_KEY } from '../utils/constants';

// Mock react-i18next to return translation keys as values for testing
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      // Return the actual translated strings for error messages
      const translations: Record<string, string> = {
        'errors.networkError': '网络错误',
        'errors.networkErrorRetry': '网络错误，请检查网络连接后重试',
        'errors.pullFailed': '拉取失败',
        'errors.pushFailed': '推送失败',
        'errors.backupFailed': '备份失败',
        'errors.restoreFailed': '恢复失败',
        'errors.deleteFailed': '删除失败',
        'errors.invalidDataFormat': '云端数据格式异常',
        'errors.serverDataFormatError': '云端返回的数据格式异常',
        'errors.restoreDataFormatError': '恢复失败（数据格式异常）',
        'errors.storageUnavailable':
          '浏览器存储不可用（可能处于隐私模式或禁用了站点存储），无法同步',
      };
      return translations[key] || key;
    },
    i18n: {
      language: 'zh-CN',
      changeLanguage: vi.fn(),
    },
  }),
}));

import { buildSyncData, useSyncEngine } from './useSyncEngine';

describe('buildSyncData', () => {
  it('includes privacyConfig in the returned sync payload', () => {
    const links = [
      { id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 },
    ];
    const categories = [{ id: 'c', name: 'C', icon: 'Star' }];
    const privacyConfig = {
      groupEnabled: true,
      passwordEnabled: false,
      autoUnlockEnabled: true,
      useSeparatePassword: true,
    };

    const data = buildSyncData(
      links,
      categories,
      undefined,
      undefined,
      undefined,
      undefined,
      privacyConfig,
      'light',
      'encrypted',
      { entries: [], updatedAt: 1 },
    );

    expect(data.privacyConfig).toEqual(privacyConfig);
    expect(data.themeMode).toBe('light');
    expect(data.schemaVersion).toBe(NAVHUB_SYNC_DATA_SCHEMA_VERSION);
  });
});

describe('useSyncEngine', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const renderEngine = async (options?: Parameters<typeof useSyncEngine>[0]) => {
    let api: ReturnType<typeof useSyncEngine> | null = null;

    function Harness() {
      const engine = useSyncEngine(options);
      useEffect(() => {
        api = engine;
      }, [engine]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    return {
      get: () => {
        if (!api) throw new Error('useSyncEngine not initialized');
        return api;
      },
    };
  };

  it('sends expectedVersion=0 when local meta is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    await act(async () => {
      await get().pushToCloud({ links: [], categories: [] });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.expectedVersion).toBe(0);
    expect(parsedBody.data.schemaVersion).toBe(NAVHUB_SYNC_DATA_SCHEMA_VERSION);
  });

  it('sanitizes aiConfig.apiKey before sending to cloud', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    await act(async () => {
      await get().pushToCloud({
        links: [],
        categories: [],
        aiConfig: {
          provider: 'openai',
          apiKey: 'secret',
          baseUrl: '',
          model: 'gpt-test',
        },
      });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.data.aiConfig.apiKey).toBe('');
    expect(parsedBody.data.aiConfig.provider).toBe('openai');
  });

  it('enables keepalive for small payload when requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    await act(async () => {
      await get().pushToCloud({ links: [], categories: [] }, false, 'auto', { keepalive: true });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init as any).keepalive).toBe(true);
  });

  it('disables keepalive when request body exceeds limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    const largeTitle = 'a'.repeat(70 * 1024);
    const links = [
      { id: '1', title: largeTitle, url: 'https://example.com', categoryId: 'c', createdAt: 1 },
    ];
    const categories = [{ id: 'c', name: 'C', icon: 'Star' }];

    await act(async () => {
      await get().pushToCloud({ links, categories }, false, 'auto', { keepalive: true });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init as any).keepalive).toBe(false);
  });

  it('returns false when api returns success=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false, error: 'nope' }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
  });

  it('logs when onError callback throws (does not swallow silently)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false, error: 'nope' }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { get } = await renderEngine({
      onError: () => {
        throw new Error('boom');
      },
    });

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useSyncEngine] onError callback threw',
      expect.any(Error),
    );
  });

  it('returns false when api indicates conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: false,
        error: 'conflict',
        conflict: true,
        data: {
          links: [],
          categories: [],
          meta: { updatedAt: 123, deviceId: 'device-1', version: 1 },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
  });

  it('logs when onConflict callback throws (does not swallow silently)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: false,
        error: 'conflict',
        conflict: true,
        data: {
          links: [],
          categories: [],
          meta: { updatedAt: 123, deviceId: 'device-1', version: 1 },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { get } = await renderEngine({
      onConflict: () => {
        throw new Error('boom');
      },
    });

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useSyncEngine] onConflict callback threw',
      expect.any(Error),
    );
  });

  it('returns false when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
  });

  it('returns false (does not throw) when localStorage.setItem throws', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const onError = vi.fn();
    const { get } = await renderEngine({ onError });

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(get().lastErrorKind).toBe('storage');
    expect(get().lastError).toBe('浏览器存储不可用（可能处于隐私模式或禁用了站点存储），无法同步');
    expect(onError).toHaveBeenCalledWith(
      '浏览器存储不可用（可能处于隐私模式或禁用了站点存储），无法同步',
    );
    setItemSpy.mockRestore();
  });

  it('reports network error with a user-friendly message when fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock as any);

    const onError = vi.fn();
    const { get } = await renderEngine({ onError });

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
    expect(get().lastErrorKind).toBe('network');
    expect(get().lastError).toBe('网络错误，请检查网络连接后重试');
    expect(onError).toHaveBeenCalledWith('网络错误，请检查网络连接后重试');
  });

  it('flushPendingSync returns false when nothing pending', async () => {
    const { get } = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await get().flushPendingSync();
    });

    expect(ok).toBe(false);
  });

  it('flushPendingSync returns pushToCloud result when pending data exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    act(() => {
      get().schedulePush({ links: [], categories: [] });
    });

    let ok = false;
    await act(async () => {
      ok = await get().flushPendingSync({ keepalive: true });
    });

    expect(ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.skipHistory).toBe(true);
    expect((init as any).keepalive).toBe(true);
  });

  it('flushPendingSync returns false when pending push fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false, error: 'nope' }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    act(() => {
      get().schedulePush({ links: [], categories: [] });
    });

    let ok = true;
    await act(async () => {
      ok = await get().flushPendingSync();
    });

    expect(ok).toBe(false);
  });

  it('schedulePush debounces and only pushes the latest payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    act(() => {
      get().schedulePush({
        links: [{ id: '1', title: 'A', url: 'https://a.com', categoryId: 'c', createdAt: 1 }],
        categories: [{ id: 'c', name: 'C', icon: 'Star' }],
      });
      get().schedulePush({
        links: [{ id: '2', title: 'B', url: 'https://b.com', categoryId: 'c', createdAt: 2 }],
        categories: [{ id: 'c', name: 'C', icon: 'Star' }],
      });
    });

    expect(get().syncStatus).toBe('pending');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.skipHistory).toBe(true);
    expect(parsedBody.data.links[0].id).toBe('2');
  });

  it('cancelPendingSync prevents scheduled debounce push', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    act(() => {
      get().schedulePush({ links: [], categories: [] });
    });

    act(() => {
      get().cancelPendingSync();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(get().syncStatus).toBe('idle');
  });

  it('pullFromCloud persists meta and updates state', async () => {
    const remoteData = {
      links: [],
      categories: [],
      meta: { updatedAt: 456, deviceId: 'device-remote', version: 9 },
    };
    const normalizedRemote = normalizeNavHubSyncData(remoteData)!;

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: remoteData,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let result: any = null;
    await act(async () => {
      result = await get().pullFromCloud();
    });

    expect(result.data).toEqual(normalizedRemote);
    expect(get().syncStatus).toBe('synced');
    expect(get().lastSyncTime).toBe(456);

    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null');
    expect(stored).toEqual(normalizedRemote.meta);
  });

  it('pullFromCloud stays idle when cloud has no data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let result: any = { touched: true };
    await act(async () => {
      result = await get().pullFromCloud();
    });

    expect(result.data).toBeNull();
    expect(get().syncStatus).toBe('idle');
    expect(get().lastSyncTime).toBeNull();
  });

  it('pullFromCloud reports error when api returns success=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: false,
        error: 'nope',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const onError = vi.fn();
    const { get } = await renderEngine({ onError });

    let result: any = { touched: true };
    await act(async () => {
      result = await get().pullFromCloud();
    });

    expect(result.data).toBeNull();
    expect(get().syncStatus).toBe('error');
    expect(onError).toHaveBeenCalledWith('nope');
  });

  it('pullFromCloud returns emptyReason when cloud is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: null,
        emptyReason: 'virgin',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let result: any = null;
    await act(async () => {
      result = await get().pullFromCloud();
    });

    expect(result.data).toBeNull();
    expect(result.emptyReason).toBe('virgin');
  });

  it('pullFromCloud returns emptyReason=lost when data was lost', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: null,
        emptyReason: 'lost',
        message: '云端数据丢失，历史记录恢复失败',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let result: any = null;
    await act(async () => {
      result = await get().pullFromCloud();
    });

    expect(result.data).toBeNull();
    expect(result.emptyReason).toBe('lost');
  });

  it('resolveConflict(remote) clears conflict and calls onSyncComplete', async () => {
    const remoteData = {
      links: [],
      categories: [],
      meta: { updatedAt: 777, deviceId: 'device-remote', version: 2 },
    };
    const normalizedRemote = normalizeNavHubSyncData(remoteData)!;

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: false,
        error: 'conflict',
        conflict: true,
        data: remoteData,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const onConflict = vi.fn();
    const onSyncComplete = vi.fn();
    const { get } = await renderEngine({ onConflict, onSyncComplete });

    let ok = true;
    await act(async () => {
      ok = await get().pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
    expect(get().syncStatus).toBe('conflict');
    expect(get().currentConflict).not.toBeNull();
    expect(onConflict).toHaveBeenCalledTimes(1);

    act(() => {
      get().resolveConflict('remote');
    });

    expect(get().currentConflict).toBeNull();
    expect(get().syncStatus).toBe('synced');
    expect(get().lastSyncTime).toBe(777);
    expect(onSyncComplete).toHaveBeenCalledWith(normalizedRemote);

    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null');
    expect(stored).toEqual(normalizedRemote.meta);
  });

  it('createBackup posts sanitized payload and sets status to synced', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(111);
    localStorage.setItem(
      SYNC_META_KEY,
      JSON.stringify({ updatedAt: 1, deviceId: 'local', version: 7 }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let ok = false;
    await act(async () => {
      ok = await get().createBackup({
        links: [],
        categories: [],
        aiConfig: { provider: 'openai', apiKey: 'secret', baseUrl: '', model: 'gpt-test' } as any,
      } as any);
    });

    expect(ok).toBe(true);
    expect(get().syncStatus).toBe('synced');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${SYNC_API_ENDPOINT}?action=backup`);
    expect((init as any).method).toBe('POST');
    const body = JSON.parse((init as any).body);
    expect(body.data.aiConfig.apiKey).toBe('');
    expect(body.data.meta.version).toBe(7);
    expect(body.data.meta.updatedAt).toBe(111);
  });

  it('restoreBackup persists returned meta and updates lastSyncTime', async () => {
    const remoteData = {
      links: [],
      categories: [],
      meta: { updatedAt: 456, deviceId: 'device-remote', version: 9 },
    };
    const normalizedRemote = normalizeNavHubSyncData(remoteData)!;

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, data: remoteData }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let data: any = null;
    await act(async () => {
      data = await get().restoreBackup('backup-1');
    });

    expect(data).toEqual(normalizedRemote);
    expect(get().syncStatus).toBe('synced');
    expect(get().lastSyncTime).toBe(456);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${SYNC_API_ENDPOINT}?action=restore`);
    expect((init as any).method).toBe('POST');
    const request = JSON.parse((init as any).body);
    expect(request.backupKey).toBe('backup-1');
    expect(request.deviceId).toEqual(expect.any(String));

    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null');
    expect(stored).toEqual(normalizedRemote.meta);
  });

  it('deleteBackup returns false and calls onError when deletion fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false, error: 'nope' }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const onError = vi.fn();
    const { get } = await renderEngine({ onError });

    let ok = true;
    await act(async () => {
      ok = await get().deleteBackup('backup-1');
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith('nope');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${SYNC_API_ENDPOINT}?action=backup`);
    expect((init as any).method).toBe('DELETE');
    const request = JSON.parse((init as any).body);
    expect(request.backupKey).toBe('backup-1');
  });

  it('checkAuth returns default user state when auth check fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let state: any = null;
    await act(async () => {
      state = await get().checkAuth();
    });

    expect(state).toEqual({ protected: true, role: 'user', canWrite: false });
  });

  it('checkAuth returns role and permissions when auth check succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        protected: false,
        role: 'admin',
        canWrite: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let state: any = null;
    await act(async () => {
      state = await get().checkAuth();
    });

    expect(state).toEqual({ protected: false, role: 'admin', canWrite: true });
  });

  // ==================== 冲突场景测试 ====================

  describe('conflict scenarios', () => {
    it('resolveConflict(local) force pushes local data and clears conflict', async () => {
      const localPayload = {
        links: [
          {
            id: 'local-1',
            title: 'Local',
            url: 'https://local.com',
            categoryId: 'c',
            createdAt: 1,
          },
        ],
        categories: [{ id: 'c', name: 'C', icon: 'Star' }],
      };
      const remoteData = {
        links: [
          {
            id: 'remote-1',
            title: 'Remote',
            url: 'https://remote.com',
            categoryId: 'c',
            createdAt: 2,
          },
        ],
        categories: [{ id: 'c', name: 'C', icon: 'Star' }],
        meta: { updatedAt: 777, deviceId: 'device-remote', version: 5 },
      };

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // 第一次推送返回冲突
          return Promise.resolve({
            json: vi.fn().mockResolvedValue({
              success: false,
              error: 'conflict',
              conflict: true,
              data: remoteData,
            }),
          });
        }
        // 第二次强制推送成功
        return Promise.resolve({
          json: vi.fn().mockResolvedValue({
            success: true,
            data: { meta: { updatedAt: 888, deviceId: 'device-local', version: 6 } },
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const onConflict = vi.fn();
      const onSyncComplete = vi.fn();
      const { get } = await renderEngine({ onConflict, onSyncComplete });

      // 第一次推送触发冲突
      await act(async () => {
        await get().pushToCloud(localPayload);
      });

      expect(get().syncStatus).toBe('conflict');
      expect(get().currentConflict).not.toBeNull();
      expect(get().currentConflict?.localData.links[0].id).toBe('local-1');
      expect(get().currentConflict?.remoteData.links[0].id).toBe('remote-1');

      // 选择本地版本
      await act(async () => {
        get().resolveConflict('local');
      });

      // 等待强制推送完成
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(get().currentConflict).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // 验证第二次请求是强制推送（无 expectedVersion）
      const [, secondInit] = fetchMock.mock.calls[1] ?? [];
      const secondBody = JSON.parse((secondInit as any).body);
      expect(secondBody.expectedVersion).toBeUndefined();
      expect(secondBody.syncKind).toBe('manual');

      // onSyncComplete 不应被调用（选择本地时不回写）
      expect(onSyncComplete).not.toHaveBeenCalled();
    });

    it('currentConflict contains both local and remote data with correct structure', async () => {
      const localPayload = {
        links: [
          {
            id: 'l1',
            title: 'Local Link',
            url: 'https://local.com',
            categoryId: 'cat1',
            createdAt: 100,
          },
        ],
        categories: [{ id: 'cat1', name: 'Local Cat', icon: 'Star' }],
        searchConfig: { mode: 'internal' as const, externalSources: [] },
      };
      const remoteData = {
        links: [
          {
            id: 'r1',
            title: 'Remote Link',
            url: 'https://remote.com',
            categoryId: 'cat2',
            createdAt: 200,
          },
        ],
        categories: [{ id: 'cat2', name: 'Remote Cat', icon: 'Heart' }],
        searchConfig: { mode: 'external' as const, externalSources: [] },
        meta: { updatedAt: 999, deviceId: 'remote-device', version: 10 },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: false,
          error: 'Version conflict',
          conflict: true,
          data: remoteData,
        }),
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const onConflict = vi.fn();
      const { get } = await renderEngine({ onConflict });

      await act(async () => {
        await get().pushToCloud(localPayload);
      });

      const conflict = get().currentConflict;
      expect(conflict).not.toBeNull();

      // 验证本地数据结构
      expect(conflict?.localData.links).toHaveLength(1);
      expect(conflict?.localData.links[0].title).toBe('Local Link');
      expect(conflict?.localData.categories[0].name).toBe('Local Cat');
      expect(conflict?.localData.searchConfig?.mode).toBe('internal');
      expect(conflict?.localData.meta).toBeDefined();
      expect(conflict?.localData.meta.deviceId).toBeDefined();

      // 验证远程数据结构
      expect(conflict?.remoteData.links).toHaveLength(1);
      expect(conflict?.remoteData.links[0].title).toBe('Remote Link');
      expect(conflict?.remoteData.categories[0].name).toBe('Remote Cat');
      expect(conflict?.remoteData.searchConfig?.mode).toBe('external');
      expect(conflict?.remoteData.meta.version).toBe(10);

      // 验证 onConflict 回调收到相同数据
      expect(onConflict).toHaveBeenCalledWith(conflict);
    });

    it('resolveConflict does nothing when no conflict exists', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock as any);

      const onSyncComplete = vi.fn();
      const { get } = await renderEngine({ onSyncComplete });

      // 没有冲突时调用 resolveConflict
      act(() => {
        get().resolveConflict('local');
        get().resolveConflict('remote');
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onSyncComplete).not.toHaveBeenCalled();
      expect(get().currentConflict).toBeNull();
    });

    it('concurrent pushes are serialized to avoid version conflicts', async () => {
      const callOrder: number[] = [];
      let callCount = 0;

      const fetchMock = vi.fn().mockImplementation(() => {
        const currentCall = ++callCount;
        callOrder.push(currentCall);

        return new Promise((resolve) => {
          // 模拟网络延迟，第一个请求慢，第二个快
          const delay = currentCall === 1 ? 100 : 10;
          setTimeout(() => {
            resolve({
              json: vi.fn().mockResolvedValue({
                success: true,
                data: { meta: { updatedAt: Date.now(), deviceId: 'device', version: currentCall } },
              }),
            });
          }, delay);
        });
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const { get } = await renderEngine();

      // 同时发起两个推送
      let result1: boolean | undefined;
      let result2: boolean | undefined;

      await act(async () => {
        const p1 = get().pushToCloud({ links: [], categories: [] });
        const p2 = get().pushToCloud({
          links: [{ id: '1', title: 'A', url: 'https://a.com', categoryId: 'c', createdAt: 1 }],
          categories: [{ id: 'c', name: 'C', icon: 'Star' }],
        });

        await vi.advanceTimersByTimeAsync(200);

        result1 = await p1;
        result2 = await p2;
      });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // 验证请求是串行执行的（第二个请求在第一个完成后才发起）
      // 由于串行化，即使第一个请求慢，也会先完成
      expect(callOrder).toEqual([1, 2]);
    });

    it('push chain continues even if previous push fails', async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            json: vi.fn().mockResolvedValue({ success: false, error: 'first failed' }),
          });
        }
        return Promise.resolve({
          json: vi.fn().mockResolvedValue({
            success: true,
            data: { meta: { updatedAt: 123, deviceId: 'device', version: 1 } },
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const { get } = await renderEngine();

      let result1: boolean | undefined;
      let result2: boolean | undefined;

      await act(async () => {
        const p1 = get().pushToCloud({ links: [], categories: [] });
        const p2 = get().pushToCloud({ links: [], categories: [] });

        result1 = await p1;
        result2 = await p2;
      });

      expect(result1).toBe(false);
      expect(result2).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('version is updated after successful push and used in next push', async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          json: vi.fn().mockResolvedValue({
            success: true,
            data: { meta: { updatedAt: 100 * callCount, deviceId: 'device', version: callCount } },
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const { get } = await renderEngine();

      // 第一次推送
      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] });
      });

      const [, firstInit] = fetchMock.mock.calls[0] ?? [];
      const firstBody = JSON.parse((firstInit as any).body);
      expect(firstBody.expectedVersion).toBe(0); // 初始版本

      // 第二次推送应该使用更新后的版本
      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] });
      });

      const [, secondInit] = fetchMock.mock.calls[1] ?? [];
      const secondBody = JSON.parse((secondInit as any).body);
      expect(secondBody.expectedVersion).toBe(1); // 使用第一次返回的版本
    });

    it('conflict after resolving previous conflict works correctly', async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // 前两次都返回冲突
          return Promise.resolve({
            json: vi.fn().mockResolvedValue({
              success: false,
              error: 'Version conflict',
              conflict: true,
              data: {
                links: [],
                categories: [],
                meta: { updatedAt: 100 * callCount, deviceId: 'remote', version: callCount },
              },
            }),
          });
        }
        // 第三次成功
        return Promise.resolve({
          json: vi.fn().mockResolvedValue({
            success: true,
            data: { meta: { updatedAt: 300, deviceId: 'device', version: 3 } },
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const onConflict = vi.fn();
      const onSyncComplete = vi.fn();
      const { get } = await renderEngine({ onConflict, onSyncComplete });

      // 第一次推送触发冲突
      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] });
      });

      expect(get().syncStatus).toBe('conflict');
      expect(onConflict).toHaveBeenCalledTimes(1);

      // 选择远程版本解决第一次冲突
      act(() => {
        get().resolveConflict('remote');
      });

      expect(get().currentConflict).toBeNull();
      expect(get().syncStatus).toBe('synced');
      expect(onSyncComplete).toHaveBeenCalledTimes(1);

      // 再次推送，又触发冲突
      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] });
      });

      expect(get().syncStatus).toBe('conflict');
      expect(onConflict).toHaveBeenCalledTimes(2);

      // 这次选择本地版本
      await act(async () => {
        get().resolveConflict('local');
        await vi.runAllTimersAsync();
      });

      expect(get().currentConflict).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('logs when onSyncComplete callback throws during conflict resolution', async () => {
      const remoteData = {
        links: [],
        categories: [],
        meta: { updatedAt: 777, deviceId: 'device-remote', version: 2 },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: false,
          error: 'Version conflict',
          conflict: true,
          data: remoteData,
        }),
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { get } = await renderEngine({
        onSyncComplete: () => {
          throw new Error('callback boom');
        },
      });

      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] });
      });

      act(() => {
        get().resolveConflict('remote');
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useSyncEngine] onSyncComplete callback threw',
        expect.any(Error),
      );
      expect(get().currentConflict).toBeNull();
      expect(get().syncStatus).toBe('synced');
    });

    it('conflict detection uses expectedVersion from local meta', async () => {
      // 预设本地 meta
      localStorage.setItem(
        SYNC_META_KEY,
        JSON.stringify({ updatedAt: 500, deviceId: 'local-device', version: 42 }),
      );

      const fetchMock = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { meta: { updatedAt: 600, deviceId: 'device', version: 43 } },
        }),
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const { get } = await renderEngine();

      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] });
      });

      const [, init] = fetchMock.mock.calls[0] ?? [];
      const body = JSON.parse((init as any).body);
      expect(body.expectedVersion).toBe(42);
      expect(body.data.meta.version).toBe(42);
    });

    it('force push skips expectedVersion check', async () => {
      localStorage.setItem(
        SYNC_META_KEY,
        JSON.stringify({ updatedAt: 500, deviceId: 'local-device', version: 42 }),
      );

      const fetchMock = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { meta: { updatedAt: 600, deviceId: 'device', version: 43 } },
        }),
      });
      vi.stubGlobal('fetch', fetchMock as any);

      const { get } = await renderEngine();

      await act(async () => {
        await get().pushToCloud({ links: [], categories: [] }, true); // force=true
      });

      const [, init] = fetchMock.mock.calls[0] ?? [];
      const body = JSON.parse((init as any).body);
      expect(body.expectedVersion).toBeUndefined();
    });
  });
});
