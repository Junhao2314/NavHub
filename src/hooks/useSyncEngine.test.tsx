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

  it('sends expectedVersion=0 when local meta is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { meta: { updatedAt: 123, deviceId: 'device-1', version: 1 } }
      })
    });
    vi.stubGlobal('fetch', fetchMock as any);

    let api: ReturnType<typeof useSyncEngine> | null = null;

    function Harness({ onReady }: { onReady: (value: ReturnType<typeof useSyncEngine>) => void }) {
      const engine = useSyncEngine();
      useEffect(() => {
        onReady(engine);
      }, [onReady]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness onReady={(value) => { api = value; }} />);
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.pushToCloud({ links: [], categories: [] });
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init as any).body);
    expect(parsedBody.expectedVersion).toBe(0);
  });
});
