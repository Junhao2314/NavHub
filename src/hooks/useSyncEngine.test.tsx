import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useEffect } from 'react';
import { buildSyncData, useSyncEngine } from './useSyncEngine';

describe('buildSyncData', () => {
  it('includes privacyConfig in the returned sync payload', () => {
    const links = [{ id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 }];
    const categories = [{ id: 'c', name: 'C', icon: 'Star' }];
    const privacyConfig = { groupEnabled: true, passwordEnabled: false, autoUnlockEnabled: true, useSeparatePassword: true };

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
      { entries: [], updatedAt: 1 }
    );

    expect(data.privacyConfig).toEqual(privacyConfig);
    expect(data.themeMode).toBe('light');
  });
});

describe('useSyncEngine pushToCloud', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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
  });

  const renderEngine = async () => {
    let api: ReturnType<typeof useSyncEngine> | null = null;

    function Harness() {
      const engine = useSyncEngine();
      useEffect(() => {
        api = engine;
      }, [engine]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    if (!api) {
      throw new Error('useSyncEngine not initialized');
    }

    return api;
  };

  it('sends expectedVersion=0 when local meta is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } }
      })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    await act(async () => {
      await api.pushToCloud({ links: [], categories: [] });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.expectedVersion).toBe(0);
  });

  it('enables keepalive for small payload when requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } }
      })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    await act(async () => {
      await api.pushToCloud({ links: [], categories: [] }, false, 'auto', { keepalive: true });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init as any).keepalive).toBe(true);
  });

  it('disables keepalive when request body exceeds limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } }
      })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    const largeTitle = 'a'.repeat(70 * 1024);
    const links = [{ id: '1', title: largeTitle, url: 'https://example.com', categoryId: 'c', createdAt: 1 }];
    const categories = [{ id: 'c', name: 'C', icon: 'Star' }];

    await act(async () => {
      await api.pushToCloud({ links, categories }, false, 'auto', { keepalive: true });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init as any).keepalive).toBe(false);
  });

  it('returns false when api returns success=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false, error: 'nope' })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await api.pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
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
          meta: { updatedAt: 123, deviceId: 'device-1', version: 1 }
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await api.pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
  });

  it('returns false when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await api.pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
  });

  it('returns false (does not throw) when localStorage.setItem throws', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const api = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await api.pushToCloud({ links: [], categories: [] });
    });

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('flushPendingSync returns false when nothing pending', async () => {
    const api = await renderEngine();

    let ok = true;
    await act(async () => {
      ok = await api.flushPendingSync();
    });

    expect(ok).toBe(false);
  });

  it('flushPendingSync returns pushToCloud result when pending data exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } }
      })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    act(() => {
      api.schedulePush({ links: [], categories: [] });
    });

    let ok = false;
    await act(async () => {
      ok = await api.flushPendingSync({ keepalive: true });
    });

    expect(ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.skipHistory).toBe(true);
    expect((init as any).keepalive).toBe(true);
  });

  it('flushPendingSync returns false when pending push fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: false, error: 'nope' })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const api = await renderEngine();

    act(() => {
      api.schedulePush({ links: [], categories: [] });
    });

    let ok = true;
    await act(async () => {
      ok = await api.flushPendingSync();
    });

    expect(ok).toBe(false);
  });
});
