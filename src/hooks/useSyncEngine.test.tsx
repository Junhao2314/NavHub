import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_API_ENDPOINT, SYNC_DEBOUNCE_MS, SYNC_META_KEY } from '../utils/constants';
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

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: remoteData,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let data: any = null;
    await act(async () => {
      data = await get().pullFromCloud();
    });

    expect(data).toEqual(remoteData);
    expect(get().syncStatus).toBe('synced');
    expect(get().lastSyncTime).toBe(456);

    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null');
    expect(stored).toEqual(remoteData.meta);
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

    let data: any = { touched: true };
    await act(async () => {
      data = await get().pullFromCloud();
    });

    expect(data).toBeNull();
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

    let data: any = { touched: true };
    await act(async () => {
      data = await get().pullFromCloud();
    });

    expect(data).toBeNull();
    expect(get().syncStatus).toBe('error');
    expect(onError).toHaveBeenCalledWith('nope');
  });

  it('resolveConflict(remote) clears conflict and calls onSyncComplete', async () => {
    const remoteData = {
      links: [],
      categories: [],
      meta: { updatedAt: 777, deviceId: 'device-remote', version: 2 },
    };

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
    expect(onSyncComplete).toHaveBeenCalledWith(remoteData);

    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null');
    expect(stored).toEqual(remoteData.meta);
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

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, data: remoteData }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const { get } = await renderEngine();

    let data: any = null;
    await act(async () => {
      data = await get().restoreBackup('backup-1');
    });

    expect(data).toEqual(remoteData);
    expect(get().syncStatus).toBe('synced');
    expect(get().lastSyncTime).toBe(456);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${SYNC_API_ENDPOINT}?action=restore`);
    expect((init as any).method).toBe('POST');
    const request = JSON.parse((init as any).body);
    expect(request.backupKey).toBe('backup-1');
    expect(request.deviceId).toEqual(expect.any(String));

    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null');
    expect(stored).toEqual(remoteData.meta);
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
});
